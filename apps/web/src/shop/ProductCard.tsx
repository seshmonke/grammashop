import { Link } from "react-router-dom";
import { Plus } from "lucide-react";
import type { ShopProduct } from "@grammashop/shared";
import { formatPrice } from "../lib/money";
import {
  discountPercent,
  hasDiscount,
  isProductSoldOut,
  minPriceKopecks,
  priceVaries,
} from "./pricing";
import { useCart } from "../cart/cart-context";

// Карточка товара витрины, image-first (см.
// STACK.md#дизайн-направление, Спринт 17): фото квадратом сверху, имя/
// цена/скидка под ним. Плейсхолдер без фото — приглушённый символ
// платформы на брендовой (не тематической) поверхности --void-2, см.
// docs/design/DESIGN_SYSTEM.md#символ-и-логотип. Клик ведёт в карточку
// товара с вариантами; компактная кнопка «В корзину» — только у товара с
// единственным вариантом, с несколькими выбор всё равно требует перехода
// на карточку.
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
  const discounted = onlyVariant != null && hasDiscount(onlyVariant);

  return (
    <Link
      to={`/product/${product.id}`}
      className="flex flex-col overflow-hidden rounded-2xl bg-tg-surface transition-transform active:scale-[0.98]"
    >
      <div className="relative aspect-square w-full">
        {product.image ? (
          <img
            src={product.image.thumbnailUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-void-2">
            <img src="/logo.svg" alt="" className="h-1/3 w-1/3 opacity-35" />
          </div>
        )}

        {soldOut && (
          <span className="absolute left-2 top-2 rounded-full bg-tg-bg/90 px-2 py-0.5 text-xs text-tg-hint">
            Нет в наличии
          </span>
        )}

        {onlyVariant && !soldOut && (
          <button
            type="button"
            aria-label={inCart ? `В корзине: ${inCart.quantity}` : "В корзину"}
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
            className="y2k-cta-glow absolute bottom-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-magenta text-white"
          >
            {inCart ? (
              <span className="text-xs font-medium tabular-nums">
                {inCart.quantity}
              </span>
            ) : (
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            )}
          </button>
        )}
      </div>

      <div className="min-w-0 p-3">
        <h3 className="y2k-heading font-display line-clamp-2 min-w-0 text-sm text-tg-text">
          {product.name}
        </h3>

        {from != null && (
          <p className="y2k-price-glow mt-1.5 flex items-baseline gap-1.5 font-semibold text-magenta-on-theme tabular-nums">
            {priceVaries(product.variants) && (
              <span className="text-xs font-normal text-tg-hint">от</span>
            )}
            {formatPrice(from)}
            {discounted && (
              <span className="text-xs font-normal text-tg-hint line-through">
                {formatPrice(onlyVariant.oldPriceKopecks!)}
              </span>
            )}
          </p>
        )}

        {discounted && (
          <span className="y2k-cta-glow mt-1.5 inline-block rounded-full bg-magenta px-1.5 py-0.5 text-[10px] font-medium text-white">
            -{discountPercent(onlyVariant)}%
          </span>
        )}
      </div>
    </Link>
  );
}
