import { z } from "zod";
import { productStatusSchema } from "../domain/enums.js";

// Контракт продавцовской админки товаров (см.
// STACK.md#роутинг, CONCEPT.md#каталог-и-заказы). Лимиты (30 карточек,
// 10 вариантов на карточку) проверяются в сервис-слое, не здесь — эта
// схема только про форму данных запроса/ответа.

// Сообщение общее для обеих схем ниже — база (см. базовая цена) не может
// быть ниже цены со скидкой, иначе это не скидка, а надбавка (баг, найденный
// пользователем 21.07.2026: старая цена ниже новой рендерилась на витрине
// без наценки, но никак не была запрещена на вводе).
const PRICE_ORDER_MESSAGE = "Базовая цена не может быть ниже цены со скидкой";

const productVariantShape = {
  name: z.string().trim().min(1).max(200),
  // Цена со скидкой — то, что фактически платит покупатель.
  priceKopecks: z.number().int().positive(),
  // Базовая цена («было») — null/undefined, если скидки нет. Показывается
  // на витрине зачёркнутой рядом с ценой со скидкой.
  oldPriceKopecks: z.number().int().positive().nullable().optional(),
  // null/undefined — учёт остатка выключен (всегда «в наличии»).
  stock: z.number().int().min(0).nullable().optional(),
};

export const productVariantInputSchema = z
  .object(productVariantShape)
  .refine(
    (v) => v.oldPriceKopecks == null || v.oldPriceKopecks >= v.priceKopecks,
    { message: PRICE_ORDER_MESSAGE, path: ["oldPriceKopecks"] },
  );
export type ProductVariantInput = z.infer<typeof productVariantInputSchema>;

// Частичное обновление варианта — все поля опциональны, но при передаче
// проходят те же ограничения, что и при создании. Проверка порядка цен
// здесь ловит только запрос, где оба поля пришли вместе — по одному полю
// за раз (см. seller/variant-diff.ts на фронте) её домержевает сервис
// (services/products.service.ts, updateVariant) против текущих значений в БД.
export const productVariantUpdateSchema = z
  .object(productVariantShape)
  .partial()
  .refine(
    (v) =>
      v.oldPriceKopecks == null ||
      v.priceKopecks == null ||
      v.oldPriceKopecks >= v.priceKopecks,
    { message: PRICE_ORDER_MESSAGE, path: ["oldPriceKopecks"] },
  );
export type ProductVariantUpdate = z.infer<typeof productVariantUpdateSchema>;

export const sellerProductVariantSchema = z.object({
  id: z.number(),
  name: z.string(),
  priceKopecks: z.number().int(),
  oldPriceKopecks: z.number().int().nullable(),
  stock: z.number().int().nullable(),
});
export type SellerProductVariant = z.infer<typeof sellerProductVariantSchema>;

// Галерея фото карточки — до 5 штук, не на вариант (см.
// STACK.md#пайплайн-фото-товара-спринт-16-расширено-спринтом-20) —
// presigned GET-ссылки, TTL 1 час, генерируются на каждый ответ заново.
// `id` — id строки product_images, нужен админке для удаления/reorder
// конкретного фото по эндпоинту.
export const productImageSchema = z.object({
  id: z.number(),
  url: z.string(),
  thumbnailUrl: z.string(),
});
export type ProductImage = z.infer<typeof productImageSchema>;

export const sellerProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  // Статус витрины (см. CONCEPT.md#жизненный-цикл-сущностей): active — на
  // витрине, hidden — черновик/снята. Read-side витрины отдаёт только
  // active, но продавцу нужен статус, чтобы показать бейдж и действие
  // «Опубликовать / Снять».
  status: productStatusSchema,
  variants: z.array(sellerProductVariantSchema),
  images: z.array(productImageSchema),
});
export type SellerProduct = z.infer<typeof sellerProductSchema>;

// Смена статуса карточки продавцом (PATCH /seller/products/:id/status).
// Публикация (active) требует ≥1 варианта — проверяется в сервисе, не
// здесь (эта схема только про форму запроса).
export const updateProductStatusRequestSchema = z.object({
  status: productStatusSchema,
});
export type UpdateProductStatusRequest = z.infer<
  typeof updateProductStatusRequestSchema
>;

// Массовая публикация черновиков (POST /seller/products/publish-all) —
// переводит все hidden-карточки продавца с ≥1 вариантом в active,
// закрывая онбординг после пакетного импорта (см.
// CONCEPT.md#жизненный-цикл-сущностей, «Пакетный импорт рождает черновики»).
export const publishAllResponseSchema = z.object({
  publishedCount: z.number().int(),
});
export type PublishAllResponse = z.infer<typeof publishAllResponseSchema>;

export const productImagesResponseSchema = z.object({
  images: z.array(productImageSchema),
});
export type ProductImagesResponse = z.infer<typeof productImagesResponseSchema>;

export const productImageMoveRequestSchema = z.object({
  direction: z.enum(["left", "right"]),
});
export type ProductImageMoveRequest = z.infer<
  typeof productImageMoveRequestSchema
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
