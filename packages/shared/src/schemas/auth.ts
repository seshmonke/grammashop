import { z } from "zod";
import { sellerDeletedBySchema, sellerStatusSchema } from "../domain/enums.js";

// Контракт POST /auth (см. STACK.md#авторизация): фронт отдаёт сырой
// initData из Telegram SDK, бэк после проверки HMAC-подписи возвращает
// короткоживущий сессионный JWT и способности аккаунта. Роль — не одно
// значение, а два независимых флага: владелец платформы одновременно и
// продавец (запись в sellers), и админ (env-список) — см.
// CONCEPT.md#интерфейсы-платформы.

export const authRequestSchema = z.object({
  initData: z.string().min(1),
});
export type AuthRequest = z.infer<typeof authRequestSchema>;

export const authResponseSchema = z.object({
  token: z.string(),
  telegramId: z.number(),
  // null — у пользователя не задан username в Telegram: без него нельзя
  // зарегистрировать магазин (см. CONCEPT.md#оплата-подписки-продавцом) —
  // нет канала связи с покупателем.
  telegramUsername: z.string().nullable(),
  // null — у аккаунта нет активного продавца (не зарегистрирован или
  // заблокирован админом): продавцовская админка недоступна.
  sellerId: z.number().nullable(),
  // Статус продавца независимо от sellerId — различает «не
  // зарегистрирован» (null) от «заблокирован»/«удалён» (sellerId всё
  // равно null в обоих случаях) — см. Спринт 32/37.
  sellerStatus: sellerStatusSchema.nullable(),
  blockedReason: z.string().nullable(),
  // Причина и момент самоудаления/удаления админом (Спринт 37) — экрану
  // восстановления нужна дата истечения 30-дневного окна.
  deleteReason: z.string().nullable(),
  deletedAt: z.coerce.date().nullable(),
  // Актёр удаления (Спринт 40) — экран восстановления скрывает кнопку
  // самовосстановления, если удалил админ (кроме случая, когда сессия и
  // так admin — владелец платформы одновременно продавец своего демо-
  // магазина, см. CONCEPT.md#интерфейсы-платформы).
  deletedBy: sellerDeletedBySchema.nullable(),
  isAdmin: z.boolean(),
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
