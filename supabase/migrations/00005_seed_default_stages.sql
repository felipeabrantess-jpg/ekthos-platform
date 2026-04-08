-- ============================================================
-- Migration: 00005_seed_default_stages.sql
-- Descrição: Função para criar stages padrão ao criar tenant
-- Chamada pelo onboarding após inserir church_id
-- ============================================================

CREATE OR REPLACE FUNCTION create_default_pipeline_stages(p_church_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO pipeline_stages (church_id, name, slug, order_index, days_until_followup, auto_followup)
  VALUES
    (p_church_id, 'Visitante',        'visitante',        1, 1,  true),
    (p_church_id, 'Interesse em Grupo','interesse-grupo',  2, 3,  true),
    (p_church_id, 'Em Acompanhamento','em-acompanhamento', 3, 7,  true),
    (p_church_id, 'Membro',           'membro',           4, 30, false),
    (p_church_id, 'Líder',            'lider',            5, 0,  false),
    (p_church_id, 'Inativo',          'inativo',          6, 0,  false)
  ON CONFLICT (church_id, slug) DO NOTHING;

  -- Criar church_settings padrão se ainda não existir
  INSERT INTO church_settings (church_id)
  VALUES (p_church_id)
  ON CONFLICT (church_id) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION create_default_pipeline_stages IS
  'Cria stages padrão para um novo tenant. Chamada pelo onboarding agent.';
