import { eq } from "drizzle-orm";
import type { SellerStatus } from "@grammashop/shared";
import { db } from "../db/client.js";
import { sellers } from "../db/schema.js";

// Резолвинг способностей аккаунта по Telegram ID (см. STACK.md#авторизация).
// Не «одна роль», а два независимых флага: у владельца платформы одна
// учётка — и продавец, и админ (см. CONCEPT.md#интерфейсы-платформы).

export interface AuthContext {
  telegramId: number;
  // null — активного продавца нет: не зарегистрирован, заблокирован
  // админом или удалён (blocked/deleted не получают продавцовскую
  // админку — механизм отзыва доступа, см. очередь TASKS.md «Механизм
  // отзыва сессии»).
  sellerId: number | null;
  // Статус продавца независимо от sellerId (null — продавца вообще нет,
  // ни разу не регистрировался) — фронт различает «не зарегистрирован»,
  // «заблокирован» (Спринт 32) и «удалён» (Спринт 37), sellerId в обоих
  // случаях всё равно null.
  sellerStatus: SellerStatus | null;
  blockedReason: string | null;
  deleteReason: string | null;
  deletedAt: Date | null;
  isAdmin: boolean;
}

// Список платформенных админов — числовые Telegram ID через запятую в env,
// не таблица (см. STACK.md#доменная-схема-v1, «Ключевые решения»).
function parseAdminIds(raw: string | undefined): Set<number> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isInteger(n)),
  );
}

export async function resolveAuthContext(
  telegramId: number,
): Promise<AuthContext> {
  const [seller] = await db
    .select({
      id: sellers.id,
      status: sellers.status,
      blockedReason: sellers.blockedReason,
      deleteReason: sellers.deleteReason,
      deletedAt: sellers.deletedAt,
    })
    .from(sellers)
    .where(eq(sellers.telegramId, telegramId));

  return {
    telegramId,
    sellerId: seller?.status === "active" ? seller.id : null,
    sellerStatus: seller?.status ?? null,
    blockedReason: seller?.blockedReason ?? null,
    deleteReason: seller?.deleteReason ?? null,
    deletedAt: seller?.deletedAt ?? null,
    isAdmin: parseAdminIds(process.env.ADMIN_TELEGRAM_IDS).has(telegramId),
  };
}
