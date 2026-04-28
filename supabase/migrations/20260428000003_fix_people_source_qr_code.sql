-- =============================================================
-- Migration: fix_people_source_qr_code
-- Data: 2026-04-28
-- Descrição: Adiciona 'qr_code' ao CHECK constraint de people.source
--   para permitir cadastros via QR Code (Frente B).
-- =============================================================

ALTER TABLE people DROP CONSTRAINT IF EXISTS people_source_check;
ALTER TABLE people ADD CONSTRAINT people_source_check
  CHECK (source = ANY (ARRAY['whatsapp','instagram','manual','import','onboarding','qr_code']));

COMMENT ON CONSTRAINT people_source_check ON people IS
  'Origens válidas de cadastro de pessoa. qr_code adicionado em 2026-04-28 (Frente B).';
