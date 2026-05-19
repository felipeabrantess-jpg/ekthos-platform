# SPRINT-2-AUDITORIA-FUNDADORA-2026-05-05

> **Tese-mestra (Decisão 104 — 05/05/2026):**
> "O Ekthos já provou que o agente FALA (Sprint 1: cascade Haiku→Sonnet em produção).
> Agora precisa provar que ele fala COMO CADA IGREJA e ACOMPANHA pessoas do jeito
> que cada igreja cuida."
>
> Multi-tenancy é tese, não detalhe técnico. Toda config pastoral passa pelo
> cockpit, nunca pelo código. Sem essa frente, Ekthos é "1 igreja escalada".
> Com essa frente, Ekthos é multi-tenant real.

**Data:** 2026-05-05
**Metodologia:** 6 subagents paralelos (Haiku) + consolidação manual
**Status:** AUDITORIA — sem código, sem migrations, sem commits

---

## 1. ESTADO ATUAL

### 1.1 Tabela `church_agent_config` — Schema

| Coluna | Tipo | Nullable | Observação |
|--------|------|----------|------------|
| `church_id` | uuid | NOT NULL | PK composto |
| `agent_slug` | text | NOT NULL | PK composto |
| `formality` | text | YES | formal / informal / semiformal |
| `denomination` | text | YES | ex: "Assembleia de Deus" |
| `preferred_verses` | text[] | YES | Array de versículos |
| `forbidden_topics` | text[] | YES | Tópicos proibidos |
| `pastoral_depth` | text | YES | deep / moderate / light |
| `first_contact_delay` | text | YES | ex: "2h" |
| `send_window` | jsonb | YES | `{start: 8, end: 21}` |
| `emoji_usage` | text | YES | none / moderate / high |
| `custom_overrides` | jsonb | YES | overrides adicionais |
| `custom_instructions` | text | YES | Camada 3 — freeform |
| `updated_by` | uuid | YES | auditoria |
| `active` | boolean | YES | default: true |
| `created_at` | timestamptz | YES | default: now() |
| `updated_at` | timestamptz | YES | default: now() |

**PK:** composite `(church_id, agent_slug)`
**RLS:**
- `cac_config_tenant`: ALL ops → `church_id = auth_church_id()` (tenant isolation ✅)
- `church_agent_config_ekthos_admin_all`: ALL ops → `is_ekthos_admin = true` (cockpit ✅)
- `church_agent_config_service_role`: ALL ops → `true` (EFs ✅)

**Observação crítica:** Não há coluna `config` agregada — configuração é desnormalizada em colunas individuais. A query `jsonb_pretty(config)` retorna erro.

### 1.2 Modelo de 3 Camadas — Estado de Implementação

**Implementado em 2026-05-03. FUNCIONANDO.**

```
Camada 1 (Global):    agent_prompt_templates.base_prompt
                      Template base por agent_slug. Versionado. Admin-only.
                      SEED: apenas agent-acolhimento (5481 bytes).
                      Outros 6 agentes: SEM TEMPLATE no banco.
                      ↓
Camada 2 (Igreja):    church_agent_config (8 campos + custom_overrides)
                      formality, denomination, pastoral_depth, emoji_usage,
                      preferred_verses[], send_window{}, custom_overrides{}
                      RLS tenant-aware.
                      ↓
Camada 3 (Admin):     church_agent_config.custom_instructions (text livre)
                      Instruções freeform do cockpit Ekthos.
                      RPC reset_church_agent_config() zera APENAS este campo.
```

**RPC `get_agent_prompt_resolved(p_church_id, p_agent_slug)`:**
- Busca template ativo → merge com config da igreja → resolve `{{placeholders}}` → append custom_instructions
- Placeholders suportados: `{{church_name}}`, `{{denomination}}`, `{{formality}}`, `{{pastoral_depth}}`, `{{emoji_usage}}`, `{{preferred_verses}}`, `{{send_window}}`, `{{custom_overrides}}`
- SECURITY DEFINER + `row_security = 'off'` (necessário para JOIN cross-RLS — risco administrado)
- Retorna: `{resolved_prompt, church_config (jsonb), template_version, has_custom_config}`

### 1.3 Tabelas correlatas relevantes

| Tabela | Status | Uso |
|--------|--------|-----|
| `agent_prompt_templates` | ✅ EXISTS | Templates base por agent_slug. 1 seed (acolhimento). |
| `subscription_agents` | ✅ EXISTS | Catálogo por subscription. Campos: slug, active, package_type, credits_total/balance. |
| `church_whatsapp_channels` | ✅ EXISTS | Multi-provider (Meta/ChatPro/Zapi). Health check, provisioning. |
| `acolhimento_journey` | ✅ EXISTS | Journey de 90 dias. Enum D+0..D+90. touchpoints_sent[], status. Index em next_touchpoint_at. |
| `church_events` / `service_schedules` | ✅ EXISTS | Agenda de cultos e escalas. **Não linkado ao sistema de agentes.** |
| `agent_credit_usage` | ✅ EXISTS (vazia) | Schema de créditos implementado. Nenhum registro (EFs não instrumentadas). |

### 1.4 RPCs de configuração de agentes

| RPC | Status | Observação |
|-----|--------|------------|
| `get_agent_prompt_resolved()` | ✅ EXISTE | Resolve 3 camadas. Funcional. |
| `get_church_agent_config()` | ✅ EXISTE | Lê config da igreja para um agente. Admin-only. |
| `upsert_church_agent_config()` | ✅ EXISTE | Salva config (custom_instructions + campos). Admin-only. |
| `reset_church_agent_config()` | ✅ EXISTE | Zera custom_instructions. Preserva campos estruturados. |
| `is_ekthos_admin()` | ✅ EXISTE | Valida admin via JWT app_metadata. |
| `auth_church_id()` | ✅ EXISTE | Retorna church_id do JWT (app_metadata). |
| `activate_agent()` / `pause_agent()` | ✅ EXISTE | Lifecycle de agentes. |
| `admin-agent-config` (EF admin) | ❌ INEXISTENTE | Nenhuma EF admin específica para config. |

### 1.5 Estado dos 3 agentes premium

| Agente | EF local? | Linhas | Tipo | Cron ativo? | Invoc. 30d | Template DB? | Deployed? |
|--------|-----------|--------|------|-------------|-----------|-------------|-----------|
| agent-acolhimento | ✅ | 703 | REAL | ✅ `*/30 * * * *` | 0 | ✅ | ✅ v18 |
| agent-reengajamento | ✅ | 433 | REAL | ❌ | 0 | ❌ | ✅ v14 |
| agent-operacao | ❌ | — | INEXISTENTE | ❌ | 0 | ❌ | ❌ |

**Achados críticos:**
- `agent-operacao` é um **fantasma de catálogo**: registrado com 800 créditos em `subscription_agents`, sem nenhum código. Retorna 404.
- `agent-reengajamento` tem código (433 linhas) + deployment, mas zero cron, zero template, zero uso.
- Zero invocações nos 30 dias para todos os 3 → `agent_credit_usage` nunca foi alimentada.

### 1.6 Agentes internos (inclusos)

| Slug | EF? | Linhas | Modelo | Cache ephemeral? | Status |
|------|-----|--------|--------|-----------------|--------|
| agent-cadastro | ✅ | 299 | Haiku 4.5 ✅ | ✅ | ✅ OK |
| agent-onboarding | ✅ | 329 | Haiku 4.5 ✅ | ❌ | ⚠️ Sem cache |
| agent-suporte | ✅ | 264 | Haiku 4.5 ✅ | ❌ | ⚠️ Sem cache |
| agent-config | ❌ | — | — | — | 🗑️ STUB (404) |

**Alerta:** `agent-config` aparece no catálogo (banco + UI) mas não tem EF. Retorna 404 para qualquer chamada.

### 1.7 Cockpit admin para agentes

**Estado: BACKEND 99% PRONTO. FRONTEND 0% IMPLEMENTADO.**

- 7 EFs admin deployadas (`admin-church-create`, `admin-church-pricing`, `admin-notes-crud`, `admin-churches-list`, `admin-events-list`, `admin-tasks-crud`) → **nenhuma para config de agentes**
- RPCs existem mas nenhum componente React as chama
- A rota `/admin/cockpit/igrejas/:id/agentes/:slug` não existe no frontend

### 1.8 Hardcoding em `agent-acolhimento`

**O que está pronto para multi-tenant:**
- Busca `get_agent_prompt_resolved` → fallback graceful ✅
- Log estruturado (`used_template`, `has_custom_config`) ✅
- cache_control ephemeral em 2 blocos ✅
- Histórico isolado por `conversation_id` ✅

**O que ainda está hardcoded:**

| Item | Valor | Linha | Prioridade de config |
|------|-------|-------|----------------------|
| Régua follow-up | D+0, D+3, D+7, D+14, D+30, D+60, D+90 | 81-87 | 🔴 ALTA — Decisão 104 |
| Freq. máx. envio | 1/dia, 3/semana | 106-107 (narrativa) | 🔴 ALTA — Decisão 104 |
| Condições de parada | Narrativa semântica | 121, 128 | 🔴 ALTA |
| Escalonamento pastoral | Semântico (sem handoff ativo) | 108, 127 | 🔴 ALTA |
| Modelo Claude | `claude-sonnet-4-6` (literal) | 44 | 🟡 MÉDIA — env var |
| MAX_TOKENS | 2048 | 45 | 🟡 MÉDIA |
| Histórico conversa | 20 msgs | 566 | 🟢 BAIXA |
| Rate limit inbound | 5 em 5 min | 516 | 🟢 BAIXA |
| Modelo Haiku | — | — | N/A (não usa Haiku direto) |

**Risco escalonamento:** O handoff pastoral é *puramente semântico* — Claude decide não enviar mensagem, mas não executa: nenhuma mudança de `conversations.ownership`, nenhuma notificação ativa ao staff. Silencioso em caso de falha de reasoning.

---

## 2. GAPS VS PROPOSTA FELIPE (DECISÃO 104)

### 2.1 Identidade da igreja

| Campo | Estado atual | Gap |
|-------|-------------|-----|
| Nome da igreja | `churches.name` ✅ | — |
| Nome do pastor | ❌ Inexistente | Falta campo em `churches` ou tabela `church_identity` |
| Missão/visão | ❌ Inexistente | Agente não sabe o "porquê" da igreja |
| Valores da igreja | ❌ Inexistente | Contexto pastoral ausente |
| Fundação / tamanho | ❌ Inexistente | Para contexto de escala |
| Tom geral | `formality` (semiformal/formal/informal) | Parcial — sem exemplos concretos |

### 2.2 Horários pastorais

| Elemento | Estado atual | Gap |
|----------|-------------|-----|
| Horário de atendimento | `send_window {start, end}` ✅ | Apenas janela de envio, não cultos |
| Horários de culto | `service_schedules` (tabela existe ✅) | Não linkado ao sistema de agentes. Agente não sabe quando é o culto. |
| Eventos específicos | `church_events` (tabela existe ✅) | Idem — não injetado no prompt |

**Gap:** As tabelas de agenda existem mas o agente não as consulta. Quando um membro pergunta "que horas é o culto?", o agente não sabe.

### 2.3 Tom de comunicação

| Elemento | Estado atual | Gap |
|----------|-------------|-----|
| Formalidade | ✅ `formality` | Funcional |
| Uso de emojis | ✅ `emoji_usage` | Funcional |
| Versos bíblicos preferidos | ✅ `preferred_verses[]` | Funcional |
| Tópicos proibidos | ✅ `forbidden_topics[]` | Funcional |
| Exemplos de voz da igreja | ❌ | Campo "exemplos de mensagem" inexistente |
| Persona do agente | ❌ | Nome/apresentação configurável ausente |

### 2.4 Conteúdo pastoral

| Elemento | Estado atual | Gap |
|----------|-------------|-----|
| Profundidade pastoral | ✅ `pastoral_depth` | Funcional |
| Denominação | ✅ `denomination` | Funcional |
| Custom instructions | ✅ `custom_instructions` | Freeform — funcional mas sem estrutura |
| Mensagens-modelo por touchpoint | ❌ | Igreja não pode definir "o texto da mensagem do D+3" |
| Conteúdo por evento (culto, célula) | ❌ | Não configurável |

### 2.5 Follow-up — GAP CRÍTICO

**Estado atual:** Régua D+0...D+90 está **hardcoded em narrativa** no `SYSTEM_BLOCK_A` do `agent-acolhimento`. A tabela `acolhimento_journey` rastreia o estado, mas os intervalos, limites e condições de parada não são configuráveis por igreja.

| Elemento | Estado atual | Gap |
|----------|-------------|-----|
| Touchpoints (quais dias) | Hardcoded: 0, 3, 7, 14, 30, 60, 90 | Cada igreja deveria poder definir sua própria régua |
| Freq. máx. de envio | Hardcoded: 1/dia, 3/semana | Não configurável |
| Condição de parada | Hardcoded (narrativa semântica) | Não configurável (ex: "parar após 2 semanas sem resposta") |
| Texto das mensagens | Gerado dinamicamente pelo LLM | Parcialmente OK — mas sem template de aprovação |
| Habilitação por touchpoint | Todos ativos | Igreja não pode desabilitar D+60, por exemplo |

### 2.6 Escalonamento humano — GAP CRÍTICO

| Elemento | Estado atual | Gap |
|----------|-------------|-----|
| Condições de escalonamento | Hardcoded (narrativa: "luto, crise, hospitalização") | Não configurável |
| Destino do escalonamento | Semântico — agente para de enviar | Sem handoff ativo, sem notificação |
| Contatos de escalonamento | ❌ Inexistente | Não há tabela de quem recebe o alerta |
| Método de notificação | `internal_notifications` (apenas rate limit) | Para pastoral: sem mecanismo |
| Pausa da jornada | Semântica | Sem mudança de ownership ativa |

**Risco real:** Se um membro expressa crise suicida, o agente *pode* parar de responder (semanticamente), mas nenhum pastor é notificado. Isso é risco pastoral e legal.

### 2.7 Cockpit — GAP TOTAL

O cockpit para configuração de agentes **não existe no frontend**. As RPCs estão prontas, mas nenhuma tela foi construída.

---

## 3. PROPOSTA DE SCHEMA

### 3.1 `church_agent_config` — Expansão

Adicionar campos à tabela existente:

```sql
ALTER TABLE public.church_agent_config
  ADD COLUMN IF NOT EXISTS agent_name        text,           -- Nome que o agente usa ("Joana", "Assistente da Igreja")
  ADD COLUMN IF NOT EXISTS pastor_name       text,           -- Nome do pastor principal (para contexto)
  ADD COLUMN IF NOT EXISTS schedule_context  jsonb,          -- Injetar horários no prompt: {culto_domingo: "9h e 18h", ...}
  ADD COLUMN IF NOT EXISTS voice_examples    text[],         -- Exemplos de mensagens no tom da igreja (few-shot)
  ADD COLUMN IF NOT EXISTS escalation_mode   text            -- 'silent' | 'notify' | 'transfer' (default: 'notify')
    DEFAULT 'notify' CHECK (escalation_mode IN ('silent','notify','transfer'));
```

**Justificativa:** Estes campos encaixam no modelo 3-camadas existente sem breaking change. `schedule_context` é um jsonb que o cockpit preenche consultando `service_schedules` — não é FK direta, preservando flexibilidade.

### 3.2 `church_followup_config` — NOVA TABELA

```sql
CREATE TABLE public.church_followup_config (
  church_id             uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  agent_slug            text        NOT NULL,
  touchpoints           jsonb       NOT NULL DEFAULT '[
    {"day": 0,  "label": "Boas-vindas",               "enabled": true},
    {"day": 3,  "label": "Follow-up D+3",             "enabled": true},
    {"day": 7,  "label": "Convite próxima atividade", "enabled": true},
    {"day": 14, "label": "Apresentação de células",   "enabled": true},
    {"day": 30, "label": "Verificação de integração", "enabled": true},
    {"day": 60, "label": "Progresso espiritual",      "enabled": false},
    {"day": 90, "label": "Avaliação final",           "enabled": false}
  ]',
  max_per_day           int         NOT NULL DEFAULT 1,
  max_per_week          int         NOT NULL DEFAULT 3,
  stop_on_no_response   int,        -- Parar após N dias sem resposta (NULL = nunca)
  stop_on_membership    boolean     NOT NULL DEFAULT false, -- Parar se se tornar membro
  custom_stop_conditions jsonb      DEFAULT '[]',
  active                boolean     NOT NULL DEFAULT true,
  updated_by            uuid        REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (church_id, agent_slug)
);

-- RLS (mesma estrutura de church_agent_config — usar is_ekthos_admin(), não inline)
ALTER TABLE public.church_followup_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY cfc_tenant ON public.church_followup_config
  FOR ALL USING (church_id = auth_church_id());

CREATE POLICY cfc_admin ON public.church_followup_config
  FOR ALL USING (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

CREATE POLICY cfc_service_role ON public.church_followup_config
  FOR ALL USING (true) WITH CHECK (true);
```

**Decisão de design:** Defaults habilitam D+0 a D+30, desabilitam D+60 e D+90. Cockpit permite que admin Ekthos habilite por igreja. Igreja não edita — apenas admin Ekthos.

### 3.3 `church_escalation_rules` — NOVA TABELA

```sql
CREATE TABLE public.church_escalation_rules (
  church_id               uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  agent_slug              text        NOT NULL,
  -- Condições que disparam escalonamento
  sentiment_triggers      text[]      NOT NULL DEFAULT ARRAY['distressed'],
  category_triggers       text[]      NOT NULL DEFAULT ARRAY['handoff_humano'],
  no_response_days        int         DEFAULT NULL, -- Escalonar se N dias sem resposta
  -- Destino
  escalation_contacts     jsonb       NOT NULL DEFAULT '[]',
  -- Exemplo: [{"name": "Pastor João", "phone": "5511...", "role": "pastor"}]
  notify_method           text        NOT NULL DEFAULT 'internal_notification'
    CHECK (notify_method IN ('internal_notification','whatsapp','both')),
  pause_journey_on_escalation boolean NOT NULL DEFAULT true,
  -- Auditoria
  updated_by              uuid        REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (church_id, agent_slug)
);

ALTER TABLE public.church_escalation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY cer_tenant ON public.church_escalation_rules
  FOR ALL USING (church_id = auth_church_id());

CREATE POLICY cer_admin ON public.church_escalation_rules
  FOR ALL USING (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

CREATE POLICY cer_service_role ON public.church_escalation_rules
  FOR ALL USING (true) WITH CHECK (true);
```

### 3.4 `churches` — Campos de identidade pastoral

```sql
-- Verificar colunas existentes antes de aplicar
ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS pastor_name         text,
  ADD COLUMN IF NOT EXISTS mission_statement   text,
  ADD COLUMN IF NOT EXISTS church_values       text[],
  ADD COLUMN IF NOT EXISTS avg_attendance      int,
  ADD COLUMN IF NOT EXISTS founding_year       int;
```

**Nota:** Antes de aplicar, auditar colunas existentes de `churches` para evitar duplicação. *(Não feito nesta auditoria — adicionar ao Onda A como primeiro passo.)*

### 3.5 Atualizar `get_agent_prompt_resolved` — Novos placeholders

A RPC existente já resolve placeholders. Adicionar ao vocabulário:

| Placeholder | Fonte |
|------------|-------|
| `{{pastor_name}}` | `church_agent_config.pastor_name` ou `churches.pastor_name` |
| `{{agent_name}}` | `church_agent_config.agent_name` |
| `{{schedule_context}}` | `church_agent_config.schedule_context` (JSONB formatado) |
| `{{escalation_mode}}` | `church_agent_config.escalation_mode` |
| `{{followup_touchpoints}}` | `church_followup_config.touchpoints` (apenas days habilitados) |
| `{{stop_conditions}}` | `church_followup_config.stop_on_no_response` + flags |

---

## 4. PROPOSTA DE RPCs NOVAS

| RPC | Ação | Auth | Observação |
|-----|------|------|------------|
| `get_followup_config(p_church_id, p_agent_slug)` | Lê config follow-up + defaults se inexistente | Admin | Retorna row ou defaults |
| `upsert_followup_config(p_church_id, p_agent_slug, p_config)` | Salva config follow-up | Admin | Valida touchpoints JSON schema |
| `get_escalation_rules(p_church_id, p_agent_slug)` | Lê regras de escalonamento | Admin | Retorna row ou defaults |
| `upsert_escalation_rules(p_church_id, p_agent_slug, p_rules)` | Salva regras de escalonamento | Admin | Valida contacts JSON schema |
| `get_church_identity(p_church_id)` | Lê campos identidade da church | Admin | |
| `update_church_identity(p_church_id, p_fields)` | Atualiza campos identidade | Admin | Valida fields permitidos |
| `preview_resolved_prompt(p_church_id, p_agent_slug)` | Retorna prompt final para preview | Admin | Chama get_agent_prompt_resolved + formata |
| `trigger_test_message(p_church_id, p_agent_slug, p_phone)` | Dispara mensagem de teste | Admin | Fire-and-forget para EF do agente |

**Existentes que NÃO precisam ser criadas** (já implementadas):
- `get_agent_prompt_resolved` ✅
- `upsert_church_agent_config` ✅
- `reset_church_agent_config` ✅
- `get_church_agent_config` ✅

---

## 5. PROPOSTA DE COCKPIT EM 7 ABAS

**Rota:** `/admin/cockpit/igrejas/:church_id/agentes/:agent_slug`

### Aba 1 — Identidade

Campos: nome do agente (como se apresenta), nome do pastor, missão da igreja, denominação, valores.
Fonte de dados: `churches` + `church_agent_config.agent_name`, `church_agent_config.pastor_name`.
Salva via: `update_church_identity()` + `upsert_church_agent_config()`.

### Aba 2 — Prompt + Tom

Campos:
- Formalidade (dropdown: Formal / Semiformal / Informal)
- Profundidade pastoral (dropdown: Deep / Moderate / Light)
- Uso de emojis (dropdown: None / Moderate / High)
- Versículos preferidos (tags input)
- Tópicos proibidos (tags input)
- Exemplos de voz da igreja (textarea × 3)
- Custom instructions (textarea livre — Camada 3)

Preview: botão "Ver prompt resolvido" → chama `preview_resolved_prompt()` → modal com prompt final.
"Voltar ao padrão": botão → chama `reset_church_agent_config()`.

### Aba 3 — Follow-up

Componente visual de régua de touchpoints:
```
D+0  [ ✅ Ativo ] [Label: "Boas-vindas"               ]
D+3  [ ✅ Ativo ] [Label: "Follow-up D+3"             ]
D+7  [ ✅ Ativo ] [Label: "Convite próxima atividade"  ]
D+14 [ ✅ Ativo ] [Label: "Apresentação de células"    ]
D+30 [ ✅ Ativo ] [Label: "Verificação de integração"  ]
D+60 [ ❌ Off   ] [Label: "Progresso espiritual"        ]
D+90 [ ❌ Off   ] [Label: "Avaliação final"             ]
```

Config adicional: max por dia / max por semana / parar após X dias sem resposta.
Salva via: `upsert_followup_config()`.

### Aba 4 — Escalonamento

Campos:
- Modo de escalonamento: Silencioso / Notificar / Transferir
- Sentimentos que disparam escalonamento (multiselect: distressed, negative, ...)
- Contatos de escalonamento (lista: Nome + Telefone + Papel)
- Método de notificação: InternalNotification / WhatsApp / Ambos
- Pausar jornada ao escalonar: toggle

Salva via: `upsert_escalation_rules()`.

### Aba 5 — Canais

Lista de canais WhatsApp vinculados (`church_whatsapp_channels`).
Status de conexão, número, provider, última verificação de saúde.
Ação: Testar conexão / Reconectar.
(Backend já existe — apenas expor no cockpit.)

### Aba 6 — Testes

Formulário: "Enviar mensagem de teste"
- Campo: Telefone de destino
- Botão: "Disparar" → chama `trigger_test_message()`
- Preview do último prompt resolvido.
- Histórico das últimas 5 mensagens enviadas por esta config.

### Aba 7 — Histórico

Tabela: últimas 50 entradas de `acolhimento_journey` para esta igreja.
Colunas: pessoa, touchpoint atual, status, última atividade, notas pastorais.
Filtros: status (pending/completed/cancelled).
(Read-only — auditoria pastoral.)

---

## 6. PLANO EM ONDAS

### Onda A: Schema + Migrations (estimativa: 4-6h)

**Dependência:** Felipe valida este plano. Nenhuma onda começa antes.

1. Auditar colunas atuais de `churches` (evitar duplicação)
2. `ALTER TABLE churches ADD COLUMN pastor_name, mission_statement, church_values[], avg_attendance, founding_year`
3. `ALTER TABLE church_agent_config ADD COLUMN agent_name, schedule_context, voice_examples[], escalation_mode`
4. `CREATE TABLE church_followup_config` (schema proposto acima — idempotente)
5. `CREATE TABLE church_escalation_rules` (schema proposto acima — idempotente)
6. Seed padrão de `church_followup_config` para igreja de teste existente
7. `CREATE TABLE agent_prompt_templates` seeds para: agent-reengajamento, agent-operacao (templates VAZIOS por ora, placeholder)
8. REVOKE + RLS em novas tabelas

**Migrations idempotentes:** Todo `IF NOT EXISTS`, `WHERE NOT EXISTS` em INSERTs, `ON CONFLICT DO NOTHING`.

### Onda B: RPCs Backend (estimativa: 4-6h)

1. `UPDATE` da RPC `get_agent_prompt_resolved` para resolver novos placeholders (`{{pastor_name}}`, `{{agent_name}}`, `{{schedule_context}}`, `{{followup_touchpoints}}`, `{{stop_conditions}}`). **Regra de compatibilidade obrigatória:** Placeholders não resolvidos retornam string vazia `''` — nunca `NULL` e nunca o literal `{{placeholder}}`. Qualquer novo placeholder é aditivo (igrejas sem config para esse campo recebem `''`). Comportamento atual preservado: igrejas sem `church_agent_config` continuam funcionando com fallback hardcoded.
2. `CREATE FUNCTION get_followup_config()`
3. `CREATE FUNCTION upsert_followup_config()`
4. `CREATE FUNCTION get_escalation_rules()`
5. `CREATE FUNCTION upsert_escalation_rules()`
6. `CREATE FUNCTION get_church_identity()` / `update_church_identity()`
7. `CREATE FUNCTION preview_resolved_prompt()`
8. `CREATE FUNCTION trigger_test_message()` (fire-and-forget para EF)
9. Testes SQL de cada RPC (SELECT direto + validação de output)

### Onda C: Cockpit Frontend (estimativa: 10-14h)

1. Rota `/admin/cockpit/igrejas/:church_id/agentes/:agent_slug`
2. Aba 1 — Identidade (form + save)
3. Aba 2 — Prompt + Tom (form + preview modal + reset)
4. Aba 3 — Follow-up (componente régua visual + save)
5. Aba 4 — Escalonamento (form + lista de contatos dinâmica + save)
6. Aba 5 — Canais (read + status badge + teste)
7. Aba 6 — Testes (formulário disparo + histórico)
8. Aba 7 — Histórico (tabela journey read-only)

**Seguir:** design system Ekthos (sidebar #161616, cream #f9eedc, vermelho #e13500, Playfair Display + DM Sans).

### Onda D: Migrar agent-acolhimento hardcoded → config (estimativa: 4-5h)

**Risco:** Esta é a onda mais perigosa. Agente está em produção com cron ativo (*/30).

1. Ler `church_followup_config` no início do handler (já busca `get_agent_prompt_resolved`)
2. Substituir `SYSTEM_BLOCK_A` narrativo por template do banco (Camada 1 já configurada)
3. Injetar `{{followup_touchpoints}}` e `{{stop_conditions}}` no prompt resolvido
4. Implementar handoff ativo: quando `escalation_mode = 'transfer'` → UPDATE `conversations.ownership = 'human'` + INSERT `internal_notifications`
5. Implementar leitura de `church_escalation_rules` para decidir o que fazer com sentimento distressed
6. Ler `church_agent_config.schedule_context` para injetar horários de culto
7. **Estratégia de rollout:** Feature flag em `church_agent_config.active` — igrejas sem config continuam com fallback hardcoded. Zero breaking change.
8. Testar: comparar output com e sem config para mesma mensagem de teste

**Modelo:** Manter `claude-sonnet-4-6` hardcoded → adicionar env var `ANTHROPIC_SONNET_MODEL` como próximo passo (Onda D+0.5 não crítica).

### Onda E: IMPLEMENTAR agent-reengajamento do zero (estimativa: 6-8h)

**Pré-requisito:** Ondas A + B completas (precisa de tabelas e RPCs).

O código existe (433 linhas deployado como v14), mas:
- Sem template no banco
- Sem cron
- Sem config multi-tenant

1. Ler `supabase/functions/agent-reengajamento/index.ts` completo e entender lógica atual
2. Criar template de prompt base em `agent_prompt_templates` para `agent-reengajamento`
3. Adaptar EF para usar `get_agent_prompt_resolved()` (mesmo padrão do acolhimento)
4. Criar `church_followup_config` defaults para agente de reengajamento (régua diferente — foco em reativar ausentes)
5. Configurar cron: frequência a definir com Felipe (sugestão: 1× por dia, não */30)
6. Criar seed de `church_agent_config` para agent-reengajamento na igreja de teste
7. Deploy + teste E2E

**Decisão aguardando Felipe:** Qual é a régua default de reengajamento? (ex: D+15, D+30, D+60 sem presença)

### Onda F: IMPLEMENTAR agent-operacao do zero (estimativa: 6-8h)

**Pré-requisito:** Ondas A + B + E completas.

O agente não existe. Precisa:

1. **Definir o que agent-operacao faz** — *Felipe precisa responder isso*. Hipótese: gerencia aspectos operacionais via WhatsApp (escalas, células, confirmações de presença, avisos de evento).
2. Criar `supabase/functions/agent-operacao/index.ts` do zero seguindo padrão de acolhimento
3. Criar template de prompt base em `agent_prompt_templates`
4. Criar `church_agent_config` defaults para agent-operacao
5. Definir e configurar cron (se aplicável — pode ser apenas inbound)
6. Deploy + teste E2E
7. Remover registro fantasy de `subscription_agents` (800 créditos pré-alocados) e recriar corretamente

### Onda G: Testes E2E com 2 igrejas mock distintas (estimativa: 3-4h)

**Objetivo:** Provar que o mesmo agente se comporta diferente para 2 igrejas com configs distintas.

**Setup:**
- Igreja A: formal, deep, Assembleia de Deus, sem emojis, régua D+0/D+7/D+30
- Igreja B: informal, light, Batista, emojis moderados, régua D+0/D+3/D+14

**Testes:**
- T1: Mesma mensagem → respostas distintas (tom, formalidade, versos)
- T2: Escalonamento pastoral → Igreja A notifica pastor@A, Igreja B notifica pastor@B
- T3: Pergunta sobre horário de culto → cada agente responde com horários corretos de cada igreja
- T4: Follow-up D+3 → só dispara para igrejas com D+3 habilitado

---

## 7. RISCOS

### R1 — Quebrar agent-acolhimento em produção (CRÍTICO)

- **Contexto:** Cron ativo (*/30). Qualquer mudança no código ou prompt pode afetar igrejas ativas.
- **Mitigação:** Feature flag via `church_agent_config.active`. Fallback hardcoded preservado em toda a Onda D. Deploy em horário de baixo tráfego. Rollback = reverter flag.
- **Aceite necessário:** Felipe aprova estratégia de rollout antes da Onda D.

### R2 — Migration sem rollback para tabelas novas

- **Contexto:** `church_followup_config` e `church_escalation_rules` são tabelas novas. Se a Onda B depender delas e algo der errado, precisa de rolldown.
- **Mitigação:** Toda migration idempotente. Migrations separadas por tabela. Testar em branch Supabase antes de aplicar em produção.

### R3 — RLS e multi-tenancy

- **Contexto:** `get_agent_prompt_resolved` usa `row_security = 'off'`. Se a lógica de acesso falhar, pode retornar dados de outra igreja.
- **Mitigação:** A RPC já recebe `p_church_id` explicitamente — não busca da sessão. Para a Onda B, auditar se há checks manuais na função e adicionar se necessário.

### R4 — Compatibilidade com Sprint 1 (cascade Haiku→Sonnet)

- **Contexto:** `agent-haiku-triagem` chama `agent-acolhimento` como fire-and-forget. A Onda D muda `agent-acolhimento` — precisa garantir que a interface de entrada (`conversation_id`, `message_id`, `church_id`, `inbound_text`, `trigger_type`) seja preservada.
- **Mitigação:** Onda D modifica apenas a lógica interna. Interface de entrada (payload JSON) não muda. Validar via teste T4 da Onda G.

### R5 — Modelo Claude errado nas Ondas E e F (CRÍTICO)

- **Contexto:** O CLAUDE.md creva em maiúsculas: `NUNCA usar claude-3-5-haiku-20241022` (descontinuado, retorna 404). Ao criar/adaptar `agent-reengajamento` (Onda E) e `agent-operacao` (Onda F), o agente executor pode acidentalmente usar o modelo legado.
- **Regra:** Toda EF criada ou adaptada nas Ondas E e F deve usar `claude-haiku-4-5-20251001` (Haiku) ou `claude-sonnet-4-6` (Sonnet), nunca outros. Preferência: Haiku para processamento simples (mais barato).
- **Deploy:** Toda EF nova deploy com `--no-verify-jwt` explicitamente. Configurar `[functions.agent-operacao] verify_jwt = false` no `config.toml` antes do deploy.

### R6 — Documentação canon ausente

- **Contexto:** `docs/00-formacoes.md` e `docs/02-arquitetura-tecnica.md` não existem no repositório (CLAUDE.md os referencia como "sempre consultar"). A única fonte de verdade técnica é o próprio `CLAUDE.md` (raiz).
- **Risco:** Decisões arquiteturais tomadas neste Sprint 2 podem divergir de decisões anteriores não documentadas. Especialmente as decisões D1-D8 deste documento devem ser registradas em algum arquivo canônico após validação de Felipe.
- **Mitigação:** Após validação, registrar D1-D8 no `CLAUDE.md` como "Decisões Sprint 2 — cravadas em 05/05/2026".

### R7 — Compatibilidade com PASSO 8 (N8nAdapter / webhooks futuros)

- **Contexto (R7):** Canon menciona N8n consumir regras de follow-up no futuro. Se as RPCs de Onda B não expõem as regras de forma compatível com chamadas externas, vai gerar retrabalho.
- **Mitigação:** RPCs da Onda B usam SECURITY DEFINER + parâmetros explícitos — podem ser chamadas por n8n via service_role JWT. Não criar EF wrapper agora (YAGNI). Nota: n8n não é escopo desta sprint.

---

## 8. DECISÕES AGUARDANDO VALIDAÇÃO FELIPE

**Nenhuma onda inicia sem confirmação destas decisões:**

| # | Decisão | Opções / Contexto |
|---|---------|-------------------|
| D1 | **Campos de identidade:** expandir tabela `churches` OR criar `church_identity` separada? | `churches`: mais simples, menos tabelas. Separada: mais limpa mas JOIN extra. **Recomendo: expandir `churches`.** |
| D2 | **Quem edita o quê:** admin Ekthos edita todos os campos. Pastor acessa alguma aba para leitura? | Você cravou "APENAS admin Ekthos edita nessa frente". Confirmar: pastor não vê nem leitura das configs no cockpit deles? |
| D3 | **Régua default de agent-reengajamento:** quais dias? Qual lógica de trigger? | Hipótese: dispara quando pessoa tem `last_seen > 14 dias`. Régua sugerida: D+15, D+30, D+60. Você define. |
| D4 | **O que faz agent-operacao?** | Sem definição: temos catálogo com 800 créditos e zero código. Precisa de uma frase de proposta de valor. Ex: "Responde automaticamente operacional via WhatsApp (escalas, eventos, confirmações)." |
| D5 | **Régua default de agent-acolhimento:** manter D+0/3/7/14/30/60/90 como padrão global? | Você pode querer que cada plano (Missão vs Avivamento) tenha defaults distintos. Ou manter um único padrão. |
| D6 | **Escalonamento: notificação ou transferência?** | Default atual: apenas semântico (agente para). Proposta: `escalation_mode = 'notify'` como default (INSERT em internal_notifications + pausa journey). `transfer` requer contato configurado. Confirmar. |
| D7 | **Template de agent-reengajamento:** você quer escrever o prompt inicial ou eu esboço baseado na lógica existente do código? | Recomendo: eu leio o código (433 linhas) e esboço um template. Você revisa. |
| D8 | **Seed de church_followup_config para planos:** D+60 e D+90 desabilitados por default (proposta). Plano Avivamento habilita todos? | Definir se o plano/pricing afeta quais touchpoints estão disponíveis. Nota: FK eventual para plans usaria `plans.slug` (PK é text/slug, não UUID). |
| D9 | **`agent-config` stub:** aparece no catálogo banco+UI mas retorna 404. Remover do catálogo ou implementar? | Recomendo: remover do catálogo (DELETE de `subscription_agents` WHERE slug='agent-config') + remover da UI. Se não vai ser implementado, não deve aparecer para clientes. |

---

## 9. ESTIMATIVA REFINADA TOTAL SPRINT 2

| Onda | Escopo | Estimativa | Bloqueio |
|------|--------|------------|---------|
| Fase 0 | Auditoria (este documento) | ✅ Concluída | — |
| Onda A | Schema + Migrations | 4-6h | Validação Felipe (D1-D8) |
| Onda B | RPCs Backend | 4-6h | Onda A completa |
| Onda C | Cockpit Frontend | 10-14h | Onda B completa |
| Onda D | Migrar agent-acolhimento | 4-5h | Ondas A+B + aceite R1 |
| Onda E | Implementar agent-reengajamento | 6-8h | Ondas A+B + D3+D7 respondidos |
| Onda F | Implementar agent-operacao | 6-8h | Ondas A+B + D4 respondido |
| Onda G | Testes E2E 2 igrejas | 3-4h | Ondas C+D+E+F |

**Total estimado: 37-51h de trabalho efetivo**
**Paralelização possível:** Ondas C e D podem rodar simultaneamente (frontend não depende de mudanças no agent-acolhimento, só das RPCs da Onda B).
**Risco de cronograma:** Onda C (frontend) é a maior — 10-14h. É onde reside a maior incerteza.

**Caminho crítico:**
```
Validação Felipe → Onda A → Onda B → { Onda C ∥ Onda D } → Onda E → Onda F → Onda G
```

**Com paralelização C∥D:** Sprint 2 completo em ~35-42h de trabalho.

---

## APÊNDICE — Achados adicionais não solicitados

1. **`agent-config` (stub):** Aparece no catálogo banco+UI mas sem EF. Retorna 404. → Coberto na Decisão D9 acima.

2. **`agent-onboarding` e `agent-suporte`** não usam `cache_control: {type: 'ephemeral'}`. Migração simples que reduz custo de tokens em ~25% por chamada. Backlog fácil.

3. **`subscription_agents.active` e `activation_status`** são campos duplicados/redundantes. Potencial inconsistência (active=true + activation_status='paused'). Unificar em uma coluna na próxima migration de limpeza.

4. **Zero auditoria de uso real:** `agent_credit_usage` existe mas vazia. Nenhuma EF registra uso de tokens Anthropic (PENDÊNCIA SPRINT 2 já cravada do Sprint 1).

5. **Documentação canon:** `docs/00-formacoes.md` e `docs/02-arquitetura-tecnica.md` **não existem** (referenciados no CLAUDE.md como "sempre consultar"). Única fonte de verdade: CLAUDE.md.

---

*Gerado por: 6 subagents paralelos (Haiku) + consolidação manual*
*Data: 2026-05-05*
*Status: Aguardando validação Felipe para iniciar Onda A*
