-- ============================================================
-- Frente 3A — Migration 2.5 (numerada como 100003)
-- Cria tabela church_pastoral_profile: identidade pastoral da igreja
-- 5 campos da Etapa 2 do wizard (Decisão 110)
-- PK simples: church_id (ON CONFLICT simples para upsert)
-- RLS análoga à contractors (4 roles + ekthos admin)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.church_pastoral_profile (
  church_id                  uuid PRIMARY KEY
    REFERENCES public.churches(id) ON DELETE CASCADE,
  estilo_comunicacao         text
    CHECK (estilo_comunicacao IS NULL OR
           estilo_comunicacao IN ('formal', 'casual', 'intermediario')),
  horarios_culto             text,
  maior_desafio              text,
  foco_pastoral_30_dias      text,
  algo_importante_comunidade text,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- Trigger updated_at
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname  = 'church_pastoral_profile_updated_at'
      AND tgrelid = 'public.church_pastoral_profile'::regclass
  ) THEN
    CREATE TRIGGER church_pastoral_profile_updated_at
      BEFORE UPDATE ON public.church_pastoral_profile
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
  END IF;
END;
$$;

-- RLS
ALTER TABLE public.church_pastoral_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS church_pastoral_profile_ekthos_admin_all ON public.church_pastoral_profile;
CREATE POLICY church_pastoral_profile_ekthos_admin_all
  ON public.church_pastoral_profile
  FOR ALL TO authenticated
  USING    (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

DROP POLICY IF EXISTS church_pastoral_profile_member_select ON public.church_pastoral_profile;
CREATE POLICY church_pastoral_profile_member_select
  ON public.church_pastoral_profile
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = church_pastoral_profile.church_id
    )
  );

DROP POLICY IF EXISTS church_pastoral_profile_admin_insert ON public.church_pastoral_profile;
CREATE POLICY church_pastoral_profile_admin_insert
  ON public.church_pastoral_profile
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = church_pastoral_profile.church_id
        AND ur.role IN ('admin', 'admin_departments', 'treasurer', 'secretary')
    )
  );

DROP POLICY IF EXISTS church_pastoral_profile_admin_update ON public.church_pastoral_profile;
CREATE POLICY church_pastoral_profile_admin_update
  ON public.church_pastoral_profile
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = church_pastoral_profile.church_id
        AND ur.role IN ('admin', 'admin_departments', 'treasurer', 'secretary')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = church_pastoral_profile.church_id
        AND ur.role IN ('admin', 'admin_departments', 'treasurer', 'secretary')
    )
  );

COMMENT ON TABLE public.church_pastoral_profile
  IS 'Identidade pastoral da igreja — perfil único, alimenta todos os agentes (Decisão 110-111)';
COMMENT ON COLUMN public.church_pastoral_profile.estilo_comunicacao
  IS 'formal | casual | intermediario';
COMMENT ON COLUMN public.church_pastoral_profile.horarios_culto
  IS 'Texto livre descrevendo horários de culto da semana';
COMMENT ON COLUMN public.church_pastoral_profile.maior_desafio
  IS 'Principal desafio pastoral atual da igreja';
COMMENT ON COLUMN public.church_pastoral_profile.foco_pastoral_30_dias
  IS 'Foco estratégico pastoral para os próximos 30 dias';
COMMENT ON COLUMN public.church_pastoral_profile.algo_importante_comunidade
  IS 'Algo importante que a comunidade precisa saber sobre a igreja';
