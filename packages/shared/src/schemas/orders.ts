import { z } from "zod";
import { orderStatusSchema } from "../domain/enums.js";

// Контракт чекаута (POST /shop/:sellerId/orders, см.
// CONCEPT.md#каталог-и-заказы, STACK.md#доменная-схема-v1). Telegram-контакт
// покупателя приходит из JWT (initData), не из тела запроса — форма несёт
// только то, что платформа не знает сама. `consent` — обязательное согласие
// на обработку ПДн (152-ФЗ), без него запрос не проходит валидацию схемы.

export const orderItemInputSchema = z.object({
  variantId: z.number().int().positive(),
  quantity: z.number().int().positive(),
});
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

// Формат телефона — только РФ (+7XXXXXXXXXX, 10 цифр после кода страны):
// решение 20.07.2026, аудитория v1 — российские продавцы/покупатели (те же
// границы, что у 152-ФЗ/ЮKassa/СДЭК). Международный формат — расширение на
// будущее, не нужен для текущего рынка.
export const RU_PHONE_REGEX = /^\+7\d{10}$/;

// Поля формы чекаута без корзины (`items`) — вынесены отдельно, чтобы фронт
// мог валидировать саму форму (react-компонент) той же схемой, что и бэк
// тело запроса целиком, без второй копии правил (см. STACK.md#валидация).
export const checkoutFormSchema = z.object({
  buyerFullName: z.string().trim().min(1).max(200),
  buyerPhone: z
    .string()
    .trim()
    .regex(RU_PHONE_REGEX, "Формат: +7XXXXXXXXXX"),
  buyerAddress: z.string().trim().min(1).max(500),
  buyerComment: z.string().trim().max(1000).nullable().optional(),
  consent: z.literal(true),
});
export type CheckoutFormFields = z.infer<typeof checkoutFormSchema>;

// UUID одной попытки оформления (см. Спринт 31) — клиент генерирует его
// один раз при заходе на чекаут и переиспользует при повторной отправке
// той же формы (после сетевой ошибки), не на каждый клик "Оформить заказ".
// Сервер дедуплицирует по нему (уникальный индекс на orders.idempotency_key).
export const createOrderRequestSchema = checkoutFormSchema.extend({
  items: z.array(orderItemInputSchema).min(1).max(100),
  idempotencyKey: z.string().uuid(),
});
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

// Единственный контракт ошибки в API — `{ error: string }` (без отдельного
// поля `code`, см. Спринт 31). Эта строка — единственный источник для
// сравнения на бэке (orders.route.ts) и фронте (CheckoutPage.tsx), чтобы
// не разъезжались при правке текста.
export const INSUFFICIENT_STOCK_ERROR = "недостаточно остатка";

export const orderItemSchema = z.object({
  variantId: z.number().nullable(),
  productName: z.string(),
  variantName: z.string(),
  priceKopecks: z.number().int(),
  quantity: z.number().int(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

// Тариф 1 без платёжного шлюза (см. CONCEPT.md#каталог-и-заказы) — ответ
// сразу несёт реквизиты/контакт продавца для экрана "оплатите переводом",
// не публичный каталог (см. shop.ts) — это не место для сокрытия ПДн
// продавца, реквизиты видны только покупателю, который только что оформил
// заказ этому продавцу.
export const orderSellerInfoSchema = z.object({
  telegramUsername: z.string(),
  paymentDetails: z.string().nullable(),
});
export type OrderSellerInfo = z.infer<typeof orderSellerInfoSchema>;

export const createOrderResponseSchema = z.object({
  id: z.number(),
  status: orderStatusSchema,
  totalKopecks: z.number().int(),
  items: z.array(orderItemSchema),
  seller: orderSellerInfoSchema,
});
export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

// Заказы в продавцовской админке (GET/PATCH /seller/orders, см. Спринт 13
// docs/TASKS.md). ПДн покупателя (ФИО/телефон/адрес/комментарий) видны
// только владельцу заказа — продавцу, у которого он оформлен, тот же
// принцип, что и у реквизитов продавца в createOrderResponseSchema.
export const sellerOrderSchema = z.object({
  id: z.number(),
  status: orderStatusSchema,
  totalKopecks: z.number().int(),
  createdAt: z.coerce.date(),
  buyerFullName: z.string(),
  buyerPhone: z.string(),
  buyerAddress: z.string(),
  buyerComment: z.string().nullable(),
  items: z.array(orderItemSchema),
});
export type SellerOrder = z.infer<typeof sellerOrderSchema>;

export const sellerOrderListResponseSchema = z.object({
  orders: z.array(sellerOrderSchema),
});
export type SellerOrderListResponse = z.infer<
  typeof sellerOrderListResponseSchema
>;

export const updateOrderStatusRequestSchema = z.object({
  status: orderStatusSchema,
});
export type UpdateOrderStatusRequest = z.infer<
  typeof updateOrderStatusRequestSchema
>;

// «Мои заказы» покупателя (GET /orders/mine, Спринт 34) — в отличие от
// sellerOrderSchema список сквозной по всем магазинам платформы (фильтр по
// buyerTelegramId, не sellerId — один бот, разные продавцы через
// start_param), поэтому на каждый заказ нужен идентификатор магазина.
// ПДн покупателя (buyerFullName/phone/address) не дублируются в ответе —
// это данные самого покупателя, он их только что вводил, эхо не нужно.
export const buyerOrderSchema = z.object({
  id: z.number(),
  sellerId: z.number(),
  shopName: z.string(),
  telegramUsername: z.string(),
  status: orderStatusSchema,
  totalKopecks: z.number().int(),
  createdAt: z.coerce.date(),
  items: z.array(orderItemSchema),
});
export type BuyerOrder = z.infer<typeof buyerOrderSchema>;

export const buyerOrderListResponseSchema = z.object({
  orders: z.array(buyerOrderSchema),
});
export type BuyerOrderListResponse = z.infer<
  typeof buyerOrderListResponseSchema
>;
