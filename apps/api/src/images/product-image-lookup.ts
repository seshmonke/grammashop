import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { productImages } from "../db/schema.js";
import { getPresignedImageUrl } from "../s3/client.js";
import { thumbnailKeyFor } from "./storage-keys.js";

// Общие read-хелперы над product_images (см.
// STACK.md#пайплайн-фото-товара-спринт-16-расширено-спринтом-20), без
// ownership-проверок (та живёт в services/products.service.ts /
// services/product-images.service.ts) — переиспользуются и продавцовской
// админкой, и публичной витриной. До 5 строк на карточку, порядок —
// sort_position.

export type ProductImageUrls = { url: string; thumbnailUrl: string };
export type ProductImageRow = {
  id: number;
  s3Key: string;
  sortPosition: number;
};
export type ProductImageWithUrls = ProductImageUrls & { id: number };

export async function presignProductImage(
  s3Key: string,
): Promise<ProductImageUrls> {
  const [url, thumbnailUrl] = await Promise.all([
    getPresignedImageUrl(s3Key),
    getPresignedImageUrl(thumbnailKeyFor(s3Key)),
  ]);
  return { url, thumbnailUrl };
}

export async function listProductImageRows(
  productId: number,
): Promise<ProductImageRow[]> {
  return db
    .select({
      id: productImages.id,
      s3Key: productImages.s3Key,
      sortPosition: productImages.sortPosition,
    })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(asc(productImages.sortPosition), asc(productImages.id));
}

export async function findProductImageRow(
  productId: number,
  imageId: number,
): Promise<ProductImageRow | null> {
  const [row] = await db
    .select({
      id: productImages.id,
      s3Key: productImages.s3Key,
      sortPosition: productImages.sortPosition,
    })
    .from(productImages)
    .where(
      and(eq(productImages.productId, productId), eq(productImages.id, imageId)),
    );
  return row ?? null;
}

export async function loadImagesForProduct(
  productId: number,
): Promise<ProductImageWithUrls[]> {
  const rows = await listProductImageRows(productId);
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      ...(await presignProductImage(row.s3Key)),
    })),
  );
}

export async function loadImagesForProducts(
  productIds: number[],
): Promise<Map<number, ProductImageWithUrls[]>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select({
      id: productImages.id,
      productId: productImages.productId,
      s3Key: productImages.s3Key,
      sortPosition: productImages.sortPosition,
    })
    .from(productImages)
    .where(inArray(productImages.productId, productIds))
    .orderBy(asc(productImages.sortPosition), asc(productImages.id));

  const withUrls = await Promise.all(
    rows.map(async (row) => ({
      productId: row.productId,
      image: { id: row.id, ...(await presignProductImage(row.s3Key)) },
    })),
  );

  const map = new Map<number, ProductImageWithUrls[]>();
  for (const { productId, image } of withUrls) {
    const list = map.get(productId) ?? [];
    list.push(image);
    map.set(productId, list);
  }
  return map;
}
