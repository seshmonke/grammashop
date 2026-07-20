import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { formatPrice } from "../../lib/money";
import { useCart } from "../../cart/cart-context";
import { cartTotalKopecks } from "../../cart/cart-reducer";
import { buildCreateOrderRequest, type CheckoutFormValues } from "../../checkout/build-order-request";
import { useCreateOrder } from "../../checkout/useCreateOrder";
import { validateCheckoutForm, type CheckoutFormErrors } from "../../checkout/validate-checkout-form";
import type { CreateOrderResponse } from "@grammashop/shared";

// Чекаут Тарифа 1 (см. CONCEPT.md#каталог-и-заказы): без платёжного шлюза —
// вместо формы оплаты картой экран успеха показывает реквизиты/контакт
// продавца для перевода. Ограничение ответственности платформы (оплата и
// доставка — вне ТМА, по прямой договорённости сторон) показано ДО
// оформления, не только после — см. CONCEPT.md#коммуникация-продавца-и-покупателя.
// Текст — рабочий черновик, финальная формулировка ждёт юрпакет 152-ФЗ.
const LIABILITY_DISCLAIMER =
  "Оплата и доставка на этом тарифе происходят напрямую между вами и " +
  "продавцом, вне мини-приложения. Платформа не участвует в расчётах и " +
  "не подтверждает факт оплаты или доставки — это дело договорённости " +
  "сторон.";

function emptyForm(): CheckoutFormValues {
  return { buyerFullName: "", buyerPhone: "+7", buyerAddress: "", buyerComment: "", consent: false };
}

type TouchableField = keyof Omit<CheckoutFormValues, "buyerComment">;

// Поле подсвечивается только после того, как пользователь его тронул —
// не сразу пустой красной формой при заходе на экран. Как только поле
// становится валидным, обводка сразу зеленеет — не дожидаясь потери
// фокуса или отправки формы.
function fieldBorderClass(touched: boolean, hasError: boolean): string {
  if (!touched) return "border-tg-separator";
  return hasError ? "border-tg-destructive" : "border-emerald-500";
}

function SuccessScreen({ order }: { order: CreateOrderResponse }) {
  return (
    <div className="min-h-dvh bg-tg-bg px-4 pb-8 pt-[calc(1.5rem+env(safe-area-inset-top))]">
      <h1 className="text-xl font-semibold text-tg-text">
        Заказ №{order.id} оформлен
      </h1>
      <p className="mt-1 text-tg-hint">
        Сумма заказа: {formatPrice(order.totalKopecks)}
      </p>

      <div className="mt-5 rounded-2xl bg-tg-surface p-4">
        <p className="font-medium text-tg-text">Оплата продавцу</p>
        {order.seller.paymentDetails ? (
          <p className="mt-1 whitespace-pre-line text-tg-text">
            {order.seller.paymentDetails}
          </p>
        ) : (
          <p className="mt-1 text-tg-hint">
            Реквизиты для перевода уточните у продавца.
          </p>
        )}
        <a
          href={`https://t.me/${order.seller.telegramUsername}`}
          target="_blank"
          rel="noreferrer"
          className="mt-4 block rounded-2xl bg-tg-accent py-3 text-center font-medium text-tg-accent-text"
        >
          Написать продавцу
        </a>
      </div>

      <p className="mt-4 text-sm text-tg-hint">{LIABILITY_DISCLAIMER}</p>

      <Link to="/" className="mt-6 block text-center text-tg-link">
        Вернуться в магазин
      </Link>
    </div>
  );
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useCart();
  const [form, setForm] = useState<CheckoutFormValues>(emptyForm());
  const [touched, setTouched] = useState<Partial<Record<TouchableField, boolean>>>({});
  const createOrder = useCreateOrder(state.sellerId ?? 0);

  // Живая валидация — та же Zod-схема на каждое изменение формы (дешёвая
  // синхронная проверка, дебаунс не нужен). errors показываются только для
  // тронутых полей (см. fieldBorderClass); попытка отправки трогает сразу
  // все поля — чтобы нельзя было отправить форму, ничего не заполнив.
  const errors: CheckoutFormErrors = validateCheckoutForm(form);

  function touch(field: TouchableField) {
    setTouched((t) => (t[field] ? t : { ...t, [field]: true }));
  }

  if (state.items.length === 0 && !createOrder.data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-tg-text">Корзина пуста.</p>
        <Link to="/" className="text-tg-link">
          В магазин
        </Link>
      </div>
    );
  }

  if (createOrder.data) {
    return <SuccessScreen order={createOrder.data} />;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (Object.keys(errors).length > 0) {
      setTouched({
        buyerFullName: true,
        buyerPhone: true,
        buyerAddress: true,
        consent: true,
      });
      return;
    }

    const request = buildCreateOrderRequest(state.items, form);
    await createOrder.mutateAsync(request);
    dispatch({ type: "clear" });
  }

  return (
    <div className="min-h-dvh bg-tg-bg">
      <header className="tg-glass sticky top-0 z-10 border-b border-tg-separator px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))]">
        <button type="button" onClick={() => navigate(-1)} className="text-tg-link">
          ← Назад
        </button>
        <h1 className="mt-1 text-lg font-semibold text-tg-text">Оформление заказа</h1>
      </header>

      <main className="p-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-tg-hint" htmlFor="buyerFullName">
              ФИО
            </label>
            <input
              id="buyerFullName"
              value={form.buyerFullName}
              onChange={(e) => {
                setForm((f) => ({ ...f, buyerFullName: e.target.value }));
                touch("buyerFullName");
              }}
              aria-invalid={touched.buyerFullName && errors.buyerFullName ? true : undefined}
              className={`w-full rounded-lg border bg-tg-surface px-3 py-2 text-tg-text ${fieldBorderClass(!!touched.buyerFullName, !!errors.buyerFullName)}`}
            />
            {touched.buyerFullName && errors.buyerFullName && (
              <p className="mt-1 text-sm text-tg-destructive">{errors.buyerFullName}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-tg-hint" htmlFor="buyerPhone">
              Телефон
            </label>
            <input
              id="buyerPhone"
              type="tel"
              placeholder="+7XXXXXXXXXX"
              value={form.buyerPhone}
              onChange={(e) => {
                setForm((f) => ({ ...f, buyerPhone: e.target.value }));
                touch("buyerPhone");
              }}
              aria-invalid={touched.buyerPhone && errors.buyerPhone ? true : undefined}
              className={`w-full rounded-lg border bg-tg-surface px-3 py-2 text-tg-text ${fieldBorderClass(!!touched.buyerPhone, !!errors.buyerPhone)}`}
            />
            {touched.buyerPhone && errors.buyerPhone && (
              <p className="mt-1 text-sm text-tg-destructive">{errors.buyerPhone}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-tg-hint" htmlFor="buyerAddress">
              Адрес доставки
            </label>
            <textarea
              id="buyerAddress"
              value={form.buyerAddress}
              onChange={(e) => {
                setForm((f) => ({ ...f, buyerAddress: e.target.value }));
                touch("buyerAddress");
              }}
              rows={2}
              aria-invalid={touched.buyerAddress && errors.buyerAddress ? true : undefined}
              className={`w-full rounded-lg border bg-tg-surface px-3 py-2 text-tg-text ${fieldBorderClass(!!touched.buyerAddress, !!errors.buyerAddress)}`}
            />
            {touched.buyerAddress && errors.buyerAddress && (
              <p className="mt-1 text-sm text-tg-destructive">{errors.buyerAddress}</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm text-tg-hint" htmlFor="buyerComment">
              Комментарий (необязательно)
            </label>
            <textarea
              id="buyerComment"
              value={form.buyerComment}
              onChange={(e) => setForm((f) => ({ ...f, buyerComment: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-tg-separator bg-tg-surface px-3 py-2 text-tg-text"
            />
          </div>

          <div className="rounded-lg bg-tg-surface p-3">
            <p className="text-sm text-tg-hint">{LIABILITY_DISCLAIMER}</p>
          </div>

          <div>
            <label className="flex items-start gap-2 text-sm text-tg-text">
              <input
                type="checkbox"
                checked={form.consent}
                onChange={(e) => {
                  setForm((f) => ({ ...f, consent: e.target.checked }));
                  touch("consent");
                }}
                aria-invalid={touched.consent && errors.consent ? true : undefined}
                className="mt-0.5"
              />
              Согласен(на) на обработку персональных данных для оформления заказа
            </label>
            {touched.consent && errors.consent && (
              <p className="mt-1 text-sm text-tg-destructive">{errors.consent}</p>
            )}
          </div>

          {createOrder.isError && (
            <p className="text-sm text-tg-destructive">
              Не удалось оформить заказ — попробуйте ещё раз.
            </p>
          )}

          <div className="flex items-center justify-between border-t border-tg-separator pt-4">
            <span className="text-tg-hint">Итого</span>
            <span className="text-lg font-semibold text-tg-text tabular-nums">
              {formatPrice(cartTotalKopecks(state))}
            </span>
          </div>

          <button
            type="submit"
            disabled={createOrder.isPending}
            className="w-full rounded-2xl bg-tg-accent py-3 text-center font-medium text-tg-accent-text disabled:opacity-40"
          >
            {createOrder.isPending ? "Оформляем…" : "Оформить заказ"}
          </button>
        </form>
      </main>
    </div>
  );
}
