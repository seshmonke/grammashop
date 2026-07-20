import { useState } from "react";
import { Link } from "react-router-dom";
import type { SellerStatus, SubscriptionStatus, SubscriptionTier } from "@grammashop/shared";
import { Button } from "@/components/ui/button";
import { useSession } from "../../auth/session-context";
import {
  useGrantGrace,
  usePlatformSellers,
  useUpdateSellerStatus,
} from "../../platform/usePlatformSellers";

// Платформенная админка: список продавцов + ручная блокировка/разблокировка
// (см. CONCEPT.md#модерация-и-лимиты, STACK.md#роутинг, Спринт 14). Тот же
// визуальный паттерн, что и SellerOrders.tsx — плоские карточки, без
// декора (см. STACK.md#дизайн-направление: админки без темы клиента).

const SELLER_STATUS_LABELS: Record<SellerStatus, string> = {
  active: "Активен",
  blocked: "Заблокирован",
};

const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: "Оплачена",
  grace: "Грейс-период",
  suspended: "Приостановлена",
  canceled: "Отменена",
};

const SUBSCRIPTION_TIER_LABELS: Record<SubscriptionTier, string> = {
  tier1: "Тариф 1",
  tier2: "Тариф 2",
  tier3: "Тариф 3",
};

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DEFAULT_GRACE_MONTHS = 1;

export function PlatformHome() {
  const session = useSession();
  const { data: sellers, isLoading, isError } = usePlatformSellers();
  const updateStatus = useUpdateSellerStatus();
  const grantGrace = useGrantGrace();
  const [graceMonths, setGraceMonths] = useState<Record<number, number>>({});

  function handleGrantGrace(sellerId: number, shopName: string) {
    const months = graceMonths[sellerId] ?? DEFAULT_GRACE_MONTHS;
    if (!confirm(`Выдать «${shopName}» доступ на ${months} мес. без оплаты?`)) {
      return;
    }
    grantGrace.mutate({ id: sellerId, months });
  }

  function handleToggle(sellerId: number, shopName: string, current: SellerStatus) {
    const next: SellerStatus = current === "active" ? "blocked" : "active";
    if (
      next === "blocked" &&
      !confirm(`Заблокировать «${shopName}»? Витрина продавца сразу перестанет открываться.`)
    ) {
      return;
    }
    updateStatus.mutate({ id: sellerId, status: next });
  }

  return (
    <div className="min-h-dvh bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 flex items-center justify-between border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <div>
          <h1 className="y2k-heading font-display text-lg text-tg-text">Продавцы</h1>
          {sellers && <p className="text-sm text-tg-hint">{sellers.length}</p>}
        </div>
        {session.sellerId != null && (
          <Button asChild variant="outline" size="sm">
            <Link to="/seller">Мой магазин</Link>
          </Button>
        )}
      </header>

      <main className="space-y-3 p-4">
        {isLoading && <p className="py-16 text-center text-tg-hint">Загрузка…</p>}
        {isError && (
          <p className="py-16 text-center text-tg-hint">Не удалось загрузить продавцов.</p>
        )}
        {sellers?.length === 0 && (
          <p className="py-16 text-center text-tg-hint">Пока нет ни одного продавца.</p>
        )}
        {sellers?.map((seller) => (
          <div key={seller.id} className="rounded-2xl bg-tg-surface p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-medium text-tg-text">{seller.shopName}</h3>
                <p className="mt-1 text-sm text-tg-hint">@{seller.telegramUsername}</p>
              </div>
              <span className="shrink-0 rounded-full bg-tg-bg px-3 py-1 text-xs font-medium text-tg-text">
                {SELLER_STATUS_LABELS[seller.status]}
              </span>
            </div>

            <div className="mt-3 space-y-1 border-t border-tg-separator pt-3 text-sm text-tg-text">
              {seller.subscription ? (
                <>
                  <p>
                    {SUBSCRIPTION_TIER_LABELS[seller.subscription.tier]} ·{" "}
                    {SUBSCRIPTION_STATUS_LABELS[seller.subscription.status]}
                  </p>
                  {seller.subscription.paidUntil && (
                    <p className="text-tg-hint">
                      Оплачено до {dateFormatter.format(seller.subscription.paidUntil)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-tg-hint">Подписки нет</p>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 border-t border-tg-separator pt-3">
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={1}
                  max={24}
                  aria-label={`Месяцев доступа для ${seller.shopName}`}
                  value={graceMonths[seller.id] ?? DEFAULT_GRACE_MONTHS}
                  onChange={(e) =>
                    setGraceMonths((m) => ({
                      ...m,
                      [seller.id]: Number(e.target.value) || DEFAULT_GRACE_MONTHS,
                    }))
                  }
                  className="w-14 rounded-lg border border-tg-separator bg-tg-bg px-2 py-1 text-sm text-tg-text"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={grantGrace.isPending}
                  onClick={() => handleGrantGrace(seller.id, seller.shopName)}
                >
                  Выдать доступ
                </Button>
              </div>
              <Button
                variant={seller.status === "active" ? "ghost" : "outline"}
                size="sm"
                disabled={updateStatus.isPending}
                onClick={() => handleToggle(seller.id, seller.shopName, seller.status)}
              >
                {seller.status === "active" ? "Заблокировать" : "Разблокировать"}
              </Button>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
