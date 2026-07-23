import type { FastifyInstance } from "fastify";
import {
  deleteSellerRequestSchema,
  registerSellerRequestSchema,
  registerSellerResponseSchema,
  restoreSellerResponseSchema,
  sellerProfileSchema,
  updateSellerProfileRequestSchema,
} from "@grammashop/shared";
import { requireSellerId } from "../auth/access.js";
import {
  deleteSeller,
  getSellerProfile,
  registerSeller,
  restoreSeller,
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

  // Самоудаление — requireSellerId проходит нормально: на этот момент
  // продавец ещё active (см. Спринт 37).
  fastify.post("/seller/delete", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
    if (sellerId === null) return;

    const parsed = deleteSellerRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "нужна причина удаления" });
    }

    const result = await deleteSeller(sellerId, parsed.data.reason);
    if (!result) {
      return reply.code(404).send({ error: "магазин не найден" });
    }
    return reply.code(204).send();
  });

  // Восстановление самим продавцом — не через requireSellerId: после
  // удаления sellerId в сессии null (см. auth/access.ts), резолвим по
  // telegramId, как и /seller/register.
  fastify.post("/seller/restore", async (request, reply) => {
    const result = await restoreSeller(request.user.telegramId);
    if (!result) {
      return reply.code(404).send({ error: "магазин не найден" });
    }
    if (!result.ok) {
      const message =
        result.reason === "window-expired"
          ? "окно восстановления истекло"
          : "магазин не удалён";
      return reply.code(409).send({ error: message });
    }
    return restoreSellerResponseSchema.parse({ id: result.id });
  });
}
