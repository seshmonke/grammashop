import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { orderItems, orders, products, productVariants, sellers } from "../db/schema.js";

vi.mock("../bot/client.js", () => ({
  getBot: vi.fn(),
}));

import { getBot } from "../bot/client.js";
import { formatOrderReminderText, runOrderReminderSweep } from "./order-reminder-worker.js";

// Уникальный диапазон telegram_id файла (см. аудит флаки, Спринт 32), чтобы
// параллельные тестовые файлы не писали/чистили один и тот же id. 700530xxx
// — свободный: 700520001 занят billing.route.test.ts.
const SELLER_TG = 700530001;

const HOUR = 60 * 60 * 1000;

async function seedSellerWithVariant(): Promise<{ sellerId: number; variantId: number }> {
  const [seller] = await db
    .insert(sellers)
    .values({
      telegramId: SELLER_TG,
      telegramUsername: "reminder_shop",
      fullName: "ФИО",
      phone: "+70000000000",
      shopName: "Магазин",
      status: "active",
    })
    .returning({ id: sellers.id });
  const [product] = await db
    .insert(products)
    .values({ sellerId: seller!.id, name: "Худи" })
    .returning({ id: products.id });
  const [variant] = await db
    .insert(productVariants)
    .values({ productId: product!.id, name: "M", priceKopecks: 300000 })
    .returning({ id: productVariants.id });
  return { sellerId: seller!.id, variantId: variant!.id };
}

async function seedOrder(
  sellerId: number,
  variantId: number,
  opts: {
    ageHours: number;
    status?: "new" | "paid" | "fulfilled" | "canceled";
    reminderSentAt?: Date | null;
  },
): Promise<number> {
  const createdAt = new Date(Date.now() - opts.ageHours * HOUR);
  const [order] = await db
    .insert(orders)
    .values({
      sellerId,
      buyerTelegramId: 700530099,
      status: opts.status ?? "new",
      buyerFullName: "Иван Иванов",
      buyerPhone: "+79990001122",
      buyerAddress: "Москва, ул. Примерная, 1",
      buyerComment: null,
      consentAt: createdAt,
      totalKopecks: 300000,
      createdAt,
      newReminderSentAt: opts.reminderSentAt ?? null,
    })
    .returning({ id: orders.id });
  await db.insert(orderItems).values({
    orderId: order!.id,
    variantId,
    productNameSnapshot: "Худи",
    variantNameSnapshot: "M",
    priceKopecks: 300000,
    quantity: 1,
  });
  return order!.id;
}

describe("formatOrderReminderText", () => {
  it("содержит номер и сумму, без ПДн покупателя", () => {
    const text = formatOrderReminderText({ id: 42, totalKopecks: 300000 });
    expect(text).toContain("#42");
    expect(text).toContain("3000.00 ₽");
    // Минимум без ПДн (152-ФЗ): ни имени, ни телефона, ни адреса.
    expect(text).not.toContain("Иван");
    expect(text).not.toContain("+7999");
    expect(text).not.toContain("Москва");
  });
});

describe("runOrderReminderSweep", () => {
  beforeEach(async () => {
    const stale = await db
      .select({ id: sellers.id })
      .from(sellers)
      .where(inArray(sellers.telegramId, [SELLER_TG]));
    if (stale.length) {
      await db.delete(orders).where(
        inArray(
          orders.sellerId,
          stale.map((s) => s.id),
        ),
      );
    }
    await db.delete(sellers).where(inArray(sellers.telegramId, [SELLER_TG]));
    vi.mocked(getBot).mockReset();
  });

  it("шлёт напоминание по `new` старше 48 ч с пустым флагом и проставляет флаг", async () => {
    const { sellerId, variantId } = await seedSellerWithVariant();
    const orderId = await seedOrder(sellerId, variantId, { ageHours: 72 });
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getBot).mockReturnValue({ api: { sendMessage } } as never);

    await runOrderReminderSweep();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, options] = sendMessage.mock.calls[0]! as [
      number,
      string,
      { reply_markup: { inline_keyboard: Array<Array<{ url?: string }>> } },
    ];
    expect(chatId).toBe(SELLER_TG);
    expect(text).toContain(`#${orderId}`);
    expect(options.reply_markup.inline_keyboard[0]![0]!.url).toBe(
      `https://t.me/grammashopbot/shop?startapp=o${orderId}`,
    );

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.newReminderSentAt).not.toBeNull();
  });

  it("не шлёт по `new` моложе 48 ч", async () => {
    const { sellerId, variantId } = await seedSellerWithVariant();
    await seedOrder(sellerId, variantId, { ageHours: 24 });
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getBot).mockReturnValue({ api: { sendMessage } } as never);

    await runOrderReminderSweep();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("не шлёт по заказу, ушедшему из `new` (paid), даже если он старый", async () => {
    const { sellerId, variantId } = await seedSellerWithVariant();
    await seedOrder(sellerId, variantId, { ageHours: 72, status: "paid" });
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getBot).mockReturnValue({ api: { sendMessage } } as never);

    await runOrderReminderSweep();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("не шлёт повторно, если флаг уже проставлен", async () => {
    const { sellerId, variantId } = await seedSellerWithVariant();
    await seedOrder(sellerId, variantId, {
      ageHours: 72,
      reminderSentAt: new Date(Date.now() - HOUR),
    });
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getBot).mockReturnValue({ api: { sendMessage } } as never);

    await runOrderReminderSweep();

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("флаг не ставится, если отправка упала — заказ напомнится следующим прогоном", async () => {
    const { sellerId, variantId } = await seedSellerWithVariant();
    const orderId = await seedOrder(sellerId, variantId, { ageHours: 72 });
    const sendMessage = vi.fn().mockRejectedValue(new Error("chat not found"));
    vi.mocked(getBot).mockReturnValue({ api: { sendMessage } } as never);

    await runOrderReminderSweep();

    const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.newReminderSentAt).toBeNull();
  });
});
