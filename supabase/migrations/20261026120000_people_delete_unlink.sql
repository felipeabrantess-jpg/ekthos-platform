-- ============================================================
-- Lote 1 IGV (ata 24/10, itens 8/12/28) — exclusão de pessoa sem vínculos residuais
--
-- Problema: excluir uma pessoa (people.deleted_at) não desfazia liderança, vínculos de
-- ministério, liderança de célula, voluntariado nem a presença na Fila de Encaminhamentos.
-- (Ex.: o ministério ACOLHIMENTO seguiu liderado por um cadastro excluído.)
--
-- Solução:
--   1. Trigger AFTER UPDATE OF deleted_at: quando a pessoa passa de ativa para excluída, na MESMA igreja:
--        ministries.leader_id      → NULL
--        groups.leader_id/co_leader_id → NULL
--        ministry_members          → removidos
--        leaders / volunteers      → is_active = false
--      Cada linha afetada é guardada ANTES da mudança em people_deletion_unlinks (restaurável).
--   2. get_ministry_referrals ignora pessoas excluídas (a jornada não é alterada).
--
-- Não toca em dados existentes: só age em exclusões FUTURAS. Resíduos legados (1 voluntário ativo
-- de pessoa excluída, 13 jornadas abertas) ficam para decisão manual.
-- Rollback: docs/rollbacks/20261026120000_people_delete_unlink.rollback.sql
-- ============================================================

-- ── 1. Registro do que foi desfeito (para auditoria e restauração) ─────────────
CREATE TABLE IF NOT EXISTS public.people_deletion_unlinks (
  id          bigserial PRIMARY KEY,
  church_id   uuid        NOT NULL,
  person_id   uuid        NOT NULL,
  deleted_at  timestamptz NOT NULL,
  table_name  text        NOT NULL,
  row_id      uuid        NOT NULL,
  action      text        NOT NULL,   -- 'clear_leader_id' | 'clear_co_leader_id' | 'delete' | 'deactivate'
  row_before  jsonb       NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS people_deletion_unlinks_person_idx ON public.people_deletion_unlinks (church_id, person_id);
ALTER TABLE public.people_deletion_unlinks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.people_deletion_unlinks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.people_deletion_unlinks_id_seq FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.people_deletion_unlinks IS
  'Vínculos desfeitos automaticamente ao excluir uma pessoa (trigger people_unlink_on_delete). row_before = linha antes da mudança. Só service_role.';

-- ── 2. Desfazer vínculos ao excluir ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.people_unlink_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_church uuid        := NEW.church_id;
  v_person uuid        := NEW.id;
  v_at     timestamptz := NEW.deleted_at;
BEGIN
  -- Liderança de ministério
  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT v_church, v_person, v_at, 'ministries', m.id, 'clear_leader_id', to_jsonb(m)
  FROM ministries m WHERE m.church_id = v_church AND m.leader_id = v_person;
  UPDATE ministries SET leader_id = NULL, updated_at = now()
  WHERE church_id = v_church AND leader_id = v_person;

  -- Liderança / co-liderança de célula
  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT v_church, v_person, v_at, 'groups', g.id, 'clear_leader_id', to_jsonb(g)
  FROM groups g WHERE g.church_id = v_church AND g.leader_id = v_person;
  UPDATE groups SET leader_id = NULL, updated_at = now()
  WHERE church_id = v_church AND leader_id = v_person;

  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT v_church, v_person, v_at, 'groups', g.id, 'clear_co_leader_id', to_jsonb(g)
  FROM groups g WHERE g.church_id = v_church AND g.co_leader_id = v_person;
  UPDATE groups SET co_leader_id = NULL, updated_at = now()
  WHERE church_id = v_church AND co_leader_id = v_person;

  -- Vínculos de ministério (inclui os criados por encaminhamento)
  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT v_church, v_person, v_at, 'ministry_members', mm.id, 'delete', to_jsonb(mm)
  FROM ministry_members mm WHERE mm.church_id = v_church AND mm.person_id = v_person;
  DELETE FROM ministry_members WHERE church_id = v_church AND person_id = v_person;

  -- Papéis de liderança e voluntariado ativos
  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT v_church, v_person, v_at, 'leaders', l.id, 'deactivate', to_jsonb(l)
  FROM leaders l WHERE l.church_id = v_church AND l.person_id = v_person AND l.is_active;
  UPDATE leaders SET is_active = false, updated_at = now()
  WHERE church_id = v_church AND person_id = v_person AND is_active;

  INSERT INTO people_deletion_unlinks (church_id, person_id, deleted_at, table_name, row_id, action, row_before)
  SELECT v_church, v_person, v_at, 'volunteers', v.id, 'deactivate', to_jsonb(v)
  FROM volunteers v WHERE v.church_id = v_church AND v.person_id = v_person AND v.is_active;
  UPDATE volunteers SET is_active = false, updated_at = now()
  WHERE church_id = v_church AND person_id = v_person AND is_active;

  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.people_unlink_on_delete() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS people_unlink_on_delete ON public.people;
CREATE TRIGGER people_unlink_on_delete
  AFTER UPDATE OF deleted_at ON public.people
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
  EXECUTE FUNCTION public.people_unlink_on_delete();

-- ── 3. Fila de Encaminhamentos: pessoa excluída não aparece ─────────────────────
-- Idêntica à versão de 20261005100000 (conferida com produção em 26/10), mais o filtro p.deleted_at IS NULL.
CREATE OR REPLACE FUNCTION public.get_ministry_referrals(p_ministry_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(journey_id uuid, journey_version integer, person_id uuid, person_name text, person_phone text, etapa_nome text, ministry_id uuid, ministry_name text, encaminhado_em timestamp with time zone, encaminhado_por text, dias_esperando integer, anotacao text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_church_id  uuid;
  v_is_admin   boolean;
BEGIN
  v_church_id := auth_church_id();
  IF v_church_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN: church_id não identificado';
  END IF;

  SELECT (ur.role IN ('admin', 'admin_departments'))
  INTO   v_is_admin
  FROM   user_roles ur
  WHERE  ur.user_id   = auth.uid()
    AND  ur.church_id = v_church_id
  LIMIT 1;

  -- NULL significa papel não encontrado (ex: ministry_leader sem linha em user_roles … improvável)
  v_is_admin := COALESCE(v_is_admin, false);

  RETURN QUERY
  SELECT
    pj.id                                              AS journey_id,
    pj.version                                         AS journey_version,
    pj.person_id,
    p.name                                             AS person_name,
    p.phone                                            AS person_phone,
    ps.name                                            AS etapa_nome,
    pj.ministry_id,
    m.name                                             AS ministry_name,
    ev.created_at                                      AS encaminhado_em,
    COALESCE(pr.name, pr.display_name, 'Sistema')      AS encaminhado_por,
    GREATEST(0,
      EXTRACT(DAY FROM NOW() - ev.created_at)::integer
    )                                                  AS dias_esperando,
    pj.notes                                           AS anotacao

  FROM person_journey pj
  JOIN people          p  ON  p.id  = pj.person_id
  JOIN ministries      m  ON  m.id  = pj.ministry_id
  LEFT JOIN pipeline_stages ps ON ps.id = pj.stage_id

  -- Evento de encaminhamento mais recente que gerou o ministry_id atual
  JOIN LATERAL (
    SELECT je.actor_id, je.created_at
    FROM   journey_events je
    WHERE  je.journey_id = pj.id
      AND  je.event_type = 'ministry_referral'
      AND  (je.payload->>'ministry_id')::uuid = pj.ministry_id
    ORDER  BY je.created_at DESC
    LIMIT  1
  ) ev ON true

  LEFT JOIN profiles pr ON pr.user_id = ev.actor_id

  WHERE pj.church_id  = v_church_id
    AND p.deleted_at   IS NULL   -- pessoa excluída sai da fila (Lote 1 IGV)
    AND pj.ministry_id IS NOT NULL
    AND pj.closed_at   IS NULL
    -- Não resolvido: pessoa não está em ministry_members daquele ministério
    AND NOT EXISTS (
      SELECT 1
      FROM   ministry_members mm
      WHERE  mm.person_id   = pj.person_id
        AND  mm.ministry_id = pj.ministry_id
        AND  mm.church_id   = v_church_id
    )
    -- Escopo pela autoridade canônica do ministério (can_manage_ministry):
    --   admin / admin_departments → todos os ministérios da igreja;
    --   conta vinculada em ministries.leader_user_id → só o(s) ministério(s) que administra;
    --   qualquer outro usuário → nada.
    -- Nunca por e-mail e nunca por leader_id (pessoa líder não é permissão de sistema).
    AND can_manage_ministry(pj.ministry_id)
    AND (p_ministry_id IS NULL OR pj.ministry_id = p_ministry_id)

  ORDER BY ev.created_at ASC;  -- mais antigos primeiro (maior urgência)
END;
$function$;
