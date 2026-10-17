CREATE TABLE "product_photo" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"image_path" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_photo_position_range" CHECK ("product_photo"."position" between 0 and 7),
	CONSTRAINT "product_photo_image_path_format" CHECK ("product_photo"."image_path" ~ '^[A-Za-z0-9_-]+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
);
--> statement-breakpoint
ALTER TABLE "product_image_upload" ADD COLUMN "kind" text DEFAULT 'main' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_photo" ADD CONSTRAINT "product_photo_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_photo" ADD CONSTRAINT "product_photo_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_photo_product_position_uq" ON "product_photo" USING btree ("product_id","position");--> statement-breakpoint
ALTER TABLE "product_image_upload" ADD CONSTRAINT "product_image_upload_kind" CHECK ("product_image_upload"."kind" in ('main', 'gallery'));