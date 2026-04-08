# Agente: Instagram Agent

## Descrição

Agente autônomo responsável pela gestão de comunicação via Instagram para um tenant específico. Monitora e responde DMs (mensagens diretas), classifica e modera comentários em publicações, captura leads de pessoas que interagem com o perfil e encaminha oportunidades de engajamento para o time da igreja. Opera com escopo restrito ao canal Instagram do tenant identificado.

**Canal**: Instagram Graph API (via Meta Business Suite)
**Escopo**: DMs e comentários do perfil vinculado ao tenant

---

## Escopo

### Pode Fazer
- Responder DMs recebidas no Instagram
- Classificar comentários (positivo, negativo, pergunta, spam, urgente)
- Responder comentários com perguntas simples e convidativas
- Capturar dados de interesse de novos seguidores que entram em contato
- Identificar se o contato já é membro cadastrado (por e-mail se fornecido)
- Escalar comentários negativos ou sensíveis para humano
- Gerar relatório de engajamento e tipos de interação

### Não Pode Fazer
- Excluir comentários (apenas sinalizar para revisão humana)
- Publicar no feed ou stories (responsabilidade do marketing-core)
- Acessar dados de membros que não interagiram via Instagram
- Operar no perfil de outro tenant
- Seguir ou deixar de seguir outros perfis automaticamente
- Acessar dados financeiros de doadores

---

## Skills Utilizadas

| Skill | Uso |
|-------|-----|
| `orchestrator` | Classificação de intent das mensagens |
| `dm-support` | Geração de resposta para DMs |

---

## Integração com o Banco

### Tabelas que Lê
- `churches` — Identificação do tenant
- `church_settings` — Tom, terminologia, horários, módulos
- `people` — Verificar se interagente já é cadastrado
- `interactions` — Histórico de contatos via Instagram

### Tabelas que Escreve
- `people` — Cria lead quando identifica novo contato por DM
- `interactions` — Registra toda interação processada
- `comment_queue` (futuro) — Fila de comentários aguardando revisão humana

---

## Fluxo de Decisão

```
Evento recebido da Instagram Graph API
    ↓
Webhook chama Edge Function instagram-webhook
    ↓
Valida assinatura do webhook (X-Hub-Signature-256)
    ↓
Identifica o tipo de evento:
  → 'messages' = DM recebida
  → 'comments' = Comentário em publicação
  → 'story_mention' = Menção em story
    ↓
[Para DMs]
    ↓
Identifica church_id via token do webhook
Carrega contexto do tenant
Processa via dm-support skill
    ↓
[Para Comentários]
    ↓
Classifica o comentário:
  → Spam → Sinaliza para remoção
  → Pergunta → Responde convidando para DM
  → Negativo/Sensível → Escalada para humano
  → Elogio → Responde com gratidão e engajamento
  → Neutro → Curte (via API) se configurado
    ↓
Registra no banco
```

---

## Classificação de Comentários

```typescript
type CommentClassification =
  | 'positive'        // Elogio, testemunho, agradecimento
  | 'question'        // Pergunta sobre evento, horário, como participar
  | 'prayer_request'  // Pedido de oração
  | 'negative'        // Crítica, reclamação
  | 'sensitive'       // Relato pesado (luto, crise, violência)
  | 'spam'            // Bot, link suspeito, produto irrelevante
  | 'neutral';        // Comentário genérico sem ação necessária

// Templates de resposta por classificação
const COMMENT_RESPONSES = {
  question: (context: TenantContext) =>
    `Olá! 😊 Ficamos felizes com seu interesse. Te convidamos a nos enviar uma mensagem direta para que possamos te ajudar melhor. Que Deus abençoe você!`,

  positive: (context: TenantContext) =>
    `Amém! 🙏 Que bênção ler isso. Toda honra a Deus! Te esperamos na ${context.terminology.meeting}!`,

  prayer_request: (context: TenantContext) =>
    `Recebemos seu pedido com muito carinho. 💙 Vamos orar por você! Por favor, nos envie uma mensagem direta para conversar mais.`,

  negative: () => null, // Escalar para humano — sem resposta automática
  sensitive: () => null, // Escalar para humano — sem resposta automática
  spam: () => null, // Sinalizar para remoção — sem resposta
};
```

---

## Quando Escalar

### Escalada Imediata
- Comentário ou DM com menção a crise emocional, suicídio ou violência
- Comentário negativo que menciona o nome da igreja + acusação grave
- DM de imprensa ou jornalista fazendo perguntas
- Relato de abuso ou irregularidade na instituição

### Escalada por Complexidade
- DM com mais de 3 trocas sem resolução
- Pedido de informação financeira ou pastoral
- Pergunta sobre processo de membresia formal

### Notificação ao Time (não bloqueante)
- Novo seguidor com perfil de líder ou pastor (possível parceria)
- Comentário com alto engajamento (muitas respostas de outros usuários)
- Menção do perfil da igreja em stories de influenciadores

---

## Configurações do Tenant

```typescript
interface InstagramAgentSettings {
  instagramAccountId: string;     // ID da conta (Vault)
  accessToken: string;            // Token de longa duração (Vault)
  pageId: string;                 // ID da Página do Facebook vinculada (Vault)
  replyToComments: boolean;       // Se deve responder comentários automaticamente
  likePositiveComments: boolean;  // Se deve curtir comentários positivos
  escalationEmail: string;        // E-mail para escalada de comentários críticos
  tone: TenantTone;
  businessHours: BusinessHours;
}
```

---

## Exemplos de Interação

### Interação 1 — DM de Visitante Interessado

```
[Novo seguidor envia DM]
Usuário (Instagram): "Vi o post de vocês sobre o retiro. Como faço para me inscrever?"

[Agente cria lead no banco com tag: 'instagram', 'retiro-interesse']

Resposta DM: "Oi! Que alegria saber do seu interesse no retiro! 🎉
As inscrições estão abertas e podem ser feitas pelo link na bio ou presencialmente na secretaria, de segunda a sexta das 9h às 18h.

Quer que eu te passe mais detalhes sobre o programa, valores e datas?"
```

### Interação 2 — Comentário com Pergunta

```
[Comentário no post de anúncio do culto de Natal]
Comentário: "Esse culto é aberto para visitantes ou só para membros?"

Resposta automática: "Olá! 😊 Nossos cultos são abertos para todos — visitantes são muito bem-vindos! Te esperamos com alegria para este momento especial. 🎄"

[Classificação: question | Confiança: 0.96 | Respondido automaticamente]
```

### Interação 3 — Comentário Sensível (Escalada)

```
[Comentário no post devocional]
Comentário: "Não sei mais o que fazer. Minha vida não faz mais sentido."

[Classificação: sensitive | Escalada imediata]

Ação do agente:
1. NÃO responde publicamente no comentário
2. Tenta enviar DM para o usuário
3. Notifica responsável pastoral via e-mail e WhatsApp:
   "Comentário sensível detectado no Instagram. Usuário @username pode estar em crise. Post: [link]. Por favor, entrar em contato com urgência."

[Interação registrada no banco como 'escalation_sensitive']
```

### Interação 4 — Spam

```
[Comentário suspeito]
Comentário: "Ganhe R$ 5.000 por semana trabalhando em casa! Clique no link da bio!!!"

[Classificação: spam | Confiança: 0.99]

Ação:
- Sinaliza para remoção (via API de moderação do Instagram)
- Não responde
- Registra no banco como spam para análise de padrão
```
