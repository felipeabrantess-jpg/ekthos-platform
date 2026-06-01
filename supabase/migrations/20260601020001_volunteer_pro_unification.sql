-- Migration: volunteer_pro_unification
-- Fase 1 — TRONCO/BRAÇO
-- 1. Unifica enabled_modules: adiciona 'volunteer-pro: true' onde voluntarios ou escalas estão true
-- 2. Cria agent_grants de cortesia para igrejas de teste sem entitlement
-- 3. Idempotente (usa ON CONFLICT DO NOTHING e jsonb_set seguro)

-- ── PARTE 1: Unificação do moduleKey ─────────────────────────────────────────
-- Adiciona 'volunteer-pro: true' em churches onde voluntarios=true OU escalas=true
-- Preserva as keys legadas voluntarios/escalas (backward compat durante transição)
-- Após transição completa, remover as keys legadas em migration futura

UPDATE public.churches
SET enabled_modules = jsonb_set(
  enabled_modules,
  '{volunteer-pro}',
  'true'::jsonb,
  true  -- cria a key se não existir
)
WHERE
  (enabled_modules->>'voluntarios' = 'true'
   OR enabled_modules->>'escalas' = 'true')
  AND (enabled_modules->>'volunteer-pro' IS DISTINCT FROM 'true');

-- ── PARTE 2: Agent grants para igrejas de teste sem entitlement ───────────────
-- Cria cortesia para Bola de Neve (a07a054b) e Church demo (184fd750)
-- Igreja Teste Mock (62e473b8) já tem grant — não duplicar (ON CONFLICT DO NOTHING)
-- Meu Avivamento (89c7d9de) vol=true esc=false — adicionar por consistência

INSERT INTO public.agent_grants (church_id, agent_slug, grant_type, granted_by, starts_at, ends_at)
VALUES
  -- Bola de Neve
  (
    'a07a054b-3982-4163-a9ef-c0f173126f3e'::uuid,
    'agent-escalas',
    'courtesy',
    '579d0f7b-9b8b-4c20-94c5-513b4a424642'::uuid,
    now(),
    NULL
  ),
  -- Church demo
  (
    '184fd750-4354-4c31-9018-64bc3605eca3'::uuid,
    'agent-escalas',
    'courtesy',
    '579d0f7b-9b8b-4c20-94c5-513b4a424642'::uuid,
    now(),
    NULL
  ),
  -- Meu Avivamento
  (
    '89c7d9de-6258-4531-ba3a-17e345545e6f'::uuid,
    'agent-escalas',
    'courtesy',
    '579d0f7b-9b8b-4c20-94c5-513b4a424642'::uuid,
    now(),
    NULL
  )
ON CONFLICT DO NOTHING;
