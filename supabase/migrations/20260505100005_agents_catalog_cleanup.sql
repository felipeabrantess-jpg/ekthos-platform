-- ============================================================
-- Sprint 2A — Onda A — Migration 5
-- Limpeza do catálogo de agentes (pré-go-live obrigatório)
-- ============================================================

-- agent-operacao: active=true no catálogo, preço R$390, mas EF não existe.
-- Vender algo que não existe é risco real de go-live.
UPDATE public.agents_catalog
SET    active     = false,
       updated_at = now()
WHERE  slug = 'agent-operacao';

-- agent-config: stub sem EF e sem lógica. Confuso para igrejas.
UPDATE public.agents_catalog
SET    active     = false,
       updated_at = now()
WHERE  slug = 'agent-config';
