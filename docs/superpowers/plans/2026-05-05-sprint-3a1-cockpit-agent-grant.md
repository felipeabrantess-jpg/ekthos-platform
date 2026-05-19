# Sprint 3A.1 — Habilitação de Agente Premium via Cockpit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que o admin Ekthos habilite um agente premium para uma igreja via cockpit, nos modos Cortesia (gratuito permanente), Trial (X dias com expiração automática) e Pago (pagamento externo confirmado manualmente).

**Architecture:** Nova tabela `agent_grants` com `church_id` direto (sem depender de `subscription_id`), 2 RPCs SECURITY DEFINER (`admin_grant_agent`, `admin_revoke_agent`) + 1 query helper (`admin_list_grantable_agents`), nova Edge Function `admin-agent-grant`, modal no frontend `Church.tsx` aba Operação, e pg_cron para expirar trials. Não altera `subscription_agents` existente — convive em paralelo.

**Tech Stack:** Supabase Postgres 15, Deno Edge Functions (TypeScript), React + TypeScript (Vite), Tailwind CSS, Supabase JS v2, pg_cron, Lucide React icons.

---

## Contexto do codebase (ler antes de implementar)

- **Projeto Supabase:** `mlqjywqnchilvgkbvicd`
- **Deploy EF:** `supabase functions deploy NOME --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt`
- **`verify_jwt: false`** em TODAS as EFs — validação manual de JWT no código
- **`is_ekthos_admin()`** — função SQL que verifica `(auth.jwt() -> 'app_metadata' ->> 'is_ekthos_admin')::boolean`
- **Migrations idempotentes** — sempre `IF NOT EXISTS` / `DO $$ IF NOT EXISTS $$`
- **`agents_catalog`** — tabela real com colunas: `slug` (PK), `name`, `pricing_tier`, `price_cents`, `active`, `category`
- **`subscription_agents`** — tabela existente, FK obrigatória para `subscriptions.id`, sem `church_id` direto — NÃO modificar
- **`grant_access()`** — RPC existente para grants de PLANO (não agente) — NÃO usar para este sprint
- **Modal pattern** — `Modal` component em `web/src/components/ui/Modal.tsx` com props `open, onClose, title, children, size`
- **`ChurchDetail` interface** — em `web/src/pages/admin/Church.tsx` linha 13, campo `agents: Array<{ id: string; name: string; status: string; calls_30d: number }>`
- **Branch de trabalho:** `feat/sprint-3a1-cockpit-agent-grant` (criar antes de começar)
- **NUNCA commitar sem Felipe autorizar**

---

## File Map

```
supabase/migrations/
  20260505210001_agent_grants_table.sql        CREATE — tabela + trigger + RLS + pg_cron
  20260505210002_agent_grants_rpcs.sql         CREATE — 3 RPCs SECURITY DEFINER

supabase/functions/
  admin-agent-grant/index.ts                   CREATE — EF POST handler grant/revoke

web/src/pages/admin/
  Church.tsx                                   MODIFY — tipo ChurchDetail, TabOperacao, modal

web/src/components/admin/
  ModalHabilitarAgente.tsx                     CREATE — modal de habilitação
```

---

## Task 1: Migração — `agent_grants` table, trigger, RLS, pg_cron

**Files:**
- Create: `supabase/migrations/20260505210001_agent_grants_table.sql`

- [ ] **Step 1: Criar arquivo de migração**

Crie o arquivo com o conteúdo abaixo. Cada bloco é idempotente.

```sql
-- ============================================================
-- Sprint 3A.1 — agent_grants: grants de agente via cockpit admin
-- Separado de subscription_agents (que exige subscription_id FK).
-- Convive em paralelo. church_id direto.
-- ============================================================

-- 1. Tabela principal
CREATE TABLE IF NOT EXISTS public.agent_grants (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id                 uuid        NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  agent_slug                varchar(100) NOT NULL REFERENCES public.agents_catalog(slug) ON DELETE CASCADE,
  grant_type                varchar(50)  NOT NULL,
  granted_by                uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  starts_at                 timestamptz NOT NULL DEFAULT now(),
  ends_at                   timestamptz,
  active                    boolean     NOT NULL DEFAULT true,
  notes                     text,
  stripe_payment_intent_id  varchar(200),
  revoked_at                timestamptz,
  revoked_by                uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT chk_ag_grant_type CHECK (grant_type IN ('trial', 'courtesy', 'paid')),
  CONSTRAINT chk_ag_trial_ends_at CHECK (grant_type <> 'trial' OR ends_at IS NOT NULL),
  CONSTRAINT chk_ag_ends_after_starts CHECK (ends_at IS NULL OR ends_at > starts_at),
  UNIQUE (church_id, agent_slug)
);

-- 2. Índices
CREATE INDEX IF NOT EXISTS idx_agent_grants_church_active
  ON public.agent_grants (church_id, active, starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_agent_grants_ends_at
  ON public.agent_grants (ends_at)
  WHERE active = true AND ends_at IS NOT NULL;

-- 3. Trigger updated_at (reutiliza função existente set_updated_at)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_agent_grants_updated_at'
  ) THEN
    CREATE TRIGGER trg_agent_grants_updated_at
      BEFORE UPDATE ON public.agent_grants
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- 4. RLS
ALTER TABLE public.agent_grants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'agent_grants_admin_all' AND tablename = 'agent_grants'
  ) THEN
    CREATE POLICY agent_grants_admin_all ON public.agent_grants
      FOR ALL
      TO authenticated
      USING (is_ekthos_admin())
      WITH CHECK (is_ekthos_admin());
  END IF;
END $$;

-- 5. pg_cron: expirar trials todo hora cheia
SELECT cron.schedule(
  'expire-agent-grants',
  '0 * * * *',
  $$
    UPDATE public.agent_grants
    SET    active     = false,
           updated_at = now()
    WHERE  active     = true
      AND  ends_at    IS NOT NULL
      AND  ends_at    <= now();
  $$
) ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Aplicar migração via MCP**

Use a ferramenta `mcp__supabase__apply_migration` com:
- `project_id = "mlqjywqnchilvgkbvicd"`
- `name = "agent_grants_table"`
- `query = <conteúdo acima>`

Resultado esperado: sem erros. Se `cron.schedule` falhar (extensão não habilitada), aplicar separadamente com `SELECT cron.unschedule('expire-agent-grants'); SELECT cron.schedule(...)`.

- [ ] **Step 3: Verificar tabela criada**

Execute via MCP `execute_sql`:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'agent_grants'
ORDER BY ordinal_position;
```

Resultado esperado: 14 colunas listadas (id, church_id, agent_slug, ..., updated_at).

- [ ] **Step 4: Verificar RLS ativa**

```sql
SELECT relrowsecurity FROM pg_class WHERE relname = 'agent_grants';
```

Resultado esperado: `t` (true).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260505210001_agent_grants_table.sql
git commit -m "chore(db): Sprint 3A.1 — agent_grants table + RLS + pg_cron expire trial"
```

---

## Task 2: Migração — RPCs `admin_grant_agent`, `admin_revoke_agent`, `admin_list_grantable_agents`

**Files:**
- Create: `supabase/migrations/20260505210002_agent_grants_rpcs.sql`

- [ ] **Step 1: Criar arquivo de migração com os 3 RPCs**

```sql
-- ============================================================
-- Sprint 3A.1 — RPCs de habilitação de agente via cockpit
-- ============================================================

-- 1. admin_grant_agent — cria ou atualiza grant para uma igreja
CREATE OR REPLACE FUNCTION public.admin_grant_agent(
  p_church_id                 uuid,
  p_agent_slug                text,
  p_grant_type                text,
  p_duration_days             integer  DEFAULT NULL,
  p_notes                     text     DEFAULT NULL,
  p_stripe_payment_intent_id  text     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ends_at   timestamptz;
  v_grant_id  uuid;
BEGIN
  -- Auth: apenas admin Ekthos
  IF NOT is_ekthos_admin() THEN
    RAISE EXCEPTION 'unauthorized: admin only';
  END IF;

  -- Validar grant_type
  IF p_grant_type NOT IN ('trial', 'courtesy', 'paid') THEN
    RAISE EXCEPTION 'grant_type inválido: %. Use trial, courtesy ou paid.', p_grant_type;
  END IF;

  -- Trial exige duration_days > 0
  IF p_grant_type = 'trial' THEN
    IF p_duration_days IS NULL OR p_duration_days <= 0 THEN
      RAISE EXCEPTION 'trial exige duration_days maior que zero';
    END IF;
    v_ends_at := now() + (p_duration_days || ' days')::interval;
  END IF;

  -- Verificar que o agente existe e está ativo
  IF NOT EXISTS (
    SELECT 1 FROM agents_catalog WHERE slug = p_agent_slug AND active = true
  ) THEN
    RAISE EXCEPTION 'agent_slug inválido ou inativo: %', p_agent_slug;
  END IF;

  -- Verificar que a igreja existe
  IF NOT EXISTS (SELECT 1 FROM churches WHERE id = p_church_id) THEN
    RAISE EXCEPTION 'church_id inválido: %', p_church_id;
  END IF;

  -- Upsert: se já existe grant para esta church+agent, atualiza
  INSERT INTO agent_grants (
    church_id,
    agent_slug,
    grant_type,
    granted_by,
    ends_at,
    notes,
    stripe_payment_intent_id,
    active,
    revoked_at,
    revoked_by
  ) VALUES (
    p_church_id,
    p_agent_slug,
    p_grant_type,
    auth.uid(),
    v_ends_at,
    p_notes,
    p_stripe_payment_intent_id,
    true,
    NULL,
    NULL
  )
  ON CONFLICT (church_id, agent_slug) DO UPDATE SET
    grant_type               = EXCLUDED.grant_type,
    granted_by               = EXCLUDED.granted_by,
    ends_at                  = EXCLUDED.ends_at,
    notes                    = EXCLUDED.notes,
    stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
    active                   = true,
    revoked_at               = NULL,
    revoked_by               = NULL,
    starts_at                = now(),
    updated_at               = now()
  RETURNING id INTO v_grant_id;

  RETURN jsonb_build_object('ok', true, 'grant_id', v_grant_id);
END;
$$;

-- 2. admin_revoke_agent — revoga grant ativo
CREATE OR REPLACE FUNCTION public.admin_revoke_agent(
  p_church_id  uuid,
  p_agent_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_ekthos_admin() THEN
    RAISE EXCEPTION 'unauthorized: admin only';
  END IF;

  UPDATE agent_grants
  SET    active     = false,
         revoked_at = now(),
         revoked_by = auth.uid(),
         updated_at = now()
  WHERE  church_id  = p_church_id
    AND  agent_slug = p_agent_slug
    AND  active     = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'grant não encontrado ou já inativo para church_id=% agent_slug=%',
      p_church_id, p_agent_slug;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- 3. admin_list_grantable_agents — catálogo + status de grant para uma igreja
CREATE OR REPLACE FUNCTION public.admin_list_grantable_agents(p_church_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_ekthos_admin() THEN
    RAISE EXCEPTION 'unauthorized: admin only';
  END IF;

  RETURN (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'slug',         ac.slug,
        'name',         ac.name,
        'pricing_tier', ac.pricing_tier,
        'price_cents',  ac.price_cents,
        'category',     ac.category,
        'grant', CASE
          WHEN ag.id IS NOT NULL THEN jsonb_build_object(
            'id',         ag.id,
            'grant_type', ag.grant_type,
            'active',     ag.active,
            'starts_at',  ag.starts_at,
            'ends_at',    ag.ends_at,
            'notes',      ag.notes
          )
          ELSE NULL
        END
      )
      ORDER BY ac.name
    ), '[]'::jsonb)
    FROM agents_catalog ac
    LEFT JOIN agent_grants ag
      ON  ag.agent_slug = ac.slug
      AND ag.church_id  = p_church_id
      AND ag.active     = true
    WHERE ac.active = true
  );
END;
$$;

-- Grants de execução para admin autenticado
GRANT EXECUTE ON FUNCTION public.admin_grant_agent       TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_agent      TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_grantable_agents TO authenticated;
```

- [ ] **Step 2: Aplicar migração via MCP**

Use `mcp__supabase__apply_migration` com `name = "agent_grants_rpcs"` e o conteúdo acima.

- [ ] **Step 3: Testar RPC `admin_grant_agent` via MCP execute_sql**

```sql
-- Executar como service_role (bypassa is_ekthos_admin check)
SELECT public.admin_grant_agent(
  '62e473b8-cd39-4da2-aa5d-c296b03d6873'::uuid,  -- Igreja Teste
  'agent-acolhimento',
  'courtesy',
  NULL,
  'Teste Sprint 3A.1',
  NULL
);
```

Resultado esperado: `{"ok": true, "grant_id": "<uuid>"}`.

- [ ] **Step 4: Verificar registro criado**

```sql
SELECT id, church_id, agent_slug, grant_type, active, starts_at, ends_at, notes
FROM agent_grants
WHERE church_id = '62e473b8-cd39-4da2-aa5d-c296b03d6873';
```

Resultado esperado: 1 linha com `grant_type=courtesy`, `active=true`, `ends_at=NULL`.

- [ ] **Step 5: Testar RPC `admin_revoke_agent`**

```sql
SELECT public.admin_revoke_agent(
  '62e473b8-cd39-4da2-aa5d-c296b03d6873'::uuid,
  'agent-acolhimento'
);
```

Resultado esperado: `{"ok": true}`.

- [ ] **Step 6: Verificar revogado**

```sql
SELECT active, revoked_at FROM agent_grants
WHERE church_id = '62e473b8-cd39-4da2-aa5d-c296b03d6873' AND agent_slug = 'agent-acolhimento';
```

Resultado esperado: `active=false`, `revoked_at` preenchido.

- [ ] **Step 7: Testar `admin_list_grantable_agents`**

```sql
SELECT public.admin_list_grantable_agents('62e473b8-cd39-4da2-aa5d-c296b03d6873'::uuid);
```

Resultado esperado: array JSON com todos os agentes ativos do catálogo. O agente `agent-acolhimento` deve ter `grant=null` (foi revogado). Todos os outros também `grant=null`.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260505210002_agent_grants_rpcs.sql
git commit -m "chore(db): Sprint 3A.1 — admin_grant_agent, admin_revoke_agent, admin_list_grantable_agents RPCs"
```

---

## Task 3: Atualizar `admin-church-detail` EF para incluir `agent_grants`

**Files:**
- Modify: `supabase/functions/admin-church-detail/index.ts` — adicionar query de `agent_grants` e mesclar no response

- [ ] **Step 1: Ler o arquivo atual para entender a estrutura**

Leia `supabase/functions/admin-church-detail/index.ts`. A query de agentes está por volta das linhas 97–102:
```typescript
// Agentes ativos
supabase
  .from('subscription_agents')
  .select('agent_slug, source, active')
  .eq('church_id', churchId)
  .eq('active', true),
```

E o resultado é processado em ~linha 222:
```typescript
agents: (agentsRes.data ?? []).map(a => ({
  id:       a.agent_slug,
  name:     a.agent_slug,
  status:   a.active ? 'active' : 'inactive',
  calls_30d: 0,
})),
```

- [ ] **Step 2: Adicionar query de `agent_grants` no bloco Promise.all**

No bloco `Promise.all([...])`, adicione APÓS a query de `subscription_agents` (que já existe como `agentsRes`):

```typescript
// Agent grants (cockpit-granted — sem subscription_id)
supabase
  .from('agent_grants')
  .select('agent_slug, grant_type, ends_at, starts_at, active')
  .eq('church_id', churchId)
  .eq('active', true),
```

No destructuring do `Promise.all`, adicione `agentGrantsRes` na posição correspondente. O `Promise.all` terá uma posição a mais — ajuste o destructuring.

- [ ] **Step 3: Atualizar o bloco de montagem do response**

Substitua o bloco `agents:` existente (em torno da linha 222) por:

```typescript
// Mescla subscription_agents + agent_grants (sem duplicar por slug)
const subAgentSlugs = new Set((agentsRes.data ?? []).map((a: { agent_slug: string }) => a.agent_slug))
const grants = (agentGrantsRes.data ?? []) as Array<{
  agent_slug: string; grant_type: string; ends_at: string | null; starts_at: string; active: boolean
}>

agents: [
  ...(agentsRes.data ?? []).map((a: { agent_slug: string; active: boolean }) => ({
    id:          a.agent_slug,
    name:        a.agent_slug,
    status:      'active',
    calls_30d:   0,
    source:      'subscription' as const,
    grant_ends_at: null as null,
  })),
  ...grants
    .filter(g => !subAgentSlugs.has(g.agent_slug))
    .map(g => ({
      id:          g.agent_slug,
      name:        g.agent_slug,
      status:      'active' as const,
      calls_30d:   0,
      source:      g.grant_type as 'trial' | 'courtesy' | 'paid',
      grant_ends_at: g.ends_at,
    })),
],
```

- [ ] **Step 4: Verificar build da EF (compilação Deno)**

```bash
cd supabase/functions/admin-church-detail
deno check index.ts
```

Resultado esperado: sem erros de tipo.

- [ ] **Step 5: Deploy da EF**

```bash
supabase functions deploy admin-church-detail --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

Resultado esperado: `Deployed admin-church-detail`.

- [ ] **Step 6: Testar via curl**

```bash
curl -s "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/admin-church-detail?id=62e473b8-cd39-4da2-aa5d-c296b03d6873" \
  -H "Authorization: Bearer <token_admin_ekthos>" | jq '.agents'
```

Resultado esperado: array com pelo menos 1 item (o grant de cortesia que criamos no Step 3 da Task 2, se não foi revogado — recrie antes se necessário).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/admin-church-detail/index.ts
git commit -m "feat(cockpit): admin-church-detail inclui agent_grants na listagem de agentes"
```

---

## Task 4: Nova Edge Function `admin-agent-grant`

**Files:**
- Create: `supabase/functions/admin-agent-grant/index.ts`

A EF aceita `POST` com body `{ church_id, agent_slug, grant_type, duration_days?, notes?, stripe_payment_intent_id? }` e `DELETE` com body `{ church_id, agent_slug }` para revogar.

- [ ] **Step 1: Criar diretório e arquivo**

```bash
mkdir -p supabase/functions/admin-agent-grant
```

- [ ] **Step 2: Criar `supabase/functions/admin-agent-grant/index.ts`**

```typescript
// supabase/functions/admin-agent-grant/index.ts
// Sprint 3A.1 — Grant/Revoke de agente premium via cockpit admin
// verify_jwt: false — validação manual abaixo

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function cors(req: Request) {
  const origin = req.headers.get('origin') ?? ''
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = cors(req)

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    return json({ error: 'Method not allowed' }, 405)
  }

  // 1. Validar JWT do usuário admin
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.replace('Bearer ', '').trim()
  if (!token) return json({ error: 'unauthorized: missing token' }, 401)

  // Verificar identidade com anon key + token do usuário
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
  if (authErr || !user) return json({ error: 'unauthorized: invalid token' }, 401)

  // Verificar admin Ekthos
  const meta = user.app_metadata ?? {}
  if (!meta['is_ekthos_admin']) return json({ error: 'forbidden: not ekthos admin' }, 403)

  // 2. Ler body
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'body JSON inválido' }, 400)
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  // ── DELETE = Revogar ──────────────────────────────────────
  if (req.method === 'DELETE') {
    const { church_id, agent_slug } = body
    if (!church_id || !agent_slug) {
      return json({ error: 'church_id e agent_slug são obrigatórios' }, 400)
    }

    const { data, error } = await supabaseAdmin.rpc('admin_revoke_agent', {
      p_church_id:  church_id,
      p_agent_slug: agent_slug,
    })
    if (error) return json({ error: error.message }, 400)
    return json(data, 200)
  }

  // ── POST = Habilitar ──────────────────────────────────────
  const {
    church_id,
    agent_slug,
    grant_type,
    duration_days,
    notes,
    stripe_payment_intent_id,
  } = body

  if (!church_id)  return json({ error: 'church_id é obrigatório' }, 400)
  if (!agent_slug) return json({ error: 'agent_slug é obrigatório' }, 400)
  if (!grant_type) return json({ error: 'grant_type é obrigatório' }, 400)

  if (!['trial', 'courtesy', 'paid'].includes(grant_type as string)) {
    return json({ error: 'grant_type deve ser trial, courtesy ou paid' }, 400)
  }

  if (grant_type === 'trial' && (!duration_days || Number(duration_days) <= 0)) {
    return json({ error: 'trial exige duration_days > 0' }, 400)
  }

  const { data, error } = await supabaseAdmin.rpc('admin_grant_agent', {
    p_church_id:                church_id,
    p_agent_slug:               agent_slug,
    p_grant_type:               grant_type,
    p_duration_days:            duration_days ? Number(duration_days) : null,
    p_notes:                    notes ?? null,
    p_stripe_payment_intent_id: stripe_payment_intent_id ?? null,
  })

  if (error) return json({ error: error.message }, 400)
  return json(data, 201)
})
```

- [ ] **Step 3: Deploy**

```bash
supabase functions deploy admin-agent-grant --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

Resultado esperado: `Deployed admin-agent-grant`.

- [ ] **Step 4: Teste via curl — habilitar cortesia**

Obtenha um access_token do admin Ekthos (`felipe@ekthosai.net` / `Ekthos2026!`) e execute:

```bash
curl -s -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/admin-agent-grant" \
  -H "Authorization: Bearer <ACCESS_TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "church_id":  "62e473b8-cd39-4da2-aa5d-c296b03d6873",
    "agent_slug": "agent-acolhimento",
    "grant_type": "courtesy",
    "notes":      "Teste Sprint 3A.1 cortesia"
  }'
```

Resultado esperado: `{"ok": true, "grant_id": "<uuid>"}` com status 201.

- [ ] **Step 5: Teste — habilitar trial 14 dias**

```bash
curl -s -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/admin-agent-grant" \
  -H "Authorization: Bearer <ACCESS_TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "church_id":    "62e473b8-cd39-4da2-aa5d-c296b03d6873",
    "agent_slug":   "agent-reengajamento",
    "grant_type":   "trial",
    "duration_days": 14,
    "notes":        "Teste Sprint 3A.1 trial"
  }'
```

Resultado esperado: `{"ok": true, "grant_id": "<uuid>"}`. Verificar no banco: `ends_at` deve ser `now() + 14 days`.

- [ ] **Step 6: Teste — tentativa sem admin (deve retornar 403)**

```bash
curl -s -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/admin-agent-grant" \
  -H "Authorization: Bearer <TOKEN_PASTOR_NAO_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"church_id": "...", "agent_slug": "agent-acolhimento", "grant_type": "courtesy"}'
```

Resultado esperado: `{"error": "forbidden: not ekthos admin"}` com status 403.

- [ ] **Step 7: Teste — revogar via DELETE**

```bash
curl -s -X DELETE "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/admin-agent-grant" \
  -H "Authorization: Bearer <ACCESS_TOKEN_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{
    "church_id":  "62e473b8-cd39-4da2-aa5d-c296b03d6873",
    "agent_slug": "agent-acolhimento"
  }'
```

Resultado esperado: `{"ok": true}`.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/admin-agent-grant/index.ts
git commit -m "feat(agent-grant): EF admin-agent-grant POST/DELETE para habilitar/revogar agentes"
```

---

## Task 5: Frontend — componente `ModalHabilitarAgente`

**Files:**
- Create: `web/src/components/admin/ModalHabilitarAgente.tsx`

O modal usa o componente `Modal` existente em `web/src/components/ui/Modal.tsx`. Permite selecionar agente, tipo de grant e submeter. Exibe estado de loading e erro.

- [ ] **Step 1: Criar diretório se não existir**

```bash
mkdir -p web/src/components/admin
```

- [ ] **Step 2: Criar `web/src/components/admin/ModalHabilitarAgente.tsx`**

```tsx
// web/src/components/admin/ModalHabilitarAgente.tsx
// Sprint 3A.1 — Modal de habilitação de agente premium
import { useState, useEffect, useCallback } from 'react'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/ui/Modal'

// ── Tipos ──────────────────────────────────────────────────

interface GrantablAgent {
  slug:         string
  name:         string
  pricing_tier: string
  price_cents:  number
  category:     string
  grant: {
    id:         string
    grant_type: string
    active:     boolean
    starts_at:  string
    ends_at:    string | null
    notes:      string | null
  } | null
}

interface Props {
  open:      boolean
  onClose:   () => void
  churchId:  string
  onSuccess: () => void  // chamado após grant criado — pai recarrega dados
}

type GrantType = 'courtesy' | 'trial' | 'paid'

const GRANT_LABELS: Record<GrantType, { label: string; desc: string; color: string }> = {
  courtesy: { label: 'Cortesia',       desc: 'Gratuito permanente. Sem cobrança.',                     color: '#2D7A4F' },
  trial:    { label: 'Trial',          desc: 'Gratuito por X dias, expira automaticamente.',            color: '#C4841D' },
  paid:     { label: 'Pago (manual)',  desc: 'Confirmar pagamento externo via Stripe. Informe o PI ID.', color: '#2B6CB0' },
}

function fmtBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

// ── Componente ─────────────────────────────────────────────

export default function ModalHabilitarAgente({ open, onClose, churchId, onSuccess }: Props) {
  const [agents,      setAgents]      = useState<GrantablAgent[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [listError,   setListError]   = useState<string | null>(null)

  const [selectedSlug,   setSelectedSlug]   = useState<string>('')
  const [grantType,      setGrantType]      = useState<GrantType>('courtesy')
  const [durationDays,   setDurationDays]   = useState<string>('14')
  const [notes,          setNotes]          = useState<string>('')
  const [stripePI,       setStripePI]       = useState<string>('')

  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [saveOk,     setSaveOk]     = useState(false)

  // Carregar catálogo quando modal abre
  useEffect(() => {
    if (!open || !churchId) return
    setLoadingList(true)
    setListError(null)
    setSelectedSlug('')
    setGrantType('courtesy')
    setDurationDays('14')
    setNotes('')
    setStripePI('')
    setSaveError(null)
    setSaveOk(false)

    supabase.rpc('admin_list_grantable_agents', { p_church_id: churchId })
      .then(({ data, error }) => {
        if (error) { setListError(error.message); return }
        // data é um array JSON retornado como jsonb — pode ser string ou array
        const list: GrantablAgent[] = Array.isArray(data) ? data : JSON.parse(data as string) ?? []
        setAgents(list)
      })
      .finally(() => setLoadingList(false))
  }, [open, churchId])

  const selectedAgent = agents.find(a => a.slug === selectedSlug)
  const alreadyGranted = selectedAgent?.grant?.active === true

  const handleSubmit = useCallback(async () => {
    if (!selectedSlug) { setSaveError('Selecione um agente.'); return }
    if (grantType === 'trial' && (!durationDays || Number(durationDays) <= 0)) {
      setSaveError('Informe quantos dias de trial.'); return
    }
    if (grantType === 'paid' && !stripePI.trim()) {
      setSaveError('Informe o Stripe Payment Intent ID.'); return
    }

    setSaving(true)
    setSaveError(null)
    setSaveOk(false)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) { setSaveError('Sessão inválida — recarregue a página.'); setSaving(false); return }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-agent-grant`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            church_id:                churchId,
            agent_slug:               selectedSlug,
            grant_type:               grantType,
            duration_days:            grantType === 'trial' ? Number(durationDays) : undefined,
            notes:                    notes.trim() || undefined,
            stripe_payment_intent_id: grantType === 'paid' ? stripePI.trim() : undefined,
          }),
        }
      )
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setSaveError(json.error ?? 'Erro ao habilitar agente.')
        return
      }
      setSaveOk(true)
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1200)
    } catch (e: unknown) {
      setSaveError((e as Error).message ?? 'Erro de rede.')
    } finally {
      setSaving(false)
    }
  }, [selectedSlug, grantType, durationDays, notes, stripePI, churchId, onSuccess, onClose])

  return (
    <Modal open={open} onClose={onClose} title="Habilitar Agente" size="md">
      {/* Modal.tsx já provê px-6 py-4 no wrapper — não adicionar padding extra */}
      <div className="space-y-5">

        {/* Loading catálogo */}
        {loadingList && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" />
            Carregando catálogo de agentes…
          </div>
        )}

        {listError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            <AlertCircle size={16} />
            {listError}
          </div>
        )}

        {/* Selector de agente */}
        {!loadingList && !listError && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Agente
            </label>
            <select
              value={selectedSlug}
              onChange={e => setSelectedSlug(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#e13500]/30"
            >
              <option value="">Selecione um agente…</option>
              {agents.map(a => (
                <option key={a.slug} value={a.slug} disabled={a.grant?.active === true}>
                  {a.name}
                  {a.pricing_tier === 'always_paid' ? ` (${fmtBRL(a.price_cents)}/mês)` : ' (Free)'}
                  {a.grant?.active ? ' — já habilitado' : ''}
                </option>
              ))}
            </select>
            {alreadyGranted && (
              <p className="text-xs text-amber-600">
                ⚠️ Este agente já está habilitado para esta igreja. Habilitar novamente substituirá o grant atual.
              </p>
            )}
          </div>
        )}

        {/* Tipo de grant */}
        {selectedSlug && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Modo de habilitação
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(GRANT_LABELS) as [GrantType, typeof GRANT_LABELS[GrantType]][]).map(([type, meta]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setGrantType(type)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    grantType === type
                      ? 'border-current'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                  style={{ borderColor: grantType === type ? meta.color : undefined }}
                >
                  <p className="text-sm font-semibold" style={{ color: meta.color }}>{meta.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{meta.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Duração (trial) */}
        {selectedSlug && grantType === 'trial' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Duração do trial (dias)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={durationDays}
              onChange={e => setDurationDays(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30"
              placeholder="Ex: 14"
            />
          </div>
        )}

        {/* Stripe PI (paid) */}
        {selectedSlug && grantType === 'paid' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Stripe Payment Intent ID
            </label>
            <input
              type="text"
              value={stripePI}
              onChange={e => setStripePI(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#e13500]/30"
              placeholder="pi_3abc..."
            />
          </div>
        )}

        {/* Notas */}
        {selectedSlug && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Notas internas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#e13500]/30"
              placeholder="Ex: Demo para onboarding, trocado por plano antigo…"
            />
          </div>
        )}

        {/* Erro */}
        {saveError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            <AlertCircle size={16} />
            {saveError}
          </div>
        )}

        {/* Sucesso */}
        {saveOk && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3">
            <CheckCircle2 size={16} />
            Agente habilitado com sucesso!
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !selectedSlug || loadingList}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: '#e13500' }}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Habilitando…
              </span>
            ) : 'Habilitar agente'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 3: Verificar build do frontend**

```bash
cd web && npm run build 2>&1 | tail -20
```

Resultado esperado: sem erros de TypeScript no novo componente.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/admin/ModalHabilitarAgente.tsx
git commit -m "feat(cockpit): ModalHabilitarAgente — trial/courtesy/paid"
```

---

## Task 6: Integrar modal em `Church.tsx` — TabOperacao + botão Revogar

**Files:**
- Modify: `web/src/pages/admin/Church.tsx`

- [ ] **Step 1: Atualizar interface `ChurchDetail` para incluir campos de grant**

Na interface `ChurchDetail` (linha ~13), campo `agents` já é:
```typescript
agents: Array<{ id: string; name: string; status: string; calls_30d: number }>
```

Substitua por:
```typescript
agents: Array<{
  id:            string
  name:          string
  status:        string
  calls_30d:     number
  source?:       'subscription' | 'trial' | 'courtesy' | 'paid'
  grant_ends_at?: string | null
}>
```

- [ ] **Step 2: Adicionar import do modal e estado**

No topo do arquivo, adicione o import:
```typescript
import ModalHabilitarAgente from '@/components/admin/ModalHabilitarAgente'
```

- [ ] **Step 3: Atualizar `TabOperacao` para suportar modal e botão Revogar**

`TabOperacao` atualmente recebe apenas `{ data: ChurchDetail }`. Precisamos passar também `onReload` (para recarregar após grant) e estado do modal. Mas `TabOperacao` é um componente interno sem acesso ao state de reload — precisamos elevar o modal para o componente pai ou passar props.

Altere a assinatura de `TabOperacao`:
```typescript
function TabOperacao({
  data,
  onAgentChange,
}: {
  data: ChurchDetail
  onAgentChange: () => void
}) {
```

Adicione estado interno no `TabOperacao`:
```typescript
const [grantModalOpen,  setGrantModalOpen]  = useState(false)
const [revokingSlug,    setRevokingSlug]    = useState<string | null>(null)
const [revokeError,     setRevokeError]     = useState<string | null>(null)
```

- [ ] **Step 4: Implementar handleRevoke dentro de TabOperacao**

```typescript
async function handleRevoke(agentSlug: string) {
  if (!window.confirm(`Revogar acesso ao agente "${agentSlug}" para esta igreja?`)) return
  setRevokingSlug(agentSlug)
  setRevokeError(null)

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) { setRevokeError('Sessão inválida.'); setRevokingSlug(null); return }

  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-agent-grant`,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ church_id: data.id, agent_slug: agentSlug }),
      }
    )
    const json = await res.json()
    if (!res.ok || !json.ok) { setRevokeError(json.error ?? 'Erro ao revogar.'); return }
    onAgentChange()
  } catch (e: unknown) {
    setRevokeError((e as Error).message ?? 'Erro de rede.')
  } finally {
    setRevokingSlug(null)
  }
}
```

- [ ] **Step 5: Atualizar JSX do bloco de agentes em TabOperacao**

Substitua o `<div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">` do bloco de agentes (linhas ~210–240) por:

```tsx
<div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
  <div className="flex items-center justify-between mb-3">
    <h3 className="text-sm font-semibold text-gray-800">
      Agentes de IA ({data.agents.length})
    </h3>
    <button
      type="button"
      onClick={() => setGrantModalOpen(true)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
      style={{ background: '#e13500' }}
    >
      + Habilitar agente
    </button>
  </div>

  {revokeError && (
    <p className="text-xs text-red-600 mb-2">{revokeError}</p>
  )}

  {data.agents.length === 0 ? (
    <p className="text-sm text-gray-400 py-4 text-center">Nenhum agente configurado</p>
  ) : (
    <div className="space-y-2">
      {data.agents.map(a => (
        <div key={a.id} className="flex items-center gap-3 py-2 border-b border-black/[0.04] last:border-0">
          <Bot size={16} strokeWidth={1.75} className="text-gray-400 shrink-0" />
          <span className="flex-1 text-sm text-gray-700">{a.name}</span>

          {/* Badge de source */}
          {a.source && a.source !== 'subscription' && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
              a.source === 'trial'    ? 'bg-amber-50 text-amber-700' :
              a.source === 'courtesy' ? 'bg-emerald-50 text-emerald-700' :
              'bg-blue-50 text-blue-700'
            }`}>
              {a.source === 'trial'    ? `Trial${a.grant_ends_at ? ` até ${new Date(a.grant_ends_at).toLocaleDateString('pt-BR')}` : ''}` :
               a.source === 'courtesy' ? 'Cortesia' :
               'Pago manual'}
            </span>
          )}

          <span className="bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">
            Ativo
          </span>
          <span className="font-mono text-xs text-gray-400">{a.calls_30d} chamadas/30d</span>

          <Link
            to={`/admin/churches/${data.id}/agentes/${a.id}`}
            className="text-xs font-medium text-[#e13500] hover:underline flex items-center gap-1 ml-1"
          >
            Configurar →
          </Link>

          {/* Botão Revogar (só para grants manuais) */}
          {a.source && a.source !== 'subscription' && (
            <button
              type="button"
              onClick={() => handleRevoke(a.id)}
              disabled={revokingSlug === a.id}
              className="text-xs text-gray-400 hover:text-red-600 transition-colors ml-1 disabled:opacity-50"
              title="Revogar acesso"
            >
              {revokingSlug === a.id ? '…' : '✕'}
            </button>
          )}
        </div>
      ))}
    </div>
  )}

  {/* Modal */}
  <ModalHabilitarAgente
    open={grantModalOpen}
    onClose={() => setGrantModalOpen(false)}
    churchId={data.id}
    onSuccess={() => {
      setGrantModalOpen(false)
      onAgentChange()
    }}
  />
</div>
```

- [ ] **Step 6: Passar `onAgentChange` para TabOperacao no componente pai**

Em `web/src/pages/admin/Church.tsx`, função `AdminChurch`, linha ~807:
```typescript
{tab === 'operacao'   && <TabOperacao    data={data} />}
```

Substitua por:
```typescript
{tab === 'operacao'   && <TabOperacao    data={data} onAgentChange={load} />}
```

`load` é a função declarada na linha ~688 do `AdminChurch`:
```typescript
async function load() {
  if (!id) return
  setLoading(true)
  // ... fetch admin-church-detail ...
}
```

O padrão é idêntico ao usado em `TabPricing` e `TabNotas` que também recebem `onSaved={load}` (linhas 810–811).

- [ ] **Step 7: Build para verificar tipos**

```bash
cd web && npm run build 2>&1 | tail -30
```

Resultado esperado: zero erros de TypeScript.

- [ ] **Step 8: Commit**

```bash
git add web/src/pages/admin/Church.tsx web/src/components/admin/ModalHabilitarAgente.tsx
git commit -m "feat(cockpit): Church.tsx TabOperacao — botão Habilitar Agente + modal + Revogar"
```

---

## Checklist de validação final

Após todas as tasks, testar manualmente no preview Vercel:

- [ ] Abrir `/admin/churches/62e473b8-cd39-4da2-aa5d-c296b03d6873` aba Operação
- [ ] Ver botão "+ Habilitar agente" no header da seção de agentes
- [ ] Clicar → modal abre, catálogo carrega com agentes do `agents_catalog`
- [ ] Selecionar `agent-acolhimento`, modo **Cortesia** → submeter → agente aparece na lista com badge verde "Cortesia"
- [ ] Botão "✕" ao lado → `window.confirm` → revogar → agente desaparece
- [ ] Selecionar `agent-reengajamento`, modo **Trial** 7 dias → submeter → agente aparece com badge âmbar "Trial até DD/MM/AAAA"
- [ ] Modo **Pago** → campo PI ID aparece → submeter → agente aparece com badge azul "Pago manual"
- [ ] Tentar habilitar agente já habilitado → aviso de "já habilitado" na select option (disabled)
- [ ] Verificar no banco: `SELECT * FROM agent_grants WHERE church_id = '62e473b8-cd39-4da2-aa5d-c296b03d6873';`

---

## Push e PR

Após validação visual de Felipe:

```bash
git push origin feat/sprint-3a1-cockpit-agent-grant
```

Abrir PR manualmente em:
`https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...feat/sprint-3a1-cockpit-agent-grant?expand=1`

- Base: `main`
- Compare: `feat/sprint-3a1-cockpit-agent-grant`
- Título: `feat(cockpit): Sprint 3A.1 — Habilitação de Agente Premium via Cockpit`

**NUNCA push staging. NUNCA commit sem Felipe autorizar.**
