import type { ShopProduct, ShopVariant } from "@grammashop/shared";

// Производные витрины от вариантов (см. CONCEPT.md#каталог-и-заказы: цена на
// варианте, скидка зачёркнутой ценой, опциональный остаток).

export function minPriceKopecks(variants: ShopVariant[]): number | null {
  if (variants.length === 0) return null;
  return Math.min(...variants.map((v) => v.priceKopecks));
}

// Цены вариантов различаются → на карточке показываем «от N ₽».
export function priceVaries(variants: ShopVariant[]): boolean {
  return new Set(variants.map((v) => v.priceKopecks)).size > 1;
}

// stock: число 0 — нет в наличии; null — учёт выключен (всегда в наличии).
export function isVariantOutOfStock(variant: ShopVariant): boolean {
  return variant.stock === 0;
}

// Товар распродан, только если ВСЕ варианты в нуле (и они есть).
export function isProductSoldOut(product: ShopProduct): boolean {
  return (
    product.variants.length > 0 && product.variants.every(isVariantOutOfStock)
  );
}
