import { sql } from "drizzle-orm";
import {
  bigint,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  orderStatuses,
  productStatuses,
  sellerStatuses,
  subscriptionPaymentStatuses,
  subscriptionStatuses,
  subscriptionTiers,
} from "@grammashop/shared";

// Доменная схема v1 (см. STACK.md#доменная-схема-v1). Значения enum'ов
// приходят из @grammashop/shared — единый источник с Zod-схемами.
// Деньги везде — integer в копейках. Telegram ID — bigint (не влезает в
// int4). ПДн покупателя живут только снапшотом в orders (без таблицы
// покупателей — минимизация по 152-ФЗ).

export const sellerStatusEnum = pgEnum("seller_status", sellerStatuses);
export const subscriptionTierEnum = pgEnum(
  "subscription_tier",
  subscriptionTiers,
);
export const subscriptionStatusEnum = pgEnum(
  "subscription_status",
  subscriptionStatuses,
);
export const subscriptionPaymentStatusEnum = pgEnum(
  "subscription_payment_status",
  subscriptionPaymentStatuses,
);
export const productStatusEnum = pgEnum("product_status", productStatuses);
export const orderStatusEnum = pgEnum("order_status", orderStatuses);

export const sellers = pgTable("sellers", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  // Обязателен: без username не существует диплинк-канала связи с
  // покупателем (см. CONCEPT.md#коммуникация-продавца-и-покупателя).
  telegramUsername: text("telegram_username").notNull(),
  // ПДн продавца (идентификация, см. CONCEPT.md#модерация-и-лимиты).
  fullName: text("full_name").notNull(),
  phone: text("phone").notNull(),
  shopName: text("shop_name").notNull(),
  shopDescription: text("shop_description"),
  // Реквизиты для перевода на Тарифе 1 (оплата покупателем напрямую).
  paymentDetails: text("payment_details"),
  status: sellerStatusEnum("status").notNull().default("active"),
  // Свободный текст, вводит админ при блокировке (см. Спринт 32); при
  // возврате в active очищается — не история, а причина текущей блокировки.
  blockedReason: text("blocked_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// 1:1 к продавцу в v1 — unique на seller_id гарантирует единственную
// подписку.
export const subscriptions = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id")
    .notNull()
    .unique()
    .references(() => sellers.id, { onDelete: "cascade" }),
  tier: subscriptionTierEnum("tier").notNull(),
  status: subscriptionStatusEnum("status").notNull(),
  paidUntil: timestamp("paid_until", { withTimezone: true }),
  // Токен привязанной карты для авторекуррентного списания ЮKassa.
  ykPaymentMethodId: text("yk_payment_method_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const subscriptionPayments = pgTable(
  "subscription_payments",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id, { onDelete: "cascade" }),
    amountKopecks: integer("amount_kopecks").notNull(),
    status: subscriptionPaymentStatusEnum("status").notNull(),
    // Идемпотентность вебхука ЮKassa на уровне констрейнта: повторная
    // доставка того же события упрётся в unique и не создаст дубль.
    ykPaymentId: text("yk_payment_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("subscription_payments_yk_payment_id_key").on(
      table.ykPaymentId,
    ),
  ],
);

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sellerId: integer("seller_id")
    .notNull()
    .references(() => sellers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  sortPosition: integer("sort_position").notNull().default(0),
  status: productStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const productVariants = pgTable("product_variants", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  priceKopecks: integer("price_kopecks").notNull(),
  // nullable — зачёркнутая цена (скидка), см. CONCEPT.md#каталог-и-заказы.
  oldPriceKopecks: integer("old_price_kopecks"),
  // nullable — NULL = учёт остатка выключен, вариант всегда «в наличии».
  stock: integer("stock"),
  sortPosition: integer("sort_position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const productImages = pgTable("product_images", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  s3Key: text("s3_key").notNull(),
  sortPosition: integer("sort_position").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    sellerId: integer("seller_id")
      .notNull()
      .references(() => sellers.id),
    buyerTelegramId: bigint("buyer_telegram_id", { mode: "number" }).notNull(),
    status: orderStatusEnum("status").notNull().default("new"),
    // ПДн покупателя снапшотом (не ссылкой на профиль — его нет). Запрос на
    // удаление данных = правка этих строк.
    buyerFullName: text("buyer_full_name").notNull(),
    buyerPhone: text("buyer_phone").notNull(),
    buyerAddress: text("buyer_address").notNull(),
    buyerComment: text("buyer_comment"),
    // Факт согласия на обработку ПДн (152-ФЗ).
    consentAt: timestamp("consent_at", { withTimezone: true }).notNull(),
    totalKopecks: integer("total_kopecks").notNull(),
    // Идемпотентность оформления заказа (см. Спринт 31): клиент генерирует
    // UUID один раз на попытку оформления, повторная отправка того же
    // запроса (после сетевой ошибки) упирается в unique и возвращает уже
    // созданный заказ вместо дубля — тот же приём, что и у
    // subscription_payments.yk_payment_id выше. Дефолт — подстраховка на
    // случай прямой вставки в обход API (например, ручной seed), не то, на
    // что полагается сам эндпоинт создания заказа.
    idempotencyKey: text("idempotency_key")
      .notNull()
      .default(sql`gen_random_uuid()`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("orders_idempotency_key_unique").on(table.idempotencyKey),
  ],
);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  // SET NULL при удалении варианта — снапшоты ниже сохраняют историю.
  variantId: integer("variant_id").references(() => productVariants.id, {
    onDelete: "set null",
  }),
  productNameSnapshot: text("product_name_snapshot").notNull(),
  variantNameSnapshot: text("variant_name_snapshot").notNull(),
  priceKopecks: integer("price_kopecks").notNull(),
  quantity: integer("quantity").notNull(),
});
