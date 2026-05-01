-- =============================================================
-- AGENTS_CATALOG — Atualizações Sprint 1
-- - Adicionar agent-config (interno)
-- - Inserir agent-acolhimento e agent-operacao (premium)
-- - Garantir 4 internos ativos como free/haiku/interno
-- - Garantir 3 premium ativos como always_paid/sonnet/premium
-- =============================================================

-- Adicionar agent-config
INSERT INTO agents_catalog (slug, name, short_description, active, pricing_tier, price_cents, model, category, sort_order)
VALUES (
  'agent-config',
  'Configurador Inteligente',
  'Ajuda a configurar pipeline, áreas e ministérios via conversa natural',
  true,
  'free',
  0,
  'haiku',
  'interno',
  4
)
ON CONFLICT (slug) DO UPDATE SET
  active = true,
  pricing_tier = 'free',
  price_cents = 0,
  model = 'haiku',
  updated_at = now();

-- Inserir agent-acolhimento e agent-operacao (não existiam)
INSERT INTO agents_catalog (slug, name, short_description, active, pricing_tier, price_cents, model, category, sort_order)
VALUES
  (
    'agent-acolhimento',
    'Acolhimento Pastoral',
    'Acolhe visitantes, mantém contato semanal e conduz os primeiros 90 dias na igreja',
    true,
    'always_paid',
    29000,
    'sonnet',
    'premium',
    10
  ),
  (
    'agent-operacao',
    'Operação Pastoral',
    'Orquestra antes, durante e depois de cultos e eventos com fechamento automático',
    true,
    'always_paid',
    39000,
    'sonnet',
    'premium',
    11
  )
ON CONFLICT (slug) DO UPDATE SET
  active = true,
  pricing_tier = 'always_paid',
  model = 'sonnet',
  updated_at = now();

-- Garantir 4 internos ativos como free/haiku
UPDATE agents_catalog
SET
  active = true,
  pricing_tier = 'free',
  price_cents = 0,
  model = 'haiku',
  category = 'interno',
  updated_at = now()
WHERE slug IN ('agent-suporte', 'agent-onboarding', 'agent-cadastro', 'agent-config');

-- Garantir 3 premium pastorais ativos com modelo sonnet
UPDATE agents_catalog
SET
  active = true,
  model = 'sonnet',
  category = 'premium',
  updated_at = now()
WHERE slug IN ('agent-acolhimento', 'agent-operacao', 'agent-reengajamento');

-- Atualizar preço e sort_order do reengajamento
UPDATE agents_catalog
SET price_cents = 29000, sort_order = 12, updated_at = now()
WHERE slug = 'agent-reengajamento';
