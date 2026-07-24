import type { OrderStatus } from "@grammashop/shared";
import { formatPrice } from "../../lib/money";
import { resolveSellerId } from "../../shop/seller-id";
import { ScreenState } from "../../shop/ScreenState";
import { TabBar } from "../../nav/TabBar";
import { useBuyerOrders } from "../../checkout/useBuyerOrders";

// «Мои заказы» покупателя в текущем магазине (см. CONCEPT.md#каталог-и-заказы).
// Пересматривает Спринт 34 — список был сквозным по всем магазинам платформы,
// сужен до магазина по start_param (Спринт 40, тот же resolveSellerId, что
// каталог/карточка товара). Плоские карточки с полным составом заказа
// инлайн, без отдельного экрана деталей (тот же объём информации, что и в
// SellerOrders.tsx, не потребовал drill-down там — здесь тем более,
// покупатель не меняет статус).

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новый",
  paid: "Оплачен",
  fulfilled: "Выполнен",
  canceled: "Отменён",
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function OrdersPage() {
  const sellerId = resolveSellerId();
  const { data: orders, isLoading, isError } = useBuyerOrders(sellerId);

  return (
    <div className="y2k-scanlines flex min-h-dvh flex-col bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+var(--tg-header-safe-top))]">
        <h1 className="y2k-heading font-display text-lg text-tg-text">Заказы</h1>
      </header>

      <main className="flex-1 space-y-3 p-4">
        {sellerId == null && (
          <ScreenState
            variant="inline"
            title="Магазин открывается по ссылке продавца"
          />
        )}
        {isLoading && <ScreenState variant="inline" title="Загрузка…" />}
        {isError && (
          <ScreenState variant="inline" title="Не удалось загрузить заказы." />
        )}
        {orders?.length === 0 && (
          <ScreenState variant="inline" title="Пока нет ни одного заказа." action={{ to: "/", label: "В магазин" }} />
        )}
        {orders?.map((order) => (
          <div key={order.id} className="rounded-2xl bg-tg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium text-tg-text">{order.shopName}</p>
                <p className="text-sm text-tg-hint">
                  Заказ №{order.id} · {dateFormatter.format(order.createdAt)}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-tg-bg px-3 py-1 text-xs font-medium text-tg-text">
                {STATUS_LABELS[order.status]}
              </span>
            </div>

            <ul className="mt-3 space-y-1 border-t border-tg-separator pt-3 text-sm text-tg-text">
              {order.items.map((item, index) => (
                <li key={index} className="flex justify-between gap-2">
                  <span className="min-w-0 truncate">
                    {item.productName} · {item.variantName} × {item.quantity}
                  </span>
                  <span className="shrink-0">
                    {formatPrice(item.priceKopecks * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center justify-between border-t border-tg-separator pt-3">
              <span className="text-tg-hint">Итого</span>
              <span className="y2k-price-glow font-medium text-magenta-on-theme tabular-nums">
                {formatPrice(order.totalKopecks)}
              </span>
            </div>

            <a
              href={`https://t.me/${order.telegramUsername}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 block rounded-xl border border-tg-separator py-2 text-center text-sm font-medium text-tg-link"
            >
              Написать продавцу
            </a>
          </div>
        ))}
      </main>
      <TabBar />
    </div>
  );
}
