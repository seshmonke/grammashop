import "../env.js";
import { eq, inArray } from "drizzle-orm";
import { db } from "./client.js";
import {
  orders,
  productVariants,
  products,
  sellers,
  subscriptions,
} from "./schema.js";

// Seed продавца-разработчика: временный мост, пока нет регистрации с
// оплатой (продуктовая карта, п.3) и продавцовской админки (Спринт 10).
// Заливает одного продавца с активной подпиской Тарифа 1 и набором
// товаров, на которых проверяются все состояния витрины: несколько
// вариантов, скидка (зачёркнутая цена), «нет в наличии» (stock 0),
// выключенный учёт остатка (stock null), товар с единственным вариантом.
//
// Идемпотентен: перезапуск удаляет прежнего dev-продавца (по telegram_id)
// со всем его каталогом и заказами и создаёт заново. Чужих продавцов не
// трогает — работает только со своим telegram_id.
//
// Запускать вручную: `pnpm --filter @grammashop/api db:seed`.

// Заглушка telegram_id на случай, если DEV_SELLER_TELEGRAM_ID не задан:
// для витрины (поиск по внутреннему seller.id) достаточно любого, а вот
// вход в админку продавца по telegram_id совпадёт только с реальным
// числовым id (у @userinfobot).
const PLACEHOLDER_TELEGRAM_ID = 999000001;

function main(): Promise<void> {
  if (process.env.NODE_ENV === "production" && !process.env.SEED_ALLOW_PROD) {
    throw new Error(
      "seed: отказ на NODE_ENV=production (dev-инструмент). " +
        "Осознанно — выставить SEED_ALLOW_PROD=1.",
    );
  }

  const rawId = process.env.DEV_SELLER_TELEGRAM_ID?.trim();
  const telegramId = rawId ? Number(rawId) : PLACEHOLDER_TELEGRAM_ID;
  if (rawId && !Number.isInteger(telegramId)) {
    throw new Error(
      `seed: DEV_SELLER_TELEGRAM_ID должен быть числом (id у @userinfobot), а не "${rawId}"`,
    );
  }
  if (!rawId) {
    console.warn(
      `seed: DEV_SELLER_TELEGRAM_ID не задан — беру заглушку ${PLACEHOLDER_TELEGRAM_ID}. ` +
        "Витрина заработает, но под этим продавцом в админку не залогиниться.",
    );
  }
  const username = process.env.DEV_SELLER_TELEGRAM_USERNAME?.trim() || "dev_seller";

  return db.transaction(async (tx) => {
    // Снести прежнего dev-продавца: orders у sellers без ON DELETE cascade,
    // поэтому удаляем их явно перед продавцом (остальное — subscriptions,
    // products → variants/images — уходит каскадом).
    const existing = await tx
      .select({ id: sellers.id })
      .from(sellers)
      .where(eq(sellers.telegramId, telegramId));
    if (existing.length > 0) {
      const ids = existing.map((s) => s.id);
      await tx.delete(orders).where(inArray(orders.sellerId, ids));
      await tx.delete(sellers).where(inArray(sellers.id, ids));
    }

    const [seller] = await tx
      .insert(sellers)
      .values({
        telegramId,
        telegramUsername: username,
        fullName: "Пробный Продавец",
        phone: "+70000000000",
        shopName: "Демо-магазин",
        shopDescription: "Тестовый магазин продавца-разработчика.",
        paymentDetails: "Перевод по номеру телефона +7 000 000-00-00 (демо).",
        status: "active",
      })
      .returning({ id: sellers.id });
    if (!seller) throw new Error("seed: вставка продавца не вернула строку");

    // +30 дней от момента запуска — витрина seed-продавца видна, пока не
    // истечёт (см. CONCEPT.md#оплата-подписки-продавцом). Если протухла —
    // не чинить руками, просто перезапустить `db:seed`, скрипт идемпотентен.
    const paidUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await tx.insert(subscriptions).values({
      sellerId: seller.id,
      tier: "tier1",
      status: "active",
      paidUntil,
    });

    // Каталог. price_kopecks — копейки (1990 ₽ = 199000). oldPrice —
    // зачёркнутая цена (скидка). stock: число — учёт вкл, 0 — нет в
    // наличии, null — учёт выкл (всегда в наличии).
    const catalog: {
      name: string;
      description: string;
      variants: {
        name: string;
        priceKopecks: number;
        oldPriceKopecks?: number;
        stock?: number | null;
      }[];
    }[] = [
      {
        name: "Футболка oversize",
        description: "Плотный хлопок, свободный крой. Унисекс.",
        variants: [
          { name: "S", priceKopecks: 199000, stock: 5 },
          { name: "M", priceKopecks: 199000, oldPriceKopecks: 249000, stock: 3 },
          { name: "L", priceKopecks: 199000, stock: 0 },
        ],
      },
      {
        name: "Худи с капюшоном",
        description: "Тёплое худи на флисе, без учёта остатков.",
        variants: [
          { name: "Чёрный / M", priceKopecks: 449000, stock: null },
          { name: "Чёрный / L", priceKopecks: 449000, stock: null },
        ],
      },
      {
        name: "Набор стикеров",
        description: "Товар с единственным вариантом — на витрине как обычная позиция с одной ценой.",
        variants: [
          { name: "Стандарт", priceKopecks: 39000, oldPriceKopecks: 59000, stock: null },
        ],
      },
    ];

    let productCount = 0;
    let variantCount = 0;
    for (const [i, item] of catalog.entries()) {
      const [product] = await tx
        .insert(products)
        .values({
          sellerId: seller.id,
          name: item.name,
          description: item.description,
          sortPosition: i,
          status: "active",
        })
        .returning({ id: products.id });
      if (!product) throw new Error("seed: вставка товара не вернула строку");
      productCount += 1;

      await tx.insert(productVariants).values(
        item.variants.map((v, j) => ({
          productId: product.id,
          name: v.name,
          priceKopecks: v.priceKopecks,
          oldPriceKopecks: v.oldPriceKopecks ?? null,
          stock: v.stock ?? null,
          sortPosition: j,
        })),
      );
      variantCount += item.variants.length;
    }

    console.log(
      `seed: продавец #${seller.id} (@${username}, telegram_id ${telegramId}), ` +
        `подписка tier1/active, ${productCount} товаров, ${variantCount} вариантов.`,
    );
    console.log(
      `seed: витрина — t.me/grammashopbot/shop?startapp=${seller.id}`,
    );
    console.log(
      `seed: подписка оплачена до ${paidUntil.toISOString()} — если витрина ` +
        "перестала быть видна (протухший paid_until), это чинится не руками, " +
        "а повторным запуском `pnpm --filter @grammashop/api db:seed`.",
    );
  });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
