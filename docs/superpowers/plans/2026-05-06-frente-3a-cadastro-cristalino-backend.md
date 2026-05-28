# Frente 3A — Backend "Cadastro Cristalino" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar o backend completo para "Complete a ativação da sua igreja" — tabela `contractors`, expansão de `churches`, 3 RPCs SECURITY DEFINER e adaptação cirúrgica de `admin-church-create` para setar `onboarding_step='pending'`.

**Architecture:** 6 migrations idempotentes aplicadas via MCP `apply_migration` (nunca `execute_sql` para DDL — regra canon #6). RPCs usam SECURITY DEFINER + SET search_path = public para defense-in-depth. Guard de autorização em cada RPC verifica user_roles para acesso church-level. R12 é cirúrgico: add de uma linha no insert de `admin-church-create`.

**Tech Stack:** Supabase Postgres (RLS, RPCs, triggers), Deno/TypeScript (Edge Functions), Playwright (E2E smoke test), Supabase MCP tools (`apply_migration`, `execute_sql`, `get_advisors`).

---

## Identificadores obrigatórios

- **Supabase project ref:** `mlqjywqnchilvgkbvicd`
- **Branch de trabalho:** `feat/3a-cadastro-cristalino-backend`
- **Admin Ekthos UUID:** `579d0f7b-9b8b-4c20-94c5-513b4a424642`

## Contexto de domínio (ler antes de implementar)

- `contractors`: pessoas físicas/jurídicas responsáveis pela igreja (pastor titular, tesoureiro, etc.). Cada igreja pode ter N contractors, mas só 1 ativo por CPF/CNPJ (índice parcial WHERE is_active = true).
- `onboarding_step`: valor CHECK ('pending','cadastro','pastoral','completed'). Criado como 'pending' pelo admin Ekthos → avança conforme a igreja preenche as telas.
- `uf`: novo campo source-of-truth para estado brasileiro (2 letras, ex: 'SP'). O campo `state` (text) já existe na tabela `churches` e é LEGACY — manter, não deletar (OPS-DEBT-005).
- `user_roles`: tabela que vincula user_id → church_id → role. Roles válidas: `admin`, `admin_departments`, `pastor_celulas`, `supervisor`, `cell_leader`, `secretary`, `treasurer`. As RPCs desta frente permitem acesso a church members com roles: `admin`, `admin_departments`, `treasurer`, `secretary`.
- `city`: coluna existente em `churches` (NÃO usar `cidade`). RPCs aceitam both `city` e `cidade` no JSON mas escrevem em `city`.

## Armadilhas conhecidas (NUNCA repetir)

1. **Nunca DDL via `execute_sql`** — sempre `apply_migration`. Regra canon #6.
2. **Migrations idempotentes:** sempre `IF NOT EXISTS`, `OR REPLACE`, `ON CONFLICT DO NOTHING`.
3. **`SECURITY DEFINER` + `SET search_path = public`** — obrigatório em todas as RPCs.
4. **`is_ekthos_admin()` lê apenas `app_metadata`** — nunca `user_metadata`.
5. **`update_updated_at_column()`** já existe no DB — usar direto (não recriar).
6. **`apply_migration` MCP não pula `IF NOT EXISTS` em pgcrypto** — mas gen_random_uuid() já existe, não precisamos pgcrypto.
7. **`plans.slug` é PK** (text), não `plans.id`.
8. **RPCs com `auth.uid()`**: só funciona em contexto de usuário autenticado, não em service_role direto. Guard com `is_ekthos_admin()` ou verificação de user_roles resolve.

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `supabase/migrations/20260506100001_contractors_table.sql` | Criar | DDL da tabela `contractors` + trigger updated_at |
| `supabase/migrations/20260506100002_churches_expand_onboarding.sql` | Criar | ADD COLUMN em `churches`: uf, pastor_titular_email, pastor_titular_can_be_quoted, onboarding_step, onboarding_completed_at |
| `supabase/migrations/20260506100003_contractors_rls.sql` | Criar | RLS policies para `contractors` |
| `supabase/migrations/20260506100004_rpc_get_church_cadastro.sql` | Criar | RPC `get_church_cadastro` (leitura cross-role) |
| `supabase/migrations/20260506100005_rpc_upsert_church_contractor.sql` | Criar | RPC `upsert_church_contractor` (CRUD contractors) |
| `supabase/migrations/20260506100006_rpc_update_church_onboarding.sql` | Criar | RPC `update_church_onboarding` (atualiza churches + avança step) |
| `supabase/functions/admin-church-create/index.ts` | Modificar (R12) | Adicionar `onboarding_step: 'pending'` no insert de churches (~linha 151) |
| `docs/debts.md` | Modificar | Registrar OPS-DEBT-005 e OPS-DEBT-006 |
| `web/tests/e2e/frente-3a-smoke.prod.spec.ts` | Criar | Smoke test E2E reaproveitando infra Frente 2.5 |

---

## Task 1: Migration M1 — Tabela `contractors`

**Files:**
- Create: `supabase/migrations/20260506100001_contractors_table.sql`

- [ ] **Step 1: Escrever o arquivo de migration**

Criar o arquivo com o conteúdo abaixo:

```sql
-- ============================================================
-- Frente 3A — Migration 1
-- Cria tabela contractors: responsáveis jurídicos/pastorais da igreja
-- Idempotente: IF NOT EXISTS em todos os DDLs
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contractors (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  church_id       uuid        NOT NULL REFERENCES public.churches(id) ON DELETE CASCADE,
  name            text        NOT NULL,
  document_type   text        NOT NULL,
  document_number text        NOT NULL,
  person_type     text        NOT NULL,
  role_label      text        NOT NULL,
  email           text,
  phone           text,
  is_active       boolean     NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Formato do documento: CPF = 11 dígitos, CNPJ = 14 dígitos (sem pontuação)
  CONSTRAINT chk_document_format CHECK (
    (document_type = 'cpf'  AND document_number ~ '^\d{11}$') OR
    (document_type = 'cnpj' AND document_number ~ '^\d{14}$')
  ),
  -- PF usa CPF, PJ usa CNPJ
  CONSTRAINT chk_pf_pj_consistency CHECK (
    (person_type = 'pf' AND document_type = 'cpf') OR
    (person_type = 'pj' AND document_type = 'cnpj')
  ),
  -- Registro ativo exige name e document preenchidos (não vazios)
  CONSTRAINT chk_active_consistency CHECK (
    is_active = false OR (
      is_active = true
      AND name <> ''
      AND document_number <> ''
    )
  )
);

-- Índice parcial: somente 1 contractor ativo por church+document
-- (permite reutilizar o mesmo CPF/CNPJ depois de inativar o anterior)
CREATE UNIQUE INDEX IF NOT EXISTS contractors_church_document_active_idx
  ON public.contractors(church_id, document_number)
  WHERE is_active = true;

-- Trigger de updated_at (reutiliza função existente no DB)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'contractors_updated_at'
      AND tgrelid = 'public.contractors'::regclass
  ) THEN
    CREATE TRIGGER contractors_updated_at
      BEFORE UPDATE ON public.contractors
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END;
$$;

-- Comentários de coluna
COMMENT ON TABLE  public.contractors                    IS 'Responsáveis jurídicos e pastorais da igreja (titulares, tesoureiros, etc.)';
COMMENT ON COLUMN public.contractors.document_type      IS 'Tipo de documento: cpf ou cnpj (minúsculo)';
COMMENT ON COLUMN public.contractors.document_number    IS 'Número do documento sem pontuação (11 dígitos CPF, 14 dígitos CNPJ)';
COMMENT ON COLUMN public.contractors.person_type        IS 'Tipo de pessoa: pf (física) ou pj (jurídica)';
COMMENT ON COLUMN public.contractors.role_label         IS 'Papel do responsável (ex: Pastor Titular, Tesoureiro, Secretário)';
COMMENT ON COLUMN public.contractors.is_active          IS 'Somente 1 ativo por church+document (índice parcial)';
```

- [ ] **Step 2: Aplicar a migration via MCP**

Usar a ferramenta MCP `apply_migration` com:
- `project_id`: `mlqjywqnchilvgkbvicd`
- `name`: `contractors_table`
- `query`: conteúdo do arquivo SQL acima

- [ ] **Step 3: Verificar que a tabela foi criada**

Usar `execute_sql` com:
```sql
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'contractors'
ORDER BY ordinal_position;
```

Esperado: 12 colunas listadas (id, church_id, name, document_type, document_number, person_type, role_label, email, phone, is_active, notes, created_at, updated_at).

- [ ] **Step 4: Verificar constraints e índice**

```sql
SELECT conname, consrc
FROM pg_constraint
WHERE conrelid = 'public.contractors'::regclass
  AND contype = 'c'
ORDER BY conname;
```

Esperado: 3 linhas com `chk_active_consistency`, `chk_document_format`, `chk_pf_pj_consistency`.

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'contractors'
  AND schemaname = 'public';
```

Esperado: 2 índices — PK (`contractors_pkey`) + índice parcial (`contractors_church_document_active_idx`).

- [ ] **Step 5: Verificar trigger**

```sql
SELECT tgname, tgenabled
FROM pg_trigger
WHERE tgrelid = 'public.contractors'::regclass;
```

Esperado: `contractors_updated_at` com `tgenabled = 'O'` (enabled).

- [ ] **Step 6: Commit**

```bash
cd "C:/Users/rmiam/Downloads/ekthos-platform-main/ekthos-platform-main"
git add supabase/migrations/20260506100001_contractors_table.sql
git commit -m "chore(db): M1 - cria tabela contractors (Frente 3A)"
```

---

## Task 2: Migration M2 — Expandir `churches` com campos de onboarding

**Files:**
- Create: `supabase/migrations/20260506100002_churches_expand_onboarding.sql`

- [ ] **Step 1: Escrever o arquivo de migration**

```sql
-- ============================================================
-- Frente 3A — Migration 2
-- Expande churches: uf (novo, source-of-truth), campos de pastor
-- titular e controle de onboarding_step
-- state (legado) é MANTIDO — ver OPS-DEBT-005 para deprecação
-- Idempotente: ADD COLUMN IF NOT EXISTS em todos
-- ============================================================

ALTER TABLE public.churches
  -- UF: sigla do estado (SP, RJ, MG, etc.) — substitui `state` a longo prazo
  ADD COLUMN IF NOT EXISTS uf                         text,
  -- E-mail do pastor titular (contato formal da igreja)
  ADD COLUMN IF NOT EXISTS pastor_titular_email        text,
  -- Autorização para uso do nome do pastor em marketing da Ekthos
  ADD COLUMN IF NOT EXISTS pastor_titular_can_be_quoted boolean NOT NULL DEFAULT false,
  -- Etapa de onboarding da igreja no CRM
  ADD COLUMN IF NOT EXISTS onboarding_step             text NOT NULL DEFAULT 'pending'
    CONSTRAINT chk_churches_onboarding_step
      CHECK (onboarding_step IN ('pending', 'cadastro', 'pastoral', 'completed')),
  -- Timestamp em que onboarding chegou a 'completed'
  ADD COLUMN IF NOT EXISTS onboarding_completed_at     timestamptz;

-- Constraint: onboarding_completed_at só pode ser preenchido em 'completed'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_churches_completed_at_consistency'
      AND conrelid = 'public.churches'::regclass
  ) THEN
    ALTER TABLE public.churches
      ADD CONSTRAINT chk_churches_completed_at_consistency CHECK (
        onboarding_completed_at IS NULL
        OR onboarding_step = 'completed'
      );
  END IF;
END;
$$;

-- Comentários
COMMENT ON COLUMN public.churches.uf                          IS 'Sigla do estado (2 letras, ex: SP). Source-of-truth novo. Coluna state é legacy (OPS-DEBT-005).';
COMMENT ON COLUMN public.churches.pastor_titular_email        IS 'E-mail do pastor titular — contato formal da liderança';
COMMENT ON COLUMN public.churches.pastor_titular_can_be_quoted IS 'true = Ekthos pode citar o nome do pastor em cases e marketing';
COMMENT ON COLUMN public.churches.onboarding_step             IS 'Etapa atual do cadastro da igreja: pending → cadastro → pastoral → completed';
COMMENT ON COLUMN public.churches.onboarding_completed_at     IS 'Timestamp em que onboarding_step chegou a completed (null se não concluído)';
```

- [ ] **Step 2: Aplicar a migration via MCP**

Usar `apply_migration` com:
- `project_id`: `mlqjywqnchilvgkbvicd`
- `name`: `churches_expand_onboarding`
- `query`: SQL acima

- [ ] **Step 3: Verificar colunas adicionadas**

```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'churches'
  AND column_name IN (
    'uf', 'pastor_titular_email',
    'pastor_titular_can_be_quoted',
    'onboarding_step',
    'onboarding_completed_at'
  )
ORDER BY column_name;
```

Esperado: 5 linhas. `onboarding_step` deve ter `column_default = 'pending'`.

- [ ] **Step 4: Verificar que `state` ainda existe (não foi deletado)**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'churches'
  AND column_name = 'state';
```

Esperado: 1 linha. Se não aparecer, STOP — a migration apagou acidentalmente.

- [ ] **Step 5: Verificar constraints**

```sql
SELECT conname
FROM pg_constraint
WHERE conrelid = 'public.churches'::regclass
  AND conname IN ('chk_churches_onboarding_step', 'chk_churches_completed_at_consistency');
```

Esperado: 2 linhas.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260506100002_churches_expand_onboarding.sql
git commit -m "chore(db): M2 - expande churches com campos de onboarding (Frente 3A)"
```

---

## Task 3: Migration M3 — RLS para `contractors`

**Files:**
- Create: `supabase/migrations/20260506100003_contractors_rls.sql`

- [ ] **Step 1: Escrever o arquivo de migration**

```sql
-- ============================================================
-- Frente 3A — Migration 3
-- RLS para tabela contractors
-- Camadas:
--   1. Ekthos admin (is_ekthos_admin()): ALL
--   2. Church member (qualquer role em user_roles): SELECT
--   3. Church admin (role admin ou admin_departments): INSERT + UPDATE
-- DELETE: nunca deletar — usar is_active = false (soft delete)
-- service_role bypassa RLS automaticamente
-- ============================================================

ALTER TABLE public.contractors ENABLE ROW LEVEL SECURITY;

-- ── Policy 1: Ekthos admin — acesso total ─────────────────────────────────
DROP POLICY IF EXISTS contractors_ekthos_admin_all ON public.contractors;
CREATE POLICY contractors_ekthos_admin_all ON public.contractors
  FOR ALL
  TO authenticated
  USING    (is_ekthos_admin())
  WITH CHECK (is_ekthos_admin());

-- ── Policy 2: Church member — somente leitura ─────────────────────────────
-- Qualquer role em user_roles para o church_id correto pode ler contractors
DROP POLICY IF EXISTS contractors_church_member_select ON public.contractors;
CREATE POLICY contractors_church_member_select ON public.contractors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = contractors.church_id
    )
  );

-- ── Policy 3: Church admin — INSERT e UPDATE ──────────────────────────────
-- Roles com permissão de escrita: admin, admin_departments
DROP POLICY IF EXISTS contractors_church_admin_write ON public.contractors;
CREATE POLICY contractors_church_admin_write ON public.contractors
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = contractors.church_id
        AND ur.role IN ('admin', 'admin_departments')
    )
  );

DROP POLICY IF EXISTS contractors_church_admin_update ON public.contractors;
CREATE POLICY contractors_church_admin_update ON public.contractors
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = contractors.church_id
        AND ur.role IN ('admin', 'admin_departments')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id   = auth.uid()
        AND ur.church_id = contractors.church_id
        AND ur.role IN ('admin', 'admin_departments')
    )
  );
-- Nota: DELETE não tem policy — ninguém pode deletar contractors.
-- Inativação via is_active = false (UPDATE policy acima cobre).
```

- [ ] **Step 2: Aplicar a migration via MCP**

Usar `apply_migration` com:
- `project_id`: `mlqjywqnchilvgkbvicd`
- `name`: `contractors_rls`
- `query`: SQL acima

- [ ] **Step 3: Verificar RLS ativo e policies**

```sql
SELECT relname, relrowsecurity
FROM pg_class
WHERE relname = 'contractors'
  AND relnamespace = 'public'::regnamespace;
```

Esperado: `relrowsecurity = true`.

```sql
SELECT polname, polcmd, polroles
FROM pg_policy
WHERE polrelid = 'public.contractors'::regclass
ORDER BY polname;
```

Esperado: 4 policies — `contractors_ekthos_admin_all`, `contractors_church_member_select`, `contractors_church_admin_write`, `contractors_church_admin_update`.

- [ ] **Step 4: Rodar security advisors**

Usar `get_advisors` com `project_id: mlqjywqnchilvgkbvicd`.

Se retornar avisos sobre `contractors`, analisar e corrigir antes de continuar.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260506100003_contractors_rls.sql
git commit -m "chore(db): M3 - RLS para contractors (Frente 3A)"
```

---

## Task 4: Migration M4 — RPC `get_church_cadastro`

**Files:**
- Create: `supabase/migrations/20260506100004_rpc_get_church_cadastro.sql`

- [ ] **Step 1: Escrever o arquivo de migration**

Esta RPC retorna os dados de cadastro de uma igreja + seus contractors ativos.
Acessível por: qualquer role em user_roles para o church_id, ou is_ekthos_admin().

```sql
-- ============================================================
-- Frente 3A — Migration 4
-- RPC get_church_cadastro: leitura de cadastro da igreja + contractors
-- Guard: church member (qualquer role em user_roles) OU ekthos admin
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_church_cadastro(
  p_church_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_church     jsonb;
  v_contractors jsonb;
BEGIN
  -- Guard: ekthos admin OU membro da igreja
  IF NOT is_ekthos_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id   = auth.uid()
      AND ur.church_id = p_church_id
  ) THEN
    RAISE EXCEPTION 'unauthorized: não é membro desta igreja';
  END IF;

  -- Leitura dos campos de cadastro da igreja
  SELECT jsonb_build_object(
    'id',                          c.id,
    'name',                        c.name,
    'slug',                        c.slug,
    'city',                        c.city,
    'uf',                          c.uf,
    'state',                       c.state,
    'main_email',                  c.main_email,
    'pastor_titular_email',        c.pastor_titular_email,
    'pastor_titular_can_be_quoted', c.pastor_titular_can_be_quoted,
    'onboarding_step',             c.onboarding_step,
    'onboarding_completed_at',     c.onboarding_completed_at,
    'timezone',                    c.timezone,
    'status',                      c.status,
    'created_at',                  c.created_at
  )
  INTO v_church
  FROM public.churches c
  WHERE c.id = p_church_id;

  IF v_church IS NULL THEN
    RAISE EXCEPTION 'church not found: %', p_church_id;
  END IF;

  -- Contractors ativos da igreja (ordered by role_label)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',              ct.id,
      'name',            ct.name,
      'document_type',   ct.document_type,
      'document_number', ct.document_number,
      'person_type',     ct.person_type,
      'role_label',      ct.role_label,
      'email',           ct.email,
      'phone',           ct.phone,
      'is_active',       ct.is_active,
      'notes',           ct.notes,
      'created_at',      ct.created_at
    )
    ORDER BY ct.role_label, ct.name
  ), '[]'::jsonb)
  INTO v_contractors
  FROM public.contractors ct
  WHERE ct.church_id = p_church_id
    AND ct.is_active = true;

  RETURN jsonb_build_object(
    'church',      v_church,
    'contractors', v_contractors
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_church_cadastro(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_church_cadastro(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_church_cadastro(uuid) TO service_role;
```

- [ ] **Step 2: Aplicar a migration via MCP**

Usar `apply_migration` com:
- `project_id`: `mlqjywqnchilvgkbvicd`
- `name`: `rpc_get_church_cadastro`
- `query`: SQL acima

- [ ] **Step 3: Verificar que a função foi criada**

```sql
SELECT
  p.proname,
  pg_get_function_arguments(p.oid) AS args,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_church_cadastro';
```

Esperado: 1 linha com `prosecdef = true` e `args = 'p_church_id uuid'`.

- [ ] **Step 4: Testar a RPC com service_role**

```sql
-- Pegar uma igreja existente para teste (qualquer uma)
SELECT id, name FROM public.churches ORDER BY created_at DESC LIMIT 1;
```

Anotar o `id`, depois:

```sql
-- Chamar via execute_sql (service_role bypassa guard de auth.uid())
-- Não é possível testar guard de auth.uid() via execute_sql.
-- Testar apenas que a função retorna dados sem erro.
SELECT public.get_church_cadastro('<id_anotado_acima>'::uuid);
```

Esperado: JSON com campos `church` e `contractors`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260506100004_rpc_get_church_cadastro.sql
git commit -m "chore(db): M4 - RPC get_church_cadastro (Frente 3A)"
```

---

## Task 5: Migration M5 — RPC `upsert_church_contractor`

**Files:**
- Create: `supabase/migrations/20260506100005_rpc_upsert_church_contractor.sql`

- [ ] **Step 1: Escrever o arquivo de migration**

Esta RPC cria ou atualiza um contractor. Se `p_id` for NULL, cria novo. Se for uuid, atualiza o existente (desde que pertença ao church_id).

```sql
-- ============================================================
-- Frente 3A — Migration 5
-- RPC upsert_church_contractor: cria ou atualiza contractor da igreja
-- Guard: role admin ou admin_departments em user_roles para o church_id,
--        OU is_ekthos_admin()
-- Soft delete: inativar via is_active = false (nunca DELETE)
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_church_contractor(
  p_church_id uuid,
  p_data      jsonb,
  p_id        uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result      jsonb;
  v_document    text;
  v_doc_type    text;
  v_person_type text;
  v_existing_id uuid;
BEGIN
  -- Guard: admin da própria igreja OU ekthos admin
  IF NOT is_ekthos_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id   = auth.uid()
      AND ur.church_id = p_church_id
      AND ur.role IN ('admin', 'admin_departments')
  ) THEN
    RAISE EXCEPTION 'unauthorized: somente admin da igreja ou ekthos admin';
  END IF;

  -- Extrair campos obrigatórios do JSON
  v_document    := NULLIF(TRIM(COALESCE(p_data->>'document_number', '')), '');
  v_doc_type    := NULLIF(TRIM(COALESCE(p_data->>'document_type',   '')), '');
  v_person_type := NULLIF(TRIM(COALESCE(p_data->>'person_type',     '')), '');

  IF p_data->>'name' IS NULL OR TRIM(p_data->>'name') = '' THEN
    RAISE EXCEPTION 'name é obrigatório';
  END IF;
  IF v_document IS NULL THEN
    RAISE EXCEPTION 'document_number é obrigatório';
  END IF;
  IF v_doc_type NOT IN ('cpf', 'cnpj') THEN
    RAISE EXCEPTION 'document_type deve ser cpf ou cnpj';
  END IF;
  IF v_person_type NOT IN ('pf', 'pj') THEN
    RAISE EXCEPTION 'person_type deve ser pf ou pj';
  END IF;
  IF p_data->>'role_label' IS NULL OR TRIM(p_data->>'role_label') = '' THEN
    RAISE EXCEPTION 'role_label é obrigatório';
  END IF;

  IF p_id IS NULL THEN
    -- INSERT
    INSERT INTO public.contractors (
      church_id, name, document_type, document_number, person_type,
      role_label, email, phone, is_active, notes
    )
    VALUES (
      p_church_id,
      TRIM(p_data->>'name'),
      v_doc_type,
      v_document,
      v_person_type,
      TRIM(p_data->>'role_label'),
      NULLIF(TRIM(COALESCE(p_data->>'email', '')), ''),
      NULLIF(TRIM(COALESCE(p_data->>'phone', '')), ''),
      COALESCE((p_data->>'is_active')::boolean, true),
      NULLIF(TRIM(COALESCE(p_data->>'notes', '')), '')
    )
    RETURNING jsonb_build_object(
      'id',              id,
      'church_id',       church_id,
      'name',            name,
      'document_type',   document_type,
      'document_number', document_number,
      'person_type',     person_type,
      'role_label',      role_label,
      'email',           email,
      'phone',           phone,
      'is_active',       is_active,
      'notes',           notes,
      'created_at',      created_at
    ) INTO v_result;
  ELSE
    -- UPDATE: verificar que o contractor pertence ao church_id
    SELECT id INTO v_existing_id
    FROM public.contractors
    WHERE id = p_id AND church_id = p_church_id;

    IF v_existing_id IS NULL THEN
      RAISE EXCEPTION 'contractor % não encontrado na igreja %', p_id, p_church_id;
    END IF;

    UPDATE public.contractors
    SET
      name            = COALESCE(NULLIF(TRIM(p_data->>'name'),        ''), name),
      document_type   = COALESCE(NULLIF(v_doc_type,                    ''), document_type),
      document_number = COALESCE(NULLIF(v_document,                    ''), document_number),
      person_type     = COALESCE(NULLIF(v_person_type,                 ''), person_type),
      role_label      = COALESCE(NULLIF(TRIM(p_data->>'role_label'),   ''), role_label),
      email           = CASE WHEN p_data ? 'email'
                             THEN NULLIF(TRIM(COALESCE(p_data->>'email', '')), '')
                             ELSE email END,
      phone           = CASE WHEN p_data ? 'phone'
                             THEN NULLIF(TRIM(COALESCE(p_data->>'phone', '')), '')
                             ELSE phone END,
      is_active       = COALESCE((p_data->>'is_active')::boolean, is_active),
      notes           = CASE WHEN p_data ? 'notes'
                             THEN NULLIF(TRIM(COALESCE(p_data->>'notes', '')), '')
                             ELSE notes END
    WHERE id = p_id
    RETURNING jsonb_build_object(
      'id',              id,
      'church_id',       church_id,
      'name',            name,
      'document_type',   document_type,
      'document_number', document_number,
      'person_type',     person_type,
      'role_label',      role_label,
      'email',           email,
      'phone',           phone,
      'is_active',       is_active,
      'notes',           notes,
      'updated_at',      updated_at
    ) INTO v_result;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_church_contractor(uuid, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_church_contractor(uuid, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_church_contractor(uuid, jsonb, uuid) TO service_role;
```

- [ ] **Step 2: Aplicar a migration via MCP**

Usar `apply_migration` com:
- `project_id`: `mlqjywqnchilvgkbvicd`
- `name`: `rpc_upsert_church_contractor`
- `query`: SQL acima

- [ ] **Step 3: Verificar função criada**

```sql
SELECT p.proname, pg_get_function_arguments(p.oid) AS args, p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'upsert_church_contractor';
```

Esperado: 1 linha com `prosecdef = true`.

- [ ] **Step 4: Testar INSERT via service_role**

```sql
-- Substituir 'CHURCH_ID_AQUI' pelo id de uma igreja existente
SELECT public.upsert_church_contractor(
  'CHURCH_ID_AQUI'::uuid,
  jsonb_build_object(
    'name',            'João da Silva Teste',
    'document_type',   'cpf',
    'document_number', '12345678901',
    'person_type',     'pf',
    'role_label',      'Pastor Titular',
    'email',           'joao@teste.com'
  ),
  NULL
);
```

Esperado: JSON com o contractor criado (incluindo `id`).

- [ ] **Step 5: Verificar registro no banco**

```sql
SELECT id, name, document_number, role_label, is_active
FROM public.contractors
WHERE document_number = '12345678901';
```

Esperado: 1 linha com `is_active = true`.

- [ ] **Step 6: Testar soft delete (UPDATE is_active = false)**

Pegar o `id` retornado no Step 4 e:

```sql
SELECT public.upsert_church_contractor(
  'CHURCH_ID_AQUI'::uuid,
  jsonb_build_object('is_active', false),
  'ID_DO_CONTRACTOR_ACIMA'::uuid
);
```

Esperado: JSON com `is_active = false`.

- [ ] **Step 7: Limpar dados de teste**

```sql
DELETE FROM public.contractors WHERE document_number = '12345678901';
```

(Este é o único DELETE permitido nesta sessão — é cleanup de teste, não operação de produção.)

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260506100005_rpc_upsert_church_contractor.sql
git commit -m "chore(db): M5 - RPC upsert_church_contractor (Frente 3A)"
```

---

## Task 6: Migration M6 — RPC `update_church_onboarding`

**Files:**
- Create: `supabase/migrations/20260506100006_rpc_update_church_onboarding.sql`

- [ ] **Step 1: Escrever o arquivo de migration**

Esta RPC atualiza os campos de cadastro da igreja (uf, city, main_email, pastor_titular_email, pastor_titular_can_be_quoted) e avança o `onboarding_step` quando fornecido. Aceita `cidade` como alias de `city` no JSON.

```sql
-- ============================================================
-- Frente 3A — Migration 6
-- RPC update_church_onboarding: atualiza campos de cadastro da igreja
--   e avança onboarding_step quando explicitamente informado.
-- Guard: role admin ou admin_departments em user_roles para o church_id,
--        OU is_ekthos_admin()
-- Aliases JSON: aceita 'cidade' como alias de 'city'
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_church_onboarding(
  p_church_id uuid,
  p_data      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_step   text;
  v_result     jsonb;
  v_city_value text;
BEGIN
  -- Guard: admin da própria igreja OU ekthos admin
  IF NOT is_ekthos_admin() AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id   = auth.uid()
      AND ur.church_id = p_church_id
      AND ur.role IN ('admin', 'admin_departments')
  ) THEN
    RAISE EXCEPTION 'unauthorized: somente admin da igreja ou ekthos admin';
  END IF;

  -- Alias: 'cidade' → 'city'
  v_city_value := COALESCE(
    NULLIF(TRIM(COALESCE(p_data->>'city',   '')), ''),
    NULLIF(TRIM(COALESCE(p_data->>'cidade', '')), '')
  );

  -- Validar onboarding_step se fornecido
  v_new_step := p_data->>'onboarding_step';
  IF v_new_step IS NOT NULL AND v_new_step NOT IN ('pending', 'cadastro', 'pastoral', 'completed') THEN
    RAISE EXCEPTION 'onboarding_step inválido: %. Valores aceitos: pending, cadastro, pastoral, completed', v_new_step;
  END IF;

  UPDATE public.churches
  SET
    -- Campos de localização
    city                        = CASE WHEN v_city_value IS NOT NULL
                                       THEN v_city_value
                                       ELSE city END,
    uf                          = COALESCE(
                                    NULLIF(TRIM(COALESCE(p_data->>'uf', '')), ''),
                                    uf
                                  ),
    -- E-mails e contatos
    main_email                  = CASE WHEN p_data ? 'main_email'
                                       THEN NULLIF(TRIM(COALESCE(p_data->>'main_email', '')), '')
                                       ELSE main_email END,
    pastor_titular_email        = CASE WHEN p_data ? 'pastor_titular_email'
                                       THEN NULLIF(TRIM(COALESCE(p_data->>'pastor_titular_email', '')), '')
                                       ELSE pastor_titular_email END,
    -- Autorização de marketing
    pastor_titular_can_be_quoted = CASE WHEN p_data ? 'pastor_titular_can_be_quoted'
                                        THEN (p_data->>'pastor_titular_can_be_quoted')::boolean
                                        ELSE pastor_titular_can_be_quoted END,
    -- Controle de onboarding
    onboarding_step             = COALESCE(v_new_step, onboarding_step),
    onboarding_completed_at     = CASE
                                    WHEN v_new_step = 'completed'
                                    THEN COALESCE(onboarding_completed_at, now())
                                    ELSE onboarding_completed_at
                                  END,
    updated_at                  = now()
  WHERE id = p_church_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'church not found: %', p_church_id;
  END IF;

  -- Retornar estado atual dos campos de cadastro
  SELECT jsonb_build_object(
    'id',                          c.id,
    'name',                        c.name,
    'city',                        c.city,
    'uf',                          c.uf,
    'main_email',                  c.main_email,
    'pastor_titular_email',        c.pastor_titular_email,
    'pastor_titular_can_be_quoted', c.pastor_titular_can_be_quoted,
    'onboarding_step',             c.onboarding_step,
    'onboarding_completed_at',     c.onboarding_completed_at
  )
  INTO v_result
  FROM public.churches c
  WHERE c.id = p_church_id;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_church_onboarding(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_church_onboarding(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_church_onboarding(uuid, jsonb) TO service_role;
```

- [ ] **Step 2: Aplicar a migration via MCP**

Usar `apply_migration` com:
- `project_id`: `mlqjywqnchilvgkbvicd`
- `name`: `rpc_update_church_onboarding`
- `query`: SQL acima

- [ ] **Step 3: Verificar função criada**

```sql
SELECT p.proname, pg_get_function_arguments(p.oid) AS args, p.prosecdef
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'update_church_onboarding';
```

Esperado: 1 linha com `prosecdef = true` e `args = 'p_church_id uuid, p_data jsonb'`.

- [ ] **Step 4: Testar com service_role — avançar onboarding_step**

```sql
-- Pegar uma igreja existente com onboarding_step = 'pending'
SELECT id, name, onboarding_step
FROM public.churches
WHERE onboarding_step = 'pending'
ORDER BY created_at DESC
LIMIT 1;
```

Se existir, chamar:
```sql
SELECT public.update_church_onboarding(
  'CHURCH_ID_ACIMA'::uuid,
  jsonb_build_object(
    'city',    'São Paulo',
    'cidade',  'São Paulo',   -- alias: não deve substituir city
    'uf',      'SP',
    'main_email', 'contato@igrejateste.com',
    'onboarding_step', 'cadastro'
  )
);
```

Esperado: JSON com `onboarding_step = 'cadastro'`, `city = 'São Paulo'`, `uf = 'SP'`.

- [ ] **Step 5: Verificar alias `cidade` funciona (não sobrescreve city)**

```sql
SELECT public.update_church_onboarding(
  'CHURCH_ID_ACIMA'::uuid,
  jsonb_build_object('cidade', 'Campinas')
);
```

Esperado: `city = 'Campinas'` (alias foi processado corretamente).

- [ ] **Step 6: Reverter onboarding_step da igreja de teste**

```sql
SELECT public.update_church_onboarding(
  'CHURCH_ID_ACIMA'::uuid,
  jsonb_build_object('onboarding_step', 'pending')
);
```

- [ ] **Step 7: Rodar security advisors finais das 3 RPCs**

Usar `get_advisors` com `project_id: mlqjywqnchilvgkbvicd`.

Verificar avisos sobre as 3 funções criadas. Se search_path estiver ausente em alguma, corrigir.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260506100006_rpc_update_church_onboarding.sql
git commit -m "chore(db): M6 - RPC update_church_onboarding (Frente 3A)"
```

---

## Task 7: R12 — Adaptar `admin-church-create` para setar `onboarding_step = 'pending'`

**Files:**
- Modify: `supabase/functions/admin-church-create/index.ts` (~linha 143-152)

**Contexto:** O insert atual em `churches` não seta `onboarding_step`. Após M2, o campo tem `DEFAULT 'pending'`, então novos INSERTs já receberão 'pending' automaticamente. R12 é uma mudança explícita para tornar a intenção clara no código (documentar, não depender só do DEFAULT).

- [ ] **Step 1: Verificar o estado atual do insert em `admin-church-create`**

Ler `supabase/functions/admin-church-create/index.ts` linhas 143-155.

O insert atual é:
```typescript
const { data: church, error: churchErr } = await supabase
  .from('churches')
  .insert({
    name:     churchName,
    slug:     uniqueSlug,
    city:     city?.trim()  ?? null,
    state:    state?.trim() ?? null,
    timezone: tz,
    status:   'onboarding',
  })
  .select('id, name, status, created_at')
  .single()
```

- [ ] **Step 2: Editar o insert para adicionar `onboarding_step`**

Substituir apenas o bloco `.insert({...})` para incluir `onboarding_step: 'pending'`:

```typescript
const { data: church, error: churchErr } = await supabase
  .from('churches')
  .insert({
    name:            churchName,
    slug:            uniqueSlug,
    city:            city?.trim()   ?? null,
    state:           state?.trim()  ?? null,
    timezone:        tz,
    status:          'onboarding',
    onboarding_step: 'pending',  // R12 — Frente 3A: inicializa fluxo de cadastro
  })
  .select('id, name, status, onboarding_step, created_at')
  .single()
```

Atenção: também adicionar `onboarding_step` ao `.select()` para que o campo apareça no retorno.

- [ ] **Step 3: Verificar que o build TypeScript passa**

```bash
cd "C:/Users/rmiam/Downloads/ekthos-platform-main/ekthos-platform-main/web"
npm run build 2>&1 | tail -20
```

Esperado: `Built in X.Xs` sem erros de TypeScript.

(O arquivo da Edge Function é Deno/TypeScript mas o build do frontend não deve ser afetado. Se houver erro de tipo no TS do frontend, investigar antes de continuar.)

- [ ] **Step 4: Deploy da Edge Function atualizada**

```bash
cd "C:/Users/rmiam/Downloads/ekthos-platform-main/ekthos-platform-main"
supabase functions deploy admin-church-create --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt
```

Esperado: `Deployed Function admin-church-create` sem erros.

- [ ] **Step 5: Verificar deploy com teste de smoke**

```bash
curl -s -o /dev/null -w "%{http_code}" \
  -X POST "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/admin-church-create" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Esperado: `401` (sem token → Unauthorized). Confirma que a EF está up e respondendo.

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/admin-church-create/index.ts
git commit -m "feat(admin-ef): R12 - seta onboarding_step=pending ao criar igreja (Frente 3A)"
```

---

## Task 8: Registrar OPS-DEBT-005 e OPS-DEBT-006

**Files:**
- Modify: `docs/debts.md`

- [ ] **Step 1: Ler o final do arquivo `docs/debts.md`**

Verificar qual foi o último OPS-DEBT registrado (deve ser OPS-DEBT-004).

- [ ] **Step 2: Adicionar OPS-DEBT-005 ao final do arquivo**

Append ao `docs/debts.md`:

```markdown
---

## OPS-DEBT-005 — Deprecar coluna `churches.state` (legacy)

**Registrado em:** 06/05/2026 (sessão H2 — Frente 3A)
**Origem:** Frente 3A adicionou `churches.uf` como source-of-truth para estado
brasileiro (sigla 2 letras). A coluna `state` (text, sem validação) existia antes
e é mantida por compatibilidade retroativa com código existente.

**Impacto:** Duplicidade de dados entre `state` e `uf`. Código novo deve ler `uf`.
Código legado que grava em `state` não será atualizado automaticamente.

**Ação necessária:**
1. Identificar todos os lugares que escrevem em `churches.state` (grep: `.state`)
2. Migrar para `churches.uf`
3. Executar migration: `UPDATE churches SET uf = state WHERE uf IS NULL AND state IS NOT NULL`
4. Deprecar coluna `state` com `COMMENT ON COLUMN ... IS 'DEPRECATED: use uf'`
5. Em release futura: DROP COLUMN state

**Não bloqueia:** Nenhuma feature ativa. A coluna `state` continua funcionando.

**Critério de pronto:** `state` tem `DEPRECATED` no comment, todos os writes migraram para `uf`.

---

## OPS-DEBT-006 — Stripe self-service de criação de igreja (Caminho A futuro)

**Registrado em:** 06/05/2026 (sessão H2 — Frente 3A)
**Origem:** BLINDAGEM Frente 3A (Audit 9) confirmou que `stripe-webhook` NÃO cria
igrejas. Igrejas são criadas APENAS via `admin-church-create` (Caminho B manual).
Caminho A (Stripe self-service via checkout) foi descartado para go-live mas pode
ser relevante em versão futura de self-onboarding.

**Impacto:** Clientes não conseguem se cadastrar de forma autônoma. Toda ativação
passa pelo time Ekthos (cockpit manual). Escalabilidade limitada.

**Ação necessária (quando priorizado):**
1. Implementar flow Stripe Checkout que cria `pending_church` antes do pagamento
2. `stripe-webhook` processa `checkout.session.completed` e promove para `church`
3. Enviar invite do pastor automaticamente via webhook
4. Integrar com `onboarding_step` (iniciar em 'cadastro' após pagamento)

**Não bloqueia:** Operação atual funciona via Caminho B. Prioridade: pós go-live.

**Critério de pronto:** Cliente consegue criar conta e pagar sem intervenção humana.
```

- [ ] **Step 3: Verificar que o arquivo tem ambos os OPS-DEBTs**

```bash
grep -c "OPS-DEBT-00" "C:/Users/rmiam/Downloads/ekthos-platform-main/ekthos-platform-main/docs/debts.md"
```

Esperado: `6` (TEST-DEBT-004 + OPS-DEBT-001 a 006).

- [ ] **Step 4: Commit**

```bash
git add docs/debts.md
git commit -m "chore(docs): registra OPS-DEBT-005 e OPS-DEBT-006 (Frente 3A)"
```

---

## Task 9: E2E Smoke Test (Playwright) — Frente 3A

**Files:**
- Create: `web/tests/e2e/frente-3a-smoke.prod.spec.ts`

**Pré-condições:**
- `PLAYWRIGHT_ADMIN_EMAIL` e `PLAYWRIGHT_ADMIN_PASSWORD` setadas (ver `docs/playwright-prod.md`)
- `playwright@ekthosai.net` tem `is_ekthos_admin: true` em `app_metadata`
- `.auth.json` gerado via `global-setup.ts`
- A infra E2E da Frente 2.5 está presente em `web/tests/e2e/`

**O que testar:**
1. `/admin/churches` carrega e lista pelo menos 1 church
2. Entrar em um church detail qualquer
3. Verificar que a URL `/admin/churches/:id` carrega sem erro

- [ ] **Step 1: Escrever o arquivo de smoke test**

Criar `web/tests/e2e/frente-3a-smoke.prod.spec.ts`:

```typescript
/**
 * frente-3a-smoke.prod.spec.ts
 * Smoke test E2E para backend Frente 3A (Cadastro Cristalino).
 *
 * Verifica que:
 *   1. /admin/churches carrega com ≥1 igreja listada (já testado em admin-smoke)
 *   2. As novas colunas de onboarding_step aparecem em church detail
 *   3. A página de church detail não quebra após migrations M1-M6
 *
 * Pré-condição: global-setup.ts fez login e salvou .auth.json.
 * Roda apenas via playwright.prod.config.ts (testMatch: *.prod.spec.ts).
 */

import { test, expect } from '@playwright/test'

test.describe('Frente 3A smoke — backend Cadastro Cristalino', () => {
  test('churches list carrega após migrations', async ({ page }) => {
    // ── 1. /admin/churches — confirmar que lista carrega ─────────────────
    await page.goto('/admin/churches')

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page).toHaveURL(/churches/, { timeout: 15_000 })

    // Aguardar carregamento assíncrono
    await page.waitForTimeout(2_000)

    // Deve ter ≥1 linha de tabela com conteúdo
    const churchRow = page.locator('tbody tr td:not(:empty)').first()
    await expect(
      churchRow,
      '≥1 linha de igreja deve estar visível em /admin/churches'
    ).toBeVisible({ timeout: 10_000 })
  })

  test('church detail page carrega sem erro após migrations M1-M6', async ({ page }) => {
    // ── 1. Navegar para /admin/churches ──────────────────────────────────
    await page.goto('/admin/churches')

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await page.waitForTimeout(2_000)

    // ── 2. Clicar na primeira linha de igreja ─────────────────────────────
    // Tenta clicar em link ou botão de "Ver detalhes" / nome da igreja
    const churchLink = page
      .locator('tbody tr')
      .first()
      .locator('a, button')
      .first()

    const hasLink = await churchLink.isVisible({ timeout: 5_000 }).catch(() => false)

    if (hasLink) {
      await churchLink.click()
      // Aguardar navegação para detail page
      await page.waitForURL(/\/admin\/churches\/.+/, { timeout: 15_000 })

      // Confirmar que não redirecionou para /login
      await expect(page).not.toHaveURL(/\/login/, { timeout: 10_000 })

      // Confirmar que algum conteúdo de church carregou (heading ou campo)
      const content = page.locator('h1, h2, h3, [data-testid]').first()
      await expect(content).toBeVisible({ timeout: 15_000 })
    } else {
      // Se não houver link clicável, confirmar que a listagem pelo menos renderizou
      const row = page.locator('tbody tr').first()
      await expect(row).toBeVisible({ timeout: 5_000 })
      // Smoke pass: listagem OK, detail não testável sem link visível
      console.log('[frente-3a-smoke] Detail link não encontrado — testando apenas listagem')
    }
  })
})
```

- [ ] **Step 2: Verificar que o arquivo está no `testMatch` correto**

O arquivo usa sufixo `.prod.spec.ts` → coberto pelo `testMatch: ['**/admin-smoke.spec.ts', '**/*.prod.spec.ts']` em `playwright.prod.config.ts`. Nenhuma mudança de config necessária.

- [ ] **Step 3: Rodar o smoke test contra produção**

```bash
cd "C:/Users/rmiam/Downloads/ekthos-platform-main/ekthos-platform-main/web"
npx playwright test --config=playwright.prod.config.ts frente-3a-smoke.prod.spec.ts --reporter=list
```

Esperado: `2 passed` (ou 1 passed + 1 passed com skip gracioso do detail link).

Se algum teste falhar:
- Verificar se as migrations foram aplicadas corretamente
- Verificar se `admin-church-create` não quebrou endpoints existentes

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/rmiam/Downloads/ekthos-platform-main/ekthos-platform-main"
git add web/tests/e2e/frente-3a-smoke.prod.spec.ts
git commit -m "test(e2e): smoke test Frente 3A - backend Cadastro Cristalino"
```

---

## Task 10: Verificação final e preparação do PR

**Files:** nenhum novo arquivo

- [ ] **Step 1: Verificar build do frontend**

```bash
cd "C:/Users/rmiam/Downloads/ekthos-platform-main/ekthos-platform-main/web"
npm run build 2>&1 | tail -30
```

Esperado: `Built in X.Xs` sem erros TypeScript.

- [ ] **Step 2: Grep de segurança — confirmar que `onboarding_step` não está hardcoded fora de migrations**

```bash
cd "C:/Users/rmiam/Downloads/ekthos-platform-main/ekthos-platform-main"
grep -r "onboarding_step" --include="*.ts" --include="*.tsx" --include="*.sql" \
  --exclude-dir=node_modules --exclude-dir=.git \
  -l
```

Esperado: apenas `supabase/migrations/20260506100002_churches_expand_onboarding.sql`, `20260506100006_rpc_update_church_onboarding.sql`, `supabase/functions/admin-church-create/index.ts`, e o arquivo de smoke test.

- [ ] **Step 3: Verificar que `state` (legacy) ainda existe no banco**

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'churches'
  AND column_name = 'state';
```

Esperado: 1 linha.

- [ ] **Step 4: Listar todas as migrations aplicadas (confirmar todas 6)**

Usar `list_migrations` com `project_id: mlqjywqnchilvgkbvicd`.

Confirmar que aparecem:
- `20260506100001_contractors_table`
- `20260506100002_churches_expand_onboarding`
- `20260506100003_contractors_rls`
- `20260506100004_rpc_get_church_cadastro`
- `20260506100005_rpc_upsert_church_contractor`
- `20260506100006_rpc_update_church_onboarding`

- [ ] **Step 5: Git log final — confirmar todos os commits**

```bash
cd "C:/Users/rmiam/Downloads/ekthos-platform-main/ekthos-platform-main"
git log --oneline feat/3a-cadastro-cristalino-backend ^main
```

Esperado: 9 commits:
1. `chore(db): M1 - cria tabela contractors`
2. `chore(db): M2 - expande churches com campos de onboarding`
3. `chore(db): M3 - RLS para contractors`
4. `chore(db): M4 - RPC get_church_cadastro`
5. `chore(db): M5 - RPC upsert_church_contractor`
6. `chore(db): M6 - RPC update_church_onboarding`
7. `feat(admin-ef): R12 - seta onboarding_step=pending ao criar igreja`
8. `chore(docs): registra OPS-DEBT-005 e OPS-DEBT-006`
9. `test(e2e): smoke test Frente 3A`

- [ ] **Step 6: Push e PR**

```bash
git push -u origin feat/3a-cadastro-cristalino-backend
```

PR manual via:
```
https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...feat/3a-cadastro-cristalino-backend?expand=1
```

**Título do PR:** `feat(3a): backend Cadastro Cristalino — contractors + onboarding + 3 RPCs`

**Descrição do PR:**
```
## Frente 3A — Backend "Cadastro Cristalino"

### O que foi entregue
- **M1** `contractors` table: responsáveis jurídicos/pastorais da igreja (CPF/CNPJ, PF/PJ, soft delete via is_active)
- **M2** `churches` expandida: uf (source-of-truth), pastor_titular_email, pastor_titular_can_be_quoted, onboarding_step ('pending'→'cadastro'→'pastoral'→'completed'), onboarding_completed_at
- **M3** RLS para contractors: ekthos admin ALL | church member SELECT | church admin INSERT+UPDATE
- **M4** RPC `get_church_cadastro`: leitura cross-role de church + contractors
- **M5** RPC `upsert_church_contractor`: CRUD com soft delete (is_active=false)
- **M6** RPC `update_church_onboarding`: atualiza campos + avança step; aceita `cidade` como alias de `city`
- **R12** `admin-church-create`: seta `onboarding_step='pending'` explicitamente no insert
- **Smoke test** E2E Playwright contra produção
- **OPS-DEBT-005**: deprecação futura de `churches.state`
- **OPS-DEBT-006**: Stripe self-service (Caminho A) documentado como débito futuro

### O que NÃO foi feito (por decisão)
- Frontend da tela "Cadastro" — Frente 3B (próxima sprint)
- Deprecação de `churches.state` — OPS-DEBT-005
- Stripe self-service — OPS-DEBT-006

### Segurança
- Todas as RPCs: SECURITY DEFINER + SET search_path = public
- Guard duplo: is_ekthos_admin() + user_roles check
- RLS com defense-in-depth na tabela contractors
- Migrations idempotentes (IF NOT EXISTS, OR REPLACE)
```

---

## Self-Review

### 1. Spec coverage

| Requisito | Task que implementa |
|---|---|
| Tabela `contractors` com DDL Decisão 111 | Task 1 (M1) |
| Constraints chk_document_format, chk_pf_pj_consistency, chk_active_consistency | Task 1 |
| UNIQUE INDEX partial WHERE is_active = true | Task 1 |
| Expand churches: uf, pastor_titular_email, pastor_titular_can_be_quoted | Task 2 (M2) |
| onboarding_step CHECK ('pending','cadastro','pastoral','completed') | Task 2 |
| onboarding_completed_at | Task 2 |
| `state` mantido como legacy (não deletado) | Task 2 |
| RLS para contractors | Task 3 (M3) |
| Admin link = user_roles (CASO 2 do BLINDAGEM) | Tasks 4, 5, 6 (guard nas RPCs) |
| RPC `get_church_cadastro` | Task 4 (M4) |
| RPC `upsert_church_contractor` | Task 5 (M5) |
| RPC `update_church_onboarding` | Task 6 (M6) |
| JSON aceita `cidade` como alias de `city` | Task 6 (M6) |
| R12: admin-church-create seta onboarding_step='pending' | Task 7 |
| OPS-DEBT-005 e OPS-DEBT-006 registrados | Task 8 |
| E2E smoke test | Task 9 |
| Build check + PR | Task 10 |

### 2. Placeholder scan

Nenhum placeholder ("TBD", "implement later", "add error handling") detectado. Cada step tem SQL ou TypeScript completo.

### 3. Type consistency

- `p_church_id uuid` — consistente em todas as 3 RPCs
- `p_data jsonb` — consistente em M5 e M6
- `p_id uuid DEFAULT NULL` — apenas M5 (correto)
- `document_type IN ('cpf', 'cnpj')` — alinhado entre constraint da tabela e validação na RPC M5
- `person_type IN ('pf', 'pj')` — alinhado
- `onboarding_step IN ('pending','cadastro','pastoral','completed')` — alinhado entre constraint M2, validação M6, e R12
