# CANON.md — Arquitetura Canônica dos Agentes Ekthos

> Documento de referência permanente para a arquitetura de agentes de IA da plataforma Ekthos.
> Toda decisão de implementação de agente deve ser consistente com o que está aqui.
> Atualizado: 2026-05-21

---

## O QUE É O MOTOR EKTHOS

O motor Ekthos é um **sistema operacional pastoral** — não um conjunto de bots.

Analogia: assim como um SO executa programas de múltiplos usuários em isolamento, o motor Ekthos executa agentes pastorais para múltiplas igrejas em isolamento completo de dados, com personalização por tenant.

**Princípio fundamental:** o motor é compartilhado, o contexto é isolado.

---

## ARQUITETURA EM 3 CAMADAS

### Camada 1 — Motor Compartilhado

Código idêntico para todas as igrejas. Nenhum dado de uma igreja vaza para outra.

Componentes:
- Edge Functions Deno (runtime compartilhado)
- `_shared/anthropic-client.ts` — cliente Anthropic centralizado com `MODELS.haiku` / `MODELS.sonnet`
- `_shared/supabase-client.ts` — service_role para bypass intencional de RLS
- `demand-router` — roteador de mensagens WhatsApp por church_id
- `whatsapp-webhook` / `whatsapp-attendant` — camada de entrada/saída WhatsApp

### Camada 2 — Contexto Isolado por Church

Cada church tem seus próprios dados, nunca compartilhados com outras churches:
- `church_agent_config` — configurações de personalização do agente (formality, pastoral_depth, emoji_usage, etc.)
- `church_whatsapp_channels` — canais WhatsApp provisionados pela igreja
- `conversations` / `messages` — histórico de conversas (sempre filtrado por `church_id`)
- `people` / `pipeline_stages` / `groups` — dados pastorais da congregação

### Camada 3 — Personalização em 3 Subcamadas

Para cada church + agent_slug, o prompt final é resolvido pela RPC `get_agent_prompt_resolved`:

```
base_prompt (agent_prompt_templates)
    ↓ substituição de {{placeholders}}
church_agent_config (formality, pastoral_depth, emoji_usage, denomination, send_window...)
    ↓ append se existir
custom_instructions (texto livre da liderança da igreja)
    ↓
resolved_prompt (enviado ao Anthropic)
```

**Invariante crítica:** church A nunca recebe base_prompt de church B. O `church_id` é validado em toda operação de leitura de contexto.

---

## CATÁLOGO DE AGENTES

### agent-suporte — Gratuito em todos os planos

- **Modelo:** `claude-haiku-4-5-20251001`
- **Função:** suporte ao membro via WhatsApp — FAQs, horários, endereço, informações gerais
- **Contexto:** lê dados da church (nome, endereço, horários de culto)
- **Gatilho:** mensagem entrada no canal WhatsApp + demand-router classifica como `suporte`

### agent-acolhimento — Premium Pastoral (R$290/mês)

- **Modelo:** `claude-sonnet-4-6` — DECISÃO INTENCIONAL Sprint 2 (01/05/2026)
- **Função:** acolhimento de visitantes e novos membros — primeira experiência pastoral
- **Contexto:** lê `people`, `conversations`, `church_agent_config`, histórico de interações
- **Gatilho:** demand-router classifica como `acolhimento` OU `visitor-capture` aciona diretamente
- **Razão do Sonnet:** resposta direta ao membro, valência emocional/espiritual alta, erro tem impacto pastoral real

### agent-reengajamento — Premium Pastoral (R$290/mês)

- **Modelo:** `claude-sonnet-4-6` — DECISÃO INTENCIONAL Sprint 2 (01/05/2026)
- **Função:** reengajamento de membros ausentes (>14 dias sem aparecer)
- **Contexto:** lê `people.last_seen`, pipeline stage, histórico de mensagens
- **Gatilho:** `agent-outbound-retry` + batch agendado
- **Razão do Sonnet:** mesmo critério que acolhimento — conversa sensível com membro ausente

### agent-haiku-triagem — Operacional

- **Modelo:** `claude-haiku-4-5-20251001`
- **Função:** triagem inicial de mensagens — classifica intenção antes de rotear
- **Nota:** PENDENTE — adicionar validação de ownership (church_id guard) como no agent-acolhimento (SA-7, OPS-DEBT futuro)

### agent-onboarding — Operacional

- **Modelo:** `claude-haiku-4-5-20251001`
- **Função:** guia a nova igreja pelos passos de onboarding via WhatsApp

### agent-cadastro, agent-escalas, agent-financeiro — Operacionais

- **Modelo:** `claude-haiku-4-5-20251001`
- **Função:** assistência operacional interna (cadastro de membros, escalas de serviço, financeiro)

---

## PADRÃO DE OWNERSHIP VALIDATION

Todo agente que acessa dados de uma church DEVE validar que a conversa pertence à church que está sendo processada.

**Padrão canônico (F2, agent-acolhimento v26):**

```typescript
// 1. Buscar conversa com filtro de church_id
const { data: conv } = await supabase
  .from('conversations')
  .select('id, church_id, contact_id')
  .eq('id', conversationId)
  .eq('church_id', churchId)  // ← guard obrigatório
  .single()

// 2. Validação explícita
if (!conv || conv.church_id !== churchId) {
  return new Response('Conversation not found or unauthorized', { status: 403 })
}
```

**Agentes que implementam:** agent-acolhimento ✅
**Agentes pendentes:** agent-haiku-triagem ⚠️ (SA-7)

---

## ROTEAMENTO DE MENSAGENS

```
WhatsApp →
  whatsapp-webhook (valida HMAC, resolve churchId via phone_number) →
    demand-router (classifica intenção via Haiku) →
      [suporte]       → agent-suporte
      [acolhimento]   → agent-acolhimento
      [cadastro]      → agent-cadastro
      [financeiro]    → agent-financeiro
      [escalas]       → agent-escalas
      [handoff]       → conversation-handoff (escalada humana)
      [unknown]       → agent-suporte (fallback)
```

O `demand-router` usa `claude-haiku-4-5-20251001` via `MODELS.haiku` do shared client.
**ATENÇÃO:** demand-router linha 245 ainda usa alias curto `'claude-haiku-3-5'` — OPS-DEBT-045, fix pendente.

---

## CANAIS WHATSAPP

Tabela de referência dos agentes: `church_whatsapp_channels`

| Campo | Descrição |
|---|---|
| `church_id` | tenant isolado |
| `zapi_instance_id` | ID da instância Z-API |
| `zapi_token` | token de autenticação Z-API (secret) |
| `phone_number` | número WhatsApp provisionado |
| `status` | `connected` / `connecting` / `error` / `disconnected` |
| `context_type` | `pastoral` (agent-acolhimento) ou `operacional` |

**IMPORTANTE — OPS-DEBT-044:** A UI do admin escreve em `church_channels` (tabela genérica), mas os agentes leem de `church_whatsapp_channels`. São tabelas distintas. Fix pendente.

---

## PERSONALIZAÇÃO POR CHURCH

### Campos de `church_agent_config`

| Campo | Valores válidos (CHECK) | Default |
|---|---|---|
| `formality` | `formal`, `proximo`, `caloroso`, `casual` | `caloroso` |
| `pastoral_depth` | `reservado`, `equilibrado`, `pastoral` | `equilibrado` |
| `emoji_usage` | `none`, `discrete`, `free` | `discrete` |
| `denomination` | texto livre | — |
| `preferred_verses` | array de texto | — |
| `send_window` | JSON `{start, end}` | 8h–21h |
| `custom_instructions` | texto livre | — |
| `custom_overrides` | JSON livre | — |

### Como os valores são resolvidos

A RPC `get_agent_prompt_resolved(p_church_id, p_agent_slug)` resolve os placeholders do `base_prompt` com os valores de `church_agent_config`. Migration `20260521000003` corrigiu gaps de CASE para todos os valores válidos dos CHECK constraints.

---

## ONBOARDING COMO NÚCLEO

O onboarding da nova igreja é o passo mais crítico da plataforma:

1. **admin-church-create** cria a church, o usuário pastor, popula metadados
2. `church_agent_config` é criado com defaults (sem configuração = defaults razoáveis)
3. `qr_codes` deve ser populado automaticamente — OPS-DEBT-040 (fix pendente)
4. Canal WhatsApp é configurado via cockpit → `provision-channel` → Z-API
5. Agentes ficam disponíveis para o pastor configurar via CRM

**OPS-DEBT-039:** pastor_name não é passado explicitamente ao admin-church-create — bug sistêmico pendente.

---

## INVARIANTES DO MOTOR (NUNCA VIOLAR)

1. **church_id em toda query** — sem exceção para tabelas de dados pastorais
2. **Sonnet apenas para agentes pastorais premium** — não regredir para Haiku por custo
3. **Model IDs canônicos** — usar sempre `MODELS.haiku` e `MODELS.sonnet` do shared client
4. **verify_jwt: false** em todas as EFs (ES256 incompatível com HS256)
5. **Ownership validation** em toda EF que acessa dados por ID externo
6. **Secrets via Vault** — nunca hardcoded em código ou EF

---

*Documento canônico — atualizar quando houver decisão arquitetural que afete a estrutura do motor.*
