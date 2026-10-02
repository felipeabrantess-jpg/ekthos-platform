-- ============================================================
-- Views de auditoria — divergência legado × espinha
-- SÓ CRIADAS APÓS person_journey e journey_events existirem.
-- Todas READ-ONLY. Úteis para o dry-run e reconciliação.
-- ============================================================

-- V1: pessoas que têm person_pipeline MAS não têm person_journey ativa
CREATE OR REPLACE VIEW journey_audit_missing_spine AS
SELECT
  pp.church_id,
  pp.person_id,
  pp.stage_id AS pipeline_stage_id,
  pp.entered_at,
  p.first_name || ' ' || COALESCE(p.last_name, '') AS person_name,
  p.phone
FROM person_pipeline pp
JOIN people p ON p.id = pp.person_id AND p.deleted_at IS NULL
LEFT JOIN person_journey pj
  ON pj.person_id = pp.person_id
  AND pj.church_id = pp.church_id
  AND pj.closed_at IS NULL
WHERE pj.id IS NULL;

-- V2: pessoas com person_journey ativa MAS sem person_pipeline (órfãs novas)
CREATE OR REPLACE VIEW journey_audit_orphan_spine AS
SELECT
  pj.church_id,
  pj.person_id,
  pj.stage_id,
  pj.opened_at,
  p.first_name || ' ' || COALESCE(p.last_name, '') AS person_name
FROM person_journey pj
JOIN people p ON p.id = pj.person_id AND p.deleted_at IS NULL
LEFT JOIN person_pipeline pp
  ON pp.person_id = pj.person_id
  AND pp.church_id = pj.church_id
WHERE pp.person_id IS NULL
  AND pj.closed_at IS NULL;

-- V3: conflito de stage — pipeline_stage_id em people ≠ person_pipeline.stage_id
CREATE OR REPLACE VIEW journey_audit_stage_conflicts AS
SELECT
  p.church_id,
  p.id AS person_id,
  p.pipeline_stage_id AS stage_em_people,
  pp.stage_id         AS stage_em_pipeline,
  p.first_name || ' ' || COALESCE(p.last_name, '') AS person_name
FROM people p
JOIN person_pipeline pp ON pp.person_id = p.id AND pp.church_id = p.church_id
WHERE p.deleted_at IS NULL
  AND p.pipeline_stage_id IS NOT NULL
  AND p.pipeline_stage_id != pp.stage_id;

-- V4: resumo de reconciliação por church
CREATE OR REPLACE VIEW journey_audit_reconciliation AS
SELECT
  c.id AS church_id,
  c.name AS church_name,
  (SELECT COUNT(*) FROM people WHERE church_id = c.id AND deleted_at IS NULL)                          AS total_pessoas,
  (SELECT COUNT(*) FROM person_pipeline WHERE church_id = c.id)                                        AS no_pipeline_legado,
  (SELECT COUNT(*) FROM person_journey WHERE church_id = c.id AND closed_at IS NULL)                   AS na_espinha_ativa,
  (SELECT COUNT(*) FROM person_journey WHERE church_id = c.id AND closed_at IS NULL) -
  (SELECT COUNT(*) FROM person_pipeline WHERE church_id = c.id)                                        AS delta_espinha_vs_pipeline,
  (SELECT enabled FROM church_feature_flags WHERE church_id = c.id AND flag_key = 'journey_unification')
                                                                                                       AS flag_journey_ativa
FROM churches c
WHERE c.deleted_at IS NULL
ORDER BY c.name;
