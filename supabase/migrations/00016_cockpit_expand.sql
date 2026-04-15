-- ============================================================
-- Migration: 00016_cockpit_expand.sql
-- Descrição: Expande o cockpit admin com:
--   1. admin_events     — auditoria de ações admin sobre igrejas
--   2. admin_tasks      — tarefas internas do time Ekthos
--   3. church_notes     — notas internas do time sobre uma conta
--   4. ALTER churches   — parent_church_id + is_matrix
--   5. ALTER subscriptions — 4 campos de precificação customizada
-- Criado em: 2026-04-15
-- ============================================================

-- ── 1. admin_events ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  admin_user_id uuid        NOT NULL,
  action        text        NOT NULL,
  before        jsonb,
  after         jsonb,
  reason        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_events_church_idx    ON admin_events(church_id);
CREATE INDEX IF NOT EXISTS admin_events_admin_idx     ON admin_events(admin_user_id);
CREATE INDEX IF NOT EXISTS admin_events_created_idx   ON admin_events(created_at DESC);

ALTER TABLE admin_events ENABLE ROW LEVEL SECURITY;
-- Nenhuma policy: acesso apenas via Edge Functions com service_role (bypassa RLS).

-- ── 2. admin_tasks ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS admin_tasks (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     uuid        REFERENCES churches(id) ON DELETE SET NULL,
  assigned_to   uuid,
  title         text        NOT NULL,
  description   text,
  status        text        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  priority      text        NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date      date,
  completed_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_tasks_status_idx   ON admin_tasks(status);
CREATE INDEX IF NOT EXISTS admin_tasks_church_idx   ON admin_tasks(church_id);
CREATE INDEX IF NOT EXISTS admin_tasks_due_idx      ON admin_tasks(due_date);

ALTER TABLE admin_tasks ENABLE ROW LEVEL SECURITY;

-- ── 3. church_notes ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS church_notes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  admin_user_id uuid        NOT NULL,
  body          text        NOT NULL,
  pinned        boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS church_notes_church_idx ON church_notes(church_id);

ALTER TABLE church_notes ENABLE ROW LEVEL SECURITY;

-- ── 4. ALTER churches — suporte a matriz/filial ───────────────

ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS parent_church_id uuid REFERENCES churches(id) ON DELETE SET NULL;

ALTER TABLE churches
  ADD COLUMN IF NOT EXISTS is_matrix boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS churches_parent_idx ON churches(parent_church_id);

-- ── 5. ALTER subscriptions — precificação customizada ─────────

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS custom_plan_price_cents  integer;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS custom_user_price_cents  integer;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS custom_agent_price_cents integer;

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS price_notes              text;

COMMENT ON COLUMN subscriptions.custom_plan_price_cents  IS 'Preço negociado do plano (substitui o preço padrão). NULL = usa preço da tabela plans.';
COMMENT ON COLUMN subscriptions.custom_user_price_cents  IS 'Preço negociado por usuário extra. NULL = usa valor padrão do plano.';
COMMENT ON COLUMN subscriptions.custom_agent_price_cents IS 'Preço negociado por agente extra. NULL = usa valor padrão do plano.';
COMMENT ON COLUMN subscriptions.price_notes              IS 'Motivo do desconto / condição comercial negociada.';
