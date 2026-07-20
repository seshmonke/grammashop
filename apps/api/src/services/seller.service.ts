import { eq } from "drizzle-orm";
import type {
  RegisterSellerRequest,
  SellerProfile,
  UpdateSellerProfileRequest,
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
