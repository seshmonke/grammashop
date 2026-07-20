import { randomUUID } from "node:crypto";

// Ключи S3 для фото товара (см. STACK.md#пайплайн-фото-товара-спринт-16).
// Thumbnail — не отдельная колонка в БД, а производный ключ от оригинала
// (суффикс `-thumb` перед расширением), чтобы не тянуть лишнюю миграцию
// ради значения, которое всегда можно вычислить.

export function originalImageKey(sellerId: number, productId: number): string {
  return `products/${sellerId}/${productId}/${randomUUID()}.webp`;
}

export function thumbnailKeyFor(originalKey: string): string {
  return originalKey.replace(/\.webp$/, "-thumb.webp");
}
