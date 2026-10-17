ALTER TABLE "sale_item" DROP CONSTRAINT "sale_item_price_source";--> statement-breakpoint
ALTER TABLE "sale_item" DROP CONSTRAINT "sale_item_line_total";--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "allow_manual_price" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_manual_total_positive" CHECK ("sale_item"."price_source" <> 'manual' or "sale_item"."line_total_cents" >= 1);--> statement-breakpoint
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_price_source" CHECK ("sale_item"."price_source" in ('normal', 'mayor', 'manual'));--> statement-breakpoint
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_line_total" CHECK ("sale_item"."price_source" = 'manual' or "sale_item"."line_total_cents" = "sale_item"."unit_price_cents" * "sale_item"."quantity");