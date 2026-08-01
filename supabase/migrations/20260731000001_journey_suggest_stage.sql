-- E2: Fase 3 — Atendimento Pastoral
-- Sugere etapa do pipeline com base em sinais de contexto.
-- Lógica proporcional ao catálogo da igreja (nenhum slug hardcoded).

CREATE OR REPLACE FUNCTION public.journey_suggest_stage(
  p_person_id  uuid,
  p_context    jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_church_id    uuid;
  v_total        int;
  v_target_idx   int;
  v_stage        record;
  v_reason       text;
BEGIN
  SELECT church_id INTO v_church_id FROM people WHERE id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSON_NOT_FOUND'; END IF;

  SELECT COUNT(*) INTO v_total FROM pipeline_stages
  WHERE church_id = v_church_id AND is_active = true;

  IF v_total = 0 THEN RAISE EXCEPTION 'NO_STAGES_CONFIGURED'; END IF;

  v_target_idx := CASE
    WHEN (p_context->>'membro_outra_igreja')::boolean = true THEN v_total - 1
    WHEN (p_context->>'tem_batismo')::boolean         = true THEN GREATEST(0, v_total - 2)
    WHEN (p_context->>'quer_celula')::boolean         = true THEN GREATEST(0, v_total / 2)
    WHEN (p_context->>'accepted_jesus')::boolean      = true THEN LEAST(1, v_total - 1)
    ELSE 0
  END;

  v_reason := CASE
    WHEN (p_context->>'membro_outra_igreja')::boolean = true
      THEN 'Membro transferido — já tem maturidade espiritual comprovada'
    WHEN (p_context->>'tem_batismo')::boolean = true
      THEN 'Já foi batizado — indica avanço no discipulado'
    WHEN (p_context->>'quer_celula')::boolean = true
      THEN 'Quer participar de célula — avançando no discipulado'
    WHEN (p_context->>'accepted_jesus')::boolean = true
      THEN 'Aceitou Jesus recentemente — início da jornada de fé'
    ELSE 'Primeiro contato — início do acompanhamento'
  END;

  SELECT id, name, order_index INTO v_stage
  FROM pipeline_stages
  WHERE church_id = v_church_id AND is_active = true
  ORDER BY order_index ASC
  OFFSET LEAST(v_target_idx, v_total - 1)
  LIMIT 1;

  RETURN jsonb_build_object(
    'stage_id',    v_stage.id,
    'stage_name',  v_stage.name,
    'order_index', v_stage.order_index,
    'reason',      v_reason
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.journey_suggest_stage(uuid, jsonb) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.journey_suggest_stage(uuid, jsonb) TO authenticated;
