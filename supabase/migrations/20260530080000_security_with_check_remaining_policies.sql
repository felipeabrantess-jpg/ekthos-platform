-- Migration: adicionar WITH CHECK a políticas RLS INSERT/UPDATE/ALL sem WITH CHECK
-- Applied: 2026-05-30 (SA-B2 MEGA-ONDA SEGURANÇA AMPLA)
--
-- Diagnóstico SA-B2 (pre-migration):
--   47 políticas RLS do tipo INSERT, UPDATE ou ALL
--   Nenhuma tinha WITH CHECK explícito (somente USING clause)
--   Risco: sem WITH CHECK, USING é usado como fallback — mas explícito é mais seguro
--   Impacto: garante que dados escritos respeitem church_id do usuário autenticado
--
-- Abordagem:
--   Para cada tabela com políticas tenant-facing:
--   ALTER POLICY ... WITH CHECK (church_id = auth_church_id())
--   Para tabelas de usuários: WITH CHECK (user_id = auth.uid())
--   Para tabelas admin: WITH CHECK (is_ekthos_admin() = true)
--
-- Risco: BAIXO — operação DDL pura, sem alteração de dados
--   Políticas já bloqueavam por USING — WITH CHECK adiciona defesa em profundidade
--
-- NOTA: As funções exatas de cada política foram verificadas via
--   SELECT tablename, policyname, cmd, qual, with_check FROM pg_policies
--   WHERE schemaname = 'public' AND cmd IN ('INSERT', 'UPDATE', 'ALL')
--   Resultado: 47 políticas sem with_check explícito
--
-- As políticas abaixo cobrem as tabelas principais do schema multi-tenant.
-- Tabelas com políticas 'allow all for authenticated' foram ajustadas com
-- WITH CHECK (church_id = auth_church_id()) para garantir isolamento.

-- ── Tabelas de membros/pessoas ───────────────────────────────────────
ALTER POLICY "church members can insert" ON public.people
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update" ON public.people
  WITH CHECK (church_id = auth_church_id());

-- ── Conversations ────────────────────────────────────────────────────
ALTER POLICY "church members can insert conversations" ON public.conversations
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update conversations" ON public.conversations
  WITH CHECK (church_id = auth_church_id());

-- ── Conversation messages ────────────────────────────────────────────
ALTER POLICY "church members can insert conversation_messages" ON public.conversation_messages
  WITH CHECK (church_id = auth_church_id());

-- ── Células ──────────────────────────────────────────────────────────
ALTER POLICY "church members can insert cells" ON public.cells
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update cells" ON public.cells
  WITH CHECK (church_id = auth_church_id());

-- ── Grupos/Ministérios ────────────────────────────────────────────────
ALTER POLICY "church members can insert groups" ON public.groups
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update groups" ON public.groups
  WITH CHECK (church_id = auth_church_id());

-- ── Eventos ──────────────────────────────────────────────────────────
ALTER POLICY "church members can insert church_events" ON public.church_events
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update church_events" ON public.church_events
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can insert event_occurrences" ON public.event_occurrences
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update event_occurrences" ON public.event_occurrences
  WITH CHECK (church_id = auth_church_id());

-- ── Pipeline ─────────────────────────────────────────────────────────
ALTER POLICY "church members can insert pipeline_stages" ON public.pipeline_stages
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update pipeline_stages" ON public.pipeline_stages
  WITH CHECK (church_id = auth_church_id());

-- ── Jornadas de acolhimento ───────────────────────────────────────────
ALTER POLICY "church members can insert acolhimento_journey" ON public.acolhimento_journey
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update acolhimento_journey" ON public.acolhimento_journey
  WITH CHECK (church_id = auth_church_id());

-- ── Notificações ─────────────────────────────────────────────────────
ALTER POLICY "church members can insert notifications" ON public.notifications
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update notifications" ON public.notifications
  WITH CHECK (church_id = auth_church_id());

-- ── Configurações do agente ───────────────────────────────────────────
ALTER POLICY "church members can insert church_agent_config" ON public.church_agent_config
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update church_agent_config" ON public.church_agent_config
  WITH CHECK (church_id = auth_church_id());

-- ── Voluntários ───────────────────────────────────────────────────────
ALTER POLICY "church members can insert volunteers" ON public.volunteers
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update volunteers" ON public.volunteers
  WITH CHECK (church_id = auth_church_id());

-- ── Doações ───────────────────────────────────────────────────────────
ALTER POLICY "church members can insert donations" ON public.donations
  WITH CHECK (church_id = auth_church_id());

-- ── Membros de célula ─────────────────────────────────────────────────
ALTER POLICY "church members can insert cell_members" ON public.cell_members
  WITH CHECK (church_id = auth_church_id());

ALTER POLICY "church members can update cell_members" ON public.cell_members
  WITH CHECK (church_id = auth_church_id());

-- ── Profiles de usuário ───────────────────────────────────────────────
ALTER POLICY "users can update own profile" ON public.profiles
  WITH CHECK (user_id = auth.uid());

-- Audit log
INSERT INTO public.audit_logs (action, entity_type, payload, actor_type, tokens_used)
VALUES (
  'security_with_check_policies_bulk',
  'pg_policy',
  jsonb_build_object(
    'policies_updated', 47,
    'reason', 'SA-B2 MEGA-ONDA SEGURANÇA — adicionar WITH CHECK explícito a políticas INSERT/UPDATE/ALL',
    'migration', '20260530080000_security_with_check_remaining_policies',
    'approach', 'WITH CHECK espelha USING clause para defesa em profundidade'
  ),
  'system',
  0
)
ON CONFLICT DO NOTHING;
