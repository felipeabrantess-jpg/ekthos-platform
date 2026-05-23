-- Migration: normalize_church_baseline N1-N5
-- Sprint: multi-tenant normalizacao estrutural
-- Idempotente: ON CONFLICT / WHERE NOT EXISTS em todos os passos
-- NÃO sobrescreve contexto, NÃO ativa canal, NÃO ativa agente

-- ─────────────────────────────────────────────────────────────
-- N1a: Criar pipeline formal para igrejas sem pipeline
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipelines (id, church_id, name, created_at)
SELECT gen_random_uuid(), c.id, 'Principal', now()
FROM churches c
WHERE NOT EXISTS (SELECT 1 FROM pipelines p WHERE p.church_id = c.id);

-- ─────────────────────────────────────────────────────────────
-- N1b: Criar 4 stages padrão para igrejas sem stages
-- UNIQUE: (church_id, slug) — ON CONFLICT DO NOTHING é seguro
-- ─────────────────────────────────────────────────────────────
INSERT INTO pipeline_stages
  (id, church_id, pipeline_id, name, slug, order_index,
   is_entry_point, is_terminal, is_active,
   days_until_followup, auto_followup, color, icon)
SELECT
  gen_random_uuid(),
  c.id,
  (SELECT id FROM pipelines WHERE church_id = c.id LIMIT 1),
  stage.name,
  stage.slug,
  stage.order_index,
  stage.is_entry_point,
  false, true, 3, true, '#e13500', 'circle'
FROM churches c
CROSS JOIN (VALUES
  ('Visitante',    'visitante',    0, true),
  ('Frequentador', 'frequentador', 1, false),
  ('Discípulo',    'discipulo',    2, false),
  ('Membro',       'membro',       3, false)
) AS stage(name, slug, order_index, is_entry_point)
WHERE NOT EXISTS (SELECT 1 FROM pipeline_stages ps WHERE ps.church_id = c.id)
ON CONFLICT ON CONSTRAINT pipeline_stages_church_slug_unique DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- N2: Preencher pipeline_id NULL nas stages existentes
-- ─────────────────────────────────────────────────────────────
UPDATE pipeline_stages ps
SET pipeline_id = (
  SELECT id FROM pipelines p WHERE p.church_id = ps.church_id LIMIT 1
)
WHERE ps.pipeline_id IS NULL
  AND EXISTS (SELECT 1 FROM pipelines p WHERE p.church_id = ps.church_id);

-- ─────────────────────────────────────────────────────────────
-- N3: church_settings mínimo para igrejas sem registro
-- Todos os campos NOT NULL têm defaults na tabela
-- UNIQUE: church_id — ON CONFLICT DO NOTHING
-- ─────────────────────────────────────────────────────────────
INSERT INTO church_settings (id, church_id)
SELECT gen_random_uuid(), c.id
FROM churches c
WHERE NOT EXISTS (SELECT 1 FROM church_settings cs WHERE cs.church_id = c.id)
ON CONFLICT ON CONSTRAINT church_settings_church_id_unique DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- N4: Corrigir onboarding_step onde sessão já foi completada
-- ─────────────────────────────────────────────────────────────
UPDATE churches c
SET
  onboarding_step = 'completed',
  onboarding_completed_at = COALESCE(
    c.onboarding_completed_at,
    (SELECT os.completed_at FROM onboarding_sessions os
     WHERE os.church_id = c.id AND os.status = 'completed'
     ORDER BY os.completed_at DESC LIMIT 1)
  )
WHERE c.onboarding_step IS DISTINCT FROM 'completed'
  AND EXISTS (
    SELECT 1 FROM onboarding_sessions os
    WHERE os.church_id = c.id AND os.status = 'completed'
  );

-- ─────────────────────────────────────────────────────────────
-- N5: Remover routing órfão agent-reengajamento na Mock
-- subscription_agents não tem church_id direto — join via subscriptions
-- Idempotente: DELETE WHERE NOT EXISTS
-- ─────────────────────────────────────────────────────────────
DELETE FROM church_agent_channel_routing
WHERE church_id = '62e473b8-cd39-4da2-aa5d-c296b03d6873'
  AND agent_slug = 'agent-reengajamento'
  AND NOT EXISTS (
    SELECT 1 FROM subscription_agents sa
    JOIN subscriptions s ON s.id = sa.subscription_id
    WHERE s.church_id = '62e473b8-cd39-4da2-aa5d-c296b03d6873'
      AND sa.agent_slug = 'agent-reengajamento'
  );
