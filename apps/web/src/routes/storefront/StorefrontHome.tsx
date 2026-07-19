import { resolveSellerId } from "../../shop/seller-id";
import { useShopCatalog } from "../../shop/useShopCatalog";
import { ProductCard } from "../../shop/ProductCard";

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
    <div className="min-h-dvh bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <h1 className="truncate text-lg font-semibold text-tg-text">
          {data.shopName}
        </h1>
        {data.shopDescription && (
          <p className="truncate text-sm text-tg-hint">{data.shopDescription}</p>
        )}
      </header>

      <main className="space-y-3 p-4">
        {data.products.length === 0 ? (
          <p className="py-16 text-center text-tg-hint">
            В этом магазине пока нет товаров.
          </p>
        ) : (
          data.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))
        )}
      </main>
    </div>
  );
}
