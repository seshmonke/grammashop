import "../env.js";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { s3Bucket, s3Client } from "./client.js";

const key = `verify/${Date.now()}.txt`;
const body = "grammashop s3 verify";

await s3Client.send(
  new PutObjectCommand({ Bucket: s3Bucket, Key: key, Body: body }),
);

const got = await s3Client.send(
  new GetObjectCommand({ Bucket: s3Bucket, Key: key }),
);
const readBack = await got.Body?.transformToString();

await s3Client.send(
  new DeleteObjectCommand({ Bucket: s3Bucket, Key: key }),
);

if (readBack !== body) {
  throw new Error(`readback mismatch: got ${readBack}`);
}

console.log("s3 verify ok:", key);
