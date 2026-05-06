# RLS Critical Security Audit — Fix C1/C2/C3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Habilitar Row Level Security e criar policies corretas nas 4 tabelas identificadas como vulneráveis na auditoria de 03–04/05/2026 (achados C1, C2, C3).

**Architecture:** 3 migrations SQL independentes (uma por grupo de tabelas), aplicadas via MCP Supabase ao projeto `mlqjywqnchilvgkbvicd`. Políticas seguem o padrão Ekthos: `service_role` tem acesso total, admin Ekthos (`is_ekthos_admin = true` em `raw_app_meta_data`) tem SELECT ou ALL conforme necessidade da tabela, sem policy para `authenticated` genérico. Nenhuma alteração de schema — apenas DDL de RLS/policies.

**Tech Stack:** PostgreSQL RLS, Supabase MCP (`apply_migration`), Git (branch `fix/rls-critical-security-audit` a partir de `main`), SQL puro.

**Contexto crítico:**
- `channel_dispatch_queue` e `visitor_capture_rate_limits`: C1/C2 — RLS completamente ausente
- `admin_events` e `admin_tasks`: C3 — RLS habilitado mas ZERO policies (bloqueia 100% dos acessos)
- Achados da pré-auditoria (4 subagentes Haiku, 2026-05-04) informam o SQL exato

---

## Arquivos a Criar/Modificar

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `supabase/migrations/20260504100001_rls_channel_dispatch_queue.sql` | Criar | RLS + policies de `channel_dispatch_queue` |
| `supabase/migrations/20260504100002_rls_visitor_capture_rate_limits.sql` | Criar | RLS + policies de `visitor_capture_rate_limits` |
| `supabase/migrations/20260504100003_rls_admin_events_admin_tasks.sql` | Criar | Policies de `admin_events` e `admin_tasks` (RLS já ON) |

---

## Task 0: Setup — Branch a partir de main

**Files:** nenhum arquivo criado

- [ ] **Step 0.1: Garantir que main está atualizado**

```bash
git fetch origin main
git log origin/main --oneline -3
```

Expected: HEAD mais recente deve ser posterior ao merge do PASSO 7.5 (commit f947f0d ou posterior).

- [ ] **Step 0.2: Criar branch de trabalho**

```bash
git checkout main
git pull origin main
git checkout -b fix/rls-critical-security-audit
```

Expected: `Switched to a new branch 'fix/rls-critical-security-audit'`

---

## Task 1: Pré-auditoria — Confirmar Schema e Consumers (Haiku Parallel)

**Files:** nenhum

> Esta task é de leitura/coleta de evidências. O SQL das migrations seguintes depende dos resultados.

- [ ] **Step 1.1: Confirmar RLS status atual**

Via MCP Supabase `execute_sql`:
```sql
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'channel_dispatch_queue',
    'visitor_capture_rate_limits',
    'admin_events',
    'admin_tasks'
  )
ORDER BY tablename;
```

Expected: `channel_dispatch_queue` e `visitor_capture_rate_limits` com `rowsecurity = false`; `admin_events` e `admin_tasks` com `rowsecurity = true`.

- [ ] **Step 1.2: Confirmar zero policies**

```sql
SELECT count(*) FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'channel_dispatch_queue',
    'visitor_capture_rate_limits',
    'admin_events',
    'admin_tasks'
  );
```

Expected: `count = 0`

- [ ] **Step 1.3: Verificar schema de cada tabela (church_id?)**

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'channel_dispatch_queue',
    'visitor_capture_rate_limits',
    'admin_events',
    'admin_tasks'
  )
ORDER BY table_name, ordinal_position;
```

Registrar por tabela: tem `church_id`? (sim → policy de isolamento por igreja; não → service_role + admin only)

- [ ] **Step 1.4: Verificar padrão admin em policies existentes**

```sql
SELECT tablename, policyname, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND qual ILIKE '%is_ekthos_admin%'
LIMIT 5;
```

Identificar padrão exato de checagem admin usado no projeto (reusar, não inventar).

- [ ] **Step 1.5: Grep de consumers no codebase**

Buscar nos arquivos `supabase/functions/**/*.ts` e `web/src/**/*.{ts,tsx}` por referências a cada tabela. Identificar por tabela:
- Quem escreve (qual EF? usa `supabaseAdmin` ou `supabaseAuth`?)
- Quem lê (cockpit admin? frontend pastor?)

Se consumer desconhecido encontrado → acionar `/systematic-debugging` antes de continuar.

---

## Task 2: Migration C1 — RLS em `channel_dispatch_queue`

**Files:**
- Criar: `supabase/migrations/20260504100001_rls_channel_dispatch_queue.sql`

> SQL exato depende dos resultados da Task 1. Template abaixo assume que:
> - Tabela é fila técnica operacional (sem acesso de frontend pastor)
> - Escritas via `supabaseAdmin` (service_role) em EFs de dispatch
> - Leitura do cockpit admin para monitoramento

- [ ] **Step 2.1: Escrever migration**

Arquivo: `supabase/migrations/20260504100001_rls_channel_dispatch_queue.sql`

```sql
-- Migration: rls_channel_dispatch_queue
-- Fix C1: channel_dispatch_queue não tinha RLS — qualquer authenticated podia ler/escrever.
-- Decisão: tabela é fila técnica operacional. Acesso de authenticated = zero.
-- service_role (EFs de dispatch) tem acesso total.
-- Admin Ekthos tem SELECT para monitoramento via cockpit.
-- Auditoria: 2026-05-04 (achado C1 da auditoria pós-sessão maratona 02-03/05/2026)

ALTER TABLE public.channel_dispatch_queue ENABLE ROW LEVEL SECURITY;

-- service_role: acesso irrestrito (EFs de dispatch escrevem aqui)
CREATE POLICY "service_role_all_channel_dispatch_queue"
  ON public.channel_dispatch_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admin Ekthos: leitura para monitoramento no cockpit
-- Padrão auth.users.id + raw_app_meta_data conforme Decisão 57
CREATE POLICY "admin_ekthos_select_channel_dispatch_queue"
  ON public.channel_dispatch_queue
  FOR SELECT
  TO authenticated
  USING (
    (SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
     FROM auth.users
     WHERE auth.users.id = auth.uid()) = true
  );
```

> ⚠️ Se Task 1 revelar que `channel_dispatch_queue` TEM `church_id` E pastor lê aqui:
> adicionar policy `"pastor_select_own_church"` com `USING (church_id = auth_church_id())`.
> Caso contrário, NÃO criar policy de pastor.

- [ ] **Step 2.2: Aplicar via MCP Supabase**

Usar MCP Supabase `apply_migration` com:
- name: `rls_channel_dispatch_queue`
- query: conteúdo do arquivo acima

- [ ] **Step 2.3: Verificar aplicação**

```sql
SELECT rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'channel_dispatch_queue';
-- Expected: true

SELECT policyname, roles, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'channel_dispatch_queue'
ORDER BY policyname;
-- Expected: 2 linhas (service_role_all + admin_ekthos_select)
```

---

## Task 3: Migration C2 — RLS em `visitor_capture_rate_limits`

**Files:**
- Criar: `supabase/migrations/20260504100002_rls_visitor_capture_rate_limits.sql`

> Tabela de rate limiting de captura de visitantes via QR code. Escrita via EF `visitor-capture` com `supabaseAdmin`. Sem caso de uso de frontend pastor ou cockpit admin (dado técnico).

- [ ] **Step 3.1: Escrever migration**

Arquivo: `supabase/migrations/20260504100002_rls_visitor_capture_rate_limits.sql`

```sql
-- Migration: rls_visitor_capture_rate_limits
-- Fix C2: visitor_capture_rate_limits não tinha RLS — qualquer authenticated podia acessar.
-- Decisão: tabela é controle técnico de rate limiting. service_role only.
-- Admin Ekthos tem SELECT para debugging/monitoramento.
-- Pastores NÃO acessam esta tabela diretamente.
-- Auditoria: 2026-05-04 (achado C2 da auditoria pós-sessão maratona 02-03/05/2026)

ALTER TABLE public.visitor_capture_rate_limits ENABLE ROW LEVEL SECURITY;

-- service_role: acesso irrestrito (EF visitor-capture escreve aqui)
CREATE POLICY "service_role_all_visitor_capture_rate_limits"
  ON public.visitor_capture_rate_limits
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Admin Ekthos: leitura para debugging
CREATE POLICY "admin_ekthos_select_visitor_capture_rate_limits"
  ON public.visitor_capture_rate_limits
  FOR SELECT
  TO authenticated
  USING (
    (SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
     FROM auth.users
     WHERE auth.users.id = auth.uid()) = true
  );
```

> ⚠️ Se Task 1 revelar church_id + caso de uso de pastor, adicionar policy. Caso contrário não.

- [ ] **Step 3.2: Aplicar via MCP Supabase**

Usar MCP Supabase `apply_migration` com:
- name: `rls_visitor_capture_rate_limits`
- query: conteúdo do arquivo acima

- [ ] **Step 3.3: Verificar aplicação**

```sql
SELECT rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'visitor_capture_rate_limits';
-- Expected: true

SELECT policyname, roles, cmd FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'visitor_capture_rate_limits'
ORDER BY policyname;
-- Expected: 2 linhas
```

---

## Task 4: Migration C3 — Policies em `admin_events` e `admin_tasks`

**Files:**
- Criar: `supabase/migrations/20260504100003_rls_admin_events_admin_tasks.sql`

> RLS já está ON. Problema: zero policies = bloqueia TUDO. Fix: criar policies que permitem admin Ekthos (ALL) e service_role (ALL). Pastores NÃO acessam estas tabelas.

- [ ] **Step 4.1: Escrever migration**

Arquivo: `supabase/migrations/20260504100003_rls_admin_events_admin_tasks.sql`

```sql
-- Migration: rls_admin_events_admin_tasks
-- Fix C3: admin_events e admin_tasks tinham RLS ON mas zero policies.
-- No PostgreSQL, RLS habilitado sem policies bloqueia 100% dos acessos (exceto superuser).
-- Decisão: tabelas de gestão interna Ekthos. Acesso: service_role (ALL) + admin Ekthos (ALL).
-- Pastores NUNCA acessam estas tabelas.
-- Auditoria: 2026-05-04 (achado C3 da auditoria pós-sessão maratona 02-03/05/2026)

-- ── admin_events ──────────────────────────────────────────────────────────────

CREATE POLICY "service_role_all_admin_events"
  ON public.admin_events
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_ekthos_all_admin_events"
  ON public.admin_events
  FOR ALL
  TO authenticated
  USING (
    (SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
     FROM auth.users
     WHERE auth.users.id = auth.uid()) = true
  )
  WITH CHECK (
    (SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
     FROM auth.users
     WHERE auth.users.id = auth.uid()) = true
  );

-- ── admin_tasks ───────────────────────────────────────────────────────────────

CREATE POLICY "service_role_all_admin_tasks"
  ON public.admin_tasks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "admin_ekthos_all_admin_tasks"
  ON public.admin_tasks
  FOR ALL
  TO authenticated
  USING (
    (SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
     FROM auth.users
     WHERE auth.users.id = auth.uid()) = true
  )
  WITH CHECK (
    (SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
     FROM auth.users
     WHERE auth.users.id = auth.uid()) = true
  );
```

- [ ] **Step 4.2: Aplicar via MCP Supabase**

Usar MCP Supabase `apply_migration` com:
- name: `rls_admin_events_admin_tasks`
- query: conteúdo do arquivo acima

- [ ] **Step 4.3: Verificar aplicação**

```sql
SELECT tablename, count(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('admin_events', 'admin_tasks')
GROUP BY tablename;
-- Expected: admin_events = 2, admin_tasks = 2
```

---

## Task 5: Smoke Tests (S1–S5)

**Files:** nenhum (apenas queries e Playwright)

- [ ] **Step 5.1 (S1): RLS habilitado nas 4 tabelas**

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'channel_dispatch_queue',
    'visitor_capture_rate_limits',
    'admin_events',
    'admin_tasks'
  )
ORDER BY tablename;
```

Expected: todas com `rowsecurity = true`

- [ ] **Step 5.2 (S2): Contagem de policies**

```sql
SELECT tablename, count(*) as total_policies
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'channel_dispatch_queue',
    'visitor_capture_rate_limits',
    'admin_events',
    'admin_tasks'
  )
GROUP BY tablename
ORDER BY tablename;
```

Expected: ≥ 2 policies por tabela

- [ ] **Step 5.3 (S3): EFs de dispatch continuam funcionando**

```sql
-- Ver últimas execuções de channel-dispatcher e dispatch-person-event
SELECT function_name, status, created_at
FROM _analytics.function_logs
WHERE function_name IN ('channel-dispatcher', 'dispatch-person-event', 'message-enqueue')
  AND created_at > now() - interval '24h'
ORDER BY created_at DESC
LIMIT 10;
```

Se não houver execuções recentes: não é erro — apenas ambiente de baixo volume. OK se não retornar linhas.

- [ ] **Step 5.4 (S4): Cockpit admin — /admin/cockpit/ativacoes carrega**

Via Playwright:
1. Navegar para `https://ekthos-platform.vercel.app/admin/cockpit/ativacoes`
2. Verificar que lista carrega sem erro 403/500
3. Capturar snapshot — deve mostrar ativações ou lista vazia (não erro)

- [ ] **Step 5.5 (S5): Tela pastor — /configuracoes/canais continua funcionando**

Via Playwright (com impersonation ativa de church_demo):
1. Navegar para `https://ekthos-platform.vercel.app/configuracoes/canais`
2. Verificar que card Z-API ainda renderiza
3. Nenhum erro novo no console relacionado a RLS (403 Forbidden)

---

## Task 6: Build e Code Review

**Files:** nenhum

- [ ] **Step 6.1 (S6): Build verde**

```bash
cd web && npm run build
```

Expected: 0 erros de TypeScript/Vite. (Migrations não afetam build frontend)

- [ ] **Step 6.2 (S7): Code review via requesting-code-review**

Acionar skill `superpowers:requesting-code-review` com o diff das 3 migrations.

---

## Task 7: Commit + Push

**Files:** as 3 migrations

- [ ] **Step 7.1: Mostrar diff completo (regra CLAUDE.md)**

```bash
git diff --staged
# ou
git diff HEAD
```

Apresentar diff ao Felipe para confirmação antes de commitar.

- [ ] **Step 7.2: Commit (apenas após aprovação explícita de Felipe)**

```bash
git add supabase/migrations/20260504100001_rls_channel_dispatch_queue.sql
git add supabase/migrations/20260504100002_rls_visitor_capture_rate_limits.sql
git add supabase/migrations/20260504100003_rls_admin_events_admin_tasks.sql
git commit -m "fix(db): RLS policies para channel_dispatch_queue, visitor_capture_rate_limits, admin_events, admin_tasks (C1/C2/C3)"
```

- [ ] **Step 7.3: Push**

```bash
git push origin fix/rls-critical-security-audit
```

- [ ] **Step 7.4: Criar PR via gh CLI**

```bash
gh pr create \
  --base main \
  --head fix/rls-critical-security-audit \
  --title "fix(db): RLS crítico — C1/C2/C3 das 4 tabelas sem policies" \
  --body "$(cat <<'EOF'
## Contexto

Achados C1, C2, C3 da auditoria de segurança 03–04/05/2026.

## O que foi corrigido

| Achado | Tabela | Problema | Fix |
|--------|--------|---------|-----|
| C1 | `channel_dispatch_queue` | RLS ausente — qualquer autenticado lia/escrevia | RLS habilitado + policies service_role + admin |
| C2 | `visitor_capture_rate_limits` | RLS ausente — mesma exposição | RLS habilitado + policies service_role + admin |
| C3 | `admin_events` | RLS ON mas 0 policies → bloqueio total | Policies service_role + admin Ekthos (ALL) |
| C3 | `admin_tasks` | RLS ON mas 0 policies → bloqueio total | Policies service_role + admin Ekthos (ALL) |

## Padrão aplicado

- `service_role`: acesso total (EFs de backend usam supabaseAdmin)
- Admin Ekthos (`is_ekthos_admin = true` em `raw_app_meta_data`): SELECT ou ALL conforme tabela
- `authenticated` genérico: zero acesso (tabelas técnicas/admin)
- Padrão `auth.users.id = auth.uid()` qualificado — Decisão 57

## Smoke tests realizados

- S1: RLS = true nas 4 tabelas ✅
- S2: ≥ 2 policies por tabela ✅
- S3: EFs de dispatch não quebradas ✅
- S4: /admin/cockpit/ativacoes carrega ✅
- S5: /configuracoes/canais continua renderizando ✅
- S6: Build verde ✅
- S7: Code review aprovado ✅

🤖 Generated with Claude Code
EOF
)"
```

---

## Critério de Pronto (verification-before-completion)

Antes de declarar conclusão, executar todos S1–S7 e reportar output literal de cada um.

---

*Plano gerado: 2026-05-04 | Branch: fix/rls-critical-security-audit | Base: main*
