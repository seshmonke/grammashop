import * as Sentry from "@sentry/node";
import { boss, SELLER_DELETION_QUEUE } from "../queue/client.js";
import { anonymizeSeller } from "../services/anonymize-seller.service.js";
import { listExpiredDeletions } from "../services/seller.service.js";

// Ежедневный свип финального обезличивания продавцов, у которых истекло
// 30-дневное окно восстановления (см. Спринт 37,
// docs/tasks/37-seller-soft-delete-and-monitoring-retry.md). Тот же
// паттерн, что и рекуррентный биллинг (billing/recurring-worker.ts,
// Спринт 26): cron на pg-boss, источник истины — deletedAt в БД, а не
// цепочка отложенных job — пропущенный запуск догоняется на следующий
// день. Идемпотентен: anonymizeSeller на уже обезличенном продавце просто
// перезаписывает те же пустые поля.
const DAILY_AT_4AM_MSK = "0 4 * * *";

// Вызывается один раз при старте процесса (index.ts), после boss.start().
export async function registerFinalizeDeletionWorker(): Promise<string> {
  await boss.createQueue(SELLER_DELETION_QUEUE);
  await boss.schedule(SELLER_DELETION_QUEUE, DAILY_AT_4AM_MSK, null, {
    tz: "Europe/Moscow",
  });
  return boss.work(SELLER_DELETION_QUEUE, async (jobs) => {
    for (const _job of jobs) {
      try {
        const expired = await listExpiredDeletions();
        for (const seller of expired) {
          await anonymizeSeller(seller.id);
        }
      } catch (err) {
        Sentry.captureException(err);
        throw err;
      }
    }
  });
}
