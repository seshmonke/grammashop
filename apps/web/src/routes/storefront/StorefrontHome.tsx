import { resolveSellerId } from "../../shop/seller-id";
import { useShopCatalog } from "../../shop/useShopCatalog";
import { ProductCard } from "../../shop/ProductCard";
import { ScreenState } from "../../shop/ScreenState";
import { MiniCartBar } from "../../cart/MiniCartBar";

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
    <div className="y2k-scanlines min-h-dvh bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <h1 className="y2k-heading font-display truncate text-lg text-tg-text">
          {data.shopName}
        </h1>
        {data.shopDescription && (
          <p className="truncate text-sm text-tg-hint">{data.shopDescription}</p>
        )}
      </header>

      <main className="mx-auto max-w-(--catalog-max-width) p-4 pb-24">
        {data.products.length === 0 ? (
          <ScreenState variant="inline" title="В этом магазине пока нет товаров." />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--card-min),1fr))] gap-2">
            {data.products.map((product) => (
              <ProductCard key={product.id} product={product} sellerId={data.sellerId} />
            ))}
          </div>
        )}
      </main>
      <MiniCartBar />
    </div>
  );
}
