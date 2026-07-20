import type { FastifyInstance } from "fastify";
import { authRequestSchema, authResponseSchema } from "@grammashop/shared";
import { verifyInitData, InitDataError } from "../auth/init-data.js";
import {
  isAuthDevModeEnabled,
  parseDevInitData,
} from "../auth/dev-mode.js";
import { resolveAuthContext } from "../services/auth.service.js";

// POST /auth: initData из Telegram SDK → проверка HMAC-подписи → резолв
// способностей → короткоживущий сессионный JWT (см. STACK.md#авторизация).
// initData старше 24ч отвергается — окно повторного использования
// перехваченной строки ограничено. Тело запроса и ПДн из initData не
// логируются и не попадают в ответные ошибки (152-ФЗ).
const INIT_DATA_MAX_AGE_SECONDS = 60 * 60 * 24;
const SESSION_TTL = "1h";

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const rateLimitMax = Number(process.env.AUTH_RATE_LIMIT_MAX ?? 20);

  fastify.post(
    "/auth",
    {
      config: {
        // Брутфорс подписи initData дорогой сам по себе, но лимит сразу —
        // пункт из ревью (см. TASKS.md), а не после первого абьюза.
        rateLimit: { max: rateLimitMax, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const parsed = authRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "initData обязателен" });
      }

      let telegramId: number;
      let telegramUsername: string | null;
      try {
        if (isAuthDevModeEnabled()) {
          // Dev-режим: mock-initData без подписи (см. auth/dev-mode.ts).
          // Активен только вне production, buildApp падает на старте, если
          // флаг выставлен в проде.
          const user = parseDevInitData(parsed.data.initData);
          telegramId = user.id;
          telegramUsername = user.username ?? null;
        } else {
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          if (!botToken) {
            // Конфигурационная ошибка сервера, не клиента.
            throw new Error(
              "TELEGRAM_BOT_TOKEN не задан — /auth неработоспособен",
            );
          }
          const verified = verifyInitData(parsed.data.initData, botToken, {
            maxAgeSeconds: INIT_DATA_MAX_AGE_SECONDS,
          });
          telegramId = verified.user.id;
          telegramUsername = verified.user.username ?? null;
        }
      } catch (err) {
        if (err instanceof InitDataError) {
          // Без деталей: чем именно не сошлось — подсказка для подбора.
          return reply.code(401).send({ error: "initData не прошёл проверку" });
        }
        throw err;
      }

      const context = await resolveAuthContext(telegramId);
      const token = fastify.jwt.sign(
        {
          telegramId: context.telegramId,
          telegramUsername,
          sellerId: context.sellerId,
          isAdmin: context.isAdmin,
        },
        { expiresIn: SESSION_TTL },
      );

      return authResponseSchema.parse({ token, telegramUsername, ...context });
    },
  );
}
