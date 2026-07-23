import { desc, eq } from "drizzle-orm";
import type {
  PlatformSeller,
  PlatformSellerSubscription,
  SellerStatus,
} from "@grammashop/shared";
import { db } from "../db/client.js";
import { sellers, subscriptions } from "../db/schema.js";

// Платформенная админка — список продавцов (см. routes/platform.route.ts).
// LEFT JOIN, не INNER: подписка опциональна (см. platform.ts в shared).
export async function listSellers(): Promise<PlatformSeller[]> {
  const rows = await db
    .select({
      id: sellers.id,
      shopName: sellers.shopName,
      telegramUsername: sellers.telegramUsername,
      status: sellers.status,
      createdAt: sellers.createdAt,
      subscriptionTier: subscriptions.tier,
      subscriptionStatus: subscriptions.status,
      paidUntil: subscriptions.paidUntil,
    })
    .from(sellers)
    .leftJoin(subscriptions, eq(subscriptions.sellerId, sellers.id))
    .orderBy(desc(sellers.createdAt));

  return rows.map((row) => ({
    id: row.id,
    shopName: row.shopName,
    telegramUsername: row.telegramUsername,
    status: row.status,
    createdAt: row.createdAt,
    subscription:
      row.subscriptionTier && row.subscriptionStatus
        ? {
            tier: row.subscriptionTier,
            status: row.subscriptionStatus,
            paidUntil: row.paidUntil,
          }
        : null,
  }));
}

export async function updateSellerStatus(
  sellerId: number,
  status: SellerStatus,
  reason?: string,
): Promise<{
  id: number;
  status: SellerStatus;
  blockedReason: string | null;
  deleteReason: string | null;
} | null> {
  const [updated] = await db
    .update(sellers)
    // reason имеет смысл только при переходе в blocked/deleted
    // (обязательность на уровне UI, см. PlatformHome.tsx) — любой другой
    // целевой статус всегда очищает оба поля, даже если reason по ошибке
    // передан. deletedAt — только при переходе в deleted (см. Спринт 37,
    // окно восстановления считается от него). deletedBy — 'admin' (Спринт
    // 40): этот путь всегда инициирован админом (requireAdmin в
    // platform.route.ts), самоудаление продавцом идёт через
    // seller.service.ts#deleteSeller с deletedBy: 'seller'.
    .set({
      status,
      blockedReason: status === "blocked" ? (reason ?? null) : null,
      deleteReason: status === "deleted" ? (reason ?? null) : null,
      deletedAt: status === "deleted" ? new Date() : null,
      deletedBy: status === "deleted" ? "admin" : null,
    })
    .where(eq(sellers.id, sellerId))
    .returning({
      id: sellers.id,
      status: sellers.status,
      blockedReason: sellers.blockedReason,
      deleteReason: sellers.deleteReason,
    });
  return updated ?? null;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

// Льгота — N месяцев доступа без ЮKassa (см.
// CONCEPT.md#оплата-подписки-продавцом, Спринт 21, уточнение
// Спринта 22). Отсчёт — от большего из (сейчас, текущий paidUntil):
// льгота поверх ещё не истёкшей подписки прибавляется к остатку, а не
// «съедается» им; поверх истёкшей/отсутствующей подписки считается от
// сейчас. Всегда выставляет tier2 (Premium) — льгота выдаётся только на
// Premium, обходить верификацию Free (карта) вручную незачем (см.
// CONCEPT.md#тарифы). Это касается и уже существующих подписок: продавцы
// со старой Free-льготой Спринта 21 при повторной выдаче должны реально
// получить лимит Premium, а не унаследовать Free (найдено на проде
// 21.07.2026 — первая реализация трогала tier только при создании).
export async function grantGrace(
  sellerId: number,
  months: number,
): Promise<{ id: number; subscription: PlatformSellerSubscription } | null> {
  const [seller] = await db
    .select({ id: sellers.id })
    .from(sellers)
    .where(eq(sellers.id, sellerId));
  if (!seller) return null;

  const [existing] = await db
    .select({
      id: subscriptions.id,
      paidUntil: subscriptions.paidUntil,
    })
    .from(subscriptions)
    .where(eq(subscriptions.sellerId, sellerId));

  const now = new Date();
  const base = existing?.paidUntil && existing.paidUntil > now ? existing.paidUntil : now;
  const paidUntil = addMonths(base, months);

  if (existing) {
    const [updated] = await db
      .update(subscriptions)
      .set({ tier: "tier2", status: "active", paidUntil })
      .where(eq(subscriptions.id, existing.id))
      .returning({
        tier: subscriptions.tier,
        status: subscriptions.status,
        paidUntil: subscriptions.paidUntil,
      });
    return { id: sellerId, subscription: updated! };
  }

  const [created] = await db
    .insert(subscriptions)
    .values({ sellerId, tier: "tier2", status: "active", paidUntil })
    .returning({
      tier: subscriptions.tier,
      status: subscriptions.status,
      paidUntil: subscriptions.paidUntil,
    });
  return { id: sellerId, subscription: created! };
}
