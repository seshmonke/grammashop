CREATE TYPE "public"."seller_deleted_by" AS ENUM('seller', 'admin');--> statement-breakpoint
ALTER TABLE "sellers" ADD COLUMN "deleted_by" "seller_deleted_by";