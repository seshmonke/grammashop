import { pgTable, serial, timestamp } from "drizzle-orm/pg-core";

// Заглушка на веху 3 — проверяет, что Drizzle доезжает до Postgres и
// генерит миграции. Настоящая доменная схема приходит в вехе 4 вместе
// со скелетом Fastify по TDD.
export const healthCheck = pgTable("health_check", {
  id: serial("id").primaryKey(),
  checkedAt: timestamp("checked_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
