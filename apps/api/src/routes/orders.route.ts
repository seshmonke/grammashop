import type { FastifyInstance } from "fastify";
import {
  buyerOrderListResponseSchema,
  buyerOrderSchema,
  checkoutPrefillResponseSchema,
  createOrderRequestSchema,
  createOrderResponseSchema,
  INSUFFICIENT_STOCK_ERROR,
  sellerOrderListResponseSchema,
  sellerOrderSchema,
  updateOrderStatusRequestSchema,
} from "@grammashop/shared";
import { requireSellerId } from "../auth/access.js";
import {
  cancelOwnOrder,
  createOrder,
  getCheckoutPrefill,
  listBuyerOrders,
  listSellerOrders,
  updateOrderStatus,
} from "../services/orders.service.js";

// /seller/orders — тот же общий requireSellerId (auth/access.ts), что и в
// routes/products.route.ts (покупатель/JWT без sellerId не может смотреть
// или менять статус заказов; статус продавца перепроверяется по БД).
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
          return reply.code(400).send({ error: INSUFFICIENT_STOCK_ERROR });
        }
        return reply.code(404).send({ error: "магазин или товар не найден" });
      }

      return reply.code(201).send(createOrderResponseSchema.parse(result.order));
    },
  );

  // GET /shop/:sellerId/orders/mine — «мои заказы» покупателя в конкретном
  // магазине (см. CONCEPT.md#каталог-и-заказы). Пересматривает Спринт 34:
  // список был сквозным по всем магазинам платформы, сужен до магазина,
  // в который зашёл покупатель по диплинку (решение 23.07.2026, Спринт 40
  // — у покупателя сейчас нет экрана вне контекста магазина, сквозной
  // список убран целиком, не оставлен отдельной точкой входа). Любой
  // авторизованный Telegram-пользователь, не только владелец магазина —
  // тот же принцип авторизации, что у чекаута выше (fastify.authenticate
  // без requireSellerId).
  fastify.get(
    "/shop/:sellerId/orders/mine",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { sellerId: raw } = request.params as { sellerId: string };
      const sellerId = Number(raw);
      if (!Number.isInteger(sellerId) || sellerId <= 0) {
        return reply.code(400).send({ error: "sellerId должен быть числом" });
      }

      const list = await listBuyerOrders(sellerId, request.user.telegramId);
      return buyerOrderListResponseSchema.parse({ orders: list });
    },
  );

  // GET /shop/:sellerId/orders/prefill — автоподстановка чекаута из
  // последнего заказа покупателя в этом магазине (см.
  // CONCEPT.md#жизненный-цикл-сущностей). Тот же принцип авторизации, что и
  // у /orders/mine: любой авторизованный Telegram-пользователь читает
  // только свой снапшот (по request.user.telegramId), чужие данные
  // недоступны. ПДн не логируются.
  fastify.get(
    "/shop/:sellerId/orders/prefill",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { sellerId: raw } = request.params as { sellerId: string };
      const sellerId = Number(raw);
      if (!Number.isInteger(sellerId) || sellerId <= 0) {
        return reply.code(400).send({ error: "sellerId должен быть числом" });
      }

      const prefill = await getCheckoutPrefill(sellerId, request.user.telegramId);
      return checkoutPrefillResponseSchema.parse({ prefill });
    },
  );

  // POST /shop/:sellerId/orders/:id/cancel — отмена заказа покупателем, пока
  // он new (см. CONCEPT.md#каталог-и-заказы). Per-shop, как /orders/mine:
  // авторизация по request.user.telegramId (владелец заказа, не продавец),
  // requireSellerId здесь не к месту. Чужой/несуществующий заказ → 404 (не
  // раскрываем существование); отмена не из new → 409.
  fastify.post(
    "/shop/:sellerId/orders/:id/cancel",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { sellerId: rawSeller, id: rawId } = request.params as {
        sellerId: string;
        id: string;
      };
      const sellerId = Number(rawSeller);
      if (!Number.isInteger(sellerId) || sellerId <= 0) {
        return reply.code(400).send({ error: "sellerId должен быть числом" });
      }
      const orderId = parseIdParam(rawId);
      if (orderId === null) {
        return reply.code(400).send({ error: "id должен быть числом" });
      }

      const result = await cancelOwnOrder(sellerId, request.user.telegramId, orderId);
      if (!result.ok) {
        if (result.reason === "not_found") {
          return reply.code(404).send({ error: "заказ не найден" });
        }
        return reply.code(409).send({ error: "заказ уже нельзя отменить" });
      }

      return buyerOrderSchema.parse(result.order);
    },
  );

  fastify.get(
    "/seller/orders",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const sellerId = await requireSellerId(request, reply);
      if (sellerId === null) return;

      const list = await listSellerOrders(sellerId);
      return sellerOrderListResponseSchema.parse({ orders: list });
    },
  );

  fastify.patch(
    "/seller/orders/:id/status",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const sellerId = await requireSellerId(request, reply);
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
