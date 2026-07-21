import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { SellerProfile, SubscriptionTier } from "@grammashop/shared";
import { Button } from "@/components/ui/button";
import { useSession } from "../../auth/session-context";
import { platformAdminChatUrl, shopLink } from "../../lib/platform";
import { useSellerProfile, useUpdateSellerProfile } from "../../seller/useSellerProfile";

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

// Баннер статуса подписки (см. STACK.md#роутинг, Спринт 21): до готовности
// ЮKassa единственный способ открыть витрину — льгота от админа, поэтому
// вместо оплаты — диплинк в личку платформы. Не активна и не в грейсе —
// та же формулировка для обоих случаев (регистрация без оплаты и
// закончившийся грейс), причина не детализируется — это фронт-зеркало
// того же принципа, что и в shop.service (см. CONCEPT.md).
function SubscriptionBanner({
  subscription,
}: {
  subscription: SellerProfile["subscription"];
}) {
  const isVisible = subscription?.status === "active" || subscription?.status === "grace";

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

  return (
    <div className="rounded-2xl bg-tg-surface p-4">
      <p className="font-medium text-tg-text">Витрина скрыта — подписка не активна</p>
      <p className="mt-1 text-sm text-tg-hint">
        Пока не готова оплата через ЮKassa, доступ выдаёт платформа вручную.
      </p>
      <a
        href={platformAdminChatUrl()}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block rounded-2xl bg-tg-accent py-2 text-center font-medium text-tg-accent-text"
      >
        Написать платформе
      </a>
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
        <Link to="/seller" className="text-tg-link">
          ← Товары
        </Link>
        <h1 className="mt-1 y2k-heading font-display text-lg text-tg-text">
          Настройки магазина
        </h1>
      </header>

      <main className="space-y-3 p-4">
        {isLoading && <p className="py-16 text-center text-tg-hint">Загрузка…</p>}
        {isError && (
          <p className="py-16 text-center text-tg-hint">Не удалось загрузить профиль.</p>
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
                  Описание
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
                  Реквизиты для перевода (Free)
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
                <p className="text-sm text-emerald-500">Сохранено</p>
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
    </div>
  );
}
