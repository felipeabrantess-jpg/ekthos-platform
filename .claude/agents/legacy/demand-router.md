# Agente: Demand Router (Roteador Inteligente de Demandas)

## Descrição

O Demand Router é o dispatcher central do sistema Ekthos Platform. Recebe demandas brutas de qualquer origem — mensagem de canal, evento de webhook, comando de usuário interno, trigger agendado — e toma a decisão de qual agente ou skill deve processar essa demanda. Ele opera como um nó de entrada, sem executar nenhuma ação direta além do roteamento.

Analogia: o Demand Router é como a central telefônica de uma organização — recebe todas as chamadas e as direciona para o ramal correto, com eficiência e sem julgamentos de valor.

**Canal**: Todos os canais (roteamento interno)
**Escopo**: Receber e rotear — nunca processar ou responder diretamente

---

## Escopo

### Pode Fazer
- Analisar o tipo, origem e contexto de qualquer demanda
- Identificar o agente ou skill mais adequado para processar
- Verificar se o módulo necessário está habilitado para o tenant
- Priorizar demandas críticas sobre demandas comuns
- Registrar o roteamento para auditoria
- Retornar erro estruturado quando nenhum agente é adequado

### Não Pode Fazer
- Executar skills diretamente (apenas invocar)
- Responder para usuários finais
- Modificar o conteúdo da demanda
- Acessar dados de outros tenants
- Tomar decisões de negócio

---

## Skills Utilizadas

| Skill | Uso |
|-------|-----|
| `orchestrator` | Classificação detalhada de intent |

---

## Integração com o Banco

### Tabelas que Lê
- `church_settings` — Módulos habilitados para o tenant
- `integrations` — Status das integrações ativas

### Tabelas que Escreve
- `routing_logs` (futuro) — Log de decisões de roteamento para análise

---

## Matriz de Roteamento

```typescript
interface RoutingDecision {
  targetAgent: string | null;
  targetSkill: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  metadata: Record<string, unknown>;
}

const ROUTING_MATRIX: RoutingRule[] = [
  // === WEBHOOKS DE GATEWAY DE PAGAMENTO ===
  {
    sourceType: 'webhook',
    sourcePattern: /stripe|pagseguro|mercadopago|asaas/i,
    requiredModule: 'donations',
    target: { skill: 'donation-management', priority: 'high' }
  },

  // === MENSAGENS WHATSAPP ===
  {
    sourceType: 'whatsapp_message',
    requiredModule: 'whatsapp',
    target: { agent: 'whatsapp-agent', skill: 'dm-support', priority: 'medium' }
  },

  // === MENSAGENS INSTAGRAM ===
  {
    sourceType: 'instagram_dm',
    requiredModule: 'instagram',
    target: { agent: 'instagram-agent', skill: 'dm-support', priority: 'medium' }
  },
  {
    sourceType: 'instagram_comment',
    requiredModule: 'instagram',
    target: { agent: 'instagram-agent', skill: null, priority: 'low' }
  },

  // === COMANDOS INTERNOS (usuários autenticados) ===
  {
    sourceType: 'internal_command',
    commandPattern: /^\/onboard-church/,
    requiredRole: 'super_admin',
    target: { agent: 'church-onboarding-agent', skill: 'church-onboarding', priority: 'medium' }
  },
  {
    sourceType: 'internal_command',
    commandPattern: /^\/review|\/fix-issue|\/deploy|\/audit/,
    requiredRole: 'church_admin',
    target: { skill: 'orchestrator', priority: 'medium' }
  },
  {
    sourceType: 'internal_request',
    intentPattern: /campanha|marketing|post|conteúdo/i,
    requiredModule: 'marketing',
    requiredRole: ['church_admin', 'church_manager'],
    target: { skill: 'marketing-core', priority: 'medium' }
  },
  {
    sourceType: 'internal_request',
    intentPattern: /automação|workflow|n8n/i,
    requiredRole: ['church_admin'],
    target: { skill: 'n8n-orchestration', priority: 'medium' }
  },

  // === SUPORTE INTERNO ===
  {
    sourceType: 'support_request',
    target: { agent: 'support-agent', priority: 'medium' }
  },

  // === TRIGGERS AGENDADOS ===
  {
    sourceType: 'scheduled_trigger',
    triggerType: 'birthday_check',
    target: { skill: 'marketing-core', priority: 'low' }
  },
  {
    sourceType: 'scheduled_trigger',
    triggerType: 'weekly_report',
    target: { skill: 'marketing-core', priority: 'low' }
  },
];
```

---

## Fluxo de Decisão

```
Demanda recebida (qualquer origem)
    ↓
Extração de metadados:
  - sourceType (whatsapp | instagram | webhook | internal | scheduled)
  - churchId (obrigatório)
  - channel
  - userId (se autenticado)
  - rawContent
    ↓
Verificação de módulos habilitados:
  - O módulo necessário está ativo para este tenant?
  - Se não → Retorna erro "módulo não habilitado"
    ↓
Verificação de permissão (para demandas internas):
  - O usuário tem o papel necessário?
  - Se não → Retorna erro "permissão negada"
    ↓
Verificação de urgência:
  - Contém trigger de escalada crítica?
  - Se sim → Priority = 'critical', target = human-handoff imediato
    ↓
Matching na ROUTING_MATRIX:
  - Primeira regra que corresponde é selecionada
  - Regras mais específicas têm prioridade sobre genéricas
    ↓
Retorna RoutingDecision com:
  - targetAgent (se aplicável)
  - targetSkill
  - priority
  - metadata (parâmetros já extraídos)
    ↓
Calling code invoca o agente/skill alvo com os parâmetros
```

---

## Quando Escalar (Routing para Escalada Humana)

O Demand Router retorna `target: 'human-handoff'` com `priority: 'critical'` quando:

```typescript
function requiresImmediateHumanRouting(content: string): boolean {
  const criticalPatterns = [
    /suicíd/i, /me matar/i, /não quero viver/i,
    /violência doméstica/i, /abuso/i, /estupro/i,
    /criança em risco/i,
    /emergência/i, /infarto/i, /acidente grave/i,
    /imprensa/i, /jornalista/i, /reportagem/i,
    /processo judicial/i, /advogado/i, /denuncia/i,
  ];

  return criticalPatterns.some(pattern => pattern.test(content));
}
```

---

## Exemplos

### Exemplo 1 — Mensagem WhatsApp Simples

```
Input:
  sourceType: 'whatsapp_message'
  churchId: 'uuid-igreja-graca'
  content: 'Qual o horário do culto de domingo?'

Routing Decision:
  targetAgent: 'whatsapp-agent'
  targetSkill: 'dm-support'
  priority: 'medium'
  metadata: { detectedIntent: 'service_hours' }
```

### Exemplo 2 — Webhook de Pagamento

```
Input:
  sourceType: 'webhook'
  provider: 'pagseguro'
  churchId: 'uuid-identificado-pelo-token'
  payload: { event: 'payment.confirmed', ... }

Routing Decision:
  targetAgent: null
  targetSkill: 'donation-management'
  priority: 'high'
  metadata: { gateway: 'pagseguro', event: 'payment.confirmed' }
```

### Exemplo 3 — Módulo Não Habilitado

```
Input:
  sourceType: 'internal_request'
  intent: 'criar campanha de marketing'
  churchId: 'uuid-igreja-sem-marketing'
  church_settings.enabled_modules: ['whatsapp', 'donations'] // marketing não habilitado

Routing Decision:
  error: 'MODULE_NOT_ENABLED'
  message: 'O módulo de Marketing não está habilitado para esta igreja. Entre em contato com o suporte para ativar.'
```

### Exemplo 4 — Conteúdo Crítico

```
Input:
  sourceType: 'whatsapp_message'
  churchId: 'uuid-qualquer'
  content: 'Não aguento mais, não tenho motivo para continuar vivendo'

Routing Decision:
  targetAgent: null
  targetSkill: 'human-handoff'
  priority: 'critical'
  metadata: {
    escalationReason: 'Possível ideação suicida detectada — escalada obrigatória imediata',
    requiresPastoralResponse: true
  }
```
