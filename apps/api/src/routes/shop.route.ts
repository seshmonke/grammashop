import type { FastifyInstance } from "fastify";
import { shopCatalogResponseSchema } from "@grammashop/shared";
import { getShopCatalog } from "../services/shop.service.js";

// GET /shop/:sellerId — публичная витрина продавца (см. STACK.md#роутинг).
// Требует валидный JWT (любая роль): в ТМА покупатель всегда авторизован,
// а единый auth-контур отсекает анонимный скрейпинг и даёт точку для
// будущего rate-limit. Роль не проверяем — любой видит любую витрину.
export async function shopRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/shop/:sellerId",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { sellerId: raw } = request.params as { sellerId: string };
      const sellerId = Number(raw);
      if (!Number.isInteger(sellerId) || sellerId <= 0) {
        return reply.code(400).send({ error: "sellerId должен быть числом" });
      }

      const catalog = await getShopCatalog(sellerId);
      if (!catalog) {
        return reply.code(404).send({ error: "магазин не найден" });
      }

      return shopCatalogResponseSchema.parse(catalog);
    },
  );
}
