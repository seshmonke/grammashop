ALTER TYPE "public"."seller_status" ADD VALUE 'deleted';--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "delete_reason" text;