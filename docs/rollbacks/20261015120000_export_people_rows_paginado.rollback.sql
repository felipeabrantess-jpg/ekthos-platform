-- Rollback de 20261015120000_export_people_rows_paginado.sql
DROP FUNCTION IF EXISTS public.export_people_rows_page(uuid, text, text, text, text, text, date, date, date, date, text, uuid, integer, text, text, timestamptz, uuid, integer);
