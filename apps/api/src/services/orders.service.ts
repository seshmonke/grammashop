import { and, eq, inArray } from "drizzle-orm";
import type { CreateOrderRequest, CreateOrderResponse } from "@grammashop/shared";
import { db } from "../db/client.js";
import { orderItems, orders, products, productVariants, sellers } from "../db/schema.js";
import { enqueueOrderNotification } from "../notifications/order-notification.js";

// Создание заказа (см. CONCEPT.md#каталог-и-заказы, STACK.md#доменная-схема-v1).
// Всё — в одной транзакции с блокировкой строк вариантов (`for("update")"):
// проверка остатка и его списание не должны разъезжаться при параллельных
// заказах на один и тот же вариант.
export async function createOrder(
  sellerId: number,
  buyerTelegramId: number,
  input: CreateOrderRequest,
): Promise<
  | { ok: true; order: CreateOrderResponse }
  | { ok: false; reason: "seller_not_found" | "variant_not_found" | "insufficient_stock" }
> {
  const result = await db.transaction(async (tx): Promise<
    | { ok: true; order: CreateOrderResponse }
    | { ok: false; reason: "seller_not_found" | "variant_not_found" | "insufficient_stock" }
  > => {
    const [seller] = await tx
      .select({
        id: sellers.id,
        telegramUsername: sellers.telegramUsername,
        paymentDetails: sellers.paymentDetails,
      })
      .from(sellers)
      .where(and(eq(sellers.id, sellerId), eq(sellers.status, "active")));
    if (!seller) return { ok: false, reason: "seller_not_found" };

    const variantIds = [...new Set(input.items.map((i) => i.variantId))];
    const rows = await tx
      .select({
        variantId: productVariants.id,
        sellerId: products.sellerId,
        productName: products.name,
        variantName: productVariants.name,
        priceKopecks: productVariants.priceKopecks,
        stock: productVariants.stock,
      })
      .from(productVariants)
      .innerJoin(products, eq(productVariants.productId, products.id))
      .where(inArray(productVariants.id, variantIds))
      .for("update");

    const byVariantId = new Map(
      rows.filter((r) => r.sellerId === sellerId).map((r) => [r.variantId, r]),
    );

    // Ownership и наличие проверяются до всех записей — частично применённой
    // корзины быть не должно.
    const quantityByVariant = new Map<number, number>();
    for (const item of input.items) {
      if (!byVariantId.has(item.variantId)) {
        return { ok: false, reason: "variant_not_found" };
      }
      quantityByVariant.set(
        item.variantId,
        (quantityByVariant.get(item.variantId) ?? 0) + item.quantity,
      );
    }
    for (const [variantId, quantity] of quantityByVariant) {
      const row = byVariantId.get(variantId)!;
      if (row.stock !== null && row.stock < quantity) {
        return { ok: false, reason: "insufficient_stock" };
      }
    }

    const totalKopecks = input.items.reduce(
      (sum, item) => sum + byVariantId.get(item.variantId)!.priceKopecks * item.quantity,
      0,
    );

    const [order] = await tx
      .insert(orders)
      .values({
        sellerId,
        buyerTelegramId,
        status: "new",
        buyerFullName: input.buyerFullName,
        buyerPhone: input.buyerPhone,
        buyerAddress: input.buyerAddress,
        buyerComment: input.buyerComment ?? null,
        consentAt: new Date(),
        totalKopecks,
      })
      .returning({ id: orders.id, status: orders.status, totalKopecks: orders.totalKopecks });

    const insertedItems = await tx
      .insert(orderItems)
      .values(
        input.items.map((item) => {
          const row = byVariantId.get(item.variantId)!;
          return {
            orderId: order!.id,
            variantId: item.variantId,
            productNameSnapshot: row.productName,
            variantNameSnapshot: row.variantName,
            priceKopecks: row.priceKopecks,
            quantity: item.quantity,
          };
        }),
      )
      .returning({
        variantId: orderItems.variantId,
        productName: orderItems.productNameSnapshot,
        variantName: orderItems.variantNameSnapshot,
        priceKopecks: orderItems.priceKopecks,
        quantity: orderItems.quantity,
      });

    for (const [variantId, quantity] of quantityByVariant) {
      const row = byVariantId.get(variantId)!;
      if (row.stock !== null) {
        await tx
          .update(productVariants)
          .set({ stock: row.stock - quantity })
          .where(eq(productVariants.id, variantId));
      }
    }

    return {
      ok: true,
      order: {
        id: order!.id,
        status: order!.status,
        totalKopecks: order!.totalKopecks,
        items: insertedItems,
        seller: {
          telegramUsername: seller.telegramUsername,
          paymentDetails: seller.paymentDetails,
        },
      },
    };
  });

  // Вне транзакции и не блокируя ответ покупателю (см.
  // notifications/order-notification.ts): очередь — своя, отдельная от БД
  // заказа схема, откатывать её вместе с транзакцией заказа незачем, а
  // энкью не должен успеть раньше коммита заказа.
  if (result.ok) {
    await enqueueOrderNotification(result.order.id);
  }
  return result;
}
