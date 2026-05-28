# PASSO 7 — Canais WhatsApp no Cockpit Admin

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Adicionar seção "Canais WhatsApp" ao cockpit admin (/admin/cockpit/ativacoes/:id) com provisionamento preparado para n8n (fallback seguro se webhook não existir).

**Architecture:** A tabela `church_whatsapp_channels` já existe mas com schema diferente do especificado — a migration é aditiva (ALTER, não DROP/CREATE). Dois RPCs novos (upsert + list) mais uma Edge Function de provisionamento com fallback graceful quando N8N_PROVISIONING_WEBHOOK_URL não está configurada. Frontend novo componente `CanaisWhatsappSection` inserido em `AtivacaoDetail` abaixo do `PromptCustomizadoSection`, e o item 3 do checklist ("Conectou canal") passa a ser derivado do banco (status='connected').

**Tech Stack:** Supabase (PL/pgSQL, RLS, SECURITY DEFINER), Deno/TypeScript (Edge Function), React + TanStack Query + Tailwind/shadcn.

---

## CONTEXTO DA AUDITORIA SQL (executada antes de codar)

**Subagent A — Schema atual de `church_whatsapp_channels`:**
```
id (uuid, NOT NULL)
church_id (uuid, NOT NULL)
channel_type (text, NOT NULL)      ← nome diferente do spec (spec quer 'provider')
phone_number (text, NOT NULL)
meta_phone_number_id (text, NULL)
meta_waba_id (text, NULL)
meta_access_token (text, NULL)     ← coluna de token existente — NÃO TOCAR
zapi_instance_id (text, NULL)
zapi_token (text, NULL)            ← coluna de token existente — NÃO TOCAR
active (boolean, NULL)
created_at (timestamptz, NULL)
context_type (text, NULL)
session_status (text, NOT NULL)
connected_by_user_id (uuid, NULL)
provider_label (text, NULL)
notes (text, NULL)
```

**Subagent B:** Nenhuma RPC referencia essa tabela ainda.

**Subagent C:** 3 registros, 1 igreja, tipos: chatpro, mock, zapi.

**Consequências para o plano:**
1. Usar ALTER aditivo — jamais DROP ou RENAME de colunas existentes
2. Coluna `provider` adicionada, backfill a partir de `channel_type`
3. Coluna `instance_id` adicionada, backfill de `zapi_instance_id` / `meta_phone_number_id`
4. Coluna `display_name` adicionada, backfill de `provider_label`
5. Coluna `status` (nova) backfill de 'pending' — NÃO confundir com `session_status` existente
6. UNIQUE (church_id, provider): 3 rows com provider diferente na mesma igreja → SAFE
7. CHECK em `status` values OK (nova coluna, backfill com valor válido 'pending')
8. CHECK em `provider` values NÃO adicionado (dados existentes: chatpro, mock ≠ 'zapi'/'meta')
9. `meta_access_token` e `zapi_token` já existem — NÃO são criadas neste PR (rule: don't create credentials columns; as existentes ficam)

---

## File Map

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260503150000_alter_church_whatsapp_channels.sql` | CREATE | ALTER table + novas colunas + backfill + UNIQUE + RLS + policies + trigger updated_at |
| `supabase/migrations/20260503150100_rpc_whatsapp_channels.sql` | CREATE | RPCs upsert_church_whatsapp_channel + list_church_whatsapp_channels |
| `supabase/functions/provision-whatsapp-channel/index.ts` | CREATE | Edge Function provisionamento com fallback n8n |
| `web/src/hooks/useChurchWhatsappChannels.ts` | CREATE | Hook TanStack Query + mutation (query list + upsert + provision) |
| `web/src/components/admin/CanaisWhatsappSection.tsx` | CREATE | UI completo: cards + modal formulário |
| `web/src/pages/admin/AtivacaoDetail.tsx` | MODIFY | Import + usar CanaisWhatsappSection; derivar item 3 do checklist |

---

## Task 1: Migration — ALTER church_whatsapp_channels

**Files:**
- Create: `supabase/migrations/20260503150000_alter_church_whatsapp_channels.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- Migration: alter_church_whatsapp_channels
-- Adiciona colunas operacionais para PASSO 7.
-- NÃO remove nem renomeia colunas existentes (ALTER aditivo).
-- Tabela já tem: channel_type, zapi_token, meta_access_token, session_status, etc.
-- Adiciona: provider, instance_id, display_name, status, error_message,
--           last_provisioned_at, last_health_check, metadata, updated_at, updated_by

-- 1. Adicionar colunas novas (todas IF NOT EXISTS)
ALTER TABLE public.church_whatsapp_channels
  ADD COLUMN IF NOT EXISTS provider               TEXT,
  ADD COLUMN IF NOT EXISTS instance_id            TEXT,
  ADD COLUMN IF NOT EXISTS display_name           TEXT,
  ADD COLUMN IF NOT EXISTS status                 TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_message          TEXT,
  ADD COLUMN IF NOT EXISTS last_provisioned_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_health_check      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata               JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by             UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Backfill provider a partir de channel_type
UPDATE public.church_whatsapp_channels
SET provider = channel_type
WHERE provider IS NULL;

-- 3. Backfill instance_id a partir de colunas existentes (zapi primeiro, meta fallback)
UPDATE public.church_whatsapp_channels
SET instance_id = COALESCE(zapi_instance_id, meta_phone_number_id)
WHERE instance_id IS NULL;

-- 4. Backfill display_name a partir de provider_label
UPDATE public.church_whatsapp_channels
SET display_name = provider_label
WHERE display_name IS NULL AND provider_label IS NOT NULL;

-- 5. Garantir que status nunca seja NULL (backfill precaução)
UPDATE public.church_whatsapp_channels
SET status = 'pending'
WHERE status IS NULL;

-- 6. Adicionar CHECK em status (só após backfill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_channel_status'
      AND conrelid = 'public.church_whatsapp_channels'::regclass
  ) THEN
    ALTER TABLE public.church_whatsapp_channels
      ADD CONSTRAINT chk_channel_status
      CHECK (status IN ('pending','provisioning','connected','error'));
  END IF;
END$$;

-- 7. UNIQUE (church_id, provider) — seguro após auditoria (3 rows, todos diferentes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_church_provider'
      AND conrelid = 'public.church_whatsapp_channels'::regclass
  ) THEN
    ALTER TABLE public.church_whatsapp_channels
      ADD CONSTRAINT uq_church_provider UNIQUE (church_id, provider);
  END IF;
END$$;

-- 8. RLS
ALTER TABLE public.church_whatsapp_channels ENABLE ROW LEVEL SECURITY;

-- 8a. Policy admin full access (Decisão 57: auth.uid() + query auth.users)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'church_whatsapp_channels'
      AND policyname = 'ekthos_admin_full_access'
  ) THEN
    CREATE POLICY ekthos_admin_full_access
      ON public.church_whatsapp_channels
      FOR ALL
      TO authenticated
      USING (
        (SELECT (raw_app_meta_data ->> 'is_ekthos_admin')::boolean
         FROM auth.users WHERE id = auth.uid()) = true
      )
      WITH CHECK (
        (SELECT (raw_app_meta_data ->> 'is_ekthos_admin')::boolean
         FROM auth.users WHERE id = auth.uid()) = true
      );
  END IF;
END$$;

-- 8b. Policy pastor SELECT only da própria igreja (PASSO 7.5)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'church_whatsapp_channels'
      AND policyname = 'pastor_select_own_church'
  ) THEN
    CREATE POLICY pastor_select_own_church
      ON public.church_whatsapp_channels
      FOR SELECT
      TO authenticated
      USING (
        church_id IN (
          SELECT church_id FROM public.profiles WHERE id = auth.uid()
        )
      );
  END IF;
END$$;

-- 9. Trigger updated_at (padrão do projeto)
CREATE OR REPLACE FUNCTION public.set_updated_at_church_whatsapp_channels()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_updated_at_church_whatsapp_channels
  ON public.church_whatsapp_channels;

CREATE TRIGGER trg_updated_at_church_whatsapp_channels
  BEFORE UPDATE ON public.church_whatsapp_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_church_whatsapp_channels();
```

- [ ] **Step 2: Aplicar via MCP Supabase**

Usar `mcp__supabase__apply_migration` com:
- name: `alter_church_whatsapp_channels`
- query: conteúdo do arquivo acima

- [ ] **Step 3: Verificar C1 (tabela existe, sem coluna token nova)**

```sql
-- C1a: tabela existe
SELECT EXISTS(
  SELECT 1 FROM information_schema.tables
  WHERE table_name = 'church_whatsapp_channels'
  AND table_schema = 'public'
) AS table_exists;
-- Esperado: true

-- C1b: coluna 'token' NÃO existe (colunas zapi_token e meta_access_token existem, mas não coluna chamada 'token')
SELECT column_name FROM information_schema.columns
WHERE table_name = 'church_whatsapp_channels'
  AND column_name = 'token';
-- Esperado: 0 rows

-- C1c: novas colunas existem
SELECT column_name FROM information_schema.columns
WHERE table_name = 'church_whatsapp_channels'
  AND column_name IN ('provider','instance_id','display_name','status',
                      'error_message','last_provisioned_at','updated_at','updated_by')
ORDER BY column_name;
-- Esperado: 8 rows
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260503150000_alter_church_whatsapp_channels.sql
git commit -m "chore(db): PASSO 7 — ALTER church_whatsapp_channels + RLS + trigger"
```

---

## Task 2: Migration — RPCs upsert + list

**Files:**
- Create: `supabase/migrations/20260503150100_rpc_whatsapp_channels.sql`

- [ ] **Step 1: Criar arquivo de migration**

```sql
-- Migration: rpc_whatsapp_channels
-- RPCs:
--   upsert_church_whatsapp_channel — admin Ekthos cria/atualiza canal
--   list_church_whatsapp_channels  — admin ou pastor da igreja lista canais

-- ── upsert ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_church_whatsapp_channel(
  p_church_id    UUID,
  p_provider     TEXT,
  p_phone_number TEXT,
  p_instance_id  TEXT,
  p_display_name TEXT,
  p_initial_status TEXT DEFAULT 'pending'
)
RETURNS TABLE (
  channel_id UUID,
  is_new     BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin   BOOLEAN;
  v_existing_id UUID;
  v_new_id      UUID;
BEGIN
  -- Validação admin Ekthos (Decisão 57)
  SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
  INTO v_is_admin
  FROM auth.users WHERE id = auth.uid();

  IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Apenas admin Ekthos pode configurar canais';
  END IF;

  -- Validação status
  IF p_initial_status NOT IN ('pending','provisioning','connected','error') THEN
    RAISE EXCEPTION 'Status inválido: %', p_initial_status;
  END IF;

  -- Tenta encontrar registro existente
  SELECT id INTO v_existing_id
  FROM church_whatsapp_channels
  WHERE church_id = p_church_id AND provider = p_provider;

  IF v_existing_id IS NOT NULL THEN
    -- UPDATE
    UPDATE church_whatsapp_channels
    SET phone_number  = p_phone_number,
        instance_id   = p_instance_id,
        display_name  = p_display_name,
        status        = p_initial_status,
        error_message = NULL,
        updated_by    = auth.uid(),
        updated_at    = now()
    WHERE id = v_existing_id;

    RETURN QUERY SELECT v_existing_id, false;
  ELSE
    -- INSERT
    INSERT INTO church_whatsapp_channels
      (church_id, provider, phone_number, instance_id, display_name,
       status, channel_type, session_status, updated_by)
    VALUES
      (p_church_id, p_provider, p_phone_number, p_instance_id, p_display_name,
       p_initial_status, p_provider, p_initial_status, auth.uid())
    RETURNING id INTO v_new_id;

    RETURN QUERY SELECT v_new_id, true;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_church_whatsapp_channel(UUID,TEXT,TEXT,TEXT,TEXT,TEXT)
  TO authenticated;

-- ── list ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.list_church_whatsapp_channels(
  p_church_id UUID
)
RETURNS TABLE (
  id                   UUID,
  provider             TEXT,
  phone_number         TEXT,
  instance_id          TEXT,
  display_name         TEXT,
  status               TEXT,
  error_message        TEXT,
  last_provisioned_at  TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin Ekthos OU usuário da própria igreja
  IF NOT (
    (SELECT COALESCE((raw_app_meta_data ->> 'is_ekthos_admin')::boolean, false)
     FROM auth.users WHERE id = auth.uid()) = true
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.church_id = p_church_id
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para listar canais desta igreja';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.provider,
    c.phone_number,
    c.instance_id,
    c.display_name,
    c.status,
    c.error_message,
    c.last_provisioned_at,
    c.updated_at
  FROM church_whatsapp_channels c
  WHERE c.church_id = p_church_id
  ORDER BY c.provider;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_church_whatsapp_channels(UUID)
  TO authenticated;
```

- [ ] **Step 2: Aplicar via MCP Supabase**

Usar `mcp__supabase__apply_migration` com:
- name: `rpc_whatsapp_channels`
- query: conteúdo acima

- [ ] **Step 3: Verificar C2 — RPCs existem**

```sql
SELECT count(*) FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND proname IN ('upsert_church_whatsapp_channel',
                  'list_church_whatsapp_channels');
-- Esperado: 2
```

- [ ] **Step 4: Verificar C5 — Smoke test upsert**

```sql
-- Insert novo
SELECT * FROM upsert_church_whatsapp_channel(
  '184fd750-4354-4c31-9018-64bc3605eca3'::uuid,
  'zapi',
  '+5521993092146',
  '3F28840B3A853234BB5A463A5A856F80',
  'Reengajamento via Z-API',
  'pending'
);
-- Esperado: channel_id (UUID) + is_new=true

-- Repetir — deve retornar is_new=false
SELECT * FROM upsert_church_whatsapp_channel(
  '184fd750-4354-4c31-9018-64bc3605eca3'::uuid,
  'zapi',
  '+5521993092146',
  '3F28840B3A853234BB5A463A5A856F80',
  'Reengajamento via Z-API',
  'pending'
);
-- Esperado: mesmo channel_id + is_new=false
```

- [ ] **Step 5: Verificar C6 — sem duplicata**

```sql
SELECT count(*) FROM church_whatsapp_channels
WHERE church_id = '184fd750-4354-4c31-9018-64bc3605eca3'
  AND provider = 'zapi';
-- Esperado: 1
```

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260503150100_rpc_whatsapp_channels.sql
git commit -m "chore(db): PASSO 7 — RPCs upsert + list church_whatsapp_channels"
```

---

## Task 3: Edge Function provision-whatsapp-channel

**Files:**
- Create: `supabase/functions/provision-whatsapp-channel/index.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
/**
 * provision-whatsapp-channel — Edge Function
 *
 * POST { channel_id: UUID }
 *
 * Fluxo:
 * 1. Valida JWT → confirma is_ekthos_admin
 * 2. Busca canal pelo id
 * 3. Seta status = 'provisioning'
 * 4. Se N8N_PROVISIONING_WEBHOOK_URL existe: POST pro webhook n8n
 *    - 2xx: mantém 'provisioning' (n8n vai callback depois)
 *    - erro: status='error', error_message='n8n_provisioning_failed: <msg>'
 * 5. Se env não existe: status='pending', error_message='n8n_webhook_not_configured'
 *
 * NUNCA logar token. NUNCA logar payload com credentials.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS })
  }

  try {
    // ── Auth ──────────────────────────────────────────────────────────────────

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // supabaseAuth — verifica quem é o usuário
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // supabaseAdmin — operações privilegiadas
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Confirmar is_ekthos_admin
    const { data: userData } = await supabaseAdmin
      .from('users')
      .select('raw_app_meta_data')
      .eq('id', user.id)
      .single()

    // Fallback: checar via auth.users schema
    const { data: authUserRow } = await supabaseAdmin.rpc('get_user_admin_flag', {
      p_user_id: user.id
    }).maybeSingle()

    // Verificação direta via query SQL
    const { data: adminCheck } = await supabaseAdmin
      .rpc('check_is_ekthos_admin', { p_user_id: user.id })
      .maybeSingle()

    // Verificar admin via query direta em auth.users
    const isAdmin = await (async () => {
      const { data } = await supabaseAdmin
        .schema('auth')
        .from('users')
        .select('raw_app_meta_data')
        .eq('id', user.id)
        .single()
      return (data?.raw_app_meta_data as Record<string, unknown>)?.is_ekthos_admin === true
    })()

    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Forbidden — apenas admin Ekthos' }), {
        status: 403, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // ── Body ──────────────────────────────────────────────────────────────────

    const body = await req.json()
    const channelId: string | undefined = body?.channel_id
    if (!channelId) {
      return new Response(JSON.stringify({ error: 'channel_id é obrigatório' }), {
        status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // ── Buscar canal ──────────────────────────────────────────────────────────

    const { data: channel, error: channelError } = await supabaseAdmin
      .from('church_whatsapp_channels')
      .select('id, church_id, provider, phone_number, instance_id, display_name, status')
      .eq('id', channelId)
      .single()

    if (channelError || !channel) {
      return new Response(JSON.stringify({ error: 'Canal não encontrado' }), {
        status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // ── Validar church existe ─────────────────────────────────────────────────

    const { data: church } = await supabaseAdmin
      .from('churches')
      .select('id, name')
      .eq('id', channel.church_id)
      .single()

    if (!church) {
      return new Response(JSON.stringify({ error: 'Igreja não encontrada' }), {
        status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      })
    }

    // ── Setar provisioning ────────────────────────────────────────────────────

    await supabaseAdmin
      .from('church_whatsapp_channels')
      .update({ status: 'provisioning', error_message: null, updated_at: new Date().toISOString() })
      .eq('id', channelId)

    // ── Tentar n8n ────────────────────────────────────────────────────────────

    const n8nWebhookUrl = Deno.env.get('N8N_PROVISIONING_WEBHOOK_URL')
    const n8nSecret     = Deno.env.get('N8N_PROVISIONING_SECRET') ?? ''
    const hasN8n        = !!n8nWebhookUrl

    let finalStatus       = 'provisioning'
    let finalErrorMessage: string | null = null

    if (!hasN8n) {
      // CASO B — env não configurada: fallback seguro
      finalStatus       = 'pending'
      finalErrorMessage = 'n8n_webhook_not_configured'
    } else {
      // CASO A — tentar webhook n8n
      const callbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/provision-whatsapp-channel-callback`

      const payload = {
        church_id:    channel.church_id,
        channel_id:   channelId,
        provider:     channel.provider,
        phone_number: channel.phone_number,
        instance_id:  channel.instance_id,
        display_name: channel.display_name,
        callback_url: callbackUrl,
      }

      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 10_000)

        const n8nResponse = await fetch(n8nWebhookUrl, {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${n8nSecret}`,
          },
          body:   JSON.stringify(payload),
          signal: controller.signal,
        })

        clearTimeout(timeout)

        if (!n8nResponse.ok) {
          const errText = await n8nResponse.text().catch(() => `HTTP ${n8nResponse.status}`)
          finalStatus       = 'error'
          finalErrorMessage = `n8n_provisioning_failed: ${n8nResponse.status} ${errText.slice(0, 200)}`
        }
        // Se 2xx: finalStatus fica 'provisioning' — n8n vai callback depois
      } catch (fetchErr: unknown) {
        const msg = fetchErr instanceof Error ? fetchErr.message : 'fetch_error'
        finalStatus       = 'error'
        finalErrorMessage = `n8n_provisioning_failed: ${msg}`
      }
    }

    // ── Atualizar status final ────────────────────────────────────────────────

    if (finalStatus !== 'provisioning') {
      await supabaseAdmin
        .from('church_whatsapp_channels')
        .update({
          status:        finalStatus,
          error_message: finalErrorMessage,
          updated_at:    new Date().toISOString(),
        })
        .eq('id', channelId)
    }

    // ── Log estruturado ───────────────────────────────────────────────────────

    console.log('[provision-whatsapp-channel]', {
      channel_id:      channelId,
      church_id:       channel.church_id,
      provider:        channel.provider,
      has_n8n_webhook: hasN8n,
      result:          finalStatus,
      error_message:   finalErrorMessage,
    })

    return new Response(
      JSON.stringify({
        channel_id:    channelId,
        status:        finalStatus,
        error_message: finalErrorMessage ?? undefined,
      }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
    )

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'internal_error'
    console.error('[provision-whatsapp-channel] unhandled error', msg)
    return new Response(JSON.stringify({ error: 'internal_error' }), {
      status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    })
  }
})
```

**Nota sobre verificação de admin na EF:** A pattern acima tenta múltiplas abordagens para verificar is_ekthos_admin. O código final deve usar apenas a abordagem que funciona no projeto — auth schema + raw_app_meta_data via supabaseAdmin. Simplificar para apenas isso na implementação final.

- [ ] **Step 2: Deploy**

```bash
cd C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main
npx supabase functions deploy provision-whatsapp-channel \
  --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

- [ ] **Step 3: Verificar C3 — EF ativa**

```bash
npx supabase functions list --project-ref mlqjywqnchilvgkbvicd | grep provision
# Esperado: provision-whatsapp-channel ACTIVE
```

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/provision-whatsapp-channel/index.ts
git commit -m "feat(agent): PASSO 7 — Edge Function provision-whatsapp-channel com fallback n8n"
```

---

## Task 4: Hook useChurchWhatsappChannels

**Files:**
- Create: `web/src/hooks/useChurchWhatsappChannels.ts`

- [ ] **Step 1: Criar arquivo**

```typescript
/**
 * useChurchWhatsappChannels — Lista e upsert de church_whatsapp_channels
 * Polling 30s para refletir atualização de status pelo n8n callback.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface WhatsappChannel {
  id:                   string
  provider:             string
  phone_number:         string | null
  instance_id:          string | null
  display_name:         string | null
  status:               'pending' | 'provisioning' | 'connected' | 'error'
  error_message:        string | null
  last_provisioned_at:  string | null
  updated_at:           string
}

export interface UpsertChannelParams {
  church_id:       string
  provider:        string
  phone_number:    string
  instance_id:     string
  display_name:    string
  initial_status?: 'pending' | 'connected'
}

// ── Query ─────────────────────────────────────────────────────────────────────

export function useChurchWhatsappChannels(churchId: string | null | undefined) {
  return useQuery({
    queryKey: ['church-channels', churchId],
    queryFn: async (): Promise<WhatsappChannel[]> => {
      if (!churchId) return []
      const { data, error } = await supabase.rpc('list_church_whatsapp_channels', {
        p_church_id: churchId,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as WhatsappChannel[]
    },
    enabled: !!churchId,
    staleTime: 10_000,
    refetchInterval: 30_000,  // polling: captura updates de status do n8n callback
  })
}

// ── Mutation: upsert + provision ──────────────────────────────────────────────

export function useUpsertWhatsappChannel() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: UpsertChannelParams) => {
      // 1. Upsert no banco
      const { data: upsertData, error: upsertError } = await supabase.rpc(
        'upsert_church_whatsapp_channel',
        {
          p_church_id:      params.church_id,
          p_provider:       params.provider,
          p_phone_number:   params.phone_number,
          p_instance_id:    params.instance_id,
          p_display_name:   params.display_name,
          p_initial_status: params.initial_status ?? 'pending',
        }
      )
      if (upsertError) throw new Error(upsertError.message)

      const channelId = (upsertData as { channel_id: string }[])?.[0]?.channel_id
      if (!channelId) throw new Error('upsert não retornou channel_id')

      // 2. Chamar Edge Function de provisionamento
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sem sessão ativa')

      const provRes = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/provision-whatsapp-channel`,
        {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({ channel_id: channelId }),
        }
      )

      if (!provRes.ok) {
        const errBody = await provRes.json().catch(() => ({ error: 'parse_error' }))
        // Não lançar erro fatal — provisionamento pode falhar graciosamente
        console.warn('[useUpsertWhatsappChannel] provision warning', errBody)
      }

      return { channelId }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['church-channels', vars.church_id] })
    },
  })
}
```

- [ ] **Step 2: Verificar que VITE_SUPABASE_URL está nas env vars do projeto**

```bash
grep -r "VITE_SUPABASE_URL" C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main\web\.env* 2>/dev/null || echo "verificar .env.local"
```

Se não existir variável, usar constante já configurada no `supabase.ts` do projeto. Verificar:
```bash
cat web/src/lib/supabase.ts
```
E ajustar a fetch URL conforme o padrão já adotado (pode ser `VITE_SUPABASE_URL` ou constante).

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useChurchWhatsappChannels.ts
git commit -m "feat(hooks): PASSO 7 — useChurchWhatsappChannels + useUpsertWhatsappChannel"
```

---

## Task 5: Componente CanaisWhatsappSection

**Files:**
- Create: `web/src/components/admin/CanaisWhatsappSection.tsx`

- [ ] **Step 1: Criar arquivo**

```tsx
/**
 * CanaisWhatsappSection — Seção de canais WhatsApp por igreja
 *
 * Exibida dentro de AtivacaoDetail abaixo de PromptCustomizadoSection.
 * Permite ao time Ekthos configurar/provisionar canais WhatsApp.
 * Pastores não veem este painel (cockpit é exclusivo admin).
 */

import { useState } from 'react'
import {
  Smartphone, Plus, Loader2, Check, AlertCircle,
  RefreshCw, Pencil, Wifi, WifiOff, Clock, Zap,
} from 'lucide-react'
import {
  useChurchWhatsappChannels,
  useUpsertWhatsappChannel,
  type WhatsappChannel,
  type UpsertChannelParams,
} from '@/hooks/useChurchWhatsappChannels'

// ── Props ─────────────────────────────────────────────────────────────────────

interface CanaisWhatsappSectionProps {
  churchId:    string
  churchName:  string
  /** Callback quando canal muda (para derivar checklist) */
  onChanged?:  () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskInstanceId(id: string | null) {
  if (!id) return '—'
  if (id.length <= 6) return id
  return id.slice(0, 4) + '…'
}

function StatusBadge({ status }: { status: WhatsappChannel['status'] }) {
  const cfg = {
    pending:      { label: 'Pendente',      cls: 'bg-amber-100 text-amber-700 border-amber-200',  icon: Clock },
    provisioning: { label: 'Provisionando', cls: 'bg-blue-100 text-blue-700 border-blue-200',     icon: RefreshCw },
    connected:    { label: 'Conectado',     cls: 'bg-green-100 text-green-700 border-green-200',  icon: Wifi },
    error:        { label: 'Erro',          cls: 'bg-red-100 text-red-700 border-red-200',        icon: WifiOff },
  }[status]

  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${cfg.cls}`}>
      <Icon size={8} strokeWidth={status === 'provisioning' ? 2 : 2.5}
        className={status === 'provisioning' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  )
}

function ProviderBadge({ provider }: { provider: string }) {
  const isZapi = provider === 'zapi'
  const isMeta = provider === 'meta'
  const cls = isZapi
    ? 'bg-orange-100 text-orange-700 border-orange-200'
    : isMeta
    ? 'bg-blue-100 text-blue-700 border-blue-200'
    : 'bg-gray-100 text-gray-600 border-gray-200'
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${cls}`}>
      {isZapi ? 'Z-API' : isMeta ? 'Meta' : provider}
    </span>
  )
}

// ── Form state ────────────────────────────────────────────────────────────────

interface FormState {
  provider:        string
  phone_number:    string
  instance_id:     string
  display_name:    string
  initial_status:  'pending' | 'connected'
}

const EMPTY_FORM: FormState = {
  provider:       'zapi',
  phone_number:   '',
  instance_id:    '',
  display_name:   '',
  initial_status: 'pending',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CanaisWhatsappSection({
  churchId,
  churchName,
  onChanged,
}: CanaisWhatsappSectionProps) {
  const { data: channels = [], isLoading } = useChurchWhatsappChannels(churchId)
  const upsert = useUpsertWhatsappChannel()

  const [showModal, setShowModal]   = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [form, setForm]             = useState<FormState>(EMPTY_FORM)
  const [errMsg, setErrMsg]         = useState<string | null>(null)
  const [savedOk, setSavedOk]       = useState(false)

  const openNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrMsg(null)
    setSavedOk(false)
    setShowModal(true)
  }

  const openEdit = (ch: WhatsappChannel) => {
    setEditingId(ch.id)
    setForm({
      provider:       ch.provider,
      phone_number:   ch.phone_number ?? '',
      instance_id:    ch.instance_id ?? '',
      display_name:   ch.display_name ?? '',
      initial_status: ch.status === 'connected' ? 'connected' : 'pending',
    })
    setErrMsg(null)
    setSavedOk(false)
    setShowModal(true)
  }

  const handleSave = async () => {
    setErrMsg(null)
    setSavedOk(false)
    if (!form.provider || !form.phone_number || !form.instance_id) {
      setErrMsg('Provider, número e Instance ID são obrigatórios')
      return
    }
    try {
      await upsert.mutateAsync({
        church_id:       churchId,
        provider:        form.provider,
        phone_number:    form.phone_number.trim(),
        instance_id:     form.instance_id.trim(),
        display_name:    form.display_name.trim() || `${form.provider} — ${churchName}`,
        initial_status:  form.initial_status,
      } satisfies UpsertChannelParams)
      setSavedOk(true)
      onChanged?.()
      setTimeout(() => {
        setShowModal(false)
        setSavedOk(false)
      }, 1200)
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Erro desconhecido')
    }
  }

  const handleReprovision = async (ch: WhatsappChannel) => {
    setErrMsg(null)
    try {
      await upsert.mutateAsync({
        church_id:      churchId,
        provider:       ch.provider,
        phone_number:   ch.phone_number ?? '',
        instance_id:    ch.instance_id ?? '',
        display_name:   ch.display_name ?? '',
        initial_status: 'pending',
      } satisfies UpsertChannelParams)
      onChanged?.()
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Erro ao reenviar')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="p-5 border-b border-black/5">
        {/* Cabeçalho */}
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest flex items-center gap-1.5">
              <Smartphone size={10} className="text-brand-500" />
              Canais WhatsApp
            </p>
            <p className="text-[10px] text-ekthos-black/30 mt-0.5">
              Configure o canal WhatsApp desta igreja para os agentes enviarem mensagens.
            </p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition-colors"
          >
            <Plus size={11} strokeWidth={2.5} /> Adicionar canal
          </button>
        </div>

        {/* Skeleton */}
        {isLoading && (
          <div className="space-y-2">
            <div className="h-12 rounded-xl bg-cream-dark animate-pulse" />
            <div className="h-12 rounded-xl bg-cream-dark animate-pulse opacity-60" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && channels.length === 0 && (
          <div className="text-center py-6 border border-dashed border-black/10 rounded-xl">
            <Smartphone size={22} className="mx-auto text-ekthos-black/20 mb-2" strokeWidth={1.5} />
            <p className="text-xs text-ekthos-black/40 font-medium">Nenhum canal configurado</p>
            <p className="text-[10px] text-ekthos-black/30 mt-0.5">Adicione um canal Z-API ou Meta para esta igreja.</p>
          </div>
        )}

        {/* Canal cards */}
        {!isLoading && channels.length > 0 && (
          <div className="space-y-2.5">
            {channels.map(ch => (
              <div key={ch.id} className="p-3 bg-cream-light border border-black/8 rounded-xl">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ProviderBadge provider={ch.provider} />
                      <StatusBadge status={ch.status} />
                    </div>
                    <p className="text-sm font-medium text-ekthos-black mt-1.5 truncate">
                      {ch.display_name || `${ch.provider} — ${ch.phone_number}`}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] text-ekthos-black/40 font-mono">{ch.phone_number || '—'}</span>
                      <span className="text-[10px] text-ekthos-black/30">·</span>
                      <span className="text-[10px] text-ekthos-black/40 font-mono">
                        ID: {maskInstanceId(ch.instance_id)}
                      </span>
                    </div>
                    {ch.error_message && (
                      <div className="flex items-center gap-1 mt-1.5 text-[10px] text-red-600">
                        <AlertCircle size={9} strokeWidth={2} />
                        {ch.error_message}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {(ch.status === 'error' || ch.status === 'pending') && (
                      <button
                        onClick={() => handleReprovision(ch)}
                        disabled={upsert.isPending}
                        title="Reenviar provisionamento"
                        className="p-1.5 rounded-lg text-ekthos-black/40 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-40 transition-colors"
                      >
                        <Zap size={12} strokeWidth={2} />
                      </button>
                    )}
                    <button
                      onClick={() => openEdit(ch)}
                      title="Editar canal"
                      className="p-1.5 rounded-lg text-ekthos-black/40 hover:text-ekthos-black/70 hover:bg-black/5 transition-colors"
                    >
                      <Pencil size={12} strokeWidth={2} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Erro inline fora do modal */}
        {errMsg && !showModal && (
          <div className="flex items-center gap-1.5 mt-2 text-xs text-red-600">
            <AlertCircle size={11} strokeWidth={2} /> {errMsg}
          </div>
        )}
      </div>

      {/* Modal formulário */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-ekthos-black mb-1">
              {editingId ? 'Editar canal' : 'Adicionar canal WhatsApp'}
            </h3>
            <p className="text-xs text-ekthos-black/50 mb-4">
              {churchName} — configuração salva e provisionamento disparado.
            </p>

            <div className="space-y-3">
              {/* Provider — disabled em edição */}
              <div>
                <label className="text-[11px] font-semibold text-ekthos-black/50 uppercase tracking-wider">Provider</label>
                <div className="flex gap-2 mt-1.5">
                  {(['zapi', 'meta'] as const).map(p => (
                    <button
                      key={p}
                      onClick={() => !editingId && setForm(f => ({ ...f, provider: p }))}
                      disabled={!!editingId}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        form.provider === p
                          ? p === 'zapi'
                            ? 'bg-orange-100 border-orange-300 text-orange-700'
                            : 'bg-blue-100 border-blue-300 text-blue-700'
                          : 'bg-cream-light border-black/10 text-ekthos-black/50'
                      } ${editingId ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {p === 'zapi' ? 'Z-API' : 'Meta'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone number */}
              <div>
                <label className="text-[11px] font-semibold text-ekthos-black/50 uppercase tracking-wider">
                  Número WhatsApp
                </label>
                <input
                  type="text"
                  value={form.phone_number}
                  onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                  placeholder="+5511999999999"
                  className="mt-1 w-full text-sm text-ekthos-black placeholder:text-ekthos-black/25 bg-cream-light border border-black/8 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              {/* Instance ID */}
              <div>
                <label className="text-[11px] font-semibold text-ekthos-black/50 uppercase tracking-wider">
                  Instance ID <span className="font-normal text-ekthos-black/30 normal-case">(Z-API instance ou Meta phone_number_id)</span>
                </label>
                <input
                  type="text"
                  value={form.instance_id}
                  onChange={e => setForm(f => ({ ...f, instance_id: e.target.value }))}
                  placeholder="3F28840B3A853234BB5A…"
                  className="mt-1 w-full text-sm text-ekthos-black placeholder:text-ekthos-black/25 bg-cream-light border border-black/8 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200 font-mono"
                />
              </div>

              {/* Display name */}
              <div>
                <label className="text-[11px] font-semibold text-ekthos-black/50 uppercase tracking-wider">
                  Nome de exibição <span className="font-normal text-ekthos-black/30 normal-case">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder={`Ex: Acolhimento via Z-API — ${churchName}`}
                  className="mt-1 w-full text-sm text-ekthos-black placeholder:text-ekthos-black/25 bg-cream-light border border-black/8 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              {/* Status inicial */}
              <div>
                <label className="text-[11px] font-semibold text-ekthos-black/50 uppercase tracking-wider">Status inicial</label>
                <select
                  value={form.initial_status}
                  onChange={e => setForm(f => ({ ...f, initial_status: e.target.value as 'pending' | 'connected' }))}
                  className="mt-1 w-full text-sm text-ekthos-black bg-cream-light border border-black/8 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-200"
                >
                  <option value="pending">Pendente (default — aguardar n8n)</option>
                  <option value="connected">Conectado (já testei manualmente)</option>
                </select>
              </div>
            </div>

            {/* Feedback */}
            {errMsg && (
              <div className="flex items-center gap-1.5 mt-3 text-xs text-red-600">
                <AlertCircle size={11} strokeWidth={2} /> {errMsg}
              </div>
            )}
            {savedOk && (
              <div className="flex items-center gap-1.5 mt-3 text-xs text-green-600">
                <Check size={11} strokeWidth={2.5} /> Canal salvo e provisionamento disparado!
              </div>
            )}

            {/* Botões */}
            <div className="flex gap-2 mt-5 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-medium text-ekthos-black/60 bg-cream-light border border-black/10 rounded-xl hover:bg-cream-dark transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={upsert.isPending}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 rounded-xl transition-colors"
              >
                {upsert.isPending
                  ? <><Loader2 size={12} className="animate-spin" /> Salvando…</>
                  : <><Zap size={12} strokeWidth={2.5} /> Salvar e provisionar</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/admin/CanaisWhatsappSection.tsx
git commit -m "feat(ui): PASSO 7 — CanaisWhatsappSection com cards, modal e reprovisionamento"
```

---

## Task 6: Integrar em AtivacaoDetail + checklist derivado

**Files:**
- Modify: `web/src/pages/admin/AtivacaoDetail.tsx`

- [ ] **Step 1: Identificar as mudanças necessárias no arquivo atual**

Linha 34 — `CHECKLIST` array: índice 3 é "Conectou canal (WhatsApp da igreja ou webhook)"
Linha 45 — `PROMPT_CHECKLIST_IDX = 4` — padrão do item derivado automático
Linha 76 — `useChurchAgentConfig` — padrão do query para derivar item do checklist
Linha 87 — `effectiveChecked` — mapeia índice 4 para promptConfigured

Mudanças a fazer:
1. Importar `CanaisWhatsappSection` e `useChurchWhatsappChannels`
2. Adicionar `CHANNEL_CHECKLIST_IDX = 3`
3. Adicionar query `useChurchWhatsappChannels` para derivar channelConnected
4. Atualizar `effectiveChecked` para mapear índice 3 também
5. Atualizar `toggleCheck` para bloquear índice 3 também
6. Inserir `<CanaisWhatsappSection>` abaixo de `<PromptCustomizadoSection>`
7. Atualizar texto do rodapé do checklist para mencionar dois itens "auto"

- [ ] **Step 2: Aplicar mudanças**

**Imports a adicionar** (após linha 23):
```tsx
import CanaisWhatsappSection from '@/components/admin/CanaisWhatsappSection'
import { useChurchWhatsappChannels } from '@/hooks/useChurchWhatsappChannels'
```

**Constantes novas** (após linha 45):
```tsx
// Índice do item "Conectou canal" — controlado pelo backend
const CHANNEL_CHECKLIST_IDX = 3
```

**Query nova** (após linha 80, antes de `const [notes`):
```tsx
const { data: channels, refetch: refetchChannels } = useChurchWhatsappChannels(item?.church_id)
const channelConnected = channels?.some(ch => ch.status === 'connected') ?? false
```

**effectiveChecked atualizado** (substituir bloco existente):
```tsx
const effectiveChecked = useMemo(
  () => checked.map((v, i) => {
    if (i === PROMPT_CHECKLIST_IDX)    return promptConfigured
    if (i === CHANNEL_CHECKLIST_IDX)   return channelConnected
    return v
  }),
  [checked, promptConfigured, channelConnected],
)
```

**toggleCheck atualizado**:
```tsx
const toggleCheck = (i: number) => {
  if (i === PROMPT_CHECKLIST_IDX)  return  // somente leitura
  if (i === CHANNEL_CHECKLIST_IDX) return  // somente leitura
  setChecked(prev => prev.map((v, idx) => idx === i ? !v : v))
}
```

**li do checklist — isReadOnly atualizado**:
```tsx
const isReadOnly = i === PROMPT_CHECKLIST_IDX || i === CHANNEL_CHECKLIST_IDX
```

**Inserir CanaisWhatsappSection** (após `<PromptCustomizadoSection ... />`, antes de `{/* Notas */}`):
```tsx
{/* Canais WhatsApp */}
<CanaisWhatsappSection
  churchId={item.church_id}
  churchName={item.church_name}
  onChanged={() => refetchChannels()}
/>
```

**Texto rodapé checklist** (substituir):
```tsx
<p className="text-[10px] text-ekthos-black/30 mt-3">
  {effectiveChecked.filter(Boolean).length}/{CHECKLIST.length} itens concluídos
  {' '}— itens "auto" (canal e prompt) derivam do banco, demais são visuais.
</p>
```

- [ ] **Step 3: Build**

```bash
cd C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main\web
npm run build
# Esperado: 0 erros TypeScript
```

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/admin/AtivacaoDetail.tsx
git commit -m "feat(cockpit): PASSO 7 — seção Canais WhatsApp + checklist item 3 derivado do banco"
```

---

## Task 7: Verificações C1–C9 + Code Review

- [ ] **Step 1: C4 — Smoke test fallback (env n8n não configurada)**

```bash
# Pegar token do admin Ekthos
# Buscar channel_id inserido no C5
# Executar curl
curl -X POST https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/provision-whatsapp-channel \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"channel_id": "<UUID do canal de teste>"}'
# Esperado: {"channel_id":"...","status":"pending","error_message":"n8n_webhook_not_configured"}
```

- [ ] **Step 2: Code review via requesting-code-review**

Usar skill `requesting-code-review` com o diff completo do branch antes do push.

- [ ] **Step 3: Push e PR**

```bash
cd C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main
git push origin feat/passo-7-canais-whatsapp
```

PR manual: https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...feat/passo-7-canais-whatsapp?expand=1

---

## Self-Review

**Spec coverage checklist:**
- [x] Migration aditiva (ALTER) — Task 1
- [x] Schema final com todas as colunas do spec — Task 1
- [x] RLS + policies (admin full, pastor select) — Task 1
- [x] Trigger updated_at — Task 1
- [x] RPC upsert_church_whatsapp_channel — Task 2
- [x] RPC list_church_whatsapp_channels — Task 2
- [x] Edge Function provision-whatsapp-channel — Task 3
- [x] Fallback seguro quando N8N_PROVISIONING_WEBHOOK_URL ausente — Task 3
- [x] Hook useChurchWhatsappChannels + polling 30s — Task 4
- [x] Mutation useUpsertWhatsappChannel (upsert + provision) — Task 4
- [x] CanaisWhatsappSection: lista, cards com badges — Task 5
- [x] Modal criar/editar com todos os campos — Task 5
- [x] Botão "Reenviar provisionamento" (error/pending) — Task 5
- [x] provider disabled em edição — Task 5
- [x] instance_id mascarado — Task 5
- [x] Checklist item 3 derivado (channelConnected) — Task 6
- [x] Badge "auto" em item 3 — Task 6 (herda lógica do item 4)
- [x] C1-C9 validações — Task 7

**Proibidos verificados:**
- Nenhuma coluna token criada (existentes zapi_token/meta_access_token preservadas, não criadas)
- Nenhum log de token na EF
- Frontend não chama Z-API nem webhook n8n direto
- Pastor não pode editar (RLS SELECT only)
- Não toca em zapi-send, channel-dispatcher, webhook-receiver
- Não toca em activation_status / subscription_agents
- Não ativa agente ao salvar canal
- auth.jwt() não usada em SECURITY DEFINER (usa auth.uid() + query auth.users)
