-- Adiciona suporte ao tipo de culto "Outro" (com campo de texto livre)
-- Compatível com relatórios existentes: service_type_other é NULL para os tipos fixos

ALTER TABLE service_reports
  DROP CONSTRAINT IF EXISTS service_reports_service_type_check;

ALTER TABLE service_reports
  ADD CONSTRAINT service_reports_service_type_check
    CHECK (service_type = ANY (ARRAY[
      'domingo_manha'::text,
      'domingo_noite'::text,
      'quarta'::text,
      'especial'::text,
      'outro'::text
    ]));

ALTER TABLE service_reports
  ADD COLUMN IF NOT EXISTS service_type_other text;
