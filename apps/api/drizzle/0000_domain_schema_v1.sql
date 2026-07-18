-- Переходное: убрать таблицу-заглушку вехи 3 на уже развёрнутых БД (прод).
-- На свежих БД — no-op (IF EXISTS). Baseline доменной схемы её не содержит.
DROP TABLE IF EXISTS "health_check";--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('new', 'paid', 'fulfilled', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('active', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."seller_status" AS ENUM('active', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."subscription_payment_status" AS ENUM('pending', 'succeeded', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('active', 'grace', 'suspended', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."subscription_tier" AS ENUM('tier1', 'tier2', 'tier3');--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"variant_id" integer,
	"product_name_snapshot" text NOT NULL,
	"variant_name_snapshot" text NOT NULL,
	"price_kopecks" integer NOT NULL,
	"quantity" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"buyer_telegram_id" bigint NOT NULL,
	"status" "order_status" DEFAULT 'new' NOT NULL,
	"buyer_full_name" text NOT NULL,
	"buyer_phone" text NOT NULL,
	"buyer_address" text NOT NULL,
	"buyer_comment" text,
	"consent_at" timestamp with time zone NOT NULL,
	"total_kopecks" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"s3_key" text NOT NULL,
	"sort_position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" text NOT NULL,
	"price_kopecks" integer NOT NULL,
	"old_price_kopecks" integer,
	"stock" integer,
	"sort_position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sort_position" integer DEFAULT 0 NOT NULL,
	"status" "product_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" serial PRIMARY KEY NOT NULL,
	"telegram_id" bigint NOT NULL,
	"telegram_username" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text NOT NULL,
	"shop_name" text NOT NULL,
	"shop_description" text,
	"payment_details" text,
	"status" "seller_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sellers_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"subscription_id" integer NOT NULL,
	"amount_kopecks" integer NOT NULL,
	"status" "subscription_payment_status" NOT NULL,
	"yk_payment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"seller_id" integer NOT NULL,
	"tier" "subscription_tier" NOT NULL,
	"status" "subscription_status" NOT NULL,
	"paid_until" timestamp with time zone,
	"yk_payment_method_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriptions_seller_id_unique" UNIQUE("seller_id")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payments_yk_payment_id_key" ON "subscription_payments" USING btree ("yk_payment_id");