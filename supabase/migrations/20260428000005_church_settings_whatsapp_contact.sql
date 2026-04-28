-- =============================================================
-- Migration: church_settings_whatsapp_contact
-- Data: 2026-04-28
-- Descrição: Adiciona campo de contato WhatsApp público da church.
--   Usado no botão wa.me da VisitorLanding após cadastro bem-sucedido.
-- =============================================================
ALTER TABLE church_settings
  ADD COLUMN IF NOT EXISTS whatsapp_contact TEXT NULL;

COMMENT ON COLUMN church_settings.whatsapp_contact IS
  'Número WhatsApp público da igreja no formato E.164 sem + (ex: 5511999990000). '
  'Exibido como botão wa.me na landing de visitantes após cadastro. NULL = oculta botão.';
