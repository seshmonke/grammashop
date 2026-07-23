import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, lte } from "drizzle-orm";
import type { SubscriptionTier } from "@grammashop/shared";
import { db } from "../db/client.js";
import { sellers, subscriptions, subscriptionPayments } from "../db/schema.js";
import { createPayment, getPayment } from "../yookassa/client.js";

// Движок подписки на ЮKassa (см. CONCEPT.md#оплата-подписки-продавцом,
// Спринт 26). Расписание списаний целиком на нашей стороне: ЮKassa —
// процессор без планировщика, повторные списания создаём сами по
// сохранённому payment_method_id.

// Тариф оплачиваемого потока — tier1 (Free): единственный с
// зафиксированной ценой (1 ₽/мес как карт-верификация). Premium ждёт
// расчёта юнит-экономики (CONCEPT.md#тарифы), включится тем же движком с
// другой суммой, когда цену посчитают.
const SUBSCRIPTION_TIER: SubscriptionTier = "tier1";

// Грейс после неоплаты — 3 дня (CONCEPT.md#оплата-подписки-продавцом).
// Окно грейса вычисляется от paid_until, отдельной колонки-таймстампа не
// нужно: grace = [paid_until, paid_until + 3д], дальше — suspended.
const GRACE_DAYS = 3;

// Сумма списания — параметр конфига (цена Premium ещё не зафиксирована,
// Free-верификация — 1 ₽ = 100 копеек; в sandbox любая).
export function subscriptionAmountKopecks(): number {
  const raw = Number(process.env.SUBSCRIPTION_AMOUNT_KOPECKS);
  return Number.isInteger(raw) && raw > 0 ? raw : 100;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// Первый платёж — привязка карты: save_payment_method + confirmation.
// Возвращает confirmation_url, который продавец открывает для подтверждения.
// Подписка заводится (если её нет) в статусе suspended — витрина скрыта до
// успешной оплаты; активируется в settlePayment по вебхуку.
export async function startSubscriptionPayment(
  sellerId: number,
  returnUrl: string,
): Promise<{ confirmationUrl: string | null; paymentId: string } | null> {
  const [seller] = await db
    .select({ id: sellers.id })
    .from(sellers)
    .where(eq(sellers.id, sellerId));
  if (!seller) return null;

  let [subscription] = await db
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.sellerId, sellerId));
  if (!subscription) {
    [subscription] = await db
      .insert(subscriptions)
      .values({ sellerId, tier: SUBSCRIPTION_TIER, status: "suspended" })
      .returning({ id: subscriptions.id });
  }

  const amountKopecks = subscriptionAmountKopecks();
  const payment = await createPayment(
    {
      amountKopecks,
      description: `Подписка grammashop, магазин #${sellerId}`,
      savePaymentMethod: true,
      returnUrl,
    },
    randomUUID(),
  );

  await db
    .insert(subscriptionPayments)
    .values({
      subscriptionId: subscription!.id,
      amountKopecks,
      status: "pending",
      ykPaymentId: payment.id,
    })
    .onConflictDoNothing({ target: subscriptionPayments.ykPaymentId });

  return {
    confirmationUrl: payment.confirmation?.confirmation_url ?? null,
    paymentId: payment.id,
  };
}

// Рекуррентное списание по сохранённому токену — без подтверждения
// пользователя. idempotenceKey детерминированный (subscriptionId + месяц):
// ретрай той же джобы за сутки не создаст второй платёж (идемпотентность
// ЮKassa держится 24ч).
async function chargeRecurring(sub: {
  id: number;
  ykPaymentMethodId: string;
}): Promise<string> {
  const amountKopecks = subscriptionAmountKopecks();
  const period = new Date().toISOString().slice(0, 7); // YYYY-MM
  const payment = await createPayment(
    {
      amountKopecks,
      description: `Подписка grammashop (продление), магазин #${sub.id}`,
      paymentMethodId: sub.ykPaymentMethodId,
    },
    `recurring-${sub.id}-${period}`,
  );
  await db
    .insert(subscriptionPayments)
    .values({
      subscriptionId: sub.id,
      amountKopecks,
      status: "pending",
      ykPaymentId: payment.id,
    })
    .onConflictDoNothing({ target: subscriptionPayments.ykPaymentId });
  return payment.id;
}

export type SettleResult =
  | "unknown" // платёж не наш — игнорируем
  | "already-settled" // повторная доставка — идемпотентный no-op
  | "succeeded"
  | "canceled"
  | "pending"; // ещё не финализирован у ЮKassa

// Идемпотентное ядро: перечитывает платёж у ЮKassa (телу вебхука не
// доверяем — подписи нет) и применяет результат ровно один раз. Гарантия
// «ровно один раз» — условный UPDATE статуса платежа из 'pending':
// повторная доставка того же события не пройдёт условие и не продлит
// подписку второй раз.
export async function settlePayment(paymentId: string): Promise<SettleResult> {
  const [row] = await db
    .select({
      id: subscriptionPayments.id,
      status: subscriptionPayments.status,
      subscriptionId: subscriptionPayments.subscriptionId,
    })
    .from(subscriptionPayments)
    .where(eq(subscriptionPayments.ykPaymentId, paymentId));
  if (!row) return "unknown";
  if (row.status !== "pending") return "already-settled";

  const payment = await getPayment(paymentId);
  if (payment.status === "pending" || payment.status === "waiting_for_capture") {
    return "pending";
  }

  return db.transaction(async (tx) => {
    // Атомарный переход pending → terminal: если 0 строк, платёж уже
    // финализирован конкурентной доставкой — выходим без продления.
    const settled = await tx
      .update(subscriptionPayments)
      .set({ status: payment.status === "succeeded" ? "succeeded" : "canceled" })
      .where(
        and(
          eq(subscriptionPayments.id, row.id),
          eq(subscriptionPayments.status, "pending"),
        ),
      )
      .returning({ id: subscriptionPayments.id });
    if (settled.length === 0) return "already-settled";

    if (payment.status !== "succeeded") return "canceled";

    const [sub] = await tx
      .select({ paidUntil: subscriptions.paidUntil })
      .from(subscriptions)
      .where(eq(subscriptions.id, row.subscriptionId));
    const now = new Date();
    const base =
      sub?.paidUntil && sub.paidUntil > now ? sub.paidUntil : now;
    const update: {
      status: "active";
      paidUntil: Date;
      ykPaymentMethodId?: string;
    } = { status: "active", paidUntil: addMonths(base, 1) };
    // Сохраняем токен карты только с первого (привязочного) платежа;
    // рекуррентные payment_method не возвращают saved-флаг заново.
    if (payment.payment_method?.saved && payment.payment_method.id) {
      update.ykPaymentMethodId = payment.payment_method.id;
    }
    await tx
      .update(subscriptions)
      .set(update)
      .where(eq(subscriptions.id, row.subscriptionId));
    return "succeeded";
  });
}

// Ежедневный свип (см. worker) — списывает подписки, у которых оплаченный
// период истёк, и есть сохранённый токен карты. Пропущенный запуск
// догоняется на следующий день: источник истины — paid_until, а не
// цепочка отложенных job. После попытки — перевод в grace/suspended по
// 3-дневному окну, если оплата так и не прошла.
export async function runRecurringBilling(now: Date = new Date()): Promise<{
  charged: number;
  failed: number;
}> {
  const due = await db
    .select({
      id: subscriptions.id,
      status: subscriptions.status,
      paidUntil: subscriptions.paidUntil,
      ykPaymentMethodId: subscriptions.ykPaymentMethodId,
    })
    .from(subscriptions)
    // join sellers + фильтр по active — иначе рекуррент продолжает
    // списывать карту продавца, которого заблокировали или удалили (пробел
    // с blocked существовал ещё до Спринта 37, найден и закрыт заодно —
    // см. docs/tasks/37-seller-soft-delete-and-monitoring-retry.md,
    // «Анализ перед стартом»). Приостановка подписки при удалении иначе
    // была бы фикцией.
    .innerJoin(sellers, eq(sellers.id, subscriptions.sellerId))
    .where(
      and(
        eq(sellers.status, "active"),
        isNotNull(subscriptions.ykPaymentMethodId),
        isNotNull(subscriptions.paidUntil),
        lte(subscriptions.paidUntil, now),
      ),
    );

  let charged = 0;
  let failed = 0;
  for (const sub of due) {
    // canceled — продавец сам отписался, не списываем (CONCEPT.md).
    if (sub.status === "canceled") continue;
    let succeeded = false;
    try {
      const paymentId = await chargeRecurring({
        id: sub.id,
        ykPaymentMethodId: sub.ykPaymentMethodId!,
      });
      // Рекуррент часто финализируется синхронно; settle идемпотентен и
      // всё равно продублируется вебхуком без вреда.
      const result = await settlePayment(paymentId);
      succeeded = result === "succeeded";
    } catch {
      succeeded = false;
    }
    if (succeeded) {
      charged += 1;
      continue;
    }
    failed += 1;
    // Оплата не прошла: в пределах 3 дней от конца оплаченного периода —
    // grace (витрина работает), дальше — suspended (витрина скрыта).
    const graceUntil = addDays(sub.paidUntil!, GRACE_DAYS);
    const nextStatus = now <= graceUntil ? "grace" : "suspended";
    if (sub.status !== nextStatus) {
      await db
        .update(subscriptions)
        .set({ status: nextStatus })
        .where(eq(subscriptions.id, sub.id));
    }
  }
  return { charged, failed };
}
