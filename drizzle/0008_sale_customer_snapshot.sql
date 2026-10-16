ALTER TABLE "sale" ADD COLUMN "customer_name" text;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "customer_document_type" "document_type";--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "customer_document_number" text;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_customer_snapshot" CHECK ("sale"."customer_id" is null or "sale"."customer_name" is not null);--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_customer_document_pair" CHECK (("sale"."customer_document_type" is null) = ("sale"."customer_document_number" is null));