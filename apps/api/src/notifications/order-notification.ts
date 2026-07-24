import { eq } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import { InlineKeyboard } from "grammy";
import { encodeOrderStartParam } from "@grammashop/shared";
import { escapeHtml } from "../bot/escape-html.js";
import { getBot } from "../bot/client.js";
import { db } from "../db/client.js";
import { orderItems, orders, sellers } from "../db/schema.js";
import { boss, ORDER_NOTIFICATION_QUEUE } from "../queue/client.js";

// Тот же t.me-паттерн, что у MINI_APP_URL в bot/start-handler.ts, но с
// диплинком на конкретный заказ вместо голого запуска Mini App.
// Экспортируется — переиспользуется свипом напоминаний о зависшем заказе
// (notifications/order-reminder-worker.ts, Спринт 43).
export const MINI_APP_URL = "https://t.me/grammashopbot/shop";

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

// Экспортируется — переиспользуется свипом напоминаний о зависшем заказе
// (notifications/order-reminder-worker.ts, Спринт 43).
export function formatRubles(kopecks: number): string {
  return `${(kopecks / 100).toFixed(2)} ₽`;
}

// parse_mode: "HTML" (см. sendOrderNotification) — все поля с текстом
// покупателя/товара экранируются escapeHtml, наши собственные подписи
// ("Покупатель:" и т.п.) — литералы, экранировать не нужно.
export function formatOrderNotificationText(data: OrderNotificationData): string {
  const { order, items } = data;
  const lines = [
    `🛒 <b>Новый заказ #${order.id}</b> на ${formatRubles(order.totalKopecks)}`,
    "",
    ...items.map(
      (i) => `• ${escapeHtml(i.productName)} (${escapeHtml(i.variantName)}) × ${i.quantity}`,
    ),
    "",
    `👤 <b>Покупатель:</b> ${escapeHtml(order.buyerFullName)}, ${escapeHtml(order.buyerPhone)}`,
    `📍 <b>Адрес:</b> ${escapeHtml(order.buyerAddress)}`,
  ];
  if (order.buyerComment) {
    lines.push(`💬 <b>Комментарий:</b> ${escapeHtml(order.buyerComment)}`);
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
    {
      parse_mode: "HTML",
      reply_markup: new InlineKeyboard().url(
        "📦 Открыть заказ",
        `${MINI_APP_URL}?startapp=${encodeOrderStartParam(orderId)}`,
      ),
    },
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
      try {
        await sendOrderNotification(job.data.orderId);
      } catch (err) {
        Sentry.captureException(err);
        // Не глотаем: pg-boss должен по-прежнему видеть провал и класть
        // job в `failed` (это не единственный канал видимости теперь, но
        // и не бесполезный — история попыток остаётся в БД).
        throw err;
      }
    }
  });
}
