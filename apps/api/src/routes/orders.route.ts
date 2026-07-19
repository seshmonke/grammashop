import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createOrderRequestSchema,
  createOrderResponseSchema,
  sellerOrderListResponseSchema,
  sellerOrderSchema,
  updateOrderStatusRequestSchema,
} from "@grammashop/shared";
import { createOrder, listSellerOrders, updateOrderStatus } from "../services/orders.service.js";

// /seller/orders — та же проверка sellerId из JWT, что и в
// routes/products.route.ts (покупатель/JWT без sellerId не может смотреть
// или менять статус заказов).
function requireSellerId(request: FastifyRequest, reply: FastifyReply): number | null {
  const sellerId = request.user.sellerId;
  if (sellerId === null) {
    reply.code(403).send({ error: "доступно только продавцу" });
    return null;
  }
  return sellerId;
}

function parseIdParam(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

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

  fastify.get(
    "/seller/orders",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const sellerId = requireSellerId(request, reply);
      if (sellerId === null) return;

      const list = await listSellerOrders(sellerId);
      return sellerOrderListResponseSchema.parse({ orders: list });
    },
  );

  fastify.patch(
    "/seller/orders/:id/status",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const sellerId = requireSellerId(request, reply);
      if (sellerId === null) return;

      const { id: raw } = request.params as { id: string };
      const orderId = parseIdParam(raw);
      if (orderId === null) {
        return reply.code(400).send({ error: "id должен быть числом" });
      }

      const parsed = updateOrderStatusRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "некорректный статус" });
      }

      const result = await updateOrderStatus(sellerId, orderId, parsed.data.status);
      if (!result.ok) {
        if (result.reason === "not_found") {
          return reply.code(404).send({ error: "заказ не найден" });
        }
        return reply.code(400).send({ error: "недопустимый переход статуса" });
      }

      return sellerOrderSchema.parse(result.order);
    },
  );
}
