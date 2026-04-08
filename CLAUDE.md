# CLAUDE.md — Cérebro do Sistema Ekthos Platform

> Este arquivo é a fonte de verdade do projeto. Todo agente, skill e automação deve consultá-lo antes de agir.
> Versão: 1.0.0 | Atualizado em: 2026-04-07

---

## 1. Visão Geral

O **Ekthos Platform** é um sistema operacional de inteligência artificial multi-tenant projetado especificamente para igrejas, comunidades religiosas e organizações ministeriais. Ele combina automação inteligente, gestão de relacionamento com membros, marketing digital contextualizado e integração com canais de comunicação modernos (WhatsApp, Instagram) em uma plataforma unificada.

A palavra "Ekthos" deriva do grego e remete à ideia de "alcance" e "expansão" — refletindo a missão central: ajudar igrejas a alcançar mais pessoas com eficiência e autenticidade.

### Proposta Central

Em vez de ferramentas genéricas adaptadas para igrejas, o Ekthos foi construído **desde o início** compreendendo a linguagem, os fluxos, as necessidades e os valores específicos de comunidades religiosas. O sistema pensa, age e se comunica como alguém que conhece profundamente o contexto ministerial.

### Público-Alvo Atual
- Igrejas evangélicas de médio e grande porte (500–10.000 membros)
- Departamentos de comunicação e marketing ministerial
- Pastores e líderes que precisam de visibilidade operacional

### Expansão Futura Planejada
- Clínicas e consultórios de saúde
- Empresas de pequeno e médio porte
- Organizações sem fins lucrativos

---

## 2. Princípios Fundamentais

### 2.1 Multi-Tenancy Absoluto

Cada igreja (tenant) é um universo completamente isolado. Nenhum dado, contexto, interação ou configuração de um tenant pode vazar para outro. Este é o princípio mais crítico do sistema e nunca pode ser violado.

- Toda query ao banco de dados obrigatoriamente inclui `church_id`
- Row Level Security (RLS) está ativado em todas as tabelas
- O `church_id` é sempre validado no servidor, nunca no cliente
- Contextos de IA são carregados por tenant antes de qualquer processamento

### 2.2 Contexto Persistente por Tenant

Cada igreja tem um arquivo de contexto em `context/tenants/{slug}.md` que contém:
- Terminologia própria (células, GCs, casas, ministérios, etc.)
- Tom e linguagem de comunicação
- Estrutura organizacional
- Módulos habilitados
- Histórico de configurações

Este contexto é injetado em todos os agentes antes de qualquer interação com aquele tenant.

### 2.3 Skills como Unidades de Competência

O sistema é organizado em "skills" — módulos de competência específica que podem ser combinados e orquestrados. Cada skill:
- Tem um escopo bem definido
- Aceita inputs estruturados
- Produz outputs previsíveis
- Pode ser testada isoladamente
- Não depende de estado global (exceto o contexto do tenant)

### 2.4 Agentes Especializados

Os agentes são entidades autônomas que operam em canais específicos (WhatsApp, Instagram, suporte interno). Cada agente:
- Tem um escopo de atuação restrito
- Utiliza as skills relevantes para seu canal
- Respeita o contexto do tenant
- Escala para humanos em casos críticos
- Registra todas as interações no banco

### 2.5 Automação Primeiro, Intervenção Humana Quando Necessário

O sistema assume que a maioria das tarefas operacionais pode ser automatizada. A intervenção humana é reservada para:
- Situações de crise pastoral
- Decisões financeiras acima de limites configurados
- Exceções explicitamente definidas pelo tenant
- Casos onde o agente expressa incerteza acima do threshold

---

## 3. Estrutura de Pastas

```
ekthos-platform-main/
│
├── CLAUDE.md                          # Este arquivo — fonte de verdade do sistema
├── README.md                          # Documentação pública do projeto
│
├── .claude/                           # Configurações e instruções para Claude Code
│   ├── rules/                         # Regras invioláveis do sistema
│   │   ├── multi-tenant.md            # Regras de isolamento de dados por tenant
│   │   ├── security.md                # Regras de segurança e autenticação
│   │   ├── agent-behavior.md          # Como agentes devem se comportar
│   │   ├── code-standards.md          # Padrões de código TypeScript/SQL
│   │   └── project-structure.md       # Convenções de estrutura do projeto
│   │
│   ├── commands/                      # Comandos slash disponíveis no Claude Code
│   │   ├── review.md                  # /review — revisa código e conformidade
│   │   ├── fix-issue.md               # /fix-issue — diagnostica e corrige problemas
│   │   ├── deploy.md                  # /deploy — checklist de deploy Supabase
│   │   ├── audit-project.md           # /audit-project — auditoria de segurança
│   │   └── onboard-church.md          # /onboard-church — onboarding de nova igreja
│   │
│   ├── skills/                        # Módulos de competência do sistema
│   │   ├── orchestrator.md            # Orquestrador principal de skills
│   │   ├── church-onboarding.md       # Onboarding inteligente de igrejas
│   │   ├── dm-support.md              # Atendimento via DM (WhatsApp/Instagram)
│   │   ├── marketing-core.md          # Marketing operacional
│   │   ├── n8n-orchestration.md       # Orquestração de automações com n8n
│   │   └── donation-management.md     # Gestão de doações e financeiro
│   │
│   └── agents/                        # Agentes autônomos por canal
│       ├── whatsapp-agent.md          # Agente para WhatsApp Business
│       ├── instagram-agent.md         # Agente para Instagram DMs/comentários
│       ├── support-agent.md           # Agente de suporte interno da plataforma
│       ├── demand-router.md           # Roteador inteligente de demandas
│       └── church-onboarding-agent.md # Agente de onboarding autônomo
│
├── context/                           # Contextos carregados pelos agentes
│   ├── platform-context.md            # Contexto geral da plataforma
│   ├── multi-tenant.md                # Documentação técnica do multi-tenancy
│   ├── church-context.md              # Domínio e terminologia de igrejas
│   ├── product-marketing-context.md   # Posicionamento e marketing do produto
│   └── tenants/                       # Contextos individuais por tenant (gerados)
│       └── .gitkeep
│
├── supabase/                          # Configurações e migrations do banco
│   └── migrations/
│       ├── 00001_initial_schema.sql   # Schema inicial com todas as tabelas
│       └── 00002_rls_policies.sql     # Políticas RLS detalhadas
│
├── automations/                       # Workflows e automações
│   ├── README.md                      # Como criar automações
│   └── workflows/                     # Definições de workflows n8n
│       └── .gitkeep
│   └── triggers/                      # Triggers e webhooks
│       └── .gitkeep
│
├── integrations/                      # Configurações de integrações externas
│   ├── README.md                      # Guia de integrações
│   ├── whatsapp/                      # WhatsApp Business API
│   │   └── .gitkeep
│   ├── instagram/                     # Instagram Graph API
│   │   └── .gitkeep
│   ├── n8n/                           # n8n self-hosted ou cloud
│   │   └── .gitkeep
│   └── payment/                       # Gateways de pagamento
│       └── .gitkeep
│
├── campaigns/                         # Estrutura de campanhas
│   └── README.md
│
├── assets/                            # Assets estáticos
│   ├── images/
│   │   └── .gitkeep
│   └── templates/
│       └── .gitkeep
│
└── research/                          # Pesquisas e análises
    └── .gitkeep
```

---

## 4. Como o Sistema Funciona — Fluxo de Decisão

### 4.1 Fluxo de uma Mensagem Recebida (WhatsApp)

```
Mensagem recebida pelo WhatsApp Business API
    ↓
Webhook dispara Edge Function no Supabase
    ↓
Edge Function identifica o tenant via número de telefone/token
    ↓
Carrega contexto do tenant (context/tenants/{slug}.md)
    ↓
Demand Router analisa a mensagem e classifica a intenção
    ↓
Skill correta é ativada (suporte, evento, doação, etc.)
    ↓
Resposta gerada com tom e linguagem do tenant
    ↓
Interação registrada no banco (tabela: interactions)
    ↓
Resposta enviada via WhatsApp API
    ↓
[Se necessário] Escalada para humano com contexto completo
```

### 4.2 Fluxo de Onboarding de Nova Igreja

```
Pastor/líder acessa formulário de onboarding
    ↓
church-onboarding-agent.md conduz entrevista estruturada
    ↓
church-onboarding skill processa respostas
    ↓
Geração automática de:
  - Registro na tabela churches
  - church_settings personalizado
  - context/tenants/{slug}.md
  - Configuração de integrações selecionadas
    ↓
Módulos habilitados são ativados
    ↓
Briefing enviado para o time Ekthos
    ↓
Igreja operacional em até 24h
```

### 4.3 Fluxo de Criação de Campanha

```
Usuário (admin da igreja) descreve campanha em linguagem natural
    ↓
marketing-core skill analisa intenção e público-alvo
    ↓
Segmentação baseada em tags do banco (tabela: people)
    ↓
Geração de copy para cada canal (WhatsApp, Instagram, e-mail)
    ↓
Calendário de postagem gerado
    ↓
n8n workflow ativado para execução programada
    ↓
Resultados coletados e relatório gerado
```

---

## 5. Regras Invioláveis do Sistema

Estas regras nunca podem ser quebradas. Se um agente, skill ou desenvolvedor violar qualquer uma delas, o comportamento deve ser corrigido imediatamente.

### R1 — Isolamento de Tenant
```
NUNCA acesse dados de um tenant em uma operação de outro tenant.
NUNCA assuma que o church_id do cliente é confiável sem validação no servidor.
SEMPRE valide church_id contra o token de autenticação do usuário.
```

### R2 — Segurança de Dados
```
NUNCA exponha chaves de API, tokens ou secrets no frontend.
NUNCA logue dados sensíveis de membros (CPF, telefone completo) sem mascaramento.
SEMPRE use RLS no Supabase — nenhuma tabela fica sem política.
SEMPRE use variáveis de ambiente para configurações sensíveis.
```

### R3 — Comportamento dos Agentes
```
NUNCA invente informações sobre membros, eventos ou doações.
NUNCA tome decisões financeiras sem confirmação explícita.
SEMPRE registre interações no banco antes de responder.
SEMPRE escale para humano quando incerteza > 70%.
```

### R4 — Integridade do Banco
```
NUNCA faça DELETE sem soft delete (deleted_at) em tabelas críticas.
NUNCA altere church_id de um registro existente.
SEMPRE use transações para operações que afetam múltiplas tabelas.
SEMPRE mantenha audit logs de alterações em dados de membros.
```

### R5 — Qualidade de Código
```
NUNCA use `any` no TypeScript.
NUNCA deixe erros sem tratamento explícito.
SEMPRE tipifique inputs e outputs de funções.
SEMPRE documente funções complexas em português.
```

---

## 6. Como Adicionar um Novo Tenant

### Passo 1 — Executar o comando de onboarding
```
/onboard-church nome="Igreja Exemplo" slug="igreja-exemplo" pastor="Nome do Pastor"
```

### Passo 2 — Preencher o contexto do tenant

Criar o arquivo `context/tenants/igreja-exemplo.md` com:
- Nome oficial da igreja
- Terminologia própria para grupos (células, GCs, casas...)
- Tom de voz (formal, informal, carinhoso, profissional)
- Canais ativos (WhatsApp, Instagram, ambos)
- Módulos habilitados (marketing, doações, suporte, pipeline)
- Fuso horário
- Dados de contato e responsável técnico

### Passo 3 — Configurar integrações

No Supabase, inserir na tabela `integrations`:
```sql
INSERT INTO integrations (church_id, type, config, is_active)
VALUES (
  '{church_uuid}',
  'whatsapp',
  '{"phone_number_id": "...", "token": "vault:whatsapp_token_{slug}"}',
  true
);
```

### Passo 4 — Validar o tenant

Executar `/audit-project --tenant={slug}` para confirmar:
- RLS funcionando
- Contexto carregado corretamente
- Integrações ativas
- Agentes respondendo com o tom correto

---

## 7. Stack Técnica

### Backend
- **Supabase** — Banco PostgreSQL gerenciado, Auth, Storage, Edge Functions (Deno)
- **Row Level Security** — Isolamento de dados por tenant no nível do banco
- **Supabase Vault** — Armazenamento seguro de secrets e tokens de integração

### Automação e Orquestração
- **n8n** — Workflows de automação self-hosted ou cloud
- **Webhooks** — Comunicação entre sistemas via HTTP
- **Supabase Edge Functions** — Lógica serverless para processamento de eventos

### Integrações de Comunicação
- **WhatsApp Business API** — Atendimento e campanhas via WhatsApp
- **Instagram Graph API** — DMs, comentários e publicações
- **E-mail** (futuro) — Comunicação via SMTP/SendGrid

### Integrações de Pagamento
- **Stripe** — Cartão de crédito/débito (mercado internacional)
- **PagSeguro** — PIX e cartão nacional
- **Mercado Pago** — PIX e cartão (alternativa)

### Frontend (futuro)
- **Next.js 14** — Framework React com Server Components
- **TypeScript** — Tipagem estática obrigatória
- **Tailwind CSS** — Estilização utilitária
- **shadcn/ui** — Componentes de UI acessíveis
- **TanStack Query** — Gerenciamento de estado servidor

### IA e Processamento de Linguagem
- **Claude (Anthropic)** — Motor principal de IA para todos os agentes
- **Claude Agent SDK** — Orquestração de agentes multi-step
- **Embeddings** (futuro) — Busca semântica em conteúdo da igreja

---

## 8. Roadmap de Fases

### Fase 1 — Fundação (Atual)
- [x] Estrutura de projeto e documentação base
- [x] Schema do banco de dados com multi-tenancy
- [x] RLS policies para todas as tabelas
- [ ] Sistema de onboarding de tenants
- [ ] Contexto persistente por tenant
- [ ] Demand router básico

### Fase 2 — Agentes de Comunicação
- [ ] Agente WhatsApp funcional (triagem + resposta básica)
- [ ] Agente Instagram funcional (DMs)
- [ ] Registro de interações no banco
- [ ] Escalada para humano com contexto
- [ ] Dashboard de conversas para admins

### Fase 3 — Marketing e Campanhas
- [ ] Skill de segmentação de público
- [ ] Gerador de copy contextualizado
- [ ] Calendário de conteúdo automatizado
- [ ] Integração com n8n para agendamento
- [ ] Relatórios de performance

### Fase 4 — Gestão Financeira
- [ ] Integração com gateways de pagamento
- [ ] Classificação automática de doações
- [ ] Relatórios financeiros por categoria
- [ ] Notificações de confirmação automáticas
- [ ] Comprovantes gerados por PDF

### Fase 5 — Pipeline de Membros
- [ ] Jornada do visitante ao membro
- [ ] Automação de follow-up
- [ ] Sistema de tags e segmentação avançada
- [ ] Integração com grupos/células

### Fase 6 — Expansão Multi-Setor
- [ ] Adaptação para clínicas
- [ ] Adaptação para empresas SMB
- [ ] Marketplace de skills de terceiros
- [ ] API pública para integrações customizadas

---

## 9. Glossário do Sistema

| Termo | Definição |
|-------|-----------|
| **Tenant** | Uma igreja ou organização cadastrada na plataforma |
| **church_id** | Identificador único UUID de cada tenant no banco |
| **Skill** | Módulo de competência específica (ex: marketing, suporte) |
| **Agente** | Entidade autônoma que opera em um canal específico |
| **Contexto** | Arquivo .md com configurações e linguagem do tenant |
| **Demand Router** | Componente que classifica e direciona demandas brutas |
| **Escalada** | Transferência de uma conversa para um humano |
| **RLS** | Row Level Security — isolamento no nível do banco |
| **Pipeline** | Fluxo de acompanhamento de pessoas (visitante → membro) |
| **Slug** | Identificador textual único da igreja (ex: `igreja-graca`) |

---

## 10. Contatos e Responsabilidades

- **Arquitetura do Sistema**: Definida neste arquivo e em `context/platform-context.md`
- **Regras de Negócio**: Ver `.claude/rules/`
- **Comportamento dos Agentes**: Ver `.claude/agents/`
- **Integrações**: Ver `integrations/README.md`
- **Automações**: Ver `automations/README.md`

---

> Lembre-se: O Ekthos não é apenas um software. É um sistema que pensa junto com as igrejas.
> Qualquer decisão de arquitetura deve partir da pergunta: "Isso serve ao pastor e aos membros?"
