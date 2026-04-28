-- =============================================================
-- Migration: qr_visitor
-- Data: 2026-04-28
-- Descrição: Frente B — captura de visitantes via QR Code físico.
--   1. Tabela qr_codes (um QR por church, URL pública /visita/<slug>)
--   2. Tabela visitor_capture_rate_limits (rate limit + auditoria)
--   3. RPC capture_visitor_to_pipeline (insere pessoa no entry point)
--
-- Nota: UNIQUE(church_id, phone) em people já existe (people_church_phone_unique
--   definida em 00003_mvp_schema.sql). Não recriada aqui.
-- =============================================================

-- =============================================================
-- 1. TABELA: qr_codes
--    Uma linha por church — QR fixo, permanente.
-- =============================================================
CREATE TABLE IF NOT EXISTS qr_codes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  slug          text        NOT NULL,
  is_active     boolean     NOT NULL DEFAULT true,
  scanned_count integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_codes_church_unique UNIQUE (church_id)
);

CREATE INDEX IF NOT EXISTS idx_qr_codes_slug
  ON qr_codes (slug)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_qr_codes_church
  ON qr_codes (church_id);

CREATE TRIGGER qr_codes_updated_at
  BEFORE UPDATE ON qr_codes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE qr_codes ENABLE ROW LEVEL SECURITY;

-- Tenant pode ler seu próprio QR
CREATE POLICY qr_codes_tenant_select ON qr_codes
  FOR SELECT
  USING (church_id = auth_church_id());

-- Apenas service_role e admin Ekthos escrevem
CREATE POLICY qr_codes_admin_all ON qr_codes
  FOR ALL
  USING (is_ekthos_admin());

COMMENT ON TABLE qr_codes IS
  'Um QR code permanente por church. URL pública: /visita/<slug>. '
  'scanned_count incrementado a cada submit (não a cada scan).';

-- =============================================================
-- 2. TABELA: visitor_capture_rate_limits
--    Auditoria de submissões + rate limiting por IP/phone.
--    Sem RLS — service_role only.
-- =============================================================
CREATE TABLE IF NOT EXISTS visitor_capture_rate_limits (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ip           text        NOT NULL,
  phone        text,
  church_id    uuid        REFERENCES churches(id) ON DELETE SET NULL,
  user_agent   text,
  was_blocked  boolean     NOT NULL DEFAULT false,
  block_reason text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visitor_rate_ip_time
  ON visitor_capture_rate_limits (ip, submitted_at);

CREATE INDEX IF NOT EXISTS idx_visitor_rate_phone_church
  ON visitor_capture_rate_limits (phone, church_id, submitted_at);

COMMENT ON TABLE visitor_capture_rate_limits IS
  'Auditoria de submissões do endpoint público visitor-capture. '
  'Rate limit: 5/h por IP + dedup 24h por (phone + church_id). '
  'Bloqueios silenciosos retornam 200 OK ao cliente (anti-bot).';

-- =============================================================
-- 3. BACKFILL: criar qr_code para cada church existente
--    (sem quebrar constraints — ON CONFLICT DO NOTHING)
-- =============================================================
INSERT INTO qr_codes (church_id, slug)
SELECT id, slug
FROM churches
WHERE slug IS NOT NULL
  AND deleted_at IS NULL
ON CONFLICT (church_id) DO NOTHING;

-- =============================================================
-- 4. RPC: capture_visitor_to_pipeline
--    Insere pessoa no stage com is_entry_point=true mais baixo
--    da church. Idempotente via ON CONFLICT DO NOTHING.
--    SECURITY DEFINER para rodar com permissões do owner
--    (Edge Function pública não tem JWT de tenant).
-- =============================================================
CREATE OR REPLACE FUNCTION capture_visitor_to_pipeline(
  p_church_id uuid,
  p_person_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_id uuid;
BEGIN
  -- Pega o primeiro stage com is_entry_point=true (order_index ASC)
  SELECT id INTO v_stage_id
  FROM pipeline_stages
  WHERE church_id     = p_church_id
    AND is_entry_point = true
    AND is_active      = true
  ORDER BY order_index ASC
  LIMIT 1;

  -- Se a church não tem entry point configurado, retorna NULL sem erro
  IF v_stage_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Insere no pipeline — ON CONFLICT mantém idempotência
  -- (pessoa já pode estar no pipeline se voltou a escanear o QR)
  INSERT INTO person_pipeline (church_id, person_id, stage_id)
  VALUES (p_church_id, p_person_id, v_stage_id)
  ON CONFLICT (church_id, person_id) DO NOTHING;

  RETURN v_stage_id;
END;
$$;

COMMENT ON FUNCTION capture_visitor_to_pipeline IS
  'Insere pessoa no entry point do pipeline da church. '
  'Idempotente — re-scan do QR não duplica a entrada no pipeline. '
  'Retorna stage_id inserido ou NULL se não há entry point configurado.';
