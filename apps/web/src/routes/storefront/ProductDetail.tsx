import { Link, useParams } from "react-router-dom";
import type { ShopVariant } from "@grammashop/shared";
import { resolveSellerId } from "../../shop/seller-id";
import { useShopCatalog } from "../../shop/useShopCatalog";
import { formatPrice } from "../../lib/money";
import { discountPercent, hasDiscount, isVariantOutOfStock } from "../../shop/pricing";
import { useCart } from "../../cart/cart-context";
import { MiniCartBar } from "../../cart/MiniCartBar";

// Карточка товара: варианты с ценами и наличием (см.
// CONCEPT.md#каталог-и-заказы). Данные — из того же каталога, что и витрина
// (TanStack Query кэширует по seller_id, повторного запроса нет). Каждый
// вариант — своя позиция корзины (add/remove через cart-context).

function VariantRow({
  variant,
  sellerId,
  productId,
  productName,
}: {
  variant: ShopVariant;
  sellerId: number;
  productId: number;
  productName: string;
}) {
  const soldOut = isVariantOutOfStock(variant);
  const discounted = hasDiscount(variant);
  const { state, dispatch } = useCart();
  const inCart = state.items.find((i) => i.variantId === variant.id);

  return (
    <div className="flex items-center justify-between gap-3 border-b border-tg-separator py-3">
      <span className={soldOut ? "text-tg-hint" : "text-tg-text"}>
        {variant.name}
      </span>
      <div className="flex items-center gap-3 whitespace-nowrap">
        <span className="flex items-baseline gap-2 tabular-nums">
          {soldOut && (
            <span className="text-xs text-tg-destructive">нет в наличии</span>
          )}
          {discounted && (
            <span className="rounded-full bg-tg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-tg-destructive">
              -{discountPercent(variant)}%
            </span>
          )}
          {discounted && (
            <span className="text-sm text-tg-hint line-through">
              {formatPrice(variant.oldPriceKopecks!)}
            </span>
          )}
          <span className={soldOut ? "text-tg-hint" : "font-medium text-tg-text"}>
            {formatPrice(variant.priceKopecks)}
          </span>
        </span>

        {!soldOut &&
          (inCart ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Уменьшить количество"
                onClick={() =>
                  dispatch({
                    type: "setQuantity",
                    variantId: variant.id,
                    quantity: inCart.quantity - 1,
                  })
                }
                className="flex h-7 w-7 items-center justify-center rounded-full bg-tg-surface text-tg-text"
              >
                −
              </button>
              <span className="w-4 text-center text-sm tabular-nums text-tg-text">
                {inCart.quantity}
              </span>
              <button
                type="button"
                aria-label="Увеличить количество"
                onClick={() =>
                  dispatch({
                    type: "setQuantity",
                    variantId: variant.id,
                    quantity: inCart.quantity + 1,
                  })
                }
                className="flex h-7 w-7 items-center justify-center rounded-full bg-tg-surface text-tg-text"
              >
                +
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: "add",
                  item: {
                    sellerId,
                    productId,
                    variantId: variant.id,
                    productName,
                    variantName: variant.name,
                    priceKopecks: variant.priceKopecks,
                    stock: variant.stock,
                  },
                })
              }
              className="shrink-0 rounded-full bg-tg-accent px-3 py-1.5 text-xs font-medium text-tg-accent-text"
            >
              В корзину
            </button>
          ))}
      </div>
    </div>
  );
}

export function ProductDetail() {
  const { productId } = useParams();
  const sellerId = resolveSellerId();
  const { data, isLoading, isError } = useShopCatalog(sellerId);
  const product = data?.products.find((p) => String(p.id) === productId);

  return (
    <div className="min-h-dvh bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <Link to="/" className="text-tg-link">
          ← Назад
        </Link>
      </header>

      <main className="p-4 pb-24">
        {isLoading ? (
          <p className="py-16 text-center text-tg-hint">Загрузка…</p>
        ) : isError || !product || !data ? (
          <p className="py-16 text-center text-tg-hint">Товар не найден.</p>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-tg-text">
              {product.name}
            </h1>
            {product.description && (
              <p className="mt-2 whitespace-pre-line text-tg-hint">
                {product.description}
              </p>
            )}
            <div className="mt-5">
              {product.variants.map((variant) => (
                <VariantRow
                  key={variant.id}
                  variant={variant}
                  sellerId={data.sellerId}
                  productId={product.id}
                  productName={product.name}
                />
              ))}
            </div>
          </>
        )}
      </main>
      <MiniCartBar />
    </div>
  );
}
