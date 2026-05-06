-- Migration: add main_email to churches (Opção A aprovada)
-- Utilizado para e-mail de contato principal da Igreja, editável via aba Cadastro

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS main_email text;

COMMENT ON COLUMN public.churches.main_email IS
  'E-mail principal de contato da Igreja (preenchido pelo admin Ekthos)';
