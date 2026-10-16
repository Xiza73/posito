ALTER TABLE "organization_settings" ADD COLUMN "trade_name" text;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "legal_name" text;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "ruc" text;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "branch_name" text;--> statement-breakpoint
ALTER TABLE "organization_settings" ADD COLUMN "receipt_footer" text;--> statement-breakpoint
ALTER TABLE "sale" ADD COLUMN "business_snapshot" jsonb;