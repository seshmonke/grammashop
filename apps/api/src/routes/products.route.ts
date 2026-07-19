import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  createProductRequestSchema,
  productVariantInputSchema,
  productVariantUpdateSchema,
  sellerProductListResponseSchema,
  sellerProductSchema,
  updateProductRequestSchema,
} from "@grammashop/shared";
import {
  addVariant,
  createProduct,
  deleteProduct,
  deleteVariant,
  listSellerProducts,
  updateProduct,
  updateVariant,
} from "../services/products.service.js";

// /seller/products — продавцовская админка товаров (CRUD, см.
// STACK.md#роутинг). В отличие от /shop/:sellerId, здесь мало валидного
// JWT — нужна привязанная запись продавца (request.user.sellerId), иначе
// покупатель мог бы редактировать чужой каталог.
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

export async function productsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/seller/products", async (request, reply) => {
    const sellerId = requireSellerId(request, reply);
    if (sellerId === null) return;

    const list = await listSellerProducts(sellerId);
    return sellerProductListResponseSchema.parse({ products: list });
  });

  fastify.post("/seller/products", async (request, reply) => {
    const sellerId = requireSellerId(request, reply);
    if (sellerId === null) return;

    const parsed = createProductRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "некорректные данные карточки" });
    }

    const result = await createProduct(sellerId, parsed.data);
    if (!result.ok) {
      return reply
        .code(400)
        .send({ error: "лимит карточек товара исчерпан (30 на Тарифе 1)" });
    }

    return reply.code(201).send(sellerProductSchema.parse(result.product));
  });

  fastify.patch("/seller/products/:id", async (request, reply) => {
    const sellerId = requireSellerId(request, reply);
    if (sellerId === null) return;

    const { id: raw } = request.params as { id: string };
    const productId = parseIdParam(raw);
    if (productId === null) {
      return reply.code(400).send({ error: "id должен быть числом" });
    }

    const parsed = updateProductRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "некорректные данные карточки" });
    }

    const updated = await updateProduct(sellerId, productId, parsed.data);
    if (!updated) {
      return reply.code(404).send({ error: "карточка не найдена" });
    }

    return sellerProductSchema.parse(updated);
  });

  fastify.delete("/seller/products/:id", async (request, reply) => {
    const sellerId = requireSellerId(request, reply);
    if (sellerId === null) return;

    const { id: raw } = request.params as { id: string };
    const productId = parseIdParam(raw);
    if (productId === null) {
      return reply.code(400).send({ error: "id должен быть числом" });
    }

    const deleted = await deleteProduct(sellerId, productId);
    if (!deleted) {
      return reply.code(404).send({ error: "карточка не найдена" });
    }

    return reply.code(204).send();
  });

  fastify.post("/seller/products/:id/variants", async (request, reply) => {
    const sellerId = requireSellerId(request, reply);
    if (sellerId === null) return;

    const { id: raw } = request.params as { id: string };
    const productId = parseIdParam(raw);
    if (productId === null) {
      return reply.code(400).send({ error: "id должен быть числом" });
    }

    const parsed = productVariantInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "некорректные данные варианта" });
    }

    const result = await addVariant(sellerId, productId, parsed.data);
    if (!result.ok) {
      if (result.reason === "not_found") {
        return reply.code(404).send({ error: "карточка не найдена" });
      }
      return reply
        .code(400)
        .send({ error: "лимит вариантов на карточку исчерпан (10)" });
    }

    return reply.code(201).send(result.variant);
  });

  fastify.patch(
    "/seller/products/:id/variants/:variantId",
    async (request, reply) => {
      const sellerId = requireSellerId(request, reply);
      if (sellerId === null) return;

      const { id: rawId, variantId: rawVariantId } = request.params as {
        id: string;
        variantId: string;
      };
      const productId = parseIdParam(rawId);
      const variantId = parseIdParam(rawVariantId);
      if (productId === null || variantId === null) {
        return reply.code(400).send({ error: "id должен быть числом" });
      }

      const parsed = productVariantUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "некорректные данные варианта" });
      }

      const updated = await updateVariant(
        sellerId,
        productId,
        variantId,
        parsed.data,
      );
      if (!updated) {
        return reply.code(404).send({ error: "вариант не найден" });
      }

      return updated;
    },
  );

  fastify.delete(
    "/seller/products/:id/variants/:variantId",
    async (request, reply) => {
      const sellerId = requireSellerId(request, reply);
      if (sellerId === null) return;

      const { id: rawId, variantId: rawVariantId } = request.params as {
        id: string;
        variantId: string;
      };
      const productId = parseIdParam(rawId);
      const variantId = parseIdParam(rawVariantId);
      if (productId === null || variantId === null) {
        return reply.code(400).send({ error: "id должен быть числом" });
      }

      const result = await deleteVariant(sellerId, productId, variantId);
      if (!result.ok) {
        if (result.reason === "not_found") {
          return reply.code(404).send({ error: "вариант не найден" });
        }
        return reply
          .code(400)
          .send({ error: "нельзя удалить последний вариант карточки" });
      }

      return reply.code(204).send();
    },
  );
}
