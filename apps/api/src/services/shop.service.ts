import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { ShopCatalogResponse, ShopProduct } from "@grammashop/shared";
import { db } from "../db/client.js";
import { products, productVariants, sellers, subscriptions } from "../db/schema.js";
import { loadImagesForProducts } from "../images/product-image-lookup.js";

// Каталог витрины по внутреннему seller.id (см. STACK.md#пайплайн-запроса).
// null — витрины нет: продавец не найден, заблокирован (blocked = скрытие
// админом), подписка не в статусе active/grace — регистрация без оплаты
// (Спринт 21) и «перестал платить после грейса» скрывают витрину тем же
// механизмом, что и blocked (см. CONCEPT.md#оплата-подписки-продавцом) —
// либо fullName/phone пусты (обезличен и восстановлен админом без
// дозаполнения профиля, Спринт 41, см. CONCEPT.md#персональные-данные-152-фз).
// Во всех случаях покупателю «магазин не найден», причина не раскрывается.
// Возвращаем только публичные поля — без ПДн продавца (152-ФЗ).
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
    .innerJoin(subscriptions, eq(subscriptions.sellerId, sellers.id))
    .where(
      and(
        eq(sellers.id, sellerId),
        eq(sellers.status, "active"),
        inArray(subscriptions.status, ["active", "grace"]),
        ne(sellers.fullName, ""),
        ne(sellers.phone, ""),
      ),
    );
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

  const images = await loadImagesForProducts(productIds);

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
      images: images.get(p.id) ?? [],
    })),
  };
}
