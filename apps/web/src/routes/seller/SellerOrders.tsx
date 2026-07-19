import { Link } from "react-router-dom";
import { ORDER_STATUS_TRANSITIONS, type OrderStatus } from "@grammashop/shared";
import { Button } from "@/components/ui/button";
import { formatPrice } from "../../lib/money";
import { useSellerOrders, useUpdateOrderStatus } from "../../seller/useSellerOrders";

// Заказы в продавцовской админке (см. CONCEPT.md#каталог-и-заказы,
// STACK.md#роутинг). Продавец сам отмечает оплату/выполнение — платформа
// факт оплаты на Тарифе 1 не проверяет. Кнопки смены статуса — только
// допустимые переходы (ORDER_STATUS_TRANSITIONS, общий источник с
// бэком) — недопустимые не показываются вовсе, а не скрыты через disabled.
// Переходы назад («оплачен» → «новый», «выполнен» → «оплачен») — откат
// ошибочного клика продавца, без подтверждения (низкий риск, ничего не
// триггерят); «отменён» — единственный необратимый переход, с confirm.

const STATUS_LABELS: Record<OrderStatus, string> = {
  new: "Новый",
  paid: "Оплачен",
  fulfilled: "Выполнен",
  canceled: "Отменён",
};

// Метка зависит от пары (откуда, куда) — один и тот же целевой статус
// читается по-разному в зависимости от направления: «оплачен» как цель
// из «новый» — это отметка оплаты, а как цель из «выполнен» — это откат
// («снять отметку о выполнении»), см. CONCEPT.md#каталог-и-заказы.
const TRANSITION_LABELS: Record<OrderStatus, Partial<Record<OrderStatus, string>>> = {
  new: {
    paid: "Отметить оплаченным",
    canceled: "Отменить заказ",
  },
  paid: {
    new: "Отменить оплату",
    fulfilled: "Отметить выполненным",
    canceled: "Отменить заказ",
  },
  fulfilled: {
    paid: "Снять отметку о выполнении",
  },
  canceled: {},
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function SellerOrders() {
  const { data: orders, isLoading, isError } = useSellerOrders();
  const updateStatus = useUpdateOrderStatus();

  function handleTransition(orderId: number, status: OrderStatus) {
    if (status === "canceled" && !confirm("Отменить заказ? Остаток вернётся на склад.")) {
      return;
    }
    updateStatus.mutate({ id: orderId, status });
  }

  return (
    <div className="min-h-dvh bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 flex items-center justify-between border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div>
          <h1 className="text-lg font-semibold text-tg-text">Заказы</h1>
          {orders && <p className="text-sm text-tg-hint">{orders.length}</p>}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/seller">Товары</Link>
        </Button>
      </header>

      <main className="space-y-3 p-4">
        {isLoading && <p className="py-16 text-center text-tg-hint">Загрузка…</p>}
        {isError && (
          <p className="py-16 text-center text-tg-hint">Не удалось загрузить заказы.</p>
        )}
        {orders?.length === 0 && (
          <p className="py-16 text-center text-tg-hint">Пока нет ни одного заказа.</p>
        )}
        {orders?.map((order) => (
          <div key={order.id} className="rounded-2xl bg-tg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium text-tg-text">Заказ №{order.id}</p>
                <p className="text-sm text-tg-hint">
                  {dateFormatter.format(order.createdAt)}
                </p>
              </div>
              <span className="shrink-0 rounded-full bg-tg-bg px-3 py-1 text-xs font-medium text-tg-text">
                {STATUS_LABELS[order.status]}
              </span>
            </div>

            <div className="mt-3 space-y-1 text-sm text-tg-text">
              <p>{order.buyerFullName}</p>
              <p className="text-tg-hint">{order.buyerPhone}</p>
              <p className="text-tg-hint">{order.buyerAddress}</p>
              {order.buyerComment && <p className="text-tg-hint">{order.buyerComment}</p>}
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

            <div className="mt-3 space-y-2 border-t border-tg-separator pt-3">
              <span className="font-medium text-tg-text">
                {formatPrice(order.totalKopecks)}
              </span>
              <div className="flex flex-wrap justify-end gap-2">
                {ORDER_STATUS_TRANSITIONS[order.status].map((next) => (
                  <Button
                    key={next}
                    variant={next === "canceled" ? "ghost" : "outline"}
                    size="sm"
                    disabled={updateStatus.isPending}
                    onClick={() => handleTransition(order.id, next)}
                  >
                    {TRANSITION_LABELS[order.status][next]}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
