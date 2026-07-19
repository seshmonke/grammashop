import { PgBoss } from "pg-boss";

// Общая очередь фоновых задач (см. STACK.md#фоновые-задачи) — pg-boss
// поверх той же Postgres, что и остальное приложение, без отдельного
// брокера. Единственный потребитель пока — уведомление продавца о заказе
// (services/orders.service.ts, notifications/order-notification.ts).
export const ORDER_NOTIFICATION_QUEUE = "order-notification";

export const boss = new PgBoss({
  connectionString: process.env.DATABASE_URL,
});
