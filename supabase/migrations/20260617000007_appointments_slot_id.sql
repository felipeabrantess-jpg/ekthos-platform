-- Migration: ADD COLUMN slot_id em pastoral_appointments
-- Nullable: R9 preservado (registro existente Vanessa/Visita inalterado)

ALTER TABLE public.pastoral_appointments
  ADD COLUMN IF NOT EXISTS slot_id uuid
  REFERENCES public.cabinet_slots(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pastoral_appointments_slot_id
  ON public.pastoral_appointments(slot_id)
  WHERE slot_id IS NOT NULL;
