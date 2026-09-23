-- Decisão 24/09: unit_cutoff_date NÃO define escopo operacional.
-- Fonte de unidade = people.unit_id bruto (NULL = sem unidade).
-- A coluna churches.unit_cutoff_date permanece (histórico/auditoria); nenhum UPDATE em people.
--
-- Implementação: default de p_apply_cutoff passa a FALSE em todas as RPCs canônicas.
-- get_unit_counts (legado, sem consumidores em /pessoas) volta a agrupar por unit_id bruto.
--
-- Rollback: reaplicar 20260924100000 (defaults TRUE) e 20260923100000 (get_unit_counts com corte).

CREATE OR REPLACE FUNCTION people_unit_scope_ok(
  p_unit uuid, p_created timestamptz, p_cutoff date, p_scope text, p_apply_cutoff boolean DEFAULT FALSE
) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_scope IS NULL THEN TRUE
    WHEN p_scope = 'none' THEN
      (p_unit IS NULL OR (p_apply_cutoff AND p_cutoff IS NOT NULL AND p_created::date < p_cutoff))
    ELSE
      p_unit = p_scope::uuid
      AND (NOT p_apply_cutoff OR p_cutoff IS NULL OR p_created::date >= p_cutoff)
  END
$$;

-- Redefinir defaults sem repetir os corpos: PostgreSQL não permite ALTER de DEFAULT em
-- funções, então as três RPCs são recriadas a partir da definição atual trocando o default.
DO $$
DECLARE
  r record;
  v_def text;
BEGIN
  FOR r IN
    SELECT oid FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN ('get_people_page', 'get_people_stage_counts', 'get_care_status_counts')
  LOOP
    v_def := pg_get_functiondef(r.oid);
    v_def := replace(v_def, 'p_apply_cutoff boolean DEFAULT true', 'p_apply_cutoff boolean DEFAULT false');
    EXECUTE v_def;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION get_unit_counts(p_church_id uuid)
RETURNS TABLE (unit_id uuid, person_stage text, cnt bigint)
LANGUAGE sql SECURITY DEFINER SET search_path = public STABLE
AS $$
  SELECT p.unit_id, p.person_stage, COUNT(*) AS cnt
  FROM people p
  WHERE p.church_id = p_church_id AND p.deleted_at IS NULL
  GROUP BY 1, 2;
$$;
