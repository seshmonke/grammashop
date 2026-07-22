import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSession } from "../../auth/session-context";
import { formatPrice } from "../../lib/money";
import { ScreenState } from "../../shop/ScreenState";
import { useSellerProfile } from "../../seller/useSellerProfile";
import {
  useDeleteProduct,
  useImportProducts,
  useSellerProducts,
} from "../../seller/useSellerProducts";
import type { ProductImportResponse } from "@grammashop/shared";

// Список товаров продавца (см. STACK.md#роутинг: «товары (CRUD)»). Лимит
// (Free 30 / Premium 3000, см. CONCEPT.md#тарифы) проверяется на бэке —
// здесь счётчик только информативный, лимит для отображения зеркалит
// тариф из профиля продавца (Спринт 22).
const FREE_PRODUCT_LIMIT = 30;
const PREMIUM_PRODUCT_LIMIT = 3000;

export function SellerHome() {
  const session = useSession();
  const { data: products, isLoading, isError } = useSellerProducts();
  const { data: profile } = useSellerProfile();
  const productLimit =
    profile?.subscription?.tier === "tier2"
      ? PREMIUM_PRODUCT_LIMIT
      : FREE_PRODUCT_LIMIT;
  const deleteProduct = useDeleteProduct();
  const importProducts = useImportProducts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ProductImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  function handleDelete(id: number, name: string) {
    if (!confirm(`Удалить карточку «${name}»? Это действие необратимо.`)) {
      return;
    }
    deleteProduct.mutate(id);
  }

  async function handleImportSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setImportError(null);
    setImportResult(null);
    try {
      const result = await importProducts.mutateAsync(file);
      setImportResult(result);
    } catch {
      setImportError("Не удалось разобрать файл — проверьте, что это .xlsx по шаблону");
    }
  }

  return (
    <div className="min-h-dvh bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div className="flex items-center justify-between">
          <h1 className="y2k-heading font-display text-lg text-tg-text">Товары</h1>
          {products && (
            <p className="shrink-0 text-sm text-tg-hint">
              {products.length} / {productLimit}
            </p>
          )}
        </div>
        {/* overflow-x-auto — кнопок стало 4 (плюс «Платформа» у админа-продавца),
            в один ряд без прокрутки они не помещаются на узком экране и режутся
            краем viewport, а не переносятся (flex без wrap). */}
        <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4">
          {session.isAdmin && (
            <Button asChild variant="outline" size="sm" className="shrink-0">
              <Link to="/platform">Платформа</Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to="/seller/profile">Настройки</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link to="/seller/orders">Заказы</Link>
          </Button>
          <Button asChild size="sm" className="shrink-0 bg-magenta text-white hover:bg-magenta/90">
            <Link to="/seller/products/new">Добавить</Link>
          </Button>
        </div>
      </header>

      <main className="space-y-3 p-4">
        <div className="rounded-2xl bg-tg-surface p-4">
          <h2 className="font-medium text-tg-text">Заливка из Excel</h2>
          <p className="mt-1 text-sm text-tg-hint">
            Заполните{" "}
            <a href="/products-template.xlsx" className="text-tg-link">
              шаблон
            </a>{" "}
            и загрузите файл — карточки заведутся автоматически.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleImportSelected}
          />
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            disabled={importProducts.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {importProducts.isPending ? "Загрузка…" : "Загрузить файл"}
          </Button>

          {importError && (
            <p className="mt-2 text-sm text-tg-destructive">{importError}</p>
          )}
          {importResult && (
            <div className="mt-3 text-sm">
              <p className="text-tg-text">
                Создано карточек: {importResult.createdCount}
              </p>
              {importResult.errors.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-tg-destructive">
                  {importResult.errors.map((e) => (
                    <li key={e.row}>
                      строка {e.row}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {isLoading && <ScreenState variant="inline" title="Загрузка…" />}
        {isError && (
          <ScreenState variant="inline" title="Не удалось загрузить товары." />
        )}
        {products?.length === 0 && (
          <ScreenState
            variant="inline"
            title="Пока нет ни одной карточки товара."
            action={{ to: "/seller/products/new", label: "Добавить товар" }}
          />
        )}
        {products?.map((product) => {
          const prices = product.variants.map((v) => v.priceKopecks);
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          return (
            <div
              key={product.id}
              className="rounded-2xl bg-tg-surface p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-medium text-tg-text">
                    {product.name}
                  </h3>
                  <p className="mt-1 text-sm text-tg-hint">
                    {product.variants.length}{" "}
                    {product.variants.length === 1 ? "вариант" : "вариантов"}
                    {" · "}
                    {min === max ? formatPrice(min) : `от ${formatPrice(min)}`}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/seller/products/${product.id}/edit`}>
                      Изменить
                    </Link>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(product.id, product.name)}
                  >
                    Удалить
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
