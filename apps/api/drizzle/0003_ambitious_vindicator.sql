CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_seller_id_idx" ON "orders" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "orders_buyer_telegram_id_idx" ON "orders" USING btree ("buyer_telegram_id");--> statement-breakpoint
CREATE INDEX "product_images_product_id_idx" ON "product_images" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_variants_product_id_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_seller_id_idx" ON "products" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "subscription_payments_subscription_id_idx" ON "subscription_payments" USING btree ("subscription_id");