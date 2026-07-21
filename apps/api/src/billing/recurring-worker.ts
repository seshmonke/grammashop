import * as Sentry from "@sentry/node";
import { boss, SUBSCRIPTION_BILLING_QUEUE } from "../queue/client.js";
import { runRecurringBilling } from "../services/billing.service.js";

// Ежедневный свип рекуррентных списаний на pg-boss (см. Спринт 26,
// «Анализ перед стартом»): cron, а не цепочка sendAfter — пропущенный
// запуск догоняется на следующий день, источник истины — paid_until.
// 03:00 по Москве — ночное окно с минимальной нагрузкой; точное время не
// критично, свип идемпотентен по дате.
const DAILY_AT_3AM_MSK = "0 3 * * *";

// Вызывается один раз при старте процесса (index.ts), после boss.start().
export async function registerRecurringBillingWorker(): Promise<string> {
  await boss.createQueue(SUBSCRIPTION_BILLING_QUEUE);
  await boss.schedule(SUBSCRIPTION_BILLING_QUEUE, DAILY_AT_3AM_MSK, null, {
    tz: "Europe/Moscow",
  });
  return boss.work(SUBSCRIPTION_BILLING_QUEUE, async (jobs) => {
    for (const _job of jobs) {
      try {
        await runRecurringBilling();
      } catch (err) {
        Sentry.captureException(err);
        throw err;
      }
    }
  });
}
