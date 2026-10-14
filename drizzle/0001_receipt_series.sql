CREATE TABLE "receipt_series" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"series" text NOT NULL,
	"last_number" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "receipt_series_format" CHECK ("receipt_series"."series" ~ '^B[0-9]{3}$'),
	CONSTRAINT "receipt_series_last_number_non_negative" CHECK ("receipt_series"."last_number" >= 0)
);
--> statement-breakpoint
ALTER TABLE "receipt_series" ADD CONSTRAINT "receipt_series_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;