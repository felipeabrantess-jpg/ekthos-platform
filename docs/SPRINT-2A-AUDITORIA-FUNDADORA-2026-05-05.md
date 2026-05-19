# SPRINT-2A — AUDITORIA FUNDADORA — 2026-05-05

> **Tese-mestra (Decisão 104 — 05/05/2026):**
> "O Ekthos já provou que o agente FALA (Sprint 1: cascade Haiku→Sonnet em produção).
> Agora precisa provar que ele fala COMO CADA IGREJA e ACOMPANHA pessoas do jeito
> que cada igreja cuida."
>
> Multi-tenancy é tese, não detalhe técnico. Toda config pastoral passa pelo
> cockpit, nunca pelo código. Sem essa frente, Ekthos é "1 igreja escalada".
> Com essa frente, Ekthos é multi-tenant real.

**Escopo Sprint 2A:**
- Configuração multi-tenant (cockpit + schema + RPCs)
- `agent-acolhimento` hardcoded → config
- `agent-reengajamento` implementação completa
- **`agent-operacao` FORA de Sprint 2A** → Sprint 2B (programa próprio, futuro)

**Data:** 2026-05-05
**Metodologia:** 9 subagents paralelos (Haiku): A-F (fundadora) + G, H (complementar) + consolidação manual
**Status:** AUDITORIA — sem código, sem migrations, sem commits
**Documento original:** `SPRINT-2-AUDITORIA-FUNDADORA-2026-05-05.md` (mantido como referência)

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
- `cac_config_tenant`: ALL → `church_id = auth_church_id()` (tenant isolation ✅)
- `church_agent_config_ekthos_admin_all`: ALL → `is_ekthos_admin()` (cockpit ✅)
- `church_agent_config_service_role`: ALL → `true` (EFs ✅)

**Observação:** Não há coluna `config` agregada — configuração é desnormalizada em colunas individuais.

### 1.2 Modelo de 3 Camadas — Estado de Implementação

**Implementado em 2026-05-03. FUNCIONANDO.**

```
Camada 1 (Global):    agent_prompt_templates.base_prompt
                      Template base por agent_slug. Versionado. Admin-only.
                      SEED: apenas agent-acolhimento. Outros 5 agentes: SEM TEMPLATE.
                      ↓
Camada 2 (Igreja):    church_agent_config (colunas individuais + custom_overrides)
                      formality, denomination, pastoral_depth, emoji_usage,
                      preferred_verses[], send_window{}, custom_overrides{}
                      RLS tenant-aware.
                      ↓
Camada 3 (Admin):     church_agent_config.custom_instructions (text livre)
                      Freeform do cockpit Ekthos. RPC reset_church_agent_config() zera só este.
```

**RPC `get_agent_prompt_resolved(p_church_id, p_agent_slug)`:** Funcionando. Resolve placeholders: `{{church_name}}`, `{{denomination}}`, `{{formality}}`, `{{pastoral_depth}}`, `{{emoji_usage}}`, `{{preferred_verses}}`, `{{send_window}}`, `{{custom_overrides}}`. SECURITY DEFINER + `row_security = 'off'`. Retorna `{resolved_prompt, church_config, template_version, has_custom_config}`.

### 1.3 Tabelas correlatas relevantes

| Tabela | Status | Uso |
|--------|--------|-----|
| `agent_prompt_templates` | ✅ EXISTS | Templates base por agent_slug. 1 seed (acolhimento). |
| `subscription_agents` | ✅ EXISTS | Catálogo por subscription. slug, active, package_type, credits. |
| `church_whatsapp_channels` | ✅ EXISTS | Multi-provider (Meta/ChatPro/Zapi). Health check. |
| `acolhimento_journey` | ✅ EXISTS | Journey onboarding 90 dias. Enum D+0..D+90. 2 rows (pending). |
| `church_events` / `service_schedules` | ✅ EXISTS | Agenda de cultos/escalas (0 rows). Não linkado aos agentes. |
| `agent_credit_usage` | ✅ EXISTS (vazia) | Schema créditos pronto. Nenhuma EF instrumentada. |

### 1.4 RPCs de configuração de agentes

| RPC | Status | Observação |
|-----|--------|------------|
| `get_agent_prompt_resolved()` | ✅ EXISTE | Resolve 3 camadas. Funcional. |
| `get_church_agent_config()` | ✅ EXISTE | Lê config da igreja para um agente. Admin-only. |
| `upsert_church_agent_config()` | ✅ EXISTE | Salva config. Admin-only. |
| `reset_church_agent_config()` | ✅ EXISTE | Zera custom_instructions. |
| `is_ekthos_admin()` | ✅ EXISTE | Valida admin via JWT app_metadata. |
| `auth_church_id()` | ✅ EXISTE | Retorna church_id do JWT. |
| `activate_agent()` / `pause_agent()` | ✅ EXISTE | Lifecycle. |
| EF `admin-agent-config` | ❌ INEXISTENTE | Nenhuma EF admin para config. |

### 1.5 Estado dos 3 agentes premium

| Agente | EF local? | Linhas | Tipo | Cron ativo? | Invoc. 30d | Template DB? | Deployed? |
|--------|-----------|--------|------|-------------|-----------|-------------|-----------|
| agent-acolhimento | ✅ | 703 | REAL | ✅ `*/30 * * * *` | 0 | ✅ | ✅ v18 |
| agent-reengajamento | ✅ | 433 | REAL* | ✅ stub (9h diário) | 0 | ❌ | ✅ v14 |
| agent-operacao | ❌ | — | INEXISTENTE | ❌ | 0 | ❌ | ❌ |

*Real = tem lógica real de detecção de afastados, mas sem automação completa (ver 1.9).

**Achado crítico:** `agent-operacao` é um fantasma de catálogo com R$390 de preço e 0 código. Qualquer cliente que tentar usar recebe 404. → Decisão D10 (ver seção 8).

### 1.6 Agentes internos (inclusos)

| Slug | EF? | Linhas | Modelo | Cache ephemeral? | Status |
|------|-----|--------|--------|-----------------|--------|
| agent-cadastro | ✅ | 299 | Haiku 4.5 ✅ | ✅ | ✅ OK |
| agent-onboarding | ✅ | 329 | Haiku 4.5 ✅ | ❌ | ⚠️ Sem cache |
| agent-suporte | ✅ | 264 | Haiku 4.5 ✅ | ❌ | ⚠️ Sem cache |
| agent-config | ❌ | — | — | — | 🗑️ STUB (404) |

### 1.7 Cockpit admin para agentes

**Estado: BACKEND 99% PRONTO. FRONTEND 0% IMPLEMENTADO.**

RPCs existem e funcionam. Nenhum componente React as chama. A rota `/admin/cockpit/igrejas/:id/agentes/:slug` não existe no frontend. 7 EFs admin deployadas — nenhuma para config de agentes.

### 1.8 Hardcoding em `agent-acolhimento`

**Pronto para multi-tenant:** busca `get_agent_prompt_resolved` com fallback graceful ✅, cache ephemeral em 2 blocos ✅, histórico isolado por `conversation_id` ✅.

**Ainda hardcoded:**

| Item | Valor | Linha | Prioridade |
|------|-------|-------|------------|
| Régua follow-up (D+0..D+90) | Narrativa em SYSTEM_BLOCK_A | 81-87 | 🔴 ALTA — Decisão 104 |
| Freq. máx. envio | 1/dia, 3/semana (narrativa) | 106-107 | 🔴 ALTA |
| Condições de parada | Narrativa semântica | 121, 128 | 🔴 ALTA |
| Escalonamento pastoral | Semântico (sem handoff ativo) | 108, 127 | 🔴 ALTA |
| Modelo Claude | `claude-sonnet-4-6` (literal) | 44 | 🟡 MÉDIA |
| Histórico conversa | 20 msgs | 566 | 🟢 BAIXA |
| Rate limit inbound | 5 em 5 min | 516 | 🟢 BAIXA |

**Risco escalonamento:** Handoff pastoral puramente semântico — Claude para de responder, mas `conversations.ownership` não muda e ninguém é notificado ativamente. Silencioso em caso de falha de reasoning.

### 1.9 Reengajamento Profundo — Estado Real

*(Achado do Subagent G — auditoria complementar 05/05/2026)*

#### 1.9.1 agent-reengajamento — O que existe hoje

O arquivo (`433 linhas`) é uma **implementação real** — não stub. Contém:

- **Detecção de afastados** (l.117): `last_contact_at < 7 dias` + `optout=false` + `deleted_at IS NULL`
- **Classificação de urgência** (l.73-85): `away_7d` 🟢, `away_14d` 🟡, `away_21d` 🟠, `away_30d` 🔴
- **Identificação de sensíveis** (l.87-92): escaneia `observacoes_pastorais` e `tags` para keywords (luto, falecimento, doença, hospital, etc.) — esses casos **não são automatizados**
- **Cadência de contato** (l.156): máx. 1 mensagem por pessoa a cada 7 dias via `reengagement_last_sent_at`
- **System prompt dinâmico** (l.190-248): injeta lista de afastados, classificação, observações, instruções de tom pastoral
- **Modo:** Chat SSE com pastor — não automático. O agente espera o pastor dizer "gere mensagens para os afastados" e então produz rascunhos.
- **Faltam:** `cache_control: {type: 'ephemeral'}` ⚠️, `get_agent_prompt_resolved()` ⚠️, automação cron real ⚠️

#### 1.9.2 Como rastrear "pessoa sumiu" hoje

Campos em `people` relevantes:

| Campo | Tipo | Uso |
|-------|------|-----|
| `last_contact_at` | timestamptz | Último contato WhatsApp/conversa |
| `last_attendance_at` | timestamptz | Última presença em culto |
| `reengagement_last_sent_at` | timestamptz | Última mensagem de reengajamento enviada |
| `reengagement_status` | text | Status (não usado pelo agente atual) |
| `observacoes_pastorais` | text | Anotações do pastor |
| `tags` | text[] | Etiquetas (inclui casos sensíveis) |
| `optout` | boolean | Bloqueio de contato |
| `celula_id` | uuid | Célula do membro |

**Lógica atual:** `MAX(last_contact_at, last_attendance_at)` → filtra quem sumiu há N dias. Funciona se os campos estiverem atualizados (risco: `last_attendance_at` pode estar desatualizado se não houver pipeline de update automático por check-in).

#### 1.9.3 Cron existente

Job `agent-reengajamento-scan`:
- Schedule: `0 9 * * *` (9h diariamente) ✅ ATIVO
- Comando: `SELECT 1; /* Sprint 3: implementar scan de inativos reengajamento */`
- **Status: STUB — não faz nada. O cron existe, a lógica não.**

#### 1.9.4 acolhimento_journey — Pode ser reutilizada?

**NÃO há coluna `trigger_type` em `acolhimento_journey`.** A tabela tem um CHECK constraint que fixa `current_touchpoint = ANY (ARRAY['D+0', 'D+3', 'D+7', 'D+14', 'D+30', 'D+60', 'D+90'])` — não aceita `RE+15`, `RE+30`, etc.

A tabela foi **desenhada exclusivamente para onboarding**. Reutilizá-la para reengajamento exigiria:
1. Adicionar `trigger_type` (quebraria constraint ou exigiria migration)
2. Estender enum de `current_touchpoint` (quebraria CHECK constraint)
3. Lidar com jornadas recorrentes (reengajamento pode reiniciar múltiplas vezes)

**Decisão de design para Sprint 2A:**

| Opção | Vantagem | Desvantagem |
|-------|---------|------------|
| Reusar `acolhimento_journey` + `trigger_type` | Menos código | Migration necessária, semântica confusa, enum fixo |
| Nova tabela `reengagement_journey` | Isolamento limpo, campos específicos | Mais uma tabela |

**Recomendação técnica: tabela nova `reengagement_journey`.** Lógica distinta (cíclica vs linear, touchpoints variáveis, stop conditions diferentes).

#### 1.9.5 Touchpoints propostos para reengajamento

| Touchpoint | Dia desde sumiu | Tom | Objetivo |
|-----------|----------------|-----|----------|
| `RE+15` | 15 dias ausente | Leve, saudade | "Sentimos sua falta" |
| `RE+30` | 30 dias ausente | Preocupação genuína | "Queremos saber como você está" |
| `RE+60` | 60 dias ausente | Empatia, abertura | "Podemos ajudar de alguma forma?" |
| `RE+90` | 90 dias ausente | Suporte direto | Escalonar para contato humano |

**Stop conditions específicas de reengajamento:**
1. **Retornou:** `last_contact_at` ou `last_attendance_at` atualizado → cancela jornada automaticamente
2. **Opt-out:** `optout=true` → status `cancelled`
3. **Caso sensível:** keywords de luto/crise → **NÃO automatizar** → escalonar para pastor
4. **Falhas de contato:** 3 tentativas sem resposta → pausa 30 dias, reavalia
5. **Configurável por igreja:** `church_followup_config` para `agent-reengajamento` define quais touchpoints e limites

### 1.10 agent-operacao — Mapeamento Atual (Sprint 2B)

*(Achado do Subagent H — auditoria complementar 05/05/2026)*

**`agent-operacao` não existe como Edge Function. Está no catálogo como agente premium ativo com R$390/mês e retorna 404.**

**Catálogo:** slug `agent-operacao`, `active = true`, preço R$390, modelo Sonnet, `always_paid`.

**Tabelas operacionais existentes que seriam relevantes para Sprint 2B:**

| Tabela | Rows | Propósito |
|--------|------|-----------|
| `church_events` | 0 | Cultos, eventos, reuniões |
| `event_occurrences` | 0 | Ocorrências agendadas |
| `service_schedules` | 0 | Escalas de ministério |
| `service_schedule_assignments` | — | Pessoas em escalas |
| `cell_reports` | 0 | Relatórios de célula |
| `cell_members` | 0 | Membros de célula |
| `volunteers` | 1 | Cadastro de voluntários |
| `tasks` / `admin_tasks` | 0 / 0 | Tarefas administrativas |

**Tabelas operacionais que NÃO existem:** campus/filiais, operational_checklist, pipeline de doações estruturado.

**Conclusão:** Schema operacional ~85% estruturado. `agent-operacao` é o escopo do Sprint 2B inteiro — requer programa próprio de auditoria, design e implementação. **Fora do escopo Sprint 2A.**

**🚨 Bloqueador pré-go-live:** `agent-operacao` ativo no catálogo com preço alocado mas sem código → Decisão D10.

---

## 2. GAPS VS PROPOSTA FELIPE (DECISÃO 104) — Sprint 2A

### 2.1 Identidade da igreja

| Campo | Estado atual | Gap Sprint 2A |
|-------|-------------|---------------|
| Nome da igreja | `churches.name` ✅ | — |
| Nome do pastor | ❌ | Falta em `churches` ou `church_agent_config.pastor_name` |
| Missão/visão | ❌ | Agente não sabe o "porquê" da igreja |
| Valores da igreja | ❌ | Contexto pastoral ausente |
| Persona do agente | ❌ | Nome/apresentação configurável ausente |

### 2.2 Horários pastorais

| Elemento | Estado atual | Gap |
|----------|-------------|-----|
| Janela de envio | `send_window {start, end}` ✅ | Funcional |
| Horários de culto | `service_schedules` existe (0 rows) | Não linkado ao agente. Membro pergunta "que horas é o culto?" → agente não sabe. |

### 2.3 Tom de comunicação

| Elemento | Estado atual | Gap |
|----------|-------------|-----|
| Formalidade, emojis, versos, tópicos | ✅ Todos funcionam | — |
| Exemplos de voz da igreja | ❌ | Campo `voice_examples[]` não existe |
| Persona do agente (nome) | ❌ | `agent_name` não existe |

### 2.4 Follow-up — GAP CRÍTICO

**Régua D+0...D+90 hardcoded em narrativa** no SYSTEM_BLOCK_A de `agent-acolhimento`. Intervalos, limites e condições de parada não configuráveis por igreja.

### 2.5 Reengajamento — GAP CRÍTICO

**agent-reengajamento** tem lógica de detecção mas:
- Sem automação (cron é stub)
- Sem template no banco
- Sem `church_agent_config` multi-tenant
- Sem `cache_control: ephemeral`
- Sem integração com `church_followup_config`
- Régua RE+15/30/60/90 não existe — seria implementada na Onda E

### 2.6 Escalonamento pastoral — GAP CRÍTICO

Handoff semântico: agente para de responder, mas `conversations.ownership` não muda e nenhum pastor é notificado. Risco pastoral e legal.

### 2.7 Cockpit — GAP TOTAL

Backend 99% pronto. Frontend = 0%. Nenhuma tela no React chama as RPCs existentes.

---

## 3. PROPOSTA DE SCHEMA — Sprint 2A

### 3.1 `church_agent_config` — Expansão

```sql
ALTER TABLE public.church_agent_config
  ADD COLUMN IF NOT EXISTS agent_name        text,
  ADD COLUMN IF NOT EXISTS pastor_name       text,
  ADD COLUMN IF NOT EXISTS schedule_context  jsonb,
  ADD COLUMN IF NOT EXISTS voice_examples    text[],
  ADD COLUMN IF NOT EXISTS escalation_mode   text
    DEFAULT 'notify' CHECK (escalation_mode IN ('silent','notify','transfer'));
```

### 3.2 `church_followup_config` — NOVA (acolhimento E reengajamento)

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
  stop_on_no_response   int,
  stop_on_membership    boolean     NOT NULL DEFAULT false,
  custom_stop_conditions jsonb      DEFAULT '[]',
  active                boolean     NOT NULL DEFAULT true,
  updated_by            uuid        REFERENCES auth.users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (church_id, agent_slug)
);

ALTER TABLE public.church_followup_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY cfc_tenant ON public.church_followup_config
  FOR ALL USING (church_id = auth_church_id());
CREATE POLICY cfc_admin ON public.church_followup_config
  FOR ALL USING (is_ekthos_admin()) WITH CHECK (is_ekthos_admin());
CREATE POLICY cfc_service_role ON public.church_followup_config
  FOR ALL USING (true) WITH CHECK (true);
```

*Para `agent-reengajamento`, o seed default de `touchpoints` seria: `[{day:15}, {day:30}, {day:60}, {day:90}]`.*

### 3.3 `reengagement_journey` — NOVA (separado de acolhimento_journey)

```sql
CREATE TABLE public.reengagement_journey (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  church_id             uuid        NOT NULL REFERENCES churches(id),
  person_id             uuid        NOT NULL REFERENCES people(id),
  started_at            timestamptz NOT NULL DEFAULT now(),
  current_touchpoint    text,       -- RE+15, RE+30, RE+60, RE+90
  next_touchpoint_at    timestamptz,
  touchpoints_sent      jsonb       NOT NULL DEFAULT '[]',
  responses_received    jsonb       NOT NULL DEFAULT '[]',
  days_absent           int,        -- dias ausente quando jornada iniciou
  is_sensitive_case     boolean     NOT NULL DEFAULT false,
  pastoral_notes        text,
  status                text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','completed','cancelled','paused')),
  stop_reason           text,
  cancelled_reason      text,
  completed_at          timestamptz,
  iteration             int         NOT NULL DEFAULT 1, -- suporta múltiplas rodadas
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reengagement_journey_next ON public.reengagement_journey
  (next_touchpoint_at) WHERE status = 'pending';
CREATE INDEX idx_reengagement_journey_church ON public.reengagement_journey (church_id, status);

ALTER TABLE public.reengagement_journey ENABLE ROW LEVEL SECURITY;

CREATE POLICY rej_tenant ON public.reengagement_journey
  FOR ALL USING (church_id = auth_church_id());
CREATE POLICY rej_admin ON public.reengagement_journey
  FOR ALL USING (is_ekthos_admin()) WITH CHECK (is_ekthos_admin());
CREATE POLICY rej_service_role ON public.reengagement_journey
  FOR ALL USING (true) WITH CHECK (true);
```

**Diferenças vs `acolhimento_journey`:**
- `iteration` suporta jornadas recorrentes (pessoa some, volta, some de novo)
- `is_sensitive_case` flag para impedir automação em casos delicados
- `status: 'paused'` (além de pending/processing/completed/cancelled)
- `days_absent` captura contexto de quando iniciou
- `stop_reason` separado de `cancelled_reason`

### 3.4 `church_escalation_rules` — NOVA

```sql
CREATE TABLE public.church_escalation_rules (
  church_id               uuid        NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  agent_slug              text        NOT NULL,
  sentiment_triggers      text[]      NOT NULL DEFAULT ARRAY['distressed'],
  category_triggers       text[]      NOT NULL DEFAULT ARRAY['handoff_humano'],
  no_response_days        int         DEFAULT NULL,
  escalation_contacts     jsonb       NOT NULL DEFAULT '[]',
  notify_method           text        NOT NULL DEFAULT 'internal_notification'
    CHECK (notify_method IN ('internal_notification','whatsapp','both')),
  pause_journey_on_escalation boolean NOT NULL DEFAULT true,
  updated_by              uuid        REFERENCES auth.users(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (church_id, agent_slug)
);

ALTER TABLE public.church_escalation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY cer_tenant ON public.church_escalation_rules
  FOR ALL USING (church_id = auth_church_id());
CREATE POLICY cer_admin ON public.church_escalation_rules
  FOR ALL USING (is_ekthos_admin()) WITH CHECK (is_ekthos_admin());
CREATE POLICY cer_service_role ON public.church_escalation_rules
  FOR ALL USING (true) WITH CHECK (true);
```

### 3.5 `churches` — Campos de identidade pastoral

```sql
-- VERIFICAR colunas existentes antes de aplicar (auditar churches schema)
ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS pastor_name         text,
  ADD COLUMN IF NOT EXISTS mission_statement   text,
  ADD COLUMN IF NOT EXISTS church_values       text[],
  ADD COLUMN IF NOT EXISTS avg_attendance      int,
  ADD COLUMN IF NOT EXISTS founding_year       int;
```

### 3.6 Atualizar `get_agent_prompt_resolved` — Novos placeholders

**Regra de compatibilidade:** Placeholders não resolvidos retornam `''` (string vazia) — nunca NULL, nunca literal `{{placeholder}}`. Toda adição é aditiva: igrejas sem config continuam funcionando com fallback.

Novos placeholders a suportar:
- `{{pastor_name}}`, `{{agent_name}}`, `{{schedule_context}}`
- `{{followup_touchpoints}}` (touchpoints habilitados da `church_followup_config`)
- `{{stop_conditions}}` (condições de parada da `church_followup_config`)
- `{{escalation_mode}}` (modo de escalonamento da `church_escalation_rules`)

---

## 4. PROPOSTA DE RPCs NOVAS — Sprint 2A

| RPC | Ação | Auth |
|-----|------|------|
| `get_followup_config(church_id, agent_slug)` | Lê config follow-up (ou defaults) | Admin |
| `upsert_followup_config(church_id, agent_slug, config)` | Salva config follow-up | Admin |
| `get_escalation_rules(church_id, agent_slug)` | Lê regras de escalonamento (ou defaults) | Admin |
| `upsert_escalation_rules(church_id, agent_slug, rules)` | Salva regras escalonamento | Admin |
| `get_church_identity(church_id)` | Lê campos identidade da church | Admin |
| `update_church_identity(church_id, fields)` | Atualiza identidade | Admin |
| `preview_resolved_prompt(church_id, agent_slug)` | Retorna prompt final para preview no cockpit | Admin |
| `trigger_test_message(church_id, agent_slug, phone)` | Dispara mensagem de teste | Admin |
| `get_reengagement_journey(church_id, filters)` | Lê jornadas de reengajamento | Admin |

**Existentes que NÃO precisam ser recriadas:** `get_agent_prompt_resolved` ✅, `upsert_church_agent_config` ✅, `reset_church_agent_config` ✅, `get_church_agent_config` ✅.

---

## 5. COCKPIT EM 7 ABAS — Sprint 2A

**Rota:** `/admin/cockpit/igrejas/:church_id/agentes/:agent_slug`

| Aba | Conteúdo | Salva via |
|-----|---------|-----------|
| **1 — Identidade** | agent_name, pastor_name, missão, denominação, valores | `update_church_identity` + `upsert_church_agent_config` |
| **2 — Prompt + Tom** | formality, pastoral_depth, emoji_usage, versículos, tópicos proibidos, voice_examples[], custom_instructions + preview modal + "Voltar ao padrão" | `upsert_church_agent_config` + `reset_church_agent_config` |
| **3 — Follow-up** | Régua visual de touchpoints (toggle por dia), max_per_day, max_per_week, stop_on_no_response | `upsert_followup_config` |
| **4 — Escalonamento** | Modo (silent/notify/transfer), sentimentos que disparam, lista de contatos (nome+telefone+papel), método de notificação | `upsert_escalation_rules` |
| **5 — Canais** | WhatsApp channels da igreja, status, saúde, teste de conexão | Read-only + `list_church_channels` |
| **6 — Testes** | Formulário de disparo, histórico últimas 5 mensagens do agente | `trigger_test_message` |
| **7 — Histórico** | Últimas 50 entradas de journey (acolhimento ou reengajamento), filtros por status | Read-only `get_reengagement_journey` |

---

## 6. PLANO EM ONDAS — Sprint 2A

### Onda A: Schema + Migrations (4-6h)
**Pré-requisito:** Validação Felipe das decisões D1-D9.

1. Auditar colunas existentes de `churches` (evitar duplicação)
2. `ALTER TABLE churches ADD COLUMN pastor_name, mission_statement, church_values[], avg_attendance, founding_year`
3. `ALTER TABLE church_agent_config ADD COLUMN agent_name, schedule_context, voice_examples[], escalation_mode`
4. `CREATE TABLE church_followup_config` (RLS com `is_ekthos_admin()`)
5. `CREATE TABLE reengagement_journey` (RLS, indexes em next_touchpoint_at e church_id)
6. `CREATE TABLE church_escalation_rules` (RLS com `is_ekthos_admin()`)
7. Seeds de `church_followup_config` para igreja de teste (acolhimento defaults + reengajamento defaults)
8. Seed de `agent_prompt_templates` para `agent-reengajamento` (template vazio/placeholder)
9. Todas as migrations idempotentes: `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`

### Onda B: RPCs Backend (4-6h)
**Pré-requisito:** Onda A completa.

1. UPDATE de `get_agent_prompt_resolved` → novos placeholders (regra: aditivos, fallback `''`)
2. `get_followup_config` / `upsert_followup_config`
3. `get_escalation_rules` / `upsert_escalation_rules`
4. `get_church_identity` / `update_church_identity`
5. `preview_resolved_prompt`
6. `trigger_test_message` (fire-and-forget para EF)
7. `get_reengagement_journey`
8. Teste SQL direto de cada RPC

### Onda C: Cockpit Frontend 7 abas (10-14h)
**Pré-requisito:** Onda B completa. Paralelo com Onda D.

1. Rota + layout base `/admin/cockpit/igrejas/:church_id/agentes/:agent_slug`
2. Aba 1 — Identidade
3. Aba 2 — Prompt + Tom (form + preview modal via `preview_resolved_prompt` + "Voltar ao padrão")
4. Aba 3 — Follow-up (componente régua visual com toggle por touchpoint)
5. Aba 4 — Escalonamento (lista dinâmica de contatos)
6. Aba 5 — Canais (read-only)
7. Aba 6 — Testes (formulário + histórico)
8. Aba 7 — Histórico (tabela journey read-only)
*Design system Ekthos: sidebar #161616, cream #f9eedc, vermelho #e13500, Playfair + DM Sans*

### Onda D: Migrar agent-acolhimento hardcoded → config (4-5h)
**Pré-requisito:** Onda B completa. Paralelo com Onda C.

**Estratégia de rollout:** Feature flag via `church_agent_config.active` — igrejas sem config continuam com fallback hardcoded. Zero breaking change.

1. Ler `church_followup_config` no handler (Camada nova)
2. Substituir `SYSTEM_BLOCK_A` narrativo por template do banco (já usa RPC)
3. Injetar `{{followup_touchpoints}}`, `{{stop_conditions}}`, `{{pastor_name}}`, `{{schedule_context}}`
4. Implementar handoff ativo: `escalation_mode = 'notify'` → UPDATE `conversations.ownership` + INSERT `internal_notifications`
5. Ler `church_escalation_rules` para decidir comportamento com `distressed`
6. Verificar: igrejas sem config → fallback hardcoded preservado
7. Adicionar env var `ANTHROPIC_SONNET_MODEL` (agora hardcoded como `claude-sonnet-4-6`)
8. Deploy + teste comparativo (mesma mensagem com e sem config)
9. `config.toml` já tem `[functions.agent-acolhimento] verify_jwt = false` ✅

### Onda E: Implementar agent-reengajamento completo (11-14h)
**Pré-requisito:** Ondas A + B completas. Resposta de D3 e D7.

1. Ler código existente de 433 linhas para entender lógica atual completa
2. Criar template de prompt base em `agent_prompt_templates` para `agent-reengajamento` (D7: Felipe revisa)
3. Adaptar EF para usar `get_agent_prompt_resolved()` (multi-tenant)
4. Adicionar `cache_control: {type: 'ephemeral'}` no system prompt (hoje ausente)
5. Implementar automação cron: `agent-reengajamento-scan` (hoje stub `SELECT 1`) →
   - Varrer `people` com `MAX(last_contact_at, last_attendance_at) < now() - INTERVAL X days`
   - Respeitar `church_followup_config.touchpoints` por igreja
   - INSERT em `reengagement_journey` para quem não tem jornada ativa
   - Agendar `next_touchpoint_at` conforme régua
6. Implementar stop conditions automáticas (retornou, opt-out, caso sensível, falhas)
7. Implementar escalonamento: casos sensíveis → INSERT `internal_notifications`
8. `config.toml`: confirmar `[functions.agent-reengajamento] verify_jwt = false`
9. Deploy `--no-verify-jwt`
10. Teste E2E: simular pessoa sumida há 15 dias → cron detecta → notificação → caso sensível → escalonamento

### Onda F: Testes E2E com 2 igrejas mock distintas (3-4h)
**Pré-requisito:** Ondas C + D + E completas.

**Setup:**
- Igreja A: formal, deep, Assembleia, sem emojis, régua D+0/7/30 + RE+15/60
- Igreja B: informal, light, Batista, emojis moderados, régua D+0/3/14/30 + RE+30/90

**Testes:**
- T1: Mesma mensagem → respostas distintas por igreja (tom, versos)
- T2: Escalonamento → cada igreja notifica contatos distintos
- T3: Horário de culto → cada agente responde com horário correto
- T4: Follow-up D+3 → só dispara para igrejas com D+3 habilitado
- T5: Reengajamento RE+15 → só dispara para igrejas com RE+15 habilitado
- T6: Caso sensível → não automatiza, escalonamento correto

---

## 7. RISCOS — Sprint 2A

### R1 — Quebrar agent-acolhimento em produção (CRÍTICO)
Cron ativo (*/30). Onda D com feature flag + fallback hardcoded. Deploy em horário de baixo tráfego. Rollback = reverter flag. **Felipe aprova estratégia antes da Onda D.**

### R2 — Migration sem rollback
Migrations separadas por tabela, idempotentes. Testar em Supabase branch preview antes de produção.

### R3 — RLS e multi-tenancy
`get_agent_prompt_resolved` usa `row_security = 'off'` com `p_church_id` explícito — não busca da sessão. Auditar na Onda B antes de modificar.

### R4 — Compatibilidade com Sprint 1 (cascade Haiku→Sonnet)
`agent-haiku-triagem` chama `agent-acolhimento` como fire-and-forget. Onda D modifica apenas lógica interna — interface de entrada (payload JSON) não muda. Validado na Onda F/T6.

### R5 — Modelo Claude errado nas Ondas D e E (CRÍTICO)
`NUNCA usar claude-3-5-haiku-20241022` (descontinuado, retorna 404). Ondas D e E: `claude-sonnet-4-6` (acolhimento) e `claude-haiku-4-5-20251001` (reengajamento). Deploy sempre com `--no-verify-jwt`.

### R6 — Documentação canon ausente
`docs/00-formacoes.md` e `docs/02-arquitetura-tecnica.md` não existem. Única fonte: `CLAUDE.md`. Decisões D1-D9 validadas por Felipe devem ser registradas no `CLAUDE.md`.

### R7 — Compatibilidade com PASSO 8 (N8nAdapter futuro)
RPCs da Onda B usam SECURITY DEFINER + parâmetros explícitos — chamáveis por n8n via service_role JWT sem wrapper adicional. YAGNI: não criar EF wrapper agora.

### R8 — last_attendance_at desatualizado (reengajamento)
`agent-reengajamento` usa `last_attendance_at` para detectar ausência. Se não houver pipeline de update automático por check-in em culto, o campo pode estar desatualizado. Mitigação: Onda E usa `MAX(last_contact_at, last_attendance_at)` + documentar limitação.

---

## 8. DECISÕES AGUARDANDO VALIDAÇÃO FELIPE

**Nenhuma onda inicia sem confirmação destas:**

| # | Decisão | Opções | Recomendação |
|---|---------|--------|-------------|
| **D1** | Campos de identidade: expandir `churches` OR nova tabela `church_identity`? | `churches`: simples; Separada: mais limpa | Expandir `churches` |
| **D2** | Pastor acessa cockpit de config (alguma aba, leitura)? | Admin-only; Ou leitura parcial para pastor | Admin-only (Decisão 104) — confirmar |
| **D3** | Régua default de `agent-reengajamento`? Trigger: `last_seen > N dias`? | Proposta: RE+15/30/60/90, trigger > 14 dias | Aguardo Felipe |
| **D5** | Régua default acolhimento: D+0/3/7/14/30/60/90 para todos os planos? | Ou Avivamento habilita D+60 e D+90? | Aguardo Felipe |
| **D6** | Escalonamento default: `notify` (active handoff) ou `silent` (atual)? | `notify`: active; `silent`: atual | **Notify** — silent é risco pastoral |
| **D7** | Template de `agent-reengajamento`: eu esboço baseado nos 433 linhas e Felipe revisa? | Sim ou Felipe escreve | Recomendo: eu esboço + Felipe revisa |
| **D8** | D+60 e D+90 desabilitados por default. Plano afeta quais touchpoints disponíveis? | Sim por plano; Ou todos iguais | Aguardo Felipe |
| **D9** | `agent-config` stub (404): remover do catálogo? | Remover `active=false` ou implementar | **Remover** (não vai ser implementado agora) |
| **D10** | `agent-operacao` no catálogo com R$390 e 0 código: desativar até Sprint 2B? | **Opção A:** `active=false` no banco (silencioso); **Opção B:** badge "Em breve" + desabilitar checkout (requer frontend) | **Opção A** — go-live 09/05, não expor 404 |

*Nota: D4 (função de agent-operacao) removida — vira decisão de Sprint 2B.*

---

## 9. ESTIMATIVA REFINADA — Sprint 2A APENAS

| Onda | Escopo | Estimativa |
|------|--------|------------|
| Onda A | Schema + Migrations (3 novas tabelas + 2 alterações) | 4-6h |
| Onda B | RPCs Backend (9 novas + 1 update) | 4-6h |
| Onda C | Cockpit Frontend 7 abas | 10-14h |
| Onda D | Migrar agent-acolhimento hardcoded → config | 4-5h |
| Onda E | Implementar agent-reengajamento completo | 11-14h |
| Onda F | Testes E2E 2 igrejas mock distintas | 3-4h |
| **Total Sprint 2A** | | **36-49h** |

**Caminho crítico:**
```
Validação Felipe (D1-D10) →
  Onda A → Onda B →
    { Onda C ∥ Onda D } →
      Onda E →
        Onda F
```

**Com paralelização C∥D:** Sprint 2A completo em ~34-44h de trabalho efetivo.

**Maior risco de cronograma:** Onda E (agent-reengajamento, 11-14h) — mais incerteza por ser implementação nova com automação cron. Onda C (cockpit, 10-14h) é segunda maior.

**Sprint 2B** (agent-operacao completo): programa próprio futuro. Auditoria, design e estimativa específicos virão em Sprint 2B/Fase 0 separada.

---

## 10. SPRINT 2B — agent-operacao COMPLETO (Programa Próprio Futuro)

**Fora do escopo de Sprint 2A.** Mapeamento apenas.

`agent-operacao` foi imaginado como orquestrador do ciclo operacional da igreja via WhatsApp. O schema operacional (~85% estruturado) já existe no banco. A implementação requer:

- Definição clara do escopo das 7 áreas (a ser feita por Felipe em Sprint 2B/Fase 0)
- Auditoria dedicada das tabelas operacionais
- Design do modelo de atendimento (inbound? cron? trigger-based?)
- Template de prompt específico
- Testes com dados operacionais reais

**Pré-requisitos para Sprint 2B:**
1. Sprint 2A concluído (base multi-tenant estável)
2. Pelo menos 1 igreja em produção com dados operacionais reais
3. Felipe define as 7 áreas e priorização

**Ação imediata necessária:** Decisão D10 — desativar `agent-operacao` no catálogo (`active = false`) para evitar 404 em produção até Sprint 2B. **Aguardando confirmação Felipe.**

---

## APÊNDICE — Achados adicionais

1. **`agent-onboarding` e `agent-suporte`** sem `cache_control: ephemeral` — backlog fácil, ~30min por agente, economiza ~25% em tokens.
2. **`subscription_agents.active` + `activation_status`** duplicados — unificar em próxima migration de limpeza.
3. **Zero auditoria de uso:** `agent_credit_usage` vazia — nenhuma EF registra tokens Anthropic (PENDÊNCIA SPRINT 2A já cravada).
4. **Canon:** `docs/00-formacoes.md` e `docs/02-arquitetura-tecnica.md` não existem — única fonte é `CLAUDE.md`.

---

*Gerado por: 9 subagents paralelos (Haiku): A-F (fundadora 05/05) + G, H, I-consolidação (complementar 05/05)*
*Status: Aguardando validação Felipe (D1-D10) para iniciar Onda A*
*Sprint 2B — agent-operacao: programa próprio futuro, após Sprint 2A estável*
