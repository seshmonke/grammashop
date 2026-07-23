import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import {
  buyerOrderListResponseSchema,
  createOrderResponseSchema,
  sellerOrderListResponseSchema,
} from "@grammashop/shared";
import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { orderItems, orders, products, productVariants, sellers } from "../db/schema.js";

// POST /shop/:sellerId/orders — чекаут (см. CONCEPT.md#каталог-и-заказы).
// Списание остатка и создание заказа/позиций в одной транзакции.

const SELLER_TG = 700400001;
const BUYER_TG = 700400002;

async function seedSeller() {
  const [seller] = await db
    .insert(sellers)
    .values({
      telegramId: SELLER_TG,
      telegramUsername: "seller_shop",
      fullName: "ФИО",
      phone: "+70000000000",
      shopName: "Магазин",
      paymentDetails: "Карта 0000 0000 0000 0000",
      status: "active",
    })
    .returning({ id: sellers.id });
  return seller!.id;
}

async function seedProductWithVariant(
  sellerId: number,
  opts: { stock?: number | null; priceKopecks?: number } = {},
) {
  const [product] = await db
    .insert(products)
    .values({ sellerId, name: "Худи" })
    .returning({ id: products.id });
  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: product!.id,
      name: "M",
      priceKopecks: opts.priceKopecks ?? 300000,
      stock: opts.stock === undefined ? 5 : opts.stock,
    })
    .returning({ id: productVariants.id });
  return { productId: product!.id, variantId: variant!.id };
}

async function tokenFor(app: ReturnType<typeof buildApp>): Promise<string> {
  await app.ready();
  return app.jwt.sign({ telegramId: BUYER_TG, telegramUsername: null, sellerId: null, isAdmin: false });
}

async function req(
  app: ReturnType<typeof buildApp>,
  url: string,
  token: string | undefined,
  body: Record<string, unknown>,
) {
  return app.inject({
    method: "POST",
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body,
  });
}

// Функция, не константа: idempotencyKey — UUID одной попытки оформления
// (см. Спринт 31), у каждого теста должен быть свой, если только тест не
// проверяет повтор с тем же ключом намеренно.
function validBuyer() {
  return {
    buyerFullName: "Иван Иванов",
    buyerPhone: "+79990001122",
    buyerAddress: "Москва, ул. Примерная, 1",
    consent: true as const,
    idempotencyKey: randomUUID(),
  };
}

describe("POST /shop/:sellerId/orders", () => {
  beforeEach(async () => {
    // Заказы предыдущего теста ссылаются на seller.id без onDelete cascade
    // (история заказа переживает продавца по замыслу схемы) — их надо снести
    // раньше самих продавцов, иначе delete sellers падает на FK.
    const stale = await db
      .select({ id: sellers.id })
      .from(sellers)
      .where(inArray(sellers.telegramId, [SELLER_TG]));
    if (stale.length) {
      await db.delete(orders).where(
        inArray(
          orders.sellerId,
          stale.map((s) => s.id),
        ),
      );
    }
    await db.delete(sellers).where(inArray(sellers.telegramId, [SELLER_TG]));
  });

  it("без JWT → 401", async () => {
    const app = buildApp();
    const res = await req(app, "/shop/1/orders", undefined, {
      ...validBuyer(),
      items: [{ variantId: 1, quantity: 1 }],
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("создаёт заказ, снапшот позиций и списывает остаток", async () => {
    const app = buildApp();
    const sellerId = await seedSeller();
    const { variantId } = await seedProductWithVariant(sellerId, { stock: 5 });
    const token = await tokenFor(app);

    const res = await req(app, `/shop/${sellerId}/orders`, token, {
      ...validBuyer(),
      items: [{ variantId, quantity: 2 }],
    });

    expect(res.statusCode).toBe(201);
    const body = createOrderResponseSchema.parse(res.json());
    expect(body.status).toBe("new");
    expect(body.totalKopecks).toBe(600000);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.quantity).toBe(2);
    expect(body.seller.telegramUsername).toBe("seller_shop");
    expect(body.seller.paymentDetails).toBe("Карта 0000 0000 0000 0000");

    const [variant] = await db
      .select({ stock: productVariants.stock })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    expect(variant!.stock).toBe(3);

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.sellerId, sellerId));
    expect(order!.buyerTelegramId).toBe(BUYER_TG);
    expect(order!.buyerFullName).toBe("Иван Иванов");
    expect(order!.consentAt).not.toBeNull();

    const items = await db
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order!.id));
    expect(items).toHaveLength(1);
    expect(items[0]!.quantity).toBe(2);
    expect(items[0]!.priceKopecks).toBe(300000);
    await app.close();
  });

  it("повтор с тем же idempotencyKey — тот же заказ, остаток не списывается дважды", async () => {
    const app = buildApp();
    const sellerId = await seedSeller();
    const { variantId } = await seedProductWithVariant(sellerId, { stock: 5 });
    const token = await tokenFor(app);
    const body = { ...validBuyer(), items: [{ variantId, quantity: 2 }] };

    const first = await req(app, `/shop/${sellerId}/orders`, token, body);
    const second = await req(app, `/shop/${sellerId}/orders`, token, body);

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    const firstOrder = createOrderResponseSchema.parse(first.json());
    const secondOrder = createOrderResponseSchema.parse(second.json());
    expect(secondOrder.id).toBe(firstOrder.id);

    const [variant] = await db
      .select({ stock: productVariants.stock })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    expect(variant!.stock).toBe(3);

    const allOrders = await db.select().from(orders).where(eq(orders.sellerId, sellerId));
    expect(allOrders).toHaveLength(1);
    await app.close();
  });

  it("некорректный idempotencyKey (не UUID) → 400", async () => {
    const app = buildApp();
    const sellerId = await seedSeller();
    const { variantId } = await seedProductWithVariant(sellerId, { stock: 5 });
    const token = await tokenFor(app);

    const res = await req(app, `/shop/${sellerId}/orders`, token, {
      ...validBuyer(),
      idempotencyKey: "not-a-uuid",
      items: [{ variantId, quantity: 1 }],
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("остатка не хватает → 400, остаток не меняется", async () => {
    const app = buildApp();
    const sellerId = await seedSeller();
    const { variantId } = await seedProductWithVariant(sellerId, { stock: 1 });
    const token = await tokenFor(app);

    const res = await req(app, `/shop/${sellerId}/orders`, token, {
      ...validBuyer(),
      items: [{ variantId, quantity: 2 }],
    });

    expect(res.statusCode).toBe(400);
    const [variant] = await db
      .select({ stock: productVariants.stock })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    expect(variant!.stock).toBe(1);
    await app.close();
  });

  it("stock=null (учёт выключен) — заказывается без ограничений", async () => {
    const app = buildApp();
    const sellerId = await seedSeller();
    const { variantId } = await seedProductWithVariant(sellerId, { stock: null });
    const token = await tokenFor(app);

    const res = await req(app, `/shop/${sellerId}/orders`, token, {
      ...validBuyer(),
      items: [{ variantId, quantity: 100 }],
    });

    expect(res.statusCode).toBe(201);
    await app.close();
  });

  it("чужой вариант (другого продавца) → 404", async () => {
    const app = buildApp();
    const sellerId = await seedSeller();
    const OTHER_TG = 700400003;
    const [otherSeller] = await db
      .insert(sellers)
      .values({
        telegramId: OTHER_TG,
        telegramUsername: "other",
        fullName: "ФИО",
        phone: "+70000000000",
        shopName: "Другой магазин",
        status: "active",
      })
      .returning({ id: sellers.id });
    const { variantId } = await seedProductWithVariant(otherSeller!.id);
    const token = await tokenFor(app);

    const res = await req(app, `/shop/${sellerId}/orders`, token, {
      ...validBuyer(),
      items: [{ variantId, quantity: 1 }],
    });

    expect(res.statusCode).toBe(404);
    await db.delete(sellers).where(eq(sellers.telegramId, OTHER_TG));
    await app.close();
  });

  it("несуществующий магазин → 404", async () => {
    const app = buildApp();
    const token = await tokenFor(app);

    const res = await req(app, "/shop/999999/orders", token, {
      ...validBuyer(),
      items: [{ variantId: 1, quantity: 1 }],
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("без согласия на обработку ПДн → 400", async () => {
    const app = buildApp();
    const sellerId = await seedSeller();
    const { variantId } = await seedProductWithVariant(sellerId);
    const token = await tokenFor(app);

    const res = await req(app, `/shop/${sellerId}/orders`, token, {
      buyerFullName: "Иван Иванов",
      buyerPhone: "+79990001122",
      buyerAddress: "Москва, ул. Примерная, 1",
      consent: false,
      items: [{ variantId, quantity: 1 }],
      idempotencyKey: randomUUID(),
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("пустая корзина → 400", async () => {
    const app = buildApp();
    const sellerId = await seedSeller();
    const token = await tokenFor(app);

    const res = await req(app, `/shop/${sellerId}/orders`, token, {
      ...validBuyer(),
      items: [],
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});

// GET/PATCH /seller/orders — заказы в продавцовской админке (Спринт 13, см.
// docs/TASKS.md, CONCEPT.md#каталог-и-заказы). Ownership строго по
// sellerId из JWT — тот же паттерн, что и /seller/products (чужой заказ
// просто не попадает в выборку/отдаёт 404, не 403).

const OWNER_TG = 700500001;
const OTHER_TG = 700500002;
const ALL_SELLER_TG = [OWNER_TG, OTHER_TG];

async function seedSellerAdmin(telegramId: number, username: string) {
  const [seller] = await db
    .insert(sellers)
    .values({
      telegramId,
      telegramUsername: username,
      fullName: "ФИО",
      phone: "+70000000000",
      shopName: "Магазин",
      status: "active",
    })
    .returning({ id: sellers.id });
  return seller!.id;
}

async function sellerTokenFor(
  app: ReturnType<typeof buildApp>,
  sellerId: number | null,
): Promise<string> {
  await app.ready();
  return app.jwt.sign({ telegramId: 222, telegramUsername: null, sellerId, isAdmin: false });
}

async function createTestOrder(
  sellerId: number,
  variantId: number,
  opts: { quantity?: number; status?: "new" | "paid" | "fulfilled" | "canceled" } = {},
) {
  const [order] = await db
    .insert(orders)
    .values({
      sellerId,
      buyerTelegramId: 700500099,
      status: opts.status ?? "new",
      buyerFullName: "Пётр Петров",
      buyerPhone: "+79990001122",
      buyerAddress: "Санкт-Петербург, ул. Тестовая, 2",
      buyerComment: null,
      consentAt: new Date(),
      totalKopecks: 300000 * (opts.quantity ?? 1),
    })
    .returning({ id: orders.id });
  await db.insert(orderItems).values({
    orderId: order!.id,
    variantId,
    productNameSnapshot: "Худи",
    variantNameSnapshot: "M",
    priceKopecks: 300000,
    quantity: opts.quantity ?? 1,
  });
  return order!.id;
}

async function methodReq(
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
    payload: body,
  });
}

describe("GET /seller/orders", () => {
  beforeEach(async () => {
    const stale = await db
      .select({ id: sellers.id })
      .from(sellers)
      .where(inArray(sellers.telegramId, ALL_SELLER_TG));
    if (stale.length) {
      await db.delete(orders).where(
        inArray(
          orders.sellerId,
          stale.map((s) => s.id),
        ),
      );
    }
    await db.delete(sellers).where(inArray(sellers.telegramId, ALL_SELLER_TG));
  });

  it("без JWT → 401", async () => {
    const app = buildApp();
    const res = await methodReq(app, "GET", "/seller/orders");
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("JWT без sellerId (покупатель) → 403", async () => {
    const app = buildApp();
    const token = await sellerTokenFor(app, null);
    const res = await methodReq(app, "GET", "/seller/orders", token);
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("отдаёт только свои заказы, новые сверху, с ПДн покупателя и позициями", async () => {
    const app = buildApp();
    const ownerId = await seedSellerAdmin(OWNER_TG, "owner_shop");
    const otherId = await seedSellerAdmin(OTHER_TG, "other_shop");
    const { variantId } = await seedProductWithVariant(ownerId);
    const { variantId: otherVariantId } = await seedProductWithVariant(otherId);

    const firstOrderId = await createTestOrder(ownerId, variantId);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const secondOrderId = await createTestOrder(ownerId, variantId, { quantity: 2 });
    await createTestOrder(otherId, otherVariantId);

    const token = await sellerTokenFor(app, ownerId);
    const res = await methodReq(app, "GET", "/seller/orders", token);

    expect(res.statusCode).toBe(200);
    const body = sellerOrderListResponseSchema.parse(res.json());
    expect(body.orders.map((o) => o.id)).toEqual([secondOrderId, firstOrderId]);
    expect(body.orders[0]!.buyerFullName).toBe("Пётр Петров");
    expect(body.orders[0]!.buyerPhone).toBe("+79990001122");
    expect(body.orders[0]!.items).toHaveLength(1);
    expect(body.orders[0]!.items[0]!.quantity).toBe(2);
    await app.close();
  });
});

// GET /orders/mine — «мои заказы» покупателя (Спринт 34, см.
// CONCEPT.md#каталог-и-заказы). Сквозной список по всем магазинам платформы:
// фильтр по buyerTelegramId, а не sellerId, в отличие от /seller/orders.

const MINE_BUYER_TG = 700600001;
const MINE_OTHER_BUYER_TG = 700600002;
const MINE_SELLER_A_TG = 700600003;
const MINE_SELLER_B_TG = 700600004;
const ALL_MINE_SELLER_TG = [MINE_SELLER_A_TG, MINE_SELLER_B_TG];

async function mineTokenFor(app: ReturnType<typeof buildApp>, telegramId: number): Promise<string> {
  await app.ready();
  return app.jwt.sign({ telegramId, telegramUsername: null, sellerId: null, isAdmin: false });
}

async function createOrderFor(
  sellerId: number,
  buyerTelegramId: number,
  variantId: number,
): Promise<number> {
  const [order] = await db
    .insert(orders)
    .values({
      sellerId,
      buyerTelegramId,
      status: "new",
      buyerFullName: "Покупатель",
      buyerPhone: "+79990001122",
      buyerAddress: "Москва, ул. Тестовая, 1",
      buyerComment: null,
      consentAt: new Date(),
      totalKopecks: 300000,
    })
    .returning({ id: orders.id });
  await db.insert(orderItems).values({
    orderId: order!.id,
    variantId,
    productNameSnapshot: "Худи",
    variantNameSnapshot: "M",
    priceKopecks: 300000,
    quantity: 1,
  });
  return order!.id;
}

describe("GET /orders/mine", () => {
  beforeEach(async () => {
    const stale = await db
      .select({ id: sellers.id })
      .from(sellers)
      .where(inArray(sellers.telegramId, ALL_MINE_SELLER_TG));
    if (stale.length) {
      await db.delete(orders).where(
        inArray(
          orders.sellerId,
          stale.map((s) => s.id),
        ),
      );
    }
    await db.delete(sellers).where(inArray(sellers.telegramId, ALL_MINE_SELLER_TG));
  });

  it("без JWT → 401", async () => {
    const app = buildApp();
    const res = await methodReq(app, "GET", "/orders/mine");
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("отдаёт заказы покупателя по всем магазинам, новые сверху, чужие заказы не попадают", async () => {
    const app = buildApp();
    const sellerAId = await seedSellerAdmin(MINE_SELLER_A_TG, "shop_a");
    const sellerBId = await seedSellerAdmin(MINE_SELLER_B_TG, "shop_b");
    const { variantId: variantA } = await seedProductWithVariant(sellerAId);
    const { variantId: variantB } = await seedProductWithVariant(sellerBId);

    const orderAId = await createOrderFor(sellerAId, MINE_BUYER_TG, variantA);
    await new Promise((resolve) => setTimeout(resolve, 5));
    const orderBId = await createOrderFor(sellerBId, MINE_BUYER_TG, variantB);
    await createOrderFor(sellerAId, MINE_OTHER_BUYER_TG, variantA);

    const token = await mineTokenFor(app, MINE_BUYER_TG);
    const res = await methodReq(app, "GET", "/orders/mine", token);

    expect(res.statusCode).toBe(200);
    const body = buyerOrderListResponseSchema.parse(res.json());
    expect(body.orders.map((o) => o.id)).toEqual([orderBId, orderAId]);
    expect(body.orders[0]!.shopName).toBe("Магазин");
    expect(body.orders[0]!.sellerId).toBe(sellerBId);
    expect(body.orders[1]!.sellerId).toBe(sellerAId);
    expect(body.orders[0]!.items).toHaveLength(1);
    await app.close();
  });
});

describe("PATCH /seller/orders/:id/status", () => {
  beforeEach(async () => {
    const stale = await db
      .select({ id: sellers.id })
      .from(sellers)
      .where(inArray(sellers.telegramId, ALL_SELLER_TG));
    if (stale.length) {
      await db.delete(orders).where(
        inArray(
          orders.sellerId,
          stale.map((s) => s.id),
        ),
      );
    }
    await db.delete(sellers).where(inArray(sellers.telegramId, ALL_SELLER_TG));
  });

  it("без JWT → 401", async () => {
    const app = buildApp();
    const res = await methodReq(app, "PATCH", "/seller/orders/1/status", undefined, {
      status: "paid",
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("новый → оплачен: разрешено", async () => {
    const app = buildApp();
    const ownerId = await seedSellerAdmin(OWNER_TG, "owner_shop");
    const { variantId } = await seedProductWithVariant(ownerId);
    const orderId = await createTestOrder(ownerId, variantId);
    const token = await sellerTokenFor(app, ownerId);

    const res = await methodReq(app, "PATCH", `/seller/orders/${orderId}/status`, token, {
      status: "paid",
    });

    expect(res.statusCode).toBe(200);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("paid");
    await app.close();
  });

  it("новый → выполнен напрямую: запрещено (400)", async () => {
    const app = buildApp();
    const ownerId = await seedSellerAdmin(OWNER_TG, "owner_shop");
    const { variantId } = await seedProductWithVariant(ownerId);
    const orderId = await createTestOrder(ownerId, variantId);
    const token = await sellerTokenFor(app, ownerId);

    const res = await methodReq(app, "PATCH", `/seller/orders/${orderId}/status`, token, {
      status: "fulfilled",
    });

    expect(res.statusCode).toBe(400);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("new");
    await app.close();
  });

  it("выполнен → отменён: запрещено (400) — отмена невозможна после выполнения", async () => {
    const app = buildApp();
    const ownerId = await seedSellerAdmin(OWNER_TG, "owner_shop");
    const { variantId } = await seedProductWithVariant(ownerId);
    const orderId = await createTestOrder(ownerId, variantId, { status: "fulfilled" });
    const token = await sellerTokenFor(app, ownerId);

    const res = await methodReq(app, "PATCH", `/seller/orders/${orderId}/status`, token, {
      status: "canceled",
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("отменён → куда угодно: запрещено (400) — терминальный статус без отката", async () => {
    const app = buildApp();
    const ownerId = await seedSellerAdmin(OWNER_TG, "owner_shop");
    const { variantId } = await seedProductWithVariant(ownerId);
    const orderId = await createTestOrder(ownerId, variantId, { status: "canceled" });
    const token = await sellerTokenFor(app, ownerId);

    const res = await methodReq(app, "PATCH", `/seller/orders/${orderId}/status`, token, {
      status: "new",
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("оплачен → новый (отмена оплаты): разрешено", async () => {
    const app = buildApp();
    const ownerId = await seedSellerAdmin(OWNER_TG, "owner_shop");
    const { variantId } = await seedProductWithVariant(ownerId);
    const orderId = await createTestOrder(ownerId, variantId, { status: "paid" });
    const token = await sellerTokenFor(app, ownerId);

    const res = await methodReq(app, "PATCH", `/seller/orders/${orderId}/status`, token, {
      status: "new",
    });

    expect(res.statusCode).toBe(200);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("new");
    await app.close();
  });

  it("выполнен → оплачен (снять отметку о выполнении): разрешено", async () => {
    const app = buildApp();
    const ownerId = await seedSellerAdmin(OWNER_TG, "owner_shop");
    const { variantId } = await seedProductWithVariant(ownerId);
    const orderId = await createTestOrder(ownerId, variantId, { status: "fulfilled" });
    const token = await sellerTokenFor(app, ownerId);

    const res = await methodReq(app, "PATCH", `/seller/orders/${orderId}/status`, token, {
      status: "paid",
    });

    expect(res.statusCode).toBe(200);
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.status).toBe("paid");
    await app.close();
  });

  it("отмена возвращает остаток варианта", async () => {
    const app = buildApp();
    const ownerId = await seedSellerAdmin(OWNER_TG, "owner_shop");
    const { variantId } = await seedProductWithVariant(ownerId, { stock: 5 });
    await db
      .update(productVariants)
      .set({ stock: 3 })
      .where(eq(productVariants.id, variantId));
    const orderId = await createTestOrder(ownerId, variantId, { quantity: 2 });
    const token = await sellerTokenFor(app, ownerId);

    const res = await methodReq(app, "PATCH", `/seller/orders/${orderId}/status`, token, {
      status: "canceled",
    });

    expect(res.statusCode).toBe(200);
    const [variant] = await db
      .select({ stock: productVariants.stock })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    expect(variant!.stock).toBe(5);
    await app.close();
  });

  it("чужой заказ (другого продавца) → 404", async () => {
    const app = buildApp();
    const ownerId = await seedSellerAdmin(OWNER_TG, "owner_shop");
    const otherId = await seedSellerAdmin(OTHER_TG, "other_shop");
    const { variantId } = await seedProductWithVariant(otherId);
    const orderId = await createTestOrder(otherId, variantId);
    const token = await sellerTokenFor(app, ownerId);

    const res = await methodReq(app, "PATCH", `/seller/orders/${orderId}/status`, token, {
      status: "paid",
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("несуществующий заказ → 404", async () => {
    const app = buildApp();
    const ownerId = await seedSellerAdmin(OWNER_TG, "owner_shop");
    const token = await sellerTokenFor(app, ownerId);

    const res = await methodReq(app, "PATCH", "/seller/orders/999999/status", token, {
      status: "paid",
    });

    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
