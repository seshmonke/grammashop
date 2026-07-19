import { desc, eq } from "drizzle-orm";
import type { PlatformSeller, SellerStatus } from "@grammashop/shared";
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
