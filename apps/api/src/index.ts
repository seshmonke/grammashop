import "./env.js";
import { initSentry } from "./sentry.js";
import { buildApp } from "./app.js";
import { boss } from "./queue/client.js";
import { registerOrderNotificationWorker } from "./notifications/order-notification.js";

initSentry();

const port = Number(process.env.API_PORT) || 3000;
const app = buildApp();

// Один процесс — и HTTP-сервер, и воркер очереди (см.
// STACK.md#фоновые-задачи): pg-boss не требует отдельного сервиса.
await boss.start();
await registerOrderNotificationWorker();

app.listen({ port, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
