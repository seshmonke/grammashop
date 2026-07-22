import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useSession } from "../../auth/session-context";
import { fieldBorderClass } from "../../lib/field-styles";
import { requestContactPhone } from "../../lib/telegram";
import { useRegisterSeller } from "../../seller/useSellerRegistration";
import { validateRegisterForm, type RegisterFormValues } from "../../seller/validate-register-form";

type TouchableField = keyof RegisterFormValues;

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
  const [touched, setTouched] = useState<Partial<Record<TouchableField, boolean>>>({});

  // Живая валидация — та же Zod-схема, что и бэк (см.
  // validate-register-form.ts). Ошибки показываются только для тронутых
  // полей (blur), см. docs/design/DESIGN_SYSTEM.md#формы.
  const errors = validateRegisterForm({ shopName, fullName, phone, consent });

  function touch(field: TouchableField) {
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      setTouched({ shopName: true, fullName: true, phone: true, consent: true });
      return;
    }
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
              onBlur={() => touch("shopName")}
              aria-invalid={touched.shopName && errors.shopName ? true : undefined}
              aria-describedby={errors.shopName ? "shopName-error" : undefined}
              className={`w-full rounded-lg border bg-tg-surface px-3 py-2 text-tg-text ${fieldBorderClass(!!touched.shopName, !!errors.shopName)}`}
            />
            {touched.shopName && errors.shopName && (
              <p id="shopName-error" className="mt-1 text-sm text-tg-destructive">
                {errors.shopName}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-tg-hint" htmlFor="fullName">
              ФИО
            </label>
            <input
              id="fullName"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => touch("fullName")}
              aria-invalid={touched.fullName && errors.fullName ? true : undefined}
              aria-describedby={errors.fullName ? "fullName-error" : undefined}
              className={`w-full rounded-lg border bg-tg-surface px-3 py-2 text-tg-text ${fieldBorderClass(!!touched.fullName, !!errors.fullName)}`}
            />
            {touched.fullName && errors.fullName && (
              <p id="fullName-error" className="mt-1 text-sm text-tg-destructive">
                {errors.fullName}
              </p>
            )}
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
              onBlur={() => touch("phone")}
              aria-invalid={touched.phone && errors.phone ? true : undefined}
              aria-describedby={errors.phone ? "phone-error" : undefined}
              className={`w-full rounded-lg border bg-tg-surface px-3 py-2 text-tg-text ${fieldBorderClass(!!touched.phone, !!errors.phone)}`}
            />
            {touched.phone && errors.phone && (
              <p id="phone-error" className="mt-1 text-sm text-tg-destructive">
                {errors.phone}
              </p>
            )}
          </div>

          <div>
            <label className="flex items-start gap-2 text-sm text-tg-text">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  touch("consent");
                }}
                aria-invalid={touched.consent && errors.consent ? true : undefined}
                className="mt-0.5"
              />
              Согласен(на) на обработку персональных данных
            </label>
            {touched.consent && errors.consent && (
              <p className="mt-1 text-sm text-tg-destructive">{errors.consent}</p>
            )}
          </div>

          {registerSeller.isError && (
            <p className="text-sm text-tg-destructive">
              Не удалось зарегистрировать магазин — попробуйте ещё раз.
            </p>
          )}

          <Button
            type="submit"
            disabled={registerSeller.isPending}
            className="w-full rounded-2xl bg-magenta py-3 text-white hover:bg-magenta/90"
          >
            {registerSeller.isPending ? "Запускаем…" : "Запустить магазин"}
          </Button>
        </form>
      </main>
    </div>
  );
}
