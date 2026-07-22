import type { FastifyInstance } from "fastify";
import {
  grantGraceRequestSchema,
  grantGraceResponseSchema,
  platformSellerListResponseSchema,
  updateSellerStatusRequestSchema,
  updateSellerStatusResponseSchema,
} from "@grammashop/shared";
import { requireAdmin } from "../auth/access.js";
import {
  grantGrace,
  listSellers,
  updateSellerStatus,
} from "../services/platform.service.js";

function parseIdParam(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

// /platform/* — платформенная админка владельца платформы (см.
// CONCEPT.md#интерфейсы-платформы). Доступ по request.user.isAdmin, не
// sellerId — requireAdmin (auth/access.ts), в отличие от /seller/*.
export async function platformRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/platform/sellers", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const list = await listSellers();
    return platformSellerListResponseSchema.parse({ sellers: list });
  });

  fastify.patch("/platform/sellers/:id/status", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const { id: raw } = request.params as { id: string };
    const sellerId = parseIdParam(raw);
    if (sellerId === null) {
      return reply.code(400).send({ error: "id должен быть числом" });
    }

    const parsed = updateSellerStatusRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "некорректный статус" });
    }

    const updated = await updateSellerStatus(
      sellerId,
      parsed.data.status,
      parsed.data.reason,
    );
    if (!updated) {
      return reply.code(404).send({ error: "продавец не найден" });
    }

    return updateSellerStatusResponseSchema.parse(updated);
  });

  fastify.patch("/platform/sellers/:id/grace", async (request, reply) => {
    if (!requireAdmin(request, reply)) return;

    const { id: raw } = request.params as { id: string };
    const sellerId = parseIdParam(raw);
    if (sellerId === null) {
      return reply.code(400).send({ error: "id должен быть числом" });
    }

    const parsed = grantGraceRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "months должен быть положительным целым числом" });
    }

    const result = await grantGrace(sellerId, parsed.data.months);
    if (!result) {
      return reply.code(404).send({ error: "продавец не найден" });
    }

    return grantGraceResponseSchema.parse(result);
  });
}
