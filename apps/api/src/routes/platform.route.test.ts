import { beforeEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { platformSellerListResponseSchema } from "@grammashop/shared";
import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { sellers, subscriptions } from "../db/schema.js";

// /platform/sellers — платформенная админка (владелец платформы, см.
// CONCEPT.md#интерфейсы-платформы). Доступ по request.user.isAdmin, не
// sellerId — в отличие от /seller/* (см. products.route.test.ts).

const SELLER_WITH_SUB_TG = 700600001;
const SELLER_NO_SUB_TG = 700600002;
const ALL_TG = [SELLER_WITH_SUB_TG, SELLER_NO_SUB_TG];

async function seedSeller(
  telegramId: number,
  shopName: string,
  withSubscription: boolean,
) {
  const [seller] = await db
    .insert(sellers)
    .values({
      telegramId,
      telegramUsername: `user_${telegramId}`,
      fullName: "ФИО",
      phone: "+70000000000",
      shopName,
      status: "active",
    })
    .returning({ id: sellers.id });
  const sellerId = seller!.id;

  if (withSubscription) {
    const paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(subscriptions).values({
      sellerId,
      tier: "tier1",
      status: "active",
      paidUntil,
    });
  }

  return sellerId;
}

async function tokenFor(
  app: ReturnType<typeof buildApp>,
  opts: { sellerId: number | null; isAdmin?: boolean },
): Promise<string> {
  await app.ready();
  return app.jwt.sign({
    telegramId: 111,
    telegramUsername: null,
    sellerId: opts.sellerId,
    isAdmin: opts.isAdmin ?? false,
  });
}

async function req(
  app: ReturnType<typeof buildApp>,
  method: "GET" | "PATCH",
  url: string,
  token?: string,
  body?: Record<string, unknown>,
) {
  return app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body ?? {},
  });
}

describe("/platform/sellers", () => {
  beforeEach(async () => {
    await db.delete(sellers).where(inArray(sellers.telegramId, ALL_TG));
  });

  describe("доступ", () => {
    it("без JWT → 401", async () => {
      const app = buildApp();
      const res = await req(app, "GET", "/platform/sellers");
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("JWT без isAdmin (продавец) → 403", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(SELLER_WITH_SUB_TG, "Магазин", true);
      const token = await tokenFor(app, { sellerId, isAdmin: false });
      const res = await req(app, "GET", "/platform/sellers", token);
      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  describe("GET /platform/sellers", () => {
    it("отдаёт список продавцов с подпиской (или без, если её нет)", async () => {
      const app = buildApp();
      const token = await tokenFor(app, { sellerId: null, isAdmin: true });
      const withSubId = await seedSeller(SELLER_WITH_SUB_TG, "С подпиской", true);
      const noSubId = await seedSeller(SELLER_NO_SUB_TG, "Без подписки", false);

      const res = await req(app, "GET", "/platform/sellers", token);
      expect(res.statusCode).toBe(200);
      const parsed = platformSellerListResponseSchema.parse(JSON.parse(res.body));

      const withSub = parsed.sellers.find((s) => s.id === withSubId);
      expect(withSub?.subscription).toEqual({
        tier: "tier1",
        status: "active",
        paidUntil: expect.any(Date),
      });

      const noSub = parsed.sellers.find((s) => s.id === noSubId);
      expect(noSub?.subscription).toBeNull();
      await app.close();
    });
  });

  describe("PATCH /platform/sellers/:id/status", () => {
    it("блокирует продавца", async () => {
      const app = buildApp();
      const adminToken = await tokenFor(app, { sellerId: null, isAdmin: true });
      const sellerId = await seedSeller(SELLER_WITH_SUB_TG, "Магазин", true);

      const res = await req(
        app,
        "PATCH",
        `/platform/sellers/${sellerId}/status`,
        adminToken,
        { status: "blocked" },
      );
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({
        id: sellerId,
        status: "blocked",
        blockedReason: null,
      });
      await app.close();
    });

    it("сохраняет reason при блокировке", async () => {
      const app = buildApp();
      const adminToken = await tokenFor(app, { sellerId: null, isAdmin: true });
      const sellerId = await seedSeller(SELLER_WITH_SUB_TG, "Магазин", true);

      const res = await req(
        app,
        "PATCH",
        `/platform/sellers/${sellerId}/status`,
        adminToken,
        { status: "blocked", reason: "Жалобы покупателей на невыполненные заказы" },
      );
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({
        id: sellerId,
        status: "blocked",
        blockedReason: "Жалобы покупателей на невыполненные заказы",
      });
      await app.close();
    });

    it("разблокирует продавца и очищает reason", async () => {
      const app = buildApp();
      const adminToken = await tokenFor(app, { sellerId: null, isAdmin: true });
      const sellerId = await seedSeller(SELLER_WITH_SUB_TG, "Магазин", true);
      await req(app, "PATCH", `/platform/sellers/${sellerId}/status`, adminToken, {
        status: "blocked",
        reason: "Причина",
      });

      const res = await req(
        app,
        "PATCH",
        `/platform/sellers/${sellerId}/status`,
        adminToken,
        { status: "active" },
      );
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toMatchObject({
        id: sellerId,
        status: "active",
        blockedReason: null,
      });
      await app.close();
    });

    it("несуществующий продавец → 404", async () => {
      const app = buildApp();
      const adminToken = await tokenFor(app, { sellerId: null, isAdmin: true });
      const res = await req(app, "PATCH", "/platform/sellers/999999/status", adminToken, {
        status: "blocked",
      });
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("некорректный статус в теле → 400", async () => {
      const app = buildApp();
      const adminToken = await tokenFor(app, { sellerId: null, isAdmin: true });
      const sellerId = await seedSeller(SELLER_WITH_SUB_TG, "Магазин", true);
      const res = await req(
        app,
        "PATCH",
        `/platform/sellers/${sellerId}/status`,
        adminToken,
        { status: "not_a_status" },
      );
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("без isAdmin → 403", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(SELLER_WITH_SUB_TG, "Магазин", true);
      const token = await tokenFor(app, { sellerId, isAdmin: false });
      const res = await req(
        app,
        "PATCH",
        `/platform/sellers/${sellerId}/status`,
        token,
        { status: "blocked" },
      );
      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  describe("PATCH /platform/sellers/:id/grace", () => {
    it("без isAdmin → 403", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(SELLER_WITH_SUB_TG, "Магазин", false);
      const token = await tokenFor(app, { sellerId, isAdmin: false });
      const res = await req(
        app,
        "PATCH",
        `/platform/sellers/${sellerId}/grace`,
        token,
        { months: 1 },
      );
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("несуществующий продавец → 404", async () => {
      const app = buildApp();
      const adminToken = await tokenFor(app, { sellerId: null, isAdmin: true });
      const res = await req(
        app,
        "PATCH",
        "/platform/sellers/99999999/grace",
        adminToken,
        { months: 1 },
      );
      expect(res.statusCode).toBe(404);
      await app.close();
    });

    it("months некорректный (0, отрицательный, не число) → 400", async () => {
      const app = buildApp();
      const adminToken = await tokenFor(app, { sellerId: null, isAdmin: true });
      const sellerId = await seedSeller(SELLER_NO_SUB_TG, "Без подписки", false);

      for (const months of [0, -1, "abc"]) {
        const res = await req(
          app,
          "PATCH",
          `/platform/sellers/${sellerId}/grace`,
          adminToken,
          { months },
        );
        expect(res.statusCode).toBe(400);
      }
      await app.close();
    });

    it("без подписки → создаёт подписку Premium, active, paidUntil ~ сейчас + N месяцев", async () => {
      const app = buildApp();
      const adminToken = await tokenFor(app, { sellerId: null, isAdmin: true });
      const sellerId = await seedSeller(SELLER_NO_SUB_TG, "Без подписки", false);

      const res = await req(
        app,
        "PATCH",
        `/platform/sellers/${sellerId}/grace`,
        adminToken,
        { months: 2 },
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.subscription.tier).toBe("tier2");
      expect(body.subscription.status).toBe("active");

      const paidUntil = new Date(body.subscription.paidUntil);
      const expected = new Date();
      expected.setMonth(expected.getMonth() + 2);
      expect(
        Math.abs(paidUntil.getTime() - expected.getTime()),
      ).toBeLessThan(60_000);
      await app.close();
    });

    it("с активной подпиской в будущем → сдвигает paidUntil от текущей даты подписки, не от сейчас, и апгрейдит tier до Premium", async () => {
      const app = buildApp();
      const adminToken = await tokenFor(app, { sellerId: null, isAdmin: true });
      const sellerId = await seedSeller(SELLER_WITH_SUB_TG, "Магазин", true);
      const [before] = await db
        .select({ paidUntil: subscriptions.paidUntil })
        .from(subscriptions)
        .where(inArray(subscriptions.sellerId, [sellerId]));

      const res = await req(
        app,
        "PATCH",
        `/platform/sellers/${sellerId}/grace`,
        adminToken,
        { months: 1 },
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.subscription.tier).toBe("tier2");
      const paidUntil = new Date(body.subscription.paidUntil);
      const expected = new Date(before!.paidUntil!);
      expected.setMonth(expected.getMonth() + 1);
      expect(
        Math.abs(paidUntil.getTime() - expected.getTime()),
      ).toBeLessThan(60_000);
      await app.close();
    });

    it("существующая подписка tier1 (льгота Спринта 21) → grace апгрейдит до tier2, не оставляет Free", async () => {
      const app = buildApp();
      const adminToken = await tokenFor(app, { sellerId: null, isAdmin: true });
      const sellerId = await seedSeller(SELLER_WITH_SUB_TG, "Магазин", false);
      await db.insert(subscriptions).values({
        sellerId,
        tier: "tier1",
        status: "active",
        paidUntil: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      });

      const res = await req(
        app,
        "PATCH",
        `/platform/sellers/${sellerId}/grace`,
        adminToken,
        { months: 1 },
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.subscription.tier).toBe("tier2");
      await app.close();
    });

    it("с истёкшей/просроченной подпиской → отсчёт от сейчас, не от прошлого paidUntil", async () => {
      const app = buildApp();
      const adminToken = await tokenFor(app, { sellerId: null, isAdmin: true });
      const sellerId = await seedSeller(SELLER_WITH_SUB_TG, "Магазин", false);
      const pastPaidUntil = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      await db.insert(subscriptions).values({
        sellerId,
        tier: "tier1",
        status: "suspended",
        paidUntil: pastPaidUntil,
      });

      const res = await req(
        app,
        "PATCH",
        `/platform/sellers/${sellerId}/grace`,
        adminToken,
        { months: 1 },
      );
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.subscription.status).toBe("active");
      expect(body.subscription.tier).toBe("tier2");
      const paidUntil = new Date(body.subscription.paidUntil);
      const expected = new Date();
      expected.setMonth(expected.getMonth() + 1);
      expect(
        Math.abs(paidUntil.getTime() - expected.getTime()),
      ).toBeLessThan(60_000);
      await app.close();
    });
  });
});
