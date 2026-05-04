# CORS Edge Functions Hardening — Patch Isolado

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **PASSO 2 EM DIANTE REQUER AUTORIZAÇÃO EXPLÍCITA DE FELIPE.** Passo 0+1 são auditoria — já executados. Não codar nada sem "ok, pode codar" do Felipe.

**Goal:** Corrigir CORS `'*'` em 6 Edge Functions (P1/P2/P3) sem quebrar a journey D+3 que dispara amanhã 05/05 às 18:49 BRT.

**Architecture:** EFs internas (dispatch-message, chatpro-send, zapi-send) recebem auth via `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` — padrão já usado no projeto. EFs de browser (test-whatsapp-message, conversation-send-message, conversation-handoff) validam JWT de usuário + ALLOWED_ORIGIN. A cadeia da journey D+3 usa `enqueue_message → channel_dispatch_queue → channel-dispatcher → chatpro-send`; channel-dispatcher deve ser atualizado no mesmo commit que chatpro-send para não quebrar a cadeia.

**Tech Stack:** Deno/TypeScript (Edge Functions), Supabase SDK, `supabase functions deploy --no-verify-jwt`

---

## ═══════════════════════════════════════════════
## PASSO 0 — RESULTADO DA AUDITORIA "QUEM CHAMA QUEM"
## ═══════════════════════════════════════════════

> Status: ✅ CONCLUÍDO (subagents Haiku executados em paralelo)

### Tabela de callers por EF

| EF | Frontend? | Outra EF? | n8n? | Tipo de fix |
|---|---|---|---|---|
| `test-whatsapp-message` | ✅ `AgentConfig.tsx:154` — Bearer user JWT | ❌ | ❌ | **A** — JWT + ALLOWED_ORIGIN |
| `dispatch-message` | ❌ | ✅ `stripe-webhook:324` (functions.invoke → Bearer service_role) · `agent-tools.ts:619` (Bearer service_role) | ❌ | **B** — sem CORS + validar service_role |
| `zapi-send` | ❌ | ❌ nenhum caller encontrado | ❌ | **B** — sem CORS + validar service_role |
| `chatpro-send` | ❌ | ✅ `dispatch-message:142` (SEM AUTH ❌) · `channel-dispatcher:83` (SEM AUTH ❌) | ❌ | **B** — sem CORS + validar service_role + **atualizar 2 callers** |
| `conversation-send-message` | ✅ `ConversationThread.tsx:157` — Bearer user JWT | ❌ | ❌ | **A** — só trocar `'*'` → ALLOWED_ORIGIN (JWT já existe) |
| `conversation-handoff` | ✅ `ConversationContext.tsx:99` — Bearer user JWT | ❌ | ❌ | **A** — só trocar `'*'` → ALLOWED_ORIGIN (JWT já existe) |

Tipos: A = só frontend → JWT + ALLOWED_ORIGIN · B = só EF interna → sem CORS + service_role Bearer

---

## ═══════════════════════════════════════════════
## PASSO 1 — AUDITORIA DE ENVS DISPONÍVEIS
## ═══════════════════════════════════════════════

> Status: ✅ CONCLUÍDO

| Env | Existe? | Como usado |
|---|---|---|
| `ALLOWED_ORIGIN` | ✅ | `Deno.env.get('ALLOWED_ORIGIN') \|\| 'https://ekthos-platform.vercel.app'` — 30+ EFs |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Disponível em toda EF via Supabase platform |
| `INTERNAL_FUNCTION_SECRET` | ❌ NÃO EXISTE | Não inventar — usar SUPABASE_SERVICE_ROLE_KEY |

**Padrão de auth interna existente no projeto:**
- `batch-resolve/index.ts:49`: `if (!authHeader.startsWith('Bearer '))` → valida presença
- `_shared/agent-tools.ts:619`: envia `Authorization: Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
- `stripe-webhook:324`: usa `supabase.functions.invoke()` → SDK injecta Bearer service_role automaticamente

**Decisão:** Usar `SUPABASE_SERVICE_ROLE_KEY` como secret de auth interna. Validar o valor completo (não só presença de Bearer).

---

## ═══════════════════════════════════════════════
## PASSO 5 — JOURNEY D+3 MAPEADA
## ═══════════════════════════════════════════════

> Status: ✅ MAPEADO (subagent Haiku)

**Cadeia exata:**
```
pg_cron → agent-acolhimento (index.ts)
  → executeTool('enqueue_message')     [agent-tools.ts:440-609]
  → INSERT conversation_messages       [agent-tools.ts:540-553]
  → INSERT channel_dispatch_queue      [agent-tools.ts:560-571]  ← PONTO CRÍTICO
  → [channel-dispatcher POLL]
  → channel-dispatcher/index.ts (ChatProAdapter)
  → fetch chatpro-send                 [channel-dispatcher:83]   ← SEM AUTH HOJE
  → ChatPro API → WhatsApp
```

**Conclusão crítica:**
- agent-acolhimento **não chama** `zapi-send`, `dispatch-message` nem `channel-dispatcher` diretamente
- agent-acolhimento só insere em `channel_dispatch_queue` (DB write)
- channel-dispatcher lê a fila e chama `chatpro-send` SEM auth header (linha 83)
- **FIX de chatpro-send DEVE ser atômico com update de channel-dispatcher** (mesmo deploy/commit)
- zapi-send NÃO é chamado no pipeline do acolhimento (channel-dispatcher chama Z-API REST diretamente, não o EF zapi-send)

---

## ═══════════════════════════════════════════════
## PASSO 2 — FIXES (aguardando autorização de Felipe)
## ═══════════════════════════════════════════════

### Arquivos que serão modificados

| Arquivo | Ação | Motivo |
|---|---|---|
| `supabase/functions/chatpro-send/index.ts` | Modify | Remover CORS `'*'`, adicionar validação SERVICE_ROLE_KEY |
| `supabase/functions/channel-dispatcher/index.ts` | Modify | Adicionar Authorization header na chamada a chatpro-send (caller fix — ATÔMICO com chatpro-send) |
| `supabase/functions/dispatch-message/index.ts` | Modify | Remover CORS `'*'`, validar SERVICE_ROLE_KEY, adicionar Authorization na chamada a chatpro-send |
| `supabase/functions/zapi-send/index.ts` | Modify | Remover CORS `'*'`, adicionar validação SERVICE_ROLE_KEY |
| `supabase/functions/test-whatsapp-message/index.ts` | Modify | Trocar CORS `'*'` → ALLOWED_ORIGIN, adicionar JWT validation |
| `supabase/functions/conversation-send-message/index.ts` | Modify | Trocar `'*'` → ALLOWED_ORIGIN em corsHeaders() |
| `supabase/functions/conversation-handoff/index.ts` | Modify | Trocar `'*'` → ALLOWED_ORIGIN em corsHeaders() |

---

### Task 1: Setup da branch

**Files:** nenhum

- [ ] **Step 1.1: Verificar estado do main**

```bash
git fetch origin main
git log origin/main --oneline -3
# Confirmar último merge: fix/security-go-live-hardening (PR #125)
```

- [ ] **Step 1.2: Criar branch**

```bash
git checkout main
git pull origin main
git checkout -b fix/cors-edge-functions-hardening
git log --oneline -1
```
Expected: branch criada a partir do HEAD de main.

---

### Task 2: Fix chatpro-send + callers (ATÔMICO — journeys D+3)

⚠️ **Esta task DEVE ter channel-dispatcher e chatpro-send no MESMO commit.** Fazer separado quebra a journey D+3.

**Files:**
- Modify: `supabase/functions/chatpro-send/index.ts`
- Modify: `supabase/functions/channel-dispatcher/index.ts` (caller fix)
- Modify: `supabase/functions/dispatch-message/index.ts` (caller fix — a parte do call a chatpro-send, linhas 139-210)

- [ ] **Step 2.1: Modificar chatpro-send — remover CORS, adicionar auth**

Substituir o conteúdo completo de `supabase/functions/chatpro-send/index.ts`:

```typescript
// ============================================================
// Edge Function: chatpro-send
// Envio direto de mensagem WhatsApp via API ChatPro
//
// POST /functions/v1/chatpro-send
// verify_jwt = false — chamada INTERNA entre EFs (service_role)
//
// Auth: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
// Chamada apenas por channel-dispatcher e dispatch-message.
// NÃO expõe CORS — não é endpoint de browser.
//
// Body: { to_phone: string, message: string }
//
// Variáveis de ambiente necessárias:
//   SUPABASE_SERVICE_ROLE_KEY — validação de chamadas internas
//   CHATPRO_INSTANCE_ID       — ex: chatpro-xi70lpoh5q
//   CHATPRO_TOKEN             — token do painel ChatPro
//   CHATPRO_BASE_URL          — ex: https://v5.chatpro.com.br/chatpro-xi70lpoh5q
// ============================================================

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  // Função interna: rejeitar OPTIONS (não é endpoint de browser)
  if (req.method === 'OPTIONS') return json({ error: 'method_not_allowed' }, 405)
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  // ── Auth interna: Bearer service_role ────────────────────────
  if (!SERVICE_ROLE_KEY) {
    console.error('[chatpro-send] SUPABASE_SERVICE_ROLE_KEY não configurado')
    return json({ ok: false, error: 'misconfigured' }, 500)
  }
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  // ── Credenciais ─────────────────────────────────────────────
  const CHATPRO_INSTANCE_ID = Deno.env.get('CHATPRO_INSTANCE_ID') ?? ''
  const CHATPRO_TOKEN       = Deno.env.get('CHATPRO_TOKEN')        ?? ''
  const CHATPRO_BASE_URL    = Deno.env.get('CHATPRO_BASE_URL')
    ?? `https://v5.chatpro.com.br/${CHATPRO_INSTANCE_ID}`

  if (!CHATPRO_TOKEN || !CHATPRO_INSTANCE_ID) {
    console.error('[chatpro-send] CHATPRO_TOKEN ou CHATPRO_INSTANCE_ID não configurados')
    return json({ ok: false, error: 'chatpro_credentials_missing' }, 503)
  }

  // ── Parse body ───────────────────────────────────────────────
  let to_phone: string, message: string
  try {
    const body = await req.json()
    to_phone = body.to_phone
    message  = body.message
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  if (!to_phone || !message) {
    return json({ ok: false, error: 'missing_fields', required: ['to_phone', 'message'] }, 400)
  }

  // ── Normalizar número ────────────────────────────────────────
  const cleanPhone = to_phone.replace(/\D/g, '')

  if (cleanPhone.length < 10) {
    return json({ ok: false, error: 'invalid_phone', phone: cleanPhone }, 400)
  }

  console.log(`[chatpro-send] Enviando para ${cleanPhone} via ${CHATPRO_BASE_URL}`)

  // ── Chamada ChatPro ──────────────────────────────────────────
  const endpoint = `${CHATPRO_BASE_URL}/api/v1/send_message`

  try {
    const chatproRes = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': CHATPRO_TOKEN,  // ChatPro usa token direto, sem "Bearer"
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        number:  cleanPhone,
        message: message,
      }),
      signal: AbortSignal.timeout(15_000),
    })

    let result: unknown
    try {
      result = await chatproRes.json()
    } catch {
      result = { raw: await chatproRes.text().catch(() => '') }
    }

    console.log(`[chatpro-send] ChatPro status=${chatproRes.status}`)

    if (chatproRes.ok) {
      return json({
        ok:         true,
        message_id: (result as Record<string, unknown>)?.id ?? null,
        chatpro:    result,
      })
    }

    const statusMap: Record<number, string> = {
      400: 'chatpro_bad_request',
      401: 'chatpro_unauthorized',
      403: 'chatpro_forbidden',
      404: 'chatpro_instance_not_found',
      429: 'chatpro_rate_limited',
      500: 'chatpro_server_error',
    }
    const errorCode = statusMap[chatproRes.status] ?? `chatpro_error_${chatproRes.status}`

    return json({
      ok:          false,
      error:       errorCode,
      http_status: chatproRes.status,
      chatpro:     result,
    }, 502)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = msg.includes('timed out') || msg.includes('timeout')

    console.error(`[chatpro-send] Fetch error: ${isTimeout ? 'timeout' : 'network_error'}`)
    return json({
      ok:    false,
      error: isTimeout ? 'chatpro_timeout' : 'chatpro_network_error',
    }, 503)
  }
})
```

- [ ] **Step 2.2: Adicionar Authorization header em channel-dispatcher → chatpro-send**

Em `supabase/functions/channel-dispatcher/index.ts`, localizar linha 83 (ChatProAdapter.send):

Substituir:
```typescript
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chatpro-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_phone, message: text }),
        signal: AbortSignal.timeout(20_000),
      })
```

Por:
```typescript
      const res = await fetch(`${SUPABASE_URL}/functions/v1/chatpro-send`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ to_phone, message: text }),
        signal: AbortSignal.timeout(20_000),
      })
```

(`SERVICE_ROLE_KEY` já é const no topo de channel-dispatcher: `const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!`)

- [ ] **Step 2.3: Adicionar Authorization header em dispatch-message → chatpro-send**

Em `supabase/functions/dispatch-message/index.ts`, localizar linha 142 (dentro de `if (channelType === 'chatpro')`):

Substituir:
```typescript
        const chatproRes = await fetch(`${supabaseUrl}/functions/v1/chatpro-send`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ to_phone, message }),
          signal:  AbortSignal.timeout(20_000),
        })
```

Por:
```typescript
        const chatproRes = await fetch(`${supabaseUrl}/functions/v1/chatpro-send`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body:    JSON.stringify({ to_phone, message }),
          signal:  AbortSignal.timeout(20_000),
        })
```

- [ ] **Step 2.4: Deploy de chatpro-send + channel-dispatcher + dispatch-message (ATÔMICO)**

```bash
npx --yes supabase functions deploy chatpro-send \
  --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt

npx --yes supabase functions deploy channel-dispatcher \
  --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt

npx --yes supabase functions deploy dispatch-message \
  --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

Expected: 3× "Deployed Edge Function"

- [ ] **Step 2.5: Validação V1 — chamada sem auth a chatpro-send deve retornar 401**

```bash
curl -s -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/chatpro-send" \
  -H "Content-Type: application/json" \
  -d '{"to_phone":"+5521999999999","message":"test"}' | jq .
```
Expected: `{"ok":false,"error":"unauthorized"}`

- [ ] **Step 2.6: Commit atômico**

```bash
git add \
  supabase/functions/chatpro-send/index.ts \
  supabase/functions/channel-dispatcher/index.ts \
  supabase/functions/dispatch-message/index.ts
git commit -m "fix(security): chatpro-send auth interna + callers atualizados"
```

---

### Task 3: Fix dispatch-message — remover CORS, adicionar auth

**Files:**
- Modify: `supabase/functions/dispatch-message/index.ts`

> Nota: o caller fix (adicionar Authorization header na chamada a chatpro-send) já foi feito na Task 2, Step 2.3. Esta task adiciona auth ao próprio dispatch-message.

- [ ] **Step 3.1: Substituir CORS_HEADERS por validação de SERVICE_ROLE_KEY**

Em `supabase/functions/dispatch-message/index.ts`:

Substituir bloco:
```typescript
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type'
}
```

Por:
```typescript
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
```

Substituir o `if (req.method === 'OPTIONS')` na linha 63:
```typescript
  if (req.method === 'OPTIONS') return json({ ok: true }, 200)
```

Por:
```typescript
  if (req.method === 'OPTIONS') return json({ ok: false, error: 'method_not_allowed' }, 405)
```

Adicionar logo após o check de método POST (linha ~64), antes do `const supabaseAdmin = createClient(...)`:
```typescript
  // ── Auth interna: Bearer service_role ────────────────────────
  if (!SERVICE_ROLE_KEY) {
    console.error('[dispatch-message] SUPABASE_SERVICE_ROLE_KEY não configurado')
    return json({ ok: false, error: 'misconfigured' }, 500)
  }
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }
```

Substituir a função `json` no final do arquivo (remove CORS_HEADERS da resposta):
```typescript
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}
```

- [ ] **Step 3.2: Deploy**

```bash
npx --yes supabase functions deploy dispatch-message \
  --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 3.3: Validação V1 — chamada sem auth**

```bash
curl -s -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/dispatch-message" \
  -H "Content-Type: application/json" \
  -d '{"church_id":"fake","agent_slug":"test","to_phone":"+55","message":"x"}' | jq .
```
Expected: `{"ok":false,"error":"unauthorized"}`

- [ ] **Step 3.4: Commit**

```bash
git add supabase/functions/dispatch-message/index.ts
git commit -m "fix(security): dispatch-message auth interna SERVICE_ROLE_KEY"
```

---

### Task 4: Fix zapi-send — remover CORS, adicionar auth

**Files:**
- Modify: `supabase/functions/zapi-send/index.ts`

- [ ] **Step 4.1: Substituir CORS_HEADERS por validação de SERVICE_ROLE_KEY**

Em `supabase/functions/zapi-send/index.ts`:

Substituir bloco:
```typescript
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}
```

Por:
```typescript
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

Substituir:
```typescript
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: true })
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)
```

Por:
```typescript
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ ok: false, error: 'method_not_allowed' }, 405)
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405)

  // ── Auth interna: Bearer service_role ────────────────────────
  if (!SERVICE_ROLE_KEY) {
    console.error('[zapi-send] SUPABASE_SERVICE_ROLE_KEY não configurado')
    return json({ ok: false, error: 'misconfigured' }, 500)
  }
  const authHeader = req.headers.get('Authorization') ?? ''
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }
```

- [ ] **Step 4.2: Deploy**

```bash
npx --yes supabase functions deploy zapi-send \
  --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 4.3: Validação V1 — chamada sem auth**

```bash
curl -s -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/zapi-send" \
  -H "Content-Type: application/json" \
  -d '{"to_phone":"+5521999999999","message":"test"}' | jq .
```
Expected: `{"ok":false,"error":"unauthorized"}`

- [ ] **Step 4.4: Commit**

```bash
git add supabase/functions/zapi-send/index.ts
git commit -m "fix(security): zapi-send auth interna SERVICE_ROLE_KEY"
```

---

### Task 5: Fix test-whatsapp-message — JWT + ALLOWED_ORIGIN

**Files:**
- Modify: `supabase/functions/test-whatsapp-message/index.ts`

O frontend (`AgentConfig.tsx:154`) já envia `Authorization: Bearer ${session?.access_token}`. Precisamos validar esse JWT e que o church_id do token bate com o church_id do body.

- [ ] **Step 5.1: Reescrever test-whatsapp-message com JWT validation + ALLOWED_ORIGIN**

Substituir o conteúdo completo de `supabase/functions/test-whatsapp-message/index.ts`:

```typescript
// ============================================================
// Edge Function: test-whatsapp-message
// Envio de mensagem de teste via Z-API direto (sem passar por n8n).
//
// POST /functions/v1/test-whatsapp-message
// verify_jwt = false — validação manual (JWT de usuário autenticado)
//
// Usado pelo botão "Enviar mensagem de teste" na tela /agentes/:slug/configurar.
// Requer JWT válido; church_id do token deve bater com body.church_id.
// O canal precisa estar com session_status IN ('testing', 'active').
//
// Body: {
//   church_id: string (uuid)
//   to_phone:  string
//   message:   string
// }
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN   = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'
const ZAPI_BASE        = 'https://api.z-api.io'

const CORS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 204, headers: CORS })
  if (req.method !== 'POST')   return json({ ok: false, error: 'method_not_allowed' }, 405)

  // ── 1. Validar JWT ────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token      = authHeader.replace(/^Bearer\s+/i, '').trim()

  if (!token) return json({ ok: false, error: 'unauthorized' }, 401)

  const supabaseAuth = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return json({ ok: false, error: 'unauthorized' }, 401)

  // ── 2. Extrair church_id do token ─────────────────────────────
  const tokenChurchId = user.app_metadata?.church_id as string | undefined
  if (!tokenChurchId) return json({ ok: false, error: 'forbidden: sem church_id no token' }, 403)

  // ── 3. Parse e validar body ───────────────────────────────────
  const body = await req.json().catch(() => null)
  if (!body) return json({ ok: false, error: 'invalid_json' }, 400)

  const { church_id, to_phone, message } = body as Record<string, unknown>

  if (!church_id || typeof church_id !== 'string' ||
      !to_phone   || typeof to_phone   !== 'string' ||
      !message    || typeof message    !== 'string') {
    return json({ ok: false, error: 'missing_fields', required: ['church_id', 'to_phone', 'message'] }, 400)
  }

  // ── 4. Guard: church_id do body deve bater com o do token ─────
  if (church_id !== tokenChurchId) {
    return json({ ok: false, error: 'forbidden: church_id não pertence ao usuário' }, 403)
  }

  // ── 5. Buscar canal ativo da igreja ───────────────────────────
  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: channel, error: chErr } = await sb
    .from('church_whatsapp_channels')
    .select('id, phone_number, zapi_instance_id, zapi_token, session_status, context_type')
    .eq('church_id', church_id)
    .eq('active', true)
    .in('session_status', ['testing', 'active'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (chErr) {
    console.error('[test-whatsapp-message] DB error:', chErr.message)
    return json({ ok: false, error: 'db_error' }, 500)
  }

  if (!channel) {
    return json({
      ok: false,
      error: 'no_active_channel',
      detail: 'Nenhum canal WhatsApp conectado para esta igreja.',
    }, 422)
  }

  if (!channel.zapi_instance_id || !channel.zapi_token) {
    return json({
      ok: false,
      error: 'channel_missing_credentials',
      detail: 'Canal encontrado mas sem credenciais Z-API.',
    }, 422)
  }

  // ── 6. Chamar Z-API ───────────────────────────────────────────
  const zapiUrl = `${ZAPI_BASE}/instances/${channel.zapi_instance_id}/token/${channel.zapi_token}/send-text`
  const phone = to_phone.replace(/\D/g, '')

  console.log(`[test-whatsapp-message] user=${user.id} church=${church_id} → ${phone}`)

  try {
    const zapiRes = await fetch(zapiUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone, message }),
      signal:  AbortSignal.timeout(10_000),
    })

    const zapiBody = await zapiRes.json().catch(() => ({}))

    if (zapiRes.ok) {
      return json({ ok: true, zapi_status: zapiRes.status, channel_id: channel.id, from_number: channel.phone_number })
    }

    console.warn(`[test-whatsapp-message] Z-API erro (${zapiRes.status})`)
    return json({ ok: false, error: 'zapi_error', zapi_status: zapiRes.status, zapi_response: zapiBody }, 422)

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const isTimeout = msg.includes('timed out') || msg.includes('timeout')
    console.error('[test-whatsapp-message] Fetch error:', isTimeout ? 'timeout' : 'network')
    return json({ ok: false, error: isTimeout ? 'zapi_timeout' : 'zapi_network_error' }, 503)
  }
})
```

- [ ] **Step 5.2: Deploy**

```bash
npx --yes supabase functions deploy test-whatsapp-message \
  --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 5.3: Validação V1 — chamada sem auth**

```bash
curl -s -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/test-whatsapp-message" \
  -H "Content-Type: application/json" \
  -H "Origin: https://evil.com" \
  -d '{"church_id":"fake","to_phone":"+55","message":"x"}' | jq .
```
Expected: `{"ok":false,"error":"unauthorized"}`

- [ ] **Step 5.4: Validação V3 — OPTIONS da origem permitida**

```bash
curl -s -X OPTIONS "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/test-whatsapp-message" \
  -H "Origin: https://ekthos-platform.vercel.app" \
  -H "Access-Control-Request-Method: POST" -i | grep -E "access-control|HTTP"
```
Expected: `Access-Control-Allow-Origin: https://ekthos-platform.vercel.app`

- [ ] **Step 5.5: Commit**

```bash
git add supabase/functions/test-whatsapp-message/index.ts
git commit -m "fix(security): test-whatsapp-message JWT auth + ALLOWED_ORIGIN"
```

---

### Task 6: Fix conversation-send-message — ALLOWED_ORIGIN (P3)

**Files:**
- Modify: `supabase/functions/conversation-send-message/index.ts` (apenas função `corsHeaders()` e adicionar const ALLOWED_ORIGIN)

- [ ] **Step 6.1: Adicionar ALLOWED_ORIGIN e atualizar corsHeaders()**

No início do arquivo, logo após `const SERVICE_ROLE_KEY = ...`, adicionar:
```typescript
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'
```

Substituir a função `corsHeaders()` no final do arquivo:
```typescript
// Antes:
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
}

// Depois:
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
}
```

- [ ] **Step 6.2: Deploy**

```bash
npx --yes supabase functions deploy conversation-send-message \
  --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 6.3: Validação V3 — OPTIONS**

```bash
curl -s -X OPTIONS "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/conversation-send-message" \
  -H "Origin: https://ekthos-platform.vercel.app" -i | grep access-control
```
Expected: `access-control-allow-origin: https://ekthos-platform.vercel.app`

- [ ] **Step 6.4: Commit**

```bash
git add supabase/functions/conversation-send-message/index.ts
git commit -m "fix(security): conversation-send-message CORS '*' → ALLOWED_ORIGIN"
```

---

### Task 7: Fix conversation-handoff — ALLOWED_ORIGIN (P3)

**Files:**
- Modify: `supabase/functions/conversation-handoff/index.ts` (apenas função `corsHeaders()` e adicionar const)

- [ ] **Step 7.1: Adicionar ALLOWED_ORIGIN e atualizar corsHeaders()**

No início do arquivo (após `const SERVICE_ROLE_KEY = ...`), adicionar:
```typescript
const ALLOWED_ORIGIN = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'
```

Substituir a função `corsHeaders()` no final:
```typescript
// Antes:
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
}

// Depois:
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
  }
}
```

- [ ] **Step 7.2: Deploy**

```bash
npx --yes supabase functions deploy conversation-handoff \
  --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 7.3: Validação V3 — OPTIONS**

```bash
curl -s -X OPTIONS "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/conversation-handoff" \
  -H "Origin: https://ekthos-platform.vercel.app" -i | grep access-control
```
Expected: `access-control-allow-origin: https://ekthos-platform.vercel.app`

- [ ] **Step 7.4: Commit**

```bash
git add supabase/functions/conversation-handoff/index.ts
git commit -m "fix(security): conversation-handoff CORS '*' → ALLOWED_ORIGIN"
```

---

### Task 8: Validação completa V1-V6

- [ ] **Step 8.1: V1 — todas as EFs críticas rejeitam chamada sem auth**

```bash
for ef in test-whatsapp-message dispatch-message zapi-send chatpro-send; do
  echo "=== $ef ===" 
  curl -s -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/$ef" \
    -H "Content-Type: application/json" \
    -d '{"to_phone":"+55","message":"test"}' | jq .error
done
```
Expected: todos retornam `"unauthorized"`

- [ ] **Step 8.2: V2 — chatpro-send aceita chamada com service_role (não dispara ChatPro sem credenciais)**

```bash
# Testar com service_role — deve retornar 503 (sem credenciais ChatPro) e não 401
curl -s -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/chatpro-send" \
  -H "Authorization: Bearer $(grep SUPABASE_SERVICE_ROLE_KEY .env.production | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{"to_phone":"+5521000000000","message":"test"}' | jq .error
```
Expected: `"chatpro_credentials_missing"` ou erro de rede (não `"unauthorized"`)

- [ ] **Step 8.3: V4 — não há tokens em logs**

```bash
grep -n "console.log\|console.error\|console.warn" \
  supabase/functions/zapi-send/index.ts \
  supabase/functions/chatpro-send/index.ts \
  supabase/functions/dispatch-message/index.ts
```
Verificar manualmente que nenhuma linha loga variáveis de token/credencial.

- [ ] **Step 8.4: V5 — build do frontend sem erros**

```bash
cd web && npm run build 2>&1 | tail -5
```
Expected: `built in X.Xs` sem erros.

- [ ] **Step 8.5: V6 — code review**

Usar `superpowers:requesting-code-review` — ver Task 9.

---

### Task 9: Code review

- [ ] **Step 9.1: Capturar SHAs**

```bash
BASE_SHA=$(git log origin/main --oneline -1 | awk '{print $1}')
HEAD_SHA=$(git rev-parse HEAD)
echo "BASE: $BASE_SHA  HEAD: $HEAD_SHA"
```

- [ ] **Step 9.2: Despachar code reviewer**

Usar `superpowers:requesting-code-review` com:
- WHAT: Hardening CORS em 6 EFs + auth SERVICE_ROLE_KEY em EFs internas + JWT em test-whatsapp-message
- PLAN: docs/superpowers/plans/2026-05-04-cors-edge-functions-hardening.md
- BASE_SHA: <valor>
- HEAD_SHA: <valor>

---

### Task 10: Criar PR

- [ ] **Step 10.1: Push**

```bash
git push origin fix/cors-edge-functions-hardening
```

- [ ] **Step 10.2: Criar PR via GitHub MCP ou gh CLI**

```
Title: fix(security): hardening CORS em 6 Edge Functions + auth interna
Base: main
Head: fix/cors-edge-functions-hardening

Body:
## Summary
- Remove CORS `'*'` de 6 Edge Functions
- EFs internas (dispatch-message, chatpro-send, zapi-send): sem CORS + SERVICE_ROLE_KEY auth
- EFs de browser (test-whatsapp-message): JWT validation + ALLOWED_ORIGIN
- EFs P3 (conversation-send-message, conversation-handoff): `'*'` → ALLOWED_ORIGIN
- channel-dispatcher atualizado (caller fix — journey D+3 preservada)

## Journey D+3 (05/05 18:49 BRT)
Cadeia: pg_cron → agent-acolhimento → channel_dispatch_queue → channel-dispatcher → chatpro-send
channel-dispatcher agora envia `Authorization: Bearer <service_role>` para chatpro-send.
Deployado atomicamente — nenhum downtime na cadeia.

## Test plan
- [ ] V1: EFs internas retornam 401 sem auth
- [ ] V2: chatpro-send aceita Bearer service_role
- [ ] V3: OPTIONS retorna ALLOWED_ORIGIN nas EFs de browser
- [ ] V4: Nenhum token em logs
- [ ] V5: npm run build sem erros
- [ ] V6: Code review aprovado
```

---

## Self-Review

### Spec coverage check
- ✅ P1 test-whatsapp-message: JWT + ALLOWED_ORIGIN (Task 5)
- ✅ P2 dispatch-message: auth SERVICE_ROLE_KEY + caller fix (Tasks 2+3)
- ✅ P2 zapi-send: auth SERVICE_ROLE_KEY (Task 4)
- ✅ P2 chatpro-send: auth SERVICE_ROLE_KEY + callers atualizados (Task 2)
- ✅ P3 conversation-send-message: ALLOWED_ORIGIN (Task 6)
- ✅ P3 conversation-handoff: ALLOWED_ORIGIN (Task 7)
- ✅ Journey D+3: channel-dispatcher atualizado atomicamente com chatpro-send (Task 2)
- ✅ Validação V1-V6 (Task 8)
- ✅ Code review (Task 9)
- ✅ PR (Task 10)
- ✅ Passo 0+1 auditados e reportados antes de codar

### Gaps identificados
- Nenhum gap encontrado.

### Placeholder scan
- Nenhum "TBD" ou placeholder encontrado.
