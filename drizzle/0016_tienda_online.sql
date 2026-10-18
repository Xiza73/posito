CREATE TABLE "store_slug_history" (
	"slug" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_slug_history_format" CHECK ("store_slug_history"."slug" ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$')
);
--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "store_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "has_whatsapp" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "store_slug" text;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "store_hours" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "show_in_store" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "store_slug_history" ADD CONSTRAINT "store_slug_history_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "store_slug_history_org_idx" ON "store_slug_history" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "organization_settings_store_slug_uq" ON "organization_settings" USING btree ("store_slug");--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_store_slug_format" CHECK ("organization_settings"."store_slug" is null or "organization_settings"."store_slug" ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$');--> statement-breakpoint
ALTER TABLE "organization_settings" ADD CONSTRAINT "organization_settings_store_hours_len" CHECK ("organization_settings"."store_hours" is null or char_length("organization_settings"."store_hours") <= 200);