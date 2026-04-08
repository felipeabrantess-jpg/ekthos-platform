-- =============================================================================
-- Migration 00006: Expansão Modular — Líderes, Células, Ministérios,
--                  Voluntários, Escalas, Agenda, Gabinete Pastoral, Financeiro
-- =============================================================================
-- Todas as tabelas seguem os padrões multi-tenant da plataforma:
--   - church_id NOT NULL com FK para churches
--   - RLS habilitado com política por tenant (auth_church_id())
--   - Índices de performance por church_id
--   - Comentários em português
-- =============================================================================

-- -----------------------------------------------------------------------------
-- TABELA: leaders
-- Registra os líderes de uma igreja (pastores, presbíteros, diáconos,
-- líderes de célula e de ministério). Uma pessoa só pode ter 1 registro
-- de liderança por igreja (UNIQUE church_id, person_id).
-- A FK para ministries é adicionada via ALTER após a criação de ministries.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS leaders (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id    UUID        NOT NULL REFERENCES people(id)  ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'lider',
  -- role: 'pastor_titular', 'pastor_auxiliar', 'presbitero', 'diacono',
  --        'lider_celula', 'lider_ministerio', 'coordenador'
  ministry_id  UUID,
  -- FK adicionada depois da criação de ministries (ver ALTER TABLE abaixo)
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT leaders_church_person_unique UNIQUE (church_id, person_id)
);

COMMENT ON TABLE leaders IS
  'Líderes da igreja: pastores, presbíteros, diáconos, líderes de célula e ministério.';

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER leaders_updated_at
  BEFORE UPDATE ON leaders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_leaders_church_id   ON leaders (church_id);
CREATE INDEX IF NOT EXISTS idx_leaders_person_id   ON leaders (person_id);
CREATE INDEX IF NOT EXISTS idx_leaders_ministry_id ON leaders (ministry_id);
CREATE INDEX IF NOT EXISTS idx_leaders_is_active   ON leaders (church_id, is_active);

-- RLS
ALTER TABLE leaders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leaders_tenant_select" ON leaders
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "leaders_service_all" ON leaders
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- TABELA: ministries
-- Ministérios da igreja (louvor, infantil, jovens, recepção, mídia, etc.).
-- Cada ministério tem um líder responsável e pertence a um único tenant.
-- slug deve ser único por igreja para facilitar referência via API.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ministries (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  slug         TEXT        NOT NULL,
  -- Ex: 'louvor', 'infantil', 'jovens', 'recepcao', 'midia', 'intercessao'
  description  TEXT,
  leader_id    UUID        REFERENCES leaders(id) ON DELETE SET NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ministries_church_slug_unique UNIQUE (church_id, slug)
);

COMMENT ON TABLE ministries IS
  'Ministérios da igreja. Cada ministério tem líder, slug único por tenant e pode estar ativo ou inativo.';

CREATE TRIGGER ministries_updated_at
  BEFORE UPDATE ON ministries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_ministries_church_id  ON ministries (church_id);
CREATE INDEX IF NOT EXISTS idx_ministries_leader_id  ON ministries (leader_id);
CREATE INDEX IF NOT EXISTS idx_ministries_is_active  ON ministries (church_id, is_active);

-- RLS
ALTER TABLE ministries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ministries_tenant_select" ON ministries
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "ministries_service_all" ON ministries
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- FK de leaders.ministry_id → ministries
-- Adicionada após criação de ministries para evitar dependência circular.
-- -----------------------------------------------------------------------------
ALTER TABLE leaders
  ADD CONSTRAINT leaders_ministry_id_fk
  FOREIGN KEY (ministry_id) REFERENCES ministries(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- TABELA: cells
-- Células da igreja (grupos pequenos). Cada célula tem um líder, dia e
-- horário de reunião, endereço, região geográfica e capacidade máxima.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cells (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name            TEXT        NOT NULL,
  leader_id       UUID        REFERENCES leaders(id) ON DELETE SET NULL,
  meeting_day     TEXT,
  -- Valores: 'segunda','terca','quarta','quinta','sexta','sabado','domingo'
  meeting_time    TIME,
  meeting_address TEXT,
  region          TEXT,
  max_members     INTEGER     NOT NULL DEFAULT 15,
  is_active       BOOLEAN     NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cells IS
  'Células (grupos pequenos) da igreja. Cada célula tem líder, horário, endereço e região.';

CREATE TRIGGER cells_updated_at
  BEFORE UPDATE ON cells
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_cells_church_id   ON cells (church_id);
CREATE INDEX IF NOT EXISTS idx_cells_leader_id   ON cells (leader_id);
CREATE INDEX IF NOT EXISTS idx_cells_is_active   ON cells (church_id, is_active);
CREATE INDEX IF NOT EXISTS idx_cells_region      ON cells (church_id, region);

-- RLS
ALTER TABLE cells ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cells_tenant_select" ON cells
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "cells_service_all" ON cells
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- TABELA: cell_members
-- Membros de cada célula. Uma pessoa pode pertencer a uma única célula
-- por vez por tenant (UNIQUE church_id, cell_id, person_id).
-- role: 'membro', 'lider', 'hospedeiro', 'aprendiz'
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cell_members (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id  UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  cell_id    UUID        NOT NULL REFERENCES cells(id)   ON DELETE CASCADE,
  person_id  UUID        NOT NULL REFERENCES people(id)  ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'membro',
  -- role: 'membro', 'lider', 'hospedeiro', 'aprendiz'
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active  BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cell_members_unique UNIQUE (church_id, cell_id, person_id)
);

COMMENT ON TABLE cell_members IS
  'Membros de cada célula. Registra papel (membro, líder, hospedeiro, aprendiz) e data de ingresso.';

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_cell_members_church_id  ON cell_members (church_id);
CREATE INDEX IF NOT EXISTS idx_cell_members_cell_id    ON cell_members (church_id, cell_id);
CREATE INDEX IF NOT EXISTS idx_cell_members_person_id  ON cell_members (person_id);
CREATE INDEX IF NOT EXISTS idx_cell_members_is_active  ON cell_members (church_id, is_active);

-- RLS
ALTER TABLE cell_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cell_members_tenant_select" ON cell_members
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "cell_members_service_all" ON cell_members
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- TABELA: cell_reports
-- Relatórios de reunião de célula. Registra presença, visitantes,
-- convertidos, pedidos de oração e observações do líder.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cell_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  cell_id         UUID        NOT NULL REFERENCES cells(id)    ON DELETE CASCADE,
  leader_id       UUID        REFERENCES leaders(id) ON DELETE SET NULL,
  report_date     DATE        NOT NULL,
  total_present   INTEGER     NOT NULL DEFAULT 0,
  visitors_count  INTEGER     NOT NULL DEFAULT 0,
  new_converts    INTEGER     NOT NULL DEFAULT 0,
  prayer_requests TEXT,
  observations    TEXT,
  submitted_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cell_reports IS
  'Relatórios de reunião de célula: presença, visitantes, novos convertidos, pedidos de oração.';

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_cell_reports_church_id    ON cell_reports (church_id);
CREATE INDEX IF NOT EXISTS idx_cell_reports_cell_id      ON cell_reports (church_id, cell_id);
CREATE INDEX IF NOT EXISTS idx_cell_reports_report_date  ON cell_reports (church_id, report_date);
CREATE INDEX IF NOT EXISTS idx_cell_reports_leader_id    ON cell_reports (leader_id);

-- RLS
ALTER TABLE cell_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cell_reports_tenant_select" ON cell_reports
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "cell_reports_service_all" ON cell_reports
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- TABELA: volunteers
-- Voluntários por ministério. Uma pessoa pode ser voluntária em múltiplos
-- ministérios (linhas separadas). Registra função, habilidades e disponibilidade.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS volunteers (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    UUID        NOT NULL REFERENCES churches(id)    ON DELETE CASCADE,
  person_id    UUID        NOT NULL REFERENCES people(id)      ON DELETE CASCADE,
  ministry_id  UUID        NOT NULL REFERENCES ministries(id)  ON DELETE CASCADE,
  role         TEXT,
  -- Função específica dentro do ministério (texto livre)
  -- Ex: 'sonoplasta', 'recepcionista', 'lider de louvor', 'camera'
  skills       TEXT[]      NOT NULL DEFAULT '{}',
  -- Habilidades em texto livre por flexibilidade (sem enum)
  -- Ex: ['violao', 'teclado', 'camera', 'recepcao']
  availability JSONB       NOT NULL DEFAULT '{"days": [], "period": "any"}',
  -- availability: {"days": ["sabado","domingo"], "period": "manha|tarde|noite|any"}
  is_active    BOOLEAN     NOT NULL DEFAULT true,
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT volunteers_person_ministry_unique UNIQUE (church_id, person_id, ministry_id)
);

COMMENT ON TABLE volunteers IS
  'Voluntários por ministério. Uma pessoa pode ser voluntária em múltiplos ministérios.
   Skills são texto livre para flexibilidade por tenant. Availability é JSONB com dias e período.';

CREATE TRIGGER volunteers_updated_at
  BEFORE UPDATE ON volunteers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_volunteers_church_id    ON volunteers (church_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_ministry_id  ON volunteers (church_id, ministry_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_person_id    ON volunteers (person_id);
CREATE INDEX IF NOT EXISTS idx_volunteers_is_active    ON volunteers (church_id, is_active);

-- RLS
ALTER TABLE volunteers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "volunteers_tenant_select" ON volunteers
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "volunteers_service_all" ON volunteers
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- TABELA: service_schedules
-- Escalas de serviço por ministério. Cada escala pertence a um evento/culto
-- e tem um status de ciclo de vida: draft → published → confirmed | cancelled.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_schedules (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    UUID        NOT NULL REFERENCES churches(id)   ON DELETE CASCADE,
  ministry_id  UUID        NOT NULL REFERENCES ministries(id) ON DELETE CASCADE,
  event_name   TEXT        NOT NULL,
  event_date   DATE        NOT NULL,
  event_time   TIME,
  status       TEXT        NOT NULL DEFAULT 'draft',
  -- status: 'draft', 'published', 'confirmed', 'cancelled'
  notes        TEXT,
  created_by   UUID        REFERENCES people(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT service_schedules_status_check
    CHECK (status IN ('draft', 'published', 'confirmed', 'cancelled'))
);

COMMENT ON TABLE service_schedules IS
  'Escalas de serviço por ministério. Status: draft → published → confirmed | cancelled.
   Publicar a escala dispara notificação automática para os voluntários escalados.';

CREATE TRIGGER service_schedules_updated_at
  BEFORE UPDATE ON service_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_service_schedules_church_id    ON service_schedules (church_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_ministry_id  ON service_schedules (church_id, ministry_id);
CREATE INDEX IF NOT EXISTS idx_service_schedules_event_date   ON service_schedules (church_id, event_date);
CREATE INDEX IF NOT EXISTS idx_service_schedules_status       ON service_schedules (church_id, status);

-- RLS
ALTER TABLE service_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_schedules_tenant_select" ON service_schedules
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "service_schedules_service_all" ON service_schedules
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- TABELA: service_schedule_assignments
-- Atribuições de voluntários a uma escala. Status: pending → confirmed |
-- declined → replaced. Histórico é imutável (declined/replaced são registrados).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_schedule_assignments (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id    UUID        NOT NULL REFERENCES churches(id)          ON DELETE CASCADE,
  schedule_id  UUID        NOT NULL REFERENCES service_schedules(id) ON DELETE CASCADE,
  volunteer_id UUID        NOT NULL REFERENCES volunteers(id)        ON DELETE CASCADE,
  role         TEXT,
  -- Papel específico nesta escala (pode diferir do papel padrão do voluntário)
  status       TEXT        NOT NULL DEFAULT 'pending',
  -- status: 'pending', 'confirmed', 'declined', 'replaced'
  notified_at  TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schedule_assignments_status_check
    CHECK (status IN ('pending', 'confirmed', 'declined', 'replaced')),
  CONSTRAINT schedule_volunteer_unique UNIQUE (church_id, schedule_id, volunteer_id)
);

COMMENT ON TABLE service_schedule_assignments IS
  'Atribuições de voluntários a escalas de serviço. Histórico imutável:
   declined e replaced são registrados, não deletados. Rastreio completo de notificação e resposta.';

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_ssa_church_id     ON service_schedule_assignments (church_id);
CREATE INDEX IF NOT EXISTS idx_ssa_schedule_id   ON service_schedule_assignments (schedule_id);
CREATE INDEX IF NOT EXISTS idx_ssa_volunteer_id  ON service_schedule_assignments (volunteer_id);
CREATE INDEX IF NOT EXISTS idx_ssa_status        ON service_schedule_assignments (church_id, status);

-- RLS
ALTER TABLE service_schedule_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_schedule_assignments_tenant_select" ON service_schedule_assignments
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "service_schedule_assignments_service_all" ON service_schedule_assignments
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- TABELA: church_events
-- Agenda da igreja. Registra cultos, reuniões, células, retiros, conferências
-- e treinamentos. Suporta eventos recorrentes via JSONB de recorrência.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS church_events (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id      UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  title          TEXT        NOT NULL,
  description    TEXT,
  event_type     TEXT        NOT NULL DEFAULT 'culto',
  -- event_type: 'culto', 'reuniao', 'celula', 'retiro', 'conferencia', 'treinamento', 'outro'
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime   TIMESTAMPTZ,
  location       TEXT,
  is_public      BOOLEAN     NOT NULL DEFAULT true,
  recurrence     JSONB,
  -- recurrence: {"type": "weekly", "day": "domingo", "until": null}
  created_by     UUID        REFERENCES people(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE church_events IS
  'Agenda da igreja: cultos, reuniões, células, retiros, conferências, treinamentos.
   Suporta recorrência via JSONB. Eventos públicos são visíveis no portal da igreja.';

CREATE TRIGGER church_events_updated_at
  BEFORE UPDATE ON church_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_church_events_church_id      ON church_events (church_id);
CREATE INDEX IF NOT EXISTS idx_church_events_start_datetime ON church_events (church_id, start_datetime);
CREATE INDEX IF NOT EXISTS idx_church_events_event_type     ON church_events (church_id, event_type);
CREATE INDEX IF NOT EXISTS idx_church_events_is_public      ON church_events (church_id, is_public);

-- RLS
ALTER TABLE church_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "church_events_tenant_select" ON church_events
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "church_events_service_all" ON church_events
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- TABELA: pastoral_cabinet
-- Gabinete pastoral da igreja. Define a hierarquia e os membros do corpo
-- pastoral com ordem de exibição, biografia e foto.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pastoral_cabinet (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id   UUID        NOT NULL REFERENCES people(id)  ON DELETE CASCADE,
  role        TEXT        NOT NULL,
  -- role: 'pastor_titular', 'pastor_auxiliar', 'pastor_associado', 'presbitero', 'diacono'
  order_index INTEGER     NOT NULL DEFAULT 0,
  bio         TEXT,
  photo_url   TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pastoral_cabinet_church_person_unique UNIQUE (church_id, person_id)
);

COMMENT ON TABLE pastoral_cabinet IS
  'Gabinete pastoral da igreja. Define hierarquia, ordem de exibição, biografia e foto de cada membro.';

CREATE TRIGGER pastoral_cabinet_updated_at
  BEFORE UPDATE ON pastoral_cabinet
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_pastoral_cabinet_church_id   ON pastoral_cabinet (church_id);
CREATE INDEX IF NOT EXISTS idx_pastoral_cabinet_person_id   ON pastoral_cabinet (person_id);
CREATE INDEX IF NOT EXISTS idx_pastoral_cabinet_order_index ON pastoral_cabinet (church_id, order_index);
CREATE INDEX IF NOT EXISTS idx_pastoral_cabinet_is_active   ON pastoral_cabinet (church_id, is_active);

-- RLS
ALTER TABLE pastoral_cabinet ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pastoral_cabinet_tenant_select" ON pastoral_cabinet
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "pastoral_cabinet_service_all" ON pastoral_cabinet
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- TABELA: financial_campaigns
-- Campanhas financeiras da igreja (construção, missões, projetos especiais).
-- Cada campanha tem meta de arrecadação, período e status.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_campaigns (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID         NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name        TEXT         NOT NULL,
  description TEXT,
  goal_amount NUMERIC(12,2),
  start_date  DATE,
  end_date    DATE,
  is_active   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE financial_campaigns IS
  'Campanhas financeiras da igreja com meta de arrecadação, período e status.
   Doações podem ser vinculadas a campanhas para rastreio de progresso.';

CREATE TRIGGER financial_campaigns_updated_at
  BEFORE UPDATE ON financial_campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_financial_campaigns_church_id  ON financial_campaigns (church_id);
CREATE INDEX IF NOT EXISTS idx_financial_campaigns_is_active  ON financial_campaigns (church_id, is_active);
CREATE INDEX IF NOT EXISTS idx_financial_campaigns_start_date ON financial_campaigns (church_id, start_date);

-- RLS
ALTER TABLE financial_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financial_campaigns_tenant_select" ON financial_campaigns
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "financial_campaigns_service_all" ON financial_campaigns
  FOR ALL USING (auth.role() = 'service_role');

-- -----------------------------------------------------------------------------
-- TABELA: donations
-- Versão expandida de doações. Suporta múltiplos gateways, tipos de doação,
-- vinculação a campanhas e rastreio completo de status de pagamento.
-- Doação anônima: person_id = NULL é válido.
-- NUNCA processa pagamento — apenas registra e redireciona.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS donations (
  id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id              UUID         NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id              UUID         REFERENCES people(id) ON DELETE SET NULL,
  -- NULL = doação anônima (válido por design)
  type                   TEXT         NOT NULL DEFAULT 'oferta',
  -- type: 'dizimo', 'oferta', 'campanha', 'missoes', 'construcao'
  campaign_id            UUID         REFERENCES financial_campaigns(id) ON DELETE SET NULL,
  amount                 NUMERIC(12,2) NOT NULL,
  currency               TEXT         NOT NULL DEFAULT 'BRL',
  payment_method         TEXT,
  -- payment_method: 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'dinheiro', 'transferencia'
  gateway                TEXT,
  -- gateway: 'stripe', 'pagseguro', 'mercadopago', 'manual'
  gateway_transaction_id TEXT,
  -- UNIQUE por gateway para prevenir duplicata de webhook (ver índice abaixo)
  status                 TEXT         NOT NULL DEFAULT 'pending',
  -- status: 'pending', 'confirmed', 'failed', 'refunded', 'cancelled'
  confirmed_at           TIMESTAMPTZ,
  receipt_sent           BOOLEAN      NOT NULL DEFAULT false,
  receipt_sent_at        TIMESTAMPTZ,
  notes                  TEXT,
  created_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT donations_status_check
    CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded', 'cancelled')),
  CONSTRAINT donations_type_check
    CHECK (type IN ('dizimo', 'oferta', 'campanha', 'missoes', 'construcao'))
);

COMMENT ON TABLE donations IS
  'Doações recebidas pela igreja. Suporta múltiplos gateways, tipos e campanhas.
   Doação anônima (person_id=NULL) é válida por design.
   O sistema NUNCA processa pagamento — apenas registra e redireciona para o gateway.
   amount NUNCA é alterado após status=confirmed. Reembolso: status=refunded + audit_log.';

CREATE TRIGGER donations_updated_at
  BEFORE UPDATE ON donations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Índices de performance
CREATE INDEX IF NOT EXISTS idx_donations_church_id    ON donations (church_id);
CREATE INDEX IF NOT EXISTS idx_donations_status       ON donations (church_id, status);
CREATE INDEX IF NOT EXISTS idx_donations_person_id    ON donations (person_id);
CREATE INDEX IF NOT EXISTS idx_donations_campaign_id  ON donations (campaign_id);
CREATE INDEX IF NOT EXISTS idx_donations_confirmed_at ON donations (church_id, confirmed_at);
CREATE INDEX IF NOT EXISTS idx_donations_type         ON donations (church_id, type);

-- Índice único para prevenir duplicata de webhook por gateway
CREATE UNIQUE INDEX IF NOT EXISTS idx_donations_gateway_txn
  ON donations (gateway, gateway_transaction_id)
  WHERE gateway IS NOT NULL AND gateway_transaction_id IS NOT NULL;

-- RLS
ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "donations_tenant_select" ON donations
  FOR SELECT USING (church_id = auth_church_id());

CREATE POLICY "donations_service_all" ON donations
  FOR ALL USING (auth.role() = 'service_role');

-- =============================================================================
-- FIM DA MIGRATION 00006
-- Tabelas criadas: leaders, ministries, cells, cell_members, cell_reports,
--                  volunteers, service_schedules, service_schedule_assignments,
--                  church_events, pastoral_cabinet, financial_campaigns, donations
-- Total: 12 tabelas + FK circular leaders↔ministries resolvida via ALTER TABLE
-- =============================================================================
