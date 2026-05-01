-- =============================================================
-- SPRINT 2.5 — church_whatsapp_channels: colunas de ativação assistida
-- context_type, session_status, connected_by_user_id, provider_label, notes
-- 01/05/2026
-- =============================================================

ALTER TABLE church_whatsapp_channels
  ADD COLUMN IF NOT EXISTS context_type text
    CHECK (context_type IN ('pastoral', 'operacional')),

  ADD COLUMN IF NOT EXISTS session_status text NOT NULL DEFAULT 'disconnected'
    CHECK (session_status IN ('disconnected', 'connected', 'testing', 'active')),

  ADD COLUMN IF NOT EXISTS connected_by_user_id uuid
    REFERENCES auth.users(id) ON DELETE SET NULL,

  ADD COLUMN IF NOT EXISTS provider_label text,    -- ex: "z-api - instance abc123"
  ADD COLUMN IF NOT EXISTS notes text;             -- anotações internas do time Ekthos

-- Índice para facilitar consulta de canais ativos por contexto
CREATE INDEX IF NOT EXISTS idx_cwc_church_context
  ON church_whatsapp_channels(church_id, context_type)
  WHERE active = true AND session_status IN ('testing', 'active');
