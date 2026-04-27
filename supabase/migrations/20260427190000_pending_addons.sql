-- =============================================================
-- Migration: pending_addons
-- Data: 2026-04-27
-- Descrição: Tabela para registrar pedidos de contratação de
--   agentes e módulos feitos pelo pastor via CRM.
--   Status workflow: pending → confirmed → charged
--   Admin Ekthos confirma manualmente e processa cobrança na
--   próxima recorrência da subscription.
-- =============================================================

-- ── Tabela principal ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pending_addons (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  addon_type    text        NOT NULL CHECK (addon_type IN ('agent', 'module')),
  addon_slug    text        NOT NULL,
  price_cents   int         NOT NULL,
  status        text        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'confirmed', 'cancelled', 'charged')),
  requested_at  timestamptz NOT NULL DEFAULT now(),
  charge_at     timestamptz NOT NULL,   -- próxima recorrência da subscription
  charged_at    timestamptz NULL,
  notes         text        NULL
);

-- ── Índices ──────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pending_addons_church  ON pending_addons(church_id);
CREATE INDEX IF NOT EXISTS idx_pending_addons_status  ON pending_addons(status);
CREATE INDEX IF NOT EXISTS idx_pending_addons_slug    ON pending_addons(church_id, addon_slug);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE pending_addons ENABLE ROW LEVEL SECURITY;

-- Pastores/admins da igleja leem seus próprios pedidos
CREATE POLICY "church_members_read_own" ON pending_addons
  FOR SELECT USING (
    church_id = (
      SELECT (raw_app_meta_data->>'church_id')::uuid
      FROM auth.users
      WHERE id = auth.uid()
    )
  );

-- Pastores/admins inserem pedidos para sua igreja
CREATE POLICY "church_members_insert_own" ON pending_addons
  FOR INSERT WITH CHECK (
    church_id = (
      SELECT (raw_app_meta_data->>'church_id')::uuid
      FROM auth.users
      WHERE id = auth.uid()
    )
    AND user_id = auth.uid()
  );

-- Service role (admin Ekthos via EF) tem acesso total
-- (handled by service_role key bypass)
