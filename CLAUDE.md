# CLAUDE.md — Sistema Operacional Ekthos Platform

> **Este arquivo é o kernel do sistema.**
> Todo agente, skill, automação e desenvolvedor obedece ao que está aqui.
> Leia antes de agir. Consulte antes de decidir. Atualize quando o sistema evoluir.

```
Versão : 2.0.0
Revisão: 2026-04-07
Status : Ativo — produção
```

---

## SUMÁRIO DE INICIALIZAÇÃO

```
[BOOT] Ekthos Platform v2
  ├── [OK] Princípios do sistema carregados
  ├── [OK] Multi-tenant ativado
  ├── [OK] Supabase como fonte única de dados
  ├── [OK] Contexto persistente por tenant
  ├── [OK] Skills registradas
  ├── [OK] Agentes distribuídos em standby
  ├── [OK] n8n como orquestrador de automações
  └── [OK] Suporte 24h operacional
```

---

## SEÇÃO 0 — O QUE É O EKTHOS

O Ekthos Platform é um **sistema operacional de inteligência artificial** construído para igrejas.

Não é um CRM adaptado. Não é um chatbot genérico. Não é uma plataforma de marketing.

É um sistema que **pensa, age e opera** dentro da realidade de uma igreja — com a linguagem certa, o contexto certo e os processos certos — de forma autônoma, escalável e multi-tenant.

### Analogia de Sistema Operacional

| Componente do SO | Componente Ekthos |
|---|---|
| Kernel | CLAUDE.md + Regras |
| Processos | Agentes |
| Bibliotecas | Skills |
| Sistema de arquivos | Supabase (fonte única de dados) |
| Usuários e permissões | Multi-tenant + RLS |
| Scheduler | n8n (orquestrador de automações) |
| Shell / Interface | Frontend multi-tenant (fase futura) |
| Logs do sistema | audit_logs (tabela Supabase) |
| Configuração por usuário | context/tenants/{slug}.md |

### Premissa Central

> Uma igreja não precisa de mais uma ferramenta.
> Ela precisa de um sistema que já sabe o que fazer.

O Ekthos elimina a fricção operacional. O pastor foca no ministério. O sistema cuida do resto.

---

## SEÇÃO 1 — ARQUITETURA MULTI-TENANT

### 1.1 Definição de Tenant

Um **tenant** é uma igreja (ou futuramente: clínica, empresa) com isolamento total de dados, identidade e configuração dentro da plataforma.

```
Plataforma Ekthos
├── Tenant: Igreja Graça (church_id: uuid-001)
│   ├── Membros, doações, campanhas, interações
│   └── Agentes operando com contexto próprio
│
├── Tenant: Igreja Shalom (church_id: uuid-002)
│   ├── Membros, doações, campanhas, interações
│   └── Agentes operando com contexto próprio
│
└── Tenant: Igreja Vida Nova (church_id: uuid-003)
    └── ...
```

### 1.2 Regras de Isolamento (invioláveis)

```
REGRA MT-01: Toda query ao banco DEVE conter church_id no WHERE
REGRA MT-02: church_id NUNCA vem do cliente — sempre do token de sessão
REGRA MT-03: RLS DEVE estar ativo em 100% das tabelas
REGRA MT-04: Contexto de IA DEVE ser carregado por tenant antes de qualquer processamento
REGRA MT-05: Logs de auditoria são por tenant — nunca agregados sem permissão explícita
REGRA MT-06: Dados de um tenant JAMAIS são usados para treinar ou contextualizar outro
```

### 1.3 Fluxo de Validação do Tenant

```
Requisição entra (API / Webhook / Agente)
    ↓
Extrai token JWT do header Authorization
    ↓
Supabase valida token → retorna auth.uid()
    ↓
SELECT church_id FROM profiles WHERE id = auth.uid()
    ↓
church_id validado → injetado em todas as queries subsequentes
    ↓
RLS do Supabase bloqueia qualquer acesso fora do church_id
    ↓
Operação executada com segurança
```

### 1.4 Schema de Multi-Tenancy no Banco

Todas as tabelas seguem o padrão:

```sql
CREATE TABLE nome_tabela (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  -- campos específicos da tabela
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS obrigatório
ALTER TABLE nome_tabela ENABLE ROW LEVEL SECURITY;

-- Policy padrão: usuário vê apenas seu tenant
CREATE POLICY "tenant_isolation" ON nome_tabela
  USING (church_id = (
    SELECT church_id FROM profiles WHERE id = auth.uid()
  ));
```

---

## SEÇÃO 2 — SUPABASE: FONTE ÚNICA DE VERDADE

O Supabase é o **único** sistema de persistência do Ekthos. Nenhum agente, skill ou automação mantém estado próprio — tudo é lido e escrito no Supabase.

### 2.1 Responsabilidades do Supabase

| Serviço | Uso no Ekthos |
|---|---|
| **PostgreSQL** | Todos os dados de negócio |
| **Auth** | Autenticação de usuários e validação de tenant |
| **Edge Functions** | Processamento serverless, webhooks, lógica sensível |
| **Storage** | Logos de igrejas, arquivos de membros, assets |
| **Vault** | Tokens de integração (WhatsApp, Instagram, gateways) |
| **Realtime** | Notificações em tempo real para o dashboard |
| **Row Level Security** | Isolamento total por tenant |

### 2.2 Tabelas Principais

```
churches            → Cadastro de tenants (igrejas)
church_settings     → Configuração por tenant (módulos, labels, cores)
profiles            → Usuários da plataforma (admins, membros da equipe)
user_roles          → Papéis por usuário (admin, operador, visualizador)
people              → Membros e contatos da igreja
interactions        → Histórico de interações (WhatsApp, Instagram, manual)
pipeline_stages     → Etapas do funil de acompanhamento
person_pipeline     → Posição de cada pessoa no pipeline
donations           → Dízimos, ofertas e campanhas financeiras
integrations        → Tokens e configurações de integrações externas
campaigns           → Campanhas de comunicação e marketing
audit_logs          → Logs de auditoria de todas as operações críticas
```

### 2.3 Princípio de Dados

```
DADO NÃO ESTÁ NO SUPABASE = DADO NÃO EXISTE PARA O SISTEMA

Agentes não memorizam. Skills não cachiam estado.
Toda informação relevante é persistida imediatamente.
```

### 2.4 Ordem de Operação com o Banco

```
1. Valida autenticação → extrai church_id
2. Lê contexto do tenant (church_settings + context/tenants/{slug}.md)
3. Executa operação com church_id injetado
4. Persiste resultado (incluindo interações de agentes)
5. Registra em audit_logs se operação crítica
6. Retorna resposta
```

---

## SEÇÃO 3 — SISTEMA DE ONBOARDING AUTOMATIZADO POR IA

### 3.1 Princípio

Uma nova igreja deve se tornar operacional **sem intervenção manual da equipe Ekthos**. O onboarding é conduzido 100% pelo agente `church-onboarding-agent`.

O agente coleta apenas o essencial, interpreta o que for ambíguo e constrói a configuração do tenant automaticamente.

### 3.2 Fluxo Completo de Onboarding

```
Passo 1 → Acesso ao link de onboarding (token único por convite)
    ↓
Passo 2 → church-onboarding-agent inicia entrevista estruturada:
  - "Como a sua igreja se chama?"
  - "Qual é o tamanho aproximado da congregação?"
  - "Vocês chamam de células, GCs, grupos, casas ou outro nome?"
  - "Qual é o tom de comunicação da igreja? (formal, descontraído, acolhedor...)"
  - "Quais canais usam? (WhatsApp, Instagram, ambos)"
  - "O que mais toma tempo da equipe hoje?"
    ↓
Passo 3 → Skill church-onboarding processa respostas:
  - Mapeia terminologia → estrutura interna padronizada
  - Detecta módulos necessários
  - Identifica tom e linguagem
    ↓
Passo 4 → Geração automática de:
  ├── INSERT na tabela churches
  ├── INSERT na tabela church_settings (módulos + labels customizados)
  ├── Criação de context/tenants/{slug}.md
  └── Configuração de integrações selecionadas
    ↓
Passo 5 → Validação interna automatizada (audit-project --tenant={slug})
    ↓
Passo 6 → Igreja operacional — agentes ativados para o tenant
    ↓
Passo 7 → Notificação para equipe Ekthos com resumo do tenant
```

### 3.3 Arquivo de Contexto do Tenant

Cada igreja recebe um arquivo em `context/tenants/{slug}.md` com a seguinte estrutura:

```markdown
# Contexto: {Nome da Igreja}

## Identidade
- Nome oficial: ...
- Slug: ...
- Tamanho: ...
- Fuso horário: ...

## Terminologia Própria
- Grupos de conexão: células / GCs / casas / [customizado]
- Membros novos: visitantes / novos amigos / [customizado]
- Liderança: pastores / líderes / presbíteros / [customizado]

## Tom de Comunicação
- Estilo: formal | informal | acolhedor | evangelístico
- Emojis: sim | não | moderado
- Tratamento: "você" | "tu" | "irmão/irmã"

## Módulos Ativos
- [ ] WhatsApp Agent
- [ ] Instagram Agent
- [ ] Pipeline de Membros
- [ ] Gestão de Doações
- [ ] Campanhas de Marketing

## Integrações Configuradas
- WhatsApp: número, phone_number_id (token no Vault)
- Instagram: account_id (token no Vault)
- Gateway de pagamento: [gateway] (chaves no Vault)

## Restrições e Exceções
- Escalada obrigatória para: ...
- Assuntos que o agente NÃO responde: ...
- Contato humano responsável: ...
```

### 3.4 Regras do Onboarding

```
REGRA ON-01: O agente NUNCA assume — sempre pergunta quando incerto
REGRA ON-02: Dados financeiros (gateway, chaves) vão direto para o Vault — nunca em texto
REGRA ON-03: O contexto do tenant é imutável pelo agente após criação — só admin altera
REGRA ON-04: Se onboarding falhar na validação, nenhum agente é ativado para o tenant
REGRA ON-05: Todo onboarding gera registro em audit_logs com timestamp e dados coletados
```

---

## SEÇÃO 4 — AGENTES DISTRIBUÍDOS

### 4.1 Princípio de Agentes

Agentes são processos autônomos que operam em canais específicos **24 horas por dia, 7 dias por semana**. Cada agente:

- Opera **exclusivamente** dentro do seu canal e escopo
- Carrega o contexto do tenant antes de qualquer resposta
- Registra toda interação no banco antes de responder
- Nunca mistura dados ou linguagem entre tenants
- Escala para humano quando necessário

### 4.2 Catálogo de Agentes

```
┌─────────────────────────────────────────────────────┐
│                  DEMAND ROUTER                       │
│  Entrada única — analisa e distribui para agentes   │
└──────────┬──────────────┬──────────────┬────────────┘
           ↓              ↓              ↓
   ┌───────────────┐ ┌──────────┐ ┌──────────────────┐
   │   WHATSAPP    │ │INSTAGRAM │ │ CHURCH ONBOARDING │
   │     AGENT     │ │  AGENT   │ │      AGENT        │
   └───────────────┘ └──────────┘ └──────────────────┘
           ↓              ↓
   ┌───────────────────────────┐
   │      SUPPORT AGENT        │
   │ (suporte interno Ekthos)  │
   └───────────────────────────┘
```

### 4.3 WhatsApp Agent

**Escopo:** Mensagens recebidas e enviadas via WhatsApp Business API

**Capacidades:**
- Triagem e classificação de mensagens (suporte, evento, doação, visitante, membro)
- Respostas automáticas contextualizadas com tom do tenant
- Envio de campanhas programadas via n8n
- Coleta e registro de dados de novos contatos
- Confirmação de presença em eventos
- Recebimento de comprovantes de doação

**Regras específicas:**
```
AG-WA-01: NUNCA responde sem carregar contexto do tenant
AG-WA-02: Mensagens de crise pastoral → escalada imediata para humano
AG-WA-03: Dados coletados via WhatsApp → INSERT imediato em people + interactions
AG-WA-04: Tom e linguagem SEMPRE seguem context/tenants/{slug}.md
AG-WA-05: Timeout de 24h sem resposta humana → agente reassume com contexto
```

**Fluxo de mensagem:**
```
Mensagem recebida
    ↓ webhook → Edge Function
Identifica tenant via número cadastrado em integrations
    ↓
Carrega contexto do tenant
    ↓
Demand Router classifica intenção
    ↓
Skill ativada → resposta gerada
    ↓
INSERT em interactions (church_id, person_id, type='whatsapp', content)
    ↓
Resposta enviada via WhatsApp API
```

### 4.4 Instagram Agent

**Escopo:** DMs e comentários via Instagram Graph API

**Capacidades:**
- Triagem de DMs (perguntas, pedidos de oração, interesse em conhecer a igreja)
- Respostas a comentários em posts relevantes
- Captação de leads via Instagram → registro em people
- Envio de DMs programados para seguidores

**Regras específicas:**
```
AG-IG-01: Comentários de cunho negativo ou polêmico → NOT respond, sinalizar para humano
AG-IG-02: DMs com dados pessoais sensíveis → registrar e escalar para humano
AG-IG-03: Tom mais descontraído que WhatsApp, salvo config do tenant
AG-IG-04: Nunca interagir em posts de outros tenants
```

### 4.5 Demand Router

**Escopo:** Análise e roteamento de todas as demandas que entram no sistema

**Função:** É o primeiro processador de qualquer entrada. Classifica intenção e decide:
1. Qual agente é responsável
2. Qual skill deve ser ativada
3. Se deve escalar para humano imediatamente

**Classificações possíveis:**
```
suporte_pastoral    → escala para humano sempre
suporte_tecnico     → support-agent
evento_confirmacao  → whatsapp-agent + registra em interactions
donacao_intencao    → donation-management skill
novo_visitante      → pipeline skill + registra em people
informacao_geral    → agente do canal com dm-support skill
campanha_execucao   → marketing-core skill via n8n
onboarding          → church-onboarding-agent
desconhecido        → coleta mais informação, tenta reclassificar (max 2x) → escala
```

### 4.6 Support Agent

**Escopo:** Suporte interno à plataforma (usuários do Ekthos, não membros das igrejas)

**Capacidades:**
- Dúvidas sobre funcionalidades
- Orientação sobre configurações
- Abertura de tickets para problemas técnicos
- Documentação contextualizada

### 4.7 Church Onboarding Agent

**Escopo:** Condução autônoma do processo de cadastro de nova igreja

Detalhado na Seção 3.

---

## SEÇÃO 5 — REGRAS DE RESPOSTA DOS AGENTES

### 5.1 Princípio de Contexto Restrito

```
Todo agente opera APENAS dentro do contexto da igreja que está atendendo.
Nunca menciona outras igrejas. Nunca generaliza sobre "igrejas em geral".
Sempre fala como parte da equipe daquela igreja específica.
```

### 5.2 O Agente NUNCA deve:

```
❌ Inventar informações sobre datas, eventos ou valores
❌ Tomar decisões financeiras sem confirmação explícita
❌ Compartilhar dados de um membro com outro membro
❌ Responder sobre assuntos fora do escopo configurado
❌ Mencionar que é uma IA (salvo configuração explícita do tenant)
❌ Usar terminologia de outro tenant (ex: chamar de "GC" se a igreja usa "célula")
❌ Prometer o que não pode entregar
❌ Continuar conversas em que a incerteza > 70% sem escalar
```

### 5.3 O Agente SEMPRE deve:

```
✅ Carregar context/tenants/{slug}.md antes de responder
✅ Usar a terminologia exata configurada para o tenant
✅ Registrar a interação em interactions antes de enviar resposta
✅ Identificar intenção antes de responder
✅ Escalar para humano com contexto completo da conversa
✅ Manter tom e linguagem configurados para o tenant
✅ Responder dentro do horário configurado (ou sinalizar fora do horário)
✅ Confirmar dados críticos antes de persistir (nome, telefone, valor de doação)
```

### 5.4 Fluxo de Decisão de Escalada

```
Mensagem recebida
    ↓
Agente processa com contexto do tenant
    ↓
Incerteza > 70%? ──→ SIM → Escala imediata com contexto completo
    ↓ NÃO
Tema é pastoral/crise? ──→ SIM → Escala imediata
    ↓ NÃO
Decisão financeira > limite? ──→ SIM → Escala para confirmação
    ↓ NÃO
Agente responde + registra no banco
```

### 5.5 Formato de Escalada para Humano

Quando escala, o agente envia para o humano responsável:

```
[EKTHOS - ESCALADA]
Tenant: {nome da igreja}
Canal: WhatsApp | Instagram
Contato: {nome ou número do membro}
Motivo da escalada: {classificação}
Histórico resumido: {últimas 5 mensagens}
Ação sugerida: {o que o agente recomenda}
Link do painel: {url do dashboard}
```

---

## SEÇÃO 6 — SISTEMA DE SKILLS

### 6.1 O Que É Uma Skill

Uma skill é um **módulo de competência reutilizável**. Ela:
- Recebe inputs tipados e estruturados
- Executa uma função específica e bem delimitada
- Retorna outputs previsíveis e estruturados
- Não mantém estado (estado fica no Supabase)
- Pode ser chamada por qualquer agente ou outra skill

### 6.2 Catálogo de Skills

```
orchestrator          → Analisa intenção e decide qual skill ativar
church-onboarding     → Conduz e processa onboarding de nova igreja
dm-support            → Atendimento via DM (WhatsApp e Instagram)
marketing-core        → Criação e execução de campanhas
n8n-orchestration     → Geração e execução de workflows de automação
donation-management   → Gestão de dízimos, ofertas e pagamentos
```

### 6.3 Orchestrator — O Despachante

O orchestrator é a skill chamada primeiro em qualquer operação não trivial. Ele:

```
INPUT: intenção bruta (texto ou classificação do demand-router)
    ↓
Analisa escopo da operação
Verifica se requer uma ou múltiplas skills
Verifica dependências entre skills
    ↓
OUTPUT: plano de execução {skills[], ordem, inputs_por_skill}
```

Ele não executa — apenas planeja. A execução é responsabilidade de cada skill.

### 6.4 Padrão de Interface de Skill

Toda skill segue o contrato:

```typescript
interface SkillInput {
  church_id: string        // obrigatório — nunca opcional
  tenant_context: TenantContext  // carregado de context/tenants/{slug}.md
  payload: Record<string, unknown>  // dados específicos da skill
  trace_id: string         // para rastreamento e logs
}

interface SkillOutput {
  success: boolean
  data?: Record<string, unknown>
  error?: { code: string; message: string; recoverable: boolean }
  audit_entry?: AuditEntry  // se a operação deve ser auditada
  escalate?: EscalationRequest  // se deve escalar para humano
}
```

### 6.5 Regras das Skills

```
REGRA SK-01: Skills NUNCA fazem queries sem church_id
REGRA SK-02: Skills NUNCA mantêm estado entre chamadas
REGRA SK-03: Toda operação crítica retorna audit_entry
REGRA SK-04: Skills com erro recoverable = false → notificam equipe Ekthos
REGRA SK-05: Skills de pagamento SEMPRE requerem confirmação antes de executar
REGRA SK-06: Nenhuma skill acessa o Vault diretamente — apenas via Edge Function autorizada
```

---

## SEÇÃO 7 — n8n COMO ORQUESTRADOR DE AUTOMAÇÕES

### 7.1 Papel do n8n no Sistema

O n8n é o **motor de automações de background** do Ekthos. Enquanto os agentes lidam com interações em tempo real, o n8n executa:

- Campanhas de WhatsApp agendadas
- Follow-ups automáticos por pipeline
- Relatórios periódicos para admins
- Sincronização de dados entre sistemas
- Triggers baseados em eventos do banco (via webhooks Supabase)

### 7.2 Arquitetura de Integração

```
Supabase (evento/trigger)
    ↓ webhook
n8n (recebe, processa, orquestra)
    ↓
Edge Function Supabase (valida e executa com segurança)
    ↓
Resultado persistido no banco
    ↓
Agente notificado se necessário
```

### 7.3 Padrão de Workflow n8n

Todo workflow n8n deve:

```
1. Receber church_id no payload (NUNCA executar sem ele)
2. Autenticar via token de serviço específico do tenant
3. Executar operação com isolamento de tenant
4. Reportar resultado para o banco (tabela: audit_logs)
5. Notificar falhas para endpoint de monitoramento Ekthos
```

### 7.4 Workflows Padrão do Sistema

| Workflow | Trigger | Ação |
|---|---|---|
| `follow-up-visitante` | Pessoa inserida no stage "visitante" | Envia mensagem de boas-vindas após 24h |
| `campanha-programada` | Schedule configurado pelo admin | Envia mensagem em massa via WhatsApp |
| `relatorio-semanal` | Toda segunda-feira 8h | Envia resumo de interações para admin |
| `confirmacao-doacao` | INSERT em donations | Envia comprovante para doador |
| `pipeline-inativo` | Pessoa sem interação há 30 dias | Aciona follow-up automático |
| `onboarding-step` | Progresso no onboarding | Avança para próximo passo automaticamente |

### 7.5 Regras do n8n

```
REGRA N8N-01: Nenhum workflow executa sem church_id validado
REGRA N8N-02: Credenciais de envio ficam no Vault — n8n acessa via referência
REGRA N8N-03: Workflows devem ter timeout máximo de 30s por execução
REGRA N8N-04: Falhas são registradas em audit_logs com detalhes completos
REGRA N8N-05: Workflows de comunicação em massa requerem aprovação prévia do admin
```

---

## SEÇÃO 8 — CONTEXTO PERSISTENTE POR TENANT

### 8.1 O Que É o Contexto Persistente

É a memória operacional de cada tenant dentro do sistema. Composto por dois layers:

```
Layer 1 → Banco de dados (Supabase)
  └── church_settings.modules_enabled
  └── church_settings.labels
  └── church_settings.onboarding_completed
  └── integrations (tokens e configurações)

Layer 2 → Arquivo de contexto (context/tenants/{slug}.md)
  └── Terminologia própria
  └── Tom e linguagem
  └── Restrições e regras específicas da igreja
  └── Histórico de exceções configuradas
```

### 8.2 Ciclo de Vida do Contexto

```
CRIAÇÃO    → Gerado automaticamente pelo church-onboarding-agent
ATUALIZAÇÃO → Via comando /onboard-church --update ou por admin da plataforma
INJEÇÃO    → Carregado por todo agente e skill ao iniciar operação para o tenant
EXPIRAÇÃO  → Nunca expira — é atualizado, não substituído
BACKUP     → Versionado via git (context/tenants/ está no repositório)
```

### 8.3 Regras de Contexto

```
REGRA CTX-01: Contexto NUNCA é compartilhado entre tenants
REGRA CTX-02: Agentes SEMPRE carregam contexto antes de processar mensagens
REGRA CTX-03: Alterações no contexto invalidam cache de todos os agentes do tenant
REGRA CTX-04: Contexto é fonte de verdade para terminologia — banco é fonte de verdade para dados
REGRA CTX-05: Se context/tenants/{slug}.md não existir → onboarding não foi concluído → bloqueia agentes
```

---

## SEÇÃO 9 — SUPORTE 24H AUTOMATIZADO

### 9.1 Garantia de Disponibilidade

O sistema opera continuamente sem dependência de horário humano. Os agentes respondem 24/7, com comportamento diferenciado por período:

```
Horário comercial (configurável por tenant):
  → Resposta imediata + opção de escalar para humano disponível

Fora do horário (configurável por tenant):
  → Resposta automática com contexto
  → Escalada marcada para próximo horário disponível
  → Urgências pastorais → notificação imediata do responsável (SMS/WhatsApp)
```

### 9.2 Configuração de Disponibilidade por Tenant

Em `church_settings.labels`:
```json
{
  "support_hours": {
    "timezone": "America/Sao_Paulo",
    "weekday": { "start": "08:00", "end": "22:00" },
    "weekend": { "start": "07:00", "end": "23:00" }
  },
  "escalation_contacts": [
    { "name": "Pastor João", "whatsapp": "+5511999999999", "role": "pastoral" },
    { "name": "Ana (TI)", "whatsapp": "+5511888888888", "role": "tecnico" }
  ],
  "out_of_hours_message": "Oi! Estamos fora do horário agora, mas já anotamos sua mensagem. Retornamos amanhã às 8h. 🙏"
}
```

### 9.3 Monitoramento de Saúde dos Agentes

```
Verifica a cada 5 minutos (via n8n):
  ├── WhatsApp Agent → respondendo?
  ├── Instagram Agent → autenticado?
  ├── Banco → latência < 500ms?
  └── Edge Functions → sem erros críticos?

Falha detectada → notifica equipe Ekthos imediatamente
```

---

## SEÇÃO 10 — BASE PARA EXPANSÃO

### 10.1 Arquitetura Agnóstica de Setor

O Ekthos foi construído para igrejas, mas a arquitetura é **agnóstica de setor**. O que muda entre setores é o **contexto** — não a estrutura.

```
Setor Igreja:
  context/tenants/igreja-graca.md     → terminologia eclesiástica
  Módulos: pipeline de membros, doações, células, escalada pastoral

Setor Clínica (futuro):
  context/tenants/clinica-vida.md     → terminologia médica
  Módulos: agendamento, prontuário, follow-up pós-consulta, confirmação de consulta

Setor Empresa SMB (futuro):
  context/tenants/empresa-xyz.md      → terminologia de negócios
  Módulos: CRM, suporte ao cliente, pipeline de vendas, relatórios gerenciais
```

### 10.2 O Que É Extensível

| Componente | Como Expandir |
|---|---|
| Novos setores | Criar contexto específico + adaptar labels em church_settings |
| Novas integrações | Adicionar em integrations/ + novo registro em tabela integrations |
| Novas skills | Criar .claude/skills/{nome}.md seguindo padrão de interface |
| Novos agentes | Criar .claude/agents/{nome}.md + registrar no demand-router |
| Novos workflows | Criar em automations/workflows/ + configurar trigger no n8n |

### 10.3 Roadmap de Expansão

```
FASE 1 — FUNDAÇÃO (atual)
  ✅ Estrutura de projeto e documentação
  ✅ Schema multi-tenant + RLS
  ⬜ Onboarding autônomo funcional
  ⬜ Agentes WhatsApp e Instagram ativos
  ⬜ Pipeline de membros

FASE 2 — AGENTES DE COMUNICAÇÃO
  ⬜ WhatsApp Agent em produção (primeiro tenant)
  ⬜ Instagram Agent em produção
  ⬜ Demand Router funcionando
  ⬜ Dashboard de conversas para admins
  ⬜ Escalada com contexto completo

FASE 3 — MARKETING E CAMPANHAS
  ⬜ Skill marketing-core ativa
  ⬜ Campanhas via n8n agendadas
  ⬜ Segmentação por tags
  ⬜ Relatórios de alcance

FASE 4 — FINANCEIRO E DOAÇÕES
  ⬜ Gateway de pagamento integrado (PIX + cartão)
  ⬜ Classificação automática (dízimo / oferta / campanha)
  ⬜ Comprovantes automáticos
  ⬜ Relatório financeiro mensal automatizado

FASE 5 — FRONTEND MULTI-TENANT
  ⬜ App web com identidade dinâmica por tenant
  ⬜ Dashboard admin por igreja
  ⬜ Painel de conversas e interações
  ⬜ Configurações de módulos self-service

FASE 6 — EXPANSÃO DE SETOR
  ⬜ Adaptação para clínicas
  ⬜ Adaptação para empresas SMB
  ⬜ Marketplace de skills de terceiros
```

---

## SEÇÃO 11 — ESTRUTURA DE PASTAS

```
ekthos-platform/
│
├── CLAUDE.md                          # Este arquivo — kernel do sistema
├── README.md                          # Documentação pública
├── .gitignore
│
├── .claude/                           # Sistema operacional do Claude Code
│   ├── rules/                         # Leis do sistema — não se negociam
│   │   ├── multi-tenant.md
│   │   ├── security.md
│   │   ├── agent-behavior.md
│   │   ├── code-standards.md
│   │   └── project-structure.md
│   │
│   ├── commands/                      # Comandos /slash disponíveis
│   │   ├── review.md                  # /review
│   │   ├── fix-issue.md               # /fix-issue
│   │   ├── deploy.md                  # /deploy
│   │   ├── audit-project.md           # /audit-project
│   │   └── onboard-church.md          # /onboard-church
│   │
│   ├── skills/                        # Módulos de competência
│   │   ├── orchestrator.md
│   │   ├── church-onboarding.md
│   │   ├── dm-support.md
│   │   ├── marketing-core.md
│   │   ├── n8n-orchestration.md
│   │   └── donation-management.md
│   │
│   └── agents/                        # Agentes autônomos
│       ├── whatsapp-agent.md
│       ├── instagram-agent.md
│       ├── support-agent.md
│       ├── demand-router.md
│       └── church-onboarding-agent.md
│
├── context/                           # Contextos do sistema
│   ├── platform-context.md            # Contexto geral da plataforma
│   ├── multi-tenant.md                # Documentação técnica de multi-tenancy
│   ├── church-context.md              # Domínio eclesiástico
│   ├── product-marketing-context.md   # Posicionamento do produto
│   └── tenants/                       # Contextos individuais por tenant
│       └── {slug}.md                  # Gerado automaticamente pelo onboarding
│
├── supabase/
│   └── migrations/
│       ├── 00001_initial_schema.sql   # Todas as tabelas + índices + triggers
│       └── 00002_rls_policies.sql     # RLS policies completas
│
├── automations/
│   ├── README.md
│   ├── workflows/                     # Definições de workflows n8n
│   └── triggers/                     # Definições de triggers e webhooks
│
├── integrations/
│   ├── README.md
│   ├── whatsapp/                      # WhatsApp Business API
│   ├── instagram/                     # Instagram Graph API
│   ├── n8n/                           # Configuração do n8n
│   └── payment/                       # Gateways de pagamento
│
├── campaigns/                         # Estrutura de campanhas
├── assets/                            # Assets estáticos
└── research/                          # Pesquisas e análises
```

---

## SEÇÃO 12 — GLOSSÁRIO OPERACIONAL

| Termo | Definição operacional |
|---|---|
| **Tenant** | Uma organização isolada na plataforma (Igreja, clínica, empresa) |
| **church_id** | UUID único do tenant — obrigatório em toda operação |
| **Contexto** | Arquivo .md + dados do banco que definem o comportamento para o tenant |
| **Skill** | Módulo de competência com input/output tipados e escopo restrito |
| **Agente** | Processo autônomo 24/7 operando em um canal específico |
| **Demand Router** | Despachante inteligente — classifica e direciona toda entrada |
| **Escalada** | Transferência para humano com contexto completo da interação |
| **RLS** | Row Level Security — isolamento no nível de banco, inviolável |
| **Vault** | Supabase Vault — armazenamento de secrets, tokens e chaves |
| **Slug** | Identificador textual único do tenant (`igreja-graca`, `clinica-vida`) |
| **n8n** | Motor de automações de background — orquestra tarefas assíncronas |
| **Edge Function** | Função serverless no Supabase — executa lógica sensível no servidor |
| **Trace ID** | UUID gerado por operação — usado para rastreamento em logs |
| **Pipeline** | Fluxo de acompanhamento de pessoas (visitante → membro → líder) |

---

## SEÇÃO 13 — DECISÃO DE ARQUITETURA

Antes de qualquer decisão técnica, faça as perguntas nesta ordem:

```
1. "Isso isola corretamente os dados do tenant?"
   → Se não → não implementa

2. "Isso fica no banco ou no contexto?"
   → Dados operacionais → banco (Supabase)
   → Linguagem, tom, terminologia → contexto (.md)

3. "Isso é função de agente ou de skill?"
   → Canal específico, 24/7, interativo → agente
   → Competência reutilizável, sem canal → skill

4. "Isso precisa de intervenção humana?"
   → Operação financeira, decisão pastoral, incerteza alta → sim
   → Triagem, resposta, registro → não

5. "O pastor vai entender o resultado?"
   → Se não → simplifica o output ou o fluxo
```

---

> **O Ekthos não é um software que as igrejas usam.**
> **É um sistema que opera junto com elas.**
>
> Cada decisão de código, cada regra, cada agente deve partir desta premissa.
> O sistema serve ao ministério — não o contrário.
