-- Migration: Mock — 15 pessoas de teste → stage Visitante (Bloco 3)
-- DISABLE TRIGGER USER: trigger_n8n_pipeline depende de pg_net (não instalada)
-- Apenas pessoas da Mock (62e473b8) sem person_pipeline existente
-- Idempotente: ON CONFLICT DO NOTHING
-- NÃO move quem já está em outro stage, NÃO afeta outras igrejas

ALTER TABLE person_pipeline DISABLE TRIGGER USER;

INSERT INTO person_pipeline (id, church_id, person_id, stage_id, entered_at, last_activity_at)
SELECT
  gen_random_uuid(),
  p.church_id,
  p.id,
  ps.id,
  now(),
  now()
FROM people p
JOIN pipeline_stages ps
  ON ps.church_id = p.church_id
  AND ps.slug = 'visitante'
WHERE p.church_id = '62e473b8-cd39-4da2-aa5d-c296b03d6873'
  AND NOT EXISTS (
    SELECT 1 FROM person_pipeline pp
    WHERE pp.church_id = p.church_id AND pp.person_id = p.id
  )
ON CONFLICT ON CONSTRAINT person_pipeline_church_person_unique DO NOTHING;

ALTER TABLE person_pipeline ENABLE TRIGGER USER;
