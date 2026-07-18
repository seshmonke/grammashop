import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import { setupFastifyErrorHandler } from "@sentry/node";
import { healthRoutes } from "./routes/health.route.js";
import { authRoutes } from "./routes/auth.route.js";
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

  const app = Fastify({ logger: true });
  if (isAuthDevModeEnabled()) {
    app.log.warn(
      "AUTH_DEV_MODE включён: /auth принимает mock-initData без проверки " +
        "подписи — только для локальной отладки вне Telegram",
    );
  }
  app.register(cors, {
    origin: `http://localhost:${process.env["WEB_PORT"] ?? "5173"}`,
  });
  app.register(jwt, { secret: jwtSecret });
  // global: false — лимиты вешаются точечно через config.rateLimit роута
  // (сейчас только /auth), а не на всё API разом.
  app.register(rateLimit, { global: false });
  app.register(healthRoutes);
  app.register(authRoutes);
  if (process.env["SENTRY_DSN_API"]) {
    setupFastifyErrorHandler(app);
  }
  return app;
}
