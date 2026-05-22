-- ============================================================
-- Migration: backfill_person_pipeline_cluster_a
-- Sprint: Cluster A — Bug #12
-- Criada em: 2026-05-21
--
-- Insere em person_pipeline todas as pessoas da igreja Minha Fé
-- (5156cc30) que ainda não estão no board de pipeline.
--
-- Contexto: pipeline_stages de Vanessa tinha is_entry_point=false
-- em todos os stages, então capture_visitor_to_pipeline retornava
-- NULL e nunca inseriu em person_pipeline. Agora que A1 corrigiu
-- o entry_point, o backfill popula as pessoas existentes.
--
-- Usa ON CONFLICT DO NOTHING — seguro para re-execução.
-- O stage_id referenciado é o Visitante (order_index=0) da igreja.
-- ============================================================

INSERT INTO public.person_pipeline (church_id, person_id, stage_id)
SELECT
  p.church_id,
  p.id            AS person_id,
  ps.id           AS stage_id
FROM public.people p
JOIN public.pipeline_stages ps
  ON  ps.church_id   = p.church_id
  AND ps.order_index = 0
  AND ps.is_active   = true
WHERE p.church_id = '5156cc30-6d76-4487-99ba-fff8013b38d4'
ON CONFLICT (church_id, person_id) DO NOTHING;
