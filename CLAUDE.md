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

## SEÇÃO 0.5 — MANDATO ARQUITETURAL

### O Arquiteto-Chefe

O sistema possui um componente de inteligência central chamado `ekthos-chief-architect`.
Ele é um **gate obrigatório** — não uma sugestão.

REGRA ABSOLUTA:
  Nenhuma funcionalidade, integração, agente ou automação pode ser
  implementada sem antes passar pelo ekthos-chief-architect.

Isso inclui:
  - Novos endpoints ou Edge Functions
  - Novos agentes ou skills
  - Novas integrações (APIs, webhooks, gateways)
  - Novos workflows n8n
  - Alterações em schema do banco
  - Novas regras de RLS

### Como o Gate Funciona

Antes de qualquer implementação, o arquiteto-chefe é invocado:

  /architect MODO=EVALUATE "descrição da necessidade"

O output é obrigatório antes de prosseguir. Se o output indicar BLOQUEIO, a implementação não acontece.

### Framework de Decisão do Arquiteto

Toda decisão arquitetural segue 5 perguntas nesta ordem exata:

  P1: É dado (estado/histórico) ou é lógica (processamento)?
      → dado          : Supabase (PostgreSQL + RLS)
      → lógica sync   : Edge Function + Skill
      → lógica async  : n8n Workflow

  P2: É interação (humano↔sistema) ou automação (sistema↔sistema)?
      → interação     : Agente (WhatsApp, Instagram, Suporte)
      → automação     : n8n + Webhook

  P3: É nativo ou requer integração externa?
      → nativo        : Supabase direto (auth, storage, db)
      → externo       : Edge Function com credencial no Vault

  P4: O dado tem dono definido?
      → Ekthos        : Supabase + church_id obrigatório
      → Externo       : Integração com mapeamento para schema interno

  P5: Escala com custo linear ou exponencial?
      → linear        : aprovado
      → exponencial   : redesenho obrigatório antes de implementar

### Onboarding como Núcleo

O onboarding por IA não é uma feature. É o núcleo do sistema.
Toda a operação de um tenant depende do onboarding ter sido concluído.
Sem onboarding completo:
  - Nenhum agente é ativado
  - Nenhuma automação é disparada
  - Nenhuma integração é configurada

O onboarding gera automaticamente:
  1. Registro validado na tabela churches
  2. church_settings com módulos, labels e cores
  3. context/tenants/{slug}.md com terminologia e tom
  4. Integrações configuradas (tokens no Vault)
  5. Workflows n8n ativados para o tenant
  6. Agentes em standby com contexto carregado
  7. Audit log de criação do tenant

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

## SEÇÃO 13 — INVOCAÇÃO DO ARQUITETO-CHEFE

### Quando invocar

SEMPRE antes de:
  - Criar novo arquivo de skill, agente ou rule
  - Propor nova tabela ou alterar schema existente
  - Integrar API ou serviço externo
  - Criar workflow n8n
  - Modificar lógica de RLS
  - Definir novo webhook (entrada ou saída)

### Como invocar

  MODO EVALUATE  → /architect MODO=EVALUATE "o que precisa ser feito"
  MODO DESIGN    → /architect MODO=DESIGN "fluxo a modelar"
  MODO REVIEW    → /architect MODO=REVIEW "implementação para revisar"
  MODO INTEGRATE → /architect MODO=INTEGRATE "sistema externo a integrar"
  MODO TROUBLESHOOT → /architect MODO=TROUBLESHOOT "problema a diagnosticar"

### Output obrigatório do arquiteto

O arquiteto-chefe SEMPRE retorna:

  STATUS: APROVADO | BLOQUEADO | REVISÃO_NECESSÁRIA
  COMPONENTE_PRIMÁRIO: [qual componente resolve]
  COMPONENTE_SECUNDÁRIO: [se necessário]
  JUSTIFICATIVA: [por que essa escolha]
  RISCOS: [o que pode dar errado]
  PRÓXIMOS_PASSOS: [em ordem de execução]
  VIOLAÇÕES_DETECTADAS: [se houver]

Se STATUS = BLOQUEADO → implementação não prossegue até resolução.
Se STATUS = REVISÃO_NECESSÁRIA → arquiteto detalha o que precisa mudar.
Se STATUS = APROVADO → implementação pode avançar seguindo PRÓXIMOS_PASSOS.

---

## SEÇÃO 14 — MÓDULOS OPERACIONAIS: MAPA COMPLETO

Esta seção mapeia os 15 módulos funcionais da Ekthos Platform para igrejas,
classificando cada um por status de implementação e responsável técnico.

### Mapa de Módulos

| # | Módulo | Status | Responsável técnico | LLM usado |
|---|---|---|---|---|
| 1 | Dashboard operacional | Planejado | Frontend + Supabase views | Não |
| 2 | Pessoas (members, visitors) | ✅ Implementado | people + pipeline_stages | Não |
| 3 | Pipeline espiritual (kanban) | ✅ Implementado | person_pipeline | Não |
| 4 | Líderes | ✅ Migration | leaders table | Não |
| 5 | Células | ✅ Migration | cells + cell_members | Não |
| 6 | Relatórios de célula | ✅ Migration | cell_reports | Não |
| 7 | Ministérios | ✅ Migration | ministries table | Não |
| 8 | Voluntários por ministério | ✅ Migration | volunteers table | Não |
| 9 | Escalas de serviço | ✅ Migration | service_schedules + assignments | Haiku (notificações) |
| 10 | Agenda da igreja | ✅ Migration | church_events table | Não |
| 11 | Gabinete pastoral | ✅ Migration | pastoral_cabinet table | Não |
| 12 | Financeiro | ✅ Migration | donations + financial_campaigns | Não |
| 13 | Agentes de IA | ✅ Implementado | .claude/agents/ (10 agentes) | Haiku-first |
| 14 | Onboarding por IA | ✅ Implementado | church-onboarding-agent | Sonnet |
| 15 | Multi-tenant | ✅ Implementado | church_id + RLS em toda tabela | Não |

### Princípio de LLM por Módulo

A maioria dos módulos NÃO usa LLM. LLM é reservado para:
- Interações de linguagem natural (agentes WhatsApp, Instagram)
- Onboarding estratégico (church-onboarding-agent com Sonnet)
- Classificação de intenção ambígua (demand-router fallback com Haiku)
- Notificações personalizadas de escalas (communication-agent com Haiku)

Tudo que pode ser resolvido com dados estruturados e templates → sem LLM.

### Integração entre Módulos

```
people ←→ leaders         (líder é uma pessoa)
people ←→ cell_members    (membro de célula é uma pessoa)
people ←→ volunteers      (voluntário é uma pessoa)
people ←→ pastoral_cabinet (membro do gabinete é uma pessoa)
people ←→ donations        (doador é uma pessoa — pode ser anônimo)
people ←→ person_pipeline  (toda pessoa tem posição no pipeline)

leaders ←→ cells           (líder responsável pela célula)
leaders ←→ ministries      (líder responsável pelo ministério)

ministries ←→ volunteers   (voluntário pertence a ministério)
ministries ←→ service_schedules (escala é de um ministério)

service_schedules ←→ service_schedule_assignments (atribuições da escala)
service_schedule_assignments ←→ volunteers (quem está escalado)

church_events ←→ service_schedules (evento gera escala no ministério)

donations ←→ financial_campaigns (doação pode pertencer a campanha)
donations ←→ people               (doador identificado ou anônimo)
```

---

## SEÇÃO 15 — MÓDULO: VOLUNTÁRIOS POR MINISTÉRIO

### Problema que Resolve

Igrejas perdem voluntários por falta de organização. Não há visibilidade de
quem está disponível, quais habilidades cada pessoa tem e qual ministério
precisa de reforço. Líderes gerenciam isso em cadernos ou grupos de WhatsApp.

### Schema

Tabelas: `ministries`, `volunteers`

Relações:
```
person → volunteers (person_id) — voluntário é uma person
ministry → volunteers (ministry_id) — voluntário pertence ao ministério
leader → ministry (leader_id) — ministério tem líder
```

Campos críticos de `volunteers`:
- `role`: função específica (ex: "sonoplasta", "recepcionista", "líder de louvor")
- `skills`: array de habilidades (ex: ["violão", "teclado", "câmera"])
- `availability`: JSONB com dias e período disponíveis

### Responsabilidades

| Ação | Responsável | LLM |
|---|---|---|
| Cadastrar voluntário | Backend/Frontend (form) | Não |
| Listar disponíveis por ministério | Supabase query | Não |
| Sugerir voluntário para escala | crm-operator (lógica de tags) | Haiku |
| Notificar voluntário escalado | communication-agent | Template |
| Confirmar disponibilidade | followup-agent via WhatsApp | Template |
| Relatório de frequência | Supabase view | Não |

### Automações

```
Novo voluntário cadastrado
  → tag "voluntario:{ministerio}" adicionada em people.tags
  → notification para líder do ministério (communication-agent)

Voluntário sem escala há 60 dias
  → sinaliza para lider (sem LLM — threshold configurável)

Voluntário declina escala
  → service_schedule_assignments.status = 'declined'
  → n8n aciona busca por substituto no mesmo ministério com mesma disponibilidade
```

### Fases de Implementação

**MVP**: Cadastro de voluntários, listagem por ministério, sem automação
**Expansão**: Sugestão de escala automática, notificação via WhatsApp
**Avançado**: Matching inteligente por habilidade + disponibilidade (Haiku)

### Regras

```
VOL-01: volunteer SEMPRE tem church_id e ministry_id — nunca orphan
VOL-02: Uma pessoa pode ser voluntária em múltiplos ministérios (linhas separadas)
VOL-03: Desativação de voluntário (is_active=false) não apaga histórico de escalas
VOL-04: Voluntário com optout=true em people não recebe notificações automáticas
VOL-05: Habilidades (skills[]) são texto livre — não enum — para flexibilidade por tenant
```

---

## SEÇÃO 16 — MÓDULO: ESCALAS DE SERVIÇO

### Problema que Resolve

Líderes de ministério criam escalas manualmente, enviam por WhatsApp e perdem
o controle de quem confirmou. Há conflitos de agenda, voluntários escalados que
não aparecem e substituições de última hora sem rastreio.

### Schema

Tabelas: `service_schedules`, `service_schedule_assignments`

Fluxo de status da escala:
```
draft → published → confirmed → [realizado]
                              → cancelled
```

Fluxo de status da atribuição:
```
pending → confirmed
        → declined → [substituto buscado]
        → replaced
```

### Responsabilidades

| Ação | Responsável | LLM |
|---|---|---|
| Criar escala | Backend/Frontend (form) | Não |
| Publicar escala | Backend (status: published) | Não |
| Notificar escalados | communication-agent | Template |
| Coletar confirmações | whatsapp-attendant (intent: CONFIRMAR_ESCALA) | Template |
| Buscar substituto | crm-operator + n8n | Haiku (sugestão) |
| Relatório de confirmações | Supabase view | Não |

### Fluxo Operacional

```
Admin/Líder cria service_schedule (status: draft)
  ↓
Adiciona volunteers → service_schedule_assignments (status: pending)
  ↓
Publica escala (status: published)
  ↓
communication-agent notifica cada voluntário via WhatsApp
  Template: "Olá {nome}! Você está escalado para {evento} no dia {data}.
             Pode confirmar? Responda SIM ou NÃO."
  ↓
whatsapp-attendant detecta resposta:
  SIM → assignment.status = 'confirmed', responded_at = NOW()
  NÃO → assignment.status = 'declined', responded_at = NOW()
         → n8n aciona busca por substituto no mesmo ministério
  ↓
Quando todos confirmados → schedule.status = 'confirmed'
  ↓ [dia do evento]
Relatório pós-evento (presentes vs escalados)
```

### Integração com Agenda

```
church_event criado com ministério envolvido
  → n8n sugere criação de service_schedule para o evento
  → Líder confirma, sistema gera atribuições sugeridas baseadas em disponibilidade
```

### Fases de Implementação

**MVP**: Criação manual de escalas, notificação básica por WhatsApp
**Expansão**: Confirmação automática via chat, substituição semiautomática
**Avançado**: Geração automática de escala por IA (Haiku) baseada em histórico

### Regras

```
ESC-01: Escala SEMPRE tem church_id e ministry_id — nunca orphan
ESC-02: Publicar escala (draft→published) exige pelo menos 1 atribuição
ESC-03: Notificação de escala respeita optout e horário de church_settings
ESC-04: Substituição automática só ocorre após volunteer.status = 'declined' confirmado
ESC-05: Histórico de atribuições é imutável — declined/replaced são registrados, não deletados
ESC-06: Relatório de frequência: confirmed_count / total_assigned por período
```

---

## SEÇÃO 17 — MÓDULO: FINANCEIRO

### Problema que Resolve

Igrejas não têm visibilidade financeira organizada. Dízimos chegam por PIX sem
identificação. Ofertas não são categorizadas. Campanhas não têm meta e progresso.
O tesoureiro trabalha em planilhas desconectadas do resto do sistema.

### Schema

Tabelas: `donations`, `financial_campaigns`

O módulo financeiro é propositalmente simples no backend:
- Sem gateway próprio (integra com Stripe, PagSeguro, Mercado Pago via Vault)
- Sem lógica contábil complexa (escopo: recebimentos da igreja)
- Com rastreabilidade completa (audit_logs para toda alteração)

### Tipos de Doação

| type | Descrição | Identificação do doador |
|---|---|---|
| `dizimo` | Dízimo mensal do membro | Obrigatório (person_id) |
| `oferta` | Oferta de culto ou online | Opcional (pode ser anônimo) |
| `campanha` | Vinculado a financial_campaigns | Opcional |
| `missoes` | Destinado a missões | Opcional |
| `construcao` | Fundo de construção | Opcional |

### Fluxo de Doação Online

```
Membro acessa link de doação (por canal: WhatsApp, Instagram, site)
  ↓
donation-agent envia link configurado em church_settings
  ↓
Membro paga via gateway (PIX, cartão)
  ↓
Gateway dispara webhook → Edge Function valida HMAC
  ↓
UPDATE donations SET status='confirmed', confirmed_at=NOW()
  ↓
receipt_sent = false → n8n envia comprovante via WhatsApp (template, sem LLM)
  ↓
INSERT audit_logs (action: 'DONATION_CONFIRMED')
```

### Fluxo de Doação Manual (dinheiro/culto)

```
Tesoureiro registra no painel (backend/frontend)
  → INSERT donations (gateway='manual', status='confirmed')
  → Associa a person_id se identificado
  → INSERT audit_logs
```

### Campanhas Financeiras

```
financial_campaigns define: nome, meta, início, fim
  ↓
donations com campaign_id acumulam no progresso
  ↓
Supabase view `campaign_progress`:
  SELECT campaign_id, SUM(amount) as raised, goal_amount,
         ROUND(SUM(amount)/goal_amount*100, 1) as percent
  FROM donations WHERE status='confirmed' AND campaign_id IS NOT NULL
  GROUP BY campaign_id
```

### Visão Financeira (sem LLM)

Supabase views para dashboard:
```sql
-- Receita por tipo no mês
SELECT type, SUM(amount), COUNT(*) FROM donations
WHERE church_id = $1 AND status = 'confirmed'
AND DATE_TRUNC('month', confirmed_at) = DATE_TRUNC('month', NOW())
GROUP BY type;

-- Histórico mensal dos últimos 12 meses
SELECT DATE_TRUNC('month', confirmed_at) as mes, SUM(amount)
FROM donations WHERE church_id = $1 AND status = 'confirmed'
GROUP BY mes ORDER BY mes;
```

### Responsabilidades por Componente

| Ação | Responsável | LLM |
|---|---|---|
| Enviar link de doação | donation-agent | Template |
| Confirmar pagamento | Edge Function (webhook gateway) | Não |
| Enviar comprovante | n8n + communication-agent | Template |
| Registrar doação manual | Backend/Frontend | Não |
| Visão financeira | Supabase views | Não |
| Progresso de campanha | Supabase view | Não |
| Relatório mensal | n8n schedule → template | Não |
| Alerta de meta atingida | n8n → communication-agent | Template |

### Regras

```
FIN-01: donations SEMPRE tem church_id — multi-tenant inviolável
FIN-02: amount NUNCA é alterado após status='confirmed' — apenas audit_log
FIN-03: gateway_transaction_id é UNIQUE por gateway — previne duplicata de webhook
FIN-04: Doação anônima: person_id = NULL é válido — não forçar identificação
FIN-05: Reembolso: status='refunded', amount não alterado — registrar em audit_logs
FIN-06: O sistema NUNCA processa pagamento diretamente — apenas registra e redireciona
FIN-07: Chaves de gateway ficam no Vault — config em integrations tem apenas vault_key
FIN-08: Comprovante enviado somente após status='confirmed' — nunca em 'pending'
```

### Fases de Implementação

**MVP**: Registro manual de doações, link externo de PIX, histórico básico
**Expansão**: Webhook de gateway (Stripe ou PagSeguro), comprovante automático, campanhas
**Avançado**: Visão financeira completa, relatório mensal automático, metas de campanha

---

## SEÇÃO 18 — ROADMAP ATUALIZADO: FASES POR MÓDULO

### Fase MVP — Fluxo WhatsApp Ponta a Ponta (✅ Implementado)
- [x] Schema multi-tenant base (churches, people, interactions, pipeline)
- [x] RLS em todas as tabelas base
- [x] whatsapp-webhook → demand-router → whatsapp-attendant
- [x] Classificação de intenção (regras + Haiku fallback)
- [x] Upsert de pessoas e registro de interações
- [x] Pipeline espiritual (stages padrão por tenant)
- [x] n8n workflow: follow-up-visitante
- [x] 10 agentes documentados e especificados

### Fase 1 — Módulos Estruturais (schema pronto, frontend pendente)
- [x] Migration 00006: leaders, cells, ministries, volunteers, escalas, agenda, financeiro
- [ ] Ativar RLS para novas tabelas
- [ ] Criar Supabase views para dashboard
- [ ] Frontend: tela de Pessoas e Pipeline
- [ ] Frontend: tela de Células e Líderes
- [ ] Frontend: tela de Ministérios e Voluntários

### Fase 2 — Escalas e Agenda
- [ ] Criação e publicação de escalas via painel
- [ ] Notificação automática de escalados via WhatsApp (communication-agent)
- [ ] Confirmação de escala via WhatsApp (whatsapp-attendant)
- [ ] Substituição semiautomática via n8n
- [ ] Agenda da igreja com recorrência
- [ ] Integração agenda → service_schedules

### Fase 3 — Financeiro Operacional
- [ ] Webhook de gateway (PagSeguro PIX ou Stripe)
- [ ] Comprovante automático via communication-agent
- [ ] Campanhas financeiras com progresso
- [ ] Visão financeira no dashboard
- [ ] Relatório mensal automatizado via n8n

### Fase 4 — Onboarding Autônomo
- [ ] church-onboarding-agent funcional ponta a ponta
- [ ] Geração automática de context/tenants/{slug}.md
- [ ] Ativação automática de módulos por plano contratado
- [ ] Criação de tenant completo em < 30 minutos

### Fase 5 — Frontend Multi-Tenant
- [ ] App web com identidade dinâmica por tenant
- [ ] Dashboard com KPIs por módulo
- [ ] Painel de conversas e interações
- [ ] Configurações de módulos self-service

### Fase 6 — Expansão de Setor
- [ ] Adaptação do schema para clínicas
- [ ] Adaptação do schema para empresas SMB
- [ ] Marketplace de skills de terceiros

---

> **O Ekthos não é um software que as igrejas usam.**
> **É um sistema que opera junto com elas.**
>
> Cada decisão de código, cada regra, cada agente deve partir desta premissa.
> O sistema serve ao ministério — não o contrário.
