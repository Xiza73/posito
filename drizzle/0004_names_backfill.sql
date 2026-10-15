-- Backfill de name_key (ver src/lib/name-key.ts). Solo se ejecuta una vez sobre filas existentes:
-- el código de la app siempre escribe name_key desde JS. Equivalencia con nameKey(): NFC, trim,
-- espacios colapsados, minúsculas y sin tildes/diéresis salvo la ñ (translate, sin extensión unaccent).
-- Limitación conocida: diacríticos fuera de la lista del translate (p. ej. ș, ł) no se quitan aquí.
UPDATE "category" SET "name_key" = lower(translate(regexp_replace(regexp_replace(normalize("name", NFC), '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g'), 'áéíóúüàèìòùâêîôûäëïöãõçýÿÁÉÍÓÚÜÀÈÌÒÙÂÊÎÔÛÄËÏÖÃÕÇÝŸÑ', 'aeiouuaeiouaeiouaeioaocyyaeiouuaeiouaeiouaeioaocyyñ'));--> statement-breakpoint
UPDATE "product" SET "name_key" = lower(translate(regexp_replace(regexp_replace(normalize("name", NFC), '^\s+|\s+$', '', 'g'), '\s+', ' ', 'g'), 'áéíóúüàèìòùâêîôûäëïöãõçýÿÁÉÍÓÚÜÀÈÌÒÙÂÊÎÔÛÄËÏÖÃÕÇÝŸÑ', 'aeiouuaeiouaeiouaeioaocyyaeiouuaeiouaeiouaeioaocyyñ'));--> statement-breakpoint
-- Dedupe sin borrar ni fusionar: la fila más antigua (created_at, id) de cada grupo
-- (organization_id, name_key) queda intacta; las demás pasan a "<nombre> (2)", "(3)"...
-- eligiendo el primer sufijo cuya clave esté libre en la bodega.
DO $$
DECLARE
  r record;
  n integer;
BEGIN
  FOR r IN
    SELECT id, organization_id, name, name_key
    FROM (
      SELECT id, organization_id, name, name_key,
        row_number() OVER (PARTITION BY organization_id, name_key ORDER BY created_at, id) AS rn
      FROM "category"
    ) ranked
    WHERE rn > 1
    ORDER BY organization_id, name_key, rn
  LOOP
    n := 2;
    WHILE EXISTS (
      SELECT 1 FROM "category"
      WHERE organization_id = r.organization_id AND name_key = r.name_key || ' (' || n || ')'
    ) LOOP
      n := n + 1;
    END LOOP;
    UPDATE "category"
    SET name = r.name || ' (' || n || ')', name_key = r.name_key || ' (' || n || ')'
    WHERE id = r.id;
  END LOOP;
END $$;--> statement-breakpoint
DO $$
DECLARE
  r record;
  n integer;
BEGIN
  FOR r IN
    SELECT id, organization_id, name, name_key
    FROM (
      SELECT id, organization_id, name, name_key,
        row_number() OVER (PARTITION BY organization_id, name_key ORDER BY created_at, id) AS rn
      FROM "product"
    ) ranked
    WHERE rn > 1
    ORDER BY organization_id, name_key, rn
  LOOP
    n := 2;
    WHILE EXISTS (
      SELECT 1 FROM "product"
      WHERE organization_id = r.organization_id AND name_key = r.name_key || ' (' || n || ')'
    ) LOOP
      n := n + 1;
    END LOOP;
    UPDATE "product"
    SET name = r.name || ' (' || n || ')', name_key = r.name_key || ' (' || n || ')'
    WHERE id = r.id;
  END LOOP;
END $$;
