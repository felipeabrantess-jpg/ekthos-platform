# Rule: Modelagem de CRM

> **Versão:** 1.0.0 | **Status:** Ativo — produção | **Revisão:** 2026-04-07

---

## 1. Modelo Central

O CRM do Ekthos segue um modelo relacional de quatro camadas:

```
PESSOA → INTERAÇÃO → PIPELINE → CONVERSÃO

people              interactions           person_pipeline       donations
├── Identidade      ├── Histórico          ├── Posição atual     ├── Registro
├── Contato         ├── Canal              ├── Stage ativo       ├── Tipo
├── Tags            ├── Tipo               ├── Timestamp         └── Status
└── external_ids    └── Content            └── moved_by

           ↑                    ↑
    (origem de dados)    (evidência de progresso)
```

**Princípio central:** toda ação relevante gera uma interação. Toda interação pode influenciar a posição no pipeline. Toda conversão (doação, cadastro, batismo) é rastreada.

---

## 2. Tabela people

### Schema completo

```sql
CREATE TABLE people (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id     UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,

  -- Dados de identidade
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,               -- formato internacional: +55119...
  cpf           TEXT,               -- armazenado criptografado (dado sensível LGPD)
  birth_date    DATE,
  gender        TEXT CHECK (gender IN ('masculino', 'feminino', 'nao_informado')),

  -- Dados de endereço (dados sensíveis LGPD)
  address       JSONB,              -- { logradouro, numero, bairro, cidade, uf, cep }

  -- Classificação e segmentação
  tags          JSONB NOT NULL DEFAULT '[]',    -- array de strings: ["membro", "lider", "novo_convertido"]
  member_status TEXT NOT NULL DEFAULT 'contato'
                CHECK (member_status IN ('contato', 'visitante', 'membro', 'lider', 'voluntario', 'inativo')),

  -- Referências externas (para sync com CRMs externos)
  external_ids  JSONB NOT NULL DEFAULT '{}',    -- { "hubspot": "id", "rd_station": "id" }

  -- Origem do cadastro
  origin_channel TEXT CHECK (origin_channel IN ('whatsapp', 'instagram', 'formulario', 'manual', 'importacao')),
  origin_campaign_id UUID REFERENCES campaigns(id),

  -- Metadados
  first_interaction_at TIMESTAMPTZ,
  last_interaction_at  TIMESTAMPTZ,
  anonymized_at        TIMESTAMPTZ,   -- preenchido quando dado é anonimizado (LGPD)

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_people" ON people
  USING (church_id = (SELECT church_id FROM profiles WHERE id = auth.uid()));

-- Índices para buscas frequentes
CREATE INDEX idx_people_church_id ON people(church_id);
CREATE INDEX idx_people_phone ON people(church_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_people_email ON people(church_id, email) WHERE email IS NOT NULL;
CREATE INDEX idx_people_tags ON people USING GIN(tags);
CREATE INDEX idx_people_member_status ON people(church_id, member_status);
CREATE INDEX idx_people_last_interaction ON people(church_id, last_interaction_at DESC);
```

### Quando criar vs atualizar

```typescript
async function upsertPerson(
  church_id: string,
  data: {
    phone?: string
    email?: string
    name: string
    origin_channel: string
    tags?: string[]
  }
): Promise<string> {  // retorna person_id
  // Busca por telefone primeiro (identificador mais confiável)
  if (data.phone) {
    const { data: existing } = await supabase
      .from('people')
      .select('id, tags')
      .eq('church_id', church_id)
      .eq('phone', data.phone)
      .single()

    if (existing) {
      // Atualiza: mescla tags, atualiza last_interaction_at
      const mergedTags = [...new Set([...(existing.tags ?? []), ...(data.tags ?? [])])]
      await supabase
        .from('people')
        .update({
          last_interaction_at: new Date().toISOString(),
          tags: mergedTags,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id)

      return existing.id
    }
  }

  // Cria novo contato
  const { data: created } = await supabase
    .from('people')
    .insert({
      church_id,
      name: data.name,
      phone: data.phone ?? null,
      email: data.email ?? null,
      tags: data.tags ?? [],
      origin_channel: data.origin_channel,
      first_interaction_at: new Date().toISOString(),
      last_interaction_at: new Date().toISOString()
    })
    .select('id')
    .single()

  return created!.id
}
```

---

## 3. Tabela interactions

### Schema completo

```sql
CREATE TABLE interactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id   UUID REFERENCES people(id) ON DELETE SET NULL,

  type        TEXT NOT NULL CHECK (type IN (
    'whatsapp', 'instagram', 'email', 'manual',
    'evento', 'doacao', 'formulario', 'ligacao'
  )),
  direction   TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'interno')),

  content     JSONB NOT NULL,  -- estrutura varia por tipo (ver abaixo)

  -- Metadados do canal
  channel_metadata JSONB,

  -- Agente ou usuário responsável
  actor_type  TEXT CHECK (actor_type IN ('agent', 'human', 'system')),
  actor_id    UUID REFERENCES profiles(id),  -- null se actor_type = 'agent'

  -- Rastreamento
  trace_id    TEXT,
  campaign_id UUID REFERENCES campaigns(id),

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_interactions" ON interactions
  USING (church_id = (SELECT church_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_interactions_church_person ON interactions(church_id, person_id, created_at DESC);
CREATE INDEX idx_interactions_type ON interactions(church_id, type);
CREATE INDEX idx_interactions_campaign ON interactions(campaign_id) WHERE campaign_id IS NOT NULL;
```

### Estrutura de content por tipo

```typescript
// WhatsApp / Instagram
const whatsappContent = {
  message_id: 'wamid.xxx',
  text: 'Texto da mensagem',
  intent: 'novo_visitante',
  confidence: 0.92,
  agent_response: 'Olá! Ficamos felizes com sua mensagem...',
  template_used: null  // ou nome do template se foi mensagem automatizada
}

// Manual (registrada por humano no painel)
const manualContent = {
  note: 'Visitou o culto hoje. Demonstrou interesse em célula.',
  summary: 'Primeira visita',
  next_action: 'Convidar para célula do bairro'
}

// Evento
const eventoContent = {
  event_name: 'Culto de Domingo',
  event_date: '2026-04-06',
  attendance: 'confirmed' | 'attended' | 'absent',
  confirmed_via: 'whatsapp'
}

// Doação
const doacaoContent = {
  donation_id: 'uuid',
  amount: 150.00,
  type: 'dizimo',
  payment_method: 'pix',
  receipt_sent: true
}
```

---

## 4. Pipeline

### Schema

```sql
-- Stages são configuráveis por tenant
CREATE TABLE pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,              -- nome customizado pelo tenant
  slug        TEXT NOT NULL,             -- identificador interno: 'visitante', 'membro'
  description TEXT,
  position    INTEGER NOT NULL,          -- ordem no funil
  color       TEXT,                      -- cor no dashboard
  auto_actions JSONB NOT NULL DEFAULT '[]',  -- ações automáticas ao entrar no stage
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (church_id, slug)
);

-- Posição de cada pessoa no pipeline
CREATE TABLE person_pipeline (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  stage_id    UUID NOT NULL REFERENCES pipeline_stages(id),
  entered_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  moved_by    UUID REFERENCES profiles(id),  -- null se movido por automação
  moved_reason TEXT,
  UNIQUE (church_id, person_id)   -- uma pessoa está em apenas um stage por vez
);

ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_stages" ON pipeline_stages
  USING (church_id = (SELECT church_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "tenant_isolation_person_pipeline" ON person_pipeline
  USING (church_id = (SELECT church_id FROM profiles WHERE id = auth.uid()));
```

### Transição entre stages

```typescript
async function movePipelineStage(
  church_id: string,
  person_id: string,
  new_stage_slug: string,
  moved_by: string | null,  // null = automação
  reason: string
): Promise<void> {
  // 1. Busca o stage pelo slug
  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id, name, auto_actions')
    .eq('church_id', church_id)
    .eq('slug', new_stage_slug)
    .single()

  if (!stage) throw new Error(`Stage '${new_stage_slug}' não encontrado`)

  // 2. Upsert na posição do pipeline
  await supabase
    .from('person_pipeline')
    .upsert({
      church_id,
      person_id,
      stage_id: stage.id,
      entered_at: new Date().toISOString(),
      moved_by,
      moved_reason: reason
    }, { onConflict: 'church_id,person_id' })

  // 3. Registra em interactions como evidência
  await supabase.from('interactions').insert({
    church_id,
    person_id,
    type: 'manual',
    direction: 'interno',
    content: {
      event: 'pipeline_stage_change',
      new_stage: new_stage_slug,
      reason
    },
    actor_type: moved_by ? 'human' : 'system',
    actor_id: moved_by
  })

  // 4. Dispara ações automáticas do stage (via n8n)
  if (stage.auto_actions?.length > 0) {
    await triggerStageAutoActions(church_id, person_id, stage.auto_actions)
  }
}
```

---

## 5. Tags

### Sistema de segmentação flexível

Tags são arrays de strings em `people.tags`. Seguem convenção de nomenclatura padronizada:

```
Prefixos padrão:
  origem:{canal}      → origem:whatsapp, origem:instagram, origem:formulario
  grupo:{nome}        → grupo:celula-asa-norte, grupo:jovens
  interesse:{tema}    → interesse:batismo, interesse:voluntariado
  status:{estado}     → status:novo-convertido, status:em-discipulado
  externo:{sistema}   → externo:hubspot, externo:rd_station (com ID)
  campanha:{slug}     → campanha:pascoa-2026

Sem prefixo (tags livres do admin):
  visitante-2025, lider-potencial, ativo, inativo
```

### Queries de segmentação

```sql
-- Pessoas com tag específica
SELECT p.*
FROM people p
WHERE p.church_id = $church_id
  AND p.tags @> '["grupo:jovens"]'::jsonb;

-- Pessoas com múltiplas tags (AND)
SELECT p.*
FROM people p
WHERE p.church_id = $church_id
  AND p.tags @> '["membro", "grupo:jovens"]'::jsonb;

-- Pessoas com qualquer uma das tags (OR)
SELECT p.*
FROM people p
WHERE p.church_id = $church_id
  AND p.tags ?| array['lider', 'voluntario'];

-- Segmentação por inatividade + tag
SELECT p.*
FROM people p
WHERE p.church_id = $church_id
  AND p.member_status = 'membro'
  AND p.last_interaction_at < NOW() - INTERVAL '30 days'
  AND NOT (p.tags @> '["inativo"]'::jsonb);
```

---

## 6. Jornada Padrão

```
VISITANTE → MEMBRO → LÍDER → VOLUNTÁRIO

Transições automáticas (configuráveis por tenant):
  visitante  → membro     : 3 presenças confirmadas
                            ou 1 cadastro voluntário
                            ou 1 batismo
  membro     → lider      : marcado manualmente por admin
                            ou indicação do pastor
  lider      → voluntario : qualquer lider pode ser voluntário (role adicional, não substitui)

Transições de saída:
  qualquer → inativo : sem interação há {X} dias (padrão: 90)
                       acionado via workflow n8n 'pipeline-sem-movimento'
  inativo  → membro  : retorno confirmado (nova interação registrada)
```

### Auto-actions por stage

```json
// Configurado em pipeline_stages.auto_actions
[
  {
    "type": "send_message",
    "template": "welcome_new_member",
    "delay_hours": 24
  },
  {
    "type": "notify_leader",
    "role": "lider",
    "message": "Novo membro registrado: {person.name}"
  },
  {
    "type": "add_tag",
    "tag": "membro"
  }
]
```

---

## 7. Integração com CRMs Externos

### Mapeamento de campos

```typescript
// HubSpot → Ekthos
const HUBSPOT_TO_EKTHOS: Record<string, string> = {
  'firstname': 'name_first',
  'lastname': 'name_last',
  'email': 'email',
  'phone': 'phone',
  'hs_lead_status': 'member_status',  // mapeamento customizado por tenant
  'city': 'address.cidade'
}

// Ekthos → HubSpot (sync bidirecional)
const EKTHOS_TO_HUBSPOT: Record<string, string> = {
  'name': 'fullname_composed',
  'email': 'email',
  'phone': 'phone',
  'member_status': 'hs_lead_status'
}
```

### Resolução de conflitos

```
REGRA: Ekthos é sempre a fonte de verdade para dados de membros.

Conflito detectado (dado diferente no CRM externo vs Ekthos):
  1. Registra conflito em audit_logs com os dois valores
  2. Mantém o valor do Ekthos
  3. Atualiza o CRM externo com o valor do Ekthos
  4. NÃO atualiza o Ekthos com o valor do CRM externo sem confirmação humana

Exceção: se o dado no Ekthos é NULL e o CRM tem um valor → importa do CRM
```

---

## 8. Modelo Financeiro

### Schema

```sql
CREATE TABLE donations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  person_id       UUID REFERENCES people(id) ON DELETE SET NULL,

  amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  currency        TEXT NOT NULL DEFAULT 'BRL',
  type            TEXT NOT NULL CHECK (type IN ('dizimo', 'oferta', 'campanha', 'missoes', 'outros')),

  payment_method  TEXT CHECK (payment_method IN ('pix', 'cartao_credito', 'cartao_debito', 'dinheiro', 'boleto', 'transferencia')),
  gateway         TEXT CHECK (gateway IN ('stripe', 'pagseguro', 'mercadopago', 'manual')),
  gateway_txn_id  TEXT,            -- ID da transação no gateway externo (idempotência)

  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'failed', 'refunded', 'cancelled')),

  campaign_id     UUID REFERENCES campaigns(id),

  -- Comprovante
  receipt_url     TEXT,            -- URL do comprovante gerado (Supabase Storage)
  receipt_sent_at TIMESTAMPTZ,

  -- Metadados
  notes           TEXT,
  confirmed_at    TIMESTAMPTZ,
  refunded_at     TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (gateway, gateway_txn_id)  -- idempotência por transação do gateway
);

ALTER TABLE donations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_donations" ON donations
  USING (church_id = (SELECT church_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX idx_donations_church_id ON donations(church_id);
CREATE INDEX idx_donations_person_id ON donations(church_id, person_id);
CREATE INDEX idx_donations_status ON donations(church_id, status, created_at DESC);
CREATE INDEX idx_donations_type ON donations(church_id, type, created_at DESC);
```

---

## 9. LGPD

### Dados sensíveis que exigem tratamento especial

| Campo | Tabela | Classificação LGPD | Tratamento |
|---|---|---|---|
| `cpf` | people | Dado pessoal sensível | Criptografado em repouso (pgcrypto) |
| `phone` | people | Dado pessoal | Mascarado em logs: `+5511*****1234` |
| `email` | people | Dado pessoal | Mascarado em logs: `j***@gmail.com` |
| `address` | people | Dado pessoal | Mascarado em logs, anonimizado no esquecimento |
| `birth_date` | people | Dado pessoal | Exibido apenas com permissão de admin |
| `amount` | donations | Dado financeiro | Visível apenas para admin e o próprio doador |
| `gateway_txn_id` | donations | Dado financeiro | Nunca em logs não estruturados |

### Mascaramento em logs

```typescript
function maskPersonData(person: Partial<Person>): Record<string, unknown> {
  return {
    ...person,
    phone: person.phone ? `${person.phone.slice(0, 5)}*****${person.phone.slice(-4)}` : null,
    email: person.email ? `${person.email[0]}***@${person.email.split('@')[1]}` : null,
    cpf: person.cpf ? '***.***.***-**' : null,
    address: person.address ? { cidade: (person.address as any).cidade, uf: (person.address as any).uf } : null
  }
}
```

### Direito ao esquecimento

```sql
-- Anonimiza dados pessoais mantendo estrutura para auditoria
UPDATE people
SET
  name         = 'Pessoa Anonimizada',
  email        = NULL,
  phone        = NULL,
  cpf          = NULL,
  birth_date   = NULL,
  address      = NULL,
  tags         = '["anonimizado"]',
  external_ids = '{}',
  anonymized_at = NOW(),
  updated_at   = NOW()
WHERE church_id = $church_id
  AND id = $person_id;

-- Registra a ação (mantém o registro de que houve uma anonimização)
INSERT INTO audit_logs (church_id, action, actor, metadata, severity)
VALUES (
  $church_id,
  'person.anonymized',
  $requested_by,
  jsonb_build_object(
    'person_id', $person_id,
    'reason', 'lgpd_request',
    'requested_at', NOW()
  ),
  'info'
);
```

---

## 10. Regras Numeradas

```
CRM-01: Toda query em people, interactions e donations DEVE incluir church_id no WHERE
CRM-02: Dados pessoais (CPF, telefone, endereço) são mascarados em todos os logs
CRM-03: Criação de pessoa via upsert — nunca duplica por telefone ou e-mail
CRM-04: Toda interação é registrada em interactions ANTES da ação correspondente
CRM-05: Pipeline usa UPSERT em person_pipeline — uma pessoa está em apenas um stage
CRM-06: Tags seguem convenção de prefixo — tags livres são permitidas mas documentadas
CRM-07: Ekthos é sempre fonte de verdade — CRM externo é sincronizado a partir do Ekthos
CRM-08: Transações financeiras têm idempotência garantida via UNIQUE em gateway_txn_id
CRM-09: Direito ao esquecimento = anonimização, não delete — estrutura de auditoria preservada
CRM-10: Dados financeiros de doadores são visíveis apenas para admin e o próprio doador via RLS
CRM-11: member_status é derivado de regras de negócio — não é editado manualmente sem log
CRM-12: Conflitos de sync com CRM externo são registrados em audit_logs e resolvidos mantendo o dado Ekthos
```

---

## 11. Exemplos de Queries SQL Comuns

```sql
-- 1. Pessoas inativas há 30+ dias (para workflow de follow-up)
SELECT p.id, p.name, p.phone, p.last_interaction_at,
       ps.name as current_stage
FROM people p
LEFT JOIN person_pipeline pp ON pp.person_id = p.id AND pp.church_id = p.church_id
LEFT JOIN pipeline_stages ps ON ps.id = pp.stage_id
WHERE p.church_id = $church_id
  AND p.anonymized_at IS NULL
  AND p.last_interaction_at < NOW() - INTERVAL '30 days'
  AND p.member_status NOT IN ('inativo', 'contato')
ORDER BY p.last_interaction_at ASC;

-- 2. Dashboard de doações do mês (com total por tipo)
SELECT
  type,
  COUNT(*) as count,
  SUM(amount) as total,
  AVG(amount) as avg
FROM donations
WHERE church_id = $church_id
  AND status = 'confirmed'
  AND created_at >= date_trunc('month', NOW())
  AND created_at < date_trunc('month', NOW()) + INTERVAL '1 month'
GROUP BY type
ORDER BY total DESC;

-- 3. Funil de pipeline (quantas pessoas em cada stage)
SELECT
  ps.name as stage,
  ps.position,
  COUNT(pp.person_id) as people_count
FROM pipeline_stages ps
LEFT JOIN person_pipeline pp ON pp.stage_id = ps.id
WHERE ps.church_id = $church_id
GROUP BY ps.id, ps.name, ps.position
ORDER BY ps.position;

-- 4. Histórico de interações de uma pessoa (com mask de dados)
SELECT
  i.type,
  i.direction,
  i.created_at,
  i.content->>'intent' as intent,
  i.actor_type
FROM interactions i
WHERE i.church_id = $church_id
  AND i.person_id = $person_id
ORDER BY i.created_at DESC
LIMIT 20;

-- 5. Segmentação para campanha (membros ativos com tag específica)
SELECT p.id, p.name, p.phone, p.email
FROM people p
WHERE p.church_id = $church_id
  AND p.member_status IN ('membro', 'lider', 'voluntario')
  AND p.anonymized_at IS NULL
  AND p.phone IS NOT NULL
  AND p.tags @> $filter_tags::jsonb
  AND p.last_interaction_at > NOW() - INTERVAL '90 days'
ORDER BY p.name;

-- 6. Visitantes desta semana (para relatório do pastor)
SELECT p.name, p.phone, p.origin_channel,
       i.created_at as first_contact,
       i.content->>'text' as first_message
FROM people p
JOIN interactions i ON i.person_id = p.id
WHERE p.church_id = $church_id
  AND p.member_status = 'visitante'
  AND p.first_interaction_at >= date_trunc('week', NOW())
  AND i.created_at = p.first_interaction_at  -- apenas primeira interação
ORDER BY p.first_interaction_at DESC;
```
