# Skill: DM Support (Atendimento via Mensagem Direta)

## Descrição

Processa e responde mensagens diretas recebidas via WhatsApp Business ou Instagram DM. Realiza triagem inteligente, gera respostas contextualizadas usando o tom e terminologia do tenant, registra interações no banco e decide quando escalar para um atendente humano. É a skill mais usada no dia a dia do sistema — a linha de frente do atendimento digital das igrejas.

---

## Quando Usar

- Toda mensagem recebida via WhatsApp que não seja um evento de pagamento ou comando
- Toda DM recebida via Instagram
- Quando o `orchestrator` classifica o intent como `general_question`, `greeting`, `service_hours`, `location_direction`, `prayer_request` ou `undefined`

---

## Inputs

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `churchId` | `string` | Sim | UUID do tenant |
| `channel` | `'whatsapp' \| 'instagram'` | Sim | Canal de origem |
| `externalId` | `string` | Sim | ID da mensagem/conversa no canal externo |
| `senderPhone` | `string \| null` | Não | Número do remetente (WhatsApp) |
| `senderInstagramId` | `string \| null` | Não | ID do remetente no Instagram |
| `message` | `string` | Sim | Texto da mensagem recebida |
| `mediaUrl` | `string \| null` | Não | URL de mídia (áudio, imagem) se enviada |
| `context` | `TenantContext` | Sim | Contexto do tenant |
| `conversationHistory` | `Message[]` | Não | Histórico da conversa (últimas 10 mensagens) |
| `personId` | `string \| null` | Não | ID do membro identificado (se já cadastrado) |

---

## Outputs

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `response` | `string` | Texto da resposta a enviar |
| `mediaResponse` | `MediaResponse \| null` | Mídia a enviar junto (se aplicável) |
| `shouldEscalate` | `boolean` | Se deve transferir para humano |
| `escalationReason` | `string \| null` | Motivo da escalada |
| `detectedIntent` | `string` | Intent classificado |
| `confidence` | `number` | Confiança na resposta (0-1) |
| `personCreated` | `boolean` | Se um novo registro de pessoa foi criado |
| `personId` | `string \| null` | ID do registro de pessoa (novo ou existente) |
| `tags` | `string[]` | Tags sugeridas para a pessoa |
| `nextAction` | `string \| null` | Ação recomendada para follow-up |

---

## Regras

1. **Contexto sempre primeiro** — Antes de gerar qualquer resposta, verificar se o contexto do tenant está carregado.
2. **Registrar antes de responder** — A interação deve ser salva no banco antes de enviar a resposta ao usuário.
3. **Identificação de pessoa** — Sempre tentar identificar se o remetente já é cadastrado pelo número de telefone ou e-mail.
4. **Captura de novo lead** — Se for um novo contato, criar registro na tabela `people` com status `lead`.
5. **Respeito ao horário** — Fora do horário de atendimento configurado, responder com mensagem de indisponibilidade e prazo de retorno.
6. **Sem invenção de dados** — Horários, endereços, eventos e valores só são informados se estiverem no contexto ou banco.
7. **Escalada em casos críticos** — Ver lista de triggers em `.claude/rules/agent-behavior.md`.
8. **Limite de turnos** — Após 5 trocas sem resolução, escalar para humano.
9. **Histórico de conversa** — Usar as últimas 10 mensagens para manter coerência contextual.
10. **Privacidade** — Nunca citar dados pessoais de outros membros em resposta a qualquer usuário.

---

## Dependências

- Tabelas: `people`, `interactions`, `church_settings`, `churches`
- WhatsApp Business API (para envio de mensagens)
- Instagram Graph API (para DMs)
- `orchestrator` (para classificação de intent)

---

## Fluxo de Processamento

```typescript
async function processDmMessage(input: DmSupportInput): Promise<DmSupportOutput> {
  // 1. Verificar horário de atendimento
  const isBusinessHours = checkBusinessHours(input.context.businessHours);
  if (!isBusinessHours) {
    return generateOffHoursResponse(input.context);
  }

  // 2. Identificar ou criar pessoa
  const person = await identifyOrCreatePerson(input);

  // 3. Carregar histórico da conversa
  const history = await loadConversationHistory(input.externalId, input.churchId);

  // 4. Classificar intent
  const { intent, confidence } = await classifyIntent(input.message, history);

  // 5. Verificar triggers de escalada
  const escalation = await checkEscalationTriggers(input.message, confidence);
  if (escalation.shouldEscalate) {
    await escalateToHuman(input, escalation.reason, person);
    return buildEscalationResponse(input.context.tone, escalation.reason);
  }

  // 6. Buscar informações relevantes no banco (se necessário)
  const relevantData = await fetchRelevantData(intent, input.churchId, input.context);

  // 7. Gerar resposta
  const response = await generateContextualResponse({
    intent,
    confidence,
    context: input.context,
    relevantData,
    history,
    person,
  });

  // 8. Registrar interação (ANTES de retornar)
  await logInteraction({
    churchId: input.churchId,
    channel: input.channel,
    personId: person?.id,
    externalId: input.externalId,
    inboundMessage: input.message,
    outboundMessage: response.text,
    intent,
    confidence,
    wasEscalated: false,
  });

  return response;
}
```

---

## Exemplos

### Exemplo 1 — Saudação de Primeiro Contato

```
Input:
  channel: whatsapp
  message: "Olá, bom dia!"
  personId: null (novo contato)
  context.tone: 'carinhoso'
  context.terminology.meeting: 'culto'

Output:
  response: "Olá! Que alegria ter você aqui! 😊 Sou o assistente digital da Igreja da Graça. Como posso te ajudar hoje? Se quiser saber sobre nossos cultos, grupos ou qualquer outra coisa, pode perguntar!"
  detectedIntent: 'greeting'
  confidence: 0.98
  personCreated: true
  tags: ['new_contact']
  shouldEscalate: false
```

### Exemplo 2 — Pedido de Oração (escalada)

```
Input:
  channel: whatsapp
  message: "Preciso muito de oração, minha família está em crise"
  context.tone: 'carinhoso'

Output:
  response: "Fico muito feliz que você entrou em contato com a gente. ❤️ Vou chamar alguém da nossa equipe pastoral para conversar com você agora. Um minutinho!"
  shouldEscalate: true
  escalationReason: 'Pedido de oração com indicativo de crise familiar — encaminhar para pastor'
  detectedIntent: 'prayer_request_crisis'
  confidence: 0.85
```

### Exemplo 3 — Pergunta sobre Horário

```
Input:
  channel: instagram
  message: "Qual o horário do culto de domingo?"
  context.churchSettings.services: [{ day: 'sunday', time: '10:00', name: 'Culto da Família' }]

Output:
  response: "Oi! O Culto da Família acontece todo domingo às 10h. Te esperamos com alegria! Tem mais alguma dúvida? 😊"
  detectedIntent: 'service_hours'
  confidence: 0.97
  shouldEscalate: false
```

### Exemplo 4 — Fora do Horário

```
Input:
  channel: whatsapp
  message: "Preciso de informação sobre batismo"
  currentTime: 23:45 (fora do horário de atendimento)
  context.businessHours: { weekdays: '09:00-18:00' }

Output:
  response: "Oi! Recebemos sua mensagem sobre o batismo. Nosso horário de atendimento é de segunda a sexta, das 9h às 18h. Amanhã de manhã já te respondemos com todas as informações! 🙏"
  detectedIntent: 'baptism_info'
  shouldEscalate: false
  nextAction: 'follow_up_tomorrow_9am'
```
