import type { FastifyReply, FastifyRequest } from "fastify";

// Типы полезной нагрузки JWT (совпадают с тем, что кладёт /auth, см.
// routes/auth.route.ts) и декоратора authenticate (app.ts).

interface JwtPayload {
  telegramId: number;
  // null — у пользователя не задан username в Telegram (см.
  // packages/shared/src/schemas/auth.ts).
  telegramUsername: string | null;
  sellerId: number | null;
  isAdmin: boolean;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module "fastify" {
  interface FastifyInstance {
    // preHandler для доменных роутов: проверяет JWT, на провале — 401.
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}
