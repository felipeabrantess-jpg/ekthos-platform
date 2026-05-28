-- M8: Torna church_id nullable em admin_events
-- Necessário para ações Ekthos-nível (plans, addons, agents catalog, affiliates)
-- que não pertencem a uma church específica.
-- O NOT NULL original era do schema CRM pré-Frente-4A.
ALTER TABLE public.admin_events
  ALTER COLUMN church_id DROP NOT NULL;
