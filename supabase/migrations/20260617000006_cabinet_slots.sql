-- Migration: cabinet_slots
-- Tabela de slots de disponibilidade pastoral para Gabinete v2
-- Anti-double-booking via UPDATE condicional atômico (appointment_id IS NULL check)

CREATE TABLE IF NOT EXISTS public.cabinet_slots (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id         uuid        NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  cabinet_pastor_id uuid        NOT NULL REFERENCES public.pastoral_cabinet(id) ON DELETE CASCADE,
  slot_datetime     timestamptz NOT NULL,
  duration_minutes  integer     NOT NULL DEFAULT 60,
  appointment_id    uuid        REFERENCES public.pastoral_appointments(id) ON DELETE SET NULL,
  notes             text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cabinet_slots_unique_pastor_datetime UNIQUE (cabinet_pastor_id, slot_datetime)
);

CREATE INDEX IF NOT EXISTS idx_cabinet_slots_church_id
  ON public.cabinet_slots(church_id);

CREATE INDEX IF NOT EXISTS idx_cabinet_slots_pastor_id
  ON public.cabinet_slots(cabinet_pastor_id);

CREATE INDEX IF NOT EXISTS idx_cabinet_slots_datetime
  ON public.cabinet_slots(slot_datetime);

-- Partial index para busca de slots disponíveis (hot path do formulário público)
CREATE INDEX IF NOT EXISTS idx_cabinet_slots_available
  ON public.cabinet_slots(church_id, cabinet_pastor_id, slot_datetime)
  WHERE appointment_id IS NULL;

ALTER TABLE public.cabinet_slots ENABLE ROW LEVEL SECURITY;

-- service_role: bypass RLS para EF pública (igv-cabinet-request)
CREATE POLICY "cabinet_slots_service_all"
  ON public.cabinet_slots FOR ALL TO public
  USING (auth.role() = 'service_role');

-- authenticated: acesso filtrado por church_id (CRM interno)
CREATE POLICY "cabinet_slots_tenant_all"
  ON public.cabinet_slots FOR ALL TO authenticated
  USING (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());
