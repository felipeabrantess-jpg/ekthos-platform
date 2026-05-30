# Spec: Admin Cockpit — Church Detail Page

**Status:** DRAFT — SA-A8 | 2026-05-30  
**Lane:** A (Investigate/Spec Only — sem mudanças em produção)  
**Escopo:** Melhorias na página de detalhe de igreja no cockpit Ekthos (`/admin/churches/:id`)

---

## Estado Atual

### Edge Function: `admin-church-detail` (v13, ACTIVE)

**Endpoint:** `GET /admin-church-detail?id=<church_id>`  
**Auth:** JWT com `is_ekthos_admin = true` em `app_metadata`  
**Audit:** Registra `church.read.sensitive` em `admin_events` via `record_audit_event`

#### O que a EF retorna hoje

| Campo | Origem | Status |
|---|---|---|
| Dados da igreja (name, city, state, status, timezone, etc.) | `churches.*` | OK |
| Subscription (plan_slug, status, current_period_end, extras) | `subscriptions` (last 1) | **Parcial** — falta `stripe_subscription_id`, `stripe_customer_id`, `cancel_at_period_end`, `billing_origin` |
| MRR calculado | Derivado de `plans` + `subscriptions` | OK |
| Health score | `health_scores` (last 1) | OK mas **0 rows em produção** |
| Users (role + email + last_sign_in) | `user_roles` + `auth.admin.getUserById` (loop serial) | **Gargalo de performance** — N calls sequenciais ao GoTrue |
| Agents ativos | `subscription_agents` + `agent_grants` | **Parcial** — falta créditos, uso no ciclo, último run |
| Admin notes | `church_notes` | OK |
| Event log | `admin_events` (last 20) | **Parcial** — falta impersonation history |
| Contagens (people, cells, groups, pipelines) | COUNT em tabelas | **Bug:** busca em `cells` (tabela inexistente) — deveria ser `groups` |
| Acolhimento journeys | Não retornado | **Ausente** |
| Créditos de agente por ciclo | Não retornado | **Ausente** |
| Stripe links | Não retornado | **Ausente** |

#### Bugs identificados na EF atual

1. **`cells` não existe:** A query `supabase.from('cells')` aponta para tabela inexistente. A tabela correta é `groups` (que já é consultada para ministeries_count). Resultado: `cells_count` sempre 0 e potencial erro silencioso.
2. **Loop serial de GoTrue:** `for...of roleRows` chama `getUserById` sequencialmente. Para igrejas com 5+ usuários, isso adiciona 500ms–2s de latência desnecessária.
3. **`subscription_agents` query sem `church_id` join:** A query usa `.eq('church_id', churchId)` mas a tabela `subscription_agents` tem FK para `subscription_id`, não `church_id`. Pode retornar 0 resultados dependendo do schema (verificar FK real).
4. **`agent_credit_usage` ausente:** Uso real de créditos no ciclo atual não é exposto; só os saldos brutos via `church_agent_credits`.
5. **Histórico de impersonação ausente:** `impersonate_sessions` não é consultado na EF.

---

## Tabelas Ekthos-Internas Disponíveis para Writes

Somente estas tabelas podem receber escrita do cockpit admin (regra de isolamento):

| Tabela | Colunas relevantes | Uso no cockpit |
|---|---|---|
| `church_notes` | `id, church_id, admin_user_id, body, pinned, created_at, updated_at` | Notas internas da equipe Ekthos |
| `admin_events` | `id, church_id, admin_user_id, action, before, after, reason, actor_email, actor_roles, resource, resource_id, status, source` | Log de ações administrativas |
| `admin_tasks` | `id, church_id, assigned_to, title, description, status, priority, due_date, completed_at` | Tarefas internas associadas à igreja |
| `impersonate_sessions` | `id, admin_user_id, church_id, started_at, ended_at, notes, ended_reason, last_action_at` | Auditoria de impersonação |
| `health_scores` | `id, church_id, score, components, calculated_at` | Score calculado (só admin escreve) |

**NUNCA escrever em:** `churches`, `subscriptions`, `people`, `user_roles`, `subscription_agents` ou qualquer tabela de dados do tenant.

---

## Informações Mais Críticas Faltando (para o time de suporte)

Por ordem de impacto no suporte diário:

1. **Créditos de agente por ciclo** (`church_agent_credits`): sem isso, o suporte não sabe se um agente parou por crédito esgotado ou por bug.
2. **Uso de crédito no ciclo atual** (`agent_credit_usage`): volume de operações e tokens consumidos por agente.
3. **Histórico de impersonação** (`impersonate_sessions`): quem da Ekthos acessou a conta e quando.
4. **Stripe links diretos**: `stripe_subscription_id` e `stripe_customer_id` estão na tabela mas não são expostos — o suporte precisa abrir o Stripe manualmente.
5. **Journeys stuck** (`acolhimento_journey` + `reengagement_journey` com `status = 'pending'`): sinal de falha operacional silenciosa. Atualmente há 5 journeys `pending` em produção sem monitoramento no cockpit.
6. **`cancel_at_period_end`**: indica se a assinatura está programada para cancelar — informação crítica para CS.
7. **Último run de agente**: `agent_executions` tem `created_at` e `success` — o suporte precisa saber quando um agente rodou pela última vez e se foi com sucesso.

---

## Seções Propostas

### Section 1: Header

- Nome da igreja, ID (copiável), logo
- Badge de plano (`plan_slug`) + badge de status da subscription
- Badge `is_test_church` quando aplicável
- Quick actions:
  - **[Impersonar]** → chama `admin-start-impersonation`
  - **[Adicionar nota]** → abre drawer de `church_notes`
  - **[Ver no Stripe]** → link externo `https://dashboard.stripe.com/customers/<stripe_customer_id>` (abre nova aba, só aparece se `stripe_customer_id` existir)

### Section 2: Assinatura & Billing

| Campo | Fonte |
|---|---|
| Plano | `subscriptions.plan_slug` |
| Status | `subscriptions.status` |
| Próxima renovação | `subscriptions.current_period_end` |
| Cancelamento agendado | `subscriptions.cancel_at_period_end` |
| Origem do billing | `subscriptions.billing_origin` |
| MRR | Calculado (já existe) |
| Stripe Subscription ID | `subscriptions.stripe_subscription_id` (copiável + link) |
| Stripe Customer ID | `subscriptions.stripe_customer_id` (copiável + link) |
| Notas de preço | `subscriptions.price_notes` |
| Preços customizados | `custom_plan_price_cents`, `custom_user_price_cents`, `custom_agent_price_cents` |

### Section 3: Status dos Agentes

| Agente | Status | Créditos restantes | Créditos usados (ciclo) | Último run | Source |
|---|---|---|---|---|---|
| agent-acolhimento | ativo | 600 | N/A | 2026-05-29 | subscription |

**Fonte:**
- Lista: `subscription_agents` + `agent_grants`
- Saldos: `church_agent_credits` (cycle_credits + topup_credits por agent_scope)
- Uso: `agent_credit_usage` (SUM credits_consumed WHERE consumed_at >= cycle_start)
- Último run: `agent_executions` (MAX created_at por agent_slug)

### Section 4: Saúde Operacional

**Métricas de uso (30 dias):**
- Pessoas adicionadas: COUNT `people` WHERE `created_at >= now()-30d`
- Journeys de acolhimento: COUNT `acolhimento_journey` por status (active / completed / pending/stuck)
- Journeys de reengajamento: COUNT `reengagement_journey` por status
- Conversas ativas: COUNT `conversations` WHERE `status = 'open'`
- Mensagens enviadas: COUNT `channel_dispatch_queue` WHERE `status = 'sent'` AND `created_at >= now()-30d`

**Alertas automáticos (badges vermelhos):**
- Journeys `pending` há mais de 48h = stuck
- `health_score` < 40
- Subscription `cancel_at_period_end = true`
- Créditos de ciclo < 10% do total

### Section 5: Histórico de Impersonação

Tabela `impersonate_sessions` filtrada por `church_id`, ordenada por `started_at DESC`:

| Admin | Início | Fim | Duração | Motivo (ended_reason) |
|---|---|---|---|---|

### Section 6: Notas Internas

- Timeline de `church_notes` (pinned primeiro, depois por data DESC)
- Formulário inline: textarea + botão "Salvar nota" → POST `admin-notes-crud`
- Toggle de pin por nota existente
- Sem categorias (simplificar — `church_notes` não tem campo `category`)

### Section 7: Event Log

- Últimos 50 eventos de `admin_events` filtrados por `church_id`
- Inclui: ações de plano, criação de usuário, concessão de agente, impersonação
- Últimas 10 sessões de `impersonate_sessions` intercaladas cronologicamente

---

## Mudanças na Edge Function `admin-church-detail`

### Bugs a corrigir

1. **Substituir `cells` por `groups`** no COUNT de células (ou remover — `groups` já é consultado para `ministries_count`; esclarecer semântica)
2. **Paralelizar lookup de usuários no GoTrue:** usar `Promise.all(roleRows.map(...))` em vez de loop serial
3. **Corrigir query de `subscription_agents`:** verificar se a tabela tem `church_id` diretamente ou se precisa JOIN com `subscriptions`

### Campos a adicionar na resposta

```typescript
// Billing
stripe_subscription_id:  sub?.stripe_subscription_id  ?? null,
stripe_customer_id:      sub?.stripe_customer_id       ?? null,
cancel_at_period_end:    sub?.cancel_at_period_end     ?? false,
billing_origin:          sub?.billing_origin           ?? null,

// Agent credits (novo: buscar church_agent_credits)
agent_credits: agentCreditsRes.data ?? [],
// Formato: [{ agent_scope, cycle_credits, topup_credits, cycle_start, cycle_end }]

// Agent credit usage (novo: buscar agent_credit_usage)
agent_usage_30d: agentUsageRes.data ?? [],
// Formato: [{ agent_slug, total_credits_consumed, operations_count }]

// Agent last run (novo: buscar agent_executions)
agent_last_runs: agentLastRunsRes.data ?? [],
// Formato: [{ agent_slug, last_run_at, last_success }]

// Journeys health (novo)
journeys_acolhimento: {
  active:    n,
  completed: n,
  stuck:     n,  // pending há > 48h
},

// Impersonation history (novo)
impersonation_history: impersonationRes.data ?? [],

// People 30d (novo)
people_added_30d: n,
```

### Novas queries a adicionar (em paralelo)

```typescript
// 1. Créditos de agente
supabase
  .from('church_agent_credits')
  .select('agent_scope, cycle_credits, topup_credits, cycle_start, cycle_end')
  .eq('church_id', churchId),

// 2. Uso de crédito 30d (agregado por agent_slug)
supabase.rpc('get_agent_credit_usage_30d', { p_church_id: churchId }),
// OU query direta com groupBy se não existir RPC

// 3. Último run por agente
supabase
  .from('agent_executions')
  .select('agent_slug, created_at, success')
  .eq('church_id', churchId)
  .order('created_at', { ascending: false })
  .limit(50),

// 4. Journeys stuck
supabase
  .from('acolhimento_journey')
  .select('status, created_at')
  .eq('church_id', churchId),

// 5. Impersonation history
supabase
  .from('impersonate_sessions')
  .select('id, admin_user_id, started_at, ended_at, ended_reason, notes')
  .eq('church_id', churchId)
  .order('started_at', { ascending: false })
  .limit(10),

// 6. People adicionados nos últimos 30 dias
supabase
  .from('people')
  .select('id', { count: 'exact', head: true })
  .eq('church_id', churchId)
  .gte('created_at', new Date(Date.now() - 30 * 86400_000).toISOString()),
```

---

## Regra de Isolamento do Cockpit

**LEITURA:** pode ler de qualquer tabela pública do tenant (churches, people, subscriptions, etc.) via `service_role` — dados são visíveis, não modificáveis.

**ESCRITA:** exclusivamente nas tabelas Ekthos-internas:
- `church_notes` (via EF `admin-notes-crud`)
- `admin_events` (via `record_audit_event` RPC — automático)
- `admin_tasks` (via EF `admin-tasks-crud`)
- `impersonate_sessions` (via EFs `admin-start-impersonation` / `admin-end-impersonation`)
- `health_scores` (via job agendado — não pelo cockpit diretamente)

**Nunca** UPDATE/INSERT em `churches`, `subscriptions`, `people`, `user_roles`, `subscription_agents`.

---

## Componentes de Frontend a Criar/Modificar

| Componente | Ação | Notas |
|---|---|---|
| `AdminChurchDetail.tsx` | Criar (ou refatorar existente) | Página principal `/admin/churches/:id` |
| `ChurchDetailHeader.tsx` | Criar | Header com logo, badges, quick actions |
| `ChurchBillingCard.tsx` | Criar | Section 2 — billing + Stripe links |
| `ChurchAgentStatusTable.tsx` | Criar | Section 3 — agentes com créditos e último run |
| `ChurchHealthPanel.tsx` | Criar | Section 4 — uso 30d e alertas |
| `ChurchImpersonationLog.tsx` | Criar | Section 5 — histórico de impersonação |
| `ChurchNotesDrawer.tsx` | Criar/adaptar | Section 6 — notas com formulário inline |
| `ChurchEventLog.tsx` | Criar | Section 7 — log unificado de eventos |
| `useChurchDetail.ts` | Criar | Hook TanStack Query para `admin-church-detail` |

---

## EFs Existentes que Suportam as Ações

| Ação | EF | Método |
|---|---|---|
| Ler detalhe da igreja | `admin-church-detail` | GET |
| Listar igrejas | `admin-churches-list` | GET |
| CRUD de notas | `admin-notes-crud` | POST/PUT/DELETE |
| CRUD de tasks | `admin-tasks-crud` | POST/PUT/DELETE |
| Iniciar impersonação | `admin-start-impersonation` | POST |
| Encerrar impersonação | `admin-end-impersonation` | POST |
| Conceder agente | `admin-agent-grant` | POST |

---

## Prioridade de Implementação

1. **P0 — Corrigir bugs da EF** (cells bug, loop serial GoTrue) — 30 min
2. **P0 — Adicionar stripe_subscription_id e stripe_customer_id na resposta** — 10 min
3. **P1 — Adicionar créditos de agente** (church_agent_credits) — 1h
4. **P1 — Histórico de impersonação** — 30 min
5. **P2 — Journeys stuck** (acolhimento + reengajamento) — 1h
6. **P2 — Uso de crédito 30d** (agent_credit_usage) — 2h
7. **P3 — Alertas visuais automáticos** no frontend — 2h
