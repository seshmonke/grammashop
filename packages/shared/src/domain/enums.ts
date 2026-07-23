import { z } from "zod";

// Единый источник допустимых значений доменных enum'ов. Массивы-константы
// используются и Zod-схемами (валидация, фронт), и Drizzle `pgEnum`
// (apps/api/src/db/schema.ts) — значения статусов/тарифов не расходятся
// между БД и приложением по построению.

// Статус продавца: blocked — действие админа (см.
// CONCEPT.md#модерация-и-лимиты); deleted — самоудаление продавцом или
// админом, с окном восстановления 30 дней (см.
// docs/tasks/37-seller-soft-delete-and-monitoring-retry.md). Скрытие
// витрины за неоплату — производное от статуса подписки, здесь не
// дублируется.
export const sellerStatuses = ["active", "blocked", "deleted"] as const;
export const sellerStatusSchema = z.enum(sellerStatuses);
export type SellerStatus = z.infer<typeof sellerStatusSchema>;

// Тариф подписки (см. CONCEPT.md#тарифы): tier1 = Free, tier2 = Premium.
// tier3 — наследие прежней трёхуровневой сетки (решение 21.07.2026),
// выведен из употребления, но не удалён из enum — миграция БД не нужна,
// на проде живых подписок tier3 нет (продукт ещё не в паблике).
export const subscriptionTiers = ["tier1", "tier2", "tier3"] as const;
export const subscriptionTierSchema = z.enum(subscriptionTiers);
export type SubscriptionTier = z.infer<typeof subscriptionTierSchema>;

// Статус подписки: grace — грейс-период после неоплаты, suspended —
// витрина скрыта, canceled — продавец отменил (см.
// CONCEPT.md#оплата-подписки-продавцом).
export const subscriptionStatuses = [
  "active",
  "grace",
  "suspended",
  "canceled",
] as const;
export const subscriptionStatusSchema = z.enum(subscriptionStatuses);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

// Статус списания подписки (ЮKassa): pending → succeeded | canceled.
export const subscriptionPaymentStatuses = [
  "pending",
  "succeeded",
  "canceled",
] as const;
export const subscriptionPaymentStatusSchema = z.enum(
  subscriptionPaymentStatuses,
);
export type SubscriptionPaymentStatus = z.infer<
  typeof subscriptionPaymentStatusSchema
>;

// Статус карточки товара: hidden — скрыта продавцом, не удалена.
export const productStatuses = ["active", "hidden"] as const;
export const productStatusSchema = z.enum(productStatuses);
export type ProductStatus = z.infer<typeof productStatusSchema>;

// Статус заказа: новый → оплачен → выполнен; отменён — из любого статуса
// до «выполнен» (см. CONCEPT.md#каталог-и-заказы). Без «отправлен»/
// «получен» — доставка на Тарифе 1 вне платформы.
export const orderStatuses = ["new", "paid", "fulfilled", "canceled"] as const;
export const orderStatusSchema = z.enum(orderStatuses);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

// Допустимые переходы статуса заказа (см. CONCEPT.md#каталог-и-заказы):
// вперёд «новый» → «оплачен» → «выполнен», «отменён» — из «новый»/«оплачен»
// (не из «выполнен»). Плюс откат на шаг назад — «оплачен» → «новый»,
// «выполнен» → «оплачен» — на случай ошибочного клика продавца в своей
// админке (решение 19.07.2026): оплата/выполнение — его собственные
// пометки, ничего вовне не триггерят, в отличие от «отменён», который
// остаётся терминальным без отката. Единый источник для бэка (валидация
// перехода в orders.service.ts) и фронта (какие кнопки смены статуса
// показывать в продавцовской админке) — правило не дублируется (см.
// STACK.md#валидация).
export const ORDER_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  new: ["paid", "canceled"],
  paid: ["new", "fulfilled", "canceled"],
  fulfilled: ["paid"],
  canceled: [],
};
