import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";

// Клиент к ЮKassa мокается — тесты не ходят в сеть. createPayment/getPayment
// задаются per-test.
vi.mock("../yookassa/client.js", () => ({
  createPayment: vi.fn(),
  getPayment: vi.fn(),
}));

import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { sellers, subscriptions, subscriptionPayments } from "../db/schema.js";
import { createPayment, getPayment } from "../yookassa/client.js";
import type { YooKassaPayment } from "../yookassa/client.js";

const mockCreate = vi.mocked(createPayment);
const mockGet = vi.mocked(getPayment);

const SELLER_TG = 700500001;

async function seedSeller(): Promise<number> {
  const [seller] = await db
    .insert(sellers)
    .values({
      telegramId: SELLER_TG,
      telegramUsername: "biller_shop",
      fullName: "ФИО",
      phone: "+70000000000",
      shopName: "Магазин",
      status: "active",
    })
    .returning({ id: sellers.id });
  return seller!.id;
}

function sellerToken(app: ReturnType<typeof buildApp>, sellerId: number): string {
  return app.jwt.sign({
    telegramId: SELLER_TG,
    telegramUsername: "biller_shop",
    sellerId,
    isAdmin: false,
  });
}

function pendingPayment(id: string): YooKassaPayment {
  return {
    id,
    status: "pending",
    paid: false,
    amount: { value: "1.00", currency: "RUB" },
    confirmation: { type: "redirect", confirmation_url: `https://yoomoney/confirm/${id}` },
  };
}

function succeededPayment(id: string): YooKassaPayment {
  return {
    id,
    status: "succeeded",
    paid: true,
    amount: { value: "1.00", currency: "RUB" },
    payment_method: { id: "pm_saved_1", saved: true, type: "bank_card" },
  };
}

async function subscriptionRow(sellerId: number) {
  const [sub] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.sellerId, sellerId));
  return sub;
}

describe("биллинг подписки (ЮKassa)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const stale = await db
      .select({ id: sellers.id })
      .from(sellers)
      .where(inArray(sellers.telegramId, [SELLER_TG]));
    if (stale.length) {
      // cascade: subscriptions → subscription_payments снесутся сами.
      await db.delete(sellers).where(
        inArray(
          sellers.id,
          stale.map((s) => s.id),
        ),
      );
    }
  });

  it("POST /seller/subscription/pay создаёт платёж, pending-строку и отдаёт confirmation_url", async () => {
    const app = buildApp();
    await app.ready();
    const sellerId = await seedSeller();
    mockCreate.mockResolvedValue(pendingPayment("pay_first"));

    const res = await app.inject({
      method: "POST",
      url: "/seller/subscription/pay",
      headers: { authorization: `Bearer ${sellerToken(app, sellerId)}` },
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.paymentId).toBe("pay_first");
    expect(body.confirmationUrl).toBe("https://yoomoney/confirm/pay_first");
    // Просим сохранить метод для рекуррента.
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ savePaymentMethod: true }),
      expect.any(String),
    );

    const sub = await subscriptionRow(sellerId);
    expect(sub?.status).toBe("suspended"); // до подтверждения витрина скрыта
    const payments = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.subscriptionId, sub!.id));
    expect(payments).toHaveLength(1);
    expect(payments[0]!.status).toBe("pending");
    expect(payments[0]!.ykPaymentId).toBe("pay_first");
  });

  it("вебхук succeeded активирует подписку, сохраняет токен карты и двигает paid_until", async () => {
    const app = buildApp();
    await app.ready();
    const sellerId = await seedSeller();
    mockCreate.mockResolvedValue(pendingPayment("pay_ok"));
    await app.inject({
      method: "POST",
      url: "/seller/subscription/pay",
      headers: { authorization: `Bearer ${sellerToken(app, sellerId)}` },
      payload: {},
    });

    mockGet.mockResolvedValue(succeededPayment("pay_ok"));
    const res = await app.inject({
      method: "POST",
      url: "/billing/webhook",
      payload: { type: "notification", event: "payment.succeeded", object: { id: "pay_ok" } },
    });

    expect(res.statusCode).toBe(200);
    // Телу не доверяем — перечитали платёж.
    expect(mockGet).toHaveBeenCalledWith("pay_ok");

    const sub = await subscriptionRow(sellerId);
    expect(sub?.status).toBe("active");
    expect(sub?.ykPaymentMethodId).toBe("pm_saved_1");
    expect(sub?.paidUntil).toBeTruthy();
    expect(sub!.paidUntil!.getTime()).toBeGreaterThan(Date.now());

    const payments = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.subscriptionId, sub!.id));
    expect(payments[0]!.status).toBe("succeeded");
  });

  it("повторная доставка того же succeeded-события не продлевает подписку второй раз", async () => {
    const app = buildApp();
    await app.ready();
    const sellerId = await seedSeller();
    mockCreate.mockResolvedValue(pendingPayment("pay_dup"));
    await app.inject({
      method: "POST",
      url: "/seller/subscription/pay",
      headers: { authorization: `Bearer ${sellerToken(app, sellerId)}` },
      payload: {},
    });
    mockGet.mockResolvedValue(succeededPayment("pay_dup"));

    const deliver = () =>
      app.inject({
        method: "POST",
        url: "/billing/webhook",
        payload: { object: { id: "pay_dup" } },
      });

    await deliver();
    const afterFirst = await subscriptionRow(sellerId);
    const paidUntilFirst = afterFirst!.paidUntil!.getTime();

    const second = await deliver();
    expect(second.statusCode).toBe(200);
    const afterSecond = await subscriptionRow(sellerId);
    // paid_until не сдвинулся — продление ровно один раз.
    expect(afterSecond!.paidUntil!.getTime()).toBe(paidUntilFirst);
    // И платёж по-прежнему один.
    const payments = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.subscriptionId, afterSecond!.id));
    expect(payments).toHaveLength(1);
  });

  it("вебхук с неизвестным payment id — 200 без изменений и без перечитки", async () => {
    const app = buildApp();
    await app.ready();
    await seedSeller();

    const res = await app.inject({
      method: "POST",
      url: "/billing/webhook",
      payload: { object: { id: "pay_unknown" } },
    });
    expect(res.statusCode).toBe(200);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("вебхук без payment id в теле — 200, платёж не перечитывается", async () => {
    const app = buildApp();
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/billing/webhook",
      payload: { type: "notification", event: "payment.succeeded", object: {} },
    });
    expect(res.statusCode).toBe(200);
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("вебхук canceled помечает платёж отменённым и не активирует подписку", async () => {
    const app = buildApp();
    await app.ready();
    const sellerId = await seedSeller();
    mockCreate.mockResolvedValue(pendingPayment("pay_cancel"));
    await app.inject({
      method: "POST",
      url: "/seller/subscription/pay",
      headers: { authorization: `Bearer ${sellerToken(app, sellerId)}` },
      payload: {},
    });
    mockGet.mockResolvedValue({
      id: "pay_cancel",
      status: "canceled",
      paid: false,
      amount: { value: "1.00", currency: "RUB" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/billing/webhook",
      payload: { object: { id: "pay_cancel" } },
    });
    expect(res.statusCode).toBe(200);

    const sub = await subscriptionRow(sellerId);
    expect(sub?.status).toBe("suspended"); // не активирована
    const payments = await db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.subscriptionId, sub!.id));
    expect(payments[0]!.status).toBe("canceled");
  });
});
