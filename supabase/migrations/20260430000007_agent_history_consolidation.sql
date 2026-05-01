-- =============================================================
-- AGENT-DEBT-001: Consolidação de histórico de agentes
-- Sprint 1 — 30/04/2026
--
-- Problema: agent_conversations (backend) e agent_chat_sessions (frontend)
-- não estão sincronizados. Mensagens de agentes descontinuados ficam
-- visíveis na UI como se fossem sessões ativas.
--
-- Solução Sprint 1:
--   1. Adiciona coluna archived em agent_conversations
--   2. Arquiva mensagens de agentes descontinuados
--   3. Cria sessions em agent_chat_sessions para agentes ativos sem sessão
-- =============================================================

-- 1. Adicionar coluna archived em agent_conversations
ALTER TABLE agent_conversations
ADD COLUMN IF NOT EXISTS archived boolean DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_ac_archived
ON agent_conversations(archived, agent_slug) WHERE archived = false;

-- 2. Arquivar mensagens de todos os agentes descontinuados
UPDATE agent_conversations
SET archived = true
WHERE agent_slug IN (
  'agent-agenda',
  'agent-conteudo',
  'agent-cuidado',
  'agent-formacao',
  'agent-funil',
  'agent-metricas',
  'agent-missoes',
  'agent-proposta',
  'agent-relatorios',
  'agent-whatsapp'
);

-- 3. Criar sessions em agent_chat_sessions para agentes ativos
-- que têm conversas em agent_conversations mas não têm session
INSERT INTO agent_chat_sessions (church_id, user_id, agent_slug, title, last_message_at, created_at)
SELECT DISTINCT
  ac.church_id,
  ac.user_id,
  ac.agent_slug,
  'Conversa com ' || ac.agent_slug AS title,
  MAX(ac.created_at) AS last_message_at,
  MIN(ac.created_at) AS created_at
FROM agent_conversations ac
WHERE ac.archived = false
  AND ac.agent_slug IN (
    'agent-suporte', 'agent-onboarding', 'agent-cadastro', 'agent-config',
    'agent-acolhimento', 'agent-operacao', 'agent-reengajamento'
  )
  AND NOT EXISTS (
    SELECT 1 FROM agent_chat_sessions s
    WHERE s.church_id = ac.church_id
      AND s.user_id = ac.user_id
      AND s.agent_slug = ac.agent_slug
  )
GROUP BY ac.church_id, ac.user_id, ac.agent_slug
ON CONFLICT DO NOTHING;
