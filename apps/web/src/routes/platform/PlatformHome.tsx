import { useState } from "react";
import { Link } from "react-router-dom";
import type { SellerStatus, SubscriptionStatus, SubscriptionTier } from "@grammashop/shared";
import { Button } from "@/components/ui/button";
import { useSession } from "../../auth/session-context";
import { ScreenState } from "../../shop/ScreenState";
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
  tier1: "Free",
  tier2: "Premium",
  tier3: "Тариф 3 (устарел)",
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
  // Строка, не число — иначе value контролируемого input'а на каждое
  // нажатие схлопывается через `|| DEFAULT_GRACE_MONTHS` обратно в 1, и
  // единичку невозможно стереть, чтобы напечатать другую цифру (найдено
  // на проде). Разбор и клэмп — только в момент отправки.
  const [graceMonths, setGraceMonths] = useState<Record<number, string>>({});
  // Инлайн-форма причины блокировки вместо модалки — в апе ещё нет ни
  // одного Dialog-компонента, заводить его ради одной формы избыточно
  // (см. «Анализ перед стартом», Спринт 32). blockingId === null — форма
  // закрыта у всех карточек, открыта максимум у одной за раз.
  const [blockingId, setBlockingId] = useState<number | null>(null);
  const [blockReason, setBlockReason] = useState<Record<number, string>>({});

  function monthsFor(sellerId: number): number {
    const parsed = Number(graceMonths[sellerId]);
    return Number.isInteger(parsed) && parsed >= 1
      ? Math.min(parsed, 24)
      : DEFAULT_GRACE_MONTHS;
  }

  function handleGrantGrace(sellerId: number, shopName: string) {
    const months = monthsFor(sellerId);
    if (!confirm(`Выдать «${shopName}» доступ на ${months} мес. без оплаты?`)) {
      return;
    }
    grantGrace.mutate({ id: sellerId, months });
  }

  function handleToggle(sellerId: number, current: SellerStatus) {
    if (current === "active") {
      setBlockingId(sellerId);
      return;
    }
    updateStatus.mutate({ id: sellerId, status: "active" });
  }

  function handleConfirmBlock(sellerId: number) {
    const reason = (blockReason[sellerId] ?? "").trim();
    if (!reason) return;
    updateStatus.mutate(
      { id: sellerId, status: "blocked", reason },
      { onSuccess: () => setBlockingId(null) },
    );
  }

  function handleCancelBlock(sellerId: number) {
    setBlockingId(null);
    setBlockReason((r) => ({ ...r, [sellerId]: "" }));
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
        {isLoading && <ScreenState variant="inline" title="Загрузка…" />}
        {isError && (
          <ScreenState variant="inline" title="Не удалось загрузить продавцов." />
        )}
        {sellers?.length === 0 && (
          <ScreenState variant="inline" title="Пока нет ни одного продавца." />
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
                  value={graceMonths[seller.id] ?? String(DEFAULT_GRACE_MONTHS)}
                  onChange={(e) =>
                    setGraceMonths((m) => ({
                      ...m,
                      [seller.id]: e.target.value,
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
                onClick={() => handleToggle(seller.id, seller.status)}
              >
                {seller.status === "active" ? "Заблокировать" : "Разблокировать"}
              </Button>
            </div>

            {blockingId === seller.id && (
              <div className="mt-3 space-y-2 border-t border-tg-separator pt-3">
                <label
                  className="block text-sm text-tg-hint"
                  htmlFor={`block-reason-${seller.id}`}
                >
                  Причина блокировки «{seller.shopName}» — покажем продавцу
                </label>
                <textarea
                  id={`block-reason-${seller.id}`}
                  rows={2}
                  value={blockReason[seller.id] ?? ""}
                  onChange={(e) =>
                    setBlockReason((r) => ({ ...r, [seller.id]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-tg-separator bg-tg-bg px-3 py-2 text-sm text-tg-text"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelBlock(seller.id)}
                  >
                    Отмена
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      updateStatus.isPending || !(blockReason[seller.id] ?? "").trim()
                    }
                    onClick={() => handleConfirmBlock(seller.id)}
                  >
                    Заблокировать
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </main>
    </div>
  );
}
