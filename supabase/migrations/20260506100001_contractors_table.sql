-- ============================================================
-- Frente 3A — Migration 1 (versão final Checkpoint 2)
-- Cria tabela contractors: responsáveis jurídicos/pastorais da igreja
-- Schema: name/document_type/document_number/person_type/role_label
-- (Decisão 111 atualizada — schema final aprovado pelo engenheiro-chefe)
-- chk_pf_pj_consistency: bloqueia só pj+cpf (MEI pf+cnpj é válido)
-- Índice parcial: 1 ativo por church+document (não por church inteira)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contractors (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  church_id           uuid        NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name                text        NOT NULL,
  document_type       text        NOT NULL,     -- 'cpf' ou 'cnpj'
  document_number     text        NOT NULL,     -- 11 dígitos (CPF) ou 14 (CNPJ), sem pontuação
  person_type         text        NOT NULL,     -- 'pf' ou 'pj'
  role_label          text        NOT NULL,     -- ex: 'Pastor Titular', 'Tesoureiro'
  email               text,
  phone               text,
  is_active           boolean     NOT NULL DEFAULT true,
  notes               text,
  deactivated_at      timestamptz,              -- preenchido quando is_active → false
  deactivation_reason text,                     -- motivo legível da desativação
  created_by          uuid        REFERENCES auth.users(id),  -- auth.uid() no INSERT
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- CPF = 11 dígitos, CNPJ = 14 dígitos (sem pontuação)
  CONSTRAINT chk_document_format CHECK (
    (document_type = 'cpf'  AND document_number ~ '^\d{11}$') OR
    (document_type = 'cnpj' AND document_number ~ '^\d{14}$')
  ),

  -- Bloqueia apenas pj+cpf (impossível). pf+cnpj é válido (MEI — Checkpoint 2)
  CONSTRAINT chk_pf_pj_consistency CHECK (
    NOT (person_type = 'pj' AND document_type = 'cpf')
  ),

  -- Registro ativo exige name e document_number não-vazios
  CONSTRAINT chk_active_consistency CHECK (
    is_active = false OR (
      is_active = true
      AND name <> ''
      AND document_number <> ''
    )
  )
);

-- Índice parcial: 1 contractor ativo por church+document_number
-- Permite múltiplos contractors ativos de documentos diferentes na mesma igreja
-- Permite reativar mesmo CPF/CNPJ após inativar o anterior
CREATE UNIQUE INDEX IF NOT EXISTS contractors_church_document_active_idx
  ON public.contractors(church_id, document_number)
  WHERE is_active = true;

-- Trigger updated_at (reutiliza update_updated_at_column() existente no DB)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname   = 'contractors_updated_at'
      AND tgrelid  = 'public.contractors'::regclass
  ) THEN
    CREATE TRIGGER contractors_updated_at
      BEFORE UPDATE ON public.contractors
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END;
$$;

COMMENT ON TABLE  public.contractors                      IS 'Responsáveis jurídicos e pastorais da igreja (Decisão 111)';
COMMENT ON COLUMN public.contractors.document_type        IS 'cpf ou cnpj (minúsculo, sem pontuação)';
COMMENT ON COLUMN public.contractors.document_number      IS '11 dígitos = CPF, 14 dígitos = CNPJ (sem pontuação)';
COMMENT ON COLUMN public.contractors.person_type          IS 'pf = pessoa física (incl. MEI), pj = pessoa jurídica';
COMMENT ON COLUMN public.contractors.role_label           IS 'Papel: Pastor Titular, Tesoureiro, Secretário, etc.';
COMMENT ON COLUMN public.contractors.is_active            IS 'Soft-delete: 1 ativo por church+document (índice parcial). Decisão 111.';
COMMENT ON COLUMN public.contractors.deactivated_at       IS 'Timestamp de desativação (NULL se ativo)';
COMMENT ON COLUMN public.contractors.deactivation_reason  IS 'Motivo da desativação (legível, ex: substituído via wizard)';
COMMENT ON COLUMN public.contractors.created_by           IS 'UUID do usuário que criou o registro (auth.uid())';
