import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { productImages } from "../db/schema.js";
import { getPresignedImageUrl } from "../s3/client.js";
import { thumbnailKeyFor } from "./storage-keys.js";

// Общие read-хелперы над product_images, без ownership-проверок (та живёт
// в services/products.service.ts / services/product-images.service.ts) —
// переиспользуются и продавцовской админкой, и публичной витриной.

export type ProductImageUrls = { url: string; thumbnailUrl: string };

export async function presignProductImage(
  s3Key: string,
): Promise<ProductImageUrls> {
  const [url, thumbnailUrl] = await Promise.all([
    getPresignedImageUrl(s3Key),
    getPresignedImageUrl(thumbnailKeyFor(s3Key)),
  ]);
  return { url, thumbnailUrl };
}

export async function findProductImageRow(
  productId: number,
): Promise<{ id: number; s3Key: string } | null> {
  const [row] = await db
    .select({ id: productImages.id, s3Key: productImages.s3Key })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  return row ?? null;
}

export async function loadProductImage(
  productId: number,
): Promise<ProductImageUrls | null> {
  const row = await findProductImageRow(productId);
  if (!row) return null;
  return presignProductImage(row.s3Key);
}

export async function loadProductImages(
  productIds: number[],
): Promise<Map<number, ProductImageUrls>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select({ productId: productImages.productId, s3Key: productImages.s3Key })
    .from(productImages)
    .where(inArray(productImages.productId, productIds));

  const entries = await Promise.all(
    rows.map(
      async (row) =>
        [row.productId, await presignProductImage(row.s3Key)] as const,
    ),
  );
  return new Map(entries);
}
