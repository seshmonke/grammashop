import * as Sentry from "@sentry/node";
import "./env.js";
import { initSentry } from "./sentry.js";
import { buildApp } from "./app.js";
import { boss } from "./queue/client.js";
import { registerOrderNotificationWorker } from "./notifications/order-notification.js";
import { registerRecurringBillingWorker } from "./billing/recurring-worker.js";
import { getBot } from "./bot/client.js";
import { registerStartHandler } from "./bot/start-handler.js";

initSentry();

const port = Number(process.env.API_PORT) || 3000;
const app = buildApp();

// Один процесс — и HTTP-сервер, и воркер очереди (см.
// STACK.md#фоновые-задачи): pg-boss не требует отдельного сервиса.
await boss.start();
await registerOrderNotificationWorker();
await registerRecurringBillingWorker();

// Long polling, не вебхук: без диплинка бот отвечает только на /start,
// отдельный HTTPS-роут и secret token ради одного апдейта — лишняя
// инфраструктура (Спринт 25). Опционален — без TELEGRAM_BOT_TOKEN сервер
// поднимается и так (см. bot/client.ts), просто без входящих апдейтов.
if (process.env.TELEGRAM_BOT_TOKEN) {
  const bot = getBot();
  registerStartHandler(bot);
  bot.catch((err) => {
    app.log.error(err.error);
    Sentry.captureException(err.error);
  });
  void bot.start();
}

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
