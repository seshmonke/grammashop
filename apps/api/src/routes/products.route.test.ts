import { beforeEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { sellerProductListResponseSchema } from "@grammashop/shared";
import { buildApp } from "../app.js";
import { db } from "../db/client.js";
import { products, productVariants, sellers, subscriptions } from "../db/schema.js";

// /seller/products — продавцовская админка товаров (CRUD карточек +
// вариантов). Требует JWT с sellerId (продавец), не просто валидный JWT —
// в отличие от /shop/:sellerId (см. shop.route.test.ts).

const OWNER_TG = 700300001;
const OTHER_TG = 700300002;
const ALL_TG = [OWNER_TG, OTHER_TG];

async function seedSeller(telegramId: number, username: string) {
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
  method: "GET" | "POST" | "PATCH" | "DELETE",
  url: string,
  token?: string,
  body?: Record<string, unknown> | unknown[],
) {
  return app.inject({
    method,
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body ?? {},
  });
}

const oneVariant = [{ name: "Стандарт", priceKopecks: 10000 }];

describe("/seller/products", () => {
  beforeEach(async () => {
    await db.delete(sellers).where(inArray(sellers.telegramId, ALL_TG));
  });

  describe("доступ", () => {
    it("без JWT → 401", async () => {
      const app = buildApp();
      const res = await req(app, "GET", "/seller/products");
      expect(res.statusCode).toBe(401);
      await app.close();
    });

    it("JWT без sellerId (покупатель) → 403", async () => {
      const app = buildApp();
      const token = await tokenFor(app, { sellerId: null });
      const res = await req(app, "GET", "/seller/products", token);
      expect(res.statusCode).toBe(403);
      await app.close();
    });

    it("продавца заблокировали после выдачи токена → 403 (не 200 до истечения TTL)", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const token = await tokenFor(app, { sellerId });
      await db.update(sellers).set({ status: "blocked" }).where(eq(sellers.id, sellerId));

      const res = await req(app, "GET", "/seller/products", token);
      expect(res.statusCode).toBe(403);
      await app.close();
    });
  });

  describe("POST /seller/products", () => {
    it("создаёт карточку с вариантами", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const token = await tokenFor(app, { sellerId });

      const res = await req(app, "POST", "/seller/products", token, {
        name: "Худи",
        description: "Тёплое",
        variants: [
          { name: "S", priceKopecks: 300000, stock: 5 },
          { name: "M", priceKopecks: 300000, oldPriceKopecks: 350000 },
        ],
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.name).toBe("Худи");
      // Новая карточка рождается черновиком (Спринт 42, см.
      // CONCEPT.md#жизненный-цикл-сущностей) — не протекает на витрину до
      // явной публикации.
      expect(body.status).toBe("hidden");
      expect(body.variants).toHaveLength(2);
      expect(body.variants[0].stock).toBe(5);
      expect(body.variants[1].oldPriceKopecks).toBe(350000);
      await app.close();
    });

    it("без вариантов → 400", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const token = await tokenFor(app, { sellerId });

      const res = await req(app, "POST", "/seller/products", token, {
        name: "Худи",
        variants: [],
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("больше 10 вариантов → 400", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const token = await tokenFor(app, { sellerId });

      const res = await req(app, "POST", "/seller/products", token, {
        name: "Худи",
        variants: Array.from({ length: 11 }, (_, i) => ({
          name: `V${i}`,
          priceKopecks: 1000,
        })),
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("31-я карточка продавца без подписки → 400 (Free-лимит 30 по умолчанию)", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const token = await tokenFor(app, { sellerId });

      for (let i = 0; i < 30; i++) {
        await db.insert(products).values({ sellerId, name: `Товар ${i}` });
      }

      const res = await req(app, "POST", "/seller/products", token, {
        name: "Тридцать первый",
        variants: oneVariant,
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  describe("лимит карточек по тарифу (Спринт 22)", () => {
    it("31-я карточка на tier1 (Free, явная подписка) → 400", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      await db
        .insert(subscriptions)
        .values({ sellerId, tier: "tier1", status: "active" });
      const token = await tokenFor(app, { sellerId });

      for (let i = 0; i < 30; i++) {
        await db.insert(products).values({ sellerId, name: `Товар ${i}` });
      }

      const res = await req(app, "POST", "/seller/products", token, {
        name: "Тридцать первый",
        variants: oneVariant,
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("31-я карточка на tier2 (Premium) → создаётся, Free-лимит не применяется", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      await db
        .insert(subscriptions)
        .values({ sellerId, tier: "tier2", status: "active" });
      const token = await tokenFor(app, { sellerId });

      for (let i = 0; i < 30; i++) {
        await db.insert(products).values({ sellerId, name: `Товар ${i}` });
      }

      const res = await req(app, "POST", "/seller/products", token, {
        name: "Тридцать первый",
        variants: oneVariant,
      });
      expect(res.statusCode).toBe(201);
      await app.close();
    });

    it("3001-я карточка на tier2 (Premium) → 400 (лимит 3000)", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      await db
        .insert(subscriptions)
        .values({ sellerId, tier: "tier2", status: "active" });
      const token = await tokenFor(app, { sellerId });

      await db
        .insert(products)
        .values(
          Array.from({ length: 3000 }, (_, i) => ({ sellerId, name: `Товар ${i}` })),
        );

      const res = await req(app, "POST", "/seller/products", token, {
        name: "Три тысячи первый",
        variants: oneVariant,
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    // Тест-замок (Спринт 42): лимит считает и active, и hidden — иначе он
    // обходится массой скрытых черновиков (см.
    // CONCEPT.md#жизненный-цикл-сущностей). Будущий фильтр по статусу в
    // подсчёте не должен сломать это правило.
    it("лимит считает active + hidden вместе: 15 active + 15 hidden, 31-я → 400", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const token = await tokenFor(app, { sellerId });

      await db.insert(products).values([
        ...Array.from({ length: 15 }, (_, i) => ({
          sellerId,
          name: `Active ${i}`,
          status: "active" as const,
        })),
        ...Array.from({ length: 15 }, (_, i) => ({
          sellerId,
          name: `Hidden ${i}`,
          status: "hidden" as const,
        })),
      ]);

      const res = await req(app, "POST", "/seller/products", token, {
        name: "Тридцать первый",
        variants: oneVariant,
      });
      expect(res.statusCode).toBe(400);
      await app.close();
    });
  });

  // Публикация/снятие карточки (Спринт 42, см.
  // CONCEPT.md#жизненный-цикл-сущностей).
  describe("PATCH /seller/products/:id/status", () => {
    it("публикация черновика (hidden → active) → 200, статус active", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const [product] = await db
        .insert(products)
        .values({ sellerId, name: "Черновик", status: "hidden" })
        .returning({ id: products.id });
      await db
        .insert(productVariants)
        .values({ productId: product!.id, name: "V", priceKopecks: 1000 });
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "PATCH",
        `/seller/products/${product!.id}/status`,
        token,
        { status: "active" },
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("active");
      await app.close();
    });

    it("снятие с витрины (active → hidden) → 200, статус hidden", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const [product] = await db
        .insert(products)
        .values({ sellerId, name: "На витрине", status: "active" })
        .returning({ id: products.id });
      await db
        .insert(productVariants)
        .values({ productId: product!.id, name: "V", priceKopecks: 1000 });
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "PATCH",
        `/seller/products/${product!.id}/status`,
        token,
        { status: "hidden" },
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("hidden");
      await app.close();
    });

    it("публикация карточки без вариантов → 400", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const [product] = await db
        .insert(products)
        .values({ sellerId, name: "Пустой черновик", status: "hidden" })
        .returning({ id: products.id });
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "PATCH",
        `/seller/products/${product!.id}/status`,
        token,
        { status: "active" },
      );
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("чужая карточка → 404", async () => {
      const app = buildApp();
      const ownerId = await seedSeller(OWNER_TG, "owner");
      const otherId = await seedSeller(OTHER_TG, "other");
      const [product] = await db
        .insert(products)
        .values({ sellerId: otherId, name: "Чужой", status: "active" })
        .returning({ id: products.id });
      const token = await tokenFor(app, { sellerId: ownerId });

      const res = await req(
        app,
        "PATCH",
        `/seller/products/${product!.id}/status`,
        token,
        { status: "hidden" },
      );
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  // Массовая публикация черновиков (Спринт 42) — закрывает онбординг после
  // импорта (см. CONCEPT.md#жизненный-цикл-сущностей).
  describe("POST /seller/products/publish-all", () => {
    it("публикует только hidden-карточки с ≥1 вариантом", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");

      // Два черновика с вариантами, один черновик без вариантов, одна уже
      // active — ожидаем publishedCount === 2, пустой черновик остаётся hidden.
      const [draftA] = await db
        .insert(products)
        .values({ sellerId, name: "Черновик A", status: "hidden" })
        .returning({ id: products.id });
      const [draftB] = await db
        .insert(products)
        .values({ sellerId, name: "Черновик B", status: "hidden" })
        .returning({ id: products.id });
      const [emptyDraft] = await db
        .insert(products)
        .values({ sellerId, name: "Пустой черновик", status: "hidden" })
        .returning({ id: products.id });
      await db
        .insert(products)
        .values({ sellerId, name: "Уже на витрине", status: "active" });
      await db.insert(productVariants).values([
        { productId: draftA!.id, name: "V", priceKopecks: 1000 },
        { productId: draftB!.id, name: "V", priceKopecks: 1000 },
      ]);
      const token = await tokenFor(app, { sellerId });

      const res = await req(app, "POST", "/seller/products/publish-all", token);
      expect(res.statusCode).toBe(200);
      expect(res.json().publishedCount).toBe(2);

      // Пустой черновик не опубликован (нарушил бы инвариант active ⇒ вариант).
      const [empty] = await db
        .select({ status: products.status })
        .from(products)
        .where(eq(products.id, emptyDraft!.id));
      expect(empty!.status).toBe("hidden");
      await app.close();
    });

    it("нет черновиков → publishedCount 0", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const token = await tokenFor(app, { sellerId });

      const res = await req(app, "POST", "/seller/products/publish-all", token);
      expect(res.statusCode).toBe(200);
      expect(res.json().publishedCount).toBe(0);
      await app.close();
    });
  });

  describe("GET /seller/products", () => {
    it("отдаёт только свои товары", async () => {
      const app = buildApp();
      const ownerId = await seedSeller(OWNER_TG, "owner");
      const otherId = await seedSeller(OTHER_TG, "other");
      await db.insert(products).values({ sellerId: ownerId, name: "Моё" });
      await db.insert(products).values({ sellerId: otherId, name: "Чужое" });
      const token = await tokenFor(app, { sellerId: ownerId });

      const res = await req(app, "GET", "/seller/products", token);
      expect(res.statusCode).toBe(200);
      const body = sellerProductListResponseSchema.parse(res.json());
      expect(body.products).toHaveLength(1);
      expect(body.products[0]!.name).toBe("Моё");
      await app.close();
    });
  });

  describe("PATCH /seller/products/:id", () => {
    it("обновляет название/описание своей карточки", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const [product] = await db
        .insert(products)
        .values({ sellerId, name: "Старое" })
        .returning({ id: products.id });
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "PATCH",
        `/seller/products/${product!.id}`,
        token,
        { name: "Новое" },
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe("Новое");
      await app.close();
    });

    it("чужая карточка → 404", async () => {
      const app = buildApp();
      const ownerId = await seedSeller(OWNER_TG, "owner");
      const otherId = await seedSeller(OTHER_TG, "other");
      const [product] = await db
        .insert(products)
        .values({ sellerId: otherId, name: "Чужое" })
        .returning({ id: products.id });
      const token = await tokenFor(app, { sellerId: ownerId });

      const res = await req(
        app,
        "PATCH",
        `/seller/products/${product!.id}`,
        token,
        { name: "Новое" },
      );
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("DELETE /seller/products/:id", () => {
    it("удаляет карточку и её варианты (cascade)", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const [product] = await db
        .insert(products)
        .values({ sellerId, name: "Удалить" })
        .returning({ id: products.id });
      await db
        .insert(productVariants)
        .values({ productId: product!.id, name: "V", priceKopecks: 1000 });
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "DELETE",
        `/seller/products/${product!.id}`,
        token,
      );
      expect(res.statusCode).toBe(204);

      const [found] = await db
        .select()
        .from(products)
        .where(eq(products.id, product!.id));
      expect(found).toBeUndefined();
      const remainingVariants = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.productId, product!.id));
      expect(remainingVariants).toHaveLength(0);
      await app.close();
    });

    it("чужая карточка → 404", async () => {
      const app = buildApp();
      const ownerId = await seedSeller(OWNER_TG, "owner");
      const otherId = await seedSeller(OTHER_TG, "other");
      const [product] = await db
        .insert(products)
        .values({ sellerId: otherId, name: "Чужое" })
        .returning({ id: products.id });
      const token = await tokenFor(app, { sellerId: ownerId });

      const res = await req(
        app,
        "DELETE",
        `/seller/products/${product!.id}`,
        token,
      );
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });

  describe("варианты", () => {
    // Сидим карточку сразу active («на витрине») — эти тесты про инвариант
    // active-карточки (last-variant guard и т.п.); дефолт в БД теперь hidden
    // (Спринт 42), поэтому статус задаём явно.
    async function seedProductWithVariant(sellerId: number) {
      const [product] = await db
        .insert(products)
        .values({ sellerId, name: "Товар", status: "active" })
        .returning({ id: products.id });
      const [variant] = await db
        .insert(productVariants)
        .values({
          productId: product!.id,
          name: "Единственный",
          priceKopecks: 1000,
        })
        .returning({ id: productVariants.id });
      return { productId: product!.id, variantId: variant!.id };
    }

    it("POST добавляет вариант", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const { productId } = await seedProductWithVariant(sellerId);
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "POST",
        `/seller/products/${productId}/variants`,
        token,
        { name: "Второй", priceKopecks: 2000 },
      );
      expect(res.statusCode).toBe(201);
      expect(res.json().name).toBe("Второй");
      await app.close();
    });

    it("11-й вариант → 400 (лимит 10)", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const { productId } = await seedProductWithVariant(sellerId);
      for (let i = 0; i < 9; i++) {
        await db
          .insert(productVariants)
          .values({ productId, name: `V${i}`, priceKopecks: 1000 });
      }
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "POST",
        `/seller/products/${productId}/variants`,
        token,
        { name: "Одиннадцатый", priceKopecks: 1000 },
      );
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("PATCH обновляет цену/остаток варианта", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const { productId, variantId } = await seedProductWithVariant(sellerId);
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "PATCH",
        `/seller/products/${productId}/variants/${variantId}`,
        token,
        { priceKopecks: 5000, stock: 3 },
      );
      expect(res.statusCode).toBe(200);
      expect(res.json().priceKopecks).toBe(5000);
      expect(res.json().stock).toBe(3);
      await app.close();
    });

    it("POST: базовая цена ниже цены со скидкой → 400", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const { productId } = await seedProductWithVariant(sellerId);
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "POST",
        `/seller/products/${productId}/variants`,
        token,
        { name: "Со скидкой наоборот", priceKopecks: 2000, oldPriceKopecks: 1500 },
      );
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("PATCH: оба поля сразу, базовая цена ниже цены со скидкой → 400", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const { productId, variantId } = await seedProductWithVariant(sellerId);
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "PATCH",
        `/seller/products/${productId}/variants/${variantId}`,
        token,
        { priceKopecks: 2000, oldPriceKopecks: 1500 },
      );
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("PATCH: поднять цену со скидкой выше уже сохранённой базовой цены → 400", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const { productId, variantId } = await seedProductWithVariant(sellerId);
      // Текущий вариант: priceKopecks 1000, базовой цены нет — сперва задаём
      // базовую 1200 отдельным PATCH (валидно: 1200 >= 1000).
      const token = await tokenFor(app, { sellerId });
      const withBase = await req(
        app,
        "PATCH",
        `/seller/products/${productId}/variants/${variantId}`,
        token,
        { oldPriceKopecks: 1200 },
      );
      expect(withBase.statusCode).toBe(200);

      // Теперь поднимаем только цену со скидкой выше сохранённой базовой —
      // домердж в сервисе должен поймать это по текущему значению из БД.
      const res = await req(
        app,
        "PATCH",
        `/seller/products/${productId}/variants/${variantId}`,
        token,
        { priceKopecks: 1500 },
      );
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("PATCH: снизить базовую цену ниже уже сохранённой цены со скидкой → 400", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const { productId, variantId } = await seedProductWithVariant(sellerId);
      const token = await tokenFor(app, { sellerId });
      // Текущий вариант: priceKopecks 1000, без базовой — снижаем базовую
      // до значения ниже 1000 отдельным PATCH.
      const res = await req(
        app,
        "PATCH",
        `/seller/products/${productId}/variants/${variantId}`,
        token,
        { oldPriceKopecks: 500 },
      );
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    it("DELETE последнего варианта active-карточки → 400", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const { productId, variantId } = await seedProductWithVariant(sellerId);
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "DELETE",
        `/seller/products/${productId}/variants/${variantId}`,
        token,
      );
      expect(res.statusCode).toBe(400);
      await app.close();
    });

    // Инвариант «active ⇒ есть вариант» держится только на active; у
    // черновика (hidden) удаление последнего варианта разрешено — продавец
    // доводит карточку до ума (см. CONCEPT.md#жизненный-цикл-сущностей).
    it("DELETE последнего варианта hidden-карточки → 204", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const [product] = await db
        .insert(products)
        .values({ sellerId, name: "Черновик", status: "hidden" })
        .returning({ id: products.id });
      const [variant] = await db
        .insert(productVariants)
        .values({ productId: product!.id, name: "Единственный", priceKopecks: 1000 })
        .returning({ id: productVariants.id });
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "DELETE",
        `/seller/products/${product!.id}/variants/${variant!.id}`,
        token,
      );
      expect(res.statusCode).toBe(204);
      await app.close();
    });

    it("DELETE варианта при наличии другого → 204", async () => {
      const app = buildApp();
      const sellerId = await seedSeller(OWNER_TG, "owner");
      const { productId, variantId } = await seedProductWithVariant(sellerId);
      const [second] = await db
        .insert(productVariants)
        .values({ productId, name: "Второй", priceKopecks: 2000 })
        .returning({ id: productVariants.id });
      const token = await tokenFor(app, { sellerId });

      const res = await req(
        app,
        "DELETE",
        `/seller/products/${productId}/variants/${variantId}`,
        token,
      );
      expect(res.statusCode).toBe(204);
      void second;
      await app.close();
    });

    it("чужой продукт → 404 на добавлении варианта", async () => {
      const app = buildApp();
      const ownerId = await seedSeller(OWNER_TG, "owner");
      const otherId = await seedSeller(OTHER_TG, "other");
      const { productId } = await seedProductWithVariant(otherId);
      const token = await tokenFor(app, { sellerId: ownerId });

      const res = await req(
        app,
        "POST",
        `/seller/products/${productId}/variants`,
        token,
        { name: "Взлом", priceKopecks: 1000 },
      );
      expect(res.statusCode).toBe(404);
      await app.close();
    });
  });
});
