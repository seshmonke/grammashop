ALTER TABLE "orders" ADD COLUMN "new_reminder_sent_at" timestamp with time zone;
--> statement-breakpoint
-- Бэкфилл (Спринт 43): проставляем now() всем текущим `new`-заказам, чтобы
-- свип order-reminder не выдал залп напоминаний по уже зависшим заказам на
-- первом прогоне — фича работает только на будущие зависания.
UPDATE "orders" SET "new_reminder_sent_at" = now() WHERE "status" = 'new';