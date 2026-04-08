# Rule: Design de Agentes

> **Versão:** 1.0.0 | **Status:** Ativo — produção | **Revisão:** 2026-04-07

---

## 1. O que é um Agente no Ekthos

### Definições operacionais

**Agente** é um processo autônomo que opera em um canal específico de comunicação, 24 horas por dia. Ele:
- Possui identidade e tom configurados por tenant
- Persiste todas as interações antes de responder
- Toma decisões dentro de um escopo restrito e documentado
- Escala para humano quando ultrapassa os limites do escopo

**Skill** é um módulo de competência reutilizável sem canal próprio. Ela:
- Recebe input estruturado e retorna output estruturado
- Não mantém estado entre chamadas
- Pode ser chamada por qualquer agente ou outra skill
- Executa uma função específica e bem delimitada

**Automação** é um processo sem interação humana direta. Ela:
- É executada pelo n8n de forma assíncrona
- Não tem interface de conversa
- Opera em horário programado ou por evento do banco
- Não escala para humano — registra falha e notifica

### Tabela comparativa

| Característica | Agente | Skill | Automação |
|---|---|---|---|
| Interface | Canal (WhatsApp, IG) | Nenhuma (chamada interna) | Nenhuma (trigger) |
| Estado | Conversa ativa via banco | Stateless | Stateless |
| Escala para humano | Sim | Não (retorna erro) | Não (notifica falha) |
| Horário | 24/7 | Qualquer momento | Programado ou por evento |
| Persistência | interactions antes de responder | Caller persiste | n8n persiste resultado |

---

## 2. Template Obrigatório de Especificação de Agente

Todo arquivo `.claude/agents/{nome}-agent.md` deve conter obrigatoriamente:

```markdown
# Agente: {nome}

## Identidade
- **Nome operacional:** {como o agente se apresenta}
- **Canal:** WhatsApp | Instagram | Interno | Multi-canal
- **Escopo:** {descrição de 1-2 linhas do que o agente faz}
- **Versão:** {semver}
- **Status:** ativo | standby | desabilitado

## Capacidades (o que pode fazer)
- Lista explícita de ações que o agente executa
- Cada item é uma ação concreta, não uma categoria vaga

## Limitações (o que NÃO pode fazer)
- Lista explícita de o que está fora do escopo
- Inclui: temas fora do domínio, decisões financeiras, dados de outros tenants

## Pré-condições de Operação
- Módulo habilitado: {nome_do_modulo_em_modules_enabled}
- Integrações obrigatórias: {lista}
- Contexto obrigatório: context/tenants/{slug}.md

## Sequência de Carregamento de Contexto
1. Verificar onboarding_completed = true
2. Verificar módulo habilitado em modules_enabled
3. Carregar church_settings.labels (terminologia, tom, horários)
4. Carregar context/tenants/{slug}.md
5. Identificar o contato em people (criar se novo)
6. Carregar histórico das últimas 5 interações do contato

## Fluxo de Resposta
{diagrama ASCII do fluxo de decisão do agente}

## Critérios de Escalada para Humano
- Incerteza > 70%: sempre escala
- Temas pastorais/crise: escalada imediata
- Decisão financeira acima de: {limite configurável}
- {critérios específicos do agente}

## Formato de Escalada
{formato padrão da mensagem enviada ao humano responsável}

## Registro Obrigatório
- interactions: {quais campos, quando inserir}
- audit_logs: {quais ações geram audit log}

## Comportamento Fora do Horário
{o que o agente faz fora do horário configurado}

## Skills que Este Agente Usa
- {skill-1}: para {finalidade}
- {skill-2}: para {finalidade}

## Dependências
- Tabelas: {lista de tabelas acessadas}
- Edge Functions: {lista}
- Integrações externas: {lista}
```

---

## 3. Contrato de Interface

Agentes se comunicam com skills via contrato TypeScript padronizado:

```typescript
// Tipos compartilhados — em _shared/types.ts

interface TenantContext {
  church_id: string
  slug: string
  labels: {
    terminology: Record<string, string>  // ex: { grupo_conexao: 'célula' }
    communication_style: 'formal' | 'informal' | 'acolhedor'
    use_emojis: boolean
    support_hours: SupportHours
    escalation_contacts: EscalationContact[]
  }
  modules_enabled: Record<string, boolean>
}

interface AgentInput {
  church_id: string          // extraído da integração, nunca do usuário
  tenant_context: TenantContext
  person_id?: string         // se o contato já existe em people
  channel: 'whatsapp' | 'instagram' | 'internal'
  message: {
    id: string               // ID único da mensagem no sistema externo
    content: string          // texto da mensagem
    type: 'text' | 'image' | 'audio' | 'document'
    timestamp: string        // ISO 8601
    from: string             // número/username do remetente
  }
  conversation_history: InteractionSummary[]  // últimas 5 interações
  trace_id: string
}

interface AgentOutput {
  response_text: string
  escalate?: EscalationRequest
  actions?: AgentAction[]    // ações a executar (ex: criar contato, atualizar pipeline)
  audit_entry?: AuditEntry
}

interface EscalationRequest {
  reason: 'incerteza_alta' | 'tema_pastoral' | 'decisao_financeira' | 'solicitacao_explícita'
  urgency: 'imediata' | 'proxima_hora' | 'proximo_dia_util'
  context_summary: string    // resumo para o humano
  contact: EscalationContact // quem deve receber
  conversation_history: InteractionSummary[]
}

interface AgentAction {
  type: 'upsert_person' | 'update_pipeline' | 'register_donation' | 'create_follow_up'
  payload: Record<string, unknown>
}

// Contrato de skill — todo agente usa este tipo ao chamar skills
interface SkillInput {
  church_id: string
  tenant_context: TenantContext
  payload: Record<string, unknown>
  trace_id: string
}

interface SkillOutput {
  success: boolean
  data?: Record<string, unknown>
  error?: { code: string; message: string; recoverable: boolean }
  audit_entry?: AuditEntry
  escalate?: EscalationRequest
}
```

---

## 4. Carregamento de Contexto

A sequência abaixo é **obrigatória** antes de qualquer resposta do agente. Não é opcional. Não pode ser cacheada por mais de 5 minutos em memória volátil.

```
SEQUÊNCIA OBRIGATÓRIA DE CARREGAMENTO:

1. VALIDAR TENANT
   ├── onboarding_completed = true?
   │   → não: retorna mensagem padrão "em configuração", não processa
   └── módulo do canal habilitado em modules_enabled?
       → não: não responde, registra em audit_logs

2. CARREGAR CONFIGURAÇÕES DO TENANT
   ├── SELECT * FROM church_settings WHERE church_id = $1
   ├── Extrai: terminology, communication_style, support_hours, escalation_contacts
   └── Extrai: limites de escalada, temas proibidos

3. CARREGAR CONTEXTO DE LINGUAGEM
   └── Lê context/tenants/{slug}.md
       ├── Terminologia própria (para evitar termos errados)
       ├── Tom da comunicação
       └── Restrições específicas da igreja

4. IDENTIFICAR O CONTATO
   ├── Busca em people por phone/instagram_id/email
   ├── Se não existe: cria registro básico (nome extraído, canal, created_at)
   └── Carrega histórico: SELECT * FROM interactions WHERE person_id = $1
       ORDER BY created_at DESC LIMIT 5

5. VERIFICAR HORÁRIO
   ├── Está dentro do horário configurado em support_hours?
   │   → sim: opera normalmente
   └── não: responde com mensagem de fora do horário, não processa
       (exceto urgências pastorais que notificam contato de plantão)

6. PROCESSAR MENSAGEM
   └── Com todo o contexto carregado, classifica intenção e responde
```

---

## 5. Escopo Restrito

O escopo de cada agente deve ser explicitamente documentado em duas listas:

### O que PODE fazer
Lista granular e específica. Exemplos:
```
WhatsApp Agent PODE:
  - Responder perguntas sobre horários de culto
  - Registrar interesse de visitante
  - Confirmar presença em evento
  - Encaminhar comprovante de doação para processamento
  - Enviar informações sobre células/grupos
  - Fazer follow-up de contato inativo (via automação)
```

### O que NÃO PODE fazer (explícito no código)
```typescript
const TEMAS_PROIBIDOS = [
  'aconselhamento pastoral profundo',
  'diagnóstico de saúde espiritual',
  'conflitos internos da liderança',
  'cancelamento de doações recorrentes sem confirmação humana',
  'alteração de dados cadastrais sem confirmação do próprio contato',
  'informações sobre outros membros da igreja'
]

function detectaTemaPRoibido(mensagem: string): boolean {
  // Implementação via LLM com lista de exemplos — não regex simples
  // Integrado ao fluxo de classificação de intenção
}
```

---

## 6. Padrão de Escalada

### Threshold de escalada

```typescript
const ESCALADA_IMEDIATA = [
  'crise_emocional',
  'risco_de_vida',
  'conflito_grave',
  'demanda_juridica',
  'reclamacao_lideranca'
]

const ESCALADA_NORMAL = [
  'incerteza_alta',  // confiança da classificação < 30%
  'fora_do_escopo',
  'solicitacao_de_humano',
  'decisao_financeira_acima_limite'
]
```

### Formato obrigatório da mensagem para humano

```
[EKTHOS — ESCALADA {urgência: IMEDIATA | NORMAL}]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Igreja: {nome da igreja}
Canal: {WhatsApp | Instagram}
Contato: {nome} — {número/username}
Data: {timestamp local do tenant}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
MOTIVO: {classificação do motivo de escalada}

HISTÓRICO (últimas 3 mensagens):
  [{timestamp}] {contato}: "{texto}"
  [{timestamp}] Agente: "{texto}"
  [{timestamp}] {contato}: "{texto}"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SUGESTÃO DO AGENTE: {o que o agente recomenda fazer}
LINK DO PAINEL: {url do dashboard do tenant}
```

### Quem recebe a escalada

Definido em `church_settings.labels.escalation_contacts`:
- `role: 'pastoral'` — recebe escaladas pastorais
- `role: 'admin'` — recebe escaladas administrativas
- `role: 'financeiro'` — recebe escaladas financeiras
- `role: 'tecnico'` — recebe falhas técnicas

---

## 7. Operação 24h

### Comportamento por período

```
Dentro do horário configurado:
  → Opera normalmente
  → Escala para humano disponível

Fora do horário (horário comercial):
  → Responde com mensagem de fora do horário (da config do tenant)
  → Registra a mensagem para follow-up no próximo dia útil
  → Cria task em pipeline para o humano responsável

Urgências pastorais fora do horário:
  → Envia notificação imediata para contato de plantão (WhatsApp/SMS)
  → Registra com urgency='imediata' em audit_logs

Feriados:
  → Tratados como fora do horário
  → Configurável em church_settings.labels.holidays
```

### Failover

```
Agente não responde em 30s?
  → Resposta automática padrão: "Recebemos sua mensagem e em breve retornaremos"
  → Alerta enviado para equipe Ekthos (n8n health-check workflow)

Integração externa offline (WhatsApp API, Instagram API)?
  → Agente continua tentando com retry (3x com backoff)
  → Após 3 falhas: registra em webhook_failures, notifica equipe Ekthos
  → Não perde a mensagem: fica em webhook_queue com status='pending'
```

### Health check (n8n, a cada 5 minutos)

```
VERIFICA:
  - Edge Function respondendo (GET /health → 200)
  - Última mensagem processada há menos de 1 hora (para tenants ativos)
  - Taxa de erro em audit_logs < 5% nas últimas 24h
  - Integrações ativas retornando status 200

ALERTAS:
  - Canal Slack/WhatsApp interno da equipe Ekthos
  - Registro em audit_logs com severity='critical'
```

---

## 8. Registro Obrigatório

### Tabela interactions — o que registrar

```typescript
// SEMPRE antes de enviar resposta
await supabase.from('interactions').insert({
  church_id,                    // obrigatório
  person_id,                    // id da pessoa em people
  type: 'whatsapp',             // whatsapp | instagram | manual | evento | doação
  direction: 'inbound',         // inbound | outbound
  content: {
    message_id: externalId,     // ID no sistema externo
    text: mensagemRecebida,
    intent: intencaoClassificada,
    confidence: 0.87,           // confiança da classificação
    agent_response: textoResposta
  },
  channel_metadata: {
    phone_number: remetente,
    message_type: 'text'
  },
  created_at: new Date().toISOString()
})
```

### Tabela audit_logs — quando registrar

```
SEMPRE registra em audit_logs:
  - Escalada para humano (action: 'agent.escalated')
  - Criação de novo contato em people (action: 'person.created')
  - Falha de processamento (action: 'agent.processing_failed')
  - Resposta fora do escopo detectada (action: 'agent.scope_violation_detected')
  - Tema proibido detectado (action: 'agent.prohibited_topic_detected')
  - Início de campanha de envio em massa (action: 'campaign.started')

NÃO registra em audit_logs (apenas em interactions):
  - Respostas normais de triagem
  - Confirmações de presença em evento
  - Respostas a perguntas frequentes
```

---

## 9. Adição de Novo Agente — Checklist

Antes de ativar em produção, todos os itens devem estar verificados:

```
[ ] 1. Arquivo .claude/agents/{nome}-agent.md criado com template completo
[ ] 2. ekthos-chief-architect invocado (MODO=EVALUATE) — STATUS=APROVADO obtido
[ ] 3. Escopo documentado explicitamente (pode fazer / não pode fazer)
[ ] 4. Sequência de carregamento de contexto implementada e testada
[ ] 5. Critérios de escalada implementados e testados com casos de teste
[ ] 6. Formato de escalada testado com contato de plantão real
[ ] 7. Registro em interactions testado (verifica church_id, person_id, tipo correto)
[ ] 8. Registro em audit_logs testado para os eventos obrigatórios
[ ] 9. Comportamento fora do horário testado manualmente
[ ] 10. Health check do n8n configurado para este agente
[ ] 11. Módulo habilitado em church_settings para o tenant de teste
[ ] 12. Teste de isolamento: agente não vaza dados de outro tenant (teste automatizado)
[ ] 13. Documentação de troubleshooting adicionada ao arquivo do agente
[ ] 14. Revisão de segurança via ekthos-chief-architect (MODO=REVIEW)
[ ] 15. Deploy em staging → teste com tenant de homologação → deploy em produção
```

---

## 10. Regras Numeradas

```
AGT-01: Todo agente passa pelo ekthos-chief-architect (MODO=EVALUATE) antes de ser criado
AGT-02: Todo agente carrega o contexto completo do tenant antes de qualquer resposta
AGT-03: Todo agente registra a interação em interactions ANTES de enviar a resposta
AGT-04: Nenhum agente opera sem onboarding_completed = true para o tenant
AGT-05: Nenhum agente usa dados de outro tenant — isolamento verificado por RLS e por código
AGT-06: Incerteza > 70% na classificação de intenção → escalada automática
AGT-07: Temas pastorais de crise → escalada imediata, sem tentativa de responder
AGT-08: Decisões financeiras acima do limite configurado → escalada com confirmação humana
AGT-09: Agentes não inventam informações — retornam "não sei" e escalam quando não têm dados
AGT-10: O agente nunca confirma ser uma IA a menos que configurado explicitamente pelo tenant
AGT-11: Mensagens fora do horário geram registro mas não escalada imediata (exceto urgência pastoral)
AGT-12: Falhas de integração (timeout, 5xx) são registradas em webhook_failures — mensagem não é perdida
AGT-13: O escopo de cada agente é documentado em arquivo .md versionado no repositório
AGT-14: Testes de isolamento são executados antes de todo deploy que afete agentes
AGT-15: Health check via n8n a cada 5 minutos — falha detectada notifica equipe em < 1 minuto
```

---

## 11. Template de Arquivo de Agente

```markdown
# Agente: {nome-do-agente}

## Identidade
- **Nome operacional:** {ex: "Equipe Ekthos", "Assistente da Igreja Graça"}
- **Canal:** WhatsApp
- **Escopo:** {descrição objetiva em 1-2 linhas}
- **Versão:** 1.0.0
- **Status:** standby (ativo apenas após checklist de produção)

## Capacidades

- Triagem e classificação de mensagens recebidas
- {capacidade específica 2}
- {capacidade específica 3}
- {capacidade específica N}

## Limitações Explícitas

- NÃO responde sobre: aconselhamento profundo, diagnósticos, conflitos internos
- NÃO executa decisões financeiras sem confirmação humana
- NÃO compartilha dados de um membro com outro
- NÃO opera se onboarding_completed = false

## Pré-condições

- `modules_enabled.whatsapp_agent = true`
- Integração WhatsApp configurada em `integrations` com status='active'
- `context/tenants/{slug}.md` existente
- `church_settings.labels.escalation_contacts` com ao menos 1 contato pastoral

## Sequência de Carregamento de Contexto

1. Verificar onboarding_completed
2. Verificar modules_enabled.whatsapp_agent
3. Carregar church_settings.labels
4. Carregar context/tenants/{slug}.md
5. Identificar contato em people (criar se novo)
6. Carregar últimas 5 interações do contato

## Fluxo de Resposta

```
Mensagem recebida via webhook
    ↓
Valida assinatura HMAC (Edge Function)
    ↓
Resolve church_id via phone_number_id
    ↓
Carrega contexto (sequência obrigatória)
    ↓
Verifica horário de operação
  → Fora do horário: resposta padrão + agenda follow-up
    ↓
Classifica intenção (skill: orchestrator)
    ↓
Incerteza > 70%? → Escala para humano
    ↓
Tema proibido? → Escala para humano
    ↓
INSERT em interactions (antes de responder)
    ↓
Executa skill correspondente
    ↓
Envia resposta via WhatsApp API
```

## Critérios de Escalada

| Condição | Urgência | Destinatário |
|---|---|---|
| Crise pastoral/emocional | Imediata | role='pastoral' |
| Incerteza > 70% | Normal | role='admin' |
| Decisão financeira > R$ 500 | Imediata | role='financeiro' |
| Solicitação explícita de humano | Normal | role='admin' |
| Erro técnico crítico | Imediata | role='tecnico' (equipe Ekthos) |

## Registro Obrigatório

- `interactions`: toda mensagem recebida e toda resposta enviada
- `audit_logs`: escaladas, criação de contatos, falhas de processamento

## Comportamento Fora do Horário

Resposta automática configurada em `church_settings.labels.out_of_hours_message`.
Registro em interactions com flag `out_of_hours: true`.
Criação de follow-up task no pipeline para retorno no próximo horário útil.

## Skills Utilizadas

- `orchestrator`: classificação de intenção
- `dm-support`: atendimento de suporte geral
- `church-onboarding`: captação de novos visitantes
- `donation-management`: processamento de comprovantes

## Dependências

- Tabelas: `churches`, `church_settings`, `people`, `interactions`, `integrations`, `audit_logs`
- Edge Functions: `webhook-whatsapp`, `whatsapp-sender`
- Integração: WhatsApp Business API (token no Vault)

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| Agente não responde | Token WhatsApp expirado | Reconfigurar integração |
| Resposta em linguagem errada | context/tenants/{slug}.md desatualizado | Atualizar arquivo de contexto |
| Escalada não chegando | escalation_contacts mal configurado | Verificar church_settings |
```
