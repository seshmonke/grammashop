import { resolveSellerId } from "../../shop/seller-id";
import { useShopCatalog } from "../../shop/useShopCatalog";
import { ProductCard } from "../../shop/ProductCard";
import { ScreenState } from "../../shop/ScreenState";
import { TabBar } from "../../nav/TabBar";

// Витрина продавца по seller_id из start_param (см. STACK.md#роутинг).
// Read-only: товары из каталога, оформление заказа — отдельные задачи.

export function StorefrontHome() {
  const sellerId = resolveSellerId();
  const { data, isLoading, isError } = useShopCatalog(sellerId);

  if (sellerId == null) {
    return <ScreenState variant="full" title="Магазин открывается по ссылке продавца" />;
  }
  if (isLoading) {
    return <ScreenState variant="full" title="Загрузка магазина…" />;
  }
  if (isError || !data) {
    return (
      <ScreenState
        variant="full"
        title="Магазин недоступен"
        hint="Возможно, ссылка устарела или магазин закрыт."
      />
    );
  }

  return (
    <div className="y2k-scanlines flex min-h-dvh flex-col bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+var(--tg-header-safe-top))]">
        <h1 className="y2k-heading font-display truncate text-lg text-tg-text">
          {data.shopName}
        </h1>
        {data.shopDescription && (
          <p className="truncate text-sm text-tg-hint">{data.shopDescription}</p>
        )}
      </header>

      <main className="mx-auto w-full max-w-(--catalog-max-width) flex-1 p-4">
        {data.products.length === 0 ? (
          <ScreenState variant="inline" title="В этом магазине пока нет товаров." />
        ) : (
          /* 600px = 4×136px (прежний --card-min) + 3×8px gap + 32px padding
             — ширина, где 4 колонки не сжимают карточку ниже прежнего
             минимума; Playwright-сверкой подтверждено, что это та же
             точка, где старая auto-fill-сетка сама переходила 3→4 колонки
             (см. docs/tasks/38-catalog-grid-breakpoints.md). */
          <div className="grid grid-cols-2 min-[600px]:grid-cols-4 gap-2">
            {data.products.map((product) => (
              <ProductCard key={product.id} product={product} sellerId={data.sellerId} />
            ))}
          </div>
        )}
      </main>
      <TabBar />
    </div>
  );
}
