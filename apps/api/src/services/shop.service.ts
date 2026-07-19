import { and, asc, eq, inArray } from "drizzle-orm";
import type { ShopCatalogResponse, ShopProduct } from "@grammashop/shared";
import { db } from "../db/client.js";
import { products, productVariants, sellers } from "../db/schema.js";

// Каталог витрины по внутреннему seller.id (см. STACK.md#пайплайн-запроса).
// null — витрины нет: продавец не найден или заблокирован (blocked = скрытие
// админом). Скрытие за неоплату (subscription suspended) — производное от
// подписки, приедет с биллингом (продуктовая карта, п.3), здесь пока не
// проверяется. Возвращаем только публичные поля — без ПДн продавца (152-ФЗ).
export async function getShopCatalog(
  sellerId: number,
): Promise<ShopCatalogResponse | null> {
  const [seller] = await db
    .select({
      id: sellers.id,
      shopName: sellers.shopName,
      shopDescription: sellers.shopDescription,
      telegramUsername: sellers.telegramUsername,
    })
    .from(sellers)
    .where(and(eq(sellers.id, sellerId), eq(sellers.status, "active")));
  if (!seller) return null;

  // Только активные товары (hidden скрыт продавцом), в порядке витрины.
  const activeProducts = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
    })
    .from(products)
    .where(and(eq(products.sellerId, sellerId), eq(products.status, "active")))
    .orderBy(asc(products.sortPosition), asc(products.id));

  const productIds = activeProducts.map((p) => p.id);
  const variants = productIds.length
    ? await db
        .select({
          id: productVariants.id,
          productId: productVariants.productId,
          name: productVariants.name,
          priceKopecks: productVariants.priceKopecks,
          oldPriceKopecks: productVariants.oldPriceKopecks,
          stock: productVariants.stock,
        })
        .from(productVariants)
        .where(inArray(productVariants.productId, productIds))
        .orderBy(asc(productVariants.sortPosition), asc(productVariants.id))
    : [];

  const variantsByProduct = new Map<number, ShopProduct["variants"]>();
  for (const v of variants) {
    const list = variantsByProduct.get(v.productId) ?? [];
    list.push({
      id: v.id,
      name: v.name,
      priceKopecks: v.priceKopecks,
      oldPriceKopecks: v.oldPriceKopecks,
      stock: v.stock,
    });
    variantsByProduct.set(v.productId, list);
  }

  return {
    sellerId: seller.id,
    shopName: seller.shopName,
    shopDescription: seller.shopDescription,
    telegramUsername: seller.telegramUsername,
    products: activeProducts.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      variants: variantsByProduct.get(p.id) ?? [],
    })),
  };
}
