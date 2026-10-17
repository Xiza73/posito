CREATE TABLE "product_price_tier" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"min_qty" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	CONSTRAINT "product_price_tier_min_qty" CHECK ("product_price_tier"."min_qty" >= 2),
	CONSTRAINT "product_price_tier_price_positive" CHECK ("product_price_tier"."unit_price_cents" >= 1)
);
--> statement-breakpoint
-- Filas existentes: antes de esta función no había precios por mayor, así que el precio de lista
-- vendido == el precio unitario cobrado. Se agrega nullable, se rellena y recién entonces NOT NULL
-- (todo en la misma corrida; no usa enums, así que no hay problema 55P04).
ALTER TABLE "sale_item" ADD COLUMN "list_unit_price_cents" integer;--> statement-breakpoint
UPDATE "sale_item" SET "list_unit_price_cents" = "unit_price_cents";--> statement-breakpoint
ALTER TABLE "sale_item" ALTER COLUMN "list_unit_price_cents" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sale_item" ADD COLUMN "price_source" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_price_tier" ADD CONSTRAINT "product_price_tier_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_tier" ADD CONSTRAINT "product_price_tier_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_price_tier_product_min_qty_uq" ON "product_price_tier" USING btree ("product_id","min_qty");--> statement-breakpoint
CREATE INDEX "product_price_tier_product_idx" ON "product_price_tier" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_price_source" CHECK ("sale_item"."price_source" in ('normal', 'mayor'));--> statement-breakpoint
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_price_source_consistent" CHECK (("sale_item"."price_source" <> 'normal' or "sale_item"."unit_price_cents" = "sale_item"."list_unit_price_cents") and ("sale_item"."price_source" <> 'mayor' or "sale_item"."unit_price_cents" < "sale_item"."list_unit_price_cents"));