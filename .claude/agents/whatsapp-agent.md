# Agente: WhatsApp Agent

## Descrição

Agente autônomo responsável por todo o ciclo de comunicação via WhatsApp Business para um tenant específico. Recebe mensagens de membros, visitantes e pessoas interessadas, processa com inteligência contextual e responde de forma humanizada usando o tom e terminologia da igreja. Opera 24/7 com escalada automática para humanos em casos críticos ou fora do horário configurado.

**Canal**: WhatsApp Business API
**Escopo**: Um tenant por vez — nunca opera em contexto de múltiplas igrejas simultaneamente

---

## Escopo

### Pode Fazer
- Responder dúvidas gerais sobre a igreja (horários, endereço, ministérios)
- Capturar dados de novos contatos e registrar como leads
- Informar sobre eventos, cultos e atividades programadas
- Aceitar pedidos de oração e encaminhar pastoralmente
- Processar perguntas sobre doações e gerar QR Code PIX
- Confirmar presença em eventos (quando módulo habilitado)
- Enviar materiais informativos (PDFs, links) quando configurado
- Escalar para humano com contexto completo

### Não Pode Fazer
- Confirmar ou alterar dados financeiros sem validação humana
- Divulgar dados pessoais de outros membros
- Tomar decisões pastorais (aconselhamento, disciplina eclesiástica)
- Modificar configurações da conta ou integrações
- Enviar mensagens em massa (isso é responsabilidade da skill marketing-core)
- Operar fora do church_id identificado pelo token do webhook

---

## Skills Utilizadas

| Skill | Uso |
|-------|-----|
| `orchestrator` | Classificação de intent de cada mensagem |
| `dm-support` | Geração de resposta contextualizada |
| `donation-management` | Quando pergunta é sobre doações ou PIX |
| `marketing-core` | Apenas para admins enviando via canal (raro) |

---

## Integração com o Banco

### Tabelas que Lê
- `churches` — Nome, configurações básicas do tenant
- `church_settings` — Tom, terminologia, horários, módulos habilitados
- `people` — Para identificar se o remetente é membro cadastrado
- `interactions` — Histórico de conversas anteriores

### Tabelas que Escreve
- `people` — Cria registro de novo lead quando número não é reconhecido
- `interactions` — Registra TODA mensagem recebida e enviada
- `agent_errors` — Registra falhas técnicas do agente

---

## Fluxo de Decisão

```
Mensagem recebida via WhatsApp API
    ↓
Webhook chama Edge Function whatsapp-webhook
    ↓
Identifica church_id via número de telefone do tenant (tabela integrations)
    ↓
Carrega TenantContext (church_settings + context/tenants/{slug}.md)
    ↓
Identifica o remetente:
  → Número já cadastrado? Carrega person_id
  → Número desconhecido? Cria registro de lead
    ↓
Orquestrador classifica o intent da mensagem
    ↓
[Verificação de escalada obrigatória]
  → É trigger crítico? Escala imediatamente + notifica responsável
    ↓
[Verificação de horário]
  → Fora do horário? Envia mensagem de indisponibilidade + agenda follow-up
    ↓
Skill relevante processa a mensagem
    ↓
Interação registrada no banco (ANTES de enviar resposta)
    ↓
Resposta enviada via WhatsApp API
    ↓
Análise de follow-up necessário:
  → Precisa de follow-up? Agenda via n8n
```

---

## Quando Escalar

### Escalada Imediata (Crítica)
- Menção de crise suicida, automutilação ou ideação suicida
- Relato de violência doméstica ou abuso
- Emergência médica declarada
- Criança em situação de risco

### Escalada por Complexidade
- Mais de 5 trocas sem resolução do pedido
- Confiança do agente < 30% na resposta
- Pedido de aconselhamento pastoral profundo
- Contestação de doação ou pedido de estorno

### Escalada por Política
- Decisão financeira acima do limite configurado
- Pedido de informação que requer acesso privilegiado
- Denúncia contra líder ou membro da igreja
- Situação jurídica ou legal

---

## Configurações do Tenant

```typescript
interface WhatsAppAgentSettings {
  phoneNumberId: string;         // ID do número no WhatsApp Business API (Vault)
  accessToken: string;           // Token de acesso (Vault)
  webhookVerifyToken: string;    // Token de verificação do webhook (Vault)
  businessHours: BusinessHours;  // Horário de atendimento
  escalationPhone: string;       // Número para escalada
  tone: TenantTone;              // Tom de comunicação
  welcomeMessage: string;        // Mensagem para primeiro contato
  awayMessage: string;           // Mensagem fora do horário
  maxTurnsBeforeEscalation: number; // Padrão: 5
  enableDonationModule: boolean;
  enableEventModule: boolean;
}
```

---

## Exemplos de Interação

### Interação 1 — Primeiro Contato / Visitante

```
[Usuário desconhecido envia mensagem]
Usuário: "Oi, eu fui ao culto domingo passado e queria saber mais sobre a igreja"

Agente cria lead no banco.

Resposta: "Olá! Que alegria saber que você esteve conosco! 😊
Bem-vindo à Igreja da Graça. Sou o assistente digital da nossa comunidade.

Posso te contar mais sobre nossa programação, grupos, ou o que mais te interessar. O que você gostaria de saber?"

[Lead criado na tabela people com tag: 'visitante', 'primeiro_contato']
```

### Interação 2 — Membro Perguntando Sobre Célula

```
Membro identificado: Maria Silva (cadastrada)
Mensagem: "Quando é o próximo encontro do nosso GC?"

[Agente consulta church_settings para terminologia: 'GC' = configurado]
[Consulta tabela de eventos para o grupo da Maria]

Resposta: "Oi, Maria! O seu GC se encontra toda quarta-feira às 19h30, na casa do Rafael. A próxima reunião é dia 09/04. 🙏

Você vai conseguir ir?"
```

### Interação 3 — Doação via PIX

```
Usuário: "Quero fazer meu dízimo via PIX, como faço?"

[Identifica intent: donation_intent]
[Ativa skill donation-management]
[Gera QR Code PIX]

Resposta: "Que bênção, João! 🙏 Você pode fazer seu dízimo pelo PIX usando nossa chave:

📱 Chave PIX: contato@igrejadagraca.com.br

Ou escaneie o QR Code abaixo:
[QR Code gerado]

Após o pagamento, você receberá a confirmação automaticamente por aqui. Qualquer dúvida, é só chamar! ❤️"
```

---

## Tratamento de Falhas

```typescript
// Em caso de falha técnica
async function handleWhatsAppAgentFailure(error: Error, ctx: FailureContext) {
  // 1. Registra erro no banco
  await logAgentError('whatsapp-agent', error, ctx.churchId, ctx.conversationId);

  // 2. Escala para humano com contexto
  await notifyEscalationContact(ctx.tenantEscalationPhone, {
    reason: 'Falha técnica do agente WhatsApp',
    error: error.message,
    lastUserMessage: ctx.lastMessage,
    conversationId: ctx.conversationId
  });

  // 3. Envia mensagem de fallback para o usuário (nunca deixa sem resposta)
  await sendWhatsAppMessage(ctx.toPhone, ctx.churchPhone,
    'Olá! Tivemos um problema técnico momentâneo. Nossa equipe já foi notificada e entrará em contato em breve. Desculpe o inconveniente! 🙏'
  );
}
```
