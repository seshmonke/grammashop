import "../env.js";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import * as Sentry from "@sentry/node";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Client } from "pg";
import { initSentry } from "../sentry.js";
import { s3Bucket, s3Client } from "../s3/client.js";

const PREFIX = "backups/";
const RESTORE_DB = "grammashop_restore_check";

function withDatabase(name: string): string {
  const url = new URL(process.env["DATABASE_URL"] ?? "");
  url.pathname = `/${name}`;
  return url.toString();
}

async function latestBackupKey(): Promise<string> {
  const listed = await s3Client.send(
    new ListObjectsV2Command({ Bucket: s3Bucket, Prefix: PREFIX }),
  );
  const keys = (listed.Contents ?? [])
    .map((object) => object.Key)
    .filter((key): key is string => !!key)
    .sort();
  const latest = keys.at(-1);
  if (!latest) {
    throw new Error("в S3 нет ни одного бэкапа");
  }
  return latest;
}

async function download(key: string, filePath: string): Promise<void> {
  const got = await s3Client.send(
    new GetObjectCommand({ Bucket: s3Bucket, Key: key }),
  );
  if (!got.Body) {
    throw new Error(`пустое тело объекта ${key}`);
  }
  await pipeline(got.Body as NodeJS.ReadableStream, createWriteStream(filePath));
}

// Пароль-фраза — в stdin процесса, не аргументом (см. backup.ts).
async function decryptFile(inputPath: string, outputPath: string): Promise<void> {
  const passphrase = process.env["BACKUP_GPG_PASSPHRASE"];
  if (!passphrase) {
    throw new Error("BACKUP_GPG_PASSPHRASE не задан — см. .env.example");
  }

  const gpg = spawn("gpg", [
    "--batch",
    "--yes",
    "--passphrase-fd",
    "0",
    "--decrypt",
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

// Дампы до раскатки шифрования (Спринт 23) остаются в S3 незашифрованными
// до вытеснения ретеншном — читаем их как раньше, без расшифровки.
async function downloadDump(key: string, gzPath: string): Promise<void> {
  if (key.endsWith(".gpg")) {
    const encryptedPath = `${gzPath}.gpg`;
    await download(key, encryptedPath);
    await decryptFile(encryptedPath, gzPath);
  } else {
    await download(key, gzPath);
  }
}

async function decompress(gzPath: string, filePath: string): Promise<void> {
  await pipeline(
    createReadStream(gzPath),
    createGunzip(),
    createWriteStream(filePath),
  );
}

// Пересоздаём restore-check БД с нуля на каждый прогон — прошлый прогон
// не должен влиять на проверку (устаревшая схема, недокаченный дамп).
async function recreateDatabase(): Promise<void> {
  const admin = new Client({ connectionString: withDatabase("postgres") });
  await admin.connect();
  await admin.query(
    "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1",
    [RESTORE_DB],
  );
  await admin.query(`DROP DATABASE IF EXISTS ${RESTORE_DB}`);
  await admin.query(`CREATE DATABASE ${RESTORE_DB}`);
  await admin.end();
}

async function restoreDump(filePath: string): Promise<void> {
  const psql = spawn("psql", [
    withDatabase(RESTORE_DB),
    "-v",
    "ON_ERROR_STOP=1",
    "-f",
    filePath,
  ]);
  let stderr = "";
  psql.stderr.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  const code = await new Promise<number>((resolve) => {
    psql.on("close", (c) => resolve(c ?? 1));
  });
  if (code !== 0) {
    throw new Error(`psql завершился с кодом ${code}: ${stderr}`);
  }
}

async function verifyRestore(): Promise<void> {
  const client = new Client({ connectionString: withDatabase(RESTORE_DB) });
  await client.connect();
  const { rows } = await client.query<{ count: number }>(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'",
  );
  await client.end();
  if ((rows[0]?.count ?? 0) === 0) {
    throw new Error("восстановленная БД не содержит таблиц в схеме public");
  }
}

initSentry();

const workDir = await mkdtemp(path.join(tmpdir(), "grammashop-restore-check-"));
const gzPath = path.join(workDir, "dump.sql.gz");
const filePath = path.join(workDir, "dump.sql");

try {
  const key = await latestBackupKey();
  await downloadDump(key, gzPath);
  await decompress(gzPath, filePath);
  await recreateDatabase();
  await restoreDump(filePath);
  await verifyRestore();
  console.log("restore-check: ok", key);
} catch (error) {
  console.error("restore-check: ПРОВАЛ", error);
  Sentry.captureException(error);
  await Sentry.flush(2000);
  process.exitCode = 1;
} finally {
  await rm(workDir, { recursive: true, force: true });
}
