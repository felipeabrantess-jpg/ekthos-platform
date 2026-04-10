-- ============================================================
-- Migration: 00011_billing.sql
-- Descrição: Sistema completo de billing e agentes IA da plataforma Ekthos.
--            Inclui planos, addons, catálogo de agentes, assinaturas,
--            faturas e tokens de sessão por dispositivo.
-- Criado em: 2026-04-09
-- Reversível: Ver seção ROLLBACK ao final
-- ============================================================

-- ============================================================
-- EXTENSÕES NECESSÁRIAS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- FUNÇÃO AUXILIAR: set_updated_at (idempotente)
-- ============================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- TABELA: plans
-- Planos de assinatura disponíveis na plataforma.
-- ============================================================

CREATE TABLE IF NOT EXISTS plans (
  slug               VARCHAR(50)  PRIMARY KEY,
  name               VARCHAR(100) NOT NULL,
  price_cents        INTEGER      NOT NULL CHECK (price_cents >= 0),
  max_users          INTEGER      NOT NULL DEFAULT 1,
  included_agents    INTEGER      NOT NULL DEFAULT 0,
  stripe_price_id    VARCHAR(100),
  active             BOOLEAN      NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE plans IS 'Planos de assinatura Ekthos. Cada linha é um tier comercial.';
COMMENT ON COLUMN plans.slug IS 'Identificador único do plano. Ex: chamado, missao, avivamento.';
COMMENT ON COLUMN plans.max_users IS 'Limite de usuários incluídos no plano (sem extras).';
COMMENT ON COLUMN plans.included_agents IS 'Número de agentes elegíveis incluídos sem custo adicional.';
COMMENT ON COLUMN plans.stripe_price_id IS 'ID do Price no Stripe para cobrança recorrente.';

-- ============================================================
-- TABELA: addons
-- Complementos vendidos individualmente além do plano base.
-- ============================================================

CREATE TABLE IF NOT EXISTS addons (
  slug        VARCHAR(50)  PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  price_cents INTEGER      NOT NULL CHECK (price_cents >= 0),
  description TEXT,
  active      BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE addons IS 'Addons compráveis individualmente: usuário extra, agente IA extra.';

-- ============================================================
-- TABELA: agents_catalog
-- Catálogo completo de agentes IA disponíveis na plataforma.
-- ============================================================

CREATE TYPE IF NOT EXISTS agent_pricing_tier AS ENUM (
  'free',
  'always_paid',
  'eligible'
);

CREATE TABLE IF NOT EXISTS agents_catalog (
  id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              VARCHAR(100) NOT NULL UNIQUE,
  name              VARCHAR(150) NOT NULL,
  short_description TEXT         NOT NULL,
  full_description  TEXT,
  features          JSONB        NOT NULL DEFAULT '[]',
  pain_solved       TEXT,
  without_me        TEXT,
  pricing_tier      agent_pricing_tier NOT NULL DEFAULT 'eligible',
  price_cents       INTEGER      NOT NULL DEFAULT 9789 CHECK (price_cents >= 0),
  active            BOOLEAN      NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE agents_catalog IS 'Catálogo de todos os agentes IA disponíveis na plataforma Ekthos.';
COMMENT ON COLUMN agents_catalog.pricing_tier IS 'free=gratuito; always_paid=sempre cobrado; eligible=pode ser incluído no plano.';
COMMENT ON COLUMN agents_catalog.features IS 'Array JSONB com 4 bullets de funcionalidades do agente.';
COMMENT ON COLUMN agents_catalog.pain_solved IS 'Dor pastoral que o agente resolve.';
COMMENT ON COLUMN agents_catalog.without_me IS 'O que acontece quando a igreja não tem este agente. Iniciar com "Sem este agente...".';

-- ============================================================
-- TABELA: subscriptions
-- Assinatura ativa de cada igreja (1:1 com churches).
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id               UUID        NOT NULL UNIQUE REFERENCES churches(id) ON DELETE CASCADE,
  plan_slug               VARCHAR(50) NOT NULL REFERENCES plans(slug),
  status                  VARCHAR(20) NOT NULL DEFAULT 'trialing'
                            CHECK (status IN ('trialing','active','past_due','canceled','unpaid','incomplete')),
  stripe_subscription_id  VARCHAR(100) UNIQUE,
  stripe_customer_id      VARCHAR(100),
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  trial_end               TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '14 days'),
  cancel_at_period_end    BOOLEAN     NOT NULL DEFAULT false,
  extra_users             INTEGER     NOT NULL DEFAULT 0 CHECK (extra_users >= 0),
  extra_agents            INTEGER     NOT NULL DEFAULT 0 CHECK (extra_agents >= 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE subscriptions IS 'Assinatura ativa de cada tenant. Exatamente 1 linha por igreja.';
COMMENT ON COLUMN subscriptions.extra_users IS 'Usuários adicionais comprados além do max_users do plano.';
COMMENT ON COLUMN subscriptions.extra_agents IS 'Slots de agentes adicionais comprados via addon.';

CREATE INDEX IF NOT EXISTS idx_subscriptions_church_id  ON subscriptions (church_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan_slug  ON subscriptions (plan_slug);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status     ON subscriptions (status);

-- Trigger updated_at
DROP TRIGGER IF EXISTS set_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- TABELA: subscription_agents
-- Agentes IA ativados para uma assinatura específica.
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_agents (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID        NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  agent_slug      VARCHAR(100) NOT NULL REFERENCES agents_catalog(slug) ON DELETE CASCADE,
  active          BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscription_id, agent_slug)
);

COMMENT ON TABLE subscription_agents IS 'Agentes IA habilitados por assinatura. Inclui gratuitos, incluídos e pagos.';

CREATE INDEX IF NOT EXISTS idx_subscription_agents_sub_id    ON subscription_agents (subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscription_agents_slug      ON subscription_agents (agent_slug);
CREATE INDEX IF NOT EXISTS idx_subscription_agents_active    ON subscription_agents (subscription_id, active);

-- ============================================================
-- TABELA: invoices
-- Histórico de faturas por tenant (espelho do Stripe).
-- ============================================================

CREATE TABLE IF NOT EXISTS invoices (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id           UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  stripe_invoice_id   VARCHAR(100) UNIQUE,
  amount_cents        INTEGER     NOT NULL CHECK (amount_cents >= 0),
  status              VARCHAR(20) NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','open','paid','uncollectible','void')),
  paid_at             TIMESTAMPTZ,
  hosted_invoice_url  TEXT,
  pdf_url             TEXT,
  description         TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE invoices IS 'Faturas emitidas pelo Stripe, espelhadas localmente para auditoria.';

CREATE INDEX IF NOT EXISTS idx_invoices_church_id ON invoices (church_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status    ON invoices (church_id, status);
CREATE INDEX IF NOT EXISTS idx_invoices_paid_at   ON invoices (paid_at DESC NULLS LAST);

-- ============================================================
-- TABELA: session_tokens
-- Tokens de sessão por dispositivo para controle de acesso.
-- ============================================================

CREATE TABLE IF NOT EXISTS session_tokens (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  church_id     UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  token         VARCHAR(64) NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  device_info   JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, church_id)
);

COMMENT ON TABLE session_tokens IS 'Token de sessão por dispositivo/usuário/tenant para validação de JWT + refresh.';
COMMENT ON COLUMN session_tokens.device_info IS 'Metadados do dispositivo: user_agent, ip, platform.';
COMMENT ON COLUMN session_tokens.token IS 'Token hexadecimal de 64 chars gerado aleatoriamente.';

CREATE INDEX IF NOT EXISTS idx_session_tokens_user_id   ON session_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_session_tokens_church_id ON session_tokens (church_id);
CREATE INDEX IF NOT EXISTS idx_session_tokens_token     ON session_tokens (token);

-- ============================================================
-- RLS: plans (leitura pública)
-- ============================================================

ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "plans_public_select" ON plans;
CREATE POLICY "plans_public_select" ON plans
  FOR SELECT USING (true);

-- ============================================================
-- RLS: addons (leitura pública)
-- ============================================================

ALTER TABLE addons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "addons_public_select" ON addons;
CREATE POLICY "addons_public_select" ON addons
  FOR SELECT USING (true);

-- ============================================================
-- RLS: agents_catalog
-- ============================================================

ALTER TABLE agents_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agents_catalog_active_select" ON agents_catalog;
CREATE POLICY "agents_catalog_active_select" ON agents_catalog
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS "agents_catalog_service_all" ON agents_catalog;
CREATE POLICY "agents_catalog_service_all" ON agents_catalog
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: subscriptions
-- ============================================================

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_church_select" ON subscriptions;
CREATE POLICY "subscriptions_church_select" ON subscriptions
  FOR SELECT USING (church_id = auth_church_id());

DROP POLICY IF EXISTS "subscriptions_service_all" ON subscriptions;
CREATE POLICY "subscriptions_service_all" ON subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: subscription_agents
-- ============================================================

ALTER TABLE subscription_agents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_agents_church_select" ON subscription_agents;
CREATE POLICY "subscription_agents_church_select" ON subscription_agents
  FOR SELECT USING (
    subscription_id IN (
      SELECT id FROM subscriptions WHERE church_id = auth_church_id()
    )
  );

DROP POLICY IF EXISTS "subscription_agents_service_all" ON subscription_agents;
CREATE POLICY "subscription_agents_service_all" ON subscription_agents
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: invoices
-- ============================================================

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices_church_select" ON invoices;
CREATE POLICY "invoices_church_select" ON invoices
  FOR SELECT USING (church_id = auth_church_id());

DROP POLICY IF EXISTS "invoices_service_all" ON invoices;
CREATE POLICY "invoices_service_all" ON invoices
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RLS: session_tokens
-- ============================================================

ALTER TABLE session_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "session_tokens_own_all" ON session_tokens;
CREATE POLICY "session_tokens_own_all" ON session_tokens
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "session_tokens_service_all" ON session_tokens;
CREATE POLICY "session_tokens_service_all" ON session_tokens
  FOR ALL USING (auth.role() = 'service_role');

-- ============================================================
-- RPC: upsert_session_token
-- Cria ou substitui o token de sessão do usuário autenticado
-- para um tenant específico. Retorna o token como TEXT.
-- ============================================================

CREATE OR REPLACE FUNCTION upsert_session_token(p_church_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');

  INSERT INTO session_tokens (user_id, church_id, token, last_active_at)
  VALUES (auth.uid(), p_church_id, v_token, NOW())
  ON CONFLICT (user_id, church_id)
  DO UPDATE SET
    token          = v_token,
    last_active_at = NOW();

  RETURN v_token;
END;
$$;

COMMENT ON FUNCTION upsert_session_token(UUID) IS
  'Gera e persiste um token de sessão único para o usuário autenticado no tenant informado. Chamar após login bem-sucedido.';

-- ============================================================
-- RPC: validate_session_token
-- Valida se um token é válido para o usuário autenticado.
-- Atualiza last_active_at em caso de sucesso.
-- ============================================================

CREATE OR REPLACE FUNCTION validate_session_token(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE session_tokens
  SET last_active_at = NOW()
  WHERE token   = p_token
    AND user_id = auth.uid()
  RETURNING true;
$$;

COMMENT ON FUNCTION validate_session_token(TEXT) IS
  'Retorna TRUE e atualiza last_active_at se o token pertence ao usuário autenticado. Retorna NULL/FALSE caso contrário.';

-- ============================================================
-- SEED: plans
-- ============================================================

INSERT INTO plans (slug, name, price_cents, max_users, included_agents, active)
VALUES
  ('chamado',     'Chamado',     38900,  2, 0, true),
  ('missao',      'Missão',      69800,  3, 3, true),
  ('avivamento',  'Avivamento', 101567,  4, 6, true)
ON CONFLICT (slug) DO UPDATE SET
  name            = EXCLUDED.name,
  price_cents     = EXCLUDED.price_cents,
  max_users       = EXCLUDED.max_users,
  included_agents = EXCLUDED.included_agents,
  active          = EXCLUDED.active;

-- ============================================================
-- SEED: addons
-- ============================================================

INSERT INTO addons (slug, name, price_cents, description, active)
VALUES
  (
    'user_extra',
    'Usuário Extra',
    6990,
    'Adicione um novo usuário à sua conta além do limite do plano. Ideal para igrejas em crescimento que precisam ampliar a equipe de líderes com acesso ao sistema.',
    true
  ),
  (
    'agent_ia',
    'Agente IA',
    9789,
    'Adicione um slot de Agente IA extra à sua assinatura, escolhendo entre os agentes elegíveis do catálogo que não estão incluídos no seu plano atual.',
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name        = EXCLUDED.name,
  price_cents = EXCLUDED.price_cents,
  description = EXCLUDED.description,
  active      = EXCLUDED.active;

-- ============================================================
-- SEED: agents_catalog
-- ============================================================

-- ------------------------------------------------------------
-- 1. GRATUITO: agent-suporte
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-suporte',
  'Suporte 24h',
  'Seu assistente disponível a qualquer hora para tirar dúvidas sobre o sistema e sobre a igreja.',
  'O Agente Suporte 24h é o primeiro ponto de contato de qualquer usuário da plataforma. Treinado com todo o conhecimento do Ekthos, ele responde perguntas sobre funcionalidades, guia líderes em processos e está disponível a qualquer hora — sem precisar de um técnico humano de plantão.',
  '[
    "Responde dúvidas sobre o sistema em linguagem natural, sem jargões técnicos",
    "Disponível 24 horas por dia, 7 dias por semana, sem fila de espera",
    "Direciona o usuário para o recurso certo com links diretos dentro do Ekthos",
    "Registra dúvidas frequentes para melhoria contínua da plataforma"
  ]'::jsonb,
  'Líderes travam em processos simples do sistema e perdem tempo aguardando suporte humano, atrasando o trabalho pastoral.',
  'Sem este agente, cada dúvida operacional vira um e-mail ou mensagem para o administrador, consumindo tempo precioso de quem deveria estar cuidando de pessoas.',
  'free',
  0,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 2. ALWAYS PAID: agent-whatsapp
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-whatsapp',
  'WhatsApp Pastoral',
  'Envia mensagens automáticas de boas-vindas, lembretes de eventos e acompanhamento pastoral via WhatsApp.',
  'O Agente WhatsApp Pastoral transforma o WhatsApp em um canal pastoral ativo e organizado. Ele envia boas-vindas personalizadas a visitantes, lembra membros de cultos e reuniões de célula, e acompanha quem sumiu — tudo de forma automática, com a voz e o calor da sua igreja.',
  '[
    "Mensagem de boas-vindas automática para cada visitante cadastrado no sistema",
    "Lembretes inteligentes de cultos, células e eventos com 24h e 2h de antecedência",
    "Acompanhamento de ausentes: contato automático após 2 domingos sem presença",
    "Relatório semanal de interações entregue direto ao pastor responsável"
  ]'::jsonb,
  'Visitantes somem sem contato após a primeira visita e membros esquecem eventos por falta de comunicação ativa.',
  'Sem este agente, a igreja depende de voluntários memorizando quem contatar, quando contatar e o que dizer — e inevitavelmente pessoas caem no esquecimento.',
  'always_paid',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 3. ALWAYS PAID: agent-funil
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-funil',
  'Funil e Consolidação',
  'Monitora cada visitante no caminho de discipulado e alerta quando alguém trava ou some.',
  'O Agente Funil e Consolidação mapeia a jornada de cada pessoa — da primeira visita ao batismo, da célula à liderança. Ele identifica em qual etapa cada um está, quanto tempo está parado e qual líder deveria agir. Ninguém passa despercebido.',
  '[
    "Mapa visual da jornada de cada visitante com etapas de discipulado personalizáveis",
    "Alerta automático quando alguém fica mais de 15 dias parado em uma etapa",
    "Sugestão do próximo passo pastoral para cada pessoa com base no histórico",
    "Dashboard de conversão: quantos visitantes viraram membros no mês"
  ]'::jsonb,
  'Visitantes somem entre as etapas de discipulado sem que ninguém perceba, e a consolidação depende da memória de um único líder.',
  'Sem este agente, centenas de pessoas transitam pela igreja sem ser acompanhadas de perto, e a taxa de retenção cai silenciosamente sem que o pastor saiba o motivo.',
  'always_paid',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 4. ALWAYS PAID: agent-agenda
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-agenda',
  'Agenda Pastoral',
  'Organiza o dia do pastor com briefing matinal, lembretes inteligentes e reorganização automática.',
  'O Agente Agenda Pastoral funciona como um assistente pessoal de alto nível para o pastor. Toda manhã entrega um briefing do dia, prioriza compromissos, avisa sobre aniversários de membros importantes e reorganiza automaticamente quando algo muda. O pastor foca nas pessoas, não na logística.',
  '[
    "Briefing matinal automático com os compromissos do dia ordenados por prioridade",
    "Alerta de aniversários, consultas pastorais e datas importantes dos membros",
    "Reorganização automática da agenda quando um compromisso é cancelado ou adiado",
    "Integração com o calendário da igreja para evitar conflitos de horários"
  ]'::jsonb,
  'O pastor perde horas gerenciando agenda, respondendo mensagens sobre horários e descobrindo conflitos na hora errada.',
  'Sem este agente, o pastor chega às reuniões sem preparo, esquece aniversários de membros estratégicos e gasta energia mental em logística em vez de liderança.',
  'always_paid',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 5. ALWAYS PAID: agent-cuidado
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-cuidado',
  'Cuidado Pastoral',
  'Detecta membros em risco antes que se afastem e sugere quem precisa de atenção pastoral.',
  'O Agente Cuidado Pastoral analisa padrões de comportamento — frequência, contribuição, participação em células — e identifica sinais de afastamento antes que o membro desapareça. Ele entrega ao pastor uma lista semanal de quem precisa de atenção, com contexto e sugestão de abordagem.',
  '[
    "Score de engajamento individual calculado a partir de presença, dízimo e participação em grupos",
    "Lista semanal dos membros em maior risco de afastamento com contexto pastoral",
    "Sugestão personalizada de como abordar cada membro com base no histórico",
    "Histórico de cuidado: registra cada contato e acompanha a evolução do membro"
  ]'::jsonb,
  'Membros se afastam lentamente sem que a liderança perceba, e quando notam, já perderam o vínculo.',
  'Sem este agente, o pastor só descobre que um membro se afastou quando ele já foi para outra igreja — e a oportunidade de restauração já passou.',
  'always_paid',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 6. ELIGIBLE: agent-metricas
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-metricas',
  'Métricas Pastorais',
  'Dashboard inteligente que traduz números em linguagem pastoral e mostra tendências.',
  'O Agente Métricas Pastorais não é um relatório frio de planilha. Ele interpreta os dados da igreja e entrega insights em linguagem pastoral: "Sua célula feminina cresceu 18% este mês, mas a frequência de jovens caiu 3 domingos seguidos". O pastor entende o que está acontecendo sem precisar ser analista.',
  '[
    "Dashboard semanal com crescimento de membros, presença e batismos em linguagem simples",
    "Tendências de longo prazo com alertas quando indicadores caem por 2 semanas consecutivas",
    "Comparação entre departamentos, células e faixas etárias para identificar focos de atenção",
    "Exportação de relatório executivo para apresentação no conselho da igreja"
  ]'::jsonb,
  'O pastor toma decisões no feeling sem dados concretos, ou se perde em planilhas que ninguém consegue interpretar.',
  'Sem este agente, a liderança navega no escuro — celebra crescimento superficial sem ver as perdas internas e reage a crises que poderiam ter sido evitadas semanas antes.',
  'eligible',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 7. ELIGIBLE: agent-relatorios
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-relatorios',
  'Relatórios Pastorais',
  'Gera relatórios automáticos semanais e mensais para o pastor e para o conselho.',
  'O Agente Relatórios Pastorais coleta dados de todas as áreas da igreja e monta documentos prontos para apresentação — sem que ninguém precise preencher uma linha. Relatório semanal para o pastor, relatório mensal para o conselho, relatório anual para a assembleia. Tudo automático, formatado e com análise.',
  '[
    "Relatório semanal de presença, crescimento e eventos gerado toda segunda-feira",
    "Relatório mensal consolidado com comparativo do mês anterior entregue ao conselho",
    "Relatório financeiro de dízimos e ofertas com totais por membro e por célula",
    "Exportação em PDF e compartilhamento direto por e-mail ou WhatsApp"
  ]'::jsonb,
  'Montar relatórios consome horas do secretário ou do pastor, e ainda assim chegam ao conselho com dados desatualizados.',
  'Sem este agente, o pastor passa parte do domingo ou da segunda-feira compilando dados manualmente, ou pior, apresenta números imprecisos ao conselho por falta de tempo para checar tudo.',
  'eligible',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 8. ELIGIBLE: agent-proposta
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-proposta',
  'Propostas e Eventos',
  'Cria convites personalizados, gerencia inscrições e controla logística de eventos.',
  'O Agente Propostas e Eventos cuida de toda a operação de um evento da igreja, do convite à logística. Ele gera artes de convite, abre inscrições, envia lembretes automáticos, controla lista de presença e faz o pós-evento com feedback e fotos. O líder de eventos foca no conteúdo, não na burocracia.',
  '[
    "Geração automática de convite personalizado com identidade visual da igreja",
    "Abertura de inscrições com link compartilhável e controle de vagas em tempo real",
    "Lembretes automáticos aos inscritos com 3 dias, 1 dia e 3 horas antes do evento",
    "Pós-evento: coleta de feedback, registro de presença e relatório de resultado"
  ]'::jsonb,
  'Organizar eventos consome energia da equipe em tarefas operacionais repetitivas como listas de presença e lembretes manuais.',
  'Sem este agente, a equipe de eventos fica presa no operacional, inscrições chegam pelo WhatsApp em mensagens avulsas e o controle de vagas é feito em planilhas sujeitas a erros.',
  'eligible',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 9. ELIGIBLE: agent-cadastro
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-cadastro',
  'Cadastro Inteligente',
  'Digitaliza cartões de visitante automaticamente e completa dados faltantes.',
  'O Agente Cadastro Inteligente elimina a pilha de fichas de papel que acumula toda semana. Com uma foto do cartão de visitante, ele extrai os dados, cria o perfil no sistema, busca informações complementares públicas e categoriza a pessoa automaticamente. Zero digitação manual.',
  '[
    "Leitura automática de cartões de visitante por foto via OCR inteligente",
    "Deduplicação: detecta se a pessoa já tem cadastro e unifica os registros",
    "Enriquecimento de perfil: complementa dados faltantes via fontes públicas",
    "Categorização automática: faixa etária, bairro, status familiar para segmentação pastoral"
  ]'::jsonb,
  'Voluntários gastam horas digitando cartões de papel e erros de digitação geram cadastros duplicados ou incompletos no sistema.',
  'Sem este agente, fichas de visitante acumulam na recepção por dias, dados chegam ao sistema com erros, e membros duplicados poluem as estatísticas da igreja.',
  'eligible',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 10. ELIGIBLE: agent-onboarding
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-onboarding',
  'Onboarding de Líderes',
  'Guia novos líderes no uso do sistema passo a passo, sem treinamento presencial.',
  'O Agente Onboarding de Líderes garante que cada novo líder da igreja comece a usar o Ekthos com confiança, sem precisar de um treinamento presencial ou de incomodar o administrador. Ele cria uma trilha personalizada de acordo com o cargo, acompanha o progresso e celebra cada conquista.',
  '[
    "Trilha de onboarding personalizada por cargo: líder de célula, secretário, tesoureiro",
    "Microaulas contextuais que aparecem no momento em que o líder executa uma tarefa pela primeira vez",
    "Check-in semanal: o agente verifica o progresso e desbloqueia o próximo módulo",
    "Certificado digital de conclusão do onboarding compartilhável com a liderança"
  ]'::jsonb,
  'Novos líderes chegam ao sistema sem saber por onde começar e sobrecarregam o administrador com perguntas básicas repetitivas.',
  'Sem este agente, a curva de aprendizado de cada novo líder depende da disponibilidade do pastor ou administrador, que interrompe o próprio trabalho para ensinar o mesmo fluxo pela décima vez.',
  'eligible',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 11. ELIGIBLE: agent-financeiro
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-financeiro',
  'Controle Financeiro',
  'Controla dízimos e ofertas por membro, gera relatórios e detecta quedas na contribuição.',
  'O Agente Controle Financeiro é o tesoureiro inteligente da sua igreja. Ele registra dízimos e ofertas, cruza com o cadastro de membros, detecta quem deixou de contribuir e gera relatórios transparentes para o conselho. Tudo com sigilo, precisão e agilidade.',
  '[
    "Lançamento automático de dízimos e ofertas por membro via integração bancária ou PIX",
    "Alerta pastoral quando um dizimista regular para de contribuir por 30 dias",
    "Relatório mensal de receita por fonte: dízimo, oferta, campanha, missões",
    "Dashboard de projeção financeira para os próximos 3 meses com base no histórico"
  ]'::jsonb,
  'O tesoureiro gasta horas em planilhas manuais e a liderança não sabe quem são os dizimistas regulares nem quando a arrecadação caiu.',
  'Sem este agente, quedas na arrecadação passam despercebidas por semanas, o conselho recebe dados atrasados e a prestação de contas anual vira uma maratona de conciliação manual.',
  'eligible',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 12. ELIGIBLE: agent-conteudo
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-conteudo',
  'Conteúdo e Pregação',
  'Gera devocional diário, posts para Instagram e sugere temas de pregação.',
  'O Agente Conteúdo e Pregação é o braço criativo do ministério de comunicação. Ele gera devocionais diários baseados no calendário litúrgico, sugere temas de pregação alinhados ao momento da igreja e produz rascunhos de posts para Instagram e WhatsApp — tudo com a voz e os valores da sua congregação.',
  '[
    "Devocional diário gerado automaticamente com versículo, reflexão e oração em 3 parágrafos",
    "Sugestão semanal de temas de pregação baseada no calendário litúrgico e nas necessidades da igreja",
    "Rascunho de post para Instagram: legenda, hashtags e sugestão de imagem para cada mensagem",
    "Banco de ilustrações pastorais e histórias para enriquecer sermões por tema"
  ]'::jsonb,
  'Criar conteúdo consistente para redes sociais e devocionais consome tempo que o pastor não tem, e a comunicação da igreja fica irregular.',
  'Sem este agente, o Instagram da igreja fica dias sem posts, o devocional não é enviado toda manhã e o pastor chega ao domingo ainda elaborando o sermão sem ilustrações preparadas.',
  'eligible',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 13. ELIGIBLE: agent-escalas
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-escalas',
  'Escalas Automáticas',
  'Gera escalas automáticas de louvor, mídia e recepção sem conflito de horários.',
  'O Agente Escalas Automáticas elimina a dor de cabeça semanal de montar escalas. Ele conhece a disponibilidade de cada voluntário, evita conflitos com células e compromissos pessoais, distribui a carga de forma equilibrada e notifica cada pessoa automaticamente. Nunca mais "quem está na recepção domingo?".',
  '[
    "Geração automática de escalas semanais para louvor, mídia, recepção e EBD",
    "Respeito às indisponibilidades cadastradas por cada voluntário no app",
    "Distribuição equilibrada: nenhum voluntário fica sobrecarregado enquanto outro fica ocioso",
    "Notificação automática para cada escalado com antecedência de 3 dias via WhatsApp"
  ]'::jsonb,
  'Montar escalas semanais é um processo manual que consome horas do líder, gera conflitos e resulta em voluntários escalados sem aviso.',
  'Sem este agente, o líder de louvor passa horas no WhatsApp negociando disponibilidades, esquece de avisar alguém e descobre no domingo que falta instrumentista ou operador de som.',
  'eligible',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 14. ELIGIBLE: agent-formacao
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-formacao',
  'Formação e EBD',
  'Gerencia Escola da Fé e EBD com inscrição, presença, material e certificado digital.',
  'O Agente Formação e EBD digitaliza toda a operação da escola bíblica e de formação de líderes. Da inscrição ao certificado, passando pela presença automática, envio de material e acompanhamento individual de cada aluno. O professor foca no ensino; o agente cuida do resto.',
  '[
    "Inscrições online com turmas, pré-requisitos e vagas controladas automaticamente",
    "Presença digital via check-in no app — sem lista de papel no final do culto",
    "Envio automático de material de estudo por e-mail ou WhatsApp antes de cada aula",
    "Certificado digital gerado e enviado ao aluno ao concluir o curso com nota de aprovação"
  ]'::jsonb,
  'A EBD funciona no papel e na memória do professor: listas de presença manuais, materiais perdidos e certificados que nunca saem.',
  'Sem este agente, alunos saem da formação sem certificado, o professor não sabe quem está reprovado por falta até a última aula, e o histórico de formação da liderança não existe em lugar nenhum.',
  'eligible',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ------------------------------------------------------------
-- 15. ELIGIBLE: agent-missoes
-- ------------------------------------------------------------
INSERT INTO agents_catalog (
  slug, name, short_description, full_description,
  features, pain_solved, without_me, pricing_tier, price_cents, active
) VALUES (
  'agent-missoes',
  'Missões e Ação Social',
  'Gerencia projetos missionários e de ação social com orçamento e prestação de contas.',
  'O Agente Missões e Ação Social é o gestor de projetos do ministério social da igreja. Ele organiza cada projeto com metas, orçamento, voluntários e cronograma. Acompanha a execução em tempo real, gera relatórios de prestação de contas para doadores e celebra cada impacto alcançado.',
  '[
    "Cadastro de projetos missionários e sociais com metas, prazo e orçamento definidos",
    "Controle de voluntários por projeto com horas dedicadas e tarefas atribuídas",
    "Relatório de prestação de contas com fotos e dados para envio a doadores e parceiros",
    "Mapa de impacto: famílias atendidas, cestas entregues, pessoas evangelizadas por projeto"
  ]'::jsonb,
  'Projetos sociais e missões são gerenciados em grupos de WhatsApp sem controle de orçamento, responsabilidades difusas e prestação de contas fraca para doadores.',
  'Sem este agente, a igreja perde doadores por falta de transparência, voluntários não sabem suas responsabilidades e o impacto real do ministério social nunca é medido nem comunicado.',
  'eligible',
  9789,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name              = EXCLUDED.name,
  short_description = EXCLUDED.short_description,
  full_description  = EXCLUDED.full_description,
  features          = EXCLUDED.features,
  pain_solved       = EXCLUDED.pain_solved,
  without_me        = EXCLUDED.without_me,
  pricing_tier      = EXCLUDED.pricing_tier,
  price_cents       = EXCLUDED.price_cents,
  active            = EXCLUDED.active;

-- ============================================================
-- SEED: subscriptions (demo church em trialing no plano Chamado)
-- ============================================================

INSERT INTO subscriptions (
  church_id,
  plan_slug,
  status,
  trial_end,
  cancel_at_period_end,
  extra_users,
  extra_agents
)
VALUES (
  'a1b2c3d4-e5f6-7890-abcd-ef1234567890'::UUID,
  'chamado',
  'trialing',
  NOW() + INTERVAL '14 days',
  false,
  0,
  0
)
ON CONFLICT (church_id) DO UPDATE SET
  plan_slug            = EXCLUDED.plan_slug,
  status               = EXCLUDED.status,
  trial_end            = EXCLUDED.trial_end,
  cancel_at_period_end = EXCLUDED.cancel_at_period_end,
  updated_at           = NOW();

-- ============================================================
-- SEED UPDATE: agents_catalog (descricoes do catalogo oficial)
-- Substitui as descricoes geradas automaticamente pelas descricoes
-- completas do arquivo CATALOGO-AGENTES-DESCRICOES.md
-- ============================================================

UPDATE agents_catalog SET
  name              = 'Suporte 24h',
  short_description = 'Seu assistente disponível a qualquer hora para tirar dúvidas sobre o sistema e sobre a igreja.',
  full_description  = 'O agente de Suporte 24h é como ter um auxiliar que nunca dorme. Ele responde dúvidas dos líderes, secretários e membros da equipe sobre como usar o sistema, e também sabe informações da igreja — horários dos cultos, endereço das sedes, contatos dos líderes, datas de eventos. Quando alguém pergunta algo que ele não consegue resolver, ele encaminha para o responsável certo da equipe. Está ativo desde o primeiro dia, sem custo nenhum.',
  features          = '["Responde dúvidas sobre o sistema 24 horas por dia","Sabe os horários dos cultos, sedes e contatos da igreja","Orienta líderes de célula a usar o CRM sem precisar de treinamento","Encaminha para atendimento humano quando não consegue resolver","Aprende com as informações da igreja durante o onboarding","Sugere agentes específicos quando a dúvida é sobre algo que outro agente faz melhor"]'::jsonb,
  pain_solved       = 'Líderes e secretários ficam perdidos no sistema e ligam pedindo ajuda.',
  without_me        = 'Sem o suporte, cada dúvida vira um chamado para o pastor ou para a secretária. O tempo deles é consumido ensinando as mesmas coisas.'
WHERE slug = 'agent-suporte';

UPDATE agents_catalog SET
  name              = 'WhatsApp Pastoral',
  short_description = 'Envia mensagens automáticas de boas-vindas, lembretes de eventos e acompanhamento pastoral via WhatsApp.',
  full_description  = 'O agente de WhatsApp Pastoral é a voz da igreja no celular de cada membro. Quando um visitante chega ao culto e é cadastrado, ele recebe automaticamente uma mensagem de boas-vindas calorosa — sem o consolidador precisar lembrar de ligar. Antes de cada culto ou evento, os membros recebem lembretes. No aniversário, recebem uma mensagem personalizada. E quando alguém some há semanas, o agente manda uma mensagem de cuidado antes que a pessoa se afaste de vez. Tudo isso com linguagem cristã natural, nunca robótica.',
  features          = '["Boas-vindas automática para visitantes após o culto (com delay de 2 horas para parecer natural)","Convite para a célula mais próxima com nome do líder e horário","Lembretes de culto e eventos com 24h de antecedência","Mensagem de aniversário personalizada para cada membro","Mensagem de aniversário de conversão (data em que aceitou Cristo)","Follow-up de consolidação: acompanha se o visitante foi contatado","Mensagens de reativação para membros ausentes há 14+ dias","Convites segmentados por departamento para eventos específicos","Tom acolhedor e fraterno — usa linguagem cristã sem forçar"]'::jsonb,
  pain_solved       = 'Visitantes chegam no culto e ninguém entra em contato depois. Membros somem e a igreja só percebe meses depois.',
  without_me        = 'Sem o WhatsApp Pastoral, cada mensagem precisa ser enviada manualmente. O consolidador esquece, o líder não tem tempo, e o visitante vai embora sem nunca mais voltar.'
WHERE slug = 'agent-whatsapp';

UPDATE agents_catalog SET
  name              = 'Funil e Consolidação',
  short_description = 'Monitora cada visitante no caminho de discipulado e alerta quando alguém trava ou some.',
  full_description  = 'O agente de Funil e Consolidação é o olho que nunca pisca sobre o caminho de cada pessoa na igreja. Ele sabe exatamente quantos visitantes chegaram, quantos foram consolidados, quantos estão frequentando célula, quantos estão na Escola da Fé. Quando alguém fica parado numa etapa além do prazo — por exemplo, um visitante que ninguém contatou em 24 horas — ele alerta o responsável imediatamente. Se o responsável não age, ele escala para o supervisor. Se o supervisor não age, escala para o pastor. Ninguém cai no esquecimento.',
  features          = '["Monitora cada pessoa em cada etapa do caminho de discipulado em tempo real","Alerta o consolidador quando um visitante não foi contatado em 24 horas","Escala automaticamente: consolidador → supervisor → pastor de células → pastor geral","Detecta membros que pararam de frequentar a célula há 14 dias e alerta o líder","Detecta membros ausentes há 30 dias e alerta o pastor diretamente","Identifica gargalos: se muita gente trava na mesma etapa, avisa que tem um problema estrutural","Mostra taxa de consolidação real: de cada 10 visitantes, quantos viraram membros?","Registra motivo de perda quando alguém sai do caminho (mudou de cidade, não se adaptou, etc.)"]'::jsonb,
  pain_solved       = 'A igreja perde visitantes entre a primeira visita e a consolidação porque ninguém acompanha a tempo.',
  without_me        = 'Sem o Funil, o pastor só descobre que perdeu um visitante quando já é tarde demais. A taxa de consolidação fica em 30% quando poderia ser 80%.'
WHERE slug = 'agent-funil';

UPDATE agents_catalog SET
  name              = 'Agenda Pastoral',
  short_description = 'Organiza o dia do pastor com briefing matinal, lembretes inteligentes e reorganização automática quando algo muda.',
  full_description  = 'O agente de Agenda Pastoral é o assistente pessoal do pastor. Todo dia às 6h30 ele manda um resumo no WhatsApp: quais reuniões tem, quais visitas estão agendadas, quem faz aniversário, quais alertas pendentes. Antes de cada compromisso, manda um lembrete com contexto — não só "reunião às 14h", mas "reunião com supervisores às 14h, pauta: 3 células sem reunião há 2 semanas". Quando algo muda (cancelamento, urgência), ele reorganiza o dia e avisa todos os envolvidos. À noite, manda um resumo do que foi feito e o que ficou pendente. Funciona por texto e voz no WhatsApp.',
  features          = '["Briefing matinal às 6h30 no WhatsApp com todos os compromissos do dia","Lembretes 30 minutos antes de cada compromisso com contexto do CRM","Contexto pastoral antes de visitas: dados do membro, frequência, célula, última visita, observações","Reorganização automática quando algo é cancelado ou muda de horário","Sugestão de atividades para horários livres baseado em pendências do CRM","Resumo do dia às 21h: o que foi feito, o que ficou pendente, agenda de amanhã","Funciona por voz: pastor manda áudio e o agente cria o compromisso","Sincronização bidirecional com Google Agenda","Protege horários pessoais (família, descanso) contra agendamentos"]'::jsonb,
  pain_solved       = 'O pastor vive apagando incêndio e esquece compromissos porque não tem quem organize o dia dele.',
  without_me        = 'Sem a Agenda, o pastor depende da própria memória e de anotações em papel. Perde reuniões, esquece visitas e chega em compromissos sem contexto.'
WHERE slug = 'agent-agenda';

UPDATE agents_catalog SET
  name              = 'Cuidado Pastoral',
  short_description = 'Detecta membros em risco antes que se afastem e sugere quem precisa de atenção pastoral.',
  full_description  = 'O agente de Cuidado Pastoral é o coração inteligente da igreja. Ele cruza dados de frequência, engajamento e datas sensíveis para identificar quem precisa de cuidado ANTES que a pessoa se afaste. Se um membro ativo parou de vir à célula, se um dizimista parou de contribuir, se está chegando o aniversário de um falecimento na família — o agente detecta e avisa o pastor. Todo começo de semana, gera a lista "quem precisa de cuidado" com prioridade e contexto. Para aconselhamentos, mantém histórico confidencial que só o pastor vê.',
  features          = '["Detecta membros em risco cruzando: frequência + engajamento + mudança de comportamento","Lista semanal quem precisa de cuidado priorizada por urgência","Alerta sobre datas sensíveis: aniversário de falecimento, divórcio recente, internação","Acompanha pós-aconselhamento com lembretes confidenciais para o pastor","Identifica padrões: membros de um departamento se afastando pode indicar problema de liderança","Sugere visitas pastorais com contexto completo do membro","Histórico de acompanhamento 100% confidencial — apenas o pastor admin vê","Diferencia afastamento temporário (viagem, doença) de afastamento real"]'::jsonb,
  pain_solved       = 'Membros se afastam silenciosamente e a igreja só percebe quando já é tarde.',
  without_me        = 'Sem o Cuidado, o pastor depende de líderes para reportar problemas. Muitas situações passam despercebidas até a pessoa sumir completamente.'
WHERE slug = 'agent-cuidado';

UPDATE agents_catalog SET
  name              = 'Métricas Pastorais',
  short_description = 'Dashboard inteligente que traduz números em linguagem pastoral e mostra tendências da igreja.',
  full_description  = 'O agente de Métricas Pastorais transforma dados frios em visão pastoral. Em vez de mostrar "KPI de retenção caiu 12%", ele diz "a igreja perdeu 15 membros este mês — a maioria saiu da célula do bairro Centro". Ele compara trimestres, identifica tendências e gera insights acionáveis. Se a consolidação caiu, ele mostra onde está o gargalo. Se uma célula cresceu muito, ele destaca como modelo. O pastor não precisa ser analista de dados — o agente traduz tudo em linguagem que faz sentido para a operação pastoral.',
  features          = '["Dashboard com linguagem pastoral (não corporativa)","Comparativo trimestral automático: crescimento, consolidação, batismos","Insights acionáveis: destaca células que cresceram para entender o que funcionou","Detecção de tendências negativas antes que virem problemas","Ranking de células: as que mais crescem, as que mais perdem, as estagnadas","Métricas por sede para igrejas multi-campus","Acompanhamento de metas pastorais com progresso visual"]'::jsonb,
  pain_solved       = 'O pastor não tem visão clara de como a igreja está crescendo (ou não).',
  without_me        = 'Sem Métricas, as decisões são baseadas em percepção e achismo, não em dados reais.'
WHERE slug = 'agent-metricas';

UPDATE agents_catalog SET
  name              = 'Relatórios',
  short_description = 'Gera relatórios automáticos semanais e mensais para o pastor e para o conselho da igreja.',
  full_description  = 'O agente de Relatórios tira do pastor o trabalho de preparar prestação de contas. Toda segunda-feira às 7h, o pastor recebe no WhatsApp um resumo da semana: visitantes, consolidação, frequência das células, dízimos, alertas. No primeiro dia útil de cada mês, um relatório completo em PDF é gerado automaticamente para o conselho da igreja — com gráficos, comparativos, metas vs realizado e recomendações. O pastor não precisa abrir o sistema nem montar apresentação: está tudo pronto para imprimir ou enviar.',
  features          = '["Resumo semanal automático no WhatsApp do pastor toda segunda às 7h","Relatório mensal em PDF profissional para o conselho da igreja","Gráficos de evolução: membros, células, dízimos, batismos","Comparativo mês a mês e trimestre a trimestre","Metas vs realizado com indicador visual (verde/amarelo/vermelho)","Recomendações pastorais baseadas nos dados","Enviado automaticamente — zero trabalho manual"]'::jsonb,
  pain_solved       = 'O pastor gasta horas preparando relatório para o conselho e muitas vezes não tem os números atualizados.',
  without_me        = 'Sem Relatórios, a prestação de contas é manual, incompleta e atrasada. O conselho não tem visão clara da igreja.'
WHERE slug = 'agent-relatorios';

UPDATE agents_catalog SET
  name              = 'Propostas e Eventos',
  short_description = 'Cria convites personalizados, gerencia inscrições e controla logística de conferências, retiros e eventos.',
  full_description  = 'O agente de Propostas e Eventos é o organizador que a igreja sempre precisou. Quando tem uma conferência, retiro ou evento especial, ele cria convites personalizados e envia segmentado — jovens recebem o convite do retiro de jovens, casais recebem o do encontro de casais. Ele controla inscrições com formulário online, gerencia vagas, envia lembrete 48h antes, e depois do evento faz pesquisa de satisfação. Tudo automático.',
  features          = '["Convites personalizados por departamento, célula ou sede","Página de inscrição online com controle de vagas","Lembrete automático 48h antes do evento","Pesquisa de satisfação pós-evento","Gestão de logística: local, horário, palestrantes, alimentação","Histórico de eventos com comparativo de participação"]'::jsonb,
  pain_solved       = 'Organizar eventos grandes é caótico — convites manuais, sem controle de inscrição, sem saber quantos vão.',
  without_me        = 'Sem o agente, cada evento é uma correria. Convites esquecidos, vagas descontroladas, gente que não sabia do evento.'
WHERE slug = 'agent-proposta';

UPDATE agents_catalog SET
  name              = 'Cadastro Inteligente',
  short_description = 'Digitaliza cartões de visitante automaticamente e completa dados faltantes com inteligência.',
  full_description  = 'O agente de Cadastro Inteligente elimina o trabalho braçal de digitar fichas. A recepcionista tira foto do cartão de visitante e o agente extrai nome, telefone, endereço automaticamente via OCR. Ele autocompleta o CEP com bairro e cidade, sugere a célula mais próxima pelo endereço, e detecta se a pessoa já visitou antes (evita cadastro duplicado). Se faltou algum dado, ele manda mensagem pro visitante pedindo gentilmente.',
  features          = '["Foto do cartão de visitante → dados extraídos automaticamente (OCR)","Autocomplete de endereço pelo CEP","Sugere célula mais próxima baseado no bairro","Detecta cadastro duplicado (mesma pessoa que visitou antes)","Solicita dados faltantes via WhatsApp de forma gentil","Importação em massa de planilhas Excel com limpeza automática"]'::jsonb,
  pain_solved       = 'Cadastrar visitantes manualmente é lento e cheio de erro. Dados ficam incompletos.',
  without_me        = 'Sem o Cadastro, a secretária digita tudo na mão. Erros de digitação, dados incompletos, duplicatas no sistema.'
WHERE slug = 'agent-cadastro';

UPDATE agents_catalog SET
  name              = 'Onboarding de Líderes',
  short_description = 'Guia novos líderes e supervisores no uso do sistema passo a passo, sem precisar de treinamento presencial.',
  full_description  = 'O agente de Onboarding de Líderes é o treinador pessoal de cada pessoa que recebe acesso ao sistema. Quando um novo líder de célula entra, o agente guia: "Aqui você registra presença da célula", "Aqui você vê seus membros", "Quando alguém faltar 2 vezes, você vai receber um alerta aqui". Cada pessoa aprende no seu ritmo, sem precisar de reunião de treinamento. Resultado: zero chamados de não sei usar.',
  features          = '["Tour guiado personalizado por role (líder vê uma coisa, secretária vê outra)","Passo a passo interativo: como registrar presença, como ver membros, como usar filtros","Dicas contextuais que aparecem na primeira vez que o usuário acessa cada tela","Checklist de primeiros passos com progresso","Responde dúvidas sobre funcionalidades específicas","Reduz chamados de suporte em 70%"]'::jsonb,
  pain_solved       = 'Líderes recebem acesso ao sistema e não sabem usar. Ligam pedindo ajuda toda hora.',
  without_me        = 'Sem o Onboarding, cada novo líder precisa de treinamento presencial. Com dezenas de líderes, isso consome semanas.'
WHERE slug = 'agent-onboarding';

UPDATE agents_catalog SET
  name              = 'Financeiro Pastoral',
  short_description = 'Controla dízimos e ofertas por membro, gera relatórios financeiros e detecta quedas na contribuição.',
  full_description  = 'O agente Financeiro Pastoral dá ao tesoureiro e ao pastor visão total sobre a saúde financeira da igreja. Ele registra cada dízimo e oferta por membro (com sigilo total — só admin e tesoureiro veem), detecta quando um dizimista fiel parou de contribuir, gera recibo automático, e produz o DRE (Demonstrativo de Resultado) simplificado mensal para o conselho. Integra com Pix para identificar contribuições automaticamente.',
  features          = '["Registro de dízimos e ofertas por membro com sigilo total","Detecção automática de dizimista que parou de contribuir (alerta discreto ao pastor)","Recibo digital de contribuição enviado automaticamente","DRE simplificado mensal para o conselho da igreja","Comparativo financeiro mês a mês e ano a ano","Integração com Pix para identificar contribuições","Relatório de campanhas financeiras (construção, missões, ação social)","Dados financeiros visíveis APENAS para admin e tesoureiro (RLS no banco)"]'::jsonb,
  pain_solved       = 'O tesoureiro anota tudo numa planilha e ninguém sabe quem são os dizimistas fiéis. Só sabe o total do mês.',
  without_me        = 'Sem o Financeiro, a gestão de dízimos é no escuro. Sem saber quem contribui, sem recibo, sem DRE para o conselho.'
WHERE slug = 'agent-financeiro';

UPDATE agents_catalog SET
  name              = 'Conteúdo Pastoral',
  short_description = 'Gera devocional diário, posts para Instagram e sugere temas de pregação baseado no calendário litúrgico.',
  full_description  = 'O agente de Conteúdo Pastoral resolve o problema de presença digital da igreja. Ele gera devocional diário personalizado que pode ser enviado aos membros via WhatsApp. Cria posts para o Instagram da igreja com arte e legenda prontos para publicar. Sugere temas de pregação baseado no calendário litúrgico e nos eventos da igreja. Adapta linguagem por público — o que vai pros jovens é diferente do que vai pros adultos.',
  features          = '["Devocional diário personalizado para enviar aos membros","Posts para Instagram com arte + legenda prontos para publicar","Sugestão de temas de pregação baseado no calendário litúrgico","Roteiro de live semanal com estrutura e pontos de interação","Adaptação de linguagem por público (jovens, adultos, melhor idade)","Calendário editorial mensal sugerido automaticamente"]'::jsonb,
  pain_solved       = 'A igreja não tem presença digital consistente porque o pastor não tem tempo de criar conteúdo.',
  without_me        = 'Sem Conteúdo, o Instagram fica parado semanas, não tem devocional regular, e a igreja é invisível online.'
WHERE slug = 'agent-conteudo';

UPDATE agents_catalog SET
  name              = 'Escalas',
  short_description = 'Gera escalas automáticas de louvor, mídia, recepção e outros departamentos sem conflito de horários.',
  full_description  = 'O agente de Escalas acaba com a dor de montar escala toda semana. Ele gera automaticamente as escalas de louvor, mídia, recepção, som e infantil respeitando a disponibilidade de cada voluntário. Não repete a mesma pessoa toda semana, detecta conflito de horário, e envia a escala por WhatsApp 48h antes do culto. Se alguém precisa trocar, o voluntário solicita no sistema e o agente encontra substituto com aprovação do líder.',
  features          = '["Geração automática de escalas por departamento","Respeita disponibilidade cadastrada de cada voluntário","Evita repetir a mesma pessoa em semanas consecutivas","Detecta conflito de horário entre departamentos","Envia escala por WhatsApp 48h antes do culto","Sistema de troca entre voluntários com aprovação do líder","Histórico de escalas para análise de participação"]'::jsonb,
  pain_solved       = 'Montar escala toda semana é um inferno. Sempre falta alguém, sempre tem conflito.',
  without_me        = 'Sem Escalas, o líder de louvor gasta horas no WhatsApp perguntando quem pode. Sempre tem surpresa no domingo.'
WHERE slug = 'agent-escalas';

UPDATE agents_catalog SET
  name              = 'Formação',
  short_description = 'Gerencia turmas da Escola da Fé, EBD e cursos com inscrição, presença, material e certificado digital.',
  full_description  = 'O agente de Formação é o coordenador pedagógico da igreja. Ele gerencia turmas da Escola da Fé de ponta a ponta: inscrição online, controle de presença, envio de material de estudo semanal, detecção de alunos em risco de evasão (2 faltas seguidas) e geração de certificado digital na conclusão. Também gerencia a EBD (Escola Bíblica Dominical) com frequência e conteúdo programático.',
  features          = '["Inscrição online para Escola da Fé e cursos","Controle de presença por aula com relatório","Envio de material de estudo semanal para os alunos","Detecção de alunos em risco de evasão (2+ faltas)","Certificado digital automático na conclusão","Gestão de EBD com frequência e conteúdo","Notificação ao pastor quando aluno desiste"]'::jsonb,
  pain_solved       = 'A Escola da Fé perde alunos no meio e ninguém acompanha. Certificados são feitos à mão.',
  without_me        = 'Sem Formação, alunos desistem sem ninguém perceber, presença é no papel, e certificado é manual.'
WHERE slug = 'agent-formacao';

UPDATE agents_catalog SET
  name              = 'Missões e Social',
  short_description = 'Gerencia projetos missionários e de ação social com orçamento, timeline e prestação de contas.',
  full_description  = 'O agente de Missões e Social organiza tudo que a igreja faz fora dos muros. Ele gerencia projetos sociais e missionários com metas, orçamento e cronograma. Controla doações específicas (campanha de Natal, missão transcultural), acompanha missionários em campo com relatório mensal, e gera prestação de contas transparente para a igreja. Também identifica voluntários com perfil missionário baseado nos dons cadastrados no CRM.',
  features          = '["Gestão de projetos sociais com metas, orçamento e timeline","Controle de doações específicas por campanha","Acompanhamento de missionários em campo com relatório mensal","Prestação de contas transparente para a congregação","Identificação de voluntários com perfil missionário","Relatório de impacto social (famílias atendidas, cestas entregues, etc.)"]'::jsonb,
  pain_solved       = 'Não tem controle de quanto a igreja gasta em missões e ações sociais. Prestação de contas é vaga.',
  without_me        = 'Sem Missões, os projetos sociais ficam desorganizados, doações sem rastreio, e a congregação não sabe o impacto.'
WHERE slug = 'agent-missoes';

-- ============================================================
-- ROLLBACK (executar manualmente se necessário)
-- ============================================================

-- DROP FUNCTION IF EXISTS validate_session_token(TEXT);
-- DROP FUNCTION IF EXISTS upsert_session_token(UUID);
-- DROP TABLE IF EXISTS session_tokens CASCADE;
-- DROP TABLE IF EXISTS invoices CASCADE;
-- DROP TABLE IF EXISTS subscription_agents CASCADE;
-- DROP TABLE IF EXISTS subscriptions CASCADE;
-- DROP TABLE IF EXISTS agents_catalog CASCADE;
-- DROP TABLE IF EXISTS addons CASCADE;
-- DROP TABLE IF EXISTS plans CASCADE;
-- DROP TYPE IF EXISTS agent_pricing_tier;
