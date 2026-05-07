-- ============================================================
-- Frente 3A — Migration 2
-- Expande churches: uf (novo source-of-truth), pastor_titular_email,
-- pastor_titular_can_be_quoted, onboarding_step, onboarding_completed_at
-- state (legado) é MANTIDO — ver OPS-DEBT-005 para deprecação futura
-- Idempotente: ADD COLUMN IF NOT EXISTS
-- ============================================================

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS uf                          text,
  ADD COLUMN IF NOT EXISTS pastor_titular_email         text,
  ADD COLUMN IF NOT EXISTS pastor_titular_can_be_quoted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS onboarding_step              text NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_churches_onboarding_step
      CHECK (onboarding_step IN ('pending', 'cadastro', 'pastoral', 'completed')),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at      timestamptz;

-- Constraint: completed_at só preenchido quando step = 'completed'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname    = 'chk_churches_completed_at_consistency'
      AND conrelid   = 'public.churches'::regclass
  ) THEN
    ALTER TABLE public.churches
      ADD CONSTRAINT chk_churches_completed_at_consistency CHECK (
        onboarding_completed_at IS NULL
        OR onboarding_step = 'completed'
      );
  END IF;
END;
$$;

COMMENT ON COLUMN public.churches.uf
  IS 'Sigla do estado (2 letras, ex: SP). Source-of-truth novo. Coluna state é legacy (OPS-DEBT-005).';
COMMENT ON COLUMN public.churches.pastor_titular_email
  IS 'E-mail do pastor titular — contato formal da liderança';
COMMENT ON COLUMN public.churches.pastor_titular_can_be_quoted
  IS 'true = Ekthos pode citar o nome do pastor em cases e marketing';
COMMENT ON COLUMN public.churches.onboarding_step
  IS 'Etapa: pending → pastoral → completed (cadastro reservado Frente 3B)';
COMMENT ON COLUMN public.churches.onboarding_completed_at
  IS 'Timestamp em que onboarding_step chegou a completed (null se não concluído)';
