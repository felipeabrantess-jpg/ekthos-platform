# Equipe de Ferramental — Ekthos CRM

> **Criado:** 2026-05-28 | **Próxima revisão:** início de cada sessão de engenharia  
> **Dados reais coletados por 9 engenheiros paralelos em 2026-05-28.**  
> Este é o documento canônico de referência rápida para toda a equipe.

---

## 1. MCPs Disponíveis

> **Status confirmado via ENG-1 (teste real com chamada read-only).**

| MCP | Status | Prefix |
|---|---|---|
| Supabase | ✅ **ATIVO** | `mcp__supabase__` |
| CCD Session | ✅ **ATIVO** | `mcp__ccd_session_mgmt__` |
| n8n | ⚠️ Schema carregado, permissão negada pelo harness | `mcp__fba455af-6477-49be-83e1-12fc4adffff3__` |
| Claude Preview | ⚠️ Schema carregado, permissão negada pelo harness | `mcp__Claude_Preview__` |
| Claude in Chrome | ⚠️ Schema carregado, permissão negada pelo harness | `mcp__Claude_in_Chrome__` |
| Playwright | ⚠️ Schema carregado, permissão negada pelo harness | `mcp__playwright__` |
| Google Drive | ⚠️ Schema carregado, permissão negada pelo harness | `mcp__6baffe20-4fc9-42aa-848c-ecb0cfad69a8__` |
| Canva | ⚠️ Schema carregado, permissão negada pelo harness | `mcp__3cc8a967-465a-4a7e-954b-ec42a5428a38__` |
| MCP Registry | ⚠️ Schema carregado, permissão negada pelo harness | `mcp__mcp-registry__` |
| Scheduled Tasks | ⚠️ Schema carregado, permissão negada pelo harness | `mcp__scheduled-tasks__` |

Para liberar os MCPs com "permissão negada": adicionar ao `.claude/settings.json` do projeto via `allowedTools` ou aprovar interativamente quando o prompt aparecer.

---

### 1.1 Supabase MCP (CONFIRMADO ATIVO — provado em 2026-05-28)

- **Project ref:** `mlqjywqnchilvgkbvicd`
- **URL:** `https://mlqjywqnchilvgkbvicd.supabase.co`

**Tools principais:**

| Tool | Para que usar |
|---|---|
| `list_tables` | Lista tabelas com contagem e RLS — usar para diagnóstico de schema |
| `list_edge_functions` | Lista EFs com versão e status ACTIVE — usar antes de qualquer deploy |
| `execute_sql` | Roda SQL direto em produção — usar para audit, diagnóstico, smoke |
| `apply_migration` | Aplica DDL como migration — alternativa ao CLI |
| `deploy_edge_function` | Deploya EF sem CLI — útil em ambiente sem Supabase CLI |
| `get_logs` | Busca logs de EFs e banco — diagnóstico de erros |
| `list_migrations` | Lista migrations aplicadas — verificar estado do banco |
| `get_advisors` | Recomendações de performance/segurança |
| `list_extensions` | Lista pg_cron, pg_net, etc. |

**Exemplos de chamada:**
```
# SQL direto
mcp__supabase__execute_sql(query="SELECT count(*) FROM acolhimento_journey WHERE status='pending';")

# Ver EFs deployadas
mcp__supabase__list_edge_functions()

# Logs recentes de uma EF
mcp__supabase__get_logs(service="edge-functions")

# Listar migrations
mcp__supabase__list_migrations(limit=5)
```

**Limitações críticas:**
- `apply_migration` NÃO pula `IF NOT EXISTS` em pgcrypto — diferente do `supabase db push`
- Secrets: `secrets list` mostra apenas hash SHA256, NUNCA o valor real
- `execute_sql` vai direto para PRODUÇÃO — sem sandbox intermediário
- Migrations DEVEM ser idempotentes: `IF NOT EXISTS`, `ON CONFLICT DO NOTHING`

---

### 1.2 n8n MCP (SCHEMA CARREGADO — permissão pendente)

> ⚠️ **Lista de workflows n8n NÃO inventariada nesta passada:** o MCP n8n estava bloqueado pelo harness em 28/05/26. Pendência: próxima sessão deve listar workflows publicados (ekthos-acolhimento-outbound, ekthos-pipeline, ekthos-people) com status real via `search_workflows` ou `get_workflow_details`.

- **URL:** `ekthosai.app.n8n.cloud`
- **Tool prefix:** `mcp__fba455af-6477-49be-83e1-12fc4adffff3__`
- **Status:** Conectado mas bloqueado pelo harness. Liberar via allowlist.

**Tools disponíveis quando liberado:**

| Tool | Uso |
|---|---|
| `search_workflows` | Busca workflows por nome |
| `get_workflow_details` | Detalhes completos (nodes, trigger, status) |
| `execute_workflow` | Executa workflow |
| `create_workflow_from_code` | Cria workflow via JSON |
| `update_workflow` | Atualiza workflow existente |
| `publish_workflow` | Ativa workflow |
| `test_workflow` | Executa em modo teste |
| `search_executions` | Busca execuções recentes |
| `get_sdk_reference` | Documentação do MCP n8n |

---

### 1.3 CCD Session MCP (CONFIRMADO ATIVO)

- **Tool prefix:** `mcp__ccd_session_mgmt__`
- **Tools:** `list_sessions`, `archive_session`, `search_session_transcripts`
- **Uso:** auditar sessões anteriores, buscar decisões em transcritos históricos

---

### 1.4 Outros MCPs (schema carregado — liberar conforme necessidade)

- **Claude Preview** (`mcp__Claude_Preview__`): smoke visual de componentes React
- **Claude in Chrome** (`mcp__Claude_in_Chrome__`): E2E em browser real (Chrome)
- **Playwright** (`mcp__playwright__`): testes E2E headless
- **Google Drive** (`mcp__6baffe20__`): leitura/escrita de docs Google
- **Scheduled Tasks** (`mcp__scheduled-tasks__`): tarefas remotas agendadas

---

## 2. Hooks e Automações

> **Dados reais de ENG-2 (2026-05-28).**

### 2.1 Claude Code Hooks (`.claude/`)

**2 hooks ativos configurados em `.claude/settings.json`:**

#### Hook 1 — `pre-bash.js` (PreToolUse — Bash + Write .sql)

Dispara ANTES de `git commit` e ANTES de escrever arquivo `.sql`. Verifica **20 regras** em 7 categorias:

| Categoria | Regras verificadas |
|---|---|
| Encoding/Qualidade | Duplo encoding UTF-8, emojis em código, console.log, `as any` |
| Vocabulário Pastoral | Bloqueia termos CRM genéricos em .tsx (lead, prospect, funil, KPI, CEO, etc.) |
| SQL/RLS | Bloqueia `CREATE TABLE` sem `ENABLE ROW LEVEL SECURITY` e sem `church_id` |
| Segurança | Bloqueia `sk_live_`, `sb_secret_`, JWT hardcoded, `.env` em commit |
| Pricing | Avisa valores numéricos fora da tabela oficial de preços |
| Roles | Avisa `GRANT financeiro para authenticated` |
| i18n | Avisa strings PT hardcoded no JSX |

**Comportamento:** `exit(2)` = bloqueia operação. `exit(0)` = apenas aviso.

#### Hook 2 — `post-write.js` (PostToolUse — Write/Edit .tsx e package.json)

Dispara APÓS escrever qualquer `.tsx`. Verifica **8 regras** de design system:

| Categoria | Regras verificadas |
|---|---|
| Cores | Detecta hex fora da paleta Ekthos (30 cores permitidas) |
| Tipografia | Detecta `font-family: Inter/Roboto/Arial` |
| Icons | Detecta libs não aprovadas (heroicons, feather, react-icons) |
| Multi-tenant | Detecta `.from()` sem `.eq('church_id', ...)` |
| Bundle | Detecta pacotes pesados (moment, lodash, rxjs, antd, @mui) |

**Comportamento:** sempre `exit(0)` — apenas avisa, nunca bloqueia.

### 2.2 Comandos permitidos / bloqueados (`.claude/settings.json`)

| Tipo | Lista |
|---|---|
| Permitidos sem prompt | `git *`, `npm *`, `npx *`, `ls *`, `cat *`, `wc *`, `echo *` |
| Bloqueados | `rm -rf *`, `git push --force*`, `git reset --hard*`, `DROP TABLE*`, `DELETE FROM*`, `TRUNCATE*` |

### 2.3 GitHub Actions (`.github/workflows/ci.yml`)

- **Trigger:** Todo PR aberto contra `main` ou `staging`
- **Typecheck** (`npm run typecheck`): advisory — `continue-on-error: true` (32 erros pré-existentes em `database.types.ts`)
- **Build** (`npm run build`): **bloqueante** — falha impede merge
- **Secrets exigidos pelo CI:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

### 2.4 Scripts npm (`web/package.json`)

| Script | Comando | Observação |
|---|---|---|
| `dev` | `vite` | Servidor local de desenvolvimento |
| `build` | `vite build` | Build de produção (usado no CI) |
| `preview` | `vite preview` | Preview do build |
| `typecheck` | `tsc --noEmit` | Verificação de tipos |

**Ausentes:** test, lint, deploy, seed, migrate.

---

## 3. Edge Functions Deployadas

> **83 EFs totais — todas ACTIVE, todas `verify_jwt: false`.**  
> Dados reais de ENG-3 via `mcp__supabase__list_edge_functions` em 2026-05-28.

### 3.1 Agentes Pastorais (IA) — 19 EFs

| Slug | Versão | Modelo | Observação |
|---|---|---|---|
| `agent-acolhimento` | v28 | Haiku | **PROTEGIDO** — provado E2E em 2026-05-28. `claude-haiku-4-5-20251001` (custo 10x menor que Sonnet). REGRA Felipe: se qualidade da conversa pastoral com visitante cair na prática (rasa, robótica, sem sensibilidade), reavaliar pra Sonnet. Monitorar conversas reais. |
| `agent-suporte` | v25 | Haiku | Suporte incluso em todos os planos |
| `agent-onboarding` | v26 | Haiku | Onboarding de novas igrejas |
| `agent-funil` | v23 | Haiku | Gestão do funil de discipulado |
| `agent-metricas` | v24 | Haiku | Métricas e KPIs pastorais |
| `agent-relatorios` | v23 | Haiku | Relatórios pastorais |
| `agent-financeiro` | v22 | Haiku | Gestão financeira |
| `agent-escalas` | v22 | Haiku | Escalas de ministério |
| `agent-cadastro` | v22 | Haiku | Cadastro de membros |
| `agent-conteudo` | v24 | Haiku | Conteúdo e comunicação |
| `agent-proposta` | v23 | Haiku | Propostas |
| `agent-formacao` | v23 | Haiku | Discipleship |
| `agent-missoes` | v23 | Haiku | Missões |
| `agent-reengajamento` | v26 | Haiku | Reengajamento de inativos |
| `agent-agenda` | v22 | Haiku | Agenda e eventos |
| `agent-whatsapp` | v22 | Haiku | **EXCLUSIVO Avivamento** |
| `agent-cuidado` | v19 | Haiku | Cuidado pastoral |
| `agent-haiku-triagem` | v14 | Haiku via env | Triagem de demandas |
| `agent-outbound-retry` | v19 | — | Retry de mensagens falhas |

### 3.2 Stripe / Billing — 4 EFs (**PROTEGIDAS**)

| Slug | Versão | Observação |
|---|---|---|
| `stripe-webhook` | v39 | **NUNCA alterar sem CP1** — atualiza subscriptions reais |
| `stripe-checkout` | v28 | Checkout autenticado |
| `stripe-checkout-public` | v23 | Checkout da landing page |
| `stripe-bootstrap` | v23 | Bootstrap Stripe de nova igreja |

### 3.3 Admin / Cockpit — 20 EFs

| Slug | Versão |
|---|---|
| `admin-church-create` | v29 |
| `admin-churches-list` | v16 |
| `admin-church-detail` | v13 |
| `admin-church-pricing` | v23 |
| `admin-agent-grant` | v10 |
| `admin-cockpit-metrics` | v9 |
| `admin-revenue-metrics` | v9 |
| `admin-events-list` | v16 |
| `admin-tasks-crud` | v16 |
| `admin-notes-crud` | v16 |
| `admin-update-contractor` | v9 |
| `admin-update-pastoral-profile` | v9 |
| `admin-set-ekthos-roles` | v8 |
| `admin-start-impersonation` | v8 |
| `admin-end-impersonation` | v8 |
| `admin-coupon-create` | v4 |
| `admin-coupons-list` | v2 |
| `admin-coupon-deactivate` | v4 |
| `admin-coupon-detail` | v2 |

### 3.4 Planos, Add-ons e Afiliados

| Slug | Versão |
|---|---|
| `plans-update` | v23 |
| `addon-prices-update` | v23 |
| `agents-catalog-update` | v24 |
| `addon-request` | v21 |
| `coupons-stripe-sync` | v22 |
| `coupon-validate` | v22 |
| `affiliate-crud` | v23 |
| `affiliate-coupon-create` | v23 |
| `affiliate-coupon-toggle` | v23 |
| `affiliate-commissions-approve` | v23 |
| `affiliate-commissions-export-csv` | v23 |
| `affiliate-commissions-mark-paid` | v23 |

### 3.5 WhatsApp / Mensageria

| Slug | Versão | Observação |
|---|---|---|
| `channel-dispatcher` | v31 | **PROTEGIDO** — roda via pg_cron 1min |
| `webhook-receiver` | v26 | **PROTEGIDO** — R10 fechado |
| `whatsapp-webhook` | v1 | Gap C1 implementado |
| `dispatch-person-event` | v29 | **PROTEGIDO** — hub de acolhimento provado |
| `conversation-router` | v19 | |
| `conversation-handoff` | v24 | |
| `conversation-send-message` | v19 | |
| `dispatch-message` | v25 | |
| `message-enqueue` | v19 | |
| `message-dispatch` | v19 | |
| `chatpro-send` | v16 | |
| `zapi-send` | v19 | |
| `provision-channel` | v18 | |
| `provision-whatsapp-channel` | v14 | |
| `whatsapp-attendant` | v2 | |
| `demand-router` | v2 | |
| `n8n-notify` | v26 | Legacy, sem código local |
| `n8n-workflow-setup` | v19 | Legacy, sem código local |
| `n8n-setup-credentials` | v13 | Legacy, sem código local |

### 3.6 Captação / Onboarding / Auth

| Slug | Versão | Observação |
|---|---|---|
| `visitor-capture` | v28 | **PROTEGIDO** — provado E2E |
| `dispatch-person-event` | v29 | (listado acima) |
| `lead-capture` | v22 | Captura da landing comercial |
| `church-public` | v20 | Info pública de igreja para QR |
| `contact-consultant` | v20 | Formulário de contato |
| `onboarding-consultant` | v32 | Agente consultor |
| `onboarding-engineer` | v30 | Agente engenheiro |
| `notification-create` | v20 | |
| `church-invite-user` | v3 | **PROTEGIDO** |
| `send-recovery-email` | v4 | **PROTEGIDO** — usa generateLink+SMTP |
| `send-welcome-email` | v1 | **PROTEGIDO** — provado E2E |
| `resend-diagnostic` | v2 | |
| `temp-reset-pw` | v3 | |
| `temp-admin-reset-pw` | v3 | |

---

## 4. Cron Jobs (pg_cron)

> **7 jobs reais — dados de ENG-3 via `SELECT jobname, schedule FROM cron.job`.**

| Job | Schedule | O que faz |
|---|---|---|
| `channel-dispatcher` | `*/1 * * * *` | Processa `channel_dispatch_queue` — WhatsApp, n8n |
| `agent-auto-pause` | `*/5 * * * *` | Pausa agentes com crédito zero |
| `agent-acolhimento-fu` | `*/30 * * * *` | Follow-up de jornadas de acolhimento pendentes |
| `agent-quota-check` | `0 * * * *` | Alertas de threshold de crédito |
| `expire-agent-grants` | `0 * * * *` | Expira `agent_grants` vencidos |
| `agent-reengajamento-scan` | `0 9 * * *` | Scan diário de membros para reengajamento |
| `agent-cycle-renew` | `0 0 1 * *` | Renova ciclos de crédito mensais |

**Verificar via SQL:**
```sql
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;
```

---

## 5. Secrets Configurados (apenas nomes)

> **Mapeados por ENG-7 a partir de `Deno.env.get()` em todas as EFs.**  
> Valores NUNCA ficam aqui. `supabase secrets list` mostra hash SHA256 apenas.

| Grupo | Secret | Criticidade |
|---|---|---|
| **Auto-injetado** | `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` | Auto |
| **IA** | `ANTHROPIC_API_KEY`, `ANTHROPIC_HAIKU_MODEL` | CRÍTICO |
| **Stripe** | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_WEBHOOK_SKIP_SIG` | CRÍTICO |
| **Email SMTP** | `GMAIL_SMTP_USER`, `GMAIL_APP_PASSWORD`, `GMAIL_SMTP_FROM` | ALTO |
| **Landing** | `RESEND_API_KEY` (contact-consultant) | MÉDIO |
| **Z-API** | `ZAPI_CLIENT_TOKEN`, `ZAPI_INSTANCE_ID`, `ZAPI_TOKEN`, `ZAPI_BASE_URL` | ALTO |
| **ChatPro** | `CHATPRO_INSTANCE_ID`, `CHATPRO_TOKEN`, `CHATPRO_BASE_URL` | BAIXO |
| **WhatsApp Meta** | `WA_WEBHOOK_VERIFY_TOKEN`, `WA_APP_SECRET` | BAIXO |
| **n8n outbound** | `N8N_OUTBOUND_ENABLED`, `N8N_OUTBOUND_WEBHOOK_URL`, `EKTHOS_N8N_OUTBOUND_SECRET`, `N8N_API_KEY`, `N8N_FOLLOWUP_WEBHOOK_URL` | MÉDIO |
| **CORS** | `ALLOWED_ORIGIN` | ALTO |

**Para verificar o que está realmente setado:** Dashboard Supabase → Edge Functions → Secrets (ou `supabase secrets list --project-ref mlqjywqnchilvgkbvicd` via CLI).

---

## 6. Modelos Claude em Uso

> **Inventário confirmado por ENG-9 — 100% de conformidade com o canon.**

| EF | Linha | Model string | Canon? |
|---|---|---|---|
| `agent-acolhimento` | 54 | `claude-haiku-4-5-20251001` | ✅ |
| `agent-reengajamento` | 43 | `claude-haiku-4-5-20251001` | ✅ |
| `agent-suporte` | 31 | `claude-haiku-4-5-20251001` | ✅ |
| `agent-onboarding` | 30 | `claude-haiku-4-5-20251001` | ✅ |
| `agent-cadastro` | 18 | `claude-haiku-4-5-20251001` | ✅ |
| `agent-escalas` | 18 | `claude-haiku-4-5-20251001` | ✅ |
| `agent-financeiro` | 30 | `claude-haiku-4-5-20251001` | ✅ |
| `agent-haiku-triagem` | 39 | `Deno.env.get('ANTHROPIC_HAIKU_MODEL') ?? 'claude-haiku-4-5-20251001'` | ✅ |
| `onboarding-consultant` | 37 | `claude-haiku-4-5-20251001` | ✅ |
| `whatsapp-attendant` | 95 | `MODELS.haiku → claude-haiku-4-5-20251001` | ✅ |
| `demand-router` | 245 | `claude-haiku-4-5-20251001` | ✅ |

**`_shared/anthropic-client.ts`:** contém `haiku_legacy: 'claude-3-5-haiku-20241022'` como aviso documentado — **nenhuma EF usa esta string**.

**REGRA INEGOCIÁVEL:**
- ✅ Canônico: `claude-haiku-4-5-20251001`
- ❌ NUNCA usar: `claude-3-5-haiku-20241022` (descontinuado, retorna 404)
- ⏳ Futuro: Claude Sonnet para cockpit executivo (ainda não implementado)

---

## 7. Padrões de Trabalho da Equipe

### Mecanismo 1+N (Orquestração padrão)

```
1 comando do Felipe (Product Owner)
    → Chat principal (engenheiro-chefe)
        → 10 subagentes paralelos OBRIGATÓRIO
            → Cada subagente = engenheiro dono de uma frente
            → Cada engenheiro usa ferramental real (MCP, SQL, curl, Playwright)
            → Reporta para o chefe
    → Chefe consolida e entrega relatório
```

**Regra:** Diagnóstico em paralelo → Aplicação em sequência com checkpoints.

### Checkpoint Obrigatório (CP1)

Antes de qualquer frente de maior impacto:
1. Diagnóstico completo (read-only: SQL, log, grep, listagem)
2. Plano escrito com diff proposto e risco
3. Confirmação explícita do Felipe
4. Aplicação sequencial por frente
5. Prova empírica após cada frente

**Anti-extrapolação:** NUNCA "deve funcionar". Provar via curl, SQL ou Playwright.

### R12 Smoke (rodar antes de qualquer commit importante)

| Q | Check |
|---|---|
| Q1 | `acolhimento_journey`: jornadas pending intactas |
| Q2 | `conversations/realtime`: handoff intacto |
| Q3 | Sonnet/Haiku inalterados em todas as EFs |
| Q4 | R10/multi-tenant/app_metadata: nenhuma query sem church_id |
| Q5 | Minha Fé baseline: 5 pessoas intactas |
| Q6 | Stripe LIVE: nenhuma EF de billing redployada |
| Q7 | n8n não ativado sem autorização |
| Q8 | DNS/Resend: não tocado sem autorização |
| Q9 | Agentes runtime (dispatch v29, acolhimento v28, welcome v1, dispatcher v31): ACTIVE |
| Q10 | Billing/pricing: nenhuma alteração de preço |
| Q11 | Nenhum commit não autorizado |
| Q12 | Pronto para decisão da próxima fase |

### Sequência de Trabalho

```
[DIAGNÓSTICO] → paralelo (todos os ENGs leem ao mesmo tempo)
[PLANO]       → escrito, revisado, aprovado pelo Felipe
[APLICAÇÃO]   → sequencial por frente, com teste após cada uma
[VALIDAÇÃO]   → R12 smoke + curl tests específicos da frente
[COMMIT]      → git add <arquivos específicos> → mensagem padronizada
[PR]          → manual via GitHub (gh CLI não disponível)
[DEPLOY]      → Vercel auto-deploy ao merge para main
```

---

## 8. Decisões Cravadas

| ID | Decisão | Fonte |
|---|---|---|
| D1 | Modelo operacional = `claude-haiku-4-5-20251001` | CLAUDE.md |
| D2 | `verify_jwt = false` em TODAS as EFs (ES256 incompatível com HS256) | CLAUDE.md |
| D3 | Triple welcome: REGRA DEFINITIVA = welcome coordenado, 1 WhatsApp + 1 email, NUNCA duplicado pro mesmo evento. Implementar guard no dispatch-person-event antes de ativar n8n outbound. (Felipe decidiu opção b) | CP1 2026-05-28 |
| D4 | `inviteUserByEmail` → `generateLink` + SMTP (PR-B pendente) | CP1 2026-05-28 |
| D5 | Resend ABANDONADO definitivo como canal de email do sistema. Google SMTP via noreply@ekthosai.net (smtp.gmail.com:465 + GMAIL_APP_PASSWORD) é o único canal. Provado: recovery (PR #180) + welcome de acolhimento (28/05/26). NÃO configurar Resend pra email de sistema. Única exceção: contact-consultant (formulário comercial), que mantém Resend e não se toca. | Log 2026-05-28 |
| D6 | Stripe Connect = MORTO. Modelo manual CSV/PIX é final | CLAUDE.md |
| D7 | `plans.slug` é PK (não `plans.id`) — FKs sempre em `slug text` | CLAUDE.md |
| D8 | `auth_church_id()` lê APENAS de `app_metadata` (sem fallback `user_metadata`) | CLAUDE.md |
| D9 | supabaseAdmin (service_role) SEPARADO de supabaseAuth (getUser) — sempre | CLAUDE.md |
| D10 | `agent-whatsapp` é EXCLUSIVO do plano Avivamento | CLAUDE.md |
| D11 | Preços de Missão e Avivamento NÃO expostos na landing pública | CLAUDE.md |
| D12 | Máximo 1 agente incluso nos planos Volunteer e Kids | CLAUDE.md |
| D13 | LGPD é sequencial: migration first → consent guard → n8n activation | CP1 2026-05-28 |
| D-DPA | Contrato de Proteção de Dados (DPA) com igrejas: Felipe já tem contrato pré-definido externamente. Será acoplado no cockpit por igreja que fechar contrato (feature de produto futura: upload/registro de contrato no cockpit por church_id). NÃO bloqueador legal pra LGPD do código — esse caminho do contrato é resolvido externamente pelo Felipe. | CP1 2026-05-28 |

---

## 9. PROTEGIDOS — Nunca Tocar sem Autorização Explícita

### EFs protegidas (acolhimento provado 2026-05-28)
- `dispatch-person-event` v29
- `send-welcome-email` v1
- `agent-acolhimento` v28 (Haiku)
- `acolhimento_journey` (tabela + dados)

### EFs protegidas (outros fluxos críticos)
- `send-recovery-email` + secrets GMAIL (SMTP Google)
- `webhook-receiver` (R10 fechado)
- `visitor-capture` v27
- `provision-channel`
- `stripe-webhook` v38 (email migration é CP1)
- `channel-dispatcher` v31
- `conversation-*` (realtime)

### Dados protegidos
- Minha Fé: `5156cc30-6d76-4487-99ba-fff8013b38d4` e suas 5 pessoas
- 7 igrejas clientes reais
- `app_metadata` (nunca alterar sem fluxo de auth correto)
- `audit_logs` (NUNCA deletar — compliance)
- `subscriptions` (estado de igrejas pagantes)
- `plans` (preços e limites)

### Configurações protegidas
- `trigger_n8n_pipeline` (jsonb+guard+search_path) — sync feito, não rever
- `messaging_config` seed trigger — aplicado em 2026-05-28
- `app_metadata` de todos os usuários
- Secrets em produção (STRIPE_*, ANTHROPIC_API_KEY, GMAIL_*)

### Nunca tocar sem autorização
- Stripe LIVE (cobrança real)
- DNS/Resend
- n8n workflows reais
- Z-API canais reais
- `church_whatsapp_channels`
- Runtime agentes (Sonnet/Haiku versions)
- `church_agent_config` / `get_agent_prompt_resolved`
- `church-invite-user` (convite real)
- `contact-consultant`
- `plans.id`/`plans.slug` sem migration

---

## 10. Igrejas de Referência

| Nome | Church ID | Tipo |
|---|---|---|
| **Minha Fé / Vanessa Abrantes** | `5156cc30-6d76-4487-99ba-fff8013b38d4` | Piloto interno/familiar — baseline de validação |
| **Mock (teste E2E)** | `62e473b8-cd39-4da2-aa5d-c296b03d6873` | Ambiente de teste automatizado |

**Admin Ekthos:**
- Email: `felipe@ekthosai.net`
- UUID: `579d0f7b-9b8b-4c20-94c5-513b4a424642`

---

## 11. GitHub / Repositório

> **Dados reais de ENG-5 (2026-05-28).**

- **Repo:** `github.com/felipeabrantess-jpg/ekthos-platform`
- **Branch de trabalho:** `staging`
- **Branch protegida:** `main` (push direto bloqueado, PR obrigatório)
- **gh CLI:** NÃO disponível no ambiente — usar git commands + PR manual
- **CI:** TypeScript advisory (continue-on-error) + build bloqueante
- **URL de produção:** `https://ekthos-platform.vercel.app`

**Branches rastreadas (14):** staging, main, deploy-fix, fix-vercel-deploy, trigger-deploy, ds-to-main, remove-deploy-workflows, feat/fase-6-1-camada-4-entrega, feat/fase-6-3-observabilidade-agentes, fix/cockpit-cupons-stripe-link-and-copy, fix/prompt-formality-caloroso, fix/grant-agent-config-routing-defaults, docs/ops-debts-tracking, fix/canais-zapi-direto-enums-ownership

**PR manual:**
```
https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...staging?expand=1
```

---

## 12. Frontend — Mapa de Rotas

> **Dados reais de ENG-6 (2026-05-28).**  
> URL prod: `https://ekthos-platform.vercel.app`

### Rotas públicas (sem auth)
`/`, `/landing`, `/login`, `/signup`, `/choose-plan`, `/onboarding`, `/onboarding/configuring`, `/auth/set-password`, `/auth/forgot-password`, `/auth/reset-password`, `/checkout/sucesso`, `/checkout/cancelado`, `/visita/:slug`

### Rotas CRM (autenticadas)
`/dashboard`, `/agenda`, `/pessoas`, `/pipeline`, `/celulas`, `/ministerios`, `/voluntarios`, `/escalas`, `/financeiro`, `/gabinete`, `/aniversarios`, `/conversas`, `/agentes`, `/configuracoes/*`, `/settings/*`

### Rotas Admin Cockpit (isEkthosAdmin)
`/admin/cockpit`, `/admin/churches`, `/admin/churches/:id`, `/admin/revenue`, `/admin/pricing`, `/admin/afiliados`, `/admin/leads`, `/admin/tasks`, `/admin/cockpit/cupons`, `/admin/comunicacao`, `/admin/notifications`

### Variáveis de ambiente frontend
`VITE_SUPABASE_URL` (obrigatória), `VITE_SUPABASE_ANON_KEY` (obrigatória), `VITE_APP_URL`, `VITE_WHATSAPP_NUMBER`, `VITE_GA4_ID`, `VITE_GADS_ID`, `VITE_GADS_LABEL`

---

## 13. Documentação Existente

> **Dados reais de ENG-8 (2026-05-28).**

| Arquivo | Estado | Observação |
|---|---|---|
| `IDENT.MD` | ✅ Atual | Papel do Claude — autoritativo |
| `docs/00-formacoes.md` | ✅ Atual | Decisões permanentes — autoritativo |
| `docs/CANON.md` | ✅ Atual | Arquitetura de agentes |
| `docs/debts.md` | ✅ Ativo | Débitos por cluster (E e B resolvidos) |
| `docs/04-pendencias.md` | ✅ Ativo | OPS-DEBT-039+ |
| `docs/10-log-sessoes.md` | ✅ Novo | Criado 2026-05-28 |
| `docs/EQUIPE-FERRAMENTAL.md` | ✅ Novo | **Este arquivo** — criado 2026-05-28 |
| `docs/commercial/*.md` | ❌ Desatualizado | Marcado explicitamente como desatualizado (OPS-DEBT-050) |
| `docs/01-projeto-stack.md` | ❌ Não existe | Referenciado no CLAUDE.md mas ausente |
| `docs/02-arquitetura-tecnica.md` | ❌ Não existe | Referenciado no CLAUDE.md mas ausente |
| `docs/03-feito-decisoes.md` | ❌ Não existe | Referenciado no CLAUDE.md mas ausente |
| `docs/99-futuro-arquitetural.md` | ❌ Não existe | Referenciado no CLAUDE.md mas ausente |

---

## 14. Comandos Essenciais

### Deploy de Edge Function
```bash
supabase functions deploy NOME \
  --project-ref mlqjywqnchilvgkbvicd \
  --no-verify-jwt
```

### Testar Edge Function via curl
```bash
curl -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/NOME" \
  -H "Content-Type: application/json" \
  -d '{"message": "teste", "church_id": "62e473b8-cd39-4da2-aa5d-c296b03d6873"}'
```

### Commit padrão (sempre mostrar diff antes)
```bash
git add supabase/functions/nome/index.ts web/src/pages/Pagina.tsx
git commit -m "feat(escopo): descrição"
git push origin staging
```

### SQL úteis de diagnóstico
```sql
-- Cron jobs
SELECT jobname, schedule, active FROM cron.job ORDER BY jobname;

-- Fila de mensagens
SELECT status, count(*) FROM channel_dispatch_queue GROUP BY status;

-- Jornadas de acolhimento
SELECT status, count(*) FROM acolhimento_journey GROUP BY status;

-- EFs: verificar via MCP
mcp__supabase__list_edge_functions()

-- Minha Fé — baseline
SELECT count(*) FROM people WHERE church_id = '5156cc30-6d76-4487-99ba-fff8013b38d4';
```

---

*Documento canônico gerado por 9 engenheiros paralelos em 2026-05-28. Manter atualizado a cada sessão significativa.*
