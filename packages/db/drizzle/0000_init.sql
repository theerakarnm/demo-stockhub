CREATE TYPE "public"."channel_kind" AS ENUM('shopee', 'lazada', 'tiktok', 'pos', 'wholesale', 'manual');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'parsing', 'preview_ready', 'applying', 'applied', 'failed');--> statement-breakpoint
CREATE TYPE "public"."match_source" AS ENUM('listing_map', 'sku_exact', 'sku_normalised', 'manual', 'unmatched');--> statement-breakpoint
CREATE TYPE "public"."movement_reason" AS ENUM('purchase_in', 'sale_out', 'return_in', 'cancel_restore', 'adjust_in', 'adjust_out', 'transfer_in', 'transfer_out', 'bundle_assemble', 'bundle_disassemble');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'returned');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('owner', 'manager', 'stock_staff', 'sales');--> statement-breakpoint
CREATE TYPE "public"."variant_kind" AS ENUM('simple', 'bundle');--> statement-breakpoint
CREATE TABLE "bundle_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"bundle_variant_id" uuid NOT NULL,
	"component_variant_id" uuid NOT NULL,
	"qty_per_bundle" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bundle_components_qty_min_one" CHECK ("bundle_components"."qty_per_bundle" >= 1)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" text,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"name" text,
	"kind" "variant_kind" DEFAULT 'simple' NOT NULL,
	"barcode" text,
	"unit" text DEFAULT 'ชิ้น' NOT NULL,
	"selling_price" bigint DEFAULT 0 NOT NULL,
	"reorder_point" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variants_money_nonneg" CHECK ("variants"."selling_price" >= 0 AND "variants"."reorder_point" >= 0)
);
--> statement-breakpoint
CREATE TABLE "channel_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"platform_sku" text NOT NULL,
	"platform_product_name" text,
	"variant_id" uuid,
	"match_source" "match_source" DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"kind" "channel_kind" NOT NULL,
	"name" text NOT NULL,
	"external_shop_id" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel_id" uuid,
	"detected_kind" "channel_kind",
	"status" "import_status" DEFAULT 'uploaded' NOT NULL,
	"file_name" text NOT NULL,
	"r2_object_key" text NOT NULL,
	"file_size" integer DEFAULT 0 NOT NULL,
	"checksum" text,
	"rows_read" integer DEFAULT 0 NOT NULL,
	"orders_parsed" integer DEFAULT 0 NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"applied_at" timestamp with time zone,
	"error_message" text,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batches_counters_nonneg" CHECK ("import_batches"."file_size" >= 0 AND "import_batches"."rows_read" >= 0 AND "import_batches"."orders_parsed" >= 0)
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"time_zone" text DEFAULT 'Asia/Bangkok' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "role" DEFAULT 'sales' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movement_lot_consumptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"movement_id" uuid NOT NULL,
	"lot_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"unit_cost" bigint NOT NULL,
	"line_cost" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movement_lot_consumptions_qty_positive" CHECK ("movement_lot_consumptions"."qty" > 0),
	CONSTRAINT "movement_lot_consumptions_costs_nonneg" CHECK ("movement_lot_consumptions"."unit_cost" >= 0 AND "movement_lot_consumptions"."line_cost" >= 0),
	CONSTRAINT "movement_lot_consumptions_line_math" CHECK ("movement_lot_consumptions"."line_cost" = "movement_lot_consumptions"."qty" * "movement_lot_consumptions"."unit_cost")
);
--> statement-breakpoint
CREATE TABLE "stock_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"remaining_qty" integer NOT NULL,
	"unit_cost" bigint NOT NULL,
	"received_at" timestamp with time zone NOT NULL,
	"source_movement_id" uuid,
	"reference" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_lots_qty_positive" CHECK ("stock_lots"."qty" > 0),
	CONSTRAINT "stock_lots_remaining_range" CHECK ("stock_lots"."remaining_qty" >= 0 AND "stock_lots"."remaining_qty" <= "stock_lots"."qty"),
	CONSTRAINT "stock_lots_unit_cost_nonneg" CHECK ("stock_lots"."unit_cost" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"reason" "movement_reason" NOT NULL,
	"qty_delta" integer NOT NULL,
	"cost_total" bigint DEFAULT 0 NOT NULL,
	"channel_id" uuid,
	"order_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_qty_delta_nonzero" CHECK ("stock_movements"."qty_delta" <> 0),
	CONSTRAINT "stock_movements_cost_nonneg" CHECK ("stock_movements"."cost_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"variant_id" uuid,
	"platform_sku" text NOT NULL,
	"platform_product_name" text,
	"variation_name" text,
	"qty" integer NOT NULL,
	"unit_price" bigint DEFAULT 0 NOT NULL,
	"discount" bigint DEFAULT 0 NOT NULL,
	"match_source" "match_source" DEFAULT 'unmatched' NOT NULL,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_qty_positive" CHECK ("order_lines"."qty" > 0),
	CONSTRAINT "order_lines_money_nonneg" CHECK ("order_lines"."unit_price" >= 0 AND "order_lines"."discount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"external_order_id" text NOT NULL,
	"status" "order_status" DEFAULT 'pending' NOT NULL,
	"ordered_at" timestamp with time zone NOT NULL,
	"shipped_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"buyer_name" text,
	"grand_total" bigint DEFAULT 0 NOT NULL,
	"import_batch_id" uuid,
	"raw" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_grand_total_nonneg" CHECK ("orders"."grand_total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_bundle_variant_id_variants_id_fk" FOREIGN KEY ("bundle_variant_id") REFERENCES "public"."variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_components" ADD CONSTRAINT "bundle_components_component_variant_id_variants_id_fk" FOREIGN KEY ("component_variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variants" ADD CONSTRAINT "variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_listings" ADD CONSTRAINT "channel_listings_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_listings" ADD CONSTRAINT "channel_listings_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_listings" ADD CONSTRAINT "channel_listings_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_lot_consumptions" ADD CONSTRAINT "movement_lot_consumptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_lot_consumptions" ADD CONSTRAINT "movement_lot_consumptions_movement_id_stock_movements_id_fk" FOREIGN KEY ("movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movement_lot_consumptions" ADD CONSTRAINT "movement_lot_consumptions_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_source_movement_id_stock_movements_id_fk" FOREIGN KEY ("source_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_variant_id_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."variants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_import_batch_id_import_batches_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bundle_components_uq" ON "bundle_components" USING btree ("bundle_variant_id","component_variant_id");--> statement-breakpoint
CREATE INDEX "bundle_components_component_idx" ON "bundle_components" USING btree ("component_variant_id");--> statement-breakpoint
CREATE INDEX "bundle_components_org_idx" ON "bundle_components" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "products_org_idx" ON "products" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "products_org_name_idx" ON "products" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "variants_org_sku_uq" ON "variants" USING btree ("org_id","sku");--> statement-breakpoint
CREATE INDEX "variants_org_idx" ON "variants" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "variants_product_idx" ON "variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "variants_barcode_idx" ON "variants" USING btree ("org_id","barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "channel_listings_channel_sku_uq" ON "channel_listings" USING btree ("channel_id","platform_sku");--> statement-breakpoint
CREATE INDEX "channel_listings_variant_idx" ON "channel_listings" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "channel_listings_org_idx" ON "channel_listings" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "channels_org_idx" ON "channels" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "channels_org_kind_idx" ON "channels" USING btree ("org_id","kind");--> statement-breakpoint
CREATE INDEX "import_batches_org_idx" ON "import_batches" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "import_batches_org_created_idx" ON "import_batches" USING btree ("org_id","created_at");--> statement-breakpoint
CREATE INDEX "import_batches_status_idx" ON "import_batches" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "import_batches_channel_idx" ON "import_batches" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_uq" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "users_org_email_uq" ON "users" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "movement_lot_consumptions_movement_idx" ON "movement_lot_consumptions" USING btree ("movement_id");--> statement-breakpoint
CREATE INDEX "movement_lot_consumptions_lot_idx" ON "movement_lot_consumptions" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "movement_lot_consumptions_org_idx" ON "movement_lot_consumptions" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "stock_lots_org_idx" ON "stock_lots" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "stock_lots_fifo_idx" ON "stock_lots" USING btree ("variant_id","warehouse_id","received_at","id");--> statement-breakpoint
CREATE INDEX "stock_lots_remaining_idx" ON "stock_lots" USING btree ("variant_id","remaining_qty");--> statement-breakpoint
CREATE INDEX "stock_movements_org_idx" ON "stock_movements" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "stock_movements_variant_occurred_idx" ON "stock_movements" USING btree ("variant_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movements_org_occurred_idx" ON "stock_movements" USING btree ("org_id","occurred_at");--> statement-breakpoint
CREATE INDEX "stock_movements_order_idx" ON "stock_movements" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "stock_movements_warehouse_idx" ON "stock_movements" USING btree ("warehouse_id","variant_id");--> statement-breakpoint
CREATE INDEX "warehouses_org_idx" ON "warehouses" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_lines_variant_idx" ON "order_lines" USING btree ("variant_id");--> statement-breakpoint
CREATE INDEX "order_lines_org_idx" ON "order_lines" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "order_lines_org_match_idx" ON "order_lines" USING btree ("org_id","match_source");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_channel_external_uq" ON "orders" USING btree ("channel_id","external_order_id");--> statement-breakpoint
CREATE INDEX "orders_org_idx" ON "orders" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "orders_channel_ordered_idx" ON "orders" USING btree ("channel_id","ordered_at");--> statement-breakpoint
CREATE INDEX "orders_org_ordered_idx" ON "orders" USING btree ("org_id","ordered_at");--> statement-breakpoint
CREATE INDEX "orders_org_status_idx" ON "orders" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "orders_import_batch_idx" ON "orders" USING btree ("import_batch_id");