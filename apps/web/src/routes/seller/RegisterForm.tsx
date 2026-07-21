import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useSession } from "../../auth/session-context";
import { requestContactPhone } from "../../lib/telegram";
import { useRegisterSeller } from "../../seller/useSellerRegistration";

// Форма регистрации магазина до оплаты подписки (см.
// CONCEPT.md#оплата-подписки-продавцом, Спринт 21). Успех переводит в
// админку продавца полной перезагрузкой страницы — так `AuthProvider`
// заново обменивает `initData` на JWT, и токен получает свежий `sellerId`
// (точечно обновить сессию в контексте сложнее и не даёт ничего сверху).
export function RegisterForm() {
  const session = useSession();
  const registerSeller = useRegisterSeller();
  const [shopName, setShopName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("+7");
  const [consent, setConsent] = useState(false);

  useEffect(() => {
    // Нативный попап Telegram — номер из аккаунта вместо ручного ввода.
    // Отказ/недоступность попапа — просто пустое поле, ничего не ломает.
    let active = true;
    requestContactPhone().then((value) => {
      if (active && value) setPhone(value);
    });
    return () => {
      active = false;
    };
  }, []);

  if (session.sellerId != null) {
    return <Navigate to="/seller" replace />;
  }

  const canSubmit =
    shopName.trim().length > 0 &&
    fullName.trim().length > 0 &&
    phone.trim().length > 0 &&
    consent &&
    !registerSeller.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    await registerSeller.mutateAsync({
      shopName: shopName.trim(),
      fullName: fullName.trim(),
      phone: phone.trim(),
      consent: true,
    });
    window.location.href = "/seller";
  }

  if (!session.telegramUsername) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-2 px-8 text-center">
        <p className="text-tg-text">
          Чтобы открыть магазин, задайте username в настройках Telegram.
        </p>
        <p className="text-sm text-tg-hint">
          Без него покупатели не смогут написать вам напрямую.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <h1 className="y2k-heading font-display text-lg text-tg-text">
          Запустить магазин
        </h1>
      </header>

      <main className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-tg-hint" htmlFor="shopName">
              Название магазина
            </label>
            <input
              id="shopName"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              className="w-full rounded-lg border border-tg-separator bg-tg-surface px-3 py-2 text-tg-text"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-tg-hint" htmlFor="fullName">
              ФИО
            </label>
            <input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-tg-separator bg-tg-surface px-3 py-2 text-tg-text"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-tg-hint" htmlFor="phone">
              Телефон
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="+7XXXXXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-tg-separator bg-tg-surface px-3 py-2 text-tg-text"
            />
          </div>

          <div>
            <label className="flex items-start gap-2 text-sm text-tg-text">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
              />
              Согласен(на) на обработку персональных данных
            </label>
          </div>

          {registerSeller.isError && (
            <p className="text-sm text-tg-destructive">
              Не удалось зарегистрировать магазин — попробуйте ещё раз.
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-magenta py-3 text-center font-medium text-white disabled:opacity-40"
          >
            {registerSeller.isPending ? "Запускаем…" : "Запустить магазин"}
          </button>
        </form>
      </main>
    </div>
  );
}
