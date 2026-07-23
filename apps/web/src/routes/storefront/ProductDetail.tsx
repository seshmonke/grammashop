import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import type { ProductImage, ShopVariant } from "@grammashop/shared";
import { resolveSellerId } from "../../shop/seller-id";
import { useShopCatalog } from "../../shop/useShopCatalog";
import { ScreenState } from "../../shop/ScreenState";
import { formatPrice } from "../../lib/money";
import { discountPercent, hasDiscount, isVariantOutOfStock } from "../../shop/pricing";
import { useCart } from "../../cart/cart-context";
import { TabBar } from "../../nav/TabBar";

// Галерея карточки — свайп-карусель с точками-индикаторами (см.
// STACK.md#пайплайн-фото-товара-спринт-16-расширено-спринтом-20), без
// стекла/blur — тот же принцип, что и весь Y2K-декор. Нативный горизонтальный
// scroll-snap, без сторонней библиотеки под один тач-жест.
function ImageCarousel({ images }: { images: ProductImage[] }) {
  const [index, setIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  if (images.length === 0) {
    return (
      <div className="relative mb-4 aspect-square w-full rounded-2xl bg-void-2">
        <img
          src="/logo.svg"
          alt=""
          className="absolute left-1/2 top-1/2 h-1/4 w-1/4 -translate-x-1/2 -translate-y-1/2 opacity-35"
        />
      </div>
    );
  }

  function handleScroll() {
    const el = containerRef.current;
    if (!el || el.clientWidth === 0) return;
    setIndex(Math.round(el.scrollLeft / el.clientWidth));
  }

  function scrollTo(i: number) {
    const el = containerRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="relative mb-4 aspect-square w-full overflow-hidden rounded-2xl bg-tg-bg">
      {/* Скролл-контейнер — absolute inset-0, а не в потоке: тот же приём,
          что в ProductCard.tsx (см. комментарий там) — на некоторых WebView
          `aspect-ratio` внешнего div ломается из-за img-потомков с
          процентной высотой и собственным intrinsic ratio (сервер не
          кропает фото в квадрат, см. backlog.md «Кадрирование фото
          товара»). absolute достаёт размеры из уже посчитанного
          aspect-ratio внешнего div, разрывая эту зависимость. */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="absolute inset-0 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((image) => (
          <img
            key={image.id}
            src={image.url}
            alt=""
            className="h-full w-full shrink-0 snap-center object-cover"
          />
        ))}
      </div>
      {images.length > 1 && (
        <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
          {images.map((image, i) => (
            <button
              key={image.id}
              type="button"
              aria-label={`Фото ${i + 1}`}
              onClick={() => scrollTo(i)}
              className={`h-1.5 w-1.5 rounded-full ${
                i === index ? "bg-white" : "bg-white/40"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

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
    <div className="flex items-center justify-between gap-3 border-b border-brand-rule py-3">
      <span className={soldOut ? "text-tg-hint" : "text-tg-text"}>
        {variant.name}
      </span>
      <div className="flex items-center gap-3 whitespace-nowrap">
        <span className="flex items-baseline gap-2 tabular-nums">
          {soldOut && (
            <span className="rounded-full bg-tg-surface px-2 py-0.5 text-xs text-tg-hint">
              нет в наличии
            </span>
          )}
          {discounted && (
            <span className="y2k-cta-glow rounded-full bg-magenta px-1.5 py-0.5 text-xs font-medium text-white">
              -{discountPercent(variant)}%
            </span>
          )}
          {discounted && (
            <span className="text-sm text-tg-hint line-through">
              {formatPrice(variant.oldPriceKopecks!)}
            </span>
          )}
          <span
            className={
              soldOut ? "text-tg-hint" : "y2k-price-glow font-medium text-magenta-on-theme"
            }
          >
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
              className="y2k-cta-glow shrink-0 rounded-full bg-magenta px-3 py-1.5 text-xs font-medium text-white"
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
    <div className="y2k-scanlines flex min-h-dvh flex-col bg-tg-bg">
      {/* Кнопка "назад" убрана — навигация теперь через TabBar внизу
          (см. DESIGN_SYSTEM.md#навигация--floating-toolbar): "Каталог"
          возвращает на витрину, "Корзина" ведёт в корзину. */}
      <main className="flex-1 px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))]">
        {isLoading ? (
          <ScreenState variant="inline" title="Загрузка…" />
        ) : isError || !product || !data ? (
          <ScreenState
            variant="inline"
            title="Товар не найден."
            action={{ to: "/", label: "Вернуться в каталог" }}
          />
        ) : (
          <>
            <ImageCarousel images={product.images} />
            <h1 className="y2k-heading font-display text-xl text-tg-text">
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
      <TabBar />
    </div>
  );
}
