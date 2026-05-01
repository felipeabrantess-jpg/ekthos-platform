-- =============================================================
-- AGENTES PREMIUM — SCHEMA DE CRÉDITOS (12 tabelas + RLS)
-- Sprint 1 — 30/04/2026
-- =============================================================

-- 1. Catálogo de planos de crédito
CREATE TABLE IF NOT EXISTS agent_credit_plans (
  slug text PRIMARY KEY,
  name text NOT NULL,
  monthly_price_cents int NOT NULL,
  monthly_credits int NOT NULL,
  applies_to text[] NOT NULL,
  active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agent_credit_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agent_credit_plans_public_read" ON agent_credit_plans
  FOR SELECT USING (active = true);

INSERT INTO agent_credit_plans (slug, name, monthly_price_cents, monthly_credits, applies_to, sort_order) VALUES
  ('avulso-acolhimento',   'Acolhimento Avulso',   29000,    600, ARRAY['agent-acolhimento'], 1),
  ('avulso-reengajamento', 'Reengajamento Avulso', 29000,    600, ARRAY['agent-reengajamento'], 2),
  ('avulso-operacao',      'Operação Avulso',      39000,    800, ARRAY['agent-operacao'], 3),
  ('pool-iniciante',       'Pool Iniciante',       69000,   2000, ARRAY['pool'], 10),
  ('pool-crescimento',     'Pool Crescimento',     99000,   4000, ARRAY['pool'], 11),
  ('pool-avivamento',      'Pool Avivamento',     169000,   7500, ARRAY['pool'], 12),
  ('pool-escala',          'Pool Escala',         249000,  12000, ARRAY['pool'], 13)
ON CONFLICT (slug) DO NOTHING;

-- 2. Pacotes de recarga
CREATE TABLE IF NOT EXISTS credit_packages (
  slug text PRIMARY KEY,
  name text NOT NULL,
  credits int NOT NULL,
  price_cents int NOT NULL,
  ttl_days int DEFAULT 90,
  applies_to text[] NOT NULL,
  visible_in_ui boolean DEFAULT true,
  active boolean DEFAULT true,
  sort_order int DEFAULT 0
);

ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_packages_public_read" ON credit_packages
  FOR SELECT USING (active = true AND visible_in_ui = true);

INSERT INTO credit_packages (slug, name, credits, price_cents, applies_to, sort_order) VALUES
  ('topup-emergencial', 'Recarga Emergencial', 100,  9900, ARRAY['*'], 1),
  ('topup-ponte',       'Recarga Ponte',       300, 26900, ARRAY['*'], 2)
ON CONFLICT (slug) DO NOTHING;

-- 3. Subscription do pool/agente por igreja
CREATE TABLE IF NOT EXISTS church_agent_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  plan_slug text NOT NULL REFERENCES agent_credit_plans(slug),
  current_cycle_start timestamptz NOT NULL DEFAULT now(),
  current_cycle_end timestamptz NOT NULL,
  active boolean DEFAULT true,
  paused_by_user boolean DEFAULT false,
  paused_by_quota boolean DEFAULT false,
  stripe_subscription_id text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (church_id, plan_slug)
);

CREATE INDEX IF NOT EXISTS idx_cas_church
ON church_agent_subscriptions(church_id) WHERE active = true;

ALTER TABLE church_agent_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cas_tenant_read" ON church_agent_subscriptions
  FOR SELECT USING (church_id = auth_church_id());

-- 4. Saldo de créditos
CREATE TABLE IF NOT EXISTS church_agent_credits (
  church_id uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  agent_scope text NOT NULL,
  cycle_credits numeric(10,2) NOT NULL DEFAULT 0,
  topup_credits numeric(10,2) NOT NULL DEFAULT 0,
  cycle_start timestamptz NOT NULL,
  cycle_end timestamptz NOT NULL,
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (church_id, agent_scope)
);

ALTER TABLE church_agent_credits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cac_tenant_read" ON church_agent_credits
  FOR SELECT USING (church_id = auth_church_id());

-- 5. Log de consumo
CREATE TABLE IF NOT EXISTS agent_credit_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  agent_slug text NOT NULL,
  operation_type text NOT NULL CHECK (operation_type IN ('message','extraction','synthesis','confirmation')),
  credits_consumed numeric(4,1) NOT NULL,
  source text NOT NULL CHECK (source IN ('cycle','topup')),
  related_entity_id uuid,
  description text,
  consumed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acu_church_date ON agent_credit_usage(church_id, consumed_at DESC);
CREATE INDEX IF NOT EXISTS idx_acu_agent ON agent_credit_usage(agent_slug, consumed_at DESC);

ALTER TABLE agent_credit_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acu_tenant_read" ON agent_credit_usage
  FOR SELECT USING (church_id = auth_church_id());

-- 6. Compras de recarga
CREATE TABLE IF NOT EXISTS credit_topup_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id),
  package_slug text NOT NULL REFERENCES credit_packages(slug),
  credits_purchased int NOT NULL,
  credits_remaining numeric(10,2) NOT NULL,
  purchase_price_cents int NOT NULL,
  expires_at timestamptz NOT NULL,
  stripe_invoice_id text,
  status text DEFAULT 'active' CHECK (status IN ('active','consumed','expired','refunded')),
  purchased_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctp_church_active
ON credit_topup_purchases(church_id) WHERE status = 'active';

ALTER TABLE credit_topup_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ctp_tenant_read" ON credit_topup_purchases
  FOR SELECT USING (church_id = auth_church_id());

-- 7. Alertas de threshold (idempotente por ciclo)
CREATE TABLE IF NOT EXISTS agent_credit_alerts (
  church_id uuid NOT NULL,
  agent_scope text NOT NULL,
  cycle_start timestamptz NOT NULL,
  threshold_70_at timestamptz,
  threshold_90_at timestamptz,
  threshold_100_at timestamptz,
  PRIMARY KEY (church_id, agent_scope, cycle_start)
);

ALTER TABLE agent_credit_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aca_tenant_read" ON agent_credit_alerts
  FOR SELECT USING (church_id = auth_church_id());

-- 8. Fila de mensagens pausadas por saldo
CREATE TABLE IF NOT EXISTS agent_pending_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  agent_slug text NOT NULL,
  scheduled_for timestamptz NOT NULL,
  payload jsonb NOT NULL,
  status text DEFAULT 'awaiting_credits' CHECK (status IN ('awaiting_credits','dispatched','expired','cancelled')),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_apm_status ON agent_pending_messages(status, scheduled_for);

ALTER TABLE agent_pending_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apm_tenant_read" ON agent_pending_messages
  FOR SELECT USING (church_id = auth_church_id());

-- 9. Configuração do prompt por igreja+agente (wizard Camada 4)
CREATE TABLE IF NOT EXISTS church_agent_config (
  church_id uuid NOT NULL,
  agent_slug text NOT NULL,
  formality text CHECK (formality IN ('formal','proximo','caloroso','casual')),
  denomination text,
  preferred_verses text[],
  forbidden_topics text[],
  pastoral_depth text CHECK (pastoral_depth IN ('reservado','equilibrado','pastoral')),
  first_contact_delay text CHECK (first_contact_delay IN ('same_day','d1','d2_d3')),
  send_window jsonb,
  emoji_usage text CHECK (emoji_usage IN ('none','discrete','free')),
  custom_overrides jsonb,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (church_id, agent_slug)
);

ALTER TABLE church_agent_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cac_config_tenant" ON church_agent_config
  FOR ALL USING (church_id = auth_church_id());

-- 10. Histórico versionado de configurações
CREATE TABLE IF NOT EXISTS church_agent_config_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL,
  agent_slug text NOT NULL,
  config_snapshot jsonb NOT NULL,
  changed_by uuid,
  change_reason text,
  changed_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cach_church
ON church_agent_config_history(church_id, changed_at DESC);

ALTER TABLE church_agent_config_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cach_tenant_read" ON church_agent_config_history
  FOR SELECT USING (church_id = auth_church_id());

-- 11. Canais WhatsApp por igreja
CREATE TABLE IF NOT EXISTS church_whatsapp_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  channel_type text NOT NULL CHECK (channel_type IN ('meta_cloud','zapi')),
  phone_number text NOT NULL,
  meta_phone_number_id text,
  meta_waba_id text,
  meta_access_token text,
  zapi_instance_id text,
  zapi_token text,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (church_id, channel_type)
);

ALTER TABLE church_whatsapp_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cwc_tenant_read" ON church_whatsapp_channels
  FOR SELECT USING (church_id = auth_church_id());

-- 12. Roteamento agente → canal
CREATE TABLE IF NOT EXISTS agent_channel_routing (
  agent_slug text PRIMARY KEY,
  channel_type text NOT NULL CHECK (channel_type IN ('meta_cloud','zapi'))
);

ALTER TABLE agent_channel_routing ENABLE ROW LEVEL SECURITY;
CREATE POLICY "acr_public_read" ON agent_channel_routing FOR SELECT USING (true);

INSERT INTO agent_channel_routing VALUES
  ('agent-acolhimento',   'meta_cloud'),
  ('agent-operacao',      'meta_cloud'),
  ('agent-reengajamento', 'zapi')
ON CONFLICT (agent_slug) DO NOTHING;
