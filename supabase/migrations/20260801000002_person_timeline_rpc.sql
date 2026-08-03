-- A2: AtendimentoPage v2 — Timeline unificada por pessoa (somente leitura)
-- Une journey_events, conversation_messages e acolhimento_journey
-- ordenado do mais recente ao mais antigo.
-- SECURITY DEFINER + tenant guard: somente dados da própria igreja.

CREATE OR REPLACE FUNCTION public.get_person_timeline(
  p_person_id uuid,
  p_limit     integer DEFAULT 50
)
RETURNS TABLE (
  event_at    timestamptz,
  source      text,
  actor_type  text,
  actor_name  text,
  event_kind  text,
  summary     text,
  raw_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_church_id uuid;
BEGIN
  -- Tenant guard: church_id do JWT
  v_church_id := (auth.jwt() -> 'app_metadata' ->> 'church_id')::uuid;

  -- Verifica que a pessoa pertence à igreja do chamador
  IF NOT EXISTS (
    SELECT 1 FROM people
    WHERE id         = p_person_id
      AND church_id  = v_church_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  RETURN QUERY

  -- ── 1. Journey events ─────────────────────────────────────────
  SELECT
    je.created_at                                                         AS event_at,
    'journey_event'::text                                                 AS source,
    je.actor_type                                                         AS actor_type,
    COALESCE(
      au.raw_user_meta_data ->> 'full_name',
      au.email,
      CASE je.actor_type WHEN 'agent' THEN 'Agente' ELSE 'Sistema' END
    )::text                                                               AS actor_name,
    je.event_type                                                         AS event_kind,
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
        CONCAT(
          'Responsável: ',
          COALESCE(au.raw_user_meta_data ->> 'full_name', au.email, 'atribuído')
        )
      ELSE je.event_type
    END::text                                                             AS summary,
    je.payload                                                            AS raw_payload
  FROM journey_events  je
  JOIN person_journey  pj ON pj.id       = je.journey_id
  LEFT JOIN auth.users au ON au.id       = je.actor_id
  WHERE pj.person_id  = p_person_id
    AND pj.church_id  = v_church_id
    AND je.church_id  = v_church_id

  UNION ALL

  -- ── 2. Mensagens de conversa WhatsApp ─────────────────────────
  SELECT
    cm.created_at                                                         AS event_at,
    'message'::text                                                       AS source,
    CASE cm.sender_type
      WHEN 'contact'     THEN 'human'
      WHEN 'human_staff' THEN 'human'
      ELSE                    'agent'
    END::text                                                             AS actor_type,
    CASE cm.sender_type
      WHEN 'contact'     THEN 'Visitante'
      WHEN 'human_staff' THEN 'Equipe'
      WHEN 'agent'       THEN 'Agente de Acolhimento'
      ELSE                    'Sistema'
    END::text                                                             AS actor_name,
    'conversation_message'::text                                          AS event_kind,
    LEFT(cm.content, 300)::text                                           AS summary,
    jsonb_build_object(
      'direction',   cm.direction,
      'sender_type', cm.sender_type
    )                                                                     AS raw_payload
  FROM conversation_messages cm
  JOIN conversations         c  ON c.id        = cm.conversation_id
  WHERE c.person_id  = p_person_id
    AND c.church_id  = v_church_id
    AND cm.content_type = 'text'
    AND cm.status   != 'failed'

  UNION ALL

  -- ── 3. Touchpoints de acolhimento enviados ────────────────────
  SELECT
    (tp ->> 'sent_at')::timestamptz                                       AS event_at,
    'acolhimento'::text                                                   AS source,
    'agent'::text                                                         AS actor_type,
    'Agente de Acolhimento'::text                                         AS actor_name,
    'touch_sent'::text                                                    AS event_kind,
    CONCAT(
      'Toque ',
      COALESCE(tp ->> 'touchpoint', tp ->> 'touch_day', '?'),
      ' enviado'
    )::text                                                               AS summary,
    tp                                                                    AS raw_payload
  FROM acolhimento_journey aj,
    jsonb_array_elements(COALESCE(aj.touchpoints_sent, '[]'::jsonb)) AS tp
  WHERE aj.person_id  = p_person_id
    AND aj.church_id  = v_church_id
    AND (tp ->> 'sent_at') IS NOT NULL

  ORDER BY event_at DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_person_timeline(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_person_timeline(uuid, integer) FROM anon;
GRANT  EXECUTE ON FUNCTION public.get_person_timeline(uuid, integer) TO authenticated;
