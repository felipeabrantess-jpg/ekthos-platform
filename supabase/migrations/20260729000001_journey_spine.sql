-- ============================================================
-- Journey Spine — Fase 1
-- Cria person_journey (espinha canônica) e journey_events (append-only)
-- ao lado do legado sem ligar nada, sem migrar dado vivo.
--
-- PROIBIDO: aplicar em produção antes do CP1 (aguardar Felipe).
-- IDEMPOTENTE: IF NOT EXISTS em todo DDL.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- TABELA: person_journey
-- Uma jornada ativa por pessoa por church (UNIQUE parcial).
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS person_journey (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id         UUID        NOT NULL REFERENCES churches(id)          ON DELETE CASCADE,
  person_id         UUID        NOT NULL REFERENCES people(id)            ON DELETE CASCADE,

  -- estado no funil
  -- NOT NULL: só cria jornada se a pessoa tem stage (regra 4 do backfill = NÃO CRIA)
  -- ON DELETE RESTRICT: impede deletar stage com jornadas ativas
  stage_id          UUID        NOT NULL REFERENCES pipeline_stages(id)   ON DELETE RESTRICT,

  -- pipeline que originou o stage (nullable: IGV legado tem stages sem pipeline_id)
  -- FK fraca: stages da IGV têm pipeline_stages.pipeline_id=NULL, pipelines table sem linha IGV
  pipeline_id       UUID                 REFERENCES pipelines(id)         ON DELETE SET NULL,

  -- responsabilidade pastoral
  owner_id          UUID                 REFERENCES auth.users(id)        ON DELETE SET NULL,
  ministry_id       UUID                 REFERENCES ministries(id)        ON DELETE SET NULL,

  -- lock otimista — versão incrementada a cada mutação pelas RPCs
  version           INTEGER     NOT NULL DEFAULT 1,

  -- lock de agente — prevenção de corrida entre execuções de agent-acolhimento
  agent_locked_at   TIMESTAMPTZ          DEFAULT NULL,

  -- privacidade pastoral (três níveis)
  confidentiality   TEXT        NOT NULL DEFAULT 'normal'
    CHECK (confidentiality IN ('normal', 'restricted', 'sealed')),

  -- ciclo de vida
  opened_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at         TIMESTAMPTZ          DEFAULT NULL,
  outcome           TEXT                 DEFAULT NULL,   -- 'discipulo','inativo','transferido',...

  -- próximo passo
  next_step         TEXT                 DEFAULT NULL,
  next_step_due_at  DATE                 DEFAULT NULL,

  -- observações livres
  notes             TEXT                 DEFAULT NULL,

  -- metadados
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- coerência: jornada fechada DEVE ter outcome
  CONSTRAINT journey_closed_requires_outcome
    CHECK (closed_at IS NULL OR outcome IS NOT NULL)
);

-- Uma única jornada ATIVA por person+church (permite múltiplas fechadas)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_person_journey_active
  ON person_journey (church_id, person_id)
  WHERE closed_at IS NULL;

-- Índices para acesso eficiente
-- Índice Kanban: (church_id, pipeline_id, stage_id)
-- pipeline_id nullable: igrejas legado (IGV) terão pipeline_id=NULL neste índice
CREATE INDEX IF NOT EXISTS idx_person_journey_kanban
  ON person_journey (church_id, pipeline_id, stage_id);

CREATE INDEX IF NOT EXISTS idx_person_journey_person
  ON person_journey (person_id);

CREATE INDEX IF NOT EXISTS idx_person_journey_owner
  ON person_journey (owner_id)
  WHERE owner_id IS NOT NULL;

-- Índice para tarefas pendentes de acompanhamento humano
CREATE INDEX IF NOT EXISTS idx_person_journey_next_step_due
  ON person_journey (church_id, next_step_due_at)
  WHERE next_step_due_at IS NOT NULL AND closed_at IS NULL;

-- updated_at automático
CREATE TRIGGER set_updated_at_person_journey
  BEFORE UPDATE ON person_journey
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ──────────────────────────────────────────────────────────────
-- RLS — person_journey
-- Padrão canônico: auth_church_id() (igual a care_contacts, church_units)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE person_journey ENABLE ROW LEVEL SECURITY;

-- Membros autenticados lêem jornadas da própria church
CREATE POLICY pj_select ON person_journey
  FOR SELECT TO authenticated
  USING (church_id = auth_church_id());

-- Apenas authenticated pode inserir, mas apenas na própria church
CREATE POLICY pj_insert ON person_journey
  FOR INSERT TO authenticated
  WITH CHECK (church_id = auth_church_id());

-- Update restrito à própria church (WITH CHECK obrigatório — armadilha de cross-tenant)
CREATE POLICY pj_update ON person_journey
  FOR UPDATE TO authenticated
  USING  (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

-- Service role (Edge Functions, crons) — acesso irrestrito
CREATE POLICY pj_service ON person_journey
  FOR ALL USING (auth.role() = 'service_role');


-- ──────────────────────────────────────────────────────────────
-- TABELA: journey_events
-- Log append-only de cada mutação na jornada.
-- UPDATE e DELETE são proibidos para authenticated e anon.
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS journey_events (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  journey_id   UUID        NOT NULL REFERENCES person_journey(id) ON DELETE CASCADE,
  church_id    UUID        NOT NULL REFERENCES churches(id)       ON DELETE CASCADE,

  -- tipo do evento (ex: 'stage_advance', 'note_added', 'owner_assigned', 'journey_closed')
  event_type   TEXT        NOT NULL,

  -- quem causou o evento (NULL = sistema/cron)
  actor_id     UUID                 REFERENCES auth.users(id) ON DELETE SET NULL,

  -- dados específicos do evento (livre por tipo)
  payload      JSONB       NOT NULL DEFAULT '{}',

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_journey_events_journey
  ON journey_events (journey_id);

CREATE INDEX IF NOT EXISTS idx_journey_events_church_created
  ON journey_events (church_id, created_at DESC);

-- ──────────────────────────────────────────────────────────────
-- RLS — journey_events (APPEND-ONLY)
-- authenticated pode SELECT e INSERT; UPDATE e DELETE são bloqueados
-- por ausência de policy (RLS com nenhuma policy → nega tudo)
-- ──────────────────────────────────────────────────────────────
ALTER TABLE journey_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY je_select ON journey_events
  FOR SELECT TO authenticated
  USING (church_id = auth_church_id());

CREATE POLICY je_insert ON journey_events
  FOR INSERT TO authenticated
  WITH CHECK (church_id = auth_church_id());

-- Sem policy de UPDATE → authenticated não pode fazer UPDATE
-- Sem policy de DELETE → authenticated não pode fazer DELETE

-- Revogação explícita como camada adicional de segurança
REVOKE UPDATE, DELETE ON journey_events FROM authenticated;
REVOKE UPDATE, DELETE ON journey_events FROM anon;

-- Service role (Edge Functions) — acesso completo incluindo reparos operacionais
CREATE POLICY je_service ON journey_events
  FOR ALL USING (auth.role() = 'service_role');
