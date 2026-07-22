import { z } from "zod";
import {
  sellerStatusSchema,
  subscriptionStatusSchema,
  subscriptionTierSchema,
} from "../domain/enums.js";

// Платформенная админка (GET/PATCH /platform/sellers, см. Спринт 14
// docs/TASKS.md): список продавцов со статусом подписки + ручная
// блокировка/разблокировка. Доступ — request.user.isAdmin, не sellerId
// (другая проверка, чем у /seller/*, см. STACK.md#авторизация).

// nullable — продавец может существовать без строки в subscriptions (пока
// нет формы регистрации с оплатой, продуктовая карта п.3): подписка
// заводится только вместе с seed-продавцом или будущей регистрацией.
export const platformSellerSubscriptionSchema = z.object({
  tier: subscriptionTierSchema,
  status: subscriptionStatusSchema,
  paidUntil: z.coerce.date().nullable(),
});
export type PlatformSellerSubscription = z.infer<
  typeof platformSellerSubscriptionSchema
>;

export const platformSellerSchema = z.object({
  id: z.number(),
  shopName: z.string(),
  telegramUsername: z.string(),
  status: sellerStatusSchema,
  createdAt: z.coerce.date(),
  subscription: platformSellerSubscriptionSchema.nullable(),
});
export type PlatformSeller = z.infer<typeof platformSellerSchema>;

export const platformSellerListResponseSchema = z.object({
  sellers: z.array(platformSellerSchema),
});
export type PlatformSellerListResponse = z.infer<
  typeof platformSellerListResponseSchema
>;

export const updateSellerStatusRequestSchema = z.object({
  status: sellerStatusSchema,
  // Причина — только при переходе в blocked (см. Спринт 32), свободный
  // текст, не фиксированный список (решение зафиксировано в диалоге).
  reason: z.string().trim().min(1).optional(),
});
export type UpdateSellerStatusRequest = z.infer<
  typeof updateSellerStatusRequestSchema
>;

export const updateSellerStatusResponseSchema = z.object({
  id: z.number(),
  status: sellerStatusSchema,
  blockedReason: z.string().nullable(),
});
export type UpdateSellerStatusResponse = z.infer<
  typeof updateSellerStatusResponseSchema
>;

// Льгота — выдача N месяцев доступа без ЮKassa (см.
// CONCEPT.md#оплата-подписки-продавцом, Спринт 21): сдвигает paid_until
// вперёд от max(сейчас, текущий paid_until), заводит подписку Тарифа 1
// в статусе active, если её ещё не было. Отдельной сущности «льгота» в
// схеме нет — обычная активная подписка до даты.
export const grantGraceRequestSchema = z.object({
  months: z.number().int().positive().max(24),
});
export type GrantGraceRequest = z.infer<typeof grantGraceRequestSchema>;

export const grantGraceResponseSchema = z.object({
  id: z.number(),
  subscription: platformSellerSubscriptionSchema,
});
export type GrantGraceResponse = z.infer<typeof grantGraceResponseSchema>;
