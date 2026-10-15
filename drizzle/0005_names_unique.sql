DROP INDEX "category_org_name_uq";--> statement-breakpoint
ALTER TABLE "category" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "product" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "product_org_name_key_uq" ON "product" USING btree ("organization_id","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "category_org_name_uq" ON "category" USING btree ("organization_id","name_key");