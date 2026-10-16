-- Clientes: activo/inactivo, correo, dirección, name_key (búsqueda) y documento por tipo + número.
-- Editada a mano sobre lo que generó drizzle-kit: name_key nace NULL, se rellena y recién entonces
-- pasa a NOT NULL (como 0003-0005 con productos/categorías). El snapshot final es el mismo.
DROP INDEX "customer_org_document_uq";--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "name_key" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "customer" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Misma expresión que 0004_names_backfill.sql (equivalente a nameKey() de src/lib/name-key.ts).
-- Sin dedupe: dos clientes pueden llamarse igual (no hay índice único sobre name_key).
UPDATE "customer" SET "name_key" = lower(translate(regexp_replace(regexp_replace(normalize("name", NFC), '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g'), 'áéíóúüàèìòùâêîôûäëïöãõçýÿÁÉÍÓÚÜÀÈÌÒÙÂÊÎÔÛÄËÏÖÃÕÇÝŸÑ', 'aeiouuaeiouaeiouaeioaocyyaeiouuaeiouaeiouaeioaocyyñ'));--> statement-breakpoint
ALTER TABLE "customer" ALTER COLUMN "name_key" SET NOT NULL;--> statement-breakpoint
-- Filas legadas con el par tipo/número a medias (antes no había validación): el tipo se infiere por
-- longitud cuando hay número (8 = DNI, 11 = RUC, otro = CE) y un tipo sin número se descarta.
UPDATE "customer" SET "document_type" = CASE
  WHEN length("document_number") = 8 THEN 'dni'::document_type
  WHEN length("document_number") = 11 THEN 'ruc'::document_type
  ELSE 'ce'::document_type END
WHERE "document_type" IS NULL AND "document_number" IS NOT NULL;--> statement-breakpoint
UPDATE "customer" SET "document_type" = NULL WHERE "document_type" IS NOT NULL AND "document_number" IS NULL;--> statement-breakpoint
CREATE INDEX "customer_org_name_key_idx" ON "customer" USING btree ("organization_id","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "customer_org_document_uq" ON "customer" USING btree ("organization_id","document_type","document_number");--> statement-breakpoint
ALTER TABLE "customer" ADD CONSTRAINT "customer_document_pair" CHECK (("customer"."document_type" is null) = ("customer"."document_number" is null));
