import { resolveSellerId } from "../../shop/seller-id";
import { useShopCatalog } from "../../shop/useShopCatalog";
import { ProductCard } from "../../shop/ProductCard";
import { MiniCartBar } from "../../cart/MiniCartBar";

// Витрина продавца по seller_id из start_param (см. STACK.md#роутинг).
// Read-only: товары из каталога, оформление заказа — отдельные задачи.

function Centered({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="font-medium text-tg-text">{title}</p>
      {hint && <p className="text-sm text-tg-hint">{hint}</p>}
    </div>
  );
}

export function StorefrontHome() {
  const sellerId = resolveSellerId();
  const { data, isLoading, isError } = useShopCatalog(sellerId);

  if (sellerId == null) {
    return <Centered title="Магазин открывается по ссылке продавца" />;
  }
  if (isLoading) {
    return <Centered title="Загрузка магазина…" />;
  }
  if (isError || !data) {
    return (
      <Centered
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
          <p className="py-16 text-center text-tg-hint">
            В этом магазине пока нет товаров.
          </p>
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
