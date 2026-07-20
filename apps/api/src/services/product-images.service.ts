import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { productImages } from "../db/schema.js";
import {
  findProductImageRow,
  listProductImageRows,
  loadImagesForProduct,
  type ProductImageWithUrls,
} from "../images/product-image-lookup.js";
import { ImageTooLargeError, processProductImage, UnsupportedImageTypeError } from "../images/pipeline.js";
import { originalImageKey, thumbnailKeyFor } from "../images/storage-keys.js";
import { s3Bucket, s3Client } from "../s3/client.js";
import { findOwnedProduct } from "./products.service.js";

// Галерея фото карточки (см.
// STACK.md#пайплайн-фото-товара-спринт-16-расширено-спринтом-20). До 5
// строк на карточку, лимит — в сервис-слое, не в БД-констрейнте (тот же
// принцип, что у лимитов карточек/вариантов, Спринт 11).
const MAX_IMAGES_PER_PRODUCT = 5;

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

export async function addProductImage(
  sellerId: number,
  productId: number,
  file: { buffer: Buffer; mimetype: string },
): Promise<
  | { ok: true; images: ProductImageWithUrls[] }
  | { ok: false; reason: "not_found" | "invalid_image" | "image_limit" }
> {
  const owned = await findOwnedProduct(sellerId, productId);
  if (!owned) return { ok: false, reason: "not_found" };

  const existingRows = await listProductImageRows(productId);
  if (existingRows.length >= MAX_IMAGES_PER_PRODUCT) {
    return { ok: false, reason: "image_limit" };
  }

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

  const key = originalImageKey(sellerId, productId);
  await uploadPair(key, processed.original, processed.thumbnail);

  const nextSortPosition = existingRows.length
    ? Math.max(...existingRows.map((r) => r.sortPosition)) + 1
    : 0;
  await db
    .insert(productImages)
    .values({ productId, s3Key: key, sortPosition: nextSortPosition });

  return { ok: true, images: await loadImagesForProduct(productId) };
}

export async function deleteProductImage(
  sellerId: number,
  productId: number,
  imageId: number,
): Promise<{ ok: true } | { ok: false; reason: "not_found" }> {
  const owned = await findOwnedProduct(sellerId, productId);
  if (!owned) return { ok: false, reason: "not_found" };

  const existing = await findProductImageRow(productId, imageId);
  if (!existing) return { ok: false, reason: "not_found" };

  await db.delete(productImages).where(eq(productImages.id, existing.id));
  await deletePair(existing.s3Key);

  return { ok: true };
}

// Переупорядочивание кнопками ←/→ (не drag-and-drop, см.
// STACK.md#пайплайн-фото-товара-спринт-16-расширено-спринтом-20) — меняет
// местами sort_position с соседним фото. На краю списка — no-op, отдаём
// текущий порядок без ошибки (кнопка там задизейблена на фронте, но и
// прямой вызов API не должен падать).
export async function moveProductImage(
  sellerId: number,
  productId: number,
  imageId: number,
  direction: "left" | "right",
): Promise<
  { ok: true; images: ProductImageWithUrls[] } | { ok: false; reason: "not_found" }
> {
  const owned = await findOwnedProduct(sellerId, productId);
  if (!owned) return { ok: false, reason: "not_found" };

  const rows = await listProductImageRows(productId);
  const index = rows.findIndex((r) => r.id === imageId);
  if (index === -1) return { ok: false, reason: "not_found" };

  const neighborIndex = direction === "left" ? index - 1 : index + 1;
  if (neighborIndex < 0 || neighborIndex >= rows.length) {
    return { ok: true, images: await loadImagesForProduct(productId) };
  }

  const current = rows[index]!;
  const neighbor = rows[neighborIndex]!;

  await db.transaction(async (tx) => {
    await tx
      .update(productImages)
      .set({ sortPosition: neighbor.sortPosition })
      .where(eq(productImages.id, current.id));
    await tx
      .update(productImages)
      .set({ sortPosition: current.sortPosition })
      .where(eq(productImages.id, neighbor.id));
  });

  return { ok: true, images: await loadImagesForProduct(productId) };
}
