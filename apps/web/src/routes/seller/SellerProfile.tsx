import { useEffect, useState } from "react";
import type { SellerProfile, SubscriptionTier } from "@grammashop/shared";
import { Button } from "@/components/ui/button";
import { useSession } from "../../auth/session-context";
import { openExternalLink } from "../../lib/telegram";
import { shopLink } from "../../lib/platform";
import { ScreenState } from "../../shop/ScreenState";
import { AdminToolbar } from "../../nav/AdminToolbar";
import {
  usePaySubscription,
  useSellerProfile,
  useUpdateSellerProfile,
} from "../../seller/useSellerProfile";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const SUBSCRIPTION_TIER_LABELS: Record<SubscriptionTier, string> = {
  tier1: "Free",
  tier2: "Premium",
  tier3: "Тариф 3 (устарел)",
};

// Баннер статуса подписки (см. CONCEPT.md#оплата-подписки-продавцом,
// Спринт 21/26-27): активна/грейс — витрина работает, показываем дату
// окончания. Иначе (suspended/canceled/подписки ещё нет) — кнопка оплаты,
// дёргающая POST /seller/subscription/pay (движок Спринта 26). confirmationUrl
// может быть null (метод не требует подтверждения — статус подтвердится
// вебхуком), тогда просто ждём, без редиректа.
function SubscriptionBanner({
  subscription,
}: {
  subscription: SellerProfile["subscription"];
}) {
  const isVisible = subscription?.status === "active" || subscription?.status === "grace";
  const paySubscription = usePaySubscription();

  if (isVisible) {
    return (
      <div className="rounded-2xl bg-tg-surface p-4">
        <p className="font-medium text-tg-text">
          Витрина активна
          {subscription?.tier && ` · ${SUBSCRIPTION_TIER_LABELS[subscription.tier]}`}
        </p>
        {subscription?.paidUntil && (
          <p className="mt-1 text-sm text-tg-hint">
            Активна до {dateFormatter.format(subscription.paidUntil)}
          </p>
        )}
      </div>
    );
  }

  async function handlePay() {
    const result = await paySubscription.mutateAsync();
    if (result.confirmationUrl) {
      openExternalLink(result.confirmationUrl);
    }
  }

  return (
    <div className="rounded-2xl bg-tg-surface p-4">
      <p className="font-medium text-tg-text">
        {subscription?.status === "suspended"
          ? "Витрина скрыта — подписка приостановлена"
          : "Витрина скрыта — подписка не активна"}
      </p>
      <p className="mt-1 text-sm text-tg-hint">
        Оплата и продление — через ЮKassa, дальше подписка продлевается
        автоматически.
      </p>
      {paySubscription.isError && (
        <p className="mt-2 text-sm text-tg-destructive">
          Не удалось начать оплату — попробуйте ещё раз.
        </p>
      )}
      {paySubscription.isSuccess && !paySubscription.data.confirmationUrl && (
        <p className="mt-2 text-sm text-tg-hint">
          Платёж обрабатывается, статус обновится автоматически.
        </p>
      )}
      <Button
        onClick={handlePay}
        disabled={paySubscription.isPending}
        className="mt-3 w-full bg-magenta text-white hover:bg-magenta/90"
      >
        {paySubscription.isPending ? "Открываем оплату…" : "Оплатить подписку"}
      </Button>
    </div>
  );
}

function ShopLinkCard({ sellerId }: { sellerId: number }) {
  const [copied, setCopied] = useState(false);
  const link = shopLink(sellerId);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Буфер недоступен — ссылка всё равно видна текстом, можно выделить руками.
    }
  }

  return (
    <div className="rounded-2xl bg-tg-surface p-4">
      <p className="font-medium text-tg-text">Ссылка на витрину</p>
      <p className="mt-1 break-all text-sm text-tg-hint">{link}</p>
      <Button variant="outline" size="sm" className="mt-3" onClick={handleCopy}>
        {copied ? "Скопировано" : "Скопировать"}
      </Button>
    </div>
  );
}

export function SellerProfile() {
  const session = useSession();
  const { data: profile, isLoading, isError } = useSellerProfile();
  const updateProfile = useUpdateSellerProfile();

  const [shopName, setShopName] = useState("");
  const [shopDescription, setShopDescription] = useState("");
  const [paymentDetails, setPaymentDetails] = useState("");

  useEffect(() => {
    if (!profile) return;
    setShopName(profile.shopName);
    setShopDescription(profile.shopDescription ?? "");
    setPaymentDetails(profile.paymentDetails ?? "");
  }, [profile]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await updateProfile.mutateAsync({
      shopName: shopName.trim(),
      shopDescription: shopDescription.trim() === "" ? null : shopDescription.trim(),
      paymentDetails: paymentDetails.trim() === "" ? null : paymentDetails.trim(),
    });
  }

  return (
    <div className="min-h-dvh bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <h1 className="y2k-heading font-display text-lg text-tg-text">
          Настройки магазина
        </h1>
      </header>

      <main className="space-y-3 p-4 pb-24">
        {isLoading && <ScreenState variant="inline" title="Загрузка…" />}
        {isError && (
          <ScreenState variant="inline" title="Не удалось загрузить профиль." />
        )}

        {profile && (
          <>
            <SubscriptionBanner subscription={profile.subscription} />
            {session.sellerId != null && <ShopLinkCard sellerId={session.sellerId} />}

            <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl bg-tg-surface p-4">
              <div>
                <label className="mb-1 block text-sm text-tg-hint" htmlFor="shopName">
                  Название магазина
                </label>
                <input
                  id="shopName"
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  className="w-full rounded-lg border border-tg-separator bg-tg-bg px-3 py-2 text-tg-text"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-tg-hint" htmlFor="shopDescription">
                  Описание (необязательно)
                </label>
                <textarea
                  id="shopDescription"
                  rows={3}
                  value={shopDescription}
                  onChange={(e) => setShopDescription(e.target.value)}
                  className="w-full rounded-lg border border-tg-separator bg-tg-bg px-3 py-2 text-tg-text"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm text-tg-hint" htmlFor="paymentDetails">
                  Реквизиты для перевода (Free, необязательно)
                </label>
                <textarea
                  id="paymentDetails"
                  rows={3}
                  value={paymentDetails}
                  onChange={(e) => setPaymentDetails(e.target.value)}
                  className="w-full rounded-lg border border-tg-separator bg-tg-bg px-3 py-2 text-tg-text"
                />
              </div>

              {updateProfile.isError && (
                <p className="text-sm text-tg-destructive">
                  Не удалось сохранить — попробуйте ещё раз.
                </p>
              )}
              {updateProfile.isSuccess && (
                <p className="text-sm text-tg-success">Сохранено</p>
              )}

              <Button
                type="submit"
                disabled={updateProfile.isPending}
                className="w-full bg-magenta text-white hover:bg-magenta/90"
              >
                {updateProfile.isPending ? "Сохраняем…" : "Сохранить"}
              </Button>
            </form>
          </>
        )}
      </main>
      <AdminToolbar />
    </div>
  );
}
