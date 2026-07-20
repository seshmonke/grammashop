import type { FastifyInstance } from "fastify";
import {
  registerSellerRequestSchema,
  registerSellerResponseSchema,
  sellerProfileSchema,
  updateSellerProfileRequestSchema,
} from "@grammashop/shared";
import { requireSellerId } from "../auth/access.js";
import {
  getSellerProfile,
  registerSeller,
  updateSellerProfile,
} from "../services/seller.service.js";

// /seller/register + /seller/profile — регистрация магазина до оплаты
// подписки и его профиль (см. CONCEPT.md#оплата-подписки-продавцом,
// Спринт 21). Регистрация не использует requireSellerId — у пользователя
// ещё нет продавца, ровно это она и создаёт.
export async function sellerRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.post("/seller/register", async (request, reply) => {
    if (request.user.sellerId !== null) {
      return reply.code(409).send({ error: "магазин уже зарегистрирован" });
    }
    if (!request.user.telegramUsername) {
      return reply.code(400).send({
        error:
          "нужен username в Telegram — задайте его в настройках приложения",
      });
    }

    const parsed = registerSellerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "некорректные данные регистрации" });
    }

    const result = await registerSeller(
      request.user.telegramId,
      request.user.telegramUsername,
      parsed.data,
    );
    if (!result.ok) {
      return reply.code(409).send({ error: "магазин уже зарегистрирован" });
    }

    return reply
      .code(201)
      .send(registerSellerResponseSchema.parse({ id: result.id }));
  });

  fastify.get("/seller/profile", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
    if (sellerId === null) return;

    const profile = await getSellerProfile(sellerId);
    if (!profile) {
      return reply.code(404).send({ error: "магазин не найден" });
    }
    return sellerProfileSchema.parse(profile);
  });

  fastify.patch("/seller/profile", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
    if (sellerId === null) return;

    const parsed = updateSellerProfileRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "некорректные данные профиля" });
    }

    const updated = await updateSellerProfile(sellerId, parsed.data);
    if (!updated) {
      return reply.code(404).send({ error: "магазин не найден" });
    }
    return sellerProfileSchema.parse(updated);
  });
}
