-- ============================================================================
-- Migration 00009: Campos de Membros (17 campos customizados)
-- ----------------------------------------------------------------------------
-- Adiciona à tabela people os campos eclesiásticos, financeiros e de
-- acompanhamento que não existiam no schema inicial.
-- Campos já existentes (baptism_date, conversion_date, marital_status,
-- birth_date, neighborhood, consolidation_school, ministry_interest, calling)
-- são apenas expostos no frontend — sem alteração de coluna aqui.
-- ============================================================================

ALTER TABLE people
  -- Célula à qual o membro pertence (vínculo direto para consultas rápidas)
  ADD COLUMN IF NOT EXISTS celula_id            UUID    REFERENCES groups(id) ON DELETE SET NULL,

  -- Financeiro: visível apenas para admin e treasurer (controle via app)
  ADD COLUMN IF NOT EXISTS is_dizimista         BOOLEAN DEFAULT NULL,

  -- Eclesiástico: status do batismo com tristate (sim / nao / agendado)
  ADD COLUMN IF NOT EXISTS batismo_status       TEXT    DEFAULT NULL
    CONSTRAINT people_batismo_status_check
    CHECK (batismo_status IN ('sim', 'nao', 'agendado')),

  -- Pessoal: como a pessoa conheceu a igreja (mais granular que source)
  ADD COLUMN IF NOT EXISTS como_conheceu        TEXT    DEFAULT NULL
    CONSTRAINT people_como_conheceu_check
    CHECK (como_conheceu IN (
      'convite_membro', 'redes_sociais', 'passou_na_frente',
      'evento', 'familia', 'outro'
    )),

  -- Formação: experiência prévia em liderança
  ADD COLUMN IF NOT EXISTS experiencia_lideranca TEXT   DEFAULT NULL
    CONSTRAINT people_exp_lideranca_check
    CHECK (experiencia_lideranca IN ('sim_esta', 'sim_outra', 'nao')),

  -- Acompanhamento: visível apenas para admin (controle via app)
  ADD COLUMN IF NOT EXISTS observacoes_pastorais TEXT   DEFAULT NULL;

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_people_celula_id     ON people (celula_id);
CREATE INDEX IF NOT EXISTS idx_people_is_dizimista  ON people (church_id, is_dizimista)
  WHERE is_dizimista IS NOT NULL;

COMMENT ON COLUMN people.celula_id IS
  'Célula à qual o membro pertence. Preenchido ao selecionar a célula no cadastro.';
COMMENT ON COLUMN people.is_dizimista IS
  'Indica se o membro é dizimista ativo. Visível apenas para admin e tesoureiro.';
COMMENT ON COLUMN people.batismo_status IS
  'Status do batismo: sim | nao | agendado. Substitui/complementa o campo baptized (boolean).';
COMMENT ON COLUMN people.como_conheceu IS
  'Como a pessoa conheceu a igreja: convite, redes sociais, evento, família, etc.';
COMMENT ON COLUMN people.experiencia_lideranca IS
  'Experiência prévia em liderança: sim_esta | sim_outra | nao.';
COMMENT ON COLUMN people.observacoes_pastorais IS
  'Notas pastorais confidenciais. Visível apenas para admin no frontend.';
