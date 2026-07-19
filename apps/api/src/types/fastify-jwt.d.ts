import type { FastifyReply, FastifyRequest } from "fastify";

// Типы полезной нагрузки JWT (совпадают с тем, что кладёт /auth, см.
// routes/auth.route.ts) и декоратора authenticate (app.ts).

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { telegramId: number; sellerId: number | null; isAdmin: boolean };
    user: { telegramId: number; sellerId: number | null; isAdmin: boolean };
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
