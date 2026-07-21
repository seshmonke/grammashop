import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { setupFastifyErrorHandler } from "@sentry/node";
import { healthRoutes } from "./routes/health.route.js";
import { authRoutes } from "./routes/auth.route.js";
import { sellerRoutes } from "./routes/seller.route.js";
import { shopRoutes } from "./routes/shop.route.js";
import { productsRoutes } from "./routes/products.route.js";
import { ordersRoutes } from "./routes/orders.route.js";
import { platformRoutes } from "./routes/platform.route.js";
import { assertAuthDevModeSafe, isAuthDevModeEnabled } from "./auth/dev-mode.js";

export function buildApp(): FastifyInstance {
  const jwtSecret = process.env["JWT_SECRET"];
  if (!jwtSecret) {
    // Fail-fast на старте: без секрета сессии не подписать, молча
    // подниматься с дырой в авторизации нельзя.
    throw new Error("JWT_SECRET не задан — см. .env.example");
  }
  // Fail-fast: dev-байпас проверки подписи initData, выставленный в проде,
  // валит старт, а не поднимается с дырой (см. auth/dev-mode.ts).
  assertAuthDevModeSafe();

  // trustProxy: единственная точка входа снаружи — Caddy (порты
  // api/postgres/web не публикуются, см. docker-compose.prod.yml), поэтому
  // безопасно доверять X-Forwarded-For целиком. Без этого Fastify видит
  // IP прокси-контейнера, и rate limit на /auth делит один счётчик на
  // всех пользователей.
  const app = Fastify({ logger: true, trustProxy: true });
  if (isAuthDevModeEnabled()) {
    app.log.warn(
      "AUTH_DEV_MODE включён: /auth принимает mock-initData без проверки " +
        "подписи — только для локальной отладки вне Telegram",
    );
  }
  // Только вне прода: в проде фронт и бэк — один origin через Caddy
  // (см. STACK.md#хостинг-и-деплой), CORS не нужен, а разрешать
  // localhost на бою — дыра просто так (ревью 21.07.2026, п.7).
  if (process.env["NODE_ENV"] !== "production") {
    app.register(cors, {
      origin: `http://localhost:${process.env["WEB_PORT"] ?? "5173"}`,
    });
  }
  app.register(jwt, { secret: jwtSecret });
  // Лимит 8 МБ на файл — режет запрос до того, как он весь окажется в
  // памяти (см. STACK.md#пайплайн-фото-товара-спринт-16).
  app.register(multipart, {
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  });
  // preHandler для доменных роутов: валидный JWT обязателен, иначе 401.
  // Способности берутся из request.user (payload /auth), роль-специфичные
  // проверки — уже в самих роутах.
  app.decorate(
    "authenticate",
    async function (request, reply): Promise<void> {
      try {
        await request.jwtVerify();
      } catch {
        // Без деталей: что именно не так с токеном — не подсказываем.
        await reply.code(401).send({ error: "требуется авторизация" });
      }
    },
  );
  // global: false — лимиты вешаются точечно через config.rateLimit роута
  // (сейчас только /auth), а не на всё API разом.
  app.register(rateLimit, { global: false });
  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(sellerRoutes);
  app.register(shopRoutes);
  app.register(productsRoutes);
  app.register(ordersRoutes);
  app.register(platformRoutes);
  if (process.env["SENTRY_DSN_API"]) {
    setupFastifyErrorHandler(app);
  }
  return app;
}
