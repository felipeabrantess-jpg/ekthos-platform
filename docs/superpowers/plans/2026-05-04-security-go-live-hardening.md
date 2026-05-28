# Security Go-Live Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix C5 (CORS `*` → ALLOWED_ORIGIN), C6 (mask `error.message` in 4 admin EFs), and I5 (SET search_path em 15 funções SECURITY DEFINER).

**Architecture:** Three independent hardening vectors. C5/C6 são mudanças em Edge Functions (deploy obrigatório). I5 é migration SQL idempotente (CREATE OR REPLACE). Nenhuma quebra de contrato de API.

**Tech Stack:** Deno/TypeScript (Edge Functions), PostgreSQL/plpgsql (migration), Supabase MCP

---

## File Structure

| File | Action | Responsabilidade |
|------|--------|-----------------|
| `supabase/functions/_shared/errors.ts` | **Create** | Helper `jsonError()` que retorna `{ error: 'Internal server error' }` sem vazar `error.message` |
| `supabase/functions/agent-acolhimento/index.ts` | **Modify** lines 48-53 | Substituir `'*'` por `Deno.env.get('ALLOWED_ORIGIN') \|\| 'https://ekthos-platform.vercel.app'` |
| `supabase/functions/admin-notes-crud/index.ts` | **Modify** lines 69, 92, 109 | Substituir `error.message` por `jsonError()`, adicionar `console.error` |
| `supabase/functions/admin-churches-list/index.ts` | **Modify** line 79 | Substituir `error.message` por `jsonError()` |
| `supabase/functions/admin-events-list/index.ts` | **Modify** line 73 | Substituir `error.message` por `jsonError()` |
| `supabase/functions/admin-tasks-crud/index.ts` | **Modify** lines 75, 100, 127, 143 | Substituir `error.message` por `jsonError()`, adicionar `console.error` |
| `supabase/migrations/20260504100006_security_definer_search_path_hardening.sql` | **Create** | CREATE OR REPLACE das 15 funções SECURITY DEFINER com `SET search_path = public, extensions` |

---

## Task 1: Create `_shared/errors.ts`

**Files:**
- Create: `supabase/functions/_shared/errors.ts`

- [ ] **Step 1: Criar o helper**

```typescript
// supabase/functions/_shared/errors.ts
// Shared error helper for admin Edge Functions.
// NEVER expose error.message to the client — it leaks schema details.

export function jsonError(
  corsHeaders: Record<string, string>,
  status = 500,
): Response {
  return new Response(
    JSON.stringify({ error: 'Internal server error' }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/_shared/errors.ts
git commit -m "feat(security): add shared jsonError helper — masks error.message from clients"
```

---

## Task 2: C5 — Fix CORS `*` em agent-acolhimento

**Files:**
- Modify: `supabase/functions/agent-acolhimento/index.ts` lines 48-53

- [ ] **Step 1: Substituir CORS wildcard**

Substituir o bloco atual (linhas 48-53):
```typescript
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
```

Por:
```typescript
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'
const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}
```

- [ ] **Step 2: Verificar que não há outro `'*'` na função**

```bash
grep -n "'\*'" supabase/functions/agent-acolhimento/index.ts
# Expected: no output (zero matches)
```

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/agent-acolhimento/index.ts
git commit -m "fix(security/C5): replace CORS '*' with ALLOWED_ORIGIN in agent-acolhimento"
```

---

## Task 3: C6 — Mask error.message nas 4 admin EFs

**Files:**
- Modify: `supabase/functions/admin-notes-crud/index.ts`
- Modify: `supabase/functions/admin-churches-list/index.ts`
- Modify: `supabase/functions/admin-events-list/index.ts`
- Modify: `supabase/functions/admin-tasks-crud/index.ts`

### 3a: admin-notes-crud (linhas 69, 92, 109)

- [ ] **Step 1: Adicionar import do helper no topo do arquivo (após imports existentes)**

```typescript
import { jsonError } from '../_shared/errors.ts'
```

- [ ] **Step 2: Linha 69 — GET error**

Substituir:
```typescript
    return json({ error: error.message }, 500)
```
Por:
```typescript
    console.error('[admin-notes-crud] GET', error)
    return jsonError(CORS)
```

- [ ] **Step 3: Linha 92 — POST error**

Substituir:
```typescript
    return json({ error: error.message }, 500)
```
Por:
```typescript
    console.error('[admin-notes-crud] POST', error)
    return jsonError(CORS)
```

- [ ] **Step 4: Linha 109 — DELETE error**

Substituir:
```typescript
    return json({ error: error.message }, 500)
```
Por:
```typescript
    console.error('[admin-notes-crud] DELETE', error)
    return jsonError(CORS)
```

### 3b: admin-churches-list (linha 79)

- [ ] **Step 5: Adicionar import**

```typescript
import { jsonError } from '../_shared/errors.ts'
```

- [ ] **Step 6: Linha 79 — query error (já tem console.error na 78)**

Substituir:
```typescript
    return json({ error: error.message }, 500)
```
Por:
```typescript
    return jsonError(CORS)
```

### 3c: admin-events-list (linha 73)

- [ ] **Step 7: Adicionar import**

```typescript
import { jsonError } from '../_shared/errors.ts'
```

- [ ] **Step 8: Linha 73 — query error (já tem console.error na 72)**

Substituir:
```typescript
    return json({ error: error.message }, 500)
```
Por:
```typescript
    return jsonError(CORS)
```

### 3d: admin-tasks-crud (linhas 75, 100, 127, 143)

- [ ] **Step 9: Adicionar import**

```typescript
import { jsonError } from '../_shared/errors.ts'
```

- [ ] **Step 10: Linha 75 — GET error**

Substituir:
```typescript
    if (error) return json({ error: error.message }, 500)
```
Por:
```typescript
    if (error) { console.error('[admin-tasks-crud] GET', error); return jsonError(CORS) }
```

- [ ] **Step 11: Linha 100 — POST error**

Substituir:
```typescript
    if (error) return json({ error: error.message }, 500)
```
Por:
```typescript
    if (error) { console.error('[admin-tasks-crud] POST', error); return jsonError(CORS) }
```

- [ ] **Step 12: Linha 127 — PATCH error**

Substituir:
```typescript
    if (error) return json({ error: error.message }, 500)
```
Por:
```typescript
    if (error) { console.error('[admin-tasks-crud] PATCH', error); return jsonError(CORS) }
```

- [ ] **Step 13: Linha 143 — DELETE error**

Substituir:
```typescript
    if (error) return json({ error: error.message }, 500)
```
Por:
```typescript
    if (error) { console.error('[admin-tasks-crud] DELETE', error); return jsonError(CORS) }
```

- [ ] **Step 14: Verificar zero ocorrências de error.message nas 4 EFs**

```bash
grep -rn "error\.message" supabase/functions/admin-notes-crud/ supabase/functions/admin-churches-list/ supabase/functions/admin-events-list/ supabase/functions/admin-tasks-crud/
# Expected: no output
```

- [ ] **Step 15: Commit**

```bash
git add supabase/functions/admin-notes-crud/index.ts supabase/functions/admin-churches-list/index.ts supabase/functions/admin-events-list/index.ts supabase/functions/admin-tasks-crud/index.ts
git commit -m "fix(security/C6): mask error.message in 4 admin EFs — use shared jsonError helper"
```

---

## Task 4: I5 — Migration SET search_path para 15 funções SECURITY DEFINER

**Files:**
- Create: `supabase/migrations/20260504100006_security_definer_search_path_hardening.sql`

- [ ] **Step 1: Criar migration com as 15 funções**

Ver conteúdo completo abaixo. Cada função recebe `SET search_path = public, extensions` antes do `AS $$`.

- [ ] **Step 2: Apply migration via Supabase MCP**

```
mcp__supabase__apply_migration(name="security_definer_search_path_hardening", query=<conteúdo do arquivo>)
```

- [ ] **Step 3: Verificar zero funções sem search_path**

```sql
SELECT proname
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND NOT (p.proconfig IS NOT NULL AND array_to_string(p.proconfig, ',') LIKE '%search_path%');
-- Expected: 0 rows (apenas upsert_session_token já corrigido na 000005)
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260504100006_security_definer_search_path_hardening.sql
git commit -m "chore(db/I5): SET search_path = public, extensions em 15 funções SECURITY DEFINER"
```

---

## Task 5: Deploy Edge Functions

- [ ] **Step 1: Deploy agent-acolhimento (C5)**

```bash
supabase functions deploy agent-acolhimento --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 2: Deploy 4 admin EFs (C6)**

```bash
supabase functions deploy admin-notes-crud --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-churches-list --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-events-list --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
supabase functions deploy admin-tasks-crud --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

---

## Task 6: Verificações V1-V8

- [ ] **V1 — CORS: agent-acolhimento não retorna `*`**

```bash
curl -si -X OPTIONS "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/agent-acolhimento" \
  -H "Origin: https://ekthos-platform.vercel.app" \
  -H "Access-Control-Request-Method: POST" | grep -i "access-control-allow-origin"
# Expected: https://ekthos-platform.vercel.app (NOT *)
```

- [ ] **V2 — error.message: grep no repositório (zero ocorrências nas 4 EFs)**

```bash
grep -rn "error\.message" \
  supabase/functions/admin-notes-crud/ \
  supabase/functions/admin-churches-list/ \
  supabase/functions/admin-events-list/ \
  supabase/functions/admin-tasks-crud/
# Expected: 0 linhas
```

- [ ] **V3 — search_path: zero funções SECURITY DEFINER sem config**

```sql
SELECT proname FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' AND p.prosecdef = true
  AND NOT (p.proconfig IS NOT NULL AND array_to_string(p.proconfig, ',') LIKE '%search_path%');
-- Expected: 0 rows
```

- [ ] **V4 — upsert_session_token: ainda retorna 200**

```bash
curl -s -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/rest/v1/rpc/upsert_session_token" \
  -H "apikey: sb_publishable_-X0LP_4SrWjuC-WdE5Gdlw_ZqkxxuY1" \
  -H "Authorization: Bearer <pastor_jwt>" \
  -H "Content-Type: application/json" \
  -d '{"p_church_id": "<church_uuid>"}' | jq .
# Expected: token string (not error)
```

- [ ] **V5 — list_pending_activations: ainda funciona**

```sql
SELECT count(*) FROM public.list_pending_activations();
-- Expected: número >= 0 (sem erro)
```

- [ ] **V6 — CORS wildcard: zero ocorrências em EFs ativas**

```bash
grep -rn "'\\*'" supabase/functions/*/index.ts | grep "Allow-Origin"
# Expected: 0 linhas
```

- [ ] **V7 — Build frontend: zero erros TypeScript**

```bash
cd <repo_root> && npm run build 2>&1 | tail -5
# Expected: Build exitcode 0
```

- [ ] **V8 — Push e PR**

```bash
git push origin fix/security-go-live-hardening
# Open PR: https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...fix/security-go-live-hardening?expand=1
```
