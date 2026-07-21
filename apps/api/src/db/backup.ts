import "../env.js";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { s3Bucket, s3Client } from "../s3/client.js";
import { selectKeysToDelete } from "./backup-retention.js";

const PREFIX = "backups/";

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

async function dumpToFile(filePath: string): Promise<void> {
  const dump = spawn("pg_dump", [process.env["DATABASE_URL"] ?? ""]);
  let stderr = "";
  dump.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const exitCode = new Promise<number>((resolve) => {
    dump.on("close", (code) => resolve(code ?? 1));
  });

  await pipeline(dump.stdout, createGzip(), createWriteStream(filePath));

  const code = await exitCode;
  if (code !== 0) {
    throw new Error(`pg_dump завершился с кодом ${code}: ${stderr}`);
  }
}

// Шифрование симметричным GPG (не SSE, не асимметричное — см.
// docs/tasks/23-pdn-and-cheap-debt.md): пароль-фраза идёт в stdin
// процесса, не аргументом командной строки — иначе видна в `ps`.
async function encryptFile(inputPath: string, outputPath: string): Promise<void> {
  const passphrase = process.env["BACKUP_GPG_PASSPHRASE"];
  if (!passphrase) {
    throw new Error("BACKUP_GPG_PASSPHRASE не задан — см. .env.example");
  }

  const gpg = spawn("gpg", [
    "--batch",
    "--yes",
    "--passphrase-fd",
    "0",
    "--symmetric",
    "--cipher-algo",
    "AES256",
    "-o",
    outputPath,
    inputPath,
  ]);
  let stderr = "";
  gpg.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  gpg.stdin.write(passphrase);
  gpg.stdin.end();

  const code = await new Promise<number>((resolve) => {
    gpg.on("close", (c) => resolve(c ?? 1));
  });
  if (code !== 0) {
    throw new Error(`gpg завершился с кодом ${code}: ${stderr}`);
  }
}

async function upload(filePath: string, key: string): Promise<void> {
  const { size } = await stat(filePath);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: createReadStream(filePath),
      ContentLength: size,
    }),
  );
}

async function applyRetention(): Promise<void> {
  const listed = await s3Client.send(
    new ListObjectsV2Command({ Bucket: s3Bucket, Prefix: PREFIX }),
  );
  const keys = (listed.Contents ?? [])
    .map((object) => object.Key)
    .filter((key): key is string => !!key);

  for (const key of selectKeysToDelete(keys)) {
    await s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }));
    console.log("backup: удалён по ретеншну:", key);
  }
}

const workDir = await mkdtemp(path.join(tmpdir(), "grammashop-backup-"));
const filePath = path.join(workDir, "dump.sql.gz");
const encryptedPath = path.join(workDir, "dump.sql.gz.gpg");
const key = `${PREFIX}grammashop-${todayStamp()}.sql.gz.gpg`;

try {
  await dumpToFile(filePath);
  await encryptFile(filePath, encryptedPath);
  await upload(encryptedPath, key);
  console.log("backup: загружен", key);
  await applyRetention();
} finally {
  await rm(workDir, { recursive: true, force: true });
}
