import { Link } from "react-router-dom";
import type { ShopProduct } from "@grammashop/shared";
import { formatPrice } from "../lib/money";
import { isProductSoldOut, minPriceKopecks, priceVaries } from "./pricing";

// Плоская карточка товара (без стекла — см. STACK.md#дизайн-направление).
// Фото товаров — отдельная задача (пайплайн изображений), пока карточка
// текстовая. Клик ведёт в карточку товара с вариантами.
export function ProductCard({ product }: { product: ShopProduct }) {
  const from = minPriceKopecks(product.variants);
  const soldOut = isProductSoldOut(product);

  return (
    <Link
      to={`/product/${product.id}`}
      className="block rounded-2xl bg-tg-surface p-4 transition-transform active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 flex-1 font-medium text-tg-text">
          {product.name}
        </h3>
        {soldOut && (
          <span className="shrink-0 rounded-full bg-tg-bg px-2 py-0.5 text-xs text-tg-hint">
            Нет в наличии
          </span>
        )}
      </div>

      {product.description && (
        <p className="mt-1 line-clamp-2 text-sm text-tg-hint">
          {product.description}
        </p>
      )}

      {from != null && (
        <p className="mt-3 font-semibold text-tg-text tabular-nums">
          {priceVaries(product.variants) && (
            <span className="mr-1 text-sm font-normal text-tg-hint">от</span>
          )}
          {formatPrice(from)}
        </p>
      )}
    </Link>
  );
}
