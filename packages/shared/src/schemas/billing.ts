import { z } from "zod";

// Биллинг подписки продавца на ЮKassa (POST /seller/subscription/pay, см.
// CONCEPT.md#оплата-подписки-продавцом, Спринт 26). Первый платёж —
// привязка карты: сервер создаёт платёж и возвращает confirmationUrl,
// который продавец открывает для подтверждения. Дальнейшее продление —
// авторекуррентом на стороне сервера, отдельного запроса от клиента нет.
export const startSubscriptionPaymentResponseSchema = z.object({
  // null, если ЮKassa не вернула confirmation (напр. метод не требует
  // подтверждения) — тогда статус подтвердится вебхуком.
  confirmationUrl: z.string().nullable(),
  paymentId: z.string(),
});
export type StartSubscriptionPaymentResponse = z.infer<
  typeof startSubscriptionPaymentResponseSchema
>;
