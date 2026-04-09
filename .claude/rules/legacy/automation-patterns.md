# Rule: Padrões de Automação

> **Versão:** 1.0.0 | **Status:** Ativo — produção | **Revisão:** 2026-04-07

---

## 1. Decisão: n8n vs Supabase Trigger vs Edge Function Schedulada

Antes de implementar qualquer automação, o `ekthos-chief-architect` é consultado (MODO=EVALUATE). A tabela abaixo serve como guia para a decisão:

| Critério | n8n Workflow | Supabase Database Trigger | Edge Function Schedulada |
|---|---|---|---|
| **Latência tolerada** | segundos a minutos | milissegundos (síncrono) | minutos |
| **Complexidade** | alta (multi-passo, branching) | baixa (ação direta no banco) | média |
| **Retry nativo** | sim (com configuração) | não (executa uma vez) | não (deve implementar) |
| **Visibilidade** | alta (UI do n8n) | baixa (log de DB) | média (logs do Supabase) |
| **Tenant isolation** | via church_id no payload | via RLS da sessão | via church_id na função |
| **Caso de uso típico** | campanhas, follow-ups, relatórios | denormalização, contadores | limpeza, sincronização periódica |
| **Custo de falha** | tolerável (retry) | crítico (transação) | tolerável (reagenda) |
| **Depende de API externa** | sim (com credencial via Vault) | não (apenas banco) | sim (com credencial via Vault) |

### Regra de decisão rápida

```
É uma reação imediata a um evento de banco (INSERT/UPDATE/DELETE)?
  → Supabase Database Trigger (APENAS para operações simples e rápidas)

É um fluxo com múltiplos passos, condições e possível retry?
  → n8n Workflow (trigger via webhook do Supabase ou schedule)

É uma tarefa periódica sem complexidade de fluxo?
  → Edge Function com Supabase cron (pg_cron) ou n8n schedule

Envolve chamada a API externa?
  → n8n Workflow (com retry nativo) + Edge Function para a chamada segura
```

---

## 2. Padrão de Workflow n8n

### Estrutura obrigatória de todo workflow

```
1. TRIGGER
   ├── Webhook (recebe evento do Supabase ou sistema externo)
   ├── Schedule (cron expression)
   └── Manual (para testes e reprocessamento)

2. VALIDAÇÃO INICIAL
   ├── Verifica presença de church_id no payload
   ├── Verifica onboarding_completed do tenant
   └── Verifica módulo habilitado para o tenant

3. AUTENTICAÇÃO
   └── Carrega credencial via referência no n8n Credential Store
       (nunca hard-coded no workflow)

4. EXECUÇÃO COM ISOLAMENTO
   ├── Toda operação inclui church_id
   └── Chamadas a Edge Functions incluem Authorization Bearer

5. RESULTADO
   ├── Sucesso → INSERT em audit_logs via Edge Function
   └── Falha → INSERT em webhook_failures, notifica equipe

6. CLEANUP
   └── Libera recursos, fecha conexões se necessário
```

### church_id no payload — obrigatório

```json
// Payload mínimo obrigatório em todo trigger de n8n
{
  "church_id": "uuid-do-tenant",
  "trace_id": "uuid-para-rastreamento",
  "event_type": "nome.do.evento",
  "timestamp": "2026-04-07T10:00:00Z",
  "data": {
    // dados específicos do evento
  }
}
```

### Timeout de execução

```
Timeout máximo por step: 30 segundos
Timeout máximo do workflow: 5 minutos
Se ultrapassar: marca como falha, registra em audit_logs, notifica equipe
```

---

## 3. Event-Driven vs Schedule-Driven

### Quando usar event-driven (webhook)

```
USAR EVENT-DRIVEN quando:
  - A ação deve ocorrer em resposta a um evento específico
  - Latência importa (< 1 minuto após o evento)
  - O evento tem payload rico com todos os dados necessários
  - A frequência é imprevisível

EXEMPLOS:
  - Nova pessoa inserida em people → enviar boas-vindas
  - Doação confirmada → enviar comprovante
  - Pessoa movida no pipeline → acionar follow-up
  - Formulário de visitante preenchido → notificar líder
```

### Quando usar schedule-driven (cron)

```
USAR SCHEDULE-DRIVEN quando:
  - A ação deve ocorrer em momento específico (diário, semanal, mensal)
  - Não há evento de gatilho claro — é uma verificação periódica
  - Tolerância a latência de minutos ou horas
  - Processamento em batch é mais eficiente que por evento

EXEMPLOS:
  - Todo domingo às 8h → relatório semanal para admins
  - Todo dia às 9h → follow-up de pessoas inativas há 30 dias
  - Primeiro do mês → relatório financeiro mensal
  - A cada 15 minutos → reprocessar webhook_failures pendentes
```

---

## 4. Throttle de Mensagens em Massa

Envio em massa nunca é disparado de uma vez. O n8n divide em batches controlados.

### Configuração de throttle

```json
// Em church_settings.labels.campaign_limits
{
  "campaign_limits": {
    "batch_size": 50,
    "delay_between_batches_ms": 2000,
    "max_messages_per_hour": 1000,
    "max_concurrent_campaigns": 2
  }
}
```

### Fluxo de campanha em massa

```
Admin aprova campanha
    ↓
n8n: campaign-executor workflow
    ↓
1. Busca lista de destinatários (paginada, 50 por vez)
    ↓
2. Para cada batch de 50:
   ├── Envia mensagens via Edge Function (não diretamente na API)
   ├── Aguarda delay configurado (padrão 2s entre batches)
   └── Registra progresso em campaigns.progress_metadata
    ↓
3. Se rate limit da API atingido (429):
   ├── Pausa por 60 segundos
   └── Retoma a partir do último batch processado
    ↓
4. Ao concluir:
   ├── UPDATE campaigns SET status='completed'
   └── INSERT em audit_logs (action: 'campaign.completed')
```

### Verificação de duplicidade antes de envio

```typescript
// Evita enviar a mesma mensagem de campanha duas vezes para a mesma pessoa
async function jaEnviouParaPessoa(
  campaign_id: string,
  person_id: string
): Promise<boolean> {
  const { data } = await supabase
    .from('campaign_sends')
    .select('id')
    .eq('campaign_id', campaign_id)
    .eq('person_id', person_id)
    .single()

  return !!data
}
```

---

## 5. Idempotência em Automações

Todo workflow n8n deve ser idempotente — executar o mesmo evento múltiplas vezes não deve causar efeitos duplicados.

### Estratégias de idempotência

**Estratégia 1: Chave de idempotência (recomendada)**

```sql
-- Tabela de controle de execução de workflows
CREATE TABLE workflow_executions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID NOT NULL REFERENCES churches(id),
  workflow_name   TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,   -- ex: 'follow-up-visitante:{person_id}:{data}'
  status          TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  result_summary  JSONB,
  UNIQUE (workflow_name, idempotency_key)
);
```

```typescript
// No início de todo workflow crítico:
async function ensureIdempotency(
  workflow_name: string,
  idempotency_key: string,
  church_id: string
): Promise<boolean> {
  const { error } = await supabase
    .from('workflow_executions')
    .insert({
      church_id,
      workflow_name,
      idempotency_key,
      status: 'running'
    })

  // Se insert conflitou (unique violation) → já foi executado ou está rodando
  return !error
}
```

**Estratégia 2: Verificação de estado antes de executar**

```typescript
// Para follow-ups: verifica se já existe interação recente antes de enviar
async function precisaDeFollowUp(
  church_id: string,
  person_id: string,
  days_inactive: number
): Promise<boolean> {
  const { data: lastInteraction } = await supabase
    .from('interactions')
    .select('created_at')
    .eq('church_id', church_id)
    .eq('person_id', person_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!lastInteraction) return true

  const daysSince = (Date.now() - new Date(lastInteraction.created_at).getTime()) / 86400000
  return daysSince >= days_inactive
}
```

---

## 6. Monitoramento

### O que registrar em audit_logs

```typescript
// Registro obrigatório ao INICIAR workflow
await supabase.from('audit_logs').insert({
  church_id,
  action: `workflow.${workflow_name}.started`,
  actor: 'system',
  trace_id,
  metadata: {
    trigger_type: 'event' | 'schedule',
    input_summary: { /* dados relevantes, sem PII */ }
  },
  created_at: new Date().toISOString()
})

// Registro obrigatório ao CONCLUIR workflow
await supabase.from('audit_logs').insert({
  church_id,
  action: `workflow.${workflow_name}.completed`,
  actor: 'system',
  trace_id,
  metadata: {
    duration_ms: Date.now() - startTime,
    items_processed: count,
    result_summary: { /* resumo do que foi feito */ }
  },
  created_at: new Date().toISOString()
})

// Registro obrigatório ao FALHAR
await supabase.from('audit_logs').insert({
  church_id,
  action: `workflow.${workflow_name}.failed`,
  actor: 'system',
  trace_id,
  metadata: {
    error_message: error.message,
    failed_at_step: stepName,
    items_processed_before_failure: count
  },
  severity: 'error',
  created_at: new Date().toISOString()
})
```

### Alertas de falha

```
Falha em workflow crítico (campanhas, relatórios financeiros):
  → Notificação imediata para equipe Ekthos
  → Registro em audit_logs com severity='error'
  → INSERT em webhook_failures para reprocessamento

Falha em workflow de baixa criticidade (relatório semanal):
  → Registro em audit_logs com severity='warning'
  → Reagendamento automático para próxima execução
  → Notificação apenas se falhar 3 vezes consecutivas
```

---

## 7. Geração de Workflows via Linguagem Natural

A skill `n8n-orchestration` permite que admins descrevam automações em linguagem natural e a skill gera o workflow n8n correspondente.

### Fluxo de geração

```
Admin: "Quando um visitante confirmar presença no culto pela 3ª vez,
        enviar mensagem de boas-vindas especial e notificar o pastor"
    ↓
skill: n8n-orchestration (MODO=GENERATE)
    ↓
1. Identifica trigger: person_pipeline INSERT com stage='visitante' e count=3
2. Identifica ações: enviar WhatsApp + notificar escalation_contact role='pastoral'
3. Identifica church_id obrigatório em cada passo
4. Gera JSON do workflow n8n com credenciais por referência
5. Valida idempotência (não envia 2x para a mesma pessoa)
6. Retorna JSON para importação no n8n + documentação do workflow
    ↓
ekthos-chief-architect MODO=REVIEW (automático)
    ↓
Admin importa no n8n e ativa
```

### Restrições da geração automática

```
A skill n8n-orchestration NUNCA gera workflows que:
  - Enviem mensagens sem church_id validado
  - Tomem decisões financeiras sem gate humano
  - Exponham credenciais no payload do workflow
  - Executem DELETE em dados sem confirmação humana
  - Acessem dados de outros tenants
```

---

## 8. Catálogo de Workflows Padrão do Sistema

| Workflow | Trigger | Ação | Frequência |
|---|---|---|---|
| `follow-up-visitante` | INSERT em person_pipeline (stage='visitante') | Envia boas-vindas após 24h | Por evento |
| `follow-up-inativo` | Schedule diário 9h | Follow-up de pessoas sem interação há 30 dias | Diário |
| `campanha-programada` | Aprovação de campanha pelo admin | Envio em massa com throttle | Por evento |
| `confirmacao-doacao` | INSERT em donations (status='confirmed') | Envia comprovante ao doador | Por evento |
| `relatorio-semanal` | Schedule toda segunda 8h | Resumo de interações da semana para admins | Semanal |
| `relatorio-financeiro-mensal` | Schedule dia 1 do mês 7h | Relatório de doações do mês anterior | Mensal |
| `pipeline-sem-movimento` | Schedule diário 10h | Identifica pessoas paradas no pipeline há 15 dias | Diário |
| `onboarding-step-monitor` | Webhook do onboarding | Avança para próximo passo do onboarding | Por evento |
| `health-check-agentes` | Schedule a cada 5 minutos | Verifica se agentes estão respondendo | Contínuo |
| `reprocessa-dead-letter` | Schedule a cada 15 minutos | Reprocessa webhook_failures pendentes | Contínuo |
| `limpeza-eventos-webhook` | Schedule diário 2h | Remove webhook_processed_events com > 30 dias | Diário |

---

## 9. Regras Numeradas

```
AUT-01: Toda automação passa pelo ekthos-chief-architect (MODO=EVALUATE) antes de ser implementada
AUT-02: church_id é obrigatório no payload de todo trigger de workflow n8n
AUT-03: Credenciais de APIs externas ficam no Vault — n8n acessa via Credential Store por referência
AUT-04: Timeout máximo por step de workflow: 30 segundos; por workflow completo: 5 minutos
AUT-05: Falhas em workflows são registradas em audit_logs e em webhook_failures para reprocessamento
AUT-06: Envio em massa é sempre feito em batches com delay entre eles — nunca disparo simultâneo
AUT-07: Toda automação crítica implementa idempotência via chave de controle em workflow_executions
AUT-08: Workflows que aprovam ou executam ações financeiras exigem gate humano antes de executar
AUT-09: O n8n não acessa o banco diretamente — toda persistência vai via Edge Function autenticada
AUT-10: Workflows de saúde (health-check, dead-letter) são globais e executam para todos os tenants
AUT-11: Geração de workflows via linguagem natural passa por revisão do ekthos-chief-architect antes de ativar
AUT-12: Todo workflow tem documentação em automations/workflows/{nome}.md com trigger, ação e responsável
```

---

## 10. Exemplo de Workflow n8n Seguro para Tenant

```json
{
  "name": "follow-up-visitante",
  "description": "Envia mensagem de boas-vindas 24h após primeiro registro de visitante",
  "active": true,
  "nodes": [
    {
      "name": "Webhook Trigger",
      "type": "n8n-nodes-base.webhook",
      "parameters": {
        "path": "follow-up-visitante",
        "authentication": "headerAuth",
        "httpMethod": "POST"
      },
      "credentials": {
        "headerAuth": {
          "id": "{{$env.N8N_WEBHOOK_CREDENTIAL_ID}}",
          "name": "Ekthos Webhook Auth"
        }
      },
      "notes": "Recebe evento do Supabase quando INSERT em person_pipeline com stage=visitante"
    },
    {
      "name": "Valida church_id",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "string": [
            {
              "value1": "={{ $json.church_id }}",
              "operation": "isNotEmpty"
            }
          ]
        }
      },
      "notes": "Bloqueia execução se church_id estiver ausente"
    },
    {
      "name": "Aguarda 24h",
      "type": "n8n-nodes-base.wait",
      "parameters": {
        "amount": 24,
        "unit": "hours"
      },
      "notes": "Delay antes de enviar — respeita o tempo de processamento do visitante"
    },
    {
      "name": "Verifica onboarding e módulo",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "={{ $env.SUPABASE_URL }}/functions/v1/tenant-check",
        "method": "POST",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "supabaseApi",
        "body": {
          "church_id": "={{ $json.church_id }}",
          "module": "whatsapp_agent"
        }
      },
      "notes": "Verifica se tenant está ativo e módulo habilitado antes de enviar"
    },
    {
      "name": "Verifica idempotência",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "={{ $env.SUPABASE_URL }}/functions/v1/check-workflow-execution",
        "method": "POST",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "supabaseApi",
        "body": {
          "church_id": "={{ $json.church_id }}",
          "workflow_name": "follow-up-visitante",
          "idempotency_key": "={{ 'follow-up-visitante:' + $json.person_id + ':' + $json.date }}"
        }
      },
      "notes": "Garante que o follow-up não seja enviado duas vezes para a mesma pessoa no mesmo dia"
    },
    {
      "name": "Já executado?",
      "type": "n8n-nodes-base.if",
      "parameters": {
        "conditions": {
          "boolean": [
            {
              "value1": "={{ $json.already_executed }}",
              "value2": true
            }
          ]
        }
      }
    },
    {
      "name": "Envia mensagem de boas-vindas",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "={{ $env.SUPABASE_URL }}/functions/v1/whatsapp-sender",
        "method": "POST",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "supabaseApi",
        "body": {
          "church_id": "={{ $json.church_id }}",
          "person_id": "={{ $json.person_id }}",
          "template": "welcome_visitor",
          "trace_id": "={{ $json.trace_id }}"
        }
      },
      "notes": "Edge Function lê credencial WhatsApp do Vault — n8n não acessa o token diretamente"
    },
    {
      "name": "Registra em audit_logs",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "={{ $env.SUPABASE_URL }}/functions/v1/audit-log",
        "method": "POST",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "supabaseApi",
        "body": {
          "church_id": "={{ $json.church_id }}",
          "action": "workflow.follow-up-visitante.completed",
          "actor": "system",
          "trace_id": "={{ $json.trace_id }}",
          "metadata": {
            "person_id": "={{ $json.person_id }}",
            "message_sent": true
          }
        }
      }
    },
    {
      "name": "Registra falha em webhook_failures",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "={{ $env.SUPABASE_URL }}/functions/v1/webhook-failure",
        "method": "POST",
        "authentication": "predefinedCredentialType",
        "nodeCredentialType": "supabaseApi",
        "body": {
          "church_id": "={{ $json.church_id }}",
          "workflow_name": "follow-up-visitante",
          "error": "={{ $json.error }}",
          "payload": "={{ $json }}"
        }
      },
      "notes": "Executado no branch de erro — garante que a falha seja rastreável e reprocessável"
    }
  ],
  "connections": {
    "Webhook Trigger": { "main": [["Valida church_id"]] },
    "Valida church_id": {
      "main": [
        ["Aguarda 24h"],   // true branch
        ["Registra falha em webhook_failures"]  // false branch
      ]
    },
    "Aguarda 24h": { "main": [["Verifica onboarding e módulo"]] },
    "Verifica onboarding e módulo": { "main": [["Verifica idempotência"]] },
    "Verifica idempotência": { "main": [["Já executado?"]] },
    "Já executado?": {
      "main": [
        [],  // true branch — descarta silenciosamente
        ["Envia mensagem de boas-vindas"]  // false branch
      ]
    },
    "Envia mensagem de boas-vindas": { "main": [["Registra em audit_logs"]] }
  }
}
```
