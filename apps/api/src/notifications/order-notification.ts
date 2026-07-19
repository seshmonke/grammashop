import { eq } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import { getBot } from "../bot/client.js";
import { db } from "../db/client.js";
import { orderItems, orders, sellers } from "../db/schema.js";
import { boss, ORDER_NOTIFICATION_QUEUE } from "../queue/client.js";

// Уведомление продавца о новом заказе через платформенного бота (см.
// CONCEPT.md#каталог-и-заказы, STACK.md#telegram-бот) — фоновая job на
// pg-boss, не блокирует ответ покупателю на POST /shop/:sellerId/orders.

export type OrderNotificationJobData = { orderId: number };

type OrderNotificationData = {
  order: {
    id: number;
    totalKopecks: number;
    buyerFullName: string;
    buyerPhone: string;
    buyerAddress: string;
    buyerComment: string | null;
  };
  items: Array<{ productName: string; variantName: string; quantity: number }>;
};

function formatRubles(kopecks: number): string {
  return `${(kopecks / 100).toFixed(2)} ₽`;
}

export function formatOrderNotificationText(data: OrderNotificationData): string {
  const { order, items } = data;
  const lines = [
    `Новый заказ #${order.id} на ${formatRubles(order.totalKopecks)}`,
    ...items.map((i) => `${i.productName} (${i.variantName}) × ${i.quantity}`),
    `Покупатель: ${order.buyerFullName}, ${order.buyerPhone}`,
    `Адрес: ${order.buyerAddress}`,
  ];
  if (order.buyerComment) {
    lines.push(`Комментарий: ${order.buyerComment}`);
  }
  return lines.join("\n");
}

async function loadOrderNotificationData(
  orderId: number,
): Promise<{ sellerTelegramId: number; data: OrderNotificationData } | null> {
  const [order] = await db
    .select({
      id: orders.id,
      sellerId: orders.sellerId,
      totalKopecks: orders.totalKopecks,
      buyerFullName: orders.buyerFullName,
      buyerPhone: orders.buyerPhone,
      buyerAddress: orders.buyerAddress,
      buyerComment: orders.buyerComment,
    })
    .from(orders)
    .where(eq(orders.id, orderId));
  if (!order) return null;

  const [seller] = await db
    .select({ telegramId: sellers.telegramId })
    .from(sellers)
    .where(eq(sellers.id, order.sellerId));
  if (!seller) return null;

  const items = await db
    .select({
      productName: orderItems.productNameSnapshot,
      variantName: orderItems.variantNameSnapshot,
      quantity: orderItems.quantity,
    })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));

  return {
    sellerTelegramId: seller.telegramId,
    data: {
      order: {
        id: order.id,
        totalKopecks: order.totalKopecks,
        buyerFullName: order.buyerFullName,
        buyerPhone: order.buyerPhone,
        buyerAddress: order.buyerAddress,
        buyerComment: order.buyerComment,
      },
      items,
    },
  };
}

export async function sendOrderNotification(orderId: number): Promise<void> {
  const loaded = await loadOrderNotificationData(orderId);
  if (!loaded) return;
  await getBot().api.sendMessage(
    loaded.sellerTelegramId,
    formatOrderNotificationText(loaded.data),
  );
}

// Enqueue никогда не бросает — покупателю ответ на /orders не должен
// зависеть от доступности очереди; провал виден в Sentry, не тихо
// проглатывается (тот же принцип, что и у weekly restore-check, см.
// TASKS.md, Спринт 8).
export async function enqueueOrderNotification(orderId: number): Promise<void> {
  try {
    await boss.send(ORDER_NOTIFICATION_QUEUE, { orderId } satisfies OrderNotificationJobData);
  } catch (err) {
    Sentry.captureException(err);
  }
}

// Вызывается один раз при старте процесса (index.ts), после boss.start() —
// очередь должна существовать в схеме pg-boss до первого send()/work().
export async function registerOrderNotificationWorker(): Promise<string> {
  await boss.createQueue(ORDER_NOTIFICATION_QUEUE);
  return boss.work<OrderNotificationJobData>(ORDER_NOTIFICATION_QUEUE, async (jobs) => {
    for (const job of jobs) {
      await sendOrderNotification(job.data.orderId);
    }
  });
}
