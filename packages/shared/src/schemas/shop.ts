import { z } from "zod";
import { productImageSchema } from "./products.js";

// Контракт публичной витрины (GET /shop/:sellerId). Только то, что видит
// покупатель: витрина продавца и его активные товары. ПДн продавца
// (ФИО/телефон) и реквизиты оплаты СЮДА НЕ ПОПАДАЮТ (152-ФЗ) — username
// публичен по природе (канал связи, см. CONCEPT.md#коммуникация-продавца-и-покупателя).
// Деньги — в копейках (int), форматирование в рубли — на фронте.

export const shopVariantSchema = z.object({
  id: z.number(),
  name: z.string(),
  priceKopecks: z.number().int(),
  // null — скидки нет (иначе зачёркнутая старая цена).
  oldPriceKopecks: z.number().int().nullable(),
  // null — учёт остатка выключен (всегда в наличии); 0 — нет в наличии.
  stock: z.number().int().nullable(),
});
export type ShopVariant = z.infer<typeof shopVariantSchema>;

export const shopProductSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  variants: z.array(shopVariantSchema),
  images: z.array(productImageSchema),
});
export type ShopProduct = z.infer<typeof shopProductSchema>;

export const shopCatalogResponseSchema = z.object({
  sellerId: z.number(),
  shopName: z.string(),
  shopDescription: z.string().nullable(),
  telegramUsername: z.string(),
  products: z.array(shopProductSchema),
});
export type ShopCatalogResponse = z.infer<typeof shopCatalogResponseSchema>;
