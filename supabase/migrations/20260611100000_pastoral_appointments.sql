-- pastoral_appointments: agendamentos pastorais com RLS multi-tenant
-- RLS padrão: igual ao pastoral_cabinet (service_role + tenant auth_church_id)

CREATE TABLE public.pastoral_appointments (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        UUID        NOT NULL REFERENCES public.churches(id)  ON DELETE CASCADE,
  person_id        UUID        NOT NULL REFERENCES public.people(id)     ON DELETE CASCADE,
  pastor_id        UUID                REFERENCES public.profiles(id)    ON DELETE SET NULL,
  appointment_type TEXT        NOT NULL,
  scheduled_at     TIMESTAMPTZ NOT NULL,
  notes            TEXT,
  status           TEXT        NOT NULL DEFAULT 'solicitado'
                    CHECK (status IN ('solicitado','confirmado','realizado','cancelado')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pastoral_appts_church_id    ON public.pastoral_appointments(church_id);
CREATE INDEX idx_pastoral_appts_person_id    ON public.pastoral_appointments(person_id);
CREATE INDEX idx_pastoral_appts_scheduled_at ON public.pastoral_appointments(scheduled_at);

ALTER TABLE public.pastoral_appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pastoral_appointments_service_all"
  ON public.pastoral_appointments
  FOR ALL
  TO public
  USING (auth.role() = 'service_role');

CREATE POLICY "pastoral_appointments_tenant_all"
  ON public.pastoral_appointments
  FOR ALL
  TO authenticated
  USING (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

CREATE TRIGGER trg_pastoral_appointments_updated_at
  BEFORE UPDATE ON public.pastoral_appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
