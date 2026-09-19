CREATE TYPE "public"."fee_source" AS ENUM('none', 'manual', 'channel_default', 'exported');--> statement-breakpoint
ALTER TABLE "channels" ADD COLUMN "fee_rate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "platform_fee" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fee_source" "fee_source" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_fee_rate_bps_range" CHECK ("channels"."fee_rate_bps" >= 0 AND "channels"."fee_rate_bps" <= 10000);--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_platform_fee_nonneg" CHECK ("orders"."platform_fee" >= 0);