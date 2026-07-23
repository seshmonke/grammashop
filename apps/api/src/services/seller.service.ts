import { and, eq, isNotNull, lte } from "drizzle-orm";
import {
  restoreWindowEnd,
  SELLER_RESTORE_WINDOW_DAYS,
  type RegisterSellerRequest,
  type SellerProfile,
  type UpdateSellerProfileRequest,
} from "@grammashop/shared";
import { db } from "../db/client.js";
import { sellers, subscriptions } from "../db/schema.js";

// Регистрация магазина до оплаты подписки (см.
// CONCEPT.md#оплата-подписки-продавцом, Спринт 21) — продавец заводит
// магазин и наполняет каталог без подписки, витрина скрыта от покупателя,
// пока подписки нет (см. shop.service.ts). username приходит из JWT
// (см. routes/seller.route.ts), не из тела запроса.

export type RegisterSellerResult =
  | { ok: true; id: number }
  | { ok: false; reason: "already-registered" };

export async function registerSeller(
  telegramId: number,
  telegramUsername: string,
  data: RegisterSellerRequest,
): Promise<RegisterSellerResult> {
  const [existing] = await db
    .select({ id: sellers.id })
    .from(sellers)
    .where(eq(sellers.telegramId, telegramId));
  if (existing) {
    return { ok: false, reason: "already-registered" };
  }

  const [created] = await db
    .insert(sellers)
    .values({
      telegramId,
      telegramUsername,
      fullName: data.fullName,
      phone: data.phone,
      shopName: data.shopName,
      status: "active",
    })
    .returning({ id: sellers.id });

  return { ok: true, id: created!.id };
}

function toProfile(row: {
  shopName: string;
  shopDescription: string | null;
  paymentDetails: string | null;
}, subscription: SellerProfile["subscription"]): SellerProfile {
  return {
    shopName: row.shopName,
    shopDescription: row.shopDescription,
    paymentDetails: row.paymentDetails,
    subscription,
  };
}

async function loadSubscription(
  sellerId: number,
): Promise<SellerProfile["subscription"]> {
  const [row] = await db
    .select({
      tier: subscriptions.tier,
      status: subscriptions.status,
      paidUntil: subscriptions.paidUntil,
    })
    .from(subscriptions)
    .where(eq(subscriptions.sellerId, sellerId));
  return row ?? null;
}

export async function getSellerProfile(
  sellerId: number,
): Promise<SellerProfile | null> {
  const [row] = await db
    .select({
      shopName: sellers.shopName,
      shopDescription: sellers.shopDescription,
      paymentDetails: sellers.paymentDetails,
    })
    .from(sellers)
    .where(eq(sellers.id, sellerId));
  if (!row) return null;
  return toProfile(row, await loadSubscription(sellerId));
}

export async function updateSellerProfile(
  sellerId: number,
  data: UpdateSellerProfileRequest,
): Promise<SellerProfile | null> {
  const [row] = await db
    .update(sellers)
    .set(data)
    .where(eq(sellers.id, sellerId))
    .returning({
      shopName: sellers.shopName,
      shopDescription: sellers.shopDescription,
      paymentDetails: sellers.paymentDetails,
    });
  if (!row) return null;
  return toProfile(row, await loadSubscription(sellerId));
}

// Самоудаление магазина продавцом (пока он ещё active, requireSellerId
// это гарантирует на уровне роута) — паттерн идентичен блокировке
// админом (Спринт 32), просто другой актёр и целевой статус.
export async function deleteSeller(
  sellerId: number,
  reason: string,
): Promise<{ id: number } | null> {
  const [updated] = await db
    .update(sellers)
    .set({ status: "deleted", deletedAt: new Date(), deleteReason: reason })
    .where(eq(sellers.id, sellerId))
    .returning({ id: sellers.id });
  return updated ?? null;
}

export type RestoreSellerResult =
  | { ok: true; id: number }
  | { ok: false; reason: "not-deleted" | "window-expired" };

// Самостоятельное восстановление — резолвит продавца по telegramId, не по
// sellerId (он null, пока магазин deleted, см. auth/access.ts). Админский
// путь восстановления не проверяет окно — идёт через
// platform.service.ts#updateSellerStatus по :id из URL, не по сессии.
export async function restoreSeller(
  telegramId: number,
): Promise<RestoreSellerResult | null> {
  const [seller] = await db
    .select({ id: sellers.id, status: sellers.status, deletedAt: sellers.deletedAt })
    .from(sellers)
    .where(eq(sellers.telegramId, telegramId));
  if (!seller) return null;
  if (seller.status !== "deleted") {
    return { ok: false, reason: "not-deleted" };
  }

  if (new Date() > restoreWindowEnd(seller.deletedAt!)) {
    return { ok: false, reason: "window-expired" };
  }

  await db
    .update(sellers)
    .set({ status: "active", deletedAt: null, deleteReason: null })
    .where(eq(sellers.id, seller.id));
  return { ok: true, id: seller.id };
}

// Продавцы, у которых окно восстановления истекло — обезличиваются
// автоматически (sellers/finalize-deletion-worker.ts). `now` — параметр
// для тестируемости, как и у runRecurringBilling (billing.service.ts).
export async function listExpiredDeletions(
  now: Date = new Date(),
): Promise<{ id: number }[]> {
  const threshold = new Date(now);
  threshold.setDate(threshold.getDate() - SELLER_RESTORE_WINDOW_DAYS);
  return db
    .select({ id: sellers.id })
    .from(sellers)
    .where(
      and(
        eq(sellers.status, "deleted"),
        isNotNull(sellers.deletedAt),
        lte(sellers.deletedAt, threshold),
      ),
    );
}
