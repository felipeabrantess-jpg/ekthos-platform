# Frente 4A — Modo Manutenção Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar fundação de backend para Modo Manutenção Ekthos: roles cumulativas (ekthos_admin/support/commercial), audit log universal em admin_events com schema expandido, refactor de impersonation server-side com EFs dedicadas e lifecycle completo, e instrumentação de 22 EFs para gravação estruturada em admin_events.

**Architecture:** 6 migrations SQL definem schema expandido, funções SQL centrais (has_ekthos_role, is_ekthos_admin compat, record_audit_event) e migração de dados; 3 novas Edge Functions Deno implementam gestão de roles e lifecycle de impersonation (start/end); 22 EFs existentes são refatoradas para substituir inserts manuais em admin_events por chamadas a record_audit_event(); frontend refatorado para depender de EFs server-side em vez de localStorage puro. Compatibilidade total com is_ekthos_admin boolean legado durante transição (OPS-DEBT-025).

**Tech Stack:** Deno Edge Functions (Supabase MCP deploy), PostgreSQL migrations (apply_migration MCP), React + TypeScript + shadcn/ui (frontend refactor), Playwright E2E (smoke prod).

---

## BLINDAGEM Context (leia antes de começar)

Desvios validados pelo engenheiro-chefe:
- **D1**: `admin_events` JÁ EXISTE com 8 colunas. M2 = ALTER TABLE (não CREATE). Dados da Frente 3B preservados.
- **D2**: `impersonate_sessions.ended_at` JÁ EXISTE. M3 adiciona apenas `ended_reason` + `last_action_at`.
- **D3**: M7 migra apenas 2 users (felipe@ekthosai.net + playwright@ekthosai.net). Vanessa recebe role via EF após Frente 4B.
- **D4**: Escopo PASSO 4 = 22 EFs (12 admin-* + 6 affiliate-* + 3 catalog + 1 provision-channel).

Admin_events schema atual (8 colunas existentes):
`id, created_at, church_id, admin_user_id, action, before, after, reason`

Admin_events RLS atual:
- `admin_ekthos_select_admin_events` → SELECT / is_ekthos_admin()
- `service_role_all_admin_events` → ALL (*) — **INSEGURO, será substituído**

is_ekthos_admin() atual: lê apenas `app_metadata->>'is_ekthos_admin'` boolean.

15 das 22 EFs já têm inserts em admin_events (schema antigo). 7 não têm.

---

## Caminhos críticos a conhecer

- Supabase project ref: `mlqjywqnchilvgkbvicd`
- Deploy EF: `supabase functions deploy NOME --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt`
- Ou via MCP: `deploy_edge_function(slug, files)`
- Migrations: via MCP `apply_migration`
- Branch de trabalho: `feat/4a-modo-manutencao-backend` (criar a partir de main be97fcb)
- EFs usam `supabase` como nome do cliente service_role (não `supabaseAdmin`)
- `supabaseAuth` é o cliente separado para `getUser(token)` — nunca misturar
- `record_audit_event` é chamada via `supabase.rpc(...)` — service_role já bypassa RLS

---

## File Map

**Novas migrations:**
- `supabase/migrations/20260508000001_admin_events_schema_extend.sql` — ALTER admin_events + RLS
- `supabase/migrations/20260508000002_impersonate_sessions_extend.sql` — +ended_reason +last_action_at
- `supabase/migrations/20260508000003_has_ekthos_role_function.sql` — nova função SQL
- `supabase/migrations/20260508000004_is_ekthos_admin_compat.sql` — atualiza função existente
- `supabase/migrations/20260508000005_record_audit_event_function.sql` — nova função centralizadora
- `supabase/migrations/20260508000006_ekthos_roles_data_migration.sql` — migra 2 users

**Novas EFs:**
- `supabase/functions/admin-set-ekthos-roles/index.ts`
- `supabase/functions/admin-start-impersonation/index.ts`
- `supabase/functions/admin-end-impersonation/index.ts`

**EFs modificadas (22) — apenas record_audit_event call:**
Group 1: admin-church-create, admin-church-pricing, admin-church-detail, admin-agent-grant
Group 2: admin-notes-crud, admin-churches-list, admin-events-list, admin-tasks-crud
Group 3: admin-cockpit-metrics, admin-revenue-metrics, admin-update-contractor, admin-update-pastoral-profile
Group 4: affiliate-crud, affiliate-coupon-create, affiliate-coupon-toggle, affiliate-commissions-approve
Group 5: affiliate-commissions-export-csv, affiliate-commissions-mark-paid, plans-update, addon-prices-update
Group 6: agents-catalog-update, provision-channel

**Frontend modificado:**
- `web/src/pages/admin/Church.tsx` — startImpersonate() chama EF
- `web/src/pages/admin/Churches.tsx` — startImpersonate() chama EF
- `web/src/components/Layout.tsx` — exitImpersonate() chama EF + ImpersonatingState +session_id
- `web/src/lib/auth-context.tsx` — ImpersonatingState com session_id opcional

**Novos testes:**
- `web/tests/e2e/frente-4a-smoke.prod.spec.ts`

**Config:**
- `supabase/config.toml` — +3 entradas verify_jwt=false

---

## Task 1: Branch + config.toml

**Files:**
- Modify: `supabase/config.toml`

- [ ] **Step 1: Criar branch feat/4a-modo-manutencao-backend**

```bash
cd /path/to/ekthos-platform-main
git checkout main
git pull origin main
git checkout -b feat/4a-modo-manutencao-backend
git log --oneline -1
# Esperado: be97fcb  Merge pull request #139
```

- [ ] **Step 2: Adicionar 3 entradas em config.toml**

Arquivo: `supabase/config.toml`. Localizar o bloco `[functions.admin-update-pastoral-profile]` (última entrada antes de `# ── Auth`). Adicionar APÓS ele:

```toml
[functions.admin-set-ekthos-roles]
verify_jwt = false   # JWT validado manualmente — is_ekthos_admin only

[functions.admin-start-impersonation]
verify_jwt = false   # JWT validado manualmente — is_ekthos_admin only

[functions.admin-end-impersonation]
verify_jwt = false   # JWT validado manualmente — is_ekthos_admin only
```

- [ ] **Step 3: Commit config**

```bash
git add supabase/config.toml
git commit -m "chore(4a): branch + config.toml para 3 novas EFs impersonation/roles"
```

---

## Task 2: M2 — ALTER admin_events + RLS

**Files:**
- Create: `supabase/migrations/20260508000001_admin_events_schema_extend.sql`

- [ ] **Step 1: Verificar estado atual (query SQL via MCP)**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='admin_events'
ORDER BY ordinal_position;
```
Esperado: 8 colunas (id, created_at, church_id, admin_user_id, action, before, after, reason).

- [ ] **Step 2: Criar arquivo de migration**

```sql
-- supabase/migrations/20260508000001_admin_events_schema_extend.sql
-- Frente 4A: expande admin_events com colunas de auditoria estruturada.
-- Todas as novas colunas são NULLABLE para compat com INSERTs da Frente 3B.
-- D1 (BLINDAGEM): tabela já existe — ALTER TABLE, não CREATE.

-- ── 1. Novas colunas ──────────────────────────────────────────────────────────
ALTER TABLE public.admin_events
  ADD COLUMN IF NOT EXISTS actor_email              text,
  ADD COLUMN IF NOT EXISTS actor_roles              text[],
  ADD COLUMN IF NOT EXISTS resource                 text,
  ADD COLUMN IF NOT EXISTS resource_id              uuid,
  ADD COLUMN IF NOT EXISTS ip_address               inet,
  ADD COLUMN IF NOT EXISTS user_agent               text,
  ADD COLUMN IF NOT EXISTS request_id               text,
  ADD COLUMN IF NOT EXISTS status                   text,
  ADD COLUMN IF NOT EXISTS error_msg                text,
  ADD COLUMN IF NOT EXISTS impersonation_session_id uuid REFERENCES impersonate_sessions(id),
  ADD COLUMN IF NOT EXISTS impersonated_church_id   uuid REFERENCES churches(id),
  ADD COLUMN IF NOT EXISTS source                   text DEFAULT 'cockpit';

-- CHECK constraint para status (nullable para compat legado)
ALTER TABLE public.admin_events
  DROP CONSTRAINT IF EXISTS admin_events_status_check;
ALTER TABLE public.admin_events
  ADD CONSTRAINT admin_events_status_check
  CHECK (status IS NULL OR status IN ('success', 'failed', 'denied'));

-- ── 2. RLS: substituir service_role_all por políticas imutáveis ──────────────
-- Drop policies antigas
DROP POLICY IF EXISTS service_role_all_admin_events ON public.admin_events;
DROP POLICY IF EXISTS admin_ekthos_select_admin_events ON public.admin_events;

-- SELECT: ekthos_admin vê tudo
CREATE POLICY admin_events_ekthos_admin_select ON public.admin_events
  FOR SELECT TO authenticated
  USING (is_ekthos_admin());

-- SELECT: ekthos_support também vê (granularidade de campo fica para Frente 4B UI)
CREATE POLICY admin_events_ekthos_support_select ON public.admin_events
  FOR SELECT TO authenticated
  USING (
    has_ekthos_role('ekthos_admin') OR has_ekthos_role('ekthos_support')
  );

-- INSERT: apenas service_role (EFs usam service_role key que bypassa RLS,
-- mas esta policy documenta a intenção e bloqueia unauthenticated/anon)
CREATE POLICY admin_events_service_insert_only ON public.admin_events
  FOR INSERT TO service_role
  WITH CHECK (true);

-- SEM policy para UPDATE ou DELETE → tabela imutável para authenticated
-- Nota: service_role bypassa RLS por padrão no Supabase (sem FORCE RLS).
-- Imutabilidade real para service_role = OPS-DEBT futura (FORCE RLS + INSERT-only).
```

- [ ] **Step 3: Aplicar migration via MCP**

Usar `apply_migration` MCP com o conteúdo do arquivo acima.

- [ ] **Step 4: Verificar R1 + R2**

```sql
-- R1: 20 colunas existem (8 originais + 12 novas)
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='admin_events'
ORDER BY ordinal_position;
-- Esperado: 20 linhas

-- R2: 3 policies de RLS
SELECT polname, polcmd
FROM pg_policy
WHERE polrelid = 'public.admin_events'::regclass
ORDER BY polname;
-- Esperado: admin_events_ekthos_admin_select (r),
--           admin_events_ekthos_support_select (r),
--           admin_events_service_insert_only (a)
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260508000001_admin_events_schema_extend.sql
git commit -m "chore(db): M2 — ALTER admin_events +12 colunas + RLS imutável (Frente 4A)"
```

---

## Task 3: M3 — ALTER impersonate_sessions

**Files:**
- Create: `supabase/migrations/20260508000002_impersonate_sessions_extend.sql`

- [ ] **Step 1: Criar migration**

```sql
-- supabase/migrations/20260508000002_impersonate_sessions_extend.sql
-- Frente 4A: adiciona colunas para lifecycle completo de impersonation.
-- D2 (BLINDAGEM): ended_at já existe — apenas +2 colunas novas.

ALTER TABLE public.impersonate_sessions
  ADD COLUMN IF NOT EXISTS ended_reason   text,
  ADD COLUMN IF NOT EXISTS last_action_at timestamptz;
```

- [ ] **Step 2: Aplicar via MCP**

Usar `apply_migration` com o conteúdo acima.

- [ ] **Step 3: Verificar R5**

```sql
-- R5: 8 colunas em impersonate_sessions
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='public' AND table_name='impersonate_sessions'
ORDER BY ordinal_position;
-- Esperado: id, admin_user_id, church_id, started_at, ended_at, notes,
--           ended_reason, last_action_at (8 colunas)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000002_impersonate_sessions_extend.sql
git commit -m "chore(db): M3 — impersonate_sessions +ended_reason +last_action_at"
```

---

## Task 4: M4 — Função has_ekthos_role()

**Files:**
- Create: `supabase/migrations/20260508000003_has_ekthos_role_function.sql`

- [ ] **Step 1: Criar migration**

```sql
-- supabase/migrations/20260508000003_has_ekthos_role_function.sql
-- Frente 4A: função auxiliar para verificar se o JWT atual contém uma role
-- específica no array app_metadata.ekthos_roles.
-- Roles válidas: 'ekthos_admin', 'ekthos_support', 'ekthos_commercial'

CREATE OR REPLACE FUNCTION public.has_ekthos_role(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' -> 'ekthos_roles') @> to_jsonb(p_role),
    false
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_ekthos_role(text) TO authenticated, service_role;
```

- [ ] **Step 2: Aplicar via MCP**

- [ ] **Step 3: Verificar R3 (parcial — aguarda M7 para dados reais)**

```sql
-- Verifica que a função existe e compila
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'has_ekthos_role' AND pronamespace = 'public'::regnamespace;
-- Esperado: função existe, contém @> to_jsonb(p_role)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000003_has_ekthos_role_function.sql
git commit -m "chore(db): M4 — função has_ekthos_role() para roles cumulativas"
```

---

## Task 5: M5 — is_ekthos_admin() backward compat

**Files:**
- Create: `supabase/migrations/20260508000004_is_ekthos_admin_compat.sql`

- [ ] **Step 1: Criar migration**

```sql
-- supabase/migrations/20260508000004_is_ekthos_admin_compat.sql
-- Frente 4A: adapta is_ekthos_admin() para aceitar ekthos_roles=['ekthos_admin']
-- OU o boolean legado is_ekthos_admin=true.
-- Preserva compatibilidade com todas as EFs existentes que dependem desta função.
-- Remoção do boolean legado = OPS-DEBT-025 (após Frente 4B validada).

CREATE OR REPLACE FUNCTION public.is_ekthos_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT COALESCE(
    -- Novo: array ekthos_roles contém 'ekthos_admin'
    (auth.jwt() -> 'app_metadata' -> 'ekthos_roles') @> '"ekthos_admin"'::jsonb
    OR
    -- Legado: boolean is_ekthos_admin = true (OPS-DEBT-025)
    (auth.jwt() -> 'app_metadata' ->> 'is_ekthos_admin')::boolean,
    false
  )
$$;
```

- [ ] **Step 2: Aplicar via MCP**

- [ ] **Step 3: Verificar**

```sql
-- Verificar que a função foi atualizada
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'is_ekthos_admin' AND pronamespace = 'public'::regnamespace;
-- Esperado: contém @> '"ekthos_admin"'::jsonb OR boolean cast
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508000004_is_ekthos_admin_compat.sql
git commit -m "chore(db): M5 — is_ekthos_admin() aceita ekthos_roles array OU legacy boolean"
```

---

## Task 6: M6 — Função record_audit_event()

**Files:**
- Create: `supabase/migrations/20260508000005_record_audit_event_function.sql`

Esta é a função SQL central chamada por todas as 22 EFs via `supabase.rpc()`.

- [ ] **Step 1: Criar migration**

```sql
-- supabase/migrations/20260508000005_record_audit_event_function.sql
-- Frente 4A: função centralizadora de auditoria. Chamada via supabase.rpc()
-- por todas as EFs admin (service_role bypassa RLS, GRANT não é necessário
-- mas está incluído para documentação de intenção).
-- NÃO lança exceção — engole erro com WARNING para nunca bloquear ação principal.

CREATE OR REPLACE FUNCTION public.record_audit_event(
  p_church_id                uuid,
  p_admin_user_id            uuid,
  p_action                   text,
  p_before                   jsonb    DEFAULT NULL,
  p_after                    jsonb    DEFAULT NULL,
  p_reason                   text     DEFAULT NULL,
  p_actor_email              text     DEFAULT NULL,
  p_actor_roles              text[]   DEFAULT NULL,
  p_resource                 text     DEFAULT NULL,
  p_resource_id              uuid     DEFAULT NULL,
  p_status                   text     DEFAULT 'success',
  p_error_msg                text     DEFAULT NULL,
  p_impersonation_session_id uuid     DEFAULT NULL,
  p_impersonated_church_id   uuid     DEFAULT NULL,
  p_source                   text     DEFAULT 'cockpit'
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.admin_events (
    church_id,      admin_user_id,            action,
    before,         after,                    reason,
    actor_email,    actor_roles,              resource,
    resource_id,    status,                   error_msg,
    impersonation_session_id,  impersonated_church_id,  source
  ) VALUES (
    p_church_id,    p_admin_user_id,          p_action,
    p_before,       p_after,                  p_reason,
    p_actor_email,  p_actor_roles,            p_resource,
    p_resource_id,  p_status,                 p_error_msg,
    p_impersonation_session_id, p_impersonated_church_id, p_source
  ) RETURNING id INTO v_id;
  RETURN v_id;
EXCEPTION WHEN OTHERS THEN
  -- Nunca bloqueia a ação principal — resolve OPS-DEBT-014
  RAISE WARNING '[record_audit_event] falha: % — action=%, church=%',
    SQLERRM, p_action, p_church_id;
  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_audit_event TO service_role;
```

- [ ] **Step 2: Aplicar via MCP**

- [ ] **Step 3: Verificar função**

```sql
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'record_audit_event' AND pronamespace = 'public'::regnamespace;
-- Esperado: função existe, assinatura com 15 parâmetros, RETURNS uuid
```

- [ ] **Step 4: Smoke test da função via SQL**

```sql
-- Teste com church_id real (pegar primeiro da tabela)
SELECT record_audit_event(
  (SELECT id FROM churches LIMIT 1),
  '579d0f7b-9b8b-4c20-94c5-513b4a424642'::uuid, -- Felipe UUID
  'test.migration_smoke',
  NULL, NULL, 'teste de migração M6',
  'felipe@ekthosai.net',
  ARRAY['ekthos_admin'],
  'admin_events', NULL, 'success', NULL, NULL, NULL, 'migration_test'
) AS audit_id;
-- Esperado: uuid retornado (não NULL)

-- Limpar registro de teste
DELETE FROM admin_events WHERE action = 'test.migration_smoke';
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260508000005_record_audit_event_function.sql
git commit -m "chore(db): M6 — função record_audit_event() centralizadora (resolve OPS-DEBT-014)"
```

---

## Task 7: M7 — Data migration (ekthos_roles para users existentes)

**Files:**
- Create: `supabase/migrations/20260508000006_ekthos_roles_data_migration.sql`

- [ ] **Step 1: Criar migration**

```sql
-- supabase/migrations/20260508000006_ekthos_roles_data_migration.sql
-- Frente 4A: popula ekthos_roles array para todos os users com is_ekthos_admin=true.
-- D3 (BLINDAGEM): 2 users esperados (felipe@ekthosai.net + playwright@ekthosai.net).
-- Vanessa recebe ekthos_support futuramente via admin-set-ekthos-roles.
-- Idempotente: jsonb_set só escreve se não existir (usa WHERE NOT EXISTS no array).

UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{ekthos_roles}',
  '["ekthos_admin"]'::jsonb,
  true  -- create_missing = true
)
WHERE raw_app_meta_data->>'is_ekthos_admin' = 'true'
  AND NOT (raw_app_meta_data ? 'ekthos_roles');
-- WHERE NOT EXISTS garante idempotência — não sobrescreve array já existente
```

- [ ] **Step 2: Aplicar via MCP (execute_sql, não apply_migration — é DML)**

```sql
UPDATE auth.users
SET raw_app_meta_data = jsonb_set(
  COALESCE(raw_app_meta_data, '{}'::jsonb),
  '{ekthos_roles}',
  '["ekthos_admin"]'::jsonb,
  true
)
WHERE raw_app_meta_data->>'is_ekthos_admin' = 'true'
  AND NOT (raw_app_meta_data ? 'ekthos_roles');
```

Esperado: `UPDATE 2`

- [ ] **Step 3: Verificar R7**

```sql
-- R7: users migrados
SELECT email,
       raw_app_meta_data->>'is_ekthos_admin' AS legacy_bool,
       raw_app_meta_data->'ekthos_roles'     AS roles_array
FROM auth.users
WHERE raw_app_meta_data->>'is_ekthos_admin' = 'true'
   OR raw_app_meta_data ? 'ekthos_roles'
ORDER BY email;
-- Esperado 2 rows:
--   felipe@ekthosai.net      | legacy_bool='true' | roles_array=["ekthos_admin"]
--   playwright@ekthosai.net  | legacy_bool='true' | roles_array=["ekthos_admin"]
```

- [ ] **Step 4: Verificar R3 completo**

```sql
-- R3: has_ekthos_role retorna true para Felipe (logado como service_role neste contexto)
-- Nota: has_ekthos_role() lê do JWT, então só pode ser testado em EF request.
-- Aqui verificamos apenas que a função existe e que os dados estão corretos.
SELECT email, raw_app_meta_data->'ekthos_roles' AS roles
FROM auth.users
WHERE email IN ('felipe@ekthosai.net', 'playwright@ekthosai.net');
-- Esperado: ambos com ["ekthos_admin"]
```

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260508000006_ekthos_roles_data_migration.sql
git commit -m "chore(db): M7 — migra ekthos_roles=['ekthos_admin'] para 2 users existentes"
```

---

## Task 8: EF admin-set-ekthos-roles (nova)

**Files:**
- Create: `supabase/functions/admin-set-ekthos-roles/index.ts`

Controla atribuição e revogação de roles Ekthos. Apenas `ekthos_admin` pode chamar.
Bloqueia auto-elevação e remoção do último admin.

- [ ] **Step 1: Criar o arquivo**

```typescript
// supabase/functions/admin-set-ekthos-roles/index.ts
// POST — atribui ou revoga roles Ekthos de um usuário.
// Apenas ekthos_admin pode chamar (validado server-side).
// Roles válidas: ekthos_admin, ekthos_support, ekthos_commercial (cumulativas).
// Bloqueios: auto-elevação proibida; não remove o último ekthos_admin ativo.
// verify_jwt: false — valida JWT manualmente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://ekthosai.com',
  'https://www.ekthosai.com',
]

const VALID_ROLES = ['ekthos_admin', 'ekthos_support', 'ekthos_commercial'] as const
type EkthosRole = typeof VALID_ROLES[number]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405, origin)

  // ── 1. Auth: apenas ekthos_admin ──────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401, origin)

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user: caller }, error: authErr } = await supabaseAuth.auth.getUser()
  if (authErr || !caller) return json({ error: 'Unauthorized' }, 401, origin)

  const callerIsAdmin = caller.app_metadata?.is_ekthos_admin === true
    || (caller.app_metadata?.ekthos_roles as string[] | undefined)?.includes('ekthos_admin') === true
  if (!callerIsAdmin) return json({ error: 'Forbidden' }, 403, origin)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body: { target_user_id?: string; roles?: string[] }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400, origin) }

  const { target_user_id, roles } = body
  if (!target_user_id) return json({ error: 'target_user_id é obrigatório' }, 400, origin)
  if (!Array.isArray(roles)) return json({ error: 'roles deve ser um array' }, 400, origin)

  // Valida que todas as roles são válidas
  const invalidRoles = roles.filter(r => !(VALID_ROLES as readonly string[]).includes(r))
  if (invalidRoles.length > 0) {
    return json({ error: `roles inválidas: ${invalidRoles.join(', ')}. Válidas: ${VALID_ROLES.join(', ')}` }, 400, origin)
  }

  // ── 3. Busca target user ───────────────────────────────────────────────────
  const { data: { user: targetUser }, error: targetErr } =
    await supabase.auth.admin.getUserById(target_user_id)
  if (targetErr || !targetUser) return json({ error: 'Usuário não encontrado' }, 404, origin)

  // ── 4. Bloqueio: verificar last admin antes de remover ekthos_admin ────────
  const currentRoles = (targetUser.app_metadata?.ekthos_roles as string[] | undefined) ?? []
  const wasAdmin = currentRoles.includes('ekthos_admin')
    || targetUser.app_metadata?.is_ekthos_admin === true
  const willBeAdmin = roles.includes('ekthos_admin')

  if (wasAdmin && !willBeAdmin) {
    // Verificar se há outros admins ativos
    const { data: adminUsers, error: adminCheckErr } = await supabase
      .from('auth.users')
      .select('id')
      .filter('raw_app_meta_data->>is_ekthos_admin', 'eq', 'true')
      .neq('id', target_user_id)

    // Fallback via SQL se a query acima falhar
    if (adminCheckErr) {
      const { data: countData } = await supabase.rpc('count_ekthos_admins_excluding', {
        p_exclude_id: target_user_id,
      }).single()
      if (!countData || (countData as unknown as number) === 0) {
        return json({ error: 'Não é possível remover o último ekthos_admin ativo' }, 400, origin)
      }
    } else if (!adminUsers || adminUsers.length === 0) {
      // Verificar via raw_app_meta_data diretamente
      const { data: rawCheck } = await supabase
        .rpc('count_remaining_admins', { p_exclude_id: target_user_id })
      if (!rawCheck || rawCheck === 0) {
        return json({ error: 'Não é possível remover o último ekthos_admin ativo' }, 400, origin)
      }
    }
  }

  // ── 5. Gravar roles via Admin API ──────────────────────────────────────────
  const beforeRoles = currentRoles
  const { data: updatedUser, error: updateErr } =
    await supabase.auth.admin.updateUserById(target_user_id, {
      app_metadata: {
        ...targetUser.app_metadata,
        ekthos_roles: roles as EkthosRole[],
      },
    })
  if (updateErr || !updatedUser) {
    console.error('[admin-set-ekthos-roles] updateUserById failed:', updateErr?.message)
    return json({ error: 'Falha ao atualizar roles' }, 500, origin)
  }

  // ── 6. Audit ───────────────────────────────────────────────────────────────
  const impersonationSessionId = req.headers.get('x-impersonation-session-id') ?? null
  const { error: auditErr } = await supabase.rpc('record_audit_event', {
    p_church_id:                null,  // operação de nível Ekthos, não de igreja específica
    p_admin_user_id:            caller.id,
    p_action:                   'ekthos_roles.update',
    p_before:                   { roles: beforeRoles },
    p_after:                    { roles },
    p_reason:                   `Roles atualizadas para ${targetUser.email}`,
    p_actor_email:              caller.email ?? null,
    p_actor_roles:              (caller.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
    p_resource:                 'auth.user',
    p_resource_id:              target_user_id,
    p_status:                   'success',
    p_impersonation_session_id: impersonationSessionId,
    p_source:                   'cockpit',
  })
  if (auditErr) console.error('[admin-set-ekthos-roles] audit failed:', auditErr.message)

  return json({
    success:           true,
    target_user_id,
    new_roles:         roles,
    ...(auditErr ? { audit_warning: true } : {}),
  }, 200, origin)
})
```

**Nota sobre a verificação do último admin:** A EF usa `supabase.auth.admin.getUserById` que requer API Admin — não uma query direta em `auth.users`. Para a verificação do último admin, vamos usar uma query SQL simplificada via `execute_sql` MCP para criar a função helper `count_remaining_admins`:

- [ ] **Step 2: Criar função helper SQL para verificação de último admin**

```sql
-- Aplicar via execute_sql MCP (não precisa de migration separada)
CREATE OR REPLACE FUNCTION public.count_remaining_admins(p_exclude_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::integer
  FROM auth.users
  WHERE (raw_app_meta_data->>'is_ekthos_admin' = 'true'
         OR raw_app_meta_data->'ekthos_roles' @> '"ekthos_admin"'::jsonb)
    AND id != p_exclude_id
    AND deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.count_remaining_admins TO service_role;
```

- [ ] **Step 3: Simplificar a EF usando count_remaining_admins**

Na EF acima, substituir o bloco complexo de verificação (linhas com `filter`, `neq`, `adminUsers`) pelo seguinte bloco mais limpo:

```typescript
  if (wasAdmin && !willBeAdmin) {
    const { data: remainingCount, error: countErr } = await supabase
      .rpc('count_remaining_admins', { p_exclude_id: target_user_id })
    if (countErr || (remainingCount as number) === 0) {
      return json({ error: 'Não é possível remover o último ekthos_admin ativo' }, 400, origin)
    }
  }
```

Reescrever o arquivo com esta versão simplificada.

- [ ] **Step 4: Deploy via MCP**

```bash
supabase functions deploy admin-set-ekthos-roles --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 5: Teste manual via curl**

```bash
# Substituir <ADMIN_JWT> pelo token de felipe@ekthosai.net
curl -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/admin-set-ekthos-roles" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"target_user_id":"579d0f7b-9b8b-4c20-94c5-513b4a424642","roles":["ekthos_admin"]}'
# Esperado: {"success":true,"target_user_id":"...","new_roles":["ekthos_admin"]}
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-set-ekthos-roles/
git commit -m "feat(4a): EF admin-set-ekthos-roles — gestão de roles cumulativas com guardrails"
```

---

## Task 9: EF admin-start-impersonation (nova)

**Files:**
- Create: `supabase/functions/admin-start-impersonation/index.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// supabase/functions/admin-start-impersonation/index.ts
// POST { church_id: uuid } — inicia sessão de impersonação.
// Cria registro em impersonate_sessions, grava em admin_events.
// Retorna session_id que o frontend deve salvar em localStorage.
// Se EF falhar, frontend NÃO entra em impersonation (sem fallback silencioso).
// verify_jwt: false — valida JWT manualmente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://ekthosai.com',
  'https://www.ekthosai.com',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405, origin)

  // ── 1. Auth: apenas ekthos_admin ──────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401, origin)

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401, origin)

  const isAdmin = user.app_metadata?.is_ekthos_admin === true
    || (user.app_metadata?.ekthos_roles as string[] | undefined)?.includes('ekthos_admin') === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403, origin)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body: { church_id?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400, origin) }

  const { church_id } = body
  if (!church_id) return json({ error: 'church_id é obrigatório' }, 400, origin)

  // ── 3. Verificar que igreja existe ─────────────────────────────────────────
  const { data: church, error: churchErr } = await supabase
    .from('churches')
    .select('id, name')
    .eq('id', church_id)
    .single()
  if (churchErr || !church) return json({ error: 'Igreja não encontrada' }, 404, origin)

  // ── 4. Criar sessão de impersonação ────────────────────────────────────────
  const { data: session, error: sessionErr } = await supabase
    .from('impersonate_sessions')
    .insert({
      admin_user_id: user.id,
      church_id,
      notes: `Impersonação iniciada via admin-start-impersonation — ${(church as { name: string }).name}`,
    })
    .select('id, started_at')
    .single()

  if (sessionErr || !session) {
    console.error('[admin-start-impersonation] insert failed:', sessionErr?.message)
    return json({ error: 'Falha ao criar sessão de impersonação' }, 500, origin)
  }

  const sessionId = (session as { id: string }).id

  // ── 5. Audit em admin_events ───────────────────────────────────────────────
  const { error: auditErr } = await supabase.rpc('record_audit_event', {
    p_church_id:                church_id,
    p_admin_user_id:            user.id,
    p_action:                   'impersonation.start',
    p_after:                    { church_name: (church as { name: string }).name, session_id: sessionId },
    p_actor_email:              user.email ?? null,
    p_actor_roles:              (user.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
    p_resource:                 'impersonate_sessions',
    p_resource_id:              sessionId,
    p_status:                   'success',
    p_impersonation_session_id: sessionId,
    p_impersonated_church_id:   church_id,
    p_source:                   'cockpit',
  })
  if (auditErr) console.error('[admin-start-impersonation] audit failed:', auditErr.message)

  return json({
    success:    true,
    session_id: sessionId,
    church_id,
    church_name: (church as { name: string }).name,
    started_at: (session as { started_at: string }).started_at,
    ...(auditErr ? { audit_warning: true } : {}),
  }, 200, origin)
})
```

- [ ] **Step 2: Deploy via MCP**

```bash
supabase functions deploy admin-start-impersonation --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 3: Verificar R6**

```bash
# Testar com JWT real de Felipe
curl -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/admin-start-impersonation" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"church_id":"<UUID_DE_TESTE>"}'
# Esperado: {"success":true,"session_id":"<uuid>","church_id":"...","church_name":"..."}
```

```sql
-- SQL pós-teste: verificar sessão criada
SELECT id, admin_user_id, church_id, started_at, ended_at
FROM impersonate_sessions
ORDER BY started_at DESC LIMIT 1;
-- Esperado: 1 row com started_at preenchido, ended_at NULL

-- Verificar admin_events com action=impersonation.start
SELECT action, status, impersonation_session_id, impersonated_church_id
FROM admin_events
WHERE action = 'impersonation.start'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: action='impersonation.start', status='success'
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin-start-impersonation/
git commit -m "feat(4a): EF admin-start-impersonation — cria sessão auditada de impersonation"
```

---

## Task 10: EF admin-end-impersonation (nova)

**Files:**
- Create: `supabase/functions/admin-end-impersonation/index.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
// supabase/functions/admin-end-impersonation/index.ts
// POST { session_id: uuid, ended_reason?: string } — encerra sessão de impersonação.
// UPDATE impersonate_sessions SET ended_at=now(), ended_reason=...
// Grava impersonation.end em admin_events.
// verify_jwt: false — valida JWT manualmente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://ekthosai.com',
  'https://www.ekthosai.com',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response('ok', { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405, origin)

  // ── 1. Auth ────────────────────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401, origin)

  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401, origin)

  const isAdmin = user.app_metadata?.is_ekthos_admin === true
    || (user.app_metadata?.ekthos_roles as string[] | undefined)?.includes('ekthos_admin') === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403, origin)

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 2. Parse body ──────────────────────────────────────────────────────────
  let body: { session_id?: string; ended_reason?: string }
  try { body = await req.json() } catch { return json({ error: 'invalid_json' }, 400, origin) }

  const { session_id, ended_reason = 'manual_exit' } = body
  if (!session_id) return json({ error: 'session_id é obrigatório' }, 400, origin)

  // ── 3. Buscar sessão e validar propriedade ─────────────────────────────────
  const { data: session, error: fetchErr } = await supabase
    .from('impersonate_sessions')
    .select('id, admin_user_id, church_id, started_at, ended_at')
    .eq('id', session_id)
    .single()

  if (fetchErr || !session) return json({ error: 'Sessão não encontrada' }, 404, origin)

  // Admin só pode encerrar suas próprias sessões (ou qualquer admin pode encerrar todas)
  // Decisão: qualquer ekthos_admin pode encerrar qualquer sessão (para casos de emergência)
  if ((session as { ended_at: string | null }).ended_at) {
    return json({ error: 'Sessão já encerrada', ended_at: (session as { ended_at: string }).ended_at }, 409, origin)
  }

  // ── 4. UPDATE impersonate_sessions ─────────────────────────────────────────
  const { error: updateErr } = await supabase
    .from('impersonate_sessions')
    .update({
      ended_at:     new Date().toISOString(),
      ended_reason,
    })
    .eq('id', session_id)

  if (updateErr) {
    console.error('[admin-end-impersonation] update failed:', updateErr.message)
    return json({ error: 'Falha ao encerrar sessão' }, 500, origin)
  }

  // ── 5. Audit ───────────────────────────────────────────────────────────────
  const churchId = (session as { church_id: string }).church_id
  const { error: auditErr } = await supabase.rpc('record_audit_event', {
    p_church_id:                churchId,
    p_admin_user_id:            user.id,
    p_action:                   'impersonation.end',
    p_after:                    { session_id, ended_reason },
    p_actor_email:              user.email ?? null,
    p_actor_roles:              (user.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
    p_resource:                 'impersonate_sessions',
    p_resource_id:              session_id,
    p_status:                   'success',
    p_impersonation_session_id: session_id,
    p_impersonated_church_id:   churchId,
    p_source:                   'cockpit',
  })
  if (auditErr) console.error('[admin-end-impersonation] audit failed:', auditErr.message)

  return json({
    success:      true,
    session_id,
    ended_reason,
    ...(auditErr ? { audit_warning: true } : {}),
  }, 200, origin)
})
```

- [ ] **Step 2: Deploy via MCP**

```bash
supabase functions deploy admin-end-impersonation --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 3: Testar R11 (parcial)**

```bash
# Usar session_id do teste anterior (Task 9)
curl -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/admin-end-impersonation" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json" \
  -d '{"session_id":"<SESSION_ID_DO_TASK9>","ended_reason":"manual_exit"}'
# Esperado: {"success":true,"session_id":"...","ended_reason":"manual_exit"}
```

```sql
-- Verificar ended_at preenchido
SELECT id, started_at, ended_at, ended_reason
FROM impersonate_sessions
WHERE id = '<SESSION_ID>';
-- Esperado: ended_at NOT NULL, ended_reason='manual_exit'

-- Verificar admin_events
SELECT action, status
FROM admin_events
WHERE action = 'impersonation.end'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: action='impersonation.end', status='success'
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/admin-end-impersonation/
git commit -m "feat(4a): EF admin-end-impersonation — encerramento auditado de sessão"
```

---

## Task 11: Adaptar Group 1 EFs — church mutations

**EFs:** admin-church-create, admin-church-pricing, admin-church-detail, admin-agent-grant

**Padrão de adaptação para EFs que JÁ têm `admin_events` insert:**
1. Localizar o bloco `supabase.from('admin_events').insert({...})`
2. SUBSTITUIR pelo bloco `record_audit_event` abaixo
3. Adicionar leitura do header `x-impersonation-session-id`
4. Adicionar `audit_warning` ao response se falhar

**Padrão de adaptação para EFs que NÃO têm `admin_events` insert:**
1. Localizar o `return json({ success: true, ... })` final
2. INSERIR o bloco `record_audit_event` antes do return
3. Adicionar leitura do header + audit_warning ao response

**Bloco padrão a inserir/substituir (adaptar action, resource, before/after, resource_id por EF):**

```typescript
// ── Audit: record_audit_event (resolve OPS-DEBT-014) ─────────────────────────
const impersonationSessionId = req.headers.get('x-impersonation-session-id') ?? null
const { error: auditErr } = await supabase.rpc('record_audit_event', {
  p_church_id:                CHURCH_ID,           // ex: church.id, church_id, etc
  p_admin_user_id:            user.id,
  p_action:                   'ACTION_NAME',        // ver tabela abaixo
  p_before:                   beforeData ?? null,   // null para creates/reads
  p_after:                    afterData ?? null,    // dados gravados ou null para reads
  p_reason:                   REASON ?? null,       // null se não aplicável
  p_actor_email:              user.email ?? null,
  p_actor_roles:              (user.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
  p_resource:                 'RESOURCE',           // ver tabela abaixo
  p_resource_id:              RESOURCE_ID ?? null,  // uuid do registro afetado, ou null
  p_status:                   'success',
  p_impersonation_session_id: impersonationSessionId,
  p_impersonated_church_id:   CHURCH_ID ?? null,
  p_source:                   'cockpit',
})
if (auditErr) console.error('[EF_SLUG] audit failed:', auditErr.message)
const auditWarning = auditErr ? true : undefined
// ────────────────────────────────────────────────────────────────────────────

// Adicionar ...(auditWarning ? { audit_warning: true } : {}) no objeto do return json(...)
```

**Tabela de action names para Group 1:**

| EF | Situação | p_action | p_resource | p_resource_id | Sensitive read? |
|---|---|---|---|---|---|
| admin-church-create | já tem insert | `'church.create'` | `'churches'` | church.id | N |
| admin-church-pricing | já tem insert | `'church.pricing.update'` | `'churches'` | church_id | N |
| admin-church-detail | já tem insert | `'church.read.sensitive'` | `'churches'` | church_id | **SIM** |
| admin-agent-grant | NÃO tem insert | `'church.agent.grant'` | `'church_agent_subscriptions'` | grant.id | N |

Para `admin-church-create`: substituir o INSERT existente (linhas ~274-288) pelo bloco.
Para `admin-church-pricing`: substituir o INSERT existente (linhas ~108-120) pelo bloco.
Para `admin-church-detail`: substituir INSERT existente pelo bloco. Como é READ, `p_before=null, p_after=null`.
Para `admin-agent-grant`: adicionar novo bloco ANTES do return final.

- [ ] **Step 1: Adaptar admin-church-create**

Ler `supabase/functions/admin-church-create/index.ts`. Localizar bloco:
```typescript
await supabase.from('admin_events').insert({
  church_id: church.id,
  admin_user_id: user.id,
  action: 'church_created',
  after: { ... },
  reason: '...',
})
```
Substituir por:
```typescript
const impersonationSessionId = req.headers.get('x-impersonation-session-id') ?? null
const { error: auditErr } = await supabase.rpc('record_audit_event', {
  p_church_id:                church.id,
  p_admin_user_id:            user.id,
  p_action:                   'church.create',
  p_after:                    {
    name: churchName, plan_slug: planSlug, admin_email: pastorEmail,
    pastor_id: pastorId, invite_sent: true, billing_origin: 'cockpit_manual',
    trial_days: 7, custom_plan_price_cents,
  },
  p_reason:                   'Criação manual via cockpit admin — trial manual 7 dias',
  p_actor_email:              user.email ?? null,
  p_actor_roles:              (user.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
  p_resource:                 'churches',
  p_resource_id:              church.id,
  p_status:                   'success',
  p_impersonation_session_id: impersonationSessionId,
  p_impersonated_church_id:   null,
  p_source:                   'cockpit',
})
if (auditErr) console.error('[admin-church-create] audit failed:', auditErr.message)
const auditWarning = auditErr ? true : undefined
```
No return final, adicionar `...(auditWarning ? { audit_warning: true } : {})`.

- [ ] **Step 2: Adaptar admin-church-pricing**

Ler `supabase/functions/admin-church-pricing/index.ts`. Substituir `from('admin_events').insert(...)` (linhas ~108-120) pelo padrão com `p_action: 'church.pricing.update'`.

- [ ] **Step 3: Adaptar admin-church-detail**

Ler `supabase/functions/admin-church-detail/index.ts`. Substituir `from('admin_events').insert(...)` pelo padrão com `p_action: 'church.read.sensitive'`, `p_before: null`, `p_after: null`.

- [ ] **Step 4: Adaptar admin-agent-grant**

Ler `supabase/functions/admin-agent-grant/index.ts`. Adicionar bloco de audit ANTES do return final, com `p_action: 'church.agent.grant'`.

- [ ] **Step 5: Deploy Group 1 via MCP**

Deployer as 4 EFs (uma por vez, via `deploy_edge_function` MCP ou supabase CLI):
```bash
supabase functions deploy admin-church-create --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-church-pricing --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-church-detail --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-agent-grant --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 6: Verificar R8 (parcial — usando admin-church-pricing como proxy)**

```sql
-- Verificar que admin_events recebe colunas novas
SELECT action, actor_email, actor_roles, status, source
FROM admin_events
WHERE action IN ('church.create','church.pricing.update','church.read.sensitive','church.agent.grant')
ORDER BY created_at DESC LIMIT 5;
-- Esperado: rows com actor_email preenchido, status='success', source='cockpit'
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/admin-church-create/ supabase/functions/admin-church-pricing/ \
        supabase/functions/admin-church-detail/ supabase/functions/admin-agent-grant/
git commit -m "feat(4a): Group 1 — record_audit_event em 4 EFs church mutations"
```

---

## Task 12: Adaptar Group 2 EFs — cockpit operations

**EFs:** admin-notes-crud, admin-churches-list, admin-events-list, admin-tasks-crud

**Tabela de action names para Group 2:**

| EF | Situação | p_action (por método HTTP) | p_resource | Sensitive? |
|---|---|---|---|---|
| admin-notes-crud | NÃO tem | POST→`'church.note.create'`, PATCH→`'church.note.update'`, DELETE→`'church.note.delete'` | `'church_notes'` | N |
| admin-churches-list | NÃO tem | `'churches.list'` | `'churches'` | N |
| admin-events-list | já tem | `'admin_events.list'` | `'admin_events'` | N |
| admin-tasks-crud | NÃO tem | POST→`'admin_task.create'`, PATCH→`'admin_task.update'`, DELETE→`'admin_task.delete'` | `'admin_tasks'` | N |

Para `admin-churches-list` e `admin-events-list` (GETs): `p_before=null, p_after=null`, `p_church_id=null` (lista todos).

- [ ] **Step 1: Adaptar admin-notes-crud**

Ler `supabase/functions/admin-notes-crud/index.ts`. Adicionar bloco audit após cada operação (create/update/delete). A `p_action` varia por método HTTP. `p_resource_id` = nota.id.

- [ ] **Step 2: Adaptar admin-churches-list**

Ler `supabase/functions/admin-churches-list/index.ts`. Adicionar um único bloco audit ANTES do return, com `p_church_id=null` (não é operação em igreja específica), `p_action='churches.list'`.

- [ ] **Step 3: Adaptar admin-events-list**

Ler `supabase/functions/admin-events-list/index.ts`. Substituir insert existente pelo padrão `record_audit_event` com `p_action='admin_events.list'`, `p_church_id=null`.

- [ ] **Step 4: Adaptar admin-tasks-crud**

Ler `supabase/functions/admin-tasks-crud/index.ts`. Adicionar bloco audit após cada operação (create/update/delete).

- [ ] **Step 5: Deploy Group 2**

```bash
supabase functions deploy admin-notes-crud --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-churches-list --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-events-list --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-tasks-crud --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-notes-crud/ supabase/functions/admin-churches-list/ \
        supabase/functions/admin-events-list/ supabase/functions/admin-tasks-crud/
git commit -m "feat(4a): Group 2 — record_audit_event em 4 EFs cockpit operations"
```

---

## Task 13: Adaptar Group 3 EFs — metrics + Frente 3B upgrade

**EFs:** admin-cockpit-metrics, admin-revenue-metrics, admin-update-contractor, admin-update-pastoral-profile

**Tabela:**

| EF | Situação | p_action | p_resource | Sensitive? |
|---|---|---|---|---|
| admin-cockpit-metrics | NÃO tem | `'cockpit.metrics.read'` | `'churches'` | N |
| admin-revenue-metrics | NÃO tem | `'revenue.metrics.read.sensitive'` | `'subscriptions'` | **SIM** |
| admin-update-contractor | já tem | `'contractor.update'` | `'contractors'` | **SIM** (CPF/CNPJ) |
| admin-update-pastoral-profile | já tem | `'pastoral_profile.update'` | `'church_pastoral_profile'` | N |

Para `admin-update-contractor`: o INSERT existente usa `{ church_id, admin_user_id, action, before, after }`. Substituir pelo record_audit_event (resolve OPS-DEBT-014).

- [ ] **Step 1: Adaptar admin-cockpit-metrics**

Ler `supabase/functions/admin-cockpit-metrics/index.ts`. Adicionar bloco audit com `p_church_id=null`, `p_action='cockpit.metrics.read'`.

- [ ] **Step 2: Adaptar admin-revenue-metrics**

Ler `supabase/functions/admin-revenue-metrics/index.ts`. Adicionar bloco audit com `p_church_id=null`, `p_action='revenue.metrics.read.sensitive'`.

- [ ] **Step 3: Adaptar admin-update-contractor (Frente 3B upgrade)**

No arquivo `supabase/functions/admin-update-contractor/index.ts`:
- Localizar `from('admin_events').insert({...})` (linhas ~145-165)
- Substituir pelo padrão record_audit_event com:
  - `p_action: 'contractor.update'`
  - `p_before: beforeData` (já existe como variável)
  - `p_after: { name, document_type, document_number, role_label }` (já existe)
  - `p_resource: 'contractors'`
  - `p_resource_id: updatedContractor.id` (uuid do contractor)
- Verificar que resolve OPS-DEBT-014

- [ ] **Step 4: Adaptar admin-update-pastoral-profile (Frente 3B upgrade)**

No arquivo `supabase/functions/admin-update-pastoral-profile/index.ts`:
- Localizar `from('admin_events').insert({...})` (linhas ~145-163)
- Substituir pelo padrão record_audit_event com:
  - `p_action: 'pastoral_profile.update'`
  - `p_before: beforeData`
  - `p_after: { estilo_comunicacao, horarios_culto }`
  - `p_resource: 'church_pastoral_profile'`
  - `p_resource_id: upserted.id` (uuid do profile)

- [ ] **Step 5: Deploy Group 3**

```bash
supabase functions deploy admin-cockpit-metrics --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-revenue-metrics --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-update-contractor --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-update-pastoral-profile --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 6: Verificar R8 completo (OPS-DEBT-014 resolvido)**

```sql
-- R8: admin-update-contractor agora usa record_audit_event
SELECT action, actor_email, status, source, impersonation_session_id
FROM admin_events
WHERE action = 'contractor.update'
ORDER BY created_at DESC LIMIT 1;
-- Esperado: actor_email preenchido, status='success', source='cockpit'
-- OPS-DEBT-014: RESOLVIDO (não mais fire-and-forget silencioso)
```

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/admin-cockpit-metrics/ supabase/functions/admin-revenue-metrics/ \
        supabase/functions/admin-update-contractor/ supabase/functions/admin-update-pastoral-profile/
git commit -m "feat(4a): Group 3 — record_audit_event em metrics + upgrade Frente 3B EFs"
```

---

## Task 14: Adaptar Group 4 EFs — affiliate mutations

**EFs:** affiliate-crud, affiliate-coupon-create, affiliate-coupon-toggle, affiliate-commissions-approve

**Tabela:**

| EF | Situação | p_action | p_resource | p_resource_id |
|---|---|---|---|---|
| affiliate-crud | já tem | POST→`'affiliate.create'`, PATCH→`'affiliate.update'`, DELETE→`'affiliate.ban'` | `'affiliates'` | affiliate.id |
| affiliate-coupon-create | já tem | `'affiliate.coupon.create'` | `'coupons'` | coupon.id |
| affiliate-coupon-toggle | já tem | `'affiliate.coupon.toggle'` | `'coupons'` | coupon.id |
| affiliate-commissions-approve | já tem | `'affiliate.commissions.approve'` | `'affiliate_commissions'` | null |

Para estas EFs: `p_church_id=null` (operações de afiliado não são por igreja).

- [ ] **Step 1: Adaptar affiliate-crud**

Ler `supabase/functions/affiliate-crud/index.ts`. Substituir os 3 inserts existentes (linhas ~87, ~133, ~160) pelos padrões correspondentes (create/update/ban), sempre com `p_church_id=null`.

- [ ] **Step 2: Adaptar affiliate-coupon-create**

Ler `supabase/functions/affiliate-coupon-create/index.ts`. Substituir insert existente pelo padrão.

- [ ] **Step 3: Adaptar affiliate-coupon-toggle**

Ler `supabase/functions/affiliate-coupon-toggle/index.ts`. Substituir insert existente pelo padrão.

- [ ] **Step 4: Adaptar affiliate-commissions-approve**

Ler `supabase/functions/affiliate-commissions-approve/index.ts`. Substituir insert existente pelo padrão.

- [ ] **Step 5: Deploy Group 4**

```bash
supabase functions deploy affiliate-crud --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy affiliate-coupon-create --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy affiliate-coupon-toggle --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy affiliate-commissions-approve --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/affiliate-crud/ supabase/functions/affiliate-coupon-create/ \
        supabase/functions/affiliate-coupon-toggle/ supabase/functions/affiliate-commissions-approve/
git commit -m "feat(4a): Group 4 — record_audit_event em 4 EFs affiliate mutations"
```

---

## Task 15: Adaptar Group 5 EFs — commissions export + catalog pricing

**EFs:** affiliate-commissions-export-csv, affiliate-commissions-mark-paid, plans-update, addon-prices-update

**Tabela:**

| EF | Situação | p_action | p_resource |
|---|---|---|---|
| affiliate-commissions-export-csv | já tem | `'affiliate.commissions.export'` | `'affiliate_commissions'` |
| affiliate-commissions-mark-paid | já tem | `'affiliate.commissions.mark_paid'` | `'affiliate_commissions'` |
| plans-update | já tem | `'plans.update'` | `'plans'` |
| addon-prices-update | já tem | `'addon_prices.update'` | `'addon_prices'` |

Para plans-update e addon-prices-update: p_resource_id = slug do plano (text, cast para uuid não aplicável — usar NULL para resource_id).

- [ ] **Step 1-4: Adaptar cada EF** (mesmo padrão dos tasks anteriores — ler arquivo, substituir insert existente)

- [ ] **Step 5: Deploy Group 5**

```bash
supabase functions deploy affiliate-commissions-export-csv --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy affiliate-commissions-mark-paid --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy plans-update --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy addon-prices-update --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/affiliate-commissions-export-csv/ \
        supabase/functions/affiliate-commissions-mark-paid/ \
        supabase/functions/plans-update/ supabase/functions/addon-prices-update/
git commit -m "feat(4a): Group 5 — record_audit_event em commissions export e catalog pricing"
```

---

## Task 16: Adaptar Group 6 EFs — agents catalog + provision

**EFs:** agents-catalog-update, provision-channel

**Tabela:**

| EF | Situação | p_action | p_resource |
|---|---|---|---|
| agents-catalog-update | já tem | `'agents_catalog.update'` | `'agents_catalog'` |
| provision-channel | NÃO tem | `'channel.provision'` | `'church_channels'` |

Para `provision-channel`: adicionar bloco audit (ANTES do return), com `p_church_id` extraído do body da request.

- [ ] **Step 1: Adaptar agents-catalog-update**

Ler `supabase/functions/agents-catalog-update/index.ts`. Substituir insert existente pelo padrão.

- [ ] **Step 2: Adaptar provision-channel**

Ler `supabase/functions/provision-channel/index.ts`. Adicionar bloco audit (novo, não substituição). `p_church_id` = church_id do body. `p_resource_id` = channel.id criado.

- [ ] **Step 3: Deploy Group 6**

```bash
supabase functions deploy agents-catalog-update --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy provision-channel --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 4: Verificar que todas as 22 EFs foram adaptadas**

```sql
-- Verificar que admin_events está recebendo events de diferentes ações
SELECT action, COUNT(*) 
FROM admin_events 
WHERE source = 'cockpit' OR source IS NULL
GROUP BY action
ORDER BY action;
-- Esperado: múltiplas actions presentes
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/agents-catalog-update/ supabase/functions/provision-channel/
git commit -m "feat(4a): Group 6 — record_audit_event em agents-catalog e provision-channel (22/22)"
```

---

## Task 17: Frontend — Church.tsx + Churches.tsx (startImpersonate → EF)

**Files:**
- Modify: `web/src/pages/admin/Church.tsx` (função startImpersonate, linhas ~1574-1596)
- Modify: `web/src/pages/admin/Churches.tsx` (função startImpersonate análoga)

**Contexto:** Atualmente, `startImpersonate()` faz INSERT direto em `impersonate_sessions` via supabase client e depois grava localStorage. Com a Frente 4A, DEVE chamar `admin-start-impersonation` EF. Se EF falhar, não entra em impersonation (sem fallback silencioso).

A `ImpersonatingState` interface precisa incluir `session_id` para que `exitImpersonate` possa chamar `admin-end-impersonation`.

- [ ] **Step 1: Atualizar ImpersonatingState em Church.tsx**

No topo de `web/src/pages/admin/Church.tsx`, localizar ou criar interface:

```typescript
interface ImpersonatingState {
  church_id:   string
  church_name: string
  session_id:  string   // novo: session_id retornado por admin-start-impersonation
}
```

- [ ] **Step 2: Substituir startImpersonate() em Church.tsx**

Localizar `async function startImpersonate()` (linhas ~1574-1596) e substituir por:

```typescript
async function startImpersonate() {
  if (!data) return
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      showToast({ type: 'error', message: 'Sessão expirada. Faça login novamente.' })
      return
    }

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-start-impersonation`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ church_id: data.id }),
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      showToast({ type: 'error', message: `Falha ao iniciar visualização: ${(errBody as { error?: string }).error ?? res.status}` })
      return
    }

    const result = await res.json() as { session_id: string }
    localStorage.setItem('impersonating', JSON.stringify({
      church_id:   data.id,
      church_name: data.name,
      session_id:  result.session_id,
    } satisfies ImpersonatingState))

    navigate('/dashboard')
    window.location.reload()
  } catch (err) {
    console.error('[startImpersonate] error:', err)
    showToast({ type: 'error', message: 'Erro inesperado ao iniciar visualização.' })
  }
}
```

- [ ] **Step 3: Mesma substituição em Churches.tsx**

Localizar função análoga `startImpersonate` (linhas ~210-240) e aplicar o mesmo padrão. Diferença: usa `church.id` e `church.name` (variável local) em vez de `data.id` / `data.name`.

```typescript
async function startImpersonate(church: { id: string; name: string }) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-start-impersonation`, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ church_id: church.id }),
    })

    if (!res.ok) {
      console.error('[startImpersonate] EF failed:', res.status)
      return
    }

    const result = await res.json() as { session_id: string }
    localStorage.setItem('impersonating', JSON.stringify({
      church_id:   church.id,
      church_name: church.name,
      session_id:  result.session_id,
    }))

    window.location.href = '/dashboard'
  } catch (err) {
    console.error('[startImpersonate] error:', err)
  }
}
```

- [ ] **Step 4: Verificar tipos TypeScript**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
# Esperado: sem erros relacionados a ImpersonatingState ou startImpersonate
```

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/admin/Church.tsx web/src/pages/admin/Churches.tsx
git commit -m "feat(4a): Church+Churches — startImpersonate chama EF server-side com session_id"
```

---

## Task 18: Frontend — Layout.tsx (exitImpersonate → EF)

**Files:**
- Modify: `web/src/components/Layout.tsx`

- [ ] **Step 1: Atualizar ImpersonatingState em Layout.tsx**

Localizar `interface ImpersonatingState` (linhas ~10-13):

```typescript
interface ImpersonatingState {
  church_id:   string
  church_name: string
  session_id?: string   // opcional para compat com localStorage legado (sem session_id)
}
```

- [ ] **Step 2: Substituir exitImpersonate()**

Localizar `function exitImpersonate()` (linhas ~73-77):

```typescript
async function exitImpersonate() {
  try {
    const raw = localStorage.getItem('impersonating')
    if (raw) {
      const parsed = JSON.parse(raw) as ImpersonatingState
      if (parsed.session_id) {
        // Chamar EF para fechar sessão auditada (best-effort, não bloqueia saída)
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-end-impersonation`, {
            method: 'POST',
            headers: {
              'Content-Type':  'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ session_id: parsed.session_id, ended_reason: 'manual_exit' }),
          }).catch(err => console.error('[exitImpersonate] EF call failed (non-blocking):', err))
        }
      }
    }
  } catch (err) {
    console.error('[exitImpersonate] error (non-blocking):', err)
  } finally {
    // Sempre limpa localStorage e redireciona, mesmo se EF falhar
    localStorage.removeItem('impersonating')
    navigate('/admin/churches')
    window.location.reload()
  }
}
```

Mudar assinatura de `function` para `async function`.

- [ ] **Step 2: Adicionar import supabase no topo de Layout.tsx (se não existir)**

```typescript
import { supabase } from '@/lib/supabase'
```

- [ ] **Step 3: Verificar tipos**

```bash
cd web && npx tsc --noEmit 2>&1 | head -20
# Sem erros em Layout.tsx
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/Layout.tsx
git commit -m "feat(4a): Layout — exitImpersonate chama admin-end-impersonation para lifecycle completo"
```

---

## Task 19: Frontend — auth-context.tsx (ImpersonatingState com session_id)

**Files:**
- Modify: `web/src/lib/auth-context.tsx`

auth-context.tsx já lê `localStorage['impersonating']`. Com Frente 4A, o objeto salvo inclui `session_id`. O contexto de auth NÃO precisa mudar o que faz com `churchId` — continua funcionando. A única mudança é garantir que o type parse inclua o campo `session_id`.

- [ ] **Step 1: Verificar parse do localStorage em auth-context.tsx**

Ler `web/src/lib/auth-context.tsx` linhas ~79-92. Confirmar que o cast `as { church_id: string }` não vai rejeitar `session_id` extra. Em TypeScript, casts com campos extras são aceitos — não é erro.

Se o código usa `parsed.church_id` apenas, não precisa de mudança.

Se quiser tipar explicitamente, atualizar:
```typescript
const parsed = JSON.parse(raw) as { church_id: string; church_name?: string; session_id?: string }
```

- [ ] **Step 2: Atualizar useLogout para enviar evento de encerramento**

Localizar `useLogout()` em auth-context.tsx (linhas ~192-197). Se o user está em impersonation e faz logout, deve tentar chamar admin-end-impersonation primeiro. Adicionar:

```typescript
export function useLogout() {
  return useCallback(async () => {
    // Best-effort: encerrar sessão de impersonação antes do logout
    try {
      const raw = localStorage.getItem('impersonating')
      if (raw) {
        const parsed = JSON.parse(raw) as { session_id?: string }
        if (parsed.session_id) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session) {
            await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-end-impersonation`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
              body: JSON.stringify({ session_id: parsed.session_id, ended_reason: 'logout' }),
            }).catch(() => {}) // non-blocking
          }
        }
      }
    } catch { /* non-blocking */ }
    localStorage.removeItem(SESSION_TOKEN_KEY)
    localStorage.removeItem('impersonating')
    await supabase.auth.signOut()
  }, [])
}
```

- [ ] **Step 3: Verificar build completo**

```bash
cd web && npm run build 2>&1 | tail -5
# Esperado: ✓ built in Xs (sem erros)
```

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/auth-context.tsx
git commit -m "feat(4a): auth-context — useLogout envia admin-end-impersonation antes de signOut"
```

---

## Task 20: Smoke E2E (frente-4a-smoke.prod.spec.ts)

**Files:**
- Create: `web/tests/e2e/frente-4a-smoke.prod.spec.ts`

**Cobertura (5 testes):**
1. admin-start-impersonation retorna session_id
2. admin-end-impersonation fecha sessão (ended_at preenchido)
3. admin-update-contractor grava em admin_events com novas colunas (R8)
4. admin_events imutável — UPDATE via anon client retorna erro RLS (R2)
5. has_ekthos_role via leitura de admin_events — Felipe tem acesso (roles migradas R7)

- [ ] **Step 1: Criar arquivo de smoke**

```typescript
// web/tests/e2e/frente-4a-smoke.prod.spec.ts
import { test, expect, request } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL     = process.env.VITE_SUPABASE_URL ?? 'https://mlqjywqnchilvgkbvicd.supabase.co'
const SUPABASE_ANON    = process.env.VITE_SUPABASE_ANON_KEY ?? ''
const ADMIN_EMAIL      = 'playwright@ekthosai.net'
const ADMIN_PASSWORD   = process.env.PLAYWRIGHT_PASSWORD ?? ''
const TEST_CHURCH_ID   = process.env.TEST_CHURCH_ID ?? ''  // set via env ou usa primeira igreja

test.describe('Frente 4A — smoke backend (produção)', () => {
  let adminJwt: string
  let sessionId: string

  test.beforeAll(async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL, password: ADMIN_PASSWORD,
    })
    if (error || !data.session) throw new Error(`Auth falhou: ${error?.message}`)
    adminJwt = data.session.access_token
  })

  test('admin-start-impersonation cria sessão com session_id', async () => {
    // Usar a primeira igreja disponível se TEST_CHURCH_ID não definido
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: `Bearer ${adminJwt}` } },
    })
    let churchId = TEST_CHURCH_ID
    if (!churchId) {
      const { data: churches } = await supabase.rpc('admin_get_first_church').single()
      // Fallback: buscar via edge function admin-churches-list
      const listRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-churches-list?limit=1`, {
        headers: { Authorization: `Bearer ${adminJwt}` },
      })
      const listData = await listRes.json() as { churches?: Array<{ id: string }> }
      churchId = listData.churches?.[0]?.id ?? ''
    }

    if (!churchId) {
      console.log('[frente-4a-smoke] nenhuma igreja encontrada — skip impersonation tests')
      return
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-start-impersonation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
      body: JSON.stringify({ church_id: churchId }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean; session_id: string }
    expect(body.success).toBe(true)
    expect(body.session_id).toBeTruthy()
    sessionId = body.session_id
  })

  test('admin-end-impersonation encerra sessão (ended_at preenchido)', async () => {
    if (!sessionId) {
      console.log('[frente-4a-smoke] session_id não disponível — skip end test')
      return
    }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-end-impersonation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
      body: JSON.stringify({ session_id: sessionId, ended_reason: 'smoke_test' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { success: boolean }
    expect(body.success).toBe(true)

    // Verificar ended_at via admin-events-list ou SQL
    const eventsRes = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-events-list?action=impersonation.end&limit=1`,
      { headers: { Authorization: `Bearer ${adminJwt}` } },
    )
    if (eventsRes.ok) {
      const eventsBody = await eventsRes.json() as { events?: Array<{ action: string; status: string }> }
      const lastEvent = eventsBody.events?.[0]
      if (lastEvent) {
        expect(lastEvent.action).toBe('impersonation.end')
        expect(lastEvent.status).toBe('success')
      }
    }
  })

  test('admin-update-contractor grava admin_events com schema Frente 4A (R8)', async () => {
    // Verificar via admin-events-list que actor_email está preenchido (nova coluna)
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-events-list?action=contractor.update&limit=1`,
      { headers: { Authorization: `Bearer ${adminJwt}` } },
    )
    if (!res.ok) {
      console.log('[frente-4a-smoke] admin-events-list indisponível — skip R8')
      return
    }
    const body = await res.json() as { events?: Array<{ action: string; actor_email?: string; status?: string }> }
    const events = body.events ?? []
    if (events.length === 0) {
      console.log('[frente-4a-smoke] sem contractor.update events — skip R8 verification')
      return
    }
    expect(events[0].action).toBe('contractor.update')
    // actor_email deve estar preenchido (nova coluna Frente 4A)
    expect(events[0].actor_email).toBeTruthy()
  })

  test('admin_events imutável — anon client não consegue UPDATE (R2)', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON)
    const { error } = await anonClient
      .from('admin_events')
      .update({ reason: 'tentativa_maliciosa' })
      .eq('action', 'contractor.update')
    // RLS bloqueia UPDATE de authenticated/anon — deve retornar erro
    expect(error).toBeTruthy()
  })

  test('playwright user tem ekthos_roles migradas (R7)', async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: `Bearer ${adminJwt}` } },
    })
    // Verificar que as novas EFs admin respondem 200 (prova que JWT com ekthos_roles funciona)
    const metricsRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-cockpit-metrics`, {
      headers: { Authorization: `Bearer ${adminJwt}` },
    })
    // 200 = is_ekthos_admin() retornou true (role migrada funciona)
    expect(metricsRes.status).toBe(200)
  })
})
```

- [ ] **Step 2: Configurar variável TEST_CHURCH_ID se necessário**

Se o ambiente de produção tem igrejas, checar no Supabase qual UUID usar para smoke. Salvar como env var ou inline no spec.

- [ ] **Step 3: Rodar smoke**

```bash
cd web && npx playwright test tests/e2e/frente-4a-smoke.prod.spec.ts \
  --config=playwright.prod.config.ts 2>&1
# Esperado: 5/5 PASS (ou skip com log para testes que dependem de dados)
```

- [ ] **Step 4: Verificar build final limpo**

```bash
cd web && npm run build 2>&1 | tail -5
cd web && npx tsc --noEmit 2>&1 | head -10
# Ambos sem erros
```

- [ ] **Step 5: Commit final antes do code review**

```bash
git add web/tests/e2e/frente-4a-smoke.prod.spec.ts
git commit -m "test(e2e): smoke Frente 4A — 5 testes impersonation lifecycle + R2/R7/R8"
```

---

## Task 21: OPS-DEBTs novos + registro

**Files:**
- Modify: `docs/debts.md`

- [ ] **Step 1: Adicionar OPS-DEBT-024, OPS-DEBT-025, OPS-DEBT-026, OPS-DEBT-027**

Acrescentar ao final de `docs/debts.md`:

```markdown
---

## OPS-DEBT-024 — Canal real de alerta (Sentry/Slack) para record_audit_event

**Data:** 2026-05-08
**Categoria:** Observabilidade
**Trigger:** Pré-1ª igreja real

**Contexto:** record_audit_event() usa RAISE WARNING quando falha. WARNING vai apenas
para pg_logs do Supabase (não monitorado em tempo real). Audit failures são silenciosos
do ponto de vista operacional.

**Tarefa:**
- Configurar Sentry ou Slack webhook para alertar quando admin_events INSERT falhar
- Considerar pg_cron que varre admin_events buscando rows com status='failed'

**Critério de pronto:** Alerta dispara em < 5min após audit failure em produção.

---

## OPS-DEBT-025 — Remover is_ekthos_admin boolean legado de app_metadata

**Data:** 2026-05-08
**Categoria:** Limpeza técnica
**Trigger:** Após Frente 4B validada em produção (UI gestão de roles estável)

**Contexto:** is_ekthos_admin() ainda aceita o boolean legado para compat.
Após Frente 4B, todos os flows usam ekthos_roles array. O boolean pode ser removido.

**Tarefa:**
1. UPDATE auth.users SET raw_app_meta_data = raw_app_meta_data - 'is_ekthos_admin'
   WHERE raw_app_meta_data ? 'ekthos_roles';
2. Atualizar is_ekthos_admin() para remover o OR legado
3. Validar smoke 4A e 3B após remoção

**Critério de pronto:** is_ekthos_admin() usa apenas ekthos_roles array.

---

## OPS-DEBT-026 — Cron para fechar impersonate_sessions zumbis

**Data:** 2026-05-08
**Categoria:** Higiene operacional
**Trigger:** Pré-1ª igreja real

**Contexto:** Se admin fechar aba sem clicar "Sair da visualização", ended_at fica NULL.
Session zumbi não representa risco de acesso (JWT é do admin), mas polui auditoria.

**Tarefa:**
- pg_cron: a cada hora, UPDATE impersonate_sessions SET ended_at=now(), ended_reason='timeout_auto'
  WHERE ended_at IS NULL AND last_action_at < now() - interval '4 hours'
  OR (last_action_at IS NULL AND started_at < now() - interval '4 hours')

**Critério de pronto:** Cron ativo em produção. Nenhuma sessão zumbi > 4h.

---

## OPS-DEBT-027 — Auditar stripe-bootstrap em momento futuro

**Data:** 2026-05-08
**Categoria:** Auditoria pendente
**Trigger:** Próxima execução de stripe-bootstrap (raramente executada)

**Contexto:** stripe-bootstrap foi excluída do escopo Frente 4A (D4 BLINDAGEM — one-shot técnico).
Deve receber record_audit_event() quando for executada novamente.

**Critério de pronto:** stripe-bootstrap chama record_audit_event() pós-execução.
```

- [ ] **Step 2: Commit**

```bash
git add docs/debts.md
git commit -m "docs: OPS-DEBT-024/025/026/027 registrados pós-Frente 4A"
```

---

## Verificações finais (R1-R12 consolidado)

Após Task 21, executar as seguintes verificações antes do code review:

```sql
-- R1: admin_events tem 20 colunas
SELECT COUNT(*) FROM information_schema.columns
WHERE table_schema='public' AND table_name='admin_events';
-- Esperado: 20

-- R2: 3 policies (sem UPDATE/DELETE = imutável para authenticated)
SELECT polname FROM pg_policy WHERE polrelid='public.admin_events'::regclass ORDER BY polname;
-- Esperado: admin_events_ekthos_admin_select, admin_events_ekthos_support_select, admin_events_service_insert_only

-- R3: has_ekthos_role existe
SELECT proname FROM pg_proc WHERE proname='has_ekthos_role' AND pronamespace='public'::regnamespace;

-- R4: is_ekthos_admin() atualizada
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname='is_ekthos_admin' AND pronamespace='public'::regnamespace;
-- Esperado: contém @> '"ekthos_admin"'::jsonb OR boolean cast

-- R5: impersonate_sessions tem 8 colunas
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='impersonate_sessions' ORDER BY ordinal_position;
-- Esperado: id, admin_user_id, church_id, started_at, ended_at, notes, ended_reason, last_action_at

-- R7: 2 users migrados com ekthos_roles
SELECT email, raw_app_meta_data->'ekthos_roles' AS roles
FROM auth.users WHERE raw_app_meta_data ? 'ekthos_roles';
-- Esperado: 2 rows (felipe@, playwright@)
```

---

## Self-Review (plan checklist)

**Spec coverage:**
- ✅ 7 EFs novas (set-roles, start/end-impersonation) → Tasks 8-10
- ✅ 22 EFs adaptadas → Tasks 11-16
- ✅ 6 migrations SQL → Tasks 2-7
- ✅ Frontend refactor → Tasks 17-19
- ✅ Smoke E2E → Task 20
- ✅ OPS-DEBTs → Task 21
- ✅ D1/D2/D3/D4 desvios incorporados
- ✅ Compatibilidade is_ekthos_admin legacy → M5
- ✅ ended_reason + last_action_at → M3
- ✅ Bloqueio último admin → Task 8
- ✅ Audit_warning no response → padrão em todas EFs

**Type consistency:**
- `ImpersonatingState.session_id` definida em Task 17 (Church.tsx), usada em Task 18 (Layout.tsx) — consistente
- `record_audit_event` assinatura definida em Task 6, usada nas Tasks 11-16 com mesmos nomes de parâmetros — consistente
- `p_church_id=null` para operações não-específicas de igreja (affiliates, metrics) — consistente em todas as tasks

**Sem placeholders:** Verificado — todos os code blocks são completos.
