import { beforeEach, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { shopCatalogResponseSchema, type SubscriptionStatus } from "@grammashop/shared";
import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { products, productVariants, sellers, subscriptions } from "../db/schema.js";

// GET /shop/:sellerId — публичная витрина. Требует валидный JWT (любая
// роль), отдаёт активного продавца и его активные товары без ПДн продавца.
// Видимость витрины дополнительно требует подписку в статусе active/grace
// (см. CONCEPT.md#оплата-подписки-продавцом, Спринт 21) — без подписки
// (регистрация без оплаты) и после suspended/canceled витрина скрыта тем
// же 404, что и у blocked-продавца, причина не раскрывается.

const ACTIVE_TG = 700200001;
const BLOCKED_TG = 700200002;
const ALL_TG = [ACTIVE_TG, BLOCKED_TG];

async function tokenFor(app: ReturnType<typeof buildApp>): Promise<string> {
  // app.jwt появляется только после готовности плагинов (register async).
  await app.ready();
  return app.jwt.sign({ telegramId: 111, telegramUsername: null, sellerId: null, isAdmin: false });
}

function get(app: ReturnType<typeof buildApp>, path: string, token?: string) {
  return app.inject({
    method: "GET",
    url: path,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

async function seedActiveShop(
  subscriptionStatus: SubscriptionStatus | null = "active",
): Promise<number> {
  const [seller] = await db
    .insert(sellers)
    .values({
      telegramId: ACTIVE_TG,
      telegramUsername: "shop_test_seller",
      fullName: "Секретное ФИО Продавца",
      phone: "+79990001122",
      shopName: "Тест-магазин",
      shopDescription: "Описание витрины",
      paymentDetails: "Перевод на секретную карту 0000",
      status: "active",
    })
    .returning({ id: sellers.id });
  const sellerId = seller!.id;

  if (subscriptionStatus) {
    await db.insert(subscriptions).values({
      sellerId,
      tier: "tier1",
      status: subscriptionStatus,
      paidUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
  }

  // Активный товар (два варианта: скидка и нет-в-наличии), плюс скрытый —
  // он не должен попасть на витрину. sortPosition вперемешку.
  const [visible] = await db
    .insert(products)
    .values({
      sellerId,
      name: "Видимый товар",
      description: "Описание товара",
      sortPosition: 1,
      status: "active",
    })
    .returning({ id: products.id });
  await db.insert(products).values({
    sellerId,
    name: "Скрытый товар",
    sortPosition: 0,
    status: "hidden",
  });

  await db.insert(productVariants).values([
    {
      productId: visible!.id,
      name: "Второй вариант",
      priceKopecks: 50000,
      sortPosition: 1,
      stock: 0,
    },
    {
      productId: visible!.id,
      name: "Первый вариант",
      priceKopecks: 40000,
      oldPriceKopecks: 60000,
      sortPosition: 0,
      stock: null,
    },
  ]);

  return sellerId;
}

describe("GET /shop/:sellerId", () => {
  beforeEach(async () => {
    await db.delete(sellers).where(inArray(sellers.telegramId, ALL_TG));
  });

  it("без JWT → 401", async () => {
    const app = buildApp();
    const sellerId = await seedActiveShop();
    const res = await get(app, `/shop/${sellerId}`);
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("нечисловой sellerId → 400", async () => {
    const app = buildApp();
    const res = await get(app, "/shop/abc", await tokenFor(app));
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("несуществующий продавец → 404", async () => {
    const app = buildApp();
    const res = await get(app, "/shop/99999999", await tokenFor(app));
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("заблокированный продавец → 404 (витрина скрыта)", async () => {
    const app = buildApp();
    const [blocked] = await db
      .insert(sellers)
      .values({
        telegramId: BLOCKED_TG,
        telegramUsername: "blocked_shop",
        fullName: "ФИО",
        phone: "+70000000000",
        shopName: "Заблокированный",
        status: "blocked",
      })
      .returning({ id: sellers.id });

    const res = await get(app, `/shop/${blocked!.id}`, await tokenFor(app));
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("активный продавец → 200: каталог по контракту, только активные товары", async () => {
    const app = buildApp();
    const sellerId = await seedActiveShop();

    const res = await get(app, `/shop/${sellerId}`, await tokenFor(app));
    expect(res.statusCode).toBe(200);

    const body = shopCatalogResponseSchema.parse(res.json());
    expect(body.sellerId).toBe(sellerId);
    expect(body.shopName).toBe("Тест-магазин");
    expect(body.telegramUsername).toBe("shop_test_seller");

    // Скрытый товар не попал.
    expect(body.products).toHaveLength(1);
    const product = body.products[0]!;
    expect(product.name).toBe("Видимый товар");

    // Варианты отсортированы по sortPosition (первый — со скидкой).
    expect(product.variants.map((v) => v.name)).toEqual([
      "Первый вариант",
      "Второй вариант",
    ]);
    expect(product.variants[0]!.oldPriceKopecks).toBe(60000);
    expect(product.variants[0]!.stock).toBeNull();
    expect(product.variants[1]!.stock).toBe(0);
  });

  it("без подписки (регистрация без оплаты) → 404 (витрина скрыта)", async () => {
    const app = buildApp();
    const sellerId = await seedActiveShop(null);

    const res = await get(app, `/shop/${sellerId}`, await tokenFor(app));
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("подписка в статусе grace → 200 (витрина видима)", async () => {
    const app = buildApp();
    const sellerId = await seedActiveShop("grace");

    const res = await get(app, `/shop/${sellerId}`, await tokenFor(app));
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it("подписка suspended → 404 (витрина скрыта)", async () => {
    const app = buildApp();
    const sellerId = await seedActiveShop("suspended");

    const res = await get(app, `/shop/${sellerId}`, await tokenFor(app));
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("подписка canceled → 404 (витрина скрыта)", async () => {
    const app = buildApp();
    const sellerId = await seedActiveShop("canceled");

    const res = await get(app, `/shop/${sellerId}`, await tokenFor(app));
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("не отдаёт ПДн продавца (ФИО/телефон/реквизиты) в теле", async () => {
    const app = buildApp();
    const sellerId = await seedActiveShop();

    const res = await get(app, `/shop/${sellerId}`, await tokenFor(app));
    const raw = res.body;
    expect(raw).not.toContain("Секретное ФИО");
    expect(raw).not.toContain("+79990001122");
    expect(raw).not.toContain("секретную карту");
    await app.close();
  });
});
