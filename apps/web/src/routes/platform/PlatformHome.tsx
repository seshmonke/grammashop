import { useState } from "react";
import { Link } from "react-router-dom";
import type { SellerStatus, SubscriptionStatus, SubscriptionTier } from "@grammashop/shared";
import { Button } from "@/components/ui/button";
import { ScreenState } from "../../shop/ScreenState";
import { AdminToolbar } from "../../nav/AdminToolbar";
import { shopLink } from "../../lib/platform";
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
  deleted: "Удалён",
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
  // Инлайн-форма причины блокировки/удаления вместо модалки — в апе ещё
  // нет ни одного Dialog-компонента, заводить его ради одной формы
  // избыточно (см. «Анализ перед стартом», Спринт 32). pending === null —
  // форма закрыта у всех карточек, открыта максимум у одной за раз;
  // target различает переход в blocked (Спринт 32) от deleted (Спринт 37)
  // — оба требуют причины, обратный переход в active — нет.
  const [pending, setPending] = useState<{
    id: number;
    target: "blocked" | "deleted";
  } | null>(null);
  const [actionReason, setActionReason] = useState<Record<number, string>>({});

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

  function handleRestore(sellerId: number) {
    updateStatus.mutate({ id: sellerId, status: "active" });
  }

  function handleStartAction(sellerId: number, target: "blocked" | "deleted") {
    setPending({ id: sellerId, target });
  }

  function handleConfirmAction(sellerId: number) {
    const reason = (actionReason[sellerId] ?? "").trim();
    if (!reason || pending?.id !== sellerId) return;
    updateStatus.mutate(
      { id: sellerId, status: pending.target, reason },
      { onSuccess: () => setPending(null) },
    );
  }

  function handleCancelAction(sellerId: number) {
    setPending(null);
    setActionReason((r) => ({ ...r, [sellerId]: "" }));
  }

  return (
    <div className="flex min-h-dvh flex-col bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <h1 className="y2k-heading font-display text-lg text-tg-text">Продавцы</h1>
        {sellers && <p className="text-sm text-tg-hint">{sellers.length}</p>}
      </header>

      <main className="flex-1 space-y-3 p-4">
        {session.sellerId == null && (
          <Link
            to="/register"
            className="flex items-center justify-between rounded-2xl bg-tg-surface p-4 text-sm font-medium text-tg-text"
          >
            У вас нет своего магазина
            <span className="text-tg-link">Запустить →</span>
          </Link>
        )}
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
                <a
                  href={shopLink(seller.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-tg-link"
                >
                  Открыть витрину
                </a>
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

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-tg-separator pt-3">
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
              {seller.status === "active" ? (
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={updateStatus.isPending}
                    onClick={() => handleStartAction(seller.id, "blocked")}
                  >
                    Заблокировать
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-tg-destructive"
                    disabled={updateStatus.isPending}
                    onClick={() => handleStartAction(seller.id, "deleted")}
                  >
                    Удалить
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={updateStatus.isPending}
                  onClick={() => handleRestore(seller.id)}
                >
                  {seller.status === "blocked" ? "Разблокировать" : "Восстановить"}
                </Button>
              )}
            </div>

            {pending?.id === seller.id && (
              <div className="mt-3 space-y-2 border-t border-tg-separator pt-3">
                <label
                  className="block text-sm text-tg-hint"
                  htmlFor={`action-reason-${seller.id}`}
                >
                  {pending.target === "blocked"
                    ? `Причина блокировки «${seller.shopName}» — покажем продавцу`
                    : `Причина удаления «${seller.shopName}» — покажем продавцу`}
                </label>
                <textarea
                  id={`action-reason-${seller.id}`}
                  rows={2}
                  value={actionReason[seller.id] ?? ""}
                  onChange={(e) =>
                    setActionReason((r) => ({ ...r, [seller.id]: e.target.value }))
                  }
                  className="w-full rounded-lg border border-tg-separator bg-tg-bg px-3 py-2 text-sm text-tg-text"
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelAction(seller.id)}
                  >
                    Отмена
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className={pending.target === "deleted" ? "text-tg-destructive" : undefined}
                    disabled={
                      updateStatus.isPending || !(actionReason[seller.id] ?? "").trim()
                    }
                    onClick={() => handleConfirmAction(seller.id)}
                  >
                    {pending.target === "blocked" ? "Заблокировать" : "Удалить"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </main>
      <AdminToolbar />
    </div>
  );
}
