import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { productImages } from "../db/schema.js";
import {
  findProductImageRow,
  presignProductImage,
  type ProductImageUrls,
} from "../images/product-image-lookup.js";
import { ImageTooLargeError, processProductImage, UnsupportedImageTypeError } from "../images/pipeline.js";
import { originalImageKey, thumbnailKeyFor } from "../images/storage-keys.js";
import { s3Bucket, s3Client } from "../s3/client.js";
import { findOwnedProduct } from "./products.service.js";

// Загрузка/удаление фото карточки (см.
// STACK.md#пайплайн-фото-товара-спринт-16). Один слот на карточку —
// повторная загрузка заменяет прежний файл (старые объекты в S3
// удаляются), не копит строки в product_images.

async function uploadPair(
  key: string,
  original: Buffer,
  thumbnail: Buffer,
): Promise<void> {
  await Promise.all([
    s3Client.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: original,
        ContentType: "image/webp",
      }),
    ),
    s3Client.send(
      new PutObjectCommand({
        Bucket: s3Bucket,
        Key: thumbnailKeyFor(key),
        Body: thumbnail,
        ContentType: "image/webp",
      }),
    ),
  ]);
}

async function deletePair(key: string): Promise<void> {
  await Promise.all([
    s3Client.send(new DeleteObjectCommand({ Bucket: s3Bucket, Key: key })),
    s3Client.send(
      new DeleteObjectCommand({ Bucket: s3Bucket, Key: thumbnailKeyFor(key) }),
    ),
  ]);
}

export async function setProductImage(
  sellerId: number,
  productId: number,
  file: { buffer: Buffer; mimetype: string },
): Promise<
  | { ok: true; image: ProductImageUrls }
  | { ok: false; reason: "not_found" | "invalid_image" }
> {
  const owned = await findOwnedProduct(sellerId, productId);
  if (!owned) return { ok: false, reason: "not_found" };

  let processed;
  try {
    processed = await processProductImage(file.buffer, file.mimetype);
  } catch (err) {
    if (
      err instanceof UnsupportedImageTypeError ||
      err instanceof ImageTooLargeError
    ) {
      return { ok: false, reason: "invalid_image" };
    }
    throw err;
  }

  const existing = await findProductImageRow(productId);
  const key = originalImageKey(sellerId, productId);
  await uploadPair(key, processed.original, processed.thumbnail);

  if (existing) {
    await db
      .update(productImages)
      .set({ s3Key: key })
      .where(eq(productImages.id, existing.id));
    await deletePair(existing.s3Key);
  } else {
    await db.insert(productImages).values({ productId, s3Key: key });
  }

  return { ok: true, image: await presignProductImage(key) };
}

export async function deleteProductImage(
  sellerId: number,
  productId: number,
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const owned = await findOwnedProduct(sellerId, productId);
  if (!owned) return { ok: false, reason: "not_found" };

  const existing = await findProductImageRow(productId);
  if (!existing) return { ok: false, reason: "not_found" };

  await db.delete(productImages).where(eq(productImages.id, existing.id));
  await deletePair(existing.s3Key);

  return { ok: true };
}
