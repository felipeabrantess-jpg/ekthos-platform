-- Migration: 20260812000003_timeline_ministry_name_actor_name
-- Corrige dois problemas na get_person_timeline:
--
-- C1: ministry_referral mostrava slug do evento ("ministry_referral")
--     em vez do nome do ministério. Corrigido via payload->>'ministry_name'
--     com fallback em JOIN em ministries (caso payload antigo sem ministry_name).
--
-- C2: actor_name mostrava email (au.email) porque
--     raw_user_meta_data->>'full_name' é null para a maioria dos usuários IGV.
--     Corrigido via LEFT JOIN profiles → priorizar pr.name, pr.display_name,
--     depois raw_user_meta_data, depois email.
--     Aplicado em TODOS os event_types (journey_assign, actor_name geral).
--
-- C3: Demais event_types na IGV (pastoral_contact, stage_advance,
--     journey_opened): já exibiam texto legível — sem alteração.
--     journey_assign: 0 eventos na IGV hoje, mas o WHEN existente
--     foi corrigido para também usar profiles.
--
-- Idempotente: DROP FUNCTION IF EXISTS antes do CREATE.

DROP FUNCTION IF EXISTS public.get_person_timeline(uuid, integer);

CREATE OR REPLACE FUNCTION public.get_person_timeline(
  p_person_id uuid,
  p_limit     integer DEFAULT 50
)
RETURNS TABLE (
  event_at     timestamptz,
  source       text,
  actor_type   text,
  actor_name   text,
  event_kind   text,
  summary      text,
  raw_payload  jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_church_id uuid;
BEGIN
  v_church_id := (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM people
    WHERE id        = p_person_id
      AND church_id = v_church_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY

  -- ── 1. Journey events ─────────────────────────────────────────
  SELECT
    je.created_at                                                 AS event_at,
    'journey_event'::text                                         AS source,
    je.actor_type                                                 AS actor_type,

    -- C2: profiles tem prioridade sobre auth.users.raw_user_meta_data
    COALESCE(
      pr.name,
      pr.display_name,
      au.raw_user_meta_data ->> 'full_name',
      au.email,
      CASE je.actor_type WHEN 'agent' THEN 'Agente' ELSE 'Sistema' END
    )::text                                                       AS actor_name,

    je.event_type                                                 AS event_kind,

    CASE je.event_type
      WHEN 'pastoral_contact' THEN
        COALESCE(
          NULLIF(je.payload ->> 'notes', ''),
          'Contato via ' || COALESCE(je.payload ->> 'channel', 'canal não informado')
        )
      WHEN 'stage_advance' THEN
        CONCAT(
          'Avançou para ',
          COALESCE(
            (SELECT name FROM pipeline_stages
             WHERE id = (je.payload ->> 'to_stage_id')::uuid LIMIT 1),
            'nova etapa'
          )
        )
      WHEN 'journey_opened' THEN 'Jornada de discipulado iniciada'
      WHEN 'journey_assign' THEN
        -- C2 também aqui: usa profiles para o responsável
        CONCAT(
          'Responsável: ',
          COALESCE(
            pr.name,
            pr.display_name,
            au.raw_user_meta_data ->> 'full_name',
            au.email,
            'atribuído'
          )
        )
      WHEN 'ministry_referral' THEN
        -- C1: nome do ministério via payload (preferido) ou JOIN
        CONCAT(
          'Encaminhado para ',
          COALESCE(
            je.payload ->> 'ministry_name',
            (SELECT m.name FROM ministries m
             WHERE m.id        = (je.payload ->> 'ministry_id')::uuid
               AND m.church_id = v_church_id
             LIMIT 1),
            'ministério'
          )
        )
      ELSE je.event_type
    END::text                                                     AS summary,

    je.payload                                                    AS raw_payload

  FROM journey_events  je
  JOIN person_journey  pj ON pj.id       = je.journey_id
  LEFT JOIN auth.users au ON au.id       = je.actor_id
  LEFT JOIN profiles   pr ON pr.user_id  = je.actor_id   -- C2: join adicionado
  WHERE pj.person_id = p_person_id
    AND pj.church_id = v_church_id
    AND je.church_id = v_church_id

  UNION ALL

  -- ── 2. Mensagens de conversa WhatsApp ─────────────────────────
  SELECT
    cm.created_at                                                 AS event_at,
    'message'::text                                               AS source,
    CASE cm.sender_type
      WHEN 'contact'     THEN 'human'
      WHEN 'human_staff' THEN 'human'
      ELSE                    'agent'
    END::text                                                     AS actor_type,
    CASE cm.sender_type
      WHEN 'contact'     THEN 'Visitante'
      WHEN 'human_staff' THEN 'Equipe'
      WHEN 'agent'       THEN 'Agente de Acolhimento'
      ELSE                    'Sistema'
    END::text                                                     AS actor_name,
    'conversation_message'::text                                  AS event_kind,
    format_wa_content(cm.content)::text                           AS summary,
    jsonb_build_object(
      'direction',   cm.direction,
      'sender_type', cm.sender_type
    )                                                             AS raw_payload
  FROM conversation_messages cm
  JOIN conversations         c  ON c.id = cm.conversation_id
  WHERE c.person_id        = p_person_id
    AND c.church_id        = v_church_id
    AND cm.content_type    = 'text'
    AND cm.status         != 'failed'

  UNION ALL

  -- ── 3. Touchpoints de acolhimento enviados ────────────────────
  SELECT
    (tp ->> 'sent_at')::timestamptz                               AS event_at,
    'acolhimento'::text                                           AS source,
    'agent'::text                                                 AS actor_type,
    'Agente de Acolhimento'::text                                 AS actor_name,
    'touch_sent'::text                                            AS event_kind,
    CONCAT(
      'Toque ',
      COALESCE(tp ->> 'touchpoint', tp ->> 'touch_day', '?'),
      ' enviado'
    )::text                                                       AS summary,
    tp                                                            AS raw_payload
  FROM acolhimento_journey aj,
    jsonb_array_elements(COALESCE(aj.touchpoints_sent, '[]'::jsonb)) AS tp
  WHERE aj.person_id = p_person_id
    AND aj.church_id = v_church_id
    AND (tp ->> 'sent_at') IS NOT NULL

  ORDER BY event_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- Grants: mantém o padrão existente (SECURITY DEFINER, sem PUBLIC)
REVOKE ALL     ON FUNCTION public.get_person_timeline(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_person_timeline(uuid, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_person_timeline(uuid, integer) TO authenticated;
