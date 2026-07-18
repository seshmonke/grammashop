import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sellers } from "../db/schema.js";

// Резолвинг способностей аккаунта по Telegram ID (см. STACK.md#авторизация).
// Не «одна роль», а два независимых флага: у владельца платформы одна
// учётка — и продавец, и админ (см. CONCEPT.md#интерфейсы-платформы).

export interface AuthContext {
  telegramId: number;
  // null — активного продавца нет: не зарегистрирован или заблокирован
  // админом (blocked не получает продавцовскую админку — механизм отзыва
  // доступа, см. очередь TASKS.md «Механизм отзыва сессии»).
  sellerId: number | null;
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
    .select({ id: sellers.id })
    .from(sellers)
    .where(
      and(eq(sellers.telegramId, telegramId), eq(sellers.status, "active")),
    );

  return {
    telegramId,
    sellerId: seller?.id ?? null,
    isAdmin: parseAdminIds(process.env.ADMIN_TELEGRAM_IDS).has(telegramId),
  };
}
