import { Link } from "react-router-dom";
import type { ShopProduct } from "@grammashop/shared";
import { formatPrice } from "../lib/money";
import { isProductSoldOut, minPriceKopecks, priceVaries } from "./pricing";
import { useCart } from "../cart/cart-context";

// Плоская карточка товара (без стекла — см. STACK.md#дизайн-направление).
// Фото товаров — отдельная задача (пайплайн изображений), пока карточка
// текстовая. Клик ведёт в карточку товара с вариантами; кнопка «В корзину»
// показывается только у товара с единственным вариантом — с несколькими
// вариантами выбор всё равно требует перехода на карточку.
export function ProductCard({
  product,
  sellerId,
}: {
  product: ShopProduct;
  sellerId: number;
}) {
  const from = minPriceKopecks(product.variants);
  const soldOut = isProductSoldOut(product);
  const { state, dispatch } = useCart();
  const onlyVariant = product.variants.length === 1 ? product.variants[0] : null;
  const inCart = onlyVariant
    ? state.items.find((i) => i.variantId === onlyVariant.id)
    : undefined;

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

      <div className="mt-3 flex items-center justify-between gap-3">
        {from != null && (
          <p className="font-semibold text-tg-text tabular-nums">
            {priceVaries(product.variants) && (
              <span className="mr-1 text-sm font-normal text-tg-hint">от</span>
            )}
            {formatPrice(from)}
          </p>
        )}

        {onlyVariant && !soldOut && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dispatch({
                type: "add",
                item: {
                  sellerId,
                  productId: product.id,
                  variantId: onlyVariant.id,
                  productName: product.name,
                  variantName: onlyVariant.name,
                  priceKopecks: onlyVariant.priceKopecks,
                  stock: onlyVariant.stock,
                },
              });
            }}
            className="shrink-0 rounded-full bg-tg-accent px-3 py-1.5 text-xs font-medium text-tg-accent-text"
          >
            {inCart ? `В корзине: ${inCart.quantity}` : "В корзину"}
          </button>
        )}
      </div>
    </Link>
  );
}
