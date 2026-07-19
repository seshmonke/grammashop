import type { FastifyInstance } from "fastify";
import { createOrderRequestSchema, createOrderResponseSchema } from "@grammashop/shared";
import { createOrder } from "../services/orders.service.js";

// POST /shop/:sellerId/orders — оформление заказа (см.
// CONCEPT.md#каталог-и-заказы). Rate-limit сразу, не после первого абьюза
// (тот же принцип, что и у /auth, см. routes/auth.route.ts).
export async function ordersRoutes(fastify: FastifyInstance): Promise<void> {
  const rateLimitMax = Number(process.env.ORDERS_RATE_LIMIT_MAX ?? 20);

  fastify.post(
    "/shop/:sellerId/orders",
    {
      preHandler: [fastify.authenticate],
      config: {
        rateLimit: { max: rateLimitMax, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      const { sellerId: raw } = request.params as { sellerId: string };
      const sellerId = Number(raw);
      if (!Number.isInteger(sellerId) || sellerId <= 0) {
        return reply.code(400).send({ error: "sellerId должен быть числом" });
      }

      const parsed = createOrderRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "некорректные данные заказа" });
      }

      const result = await createOrder(
        sellerId,
        request.user.telegramId,
        parsed.data,
      );
      if (!result.ok) {
        if (result.reason === "insufficient_stock") {
          return reply.code(400).send({ error: "недостаточно остатка" });
        }
        return reply.code(404).send({ error: "магазин или товар не найден" });
      }

      return reply.code(201).send(createOrderResponseSchema.parse(result.order));
    },
  );
}
