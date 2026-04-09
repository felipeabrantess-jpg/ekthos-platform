-- ============================================================
-- Migration: 00007_pipeline_discipulado.sql
-- Descrição: Caminho de discipulado — 11 etapas com SLA,
--            histórico de movimentações e motivos de perda
-- ============================================================

-- ------------------------------------------------------------
-- 1. Adicionar sla_hours em pipeline_stages
--    Nulo = sem SLA (etapa não tem prazo crítico)
-- ------------------------------------------------------------
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS sla_hours INTEGER DEFAULT NULL;

COMMENT ON COLUMN pipeline_stages.sla_hours IS
  'Horas máximas antes de alertar. NULL = sem SLA. Ex: 24 para consolidação.';

-- ------------------------------------------------------------
-- 2. Adicionar loss_reason em person_pipeline
--    Registrado quando a pessoa sai do caminho (sumiu, mudou de cidade, etc.)
-- ------------------------------------------------------------
ALTER TABLE person_pipeline
  ADD COLUMN IF NOT EXISTS loss_reason TEXT DEFAULT NULL;

COMMENT ON COLUMN person_pipeline.loss_reason IS
  'Motivo pelo qual a pessoa saiu do caminho de discipulado.';

-- ------------------------------------------------------------
-- 3. Criar tabela pipeline_history
--    Log imutável de cada movimentação de stage
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pipeline_history (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id      UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id      UUID        NOT NULL REFERENCES people(id)  ON DELETE CASCADE,
  from_stage_id  UUID        REFERENCES pipeline_stages(id)  ON DELETE SET NULL,
  to_stage_id    UUID        NOT NULL REFERENCES pipeline_stages(id) ON DELETE CASCADE,
  moved_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moved_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  loss_reason    TEXT        DEFAULT NULL,
  notes          TEXT        DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS pipeline_history_church_person_idx
  ON pipeline_history(church_id, person_id, moved_at DESC);

CREATE INDEX IF NOT EXISTS pipeline_history_church_stage_idx
  ON pipeline_history(church_id, to_stage_id, moved_at DESC);

ALTER TABLE pipeline_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_history_tenant_select"
  ON pipeline_history FOR SELECT
  USING (church_id = auth.jwt() ->> 'church_id'::text);

CREATE POLICY "pipeline_history_service_all"
  ON pipeline_history FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE pipeline_history IS
  'Log imutável de movimentações no pipeline. Uma linha por mudança de stage.';

-- ------------------------------------------------------------
-- 4. Atualizar função de seed com 11 stages do caminho de
--    discipulado em linguagem eclesiástica
--    (afeta apenas novos tenants — tenants existentes mantêm
--     seus stages atuais e podem migrar manualmente)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_default_pipeline_stages(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO pipeline_stages
    (church_id, name, slug, order_index, sla_hours, days_until_followup, auto_followup)
  VALUES
    -- Etapa 1: entrada — SLA de 24h para o consolidador agir
    (p_church_id, 'Visitante',                'visitante',               1,   24, 1,  true),
    -- Etapa 2: SLA de 72h para convidar para célula
    (p_church_id, 'Contato de boas-vindas',   'contato-boas-vindas',     2,   72, 3,  true),
    -- Etapa 3
    (p_church_id, 'Convidado para célula',    'convidado-celula',        3, NULL, 7,  true),
    -- Etapa 4: monitorar inatividade (14 dias sem presença = alerta)
    (p_church_id, 'Frequentando célula',      'frequentando-celula',     4, NULL, 14, true),
    -- Etapa 5: formação (3 meses)
    (p_church_id, 'Escola da Fé',             'escola-da-fe',            5, NULL, 30, false),
    -- Etapa 6
    (p_church_id, 'Formado Escola da Fé',     'formado-escola-fe',       6, NULL, 3,  true),
    -- Etapa 7
    (p_church_id, 'Batismo',                  'batismo',                 7, NULL, 7,  true),
    -- Etapa 8: membro oficial
    (p_church_id, 'Membro ativo',             'membro-ativo',            8, NULL, 30, false),
    -- Etapa 9: voluntário em ministério
    (p_church_id, 'Servindo em departamento', 'servindo-departamento',   9, NULL, 0,  false),
    -- Etapa 10: formação de liderança
    (p_church_id, 'Líder em treinamento',     'lider-treinamento',      10, NULL, 0,  false),
    -- Etapa 11: líder formado
    (p_church_id, 'Líder de célula',          'lider-celula',           11, NULL, 0,  false)
  ON CONFLICT (church_id, slug) DO UPDATE
    SET
      name              = EXCLUDED.name,
      order_index       = EXCLUDED.order_index,
      sla_hours         = EXCLUDED.sla_hours,
      days_until_followup = EXCLUDED.days_until_followup,
      auto_followup     = EXCLUDED.auto_followup;

  -- Remover stages genéricos antigos se ainda existirem sem pessoas associadas
  DELETE FROM pipeline_stages
  WHERE church_id = p_church_id
    AND slug IN ('interesse-grupo', 'em-acompanhamento', 'membro', 'lider', 'inativo')
    AND NOT EXISTS (
      SELECT 1 FROM person_pipeline pp
      WHERE pp.stage_id = pipeline_stages.id
    );

  -- Criar church_settings padrão se ainda não existir
  INSERT INTO church_settings (church_id)
  VALUES (p_church_id)
  ON CONFLICT (church_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION create_default_pipeline_stages IS
  'Cria/atualiza os 11 stages do caminho de discipulado para um tenant.
   Seguro para re-executar (upsert). Remove stages genéricos antigos sem pessoas.';
