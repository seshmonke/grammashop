import { and, eq, isNull, lt } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import { InlineKeyboard } from "grammy";
import { encodeOrderStartParam } from "@grammashop/shared";
import { getBot } from "../bot/client.js";
import { db } from "../db/client.js";
import { orders, sellers } from "../db/schema.js";
import { boss, ORDER_REMINDER_QUEUE } from "../queue/client.js";
import { formatRubles, MINI_APP_URL } from "./order-notification.js";

// Напоминание продавцу о заказе, зависшем в `new` дольше 48 ч (см. Спринт 43,
// CONCEPT.md#жизненный-цикл-сущностей, подраздел «Заказ»): тем же каналом
// (платформенный бот), авто-отмены нет. Тот же cron-паттерн на pg-boss, что
// у рекуррентного биллинга и финального обезличивания
// (billing/recurring-worker.ts, sellers/finalize-deletion-worker.ts):
// источник истины — время создания и флаг new_reminder_sent_at в БД, а не
// цепочка отложенных job, так что пропущенный запуск догоняется на следующий
// день. Одно напоминание на заказ (дедуп по new_reminder_sent_at).
const STALE_ORDER_HOURS = 48;
const DAILY_AT_5AM_MSK = "0 5 * * *";

// Минимум без ПДн (152-ФЗ, решение 24.07.2026): номер, сумма и диплинк в
// админку — полные данные заказа продавец смотрит по диплинку, как в
// исходном уведомлении о заказе. ФИО/телефон/адрес покупателя в напоминание
// не тянутся и не логируются.
export function formatOrderReminderText(order: {
  id: number;
  totalKopecks: number;
}): string {
  return (
    `⏳ Заказ #${order.id} на ${formatRubles(order.totalKopecks)} ждёт ответа ` +
    `больше 2 дней.\n\nОткройте заказ, чтобы связаться с покупателем или ` +
    `обновить статус.`
  );
}

async function sendOrderReminder(
  sellerTelegramId: number,
  order: { id: number; totalKopecks: number },
): Promise<void> {
  await getBot().api.sendMessage(sellerTelegramId, formatOrderReminderText(order), {
    reply_markup: new InlineKeyboard().url(
      "📦 Открыть заказ",
      `${MINI_APP_URL}?startapp=${encodeOrderStartParam(order.id)}`,
    ),
  });
}

// Один прогон свипа — тестируемая единица, отдельно от регистрации cron.
// Отбирает заказы в `new` старше порога с пустым флагом, шлёт напоминание и
// проставляет флаг. Флаг ставится только после успешной отправки — провал по
// одному заказу (недоступный чат и т.п.) уходит в Sentry и повторится
// следующим прогоном, не блокируя остальные заказы.
export async function runOrderReminderSweep(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_ORDER_HOURS * 60 * 60 * 1000);

  const stale = await db
    .select({
      id: orders.id,
      totalKopecks: orders.totalKopecks,
      sellerTelegramId: sellers.telegramId,
    })
    .from(orders)
    .innerJoin(sellers, eq(orders.sellerId, sellers.id))
    .where(
      and(
        eq(orders.status, "new"),
        lt(orders.createdAt, cutoff),
        isNull(orders.newReminderSentAt),
      ),
    );

  for (const order of stale) {
    try {
      await sendOrderReminder(order.sellerTelegramId, {
        id: order.id,
        totalKopecks: order.totalKopecks,
      });
      await db
        .update(orders)
        .set({ newReminderSentAt: new Date() })
        .where(eq(orders.id, order.id));
    } catch (err) {
      Sentry.captureException(err);
    }
  }
}

// Вызывается один раз при старте процесса (index.ts), после boss.start().
export async function registerOrderReminderWorker(): Promise<string> {
  await boss.createQueue(ORDER_REMINDER_QUEUE);
  await boss.schedule(ORDER_REMINDER_QUEUE, DAILY_AT_5AM_MSK, null, {
    tz: "Europe/Moscow",
  });
  return boss.work(ORDER_REMINDER_QUEUE, async (jobs) => {
    for (const _job of jobs) {
      try {
        await runOrderReminderSweep();
      } catch (err) {
        Sentry.captureException(err);
        throw err;
      }
    }
  });
}
