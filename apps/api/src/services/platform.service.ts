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
): Promise<{ id: number; status: SellerStatus } | null> {
  const [updated] = await db
    .update(sellers)
    .set({ status })
    .where(eq(sellers.id, sellerId))
    .returning({ id: sellers.id, status: sellers.status });
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
// сейчас. Создаёт подписку Premium (tier2) active, если её не было —
// льгота выдаётся только на Premium, обходить верификацию Free (карта)
// вручную незачем (см. CONCEPT.md#тарифы). Если подписка уже есть,
// сдвигает paidUntil и возвращает статус в active (грейс до оплаты
// снимается льготой так же, как suspended/canceled), тариф существующей
// подписки не трогает.
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
      .set({ status: "active", paidUntil })
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
