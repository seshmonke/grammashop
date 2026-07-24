import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { formatPrice } from "../../lib/money";
import { AdminToolbar } from "../../nav/AdminToolbar";
import { ScreenState } from "../../shop/ScreenState";
import { useSellerProfile } from "../../seller/useSellerProfile";
import {
  useDeleteProduct,
  useImportProducts,
  usePublishAllDrafts,
  useSellerProducts,
  useSetProductStatus,
} from "../../seller/useSellerProducts";
import type { ProductImportResponse, SellerProduct } from "@grammashop/shared";
import { ProductStatusPill } from "../../seller/ProductStatusPill";

// Список товаров продавца (см. STACK.md#роутинг: «товары (CRUD)»). Лимит
// (Free 30 / Premium 3000, см. CONCEPT.md#тарифы) проверяется на бэке —
// здесь счётчик только информативный, лимит для отображения зеркалит
// тариф из профиля продавца (Спринт 22).
const FREE_PRODUCT_LIMIT = 30;
const PREMIUM_PRODUCT_LIMIT = 3000;

export function SellerHome() {
  const { data: products, isLoading, isError } = useSellerProducts();
  const { data: profile } = useSellerProfile();
  const productLimit =
    profile?.subscription?.tier === "tier2"
      ? PREMIUM_PRODUCT_LIMIT
      : FREE_PRODUCT_LIMIT;
  const deleteProduct = useDeleteProduct();
  const importProducts = useImportProducts();
  const setStatus = useSetProductStatus();
  const publishAll = usePublishAllDrafts();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ProductImportResponse | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [publishAllMessage, setPublishAllMessage] = useState<string | null>(null);

  const draftCount = products?.filter((p) => p.status === "hidden").length ?? 0;

  function handleDelete(id: number, name: string) {
    if (!confirm(`Удалить карточку «${name}»? Это действие необратимо.`)) {
      return;
    }
    deleteProduct.mutate(id);
  }

  function handleToggleStatus(product: SellerProduct) {
    const next = product.status === "active" ? "hidden" : "active";
    setStatus.mutate(
      { id: product.id, status: next },
      {
        onError: () =>
          alert(
            next === "active"
              ? "Не удалось опубликовать карточку — попробуйте ещё раз"
              : "Не удалось снять карточку с витрины — попробуйте ещё раз",
          ),
      },
    );
  }

  async function handlePublishAll() {
    setPublishAllMessage(null);
    try {
      const { publishedCount } = await publishAll.mutateAsync();
      setPublishAllMessage(
        publishedCount > 0
          ? `Опубликовано карточек: ${publishedCount}`
          : "Нет черновиков, готовых к публикации",
      );
    } catch {
      setPublishAllMessage("Не удалось опубликовать черновики — попробуйте ещё раз");
    }
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
    <div className="flex min-h-dvh flex-col bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+var(--tg-header-safe-top))]">
        <div className="flex items-center justify-between">
          <h1 className="y2k-heading font-display text-lg text-tg-text">Товары</h1>
          {products && (
            <p className="shrink-0 text-sm text-tg-hint">
              {products.length} / {productLimit}
            </p>
          )}
        </div>
        {/* Разделы (Заказы/Настройки/Платформа) теперь в AdminToolbar внизу
            экрана — здесь остаётся основное действие + массовая публикация
            черновиков (закрывает онбординг после импорта, см.
            CONCEPT.md#жизненный-цикл-сущностей). */}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button asChild>
            <Link to="/seller/products/new">Добавить</Link>
          </Button>
          {draftCount > 0 && (
            <Button
              variant="outline"
              disabled={publishAll.isPending}
              onClick={handlePublishAll}
            >
              {publishAll.isPending
                ? "Публикуем…"
                : `Опубликовать все черновики (${draftCount})`}
            </Button>
          )}
        </div>
        {publishAllMessage && (
          <p className="mt-2 text-sm text-tg-hint">{publishAllMessage}</p>
        )}
      </header>

      <main className="flex-1 space-y-3 p-4">
        {profile && (profile.fullName === "" || profile.phone === "") && (
          <div className="rounded-2xl bg-tg-surface p-4">
            <p className="font-medium text-tg-text">
              Витрина скрыта — дозаполните профиль
            </p>
            <p className="mt-1 text-sm text-tg-hint">
              ФИО и телефон продавца не заполнены, покупатели не видят
              магазин.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/seller/profile">Заполнить в настройках</Link>
            </Button>
          </div>
        )}

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
          // hidden-карточка может остаться без вариантов (удаление
          // последнего варианта на hidden разрешено) — тогда Math.min дал бы
          // Infinity, поэтому цену показываем только при наличии вариантов.
          const hasVariants = prices.length > 0;
          const min = hasVariants ? Math.min(...prices) : 0;
          const max = hasVariants ? Math.max(...prices) : 0;
          const noPhoto = product.images.length === 0;
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
                    {hasVariants ? (
                      <>
                        {product.variants.length}{" "}
                        {product.variants.length === 1 ? "вариант" : "вариантов"}
                        {" · "}
                        {min === max ? formatPrice(min) : `от ${formatPrice(min)}`}
                      </>
                    ) : (
                      "нет вариантов"
                    )}
                    {noPhoto && " · без фото"}
                  </p>
                </div>
                <ProductStatusPill status={product.status} />
              </div>

              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link to={`/seller/products/${product.id}/edit`}>
                    Изменить
                  </Link>
                </Button>
                {product.status === "active" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setStatus.isPending}
                    onClick={() => handleToggleStatus(product)}
                  >
                    Снять с витрины
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={setStatus.isPending || !hasVariants}
                    onClick={() => handleToggleStatus(product)}
                  >
                    Опубликовать
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(product.id, product.name)}
                >
                  Удалить
                </Button>
              </div>
            </div>
          );
        })}
      </main>
      <AdminToolbar />
    </div>
  );
}
