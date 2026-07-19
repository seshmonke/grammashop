import { beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { createOrderResponseSchema } from "@grammashop/shared";
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
  return app.jwt.sign({ telegramId: BUYER_TG, sellerId: null, isAdmin: false });
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

const validBuyer = {
  buyerFullName: "Иван Иванов",
  buyerPhone: "+79990001122",
  buyerAddress: "Москва, ул. Примерная, 1",
  consent: true as const,
};

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
      ...validBuyer,
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
      ...validBuyer,
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

  it("остатка не хватает → 400, остаток не меняется", async () => {
    const app = buildApp();
    const sellerId = await seedSeller();
    const { variantId } = await seedProductWithVariant(sellerId, { stock: 1 });
    const token = await tokenFor(app);

    const res = await req(app, `/shop/${sellerId}/orders`, token, {
      ...validBuyer,
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
      ...validBuyer,
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
      ...validBuyer,
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
      ...validBuyer,
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
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("пустая корзина → 400", async () => {
    const app = buildApp();
    const sellerId = await seedSeller();
    const token = await tokenFor(app);

    const res = await req(app, `/shop/${sellerId}/orders`, token, {
      ...validBuyer,
      items: [],
    });

    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
