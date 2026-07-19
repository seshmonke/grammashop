import { eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/client.js";
import { sellers } from "../db/schema.js";

// Проверки доступа для /seller/* и /platform/* — общие для всех роутов
// продавцовской и платформенной админки (products.route.ts, orders.route.ts,
// platform.route.ts), раньше дублировались по файлам.
//
// requireSellerId дополнительно перепроверяет статус продавца по БД, а не
// только наличие sellerId в JWT (решение по «Механизму отзыва сессии»,
// см. STACK.md#авторизация): токен живёт до 1ч, и без этой проверки
// заблокированный админом продавец продолжал бы работать в своей админке
// до истечения TTL. Лишний DB-хит на каждый запрос — цена, приемлемая на
// масштабе v1, ради быстрого эффекта блокировки.
export async function requireSellerId(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<number | null> {
  const sellerId = request.user.sellerId;
  if (sellerId === null) {
    reply.code(403).send({ error: "доступно только продавцу" });
    return null;
  }

  const [seller] = await db
    .select({ status: sellers.status })
    .from(sellers)
    .where(eq(sellers.id, sellerId));
  if (!seller || seller.status !== "active") {
    reply.code(403).send({ error: "доступно только продавцу" });
    return null;
  }

  return sellerId;
}

// Список платформенных админов — env, не таблица (см. STACK.md), поэтому
// в отличие от requireSellerId перепроверять по БД нечего: isAdmin в JWT
// уже вычислен из того же env-списка при /auth.
export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (!request.user.isAdmin) {
    reply.code(403).send({ error: "доступно только администратору" });
    return false;
  }
  return true;
}
