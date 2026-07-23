import { PgBoss } from "pg-boss";

// Общая очередь фоновых задач (см. STACK.md#фоновые-задачи) — pg-boss
// поверх той же Postgres, что и остальное приложение, без отдельного
// брокера. Единственный потребитель пока — уведомление продавца о заказе
// (services/orders.service.ts, notifications/order-notification.ts).
export const ORDER_NOTIFICATION_QUEUE = "order-notification";

// Ежедневный свип рекуррентных списаний подписки на ЮKassa (см.
// billing/recurring-worker.ts, Спринт 26) — cron-джоба на том же pg-boss.
export const SUBSCRIPTION_BILLING_QUEUE = "subscription-billing";

// Ежедневный свип финального обезличивания продавцов по истечении окна
// восстановления (см. sellers/finalize-deletion-worker.ts, Спринт 37).
export const SELLER_DELETION_QUEUE = "seller-deletion-finalize";

export const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
});
