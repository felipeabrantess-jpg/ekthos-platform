-- ============================================================
-- Segurança: journey_suggest_stage respeitava só o person_id recebido — devolvia as etapas de QUALQUER igreja
-- e era executável por anon. Agora: só a igreja da sessão (auth_church_id(), mesma regra do RLS) ou service_role;
-- anon perde o EXECUTE. Lógica de sugestão inalterada (definição de produção + só o bloco marcado, gerado por script).
-- Rollback: docs/rollbacks/20261027200000_journey_suggest_stage_tenant.rollback.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.journey_suggest_stage(p_person_id uuid, p_context jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_church_id    uuid;
  v_total        int;
  v_target_idx   int;
  v_stage        record;
  v_reason       text;
BEGIN
  SELECT church_id INTO v_church_id FROM people WHERE id = p_person_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PERSON_NOT_FOUND'; END IF;
  -- Isolamento entre igrejas: pessoa de outra igreja (ou chamada sem sessão) é tratada como inexistente.
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND (auth.uid() IS NULL OR v_church_id IS DISTINCT FROM auth_church_id()) THEN
    RAISE EXCEPTION 'PERSON_NOT_FOUND';
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM pipeline_stages
  WHERE church_id = v_church_id AND is_active = true;

  IF v_total = 0 THEN RAISE EXCEPTION 'NO_STAGES_CONFIGURED'; END IF;

  v_target_idx := CASE
    WHEN (p_context->>'membro_outra_igreja')::boolean = true THEN v_total - 1
    WHEN (p_context->>'tem_batismo')::boolean         = true THEN GREATEST(0, v_total - 2)
    WHEN (p_context->>'quer_servir')::boolean         = true THEN GREATEST(0, v_total - 2)
    WHEN (p_context->>'fez_connect')::boolean         = true THEN LEAST(v_total - 1, 4)
    WHEN (p_context->>'quer_celula')::boolean         = true THEN GREATEST(0, v_total / 2)
    WHEN (p_context->>'quer_ser_membro')::boolean     = true THEN GREATEST(0, v_total / 2)
    WHEN (p_context->>'accepted_jesus')::boolean      = true THEN LEAST(1, v_total - 1)
    WHEN (p_context->>'voltou_ao_culto')::boolean     = true THEN LEAST(1, v_total - 1)
    ELSE 0
  END;

  v_reason := CASE
    WHEN (p_context->>'membro_outra_igreja')::boolean = true
      THEN 'Membro transferido — já tem maturidade espiritual comprovada'
    WHEN (p_context->>'tem_batismo')::boolean = true
      THEN 'Já foi batizado — indica avanço no discipulado'
    WHEN (p_context->>'quer_servir')::boolean = true
      THEN 'Quer servir — pronto para integrar equipe de voluntários'
    WHEN (p_context->>'fez_connect')::boolean = true
      THEN 'Fez o Connect — etapa de integração concluída'
    WHEN (p_context->>'quer_celula')::boolean = true
      THEN 'Quer participar de célula — avançando no discipulado'
    WHEN (p_context->>'quer_ser_membro')::boolean = true
      THEN 'Quer se tornar membro — comprometido com a igreja'
    WHEN (p_context->>'accepted_jesus')::boolean = true
      THEN 'Aceitou Jesus recentemente — início da jornada de fé'
    WHEN (p_context->>'voltou_ao_culto')::boolean = true
      THEN 'Voltou ao culto — oportunidade de reconciliação e acolhimento'
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
$function$;

REVOKE EXECUTE ON FUNCTION public.journey_suggest_stage(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.journey_suggest_stage(uuid, jsonb) TO authenticated, service_role;
