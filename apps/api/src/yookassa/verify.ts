import "../env.js";
import { createPayment, getPayment } from "./client.js";
import type { YooKassaPayment } from "./client.js";

// Ручная сквозная проверка движка биллинга (Спринт 26) против реального
// тестового магазина ЮKassa — по образцу s3/verify.ts. Не часть CI/тестов
// (сеть + ручное действие человека — открыть confirmation_url и оплатить
// тестовой картой), запускается вручную: pnpm verify:yookassa.
//
// Шаг 1 (без аргумента): создаёт платёж с save_payment_method, печатает
// confirmation_url. Шаг 2 (с id платежа из шага 1, после ручной оплаты):
// дожидается succeeded, забирает payment_method_id, пробует по нему
// рекуррентное списание без подтверждения — ровно та пара вызовов, что
// использует services/billing.service.ts в проде.

const AMOUNT_KOPECKS = 100; // 1 ₽ — тот же ориентир, что верификация Free.
const RETURN_URL = "https://example.com/grammashop-verify-return";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollUntilTerminal(
  paymentId: string,
  { timeoutMs = 5 * 60 * 1000, intervalMs = 3000 } = {},
): Promise<YooKassaPayment> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const payment = await getPayment(paymentId);
    if (payment.status === "succeeded" || payment.status === "canceled") {
      return payment;
    }
    if (Date.now() > deadline) {
      throw new Error(
        `таймаут ожидания ${paymentId}, последний статус: ${payment.status}`,
      );
    }
    console.log(`  ...статус ${payment.status}, жду`);
    await sleep(intervalMs);
  }
}

async function main(): Promise<void> {
  const existingPaymentId = process.argv[2];

  if (!existingPaymentId) {
    const payment = await createPayment(
      {
        amountKopecks: AMOUNT_KOPECKS,
        description: "grammashop verify: привязка карты",
        savePaymentMethod: true,
        returnUrl: RETURN_URL,
      },
      `verify-${Date.now()}`,
    );
    console.log("Платёж создан:", payment.id);
    console.log("Открой в браузере и оплати тестовой картой:");
    console.log(payment.confirmation?.confirmation_url);
    console.log(
      "Тестовая карта: 5555 5555 5555 4444, любой будущий срок, любой CVC/3-D Secure код",
    );
    console.log("");
    console.log(`Когда оплатишь — запусти: tsx src/yookassa/verify.ts ${payment.id}`);
    return;
  }

  console.log("Жду подтверждения первого платежа...");
  const first = await pollUntilTerminal(existingPaymentId);
  if (first.status !== "succeeded") {
    throw new Error(`первый платёж не прошёл: ${first.status}`);
  }
  console.log("Первый платёж succeeded:", first.id, first.amount);

  const paymentMethodId = first.payment_method?.id;
  if (!paymentMethodId || !first.payment_method?.saved) {
    throw new Error("payment_method не сохранён — save_payment_method не сработал");
  }
  console.log("payment_method_id сохранён:", paymentMethodId);

  console.log("Пробую рекуррентное списание по сохранённому токену (без подтверждения)...");
  const recurring = await createPayment(
    {
      amountKopecks: AMOUNT_KOPECKS,
      description: "grammashop verify: рекуррентное списание",
      paymentMethodId,
    },
    `verify-recurring-${Date.now()}`,
  );
  const settled = await pollUntilTerminal(recurring.id, { timeoutMs: 30_000 });
  if (settled.status !== "succeeded") {
    throw new Error(`рекуррентное списание не прошло: ${settled.status}`);
  }
  console.log("Рекуррентное списание succeeded:", settled.id, settled.amount);
  console.log("");
  console.log(
    "ЮKassa sandbox: полный цикл (привязка карты + рекуррент без подтверждения) подтверждён.",
  );
}

await main();
