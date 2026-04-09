# Skill: n8n Orchestration (Orquestração de Automações)

## Descrição

Gerencia a criação, monitoramento e manutenção de workflows de automação no n8n. Permite que usuários descrevam em linguagem natural o que querem automatizar, e a skill traduz isso em workflows concretos, mapeando triggers, ações, condições e integrações. Também monitora a saúde dos workflows ativos e alerta sobre falhas.

O n8n é a espinha dorsal de automação do Ekthos Platform — toda tarefa recorrente, notificação programada e integração entre sistemas passa por ele.

---

## Quando Usar

- Usuário solicita criação de uma automação em linguagem natural
- Necessidade de verificar status de workflows ativos
- Uma automação falhou e precisa de diagnóstico
- Criação de workflow de boas-vindas durante onboarding
- Agendamento de campanhas de marketing
- Integração de novo canal ou gateway de pagamento via webhook

---

## Inputs

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `churchId` | `string` | Sim | UUID do tenant |
| `action` | `N8nAction` | Sim | `create_workflow`, `list_workflows`, `check_status`, `trigger_workflow`, `disable_workflow`, `diagnose_failure` |
| `workflowDescription` | `string \| null` | Depende | Descrição em linguagem natural (para create_workflow) |
| `workflowId` | `string \| null` | Depende | ID do workflow no n8n (para ações em workflows existentes) |
| `triggerData` | `Record<string, unknown> \| null` | Não | Dados para disparo manual de workflow |
| `requestedBy` | `string` | Sim | ID do usuário solicitante |
| `context` | `TenantContext` | Sim | Contexto do tenant |

---

## Outputs

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `action` | `string` | Ação executada |
| `workflowId` | `string \| null` | ID do workflow criado ou afetado |
| `workflowUrl` | `string \| null` | URL para editar o workflow no n8n |
| `workflowDefinition` | `N8nWorkflow \| null` | Definição JSON do workflow criado |
| `status` | `WorkflowStatus \| null` | Status atual do workflow |
| `activeWorkflows` | `WorkflowSummary[] \| null` | Lista de workflows ativos |
| `failureDiagnosis` | `string \| null` | Diagnóstico de falha (se aplicável) |
| `fixSuggestion` | `string \| null` | Sugestão de correção |

---

## Regras

1. **Workflows por tenant** — Cada workflow deve incluir o `church_id` nos metadados para rastreabilidade.
2. **Nenhum workflow sem aprovação** — Workflows que enviam mensagens em massa precisam de aprovação explícita do `church_admin`.
3. **Credenciais no Vault** — Tokens de API usados nos workflows devem ser referenciados via Supabase Vault, nunca hardcoded.
4. **Rate limiting respeitado** — Workflows de envio em massa devem respeitar o rate limit das APIs (WhatsApp: máx 250 mensagens/segundo).
5. **Monitoramento obrigatório** — Todo novo workflow deve ter um nó de tratamento de erro que notifica o responsável em caso de falha.
6. **Nomenclatura padronizada** — Nome do workflow: `{slug-igreja}_{tipo-workflow}_{versao}` (ex: `igreja-graca_boas-vindas_v1`)
7. **Documentação gerada** — A criação de um workflow gera automaticamente um arquivo em `automations/workflows/{slug}/{nome}.md`.

---

## Tipos de Workflow Suportados

```typescript
type WorkflowType =
  | 'welcome_series'          // Série de boas-vindas para novos membros
  | 'birthday_automation'     // Parabéns automático por aniversário
  | 'event_reminder'          // Lembretes de evento (D-7, D-1, dia do evento)
  | 'donation_confirmation'   // Confirmação automática de doação
  | 'donation_receipt'        // Emissão de comprovante de doação
  | 'visitor_followup'        // Follow-up de visitante (D+1, D+7, D+30)
  | 'weekly_report'           // Relatório semanal para admins
  | 'campaign_blast'          // Disparo de campanha em massa
  | 'new_member_onboarding'   // Onboarding de novo membro
  | 'prayer_chain'            // Corrente de oração automática
  | 'tithe_reminder';         // Lembrete gentil de dízimo (opt-in)
```

---

## Mapeamento de Linguagem Natural para Workflow

```typescript
const NATURAL_LANGUAGE_PATTERNS = [
  {
    patterns: ['boas-vindas', 'novo membro', 'quando alguém se cadastrar'],
    workflowType: 'welcome_series',
    suggestedSteps: [
      'Trigger: novo registro em people com tag "membro"',
      'Aguardar 1 hora',
      'Enviar mensagem de boas-vindas personalizada via WhatsApp',
      'Aguardar 3 dias',
      'Enviar mensagem sobre grupos/células',
      'Aguardar 7 dias',
      'Verificar se completou cadastro — se não, enviar lembrete',
    ]
  },
  {
    patterns: ['aniversário', 'parabéns', 'data de nascimento'],
    workflowType: 'birthday_automation',
    suggestedSteps: [
      'Trigger: Cron diário às 8h',
      'Buscar pessoas com aniversário hoje (filtrado por church_id)',
      'Para cada pessoa: enviar mensagem personalizada de parabéns',
      'Registrar interação no banco',
    ]
  },
  {
    patterns: ['confirmação de doação', 'doação confirmada', 'pix recebido'],
    workflowType: 'donation_confirmation',
    suggestedSteps: [
      'Trigger: Webhook do gateway de pagamento',
      'Validar assinatura do webhook',
      'Identificar church_id via token',
      'Atualizar status da doação no banco',
      'Enviar mensagem de confirmação ao doador',
      'Gerar e enviar comprovante PDF',
    ]
  },
];
```

---

## Dependências

- n8n API (`N8N_WEBHOOK_URL`, `N8N_API_KEY`)
- Supabase (leitura de dados para workflows)
- WhatsApp Business API (para nós de mensagem)
- `donation-management` skill (para workflows financeiros)
- `marketing-core` skill (para workflows de campanha)

---

## Exemplos

### Exemplo 1 — Criar Workflow de Boas-Vindas

```
Input:
  action: 'create_workflow'
  workflowDescription: "Quando um novo membro se cadastrar, enviar mensagem de boas-vindas após 1 hora e depois mandar informações sobre os grupos de conexão após 3 dias"
  context.terminology.groups: 'GCs'
  context.slug: 'igreja-da-graca'

Output:
  workflowId: 'n8n-workflow-123'
  workflowUrl: 'https://n8n.ekthos.com.br/workflow/123'
  workflowDefinition: { ... JSON do workflow ... }
  action: 'create_workflow'
```

### Exemplo 2 — Verificar Status de Workflows

```
Input:
  action: 'list_workflows'

Output:
  activeWorkflows: [
    {
      id: 'n8n-workflow-123',
      name: 'igreja-graca_boas-vindas_v1',
      type: 'welcome_series',
      status: 'active',
      lastRun: '2026-04-06T14:23:00Z',
      successRate: 0.98,
      totalExecutions: 152
    },
    {
      id: 'n8n-workflow-456',
      name: 'igreja-graca_aniversario_v1',
      type: 'birthday_automation',
      status: 'active',
      lastRun: '2026-04-07T08:00:00Z',
      successRate: 1.0,
      totalExecutions: 87
    }
  ]
```

### Exemplo 3 — Diagnóstico de Falha

```
Input:
  action: 'diagnose_failure'
  workflowId: 'n8n-workflow-789'

Output:
  failureDiagnosis: "O workflow falhou às 09:23 porque o token do WhatsApp Business API expirou. O nó 'Enviar WhatsApp' retornou erro 401 (Unauthorized)."
  fixSuggestion: "Atualize o token do WhatsApp Business em Configurações → Integrações → WhatsApp. Após atualizar, reative o workflow."
```
