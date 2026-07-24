import { z } from "zod";
import { platformSellerSubscriptionSchema } from "./platform.js";

// Регистрация магазина продавцом — до оплаты подписки (см.
// CONCEPT.md#оплата-подписки-продавцом, Спринт 21): username берётся из
// initData на бэке (не из тела запроса — подделать нечем, тот же принцип,
// что и у /auth), поэтому в контракте его нет. Обязательные поля —
// shopName/fullName/phone/consent; описание и реквизиты — опционально,
// доводятся позже в профиле.

export const registerSellerRequestSchema = z.object({
  shopName: z.string().trim().min(1).max(200),
  fullName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(30),
  // Без явного true — 400, ПДн без согласия не сохраняются (152-ФЗ).
  consent: z.literal(true),
});
export type RegisterSellerRequest = z.infer<typeof registerSellerRequestSchema>;

export const registerSellerResponseSchema = z.object({
  id: z.number(),
});
export type RegisterSellerResponse = z.infer<typeof registerSellerResponseSchema>;

export const sellerProfileSchema = z.object({
  shopName: z.string(),
  shopDescription: z.string().nullable(),
  paymentDetails: z.string().nullable(),
  // ФИО/телефон продавца — пустая строка после обезличивания (Спринт 37,
  // anonymize-seller.ts), не null (колонки NOT NULL). Пустые значения здесь
  // — сигнал для баннера «дозаполните профиль» (Спринт 41,
  // CONCEPT.md#персональные-данные-152-фз): витрина скрыта, пока продавец их
  // не заполнит через этот же PATCH.
  fullName: z.string(),
  phone: z.string(),
  // Статус подписки продавца (см. CONCEPT.md#оплата-подписки-продавцом) —
  // нужен баннеру в админке («витрина скрыта, подписка не активна» / «активна
  // до даты»), null — регистрация без оплаты, льгота ещё не выдана.
  subscription: platformSellerSubscriptionSchema.nullable(),
});
export type SellerProfile = z.infer<typeof sellerProfileSchema>;

export const updateSellerProfileRequestSchema = z.object({
  shopName: z.string().trim().min(1).max(200).optional(),
  shopDescription: z.string().trim().max(2000).nullable().optional(),
  paymentDetails: z.string().trim().max(2000).nullable().optional(),
  // Тот же уровень строгости, что на регистрации (registerSellerRequestSchema)
  // — свободный текст без формата, решение 24.07.2026 (Спринт 41): в
  // кодовой базе нет формат-валидации телефона нигде, заводить её здесь не в
  // скоупе.
  fullName: z.string().trim().min(1).max(200).optional(),
  phone: z.string().trim().min(1).max(30).optional(),
});
export type UpdateSellerProfileRequest = z.infer<
  typeof updateSellerProfileRequestSchema
>;

// Самоудаление магазина продавцом (Спринт 37) — POST /seller/delete,
// причина обязательна (свободный текст, тот же паттерн, что причина
// блокировки, Спринт 32).
export const deleteSellerRequestSchema = z.object({
  reason: z.string().trim().min(1).max(500),
});
export type DeleteSellerRequest = z.infer<typeof deleteSellerRequestSchema>;

// Самостоятельное восстановление — POST /seller/restore, без тела
// (продавец резолвится по telegramId из сессии, не по sellerId — он
// null, пока магазин deleted).
export const restoreSellerResponseSchema = z.object({
  id: z.number(),
});
export type RestoreSellerResponse = z.infer<typeof restoreSellerResponseSchema>;
