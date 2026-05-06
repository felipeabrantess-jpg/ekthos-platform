-- ============================================================
-- Sprint 2A — Onda A — Migration 2
-- Expand churches: campos de identidade da igreja
-- city e state já existem — não duplicar
-- ============================================================

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS pastor_titular_name  text,        -- nome completo do pastor titular
  ADD COLUMN IF NOT EXISTS pastor_titular_phone text,        -- telefone do pastor (opcional, uso interno)
  ADD COLUMN IF NOT EXISTS denomination         text,        -- denominação/tradição ex: "Assembleia de Deus"
  ADD COLUMN IF NOT EXISTS vision_statement     text,        -- visão/missão da igreja (até 500 chars)
  ADD COLUMN IF NOT EXISTS address_full         text,        -- endereço completo para geolocalização
  ADD COLUMN IF NOT EXISTS region               text,        -- região/bairro para segmentação
  ADD COLUMN IF NOT EXISTS main_phone           text,        -- telefone principal da igreja
  ADD COLUMN IF NOT EXISTS social_media_handles jsonb,       -- {"instagram":"@igrejax","youtube":"UCxxx"}
  ADD COLUMN IF NOT EXISTS website_url          text;        -- site oficial
