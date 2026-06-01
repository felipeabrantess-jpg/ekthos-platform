-- Migration: volunteer_reminders_columns
-- Adiciona colunas de controle de lembretes D-3 e D-1 em service_schedule_assignments.
-- Também garante que colunas de confirmação de presença existam (IF NOT EXISTS)
-- para suportar fresh-DB deploy antes de feat/escala-confirm-integration ser mergeado.
-- Cria pg_cron job para EF volunteer-reminders (08h BRT = 11h UTC, diário).
--
-- ATENÇÃO: 20260601000001_volunteer_attendance_trigger.sql (em feat/escala-confirm-integration)
-- depende das colunas attendance_confirmed, confirmed_at, confirmed_via.
-- Em fresh-DB, este migration DEVE ser aplicado antes daquele para evitar erro no trigger.
-- Em prod as colunas já existem — IF NOT EXISTS garante idempotência.

-- ── Colunas de confirmação de presença (guard para fresh-DB) ──────────────────
ALTER TABLE public.service_schedule_assignments
  ADD COLUMN IF NOT EXISTS attendance_confirmed BOOLEAN,
  ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmed_via TEXT DEFAULT 'manual';

COMMENT ON COLUMN public.service_schedule_assignments.attendance_confirmed IS
  'true = confirmou presença, false = cancelou, null = pendente resposta';
COMMENT ON COLUMN public.service_schedule_assignments.confirmed_at IS
  'Timestamp da confirmação/cancelamento pelo voluntário';
COMMENT ON COLUMN public.service_schedule_assignments.confirmed_via IS
  'Canal de confirmação: whatsapp | manual | app';

-- ── Colunas de controle de lembretes (novas em V7) ───────────────────────────
ALTER TABLE public.service_schedule_assignments
  ADD COLUMN IF NOT EXISTS reminder_d3_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_d1_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.service_schedule_assignments.reminder_d3_sent_at IS
  'NULL = lembrete D-3 não enviado ainda. Preenchido pela EF volunteer-reminders.';
COMMENT ON COLUMN public.service_schedule_assignments.reminder_d1_sent_at IS
  'NULL = lembrete D-1 não enviado ainda. Preenchido pela EF volunteer-reminders.';

-- Índice para queries de reminder (filtrar por data + null)
CREATE INDEX IF NOT EXISTS idx_ssa_reminder_d3
  ON public.service_schedule_assignments (reminder_d3_sent_at)
  WHERE reminder_d3_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ssa_reminder_d1
  ON public.service_schedule_assignments (reminder_d1_sent_at)
  WHERE reminder_d1_sent_at IS NULL;

-- ── pg_cron: volunteer-reminders-daily (08h BRT = 11h UTC) ───────────────────
SELECT cron.schedule(
  'volunteer-reminders-daily',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/volunteer-reminders',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "volunteer-reminders-cron"}'::jsonb,
    body := '{}'::jsonb
  )
  $$
);
