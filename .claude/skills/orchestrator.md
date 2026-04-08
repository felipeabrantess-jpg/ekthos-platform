# Skill: Orchestrator (Orquestrador Principal)

## Descrição

O Orchestrator é a skill central do sistema Ekthos Platform. Ele recebe qualquer entrada bruta — seja uma mensagem de usuário, um evento de webhook, um comando de administrador ou uma solicitação interna — e decide qual skill (ou sequência de skills) deve ser ativada para processar essa entrada. O Orchestrator nunca executa ações diretas no sistema; seu papel é exclusivamente análise e roteamento.

Pense no Orchestrator como o maestro de uma orquestra: ele não toca nenhum instrumento, mas garante que todos os músicos entrem no momento certo, com o tempo certo, produzindo o resultado harmônico desejado.

---

## Quando Usar

- Sempre que uma entrada chegar sem classificação prévia de intent
- Quando múltiplas skills podem ser relevantes e é necessário priorizar
- Quando há conflito entre o que um usuário quer e o que o sistema pode fazer
- Para resolução de ambiguidade em solicitações complexas
- Como ponto de entrada unificado de todos os agentes

---

## Inputs

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `churchId` | `string (UUID)` | Sim | Identificador do tenant |
| `input` | `string` | Sim | Texto bruto da entrada (mensagem, comando, evento) |
| `inputType` | `'message' \| 'command' \| 'webhook' \| 'scheduled'` | Sim | Tipo da entrada |
| `channel` | `'whatsapp' \| 'instagram' \| 'internal' \| 'api'` | Sim | Canal de origem |
| `userId` | `string \| null` | Não | ID do usuário humano (se autenticado) |
| `personId` | `string \| null` | Não | ID do membro/pessoa no banco (se identificado) |
| `conversationId` | `string \| null` | Não | ID da conversa em andamento |
| `context` | `TenantContext` | Sim | Contexto do tenant já carregado |

---

## Outputs

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `selectedSkill` | `string` | Nome da skill selecionada para processar |
| `fallbackSkill` | `string \| null` | Skill de fallback se a principal falhar |
| `priority` | `'low' \| 'medium' \| 'high' \| 'critical'` | Prioridade de processamento |
| `parameters` | `Record<string, unknown>` | Parâmetros já extraídos para a skill |
| `shouldEscalate` | `boolean` | Se deve escalar imediatamente para humano |
| `escalationReason` | `string \| null` | Motivo da escalada (se aplicável) |
| `confidence` | `number (0-1)` | Confiança na classificação (< 0.3 = escalar) |

---

## Regras

1. **Nunca executa ações diretas** — O Orchestrator apenas roteia. Nunca faz queries ao banco, nunca envia mensagens.
2. **Contexto obrigatório** — Nunca roteia sem o contexto do tenant carregado.
3. **Threshold de confiança** — Se `confidence < 0.30`, sempre retorna `shouldEscalate: true`.
4. **Prioridade de segurança** — Triggers de escalada obrigatória têm prioridade sobre qualquer roteamento.
5. **Isolamento de tenant** — Nunca usa contexto de um tenant para processar entrada de outro.
6. **Uma skill por vez** — Seleciona exatamente uma skill principal (não executa múltiplas em paralelo sem orquestração explícita).
7. **Fallback sempre definido** — Sempre define uma skill de fallback (`dm-support` como padrão global).

---

## Lógica de Decisão

### Árvore de Roteamento

```
Entrada recebida
    ↓
É trigger de escalada obrigatória?
    → SIM: shouldEscalate = true | skill = 'human-handoff'
    ↓ NÃO
É comando administrativo? (começa com '/')
    → SIM: skill = 'command-processor'
    ↓ NÃO
É evento de webhook de pagamento?
    → SIM: skill = 'donation-management'
    ↓ NÃO
É sobre agendamento, evento ou programação?
    → SIM: skill = 'event-management' (se habilitado)
    ↓ NÃO
É sobre doação, dízimo, oferta ou PIX?
    → SIM: skill = 'donation-management' (se habilitado)
    ↓ NÃO
É sobre marketing, campanha ou comunicação em massa?
    → SIM: skill = 'marketing-core' (se habilitado, usuário admin)
    ↓ NÃO
É sobre um membro específico, cadastro ou dados?
    → SIM: skill = 'member-management' (futuro)
    ↓ NÃO
É saudação, primeira mensagem ou pergunta geral?
    → SIM: skill = 'dm-support'
    ↓ NÃO (não classificado)
confidence < 0.30 → shouldEscalate = true
confidence >= 0.30 → skill = 'dm-support' (fallback)
```

### Mapeamento de Skills por Intent

```typescript
const INTENT_TO_SKILL_MAP: Record<string, string> = {
  // Suporte e atendimento geral
  'greeting': 'dm-support',
  'general_question': 'dm-support',
  'service_hours': 'dm-support',
  'location_direction': 'dm-support',
  'prayer_request': 'dm-support',

  // Financeiro
  'donation_intent': 'donation-management',
  'tithe_question': 'donation-management',
  'offering_question': 'donation-management',
  'payment_status': 'donation-management',

  // Marketing (apenas admin)
  'campaign_creation': 'marketing-core',
  'content_generation': 'marketing-core',
  'audience_segmentation': 'marketing-core',

  // Automações
  'workflow_creation': 'n8n-orchestration',
  'automation_status': 'n8n-orchestration',

  // Onboarding (apenas plataforma)
  'new_church_onboarding': 'church-onboarding',
};
```

---

## Dependências

- Todos os arquivos de skills em `.claude/skills/`
- Contexto do tenant (`context/tenants/{slug}.md`)
- Tabela `church_settings` para verificar módulos habilitados

---

## Exemplos

### Exemplo 1 — Mensagem simples de membro

```
Input: "Olá, qual o horário do culto de domingo?"
Channel: whatsapp
InputType: message

Output:
  selectedSkill: 'dm-support'
  priority: 'medium'
  confidence: 0.92
  parameters: { intent: 'service_hours', day: 'sunday' }
  shouldEscalate: false
```

### Exemplo 2 — Trigger de escalada

```
Input: "Estou passando muito mal, não sei o que fazer mais"
Channel: whatsapp
InputType: message

Output:
  selectedSkill: 'human-handoff'
  priority: 'critical'
  confidence: 0.88
  shouldEscalate: true
  escalationReason: 'Possível crise emocional detectada — escalada obrigatória'
```

### Exemplo 3 — Campanha de marketing

```
Input: "Quero criar uma campanha para o Dia das Mães semana que vem"
Channel: internal
InputType: command
UserId: 'admin-uuid'

Output:
  selectedSkill: 'marketing-core'
  priority: 'medium'
  confidence: 0.95
  parameters: { intent: 'campaign_creation', theme: 'mothers_day', urgency: 'next_week' }
  shouldEscalate: false
```
