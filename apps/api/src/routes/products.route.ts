import type { FastifyInstance } from "fastify";
import {
  createProductRequestSchema,
  productImageMoveRequestSchema,
  productImagesResponseSchema,
  productImportResponseSchema,
  productVariantInputSchema,
  productVariantUpdateSchema,
  publishAllResponseSchema,
  sellerProductListResponseSchema,
  sellerProductSchema,
  updateProductRequestSchema,
  updateProductStatusRequestSchema,
} from "@grammashop/shared";
import { requireSellerId } from "../auth/access.js";
import {
  addVariant,
  createProduct,
  deleteProduct,
  deleteVariant,
  listSellerProducts,
  publishAllDrafts,
  setProductStatus,
  updateProduct,
  updateVariant,
} from "../services/products.service.js";
import {
  addProductImage,
  deleteProductImage,
  moveProductImage,
} from "../services/product-images.service.js";
import { importProducts } from "../services/products-import.service.js";

const XLSX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// /seller/products — продавцовская админка товаров (CRUD, см.
// STACK.md#роутинг). В отличие от /shop/:sellerId, здесь мало валидного
// JWT — нужна привязанная запись продавца (request.user.sellerId), иначе
// покупатель мог бы редактировать чужой каталог. requireSellerId — общий
// хелпер (auth/access.ts), перепроверяет статус продавца по БД.
function parseIdParam(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function productsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", fastify.authenticate);

  fastify.get("/seller/products", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
    if (sellerId === null) return;

    const list = await listSellerProducts(sellerId);
    return sellerProductListResponseSchema.parse({ products: list });
  });

  fastify.post("/seller/products", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
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

  // Массовая публикация черновиков — статичный путь, регистрируется до
  // параметрического /seller/products/:id (Fastify всё равно матчит
  // статику раньше, но держим рядом с созданием по смыслу). См.
  // CONCEPT.md#жизненный-цикл-сущностей.
  fastify.post("/seller/products/publish-all", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
    if (sellerId === null) return;

    const publishedCount = await publishAllDrafts(sellerId);
    return publishAllResponseSchema.parse({ publishedCount });
  });

  fastify.patch("/seller/products/:id", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
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

  // Публикация/снятие карточки (active↔hidden). Отдельный эндпоинт от
  // общего PATCH карточки: у публикации своя проверка (≥1 варианта) и
  // отдельный смысл для UI («Опубликовать / Снять с витрины»). См.
  // CONCEPT.md#жизненный-цикл-сущностей.
  fastify.patch("/seller/products/:id/status", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
    if (sellerId === null) return;

    const { id: raw } = request.params as { id: string };
    const productId = parseIdParam(raw);
    if (productId === null) {
      return reply.code(400).send({ error: "id должен быть числом" });
    }

    const parsed = updateProductStatusRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "некорректный статус" });
    }

    const result = await setProductStatus(sellerId, productId, parsed.data.status);
    if (!result.ok) {
      if (result.reason === "no_variants") {
        return reply
          .code(400)
          .send({ error: "нельзя опубликовать карточку без вариантов" });
      }
      return reply.code(404).send({ error: "карточка не найдена" });
    }

    return sellerProductSchema.parse(result.product);
  });

  fastify.delete("/seller/products/:id", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
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

  fastify.post("/seller/products/:id/images", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
    if (sellerId === null) return;

    const { id: raw } = request.params as { id: string };
    const productId = parseIdParam(raw);
    if (productId === null) {
      return reply.code(400).send({ error: "id должен быть числом" });
    }

    let file;
    try {
      file = await request.file();
    } catch {
      return reply.code(400).send({ error: "файл слишком большой (максимум 8 МБ)" });
    }
    if (!file) {
      return reply.code(400).send({ error: "файл не передан" });
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      return reply.code(400).send({ error: "файл слишком большой (максимум 8 МБ)" });
    }

    const result = await addProductImage(sellerId, productId, {
      buffer,
      mimetype: file.mimetype,
    });
    if (!result.ok) {
      if (result.reason === "not_found") {
        return reply.code(404).send({ error: "карточка не найдена" });
      }
      if (result.reason === "image_limit") {
        return reply.code(400).send({ error: "лимит фото на карточку исчерпан (5)" });
      }
      return reply.code(400).send({ error: "некорректный файл изображения" });
    }

    return productImagesResponseSchema.parse({ images: result.images });
  });

  fastify.delete(
    "/seller/products/:id/images/:imageId",
    async (request, reply) => {
      const sellerId = await requireSellerId(request, reply);
      if (sellerId === null) return;

      const { id: rawId, imageId: rawImageId } = request.params as {
        id: string;
        imageId: string;
      };
      const productId = parseIdParam(rawId);
      const imageId = parseIdParam(rawImageId);
      if (productId === null || imageId === null) {
        return reply.code(400).send({ error: "id должен быть числом" });
      }

      const result = await deleteProductImage(sellerId, productId, imageId);
      if (!result.ok) {
        return reply.code(404).send({ error: "фото не найдено" });
      }

      return reply.code(204).send();
    },
  );

  fastify.patch(
    "/seller/products/:id/images/:imageId/move",
    async (request, reply) => {
      const sellerId = await requireSellerId(request, reply);
      if (sellerId === null) return;

      const { id: rawId, imageId: rawImageId } = request.params as {
        id: string;
        imageId: string;
      };
      const productId = parseIdParam(rawId);
      const imageId = parseIdParam(rawImageId);
      if (productId === null || imageId === null) {
        return reply.code(400).send({ error: "id должен быть числом" });
      }

      const parsed = productImageMoveRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "некорректное направление" });
      }

      const result = await moveProductImage(
        sellerId,
        productId,
        imageId,
        parsed.data.direction,
      );
      if (!result.ok) {
        return reply.code(404).send({ error: "фото не найдено" });
      }

      return productImagesResponseSchema.parse({ images: result.images });
    },
  );

  fastify.post("/seller/products/:id/variants", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
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
      const sellerId = await requireSellerId(request, reply);
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

      const result = await updateVariant(
        sellerId,
        productId,
        variantId,
        parsed.data,
      );
      if (!result.ok) {
        if (result.reason === "invalid_price") {
          return reply.code(400).send({
            error: "базовая цена не может быть ниже цены со скидкой",
          });
        }
        return reply.code(404).send({ error: "вариант не найден" });
      }

      return result.variant;
    },
  );

  fastify.post("/seller/products/import", async (request, reply) => {
    const sellerId = await requireSellerId(request, reply);
    if (sellerId === null) return;

    let file;
    try {
      file = await request.file();
    } catch {
      return reply.code(400).send({ error: "файл слишком большой (максимум 8 МБ)" });
    }
    if (!file) {
      return reply.code(400).send({ error: "файл не передан" });
    }
    if (file.mimetype !== XLSX_MIME_TYPE) {
      return reply.code(400).send({ error: "поддерживается только .xlsx" });
    }

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch {
      return reply.code(400).send({ error: "файл слишком большой (максимум 8 МБ)" });
    }

    let result;
    try {
      result = await importProducts(sellerId, buffer);
    } catch {
      return reply.code(400).send({ error: "не удалось разобрать файл — проверьте, что это .xlsx по шаблону" });
    }

    return productImportResponseSchema.parse(result);
  });

  fastify.delete(
    "/seller/products/:id/variants/:variantId",
    async (request, reply) => {
      const sellerId = await requireSellerId(request, reply);
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
