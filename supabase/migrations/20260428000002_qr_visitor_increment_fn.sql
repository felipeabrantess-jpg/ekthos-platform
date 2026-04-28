-- =============================================================
-- Migration: qr_visitor_increment_fn
-- Data: 2026-04-28
-- Descrição: RPC auxiliar de incremento atômico de scanned_count.
--   Complementa a migration 20260428000001_qr_visitor.sql.
--   Chamada pela EF visitor-capture após cada submissão bem-sucedida.
-- =============================================================

CREATE OR REPLACE FUNCTION increment_qr_scanned_count(p_church_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE qr_codes
  SET scanned_count = scanned_count + 1
  WHERE church_id = p_church_id
    AND is_active  = true;
$$;

COMMENT ON FUNCTION increment_qr_scanned_count IS
  'Incremento atômico de qr_codes.scanned_count. '
  'Chamado pela EF visitor-capture a cada submissão bem-sucedida.';
