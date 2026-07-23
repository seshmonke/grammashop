import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

vi.mock("../yookassa/client.js", () => ({
  createPayment: vi.fn(),
  getPayment: vi.fn(),
}));

import { db } from "../db/client.js";
import { sellers, subscriptions } from "../db/schema.js";
import { createPayment, getPayment } from "../yookassa/client.js";
import type { YooKassaPayment } from "../yookassa/client.js";
import { runRecurringBilling } from "./billing.service.js";

const mockCreate = vi.mocked(createPayment);
const mockGet = vi.mocked(getPayment);

// 7006100xx — уникальный диапазон файла (см. аудит флаки, Спринт 32):
// пересекался с platform.route.test.ts на 700600001.
const SELLER_TG = 700610001;

async function seedDueSubscription(opts: {
  paidUntil: Date;
  status: "active" | "grace";
  withMethod?: boolean;
  sellerStatus?: "active" | "blocked" | "deleted";
}): Promise<number> {
  const [seller] = await db
    .insert(sellers)
    .values({
      telegramId: SELLER_TG,
      telegramUsername: "recurring_shop",
      fullName: "ФИО",
      phone: "+70000000000",
      shopName: "Магазин",
      status: opts.sellerStatus ?? "active",
    })
    .returning({ id: sellers.id });
  await db.insert(subscriptions).values({
    sellerId: seller!.id,
    tier: "tier1",
    status: opts.status,
    paidUntil: opts.paidUntil,
    ykPaymentMethodId: opts.withMethod === false ? null : "pm_recurring",
  });
  return seller!.id;
}

async function subRow(sellerId: number) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.sellerId, sellerId));
  return sub;
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function succeeded(id: string): YooKassaPayment {
  return {
    id,
    status: "succeeded",
    paid: true,
    amount: { value: "1.00", currency: "RUB" },
  };
}

describe("runRecurringBilling", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const stale = await db
      .select({ id: sellers.id })
      .from(sellers)
      .where(inArray(sellers.telegramId, [SELLER_TG]));
    if (stale.length) {
      await db.delete(sellers).where(
        inArray(
          sellers.id,
          stale.map((s) => s.id),
        ),
      );
    }
  });

  it("списывает подписку с истёкшим периодом и двигает paid_until вперёд", async () => {
    const sellerId = await seedDueSubscription({ paidUntil: daysAgo(1), status: "active" });
    mockCreate.mockResolvedValue({
      id: "rp_ok",
      status: "pending",
      paid: false,
      amount: { value: "1.00", currency: "RUB" },
    });
    mockGet.mockResolvedValue(succeeded("rp_ok"));

    await runRecurringBilling();

    const sub = await subRow(sellerId);
    expect(sub?.status).toBe("active");
    expect(sub!.paidUntil!.getTime()).toBeGreaterThan(Date.now());
  });

  it("при провале списания в пределах 3 дней — grace", async () => {
    const sellerId = await seedDueSubscription({ paidUntil: daysAgo(1), status: "active" });
    mockCreate.mockRejectedValue(new Error("платёж отклонён"));

    await runRecurringBilling();

    const sub = await subRow(sellerId);
    expect(sub?.status).toBe("grace");
  });

  it("при провале списания за пределами 3 дней — suspended", async () => {
    const sellerId = await seedDueSubscription({ paidUntil: daysAgo(10), status: "grace" });
    mockCreate.mockRejectedValue(new Error("платёж отклонён"));

    await runRecurringBilling();

    const sub = await subRow(sellerId);
    expect(sub?.status).toBe("suspended");
  });

  it("не трогает подписки без сохранённого токена карты", async () => {
    const sellerId = await seedDueSubscription({
      paidUntil: daysAgo(1),
      status: "active",
      withMethod: false,
    });

    await runRecurringBilling();

    expect(mockCreate).not.toHaveBeenCalled();
    const sub = await subRow(sellerId);
    expect(sub?.status).toBe("active"); // без карты не переводим в grace
  });

  // Спринт 37, «Анализ перед стартом»: до этого фикса свип не смотрел на
  // sellers.status вовсе — заблокированный/удалённый продавец продолжал
  // бы списываться по рекурренту.
  it.each(["blocked", "deleted"] as const)(
    "не списывает подписку продавца со статусом %s",
    async (sellerStatus) => {
      const sellerId = await seedDueSubscription({
        paidUntil: daysAgo(1),
        status: "active",
        sellerStatus,
      });

      await runRecurringBilling();

      expect(mockCreate).not.toHaveBeenCalled();
      const sub = await subRow(sellerId);
      expect(sub?.status).toBe("active");
      expect(sub!.paidUntil!.getTime()).toBeLessThan(Date.now());
    },
  );
});
