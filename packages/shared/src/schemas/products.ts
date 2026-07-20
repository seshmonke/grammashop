import { z } from "zod";

// Контракт продавцовской админки товаров (см.
// STACK.md#роутинг, CONCEPT.md#каталог-и-заказы). Лимиты (30 карточек,
// 10 вариантов на карточку) проверяются в сервис-слое, не здесь — эта
// схема только про форму данных запроса/ответа.

export const productVariantInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  priceKopecks: z.number().int().positive(),
  // null/undefined — скидки нет.
  oldPriceKopecks: z.number().int().positive().nullable().optional(),
  // null/undefined — учёт остатка выключен (всегда «в наличии»).
  stock: z.number().int().min(0).nullable().optional(),
});
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;

// Частичное обновление варианта — все поля опциональны, но при передаче
// проходят те же ограничения, что и при создании.
export const productVariantUpdateSchema = productVariantInputSchema.partial();
export type ProductVariantUpdate = z.infer<typeof productVariantUpdateSchema>;

export const sellerProductVariantSchema = z.object({
  id: z.number(),
  name: z.string(),
  priceKopecks: z.number().int(),
  oldPriceKopecks: z.number().int().nullable(),
  stock: z.number().int().nullable(),
});
export type SellerProductVariant = z.infer<typeof sellerProductVariantSchema>;

// Одна фото-ссылка на карточку (не галерея, см.
// STACK.md#пайплайн-фото-товара-спринт-16) — presigned GET-ссылки, TTL 1
// час, генерируются на каждый ответ заново.
export const productImageSchema = z.object({
  url: z.string(),
  thumbnailUrl: z.string(),
});
export type ProductImage = z.infer<typeof productImageSchema>;

export const sellerProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  variants: z.array(sellerProductVariantSchema),
  image: productImageSchema.nullable(),
});
export type SellerProduct = z.infer<typeof sellerProductSchema>;

export const productImageUploadResponseSchema = z.object({
  image: productImageSchema,
});
export type ProductImageUploadResponse = z.infer<
  typeof productImageUploadResponseSchema
>;

export const sellerProductListResponseSchema = z.object({
  products: z.array(sellerProductSchema),
});
export type SellerProductListResponse = z.infer<
  typeof sellerProductListResponseSchema
>;

// Карточка без опций хранится как единственный вариант по умолчанию (см.
// CONCEPT.md#каталог-и-заказы) — минимум 1 вариант обязателен уже на
// создании.
export const createProductRequestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).nullable().optional(),
  variants: z.array(productVariantInputSchema).min(1).max(10),
});
export type CreateProductRequest = z.infer<typeof createProductRequestSchema>;

export const updateProductRequestSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
});
export type UpdateProductRequest = z.infer<typeof updateProductRequestSchema>;

// Пакетная заливка каталога через Excel-шаблон (см.
// STACK.md#пакетная-заливка-каталога-спринт-18) — партиальный импорт:
// валидные карточки создаются, невалидные строки идут построчным
// отчётом, не блокируют файл целиком.
export const productImportRowErrorSchema = z.object({
  row: z.number().int(),
  error: z.string(),
});
export type ProductImportRowError = z.infer<typeof productImportRowErrorSchema>;

export const productImportResponseSchema = z.object({
  createdCount: z.number().int(),
  errors: z.array(productImportRowErrorSchema),
});
export type ProductImportResponse = z.infer<typeof productImportResponseSchema>;
