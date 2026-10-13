CREATE TYPE "public"."document_type" AS ENUM('dni', 'ruc', 'ce');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('efectivo', 'yape_plin', 'tarjeta');--> statement-breakpoint
CREATE TYPE "public"."sale_status" AS ENUM('completada', 'anulada');--> statement-breakpoint
CREATE TYPE "public"."stock_movement_type" AS ENUM('venta', 'anulacion', 'ingreso', 'ajuste');--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"document_type" "document_type",
	"document_number" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"barcode" text,
	"price_cents" integer NOT NULL,
	"tracks_stock" boolean DEFAULT true NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"min_stock" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_price_non_negative" CHECK ("product"."price_cents" >= 0),
	CONSTRAINT "product_stock_non_negative" CHECK ("product"."stock" >= 0),
	CONSTRAINT "product_min_stock_non_negative" CHECK ("product"."min_stock" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sale" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"series" text NOT NULL,
	"number" integer NOT NULL,
	"cashier_id" text NOT NULL,
	"customer_id" uuid,
	"payment_method" "payment_method" NOT NULL,
	"subtotal_cents" integer NOT NULL,
	"igv_cents" integer NOT NULL,
	"total_cents" integer NOT NULL,
	"status" "sale_status" DEFAULT 'completada' NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_id" text,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sale_totals_consistent" CHECK ("sale"."subtotal_cents" + "sale"."igv_cents" = "sale"."total_cents"),
	CONSTRAINT "sale_total_non_negative" CHECK ("sale"."total_cents" >= 0),
	CONSTRAINT "sale_void_consistent" CHECK (("sale"."status" = 'anulada') = ("sale"."voided_at" is not null and "sale"."voided_by_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "sale_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sale_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	CONSTRAINT "sale_item_quantity_positive" CHECK ("sale_item"."quantity" > 0),
	CONSTRAINT "sale_item_line_total" CHECK ("sale_item"."line_total_cents" = "sale_item"."unit_price_cents" * "sale_item"."quantity")
);
--> statement-breakpoint
CREATE TABLE "stock_movement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"type" "stock_movement_type" NOT NULL,
	"quantity" integer NOT NULL,
	"sale_id" uuid,
	"user_id" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movement_quantity_non_zero" CHECK ("stock_movement"."quantity" <> 0),
	CONSTRAINT "stock_movement_sale_link" CHECK (("stock_movement"."type" in ('venta', 'anulacion')) = ("stock_movement"."sale_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_cashier_id_user_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale" ADD CONSTRAINT "sale_voided_by_id_user_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_item" ADD CONSTRAINT "sale_item_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_sale_id_sale_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sale"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_org_name_uq" ON "category" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "customer_org_idx" ON "customer" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_org_document_uq" ON "customer" USING btree ("organization_id","document_number");--> statement-breakpoint
CREATE INDEX "product_org_idx" ON "product" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_org_barcode_uq" ON "product" USING btree ("organization_id","barcode");--> statement-breakpoint
CREATE UNIQUE INDEX "sale_org_series_number_uq" ON "sale" USING btree ("organization_id","series","number");--> statement-breakpoint
CREATE INDEX "sale_org_created_idx" ON "sale" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "sale_item_sale_idx" ON "sale_item" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "stock_movement_product_created_idx" ON "stock_movement" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");