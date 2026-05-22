-- ============================================================
-- Migration: fix_apply_discipleship_template_slug
-- Sprint: Cluster A — Bug #29
-- Criada em: 2026-05-21
--
-- Corrige apply_discipleship_template que falhava com:
--   "null value in column slug violates not-null constraint"
--
-- Causa: INSERT em pipeline_stages não incluía coluna `slug`
--   (NOT NULL sem DEFAULT). A migration adiciona geração de slug
--   a partir do `name` da etapa.
--
-- Também adiciona ON CONFLICT (church_id, slug) DO UPDATE para
-- permitir re-aplicação do mesmo template sem violar a UNIQUE
-- constraint pipeline_stages_church_slug_unique.
--
-- Pré-requisitos:
--   - Tabela pipeline_stages com coluna slug text NOT NULL
--   - UNIQUE (church_id, slug)
--   - discipleship_templates com coluna stages jsonb
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_discipleship_template(
  p_church_id    uuid,
  p_template_slug text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_stage jsonb;
  v_idx   int  := 0;
  v_slug  text;
BEGIN
  -- Verify caller owns this church (prevents tenancy escalation)
  IF (SELECT auth_church_id()) IS DISTINCT FROM p_church_id THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  -- Deactivate all existing stages for this church
  UPDATE public.pipeline_stages
  SET is_active = false
  WHERE church_id = p_church_id;

  -- Insert / reactivate stages from template
  FOR v_stage IN
    SELECT jsonb_array_elements(stages)
    FROM public.discipleship_templates
    WHERE slug = p_template_slug
  LOOP
    v_idx := v_idx + 1;

    -- Generate slug: lowercase, remove non-alphanumeric (except spaces/hyphens),
    -- collapse whitespace/hyphens into single hyphen.
    -- Example: "Discípulo Avançado" → "discp-avanado" (accented chars removed
    -- via [^a-z0-9] regex — sufficient for PT-BR stage names used in templates).
    v_slug := regexp_replace(
      regexp_replace(
        lower(v_stage->>'name'),
        '[^a-z0-9\s-]', '', 'g'       -- remove non-alphanumeric (keeps spaces/hyphens)
      ),
      '[\s-]+', '-', 'g'              -- collapse whitespace and hyphens to single dash
    );
    -- Trim leading/trailing dashes
    v_slug := trim(both '-' from v_slug);
    -- Safety: if slug ends up empty, fall back to index
    IF v_slug = '' THEN
      v_slug := 'stage-' || v_idx::text;
    END IF;

    INSERT INTO public.pipeline_stages (
      church_id,
      name,
      slug,
      order_index,
      is_active,
      sla_hours,
      color,
      icon,
      is_entry_point,
      is_terminal,
      description
    ) VALUES (
      p_church_id,
      v_stage->>'name',
      v_slug,
      (v_stage->>'order_index')::int,
      true,
      CASE WHEN v_stage->>'sla_hours' IS NOT NULL
           THEN (v_stage->>'sla_hours')::int
           ELSE NULL
      END,
      COALESCE(v_stage->>'color', '#e13500'),
      COALESCE(v_stage->>'icon',  'circle'),
      COALESCE((v_stage->>'is_entry_point')::boolean, false),
      COALESCE((v_stage->>'is_terminal')::boolean,    false),
      v_stage->>'description'
    )
    ON CONFLICT (church_id, slug) DO UPDATE SET
      name           = EXCLUDED.name,
      order_index    = EXCLUDED.order_index,
      is_active      = true,
      sla_hours      = EXCLUDED.sla_hours,
      color          = EXCLUDED.color,
      icon           = EXCLUDED.icon,
      is_entry_point = EXCLUDED.is_entry_point,
      is_terminal    = EXCLUDED.is_terminal,
      description    = EXCLUDED.description;
  END LOOP;

  IF v_idx = 0 THEN
    RAISE EXCEPTION 'template_not_found: %', p_template_slug;
  END IF;
END;
$$;

-- Grants mantidos
GRANT EXECUTE ON FUNCTION public.apply_discipleship_template(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_discipleship_template(uuid, text) TO service_role;
