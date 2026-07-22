import { beforeEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { orderItems, orders, products, productVariants, sellers } from "../db/schema.js";
import { boss, ORDER_NOTIFICATION_QUEUE } from "../queue/client.js";

vi.mock("../bot/client.js", () => ({
  getBot: vi.fn(),
}));

import { getBot } from "../bot/client.js";
import {
  enqueueOrderNotification,
  formatOrderNotificationText,
  sendOrderNotification,
} from "./order-notification.js";

const SELLER_TG = 700500001;

async function seedOrder() {
  const [seller] = await db
    .insert(sellers)
    .values({
      telegramId: SELLER_TG,
      telegramUsername: "seller_notif",
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
  const [order] = await db
    .insert(orders)
    .values({
      sellerId: seller!.id,
      buyerTelegramId: 700500099,
      status: "new",
      buyerFullName: "Иван Иванов",
      buyerPhone: "+79990001122",
      buyerAddress: "Москва, ул. Примерная, 1",
      buyerComment: "Позвоните заранее",
      consentAt: new Date(),
      totalKopecks: 600000,
    })
    .returning({ id: orders.id });
  await db.insert(orderItems).values({
    orderId: order!.id,
    variantId: variant!.id,
    productNameSnapshot: "Худи",
    variantNameSnapshot: "M",
    priceKopecks: 300000,
    quantity: 2,
  });
  return order!.id;
}

describe("formatOrderNotificationText", () => {
  it("собирает читаемое сообщение из позиций и данных покупателя", () => {
    const text = formatOrderNotificationText({
      order: {
        id: 42,
        totalKopecks: 600000,
        buyerFullName: "Иван Иванов",
        buyerPhone: "+79990001122",
        buyerAddress: "Москва, ул. Примерная, 1",
        buyerComment: "Позвоните заранее",
      },
      items: [{ productName: "Худи", variantName: "M", quantity: 2 }],
    });

    expect(text).toContain("#42");
    expect(text).toContain("6000.00 ₽");
    expect(text).toContain("Худи (M) × 2");
    expect(text).toContain("Иван Иванов");
    expect(text).toContain("+79990001122");
    expect(text).toContain("Москва, ул. Примерная, 1");
    expect(text).toContain("Позвоните заранее");
    expect(text).toContain("<b>");
  });

  it("HTML-спецсимволы в ПДн-полях покупателя экранируются", () => {
    const text = formatOrderNotificationText({
      order: {
        id: 1,
        totalKopecks: 1000,
        buyerFullName: "Иван <script>",
        buyerPhone: "+7",
        buyerAddress: "Дом & Сад",
        buyerComment: "Позвоните < 18:00",
      },
      items: [{ productName: "Товар", variantName: "V", quantity: 1 }],
    });

    expect(text).toContain("Иван &lt;script&gt;");
    expect(text).toContain("Дом &amp; Сад");
    expect(text).toContain("Позвоните &lt; 18:00");
    expect(text).not.toContain("<script>");
  });

  it("без комментария — строка комментария не появляется", () => {
    const text = formatOrderNotificationText({
      order: {
        id: 1,
        totalKopecks: 1000,
        buyerFullName: "А",
        buyerPhone: "+7",
        buyerAddress: "Б",
        buyerComment: null,
      },
      items: [{ productName: "Товар", variantName: "V", quantity: 1 }],
    });

    expect(text).not.toContain("Комментарий");
  });
});

describe("sendOrderNotification", () => {
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

  it("шлёт сообщение продавцу по его telegram_id", async () => {
    const orderId = await seedOrder();
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getBot).mockReturnValue({ api: { sendMessage } } as never);

    await sendOrderNotification(orderId);

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text, options] = sendMessage.mock.calls[0]!;
    expect(chatId).toBe(SELLER_TG);
    expect(text).toContain("Худи (M) × 2");
    expect(options).toEqual({ parse_mode: "HTML" });
  });

  it("несуществующий заказ — ничего не отправляет", async () => {
    const sendMessage = vi.fn();
    vi.mocked(getBot).mockReturnValue({ api: { sendMessage } } as never);

    await sendOrderNotification(999999);

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe("enqueueOrderNotification", () => {
  it("кладёт задачу в очередь с orderId", async () => {
    const send = vi.spyOn(boss, "send").mockResolvedValue("job-1");

    await enqueueOrderNotification(123);

    expect(send).toHaveBeenCalledWith(ORDER_NOTIFICATION_QUEUE, { orderId: 123 });
    send.mockRestore();
  });

  it("падение очереди не пробрасывается наружу", async () => {
    const send = vi.spyOn(boss, "send").mockRejectedValue(new Error("db down"));

    await expect(enqueueOrderNotification(123)).resolves.toBeUndefined();
    send.mockRestore();
  });
});
