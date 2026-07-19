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

export const createOrderRequestSchema = checkoutFormSchema.extend({
  items: z.array(orderItemInputSchema).min(1),
});
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

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
