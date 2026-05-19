# Passo 7.x — Migração Híbrida church_whatsapp_channels → church_channels

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **ESTE DOCUMENTO É FASE 1 — AUDITORIA APENAS. Felipe deve revisar e autorizar FASE 2 antes de qualquer implementação.**

**Goal:** Migrar 7 consumers da tabela legada `church_whatsapp_channels` para a nova `church_channels`, mantendo zero downtime via VIEW de compatibilidade.

**Architecture:** A tabela `church_channels` substitui `church_whatsapp_channels`. Como todos os 7 consumers existentes são read-only na tabela legada, a estratégia é: (1) augmentar `church_channels` com colunas faltantes, (2) migrar dados, (3) criar VIEW de compatibilidade com aliasing de colunas, (4) migrar cada consumer para apontar para `church_channels` diretamente, (5) deprecar a VIEW e dropar a tabela legada.

**Tech Stack:** PostgreSQL migrations (Supabase MCP), Deno/TypeScript (Edge Functions), `supabase functions deploy`

---

## Estado atual (04/05/2026) — Resultado da Auditoria Fase 1

### Git
- Branch de trabalho: `main` (PR #125 mergeado — security hardening completo)
- Próximo trabalho: nova branch `feat/passo-7x-channel-migration`

---

## Análise dos 8 Consumers

| EF | Lê cwc? | Escreve cwc? | Usa church_channels? | Criticidade | Colunas usadas de cwc |
|----|---------|--------------|----------------------|-------------|----------------------|
| **channel-dispatcher** | ✅ SELECT | ❌ | ❌ | 🔴 CRÍTICA (outbound) | channel_type, zapi_instance_id, zapi_token, active, session_status |
| **webhook-receiver** | ✅ SELECT | ❌ | ❌ | 🔴 CRÍTICA (inbound) | id, church_id, channel_type, active, zapi_instance_id |
| **_shared/agent-tools** | ✅ SELECT | ❌ | ❌ | 🔴 CRÍTICA (enqueue_message) | id, church_id, context_type, session_status, active |
| **dispatch-message** | ✅ SELECT | ❌ | ❌ | 🔴 CRÍTICA (legacy pipeline) | id, phone_number, channel_type, church_id, active |
| **test-whatsapp-message** | ✅ SELECT | ❌ | ❌ | 🟡 manutenção/teste | id, phone_number, zapi_instance_id, zapi_token, session_status, context_type, church_id, active, created_at |
| **stripe-webhook** | ✅ SELECT | ❌ | ❌ | 🔴 CRÍTICA (notif. opcional) | id, church_id, active |
| **conversation-send-message** | ✅ SELECT | ❌ | ❌ | 🔴 CRÍTICA (outbound humano) | id, phone_number, provider, instance_id, `token`⚠️ |
| **provision-whatsapp-channel** | ❌ | ❌ | ✅ SELECT + UPDATE | 🟡 setup/manutenção | N/A (já usa church_channels) |

**Conclusão:**
- **7/8 consumers leem de `church_whatsapp_channels`**
- **0/8 consumers escrevem em `church_whatsapp_channels`** → VIEW pura (sem triggers) é suficiente
- **1/8 já usa `church_channels`** (provision-whatsapp-channel) → migração já iniciada

### ⚠️ Risco: coluna `token` em conversation-send-message

O agente auditou `conversation-send-message` e reportou select de coluna `token`. Esta coluna **não existe** no schema de `church_whatsapp_channels` (existe `zapi_token`). Possibilidades:
- Bug silencioso: select retorna NULL para `token` mas código continua
- O código usa `.select('...zapi_token as token')` e o agente simplificou
- **Ação necessária antes de FASE 2:** Ler `conversation-send-message/index.ts` manualmente e confirmar a query exata.

---

## Mapeamento de Schema

### church_whatsapp_channels (27 colunas) vs church_channels (15 colunas)

| Coluna em `church_whatsapp_channels` | Coluna em `church_channels` | Compatível? | Observação |
|--------------------------------------|-----------------------------|-------------|------------|
| id | id | ✅ | UUID, PK em ambas |
| church_id | church_id | ✅ | FK → churches |
| channel_type | — | 🔴 cwc-only | cwc tem AMBOS `channel_type` e `provider`. Em cc, só `provider`. Precisa unificar. |
| provider | provider | ✅ | Mesmo campo; cwc nullable, cc NOT NULL |
| phone_number | phone_number | ✅ | cwc NOT NULL, cc nullable — atenção |
| instance_id | provider_instance_id | 🟡 rename | Mesmos valores, nomes diferentes |
| zapi_instance_id | provider_instance_id | 🟡 redundante | cwc tem os dois; instance_id já mapeado acima |
| display_name | display_name | ✅ | Idêntico |
| provider_label | display_name | 🟡 merge | cwc tem os dois; cc só display_name |
| status | status | ✅ | Mesmo default 'pending' |
| error_message | error_message | ✅ | Idêntico |
| last_provisioned_at | last_provisioned_at | ✅ | Idêntico |
| last_health_check | last_health_check | ✅ | Idêntico |
| metadata | metadata | ✅ | cwc nullable, cc NOT NULL DEFAULT '{}' |
| created_at | created_at | ✅ | cwc nullable, cc NOT NULL |
| updated_at | updated_at | ✅ | Idêntico NOT NULL |
| updated_by | updated_by | ✅ | Idêntico |
| **active** | ❌ ausente | 🔴 CRÍTICO | 6 consumers filtram por `active=true`. Precisa adicionar em cc. |
| **context_type** | ❌ ausente | 🔴 CRÍTICO | agent-tools roteia por context_type pastoral/etc. Precisa adicionar em cc. |
| **session_status** | ❌ ausente | 🔴 CRÍTICO | 4 consumers filtram/usam. Precisa adicionar em cc. |
| **zapi_token** | ❌ ausente | 🔴 CRÍTICO | channel-dispatcher e test-whatsapp-message precisam desta credencial. Precisa adicionar em cc. |
| zapi_instance_id | provider_instance_id | 🟡 mapeado | Já coberto pela coluna provider_instance_id |
| meta_phone_number_id | ❌ ausente | 🟡 Meta-only | Só necessário para canal Meta/WABA (não em uso ativo) |
| meta_waba_id | ❌ ausente | 🟡 Meta-only | Idem |
| meta_access_token | ❌ ausente | 🟡 Meta-only, sensível | Credencial Meta — pode ir em metadata JSONB |
| connected_by_user_id | ❌ ausente | 🟡 auditoria | Pode ir em metadata |
| notes | ❌ ausente | 🟡 texto livre | Pode ir em metadata |
| — | **agent_slugs** | 🆕 only-new | text[] NOT NULL DEFAULT '{}' — nova feature |

**Resumo:**
- ✅ **13 colunas idênticas** (mesma semântica, tipo compatível)
- 🟡 **6 colunas com rename/merge** (instance_id, channel_type/provider, provider_label/display_name)
- 🔴 **4 colunas CRÍTICAS ausentes em cc** (active, context_type, session_status, zapi_token)
- 🟡 **5 colunas de baixa prioridade ausentes** (meta_*, connected_by_user_id, notes)
- 🆕 **1 coluna nova em cc** (agent_slugs)

---

## Estado Atual dos Dados

| Tabela | Total | Ativos | Igrejas distintas |
|--------|-------|--------|-------------------|
| church_whatsapp_channels | **4** | 2 (active=true) | 2 |
| church_channels | **1** | — | 1 |

### Rows SÓ na legada (sem correspondência em cc por church_id + provider_instance_id)

Todos os 3 rows da igreja `62e473b8` (church principal de Felipe) não têm match em `church_channels`:

| id | channel_type | provider | active | session_status | phone |
|----|-------------|----------|--------|----------------|-------|
| `4c98c87a` | chatpro | chatpro | false | active | +5521993092146 |
| `4fea2161` | zapi | zapi | **true** | active | +5521993092146 ← **CANAL ATIVO DE PRODUÇÃO** |
| `e2397078` | mock | mock | false | testing | +5511900000001 |

### Row com match (já parcialmente migrado)

Igreja `184fd750` tem 1 row em cwc que bate com o único row em church_channels:
- cwc: `instance_id = 3F28840B3A853234BB5A463A5A856F80` (zapi)
- cc: `provider_instance_id = 3F28840B3A853234BB5A463A5A856F80` (provision feita via EF)

**⚠️ Importante:** O row em `church_channels` tem `status='pending'` e `agent_slugs=['agent-reengajamento']`. O row correspondente em cwc tem `active=true, session_status=active`. A VIEW precisará expor isso corretamente.

---

## Recomendação Final de Caminho

### B.1 — VIEW pura (church_whatsapp_channels → VIEW sobre church_channels)
**Factível?** ❌ **NÃO hoje** — 4 colunas críticas ausentes em church_channels.
**Factível após augmentação?** ✅ **SIM** — após adicionar active, context_type, session_status, zapi_token.

### B.2 — VIEW updatable com INSTEAD OF triggers
**Necessário?** ❌ **NÃO** — nenhum consumer escreve em cwc. Triggers de INSTEAD OF INSERT/UPDATE/DELETE não são necessários.

### B.3 — Dual write com triggers na tabela legada
**Necessário?** ❌ **NÃO** — nenhum consumer escreve em cwc. Não há sincronização a manter.

### ✅ Caminho Proposto: Augmentação + Migração de Dados + VIEW de Compat

```
FASE 2A: Augmentar church_channels
  → ADD COLUMN active boolean DEFAULT true
  → ADD COLUMN context_type text DEFAULT 'pastoral'
  → ADD COLUMN session_status text NOT NULL DEFAULT 'disconnected'
  → ADD COLUMN zapi_token text  (credencial — avaliar se vai em col ou metadata)

FASE 2B: Migrar dados cwc → cc
  → INSERT INTO church_channels SELECT ... FROM church_whatsapp_channels
    (com mapeamento: channel_type→provider, instance_id→provider_instance_id, etc.)
  → ON CONFLICT (church_id, provider_instance_id) DO UPDATE

FASE 2C: VIEW de compatibilidade (para consumers legados)
  → CREATE VIEW church_whatsapp_channels_compat AS
    SELECT 
      id, church_id,
      provider AS channel_type,       -- alias reverso
      provider AS provider,
      phone_number,
      provider_instance_id AS instance_id,
      provider_instance_id AS zapi_instance_id,
      zapi_token,
      display_name,
      display_name AS provider_label,
      active,
      context_type,
      session_status,
      status,
      error_message,
      last_provisioned_at,
      last_health_check,
      metadata,
      created_at,
      updated_at,
      updated_by
    FROM church_channels;

FASE 2D: Migrar consumers (um por um)
  → channel-dispatcher
  → webhook-receiver
  → _shared/agent-tools (enqueue_message)
  → dispatch-message
  → test-whatsapp-message
  → stripe-webhook
  → conversation-send-message (após resolver risco token⚠️)

FASE 2E: Drop church_whatsapp_channels (após todos migrados)
  → DROP TABLE church_whatsapp_channels CASCADE
  → DROP VIEW church_whatsapp_channels_compat
```

---

## Riscos e Mitigações

| # | Risco | Severidade | Mitigação |
|---|-------|-----------|-----------|
| R1 | `zapi_token` é credencial sensível — mover para coluna expõe em logs | 🔴 Alta | Avaliar encriptar em metadata JSONB ou usar Vault do Supabase. Decidir antes de FASE 2A. |
| R2 | `conversation-send-message` usa coluna `token` não confirmada no schema | 🔴 Alta | Ler o arquivo manualmente e confirmar antes de FASE 2D. |
| R3 | Canal ativo de produção (+5521993092146, zapi, `4fea2161`) não pode ter downtime | 🔴 Alta | FASE 2B deve migrar este row primeiro. Validar session_status='active' preservado. |
| R4 | `channel_type` e `provider` são redundantes em cwc — valor pode divergir | 🟡 Média | Verificar rows onde channel_type != provider antes de migrar. Query de sanidade em FASE 2B. |
| R5 | `provision-whatsapp-channel` já escreve em `church_channels` sem as novas colunas | 🟡 Média | Após FASE 2A, atualizar provision-whatsapp-channel para preencher active, context_type, session_status. |
| R6 | Meta credentials (meta_access_token, etc.) não têm destino claro em cc | 🟢 Baixa | Guardar em `metadata JSONB` até decisão sobre canal Meta. Não bloqueia migração zapi/chatpro. |
| R7 | Row em cc para church `184fd750` tem status='pending' mas cwc tem session_status='active' | 🟡 Média | FASE 2B deve UPDATE este row para alinhar active=true, session_status='active'. |

---

## Pré-condição para FASE 2 (Felipe deve validar)

- [ ] Confirmar coluna `token` em `conversation-send-message`: ler arquivo e reportar query exata
- [ ] Decidir storage de `zapi_token` em `church_channels`: coluna direta vs metadata JSONB
- [ ] Confirmar que `channel_type` é redundante com `provider` (verificar se algum consumer usa channel_type para lógica diferente de provider)
- [ ] Definir valor de `context_type` para rows migrados (default 'pastoral' é correto?)
- [ ] Autorizar FASE 2

---

## Arquivos que serão tocados na FASE 2 (preview)

| Arquivo | Ação | Motivo |
|---------|------|--------|
| `supabase/migrations/20260504100007_augment_church_channels.sql` | Create | ADD COLUMN active, context_type, session_status, zapi_token em church_channels |
| `supabase/migrations/20260504100008_migrate_cwc_to_cc.sql` | Create | INSERT/UPDATE dados de cwc → cc |
| `supabase/functions/channel-dispatcher/index.ts` | Modify | SELECT de church_channels com novos column names |
| `supabase/functions/webhook-receiver/index.ts` | Modify | SELECT de church_channels |
| `supabase/functions/_shared/agent-tools.ts` | Modify | enqueue_message: SELECT de church_channels |
| `supabase/functions/dispatch-message/index.ts` | Modify | SELECT de church_channels |
| `supabase/functions/test-whatsapp-message/index.ts` | Modify | SELECT de church_channels |
| `supabase/functions/stripe-webhook/index.ts` | Modify | SELECT de church_channels |
| `supabase/functions/conversation-send-message/index.ts` | Modify | SELECT de church_channels (após resolver R2) |
| `supabase/functions/provision-whatsapp-channel/index.ts` | Modify | Preencher novos campos active, context_type, session_status no INSERT/UPDATE |
