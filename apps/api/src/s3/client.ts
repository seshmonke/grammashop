import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Фолбэк региона: раньше S3Client конструировался только в отдельных
// скриптах (verify/backup/restore-check), которые запускались лишь при
// реально настроенном S3_REGION. С product_images он попал в путь
// импорта основного сервера (см. images/product-image-lookup.ts) — без
// дефолта сервер падал на старте в любом окружении с не до конца
// заполненным `.env` (пустой S3_REGION), даже когда запрос вообще не
// трогает S3. Значение — фактический регион бакета (см.
// STACK.md#хранилище-файлов).
const s3Region = process.env["S3_REGION"] || "ru-central1";

export const s3Client = new S3Client({
  endpoint: process.env["S3_ENDPOINT"],
  region: s3Region,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env["S3_ACCESS_KEY_ID"] ?? "",
    secretAccessKey: process.env["S3_SECRET_ACCESS_KEY"] ?? "",
  },
});

export const s3Bucket = process.env["S3_BUCKET"] ?? "";

// Бакет приватный (см. STACK.md#хранилище-файлов) — фото товара отдаются
// фронту presigned GET-ссылкой, не голым URL объекта. TTL по умолчанию —
// час, тот же порядок, что и у обычного времени жизни JWT-сессии.
const PRESIGNED_GET_TTL_SECONDS = 3600;

export function getPresignedImageUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: s3Bucket, Key: key }),
    { expiresIn: PRESIGNED_GET_TTL_SECONDS },
  );
}
