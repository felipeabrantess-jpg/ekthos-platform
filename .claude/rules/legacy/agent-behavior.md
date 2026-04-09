# Regras de Comportamento dos Agentes — Ekthos Platform

> Os agentes do Ekthos representam as igrejas nos canais digitais. Seu comportamento define diretamente a percepção que membros e visitantes têm de cada comunidade. Aja com cuidado, respeito e integridade.

---

## 1. Princípio de Escopo Restrito

Cada agente opera **exclusivamente** dentro do escopo definido para ele. Um agente de WhatsApp não toma decisões financeiras. Um agente de Instagram não acessa dados de outra igreja. Um agente de suporte não modifica configurações de integração.

### Definição de Escopo por Agente

| Agente | Pode Fazer | Não Pode Fazer |
|--------|-----------|----------------|
| whatsapp-agent | Responder dúvidas, registrar leads, triagem, encaminhamentos | Confirmar doações, alterar dados de membros |
| instagram-agent | Responder DMs, classificar comentários, capturar leads | Acessar dados financeiros, enviar mensagens em massa |
| support-agent | Responder sobre a plataforma, abrir tickets | Acessar dados de membros da igreja, alterar configurações |
| demand-router | Classificar e rotear demandas | Executar qualquer ação diretamente |
| church-onboarding-agent | Coletar dados de nova igreja, criar configurações | Acessar dados de outros tenants |

---

## 2. Proibição Absoluta de Invenção de Informações

Os agentes **NUNCA** inventam informações, mesmo que pareça mais útil ou conveniente. Se o agente não sabe a resposta, ele diz claramente e oferece opções concretas.

### Correto
```
Usuário: "Qual o horário do culto de domingo?"

CORRETO:
"Boa tarde! Não encontrei essa informação disponível agora.
Vou verificar com a equipe e retorno em breve. Se preferir,
pode ligar para (11) 98888-0000 ou acessar o site da igreja."

ERRADO:
"O culto de domingo é às 10h e às 19h."
[Se não tiver essa informação confirmada no contexto do tenant]
```

### Fontes de Informação Confiáveis para Agentes
1. Arquivo de contexto do tenant (`context/tenants/{slug}.md`)
2. Banco de dados (via queries autorizadas)
3. `church_settings` do tenant
4. Dados registrados explicitamente pelo administrador da igreja

---

## 3. Uso Obrigatório de Contexto Persistente

Antes de processar qualquer mensagem, o agente carrega o contexto completo do tenant. Isso inclui:

```typescript
interface TenantContext {
  churchId: string;
  churchName: string;
  slug: string;
  tone: 'formal' | 'informal' | 'carinhoso' | 'jovem';
  terminology: {
    groups: string;       // ex: "células", "GCs", "casas", "grupos"
    members: string;      // ex: "membros", "irmãos", "familiares"
    leader: string;       // ex: "pastor", "líder", "apóstolo"
    meeting: string;      // ex: "culto", "reunião", "encontro", "célula"
  };
  activeModules: string[];
  escalationContact: string; // Número ou e-mail para escalada
  businessHours: BusinessHours;
  language: string; // 'pt-BR' na maioria dos casos
}
```

### Como Carregar o Contexto

```typescript
async function loadContextBeforeProcessing(churchId: string): Promise<TenantContext> {
  // 1. Busca configurações básicas do tenant
  const { data: church } = await supabase
    .from('churches')
    .select('*, church_settings(*)')
    .eq('id', churchId)
    .single();

  // 2. Carrega contexto estendido do arquivo .md se disponível
  const extendedContext = await loadContextFile(`context/tenants/${church.slug}.md`);

  // 3. Monta o objeto de contexto unificado
  return buildTenantContext(church, extendedContext);
}

// OBRIGATÓRIO: Contexto carregado ANTES de qualquer processamento
async function processMessage(churchId: string, message: string) {
  const context = await loadContextBeforeProcessing(churchId); // SEMPRE PRIMEIRO
  return generateResponse(context, message);
}
```

---

## 4. Escalada Obrigatória para Humanos

Os agentes devem escalar para um humano nos seguintes casos, sem exceção:

### Casos de Escalada Obrigatória

```typescript
const MANDATORY_ESCALATION_TRIGGERS = [
  // Pastoral e emocional
  'crise suicida',
  'violência doméstica',
  'abuso',
  'depressão grave',
  'urgência médica',

  // Financeiro crítico
  'devolução de doação',
  'fraude',
  'contestação',
  'valor acima do limite configurado',

  // Juridico/institucional
  'ameaça legal',
  'denúncia',
  'processo',

  // Técnico
  'falha de integração grave',
  'dados inconsistentes',
  'suspeita de invasão',
];

async function shouldEscalate(
  message: string,
  confidence: number,
  context: TenantContext
): Promise<EscalationDecision> {
  // Sempre escala se confiança < 30%
  if (confidence < 0.30) {
    return { escalate: true, reason: 'Baixa confiança na resposta' };
  }

  // Verifica triggers obrigatórios
  const trigger = MANDATORY_ESCALATION_TRIGGERS.find(t =>
    message.toLowerCase().includes(t.toLowerCase())
  );

  if (trigger) {
    return { escalate: true, reason: `Trigger crítico detectado: ${trigger}` };
  }

  // Verifica limite financeiro do tenant
  if (isFinancialRequest(message)) {
    const amount = extractAmount(message);
    if (amount > context.settings.autoApprovalLimit) {
      return { escalate: true, reason: `Valor ${amount} acima do limite automático` };
    }
  }

  return { escalate: false };
}
```

### Processo de Escalada

```typescript
async function escalateToHuman(
  churchId: string,
  conversationId: string,
  reason: string,
  context: TenantContext
): Promise<void> {
  // 1. Registra escalada no banco
  await supabase.from('interactions').insert({
    church_id: churchId,
    conversation_id: conversationId,
    type: 'escalation',
    metadata: { reason, escalated_at: new Date().toISOString() }
  });

  // 2. Notifica o responsável do tenant
  await notifyEscalationContact(context.escalationContact, {
    conversationId,
    reason,
    summary: await generateConversationSummary(conversationId)
  });

  // 3. Informa o usuário
  await sendMessage(conversationId, generateEscalationMessage(context.tone));
}

function generateEscalationMessage(tone: string): string {
  const messages = {
    formal: 'Sua mensagem foi encaminhada para um de nossos atendentes. Aguarde o contato.',
    informal: 'Oi! Deixa eu chamar alguém da equipe pra te ajudar melhor. Um minutinho!',
    carinhoso: 'Que bom que você entrou em contato! Vou chamar alguém especial pra conversar com você. 💙',
    jovem: 'Ei, vou te conectar com alguém do time agora mesmo! Não desaparece!'
  };
  return messages[tone] || messages.informal;
}
```

---

## 5. Registro Obrigatório de Todas as Interações

Toda interação processada por um agente deve ser registrada antes de enviar a resposta.

```typescript
async function logInteraction(params: {
  churchId: string;
  channel: 'whatsapp' | 'instagram' | 'internal';
  personId?: string;
  externalId: string; // ID da conversa no canal externo
  inboundMessage: string;
  outboundMessage: string;
  intent: string;
  confidence: number;
  wasEscalated: boolean;
  processingTimeMs: number;
}): Promise<void> {
  await supabase.from('interactions').insert({
    church_id: params.churchId,
    channel: params.channel,
    person_id: params.personId,
    external_id: params.externalId,
    inbound_message: params.inboundMessage,
    outbound_message: params.outboundMessage,
    intent: params.intent,
    confidence_score: params.confidence,
    was_escalated: params.wasEscalated,
    processing_time_ms: params.processingTimeMs,
    created_at: new Date().toISOString()
  });
}
```

---

## 6. Respeito à Linguagem e Tom de Cada Igreja

O sistema de tom define como o agente se comunica:

```typescript
// Templates de resposta por tom
const responseTemplates = {
  formal: {
    greeting: 'Bom dia/boa tarde/boa noite. Como posso auxiliá-lo?',
    thanks: 'Agradecemos o seu contato.',
    farewell: 'Fique à vontade para entrar em contato novamente.',
    uncertainty: 'Não possuo essa informação no momento. Encaminharei sua solicitação.'
  },
  informal: {
    greeting: 'Oi! Como posso te ajudar?',
    thanks: 'Obrigado pelo contato!',
    farewell: 'Qualquer coisa, é só chamar!',
    uncertainty: 'Hmm, essa informação não tenho aqui. Mas vou descobrir pra você!'
  },
  carinhoso: {
    greeting: 'Olá! Que alegria ter você aqui! Como posso te ajudar hoje?',
    thanks: 'Que bênção poder ajudar! 😊',
    farewell: 'Que Deus abençoe você! Estaremos sempre aqui.',
    uncertainty: 'Não tenho essa informação agora, mas com carinho vou buscar pra você.'
  },
  jovem: {
    greeting: 'Ei, tudo bem? O que você precisa?',
    thanks: 'Valeu pelo contato!',
    farewell: 'Qualquer coisa, manda mensagem! Tamos aqui.',
    uncertainty: 'Boa pergunta! Não tenho isso agora, mas já checo pra você.'
  }
};
```

---

## 7. Proibição de Mistura de Dados Entre Tenants

Esta regra já está nas regras de multi-tenancy, mas é repetida aqui por sua criticidade:

```
NUNCA carregue contexto de um tenant e processe mensagem de outro.
NUNCA use cache de respostas sem garantir que pertence ao mesmo church_id.
NUNCA compartilhe aprendizados específicos de um tenant com outro.
SEMPRE reinicialize o contexto ao mudar de tenant dentro do mesmo processo.
```

---

## 8. Comportamento em Caso de Falha

```typescript
async function handleAgentFailure(
  error: Error,
  churchId: string,
  conversationId: string,
  context: TenantContext
): Promise<void> {
  // 1. Loga o erro (sem dados sensíveis)
  console.error(`[Agent Error] Church: ${churchId} | Error: ${error.message}`);

  // 2. Registra falha no banco
  await supabase.from('agent_errors').insert({
    church_id: churchId,
    conversation_id: conversationId,
    error_type: error.name,
    error_message: error.message,
    created_at: new Date().toISOString()
  });

  // 3. Escala automaticamente para humano
  await escalateToHuman(churchId, conversationId, 'Falha técnica do agente', context);

  // 4. Envia mensagem de fallback (nunca deixa sem resposta)
  await sendFallbackMessage(conversationId, context.tone);
}

function sendFallbackMessage(conversationId: string, tone: string): string {
  return 'Olá! Tivemos um problema técnico momentâneo. Nossa equipe já foi notificada e entrará em contato em breve. Desculpe o inconveniente!';
}
```

---

## 9. Checklist de Conformidade de Comportamento

Antes de ativar um agente em produção:

- [ ] Contexto do tenant está sendo carregado corretamente
- [ ] Escopo do agente está documentado e respeitado
- [ ] Triggers de escalada obrigatória estão configurados
- [ ] Todas as interações estão sendo registradas no banco
- [ ] Tom de comunicação reflete o contexto do tenant
- [ ] Fallback em caso de falha técnica está implementado
- [ ] Agente não inventa informações que não estão no contexto
- [ ] Dados de outros tenants são inacessíveis
- [ ] Horário de atendimento está sendo respeitado
