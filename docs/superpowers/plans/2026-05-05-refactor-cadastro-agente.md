# Refactor Cirúrgico — Separar Cadastro da Igreja vs Config do Agente

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mover os 12 campos de identidade da Igreja para fora do `AgentCockpitFormState` e criar uma aba "Cadastro" dedicada em `Church.tsx`, deixando `TabIdentidade` apenas com os 3 overrides do agente.

**Architecture:** Hook `useChurchIdentity` lê/grava diretamente via RLS na tabela `churches`. A aba "Cadastro" em `Church.tsx` usa esse hook. `TabIdentidade` no `AgentConfigCockpit` vira read-only para dados da igreja e mantém apenas os 3 campos de override do agente (`agent_name`, `pastor_name`, `church_name_short`). `admin-church-detail` EF já retorna os campos de identidade — precisa apenas de ajuste no response mapping.

**Tech Stack:** React + TypeScript, Supabase JS (RLS direto), React Router (useSearchParams), Tailwind CSS

---

## Mapeamento de Arquivos

| Ação | Arquivo | Responsabilidade |
|------|---------|------------------|
| CREATE | `supabase/migrations/20260506000001_churches_add_main_email.sql` | ADD COLUMN main_email na tabela churches |
| CREATE | `web/src/hooks/useChurchIdentity.ts` | Load/save da identidade da Igreja via RLS direto |
| MODIFY | `web/src/pages/admin/Church.tsx` | Adicionar aba "Cadastro" + suporte ?tab=cadastro + TabCadastro inline |
| MODIFY | `supabase/functions/admin-church-detail/index.ts` | Retornar campos de identidade no response (pastor_titular_name, denomination, etc.) |
| MODIFY | `web/src/pages/admin/agent-tabs/TabIdentidade.tsx` | Remover 12 inputs editáveis → bloco read-only + link p/ Cadastro + 3 overrides |
| MODIFY | `web/src/types/churchAgentConfig.ts` | Remover 12 church_* fields de AgentCockpitFormState |
| MODIFY | `web/src/hooks/useChurchAgentConfig.ts` | Remover 12 church_* de EMPTY_FORM, hydrateForm, saveIdentidade |

---

## Task 1: Branch + Migration

**Files:**
- Create: `supabase/migrations/20260506000001_churches_add_main_email.sql`

- [ ] **Step 1: Criar branch de trabalho**

```bash
cd "C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main"
git checkout -b refactor/separate-church-from-agent-config
```

Expected: `Switched to a new branch 'refactor/separate-church-from-agent-config'`

- [ ] **Step 2: Criar arquivo de migration**

Conteúdo do arquivo `supabase/migrations/20260506000001_churches_add_main_email.sql`:

```sql
-- Migration: add main_email to churches (Opção A aprovada)
-- Utilizado para email de contato principal da Igreja, editável via aba Cadastro

ALTER TABLE public.churches
  ADD COLUMN IF NOT EXISTS main_email text;

COMMENT ON COLUMN public.churches.main_email IS
  'E-mail principal de contato da Igreja (preenchido pelo admin Ekthos)';
```

- [ ] **Step 3: Verificar que a migration existe**

```bash
ls "C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main\supabase\migrations\" | grep main_email
```

Expected: `20260506000001_churches_add_main_email.sql`

---

## Task 2: Hook useChurchIdentity

**Files:**
- Create: `web/src/hooks/useChurchIdentity.ts`

- [ ] **Step 1: Criar o hook**

Conteúdo completo de `web/src/hooks/useChurchIdentity.ts`:

```typescript
/**
 * useChurchIdentity — Load/save dos dados de identidade de uma Igreja
 *
 * Lê e grava diretamente na tabela churches via RLS.
 * A política churches_admin_update (is_ekthos_admin() FOR UPDATE) permite
 * que admins Ekthos façam UPDATE sem precisar de Edge Function ou RPC.
 *
 * Usado pela aba "Cadastro" em Church.tsx (admin cockpit).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export interface ChurchIdentityFields {
  name: string
  city: string
  state: string
  region: string
  denomination: string
  vision_statement: string
  address_full: string
  main_phone: string
  main_email: string
  website_url: string
  pastor_titular_name: string
  pastor_titular_phone: string
  social_media_handles: { instagram?: string; youtube?: string; facebook?: string }
  timezone: string
}

const EMPTY: ChurchIdentityFields = {
  name: '', city: '', state: '', region: '',
  denomination: '', vision_statement: '', address_full: '',
  main_phone: '', main_email: '', website_url: '',
  pastor_titular_name: '', pastor_titular_phone: '',
  social_media_handles: {},
  timezone: 'America/Sao_Paulo',
}

export function useChurchIdentity(churchId: string) {
  const [fields, setFields] = useState<ChurchIdentityFields>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  const showToast = useCallback((ok: boolean, msg: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setToast({ ok, msg })
    timerRef.current = setTimeout(() => setToast(null), 5000)
  }, [])

  // Load
  useEffect(() => {
    if (!churchId) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('churches')
      .select([
        'name', 'city', 'state', 'region', 'denomination',
        'vision_statement', 'address_full', 'main_phone', 'main_email',
        'website_url', 'pastor_titular_name', 'pastor_titular_phone',
        'social_media_handles', 'timezone',
      ].join(','))
      .eq('id', churchId)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { showToast(false, error.message); return }
        setFields({
          name:                   data?.name                   ?? '',
          city:                   data?.city                   ?? '',
          state:                  data?.state                  ?? '',
          region:                 data?.region                 ?? '',
          denomination:           data?.denomination           ?? '',
          vision_statement:       data?.vision_statement       ?? '',
          address_full:           data?.address_full           ?? '',
          main_phone:             data?.main_phone             ?? '',
          main_email:             data?.main_email             ?? '',
          website_url:            data?.website_url            ?? '',
          pastor_titular_name:    data?.pastor_titular_name    ?? '',
          pastor_titular_phone:   data?.pastor_titular_phone   ?? '',
          social_media_handles:   (data?.social_media_handles as ChurchIdentityFields['social_media_handles']) ?? {},
          timezone:               data?.timezone               ?? 'America/Sao_Paulo',
        })
        setDirty(false)
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [churchId, showToast])

  const update = useCallback(<K extends keyof ChurchIdentityFields>(
    key: K, value: ChurchIdentityFields[K]
  ) => {
    setFields(prev => ({ ...prev, [key]: value }))
    setDirty(true)
  }, [])

  const save = useCallback(async () => {
    setSaving(true)
    const { error } = await supabase
      .from('churches')
      .update({
        name:                  fields.name                  || undefined,
        city:                  fields.city                  || undefined,
        state:                 fields.state                 || undefined,
        region:                fields.region                || undefined,
        denomination:          fields.denomination          || undefined,
        vision_statement:      fields.vision_statement      || undefined,
        address_full:          fields.address_full          || undefined,
        main_phone:            fields.main_phone            || undefined,
        main_email:            fields.main_email            || undefined,
        website_url:           fields.website_url           || undefined,
        pastor_titular_name:   fields.pastor_titular_name   || undefined,
        pastor_titular_phone:  fields.pastor_titular_phone  || undefined,
        social_media_handles:  Object.keys(fields.social_media_handles).length > 0
          ? fields.social_media_handles : undefined,
        timezone:              fields.timezone              || undefined,
      })
      .eq('id', churchId)
    setSaving(false)
    if (error) {
      showToast(false, error.message)
    } else {
      setDirty(false)
      showToast(true, 'Cadastro salvo com sucesso.')
    }
  }, [churchId, fields, showToast])

  return { fields, update, loading, saving, dirty, toast, save }
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd "C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main\web"
npx tsc --noEmit --project tsconfig.json 2>&1 | head -30
```

Expected: zero erros referentes a `useChurchIdentity.ts`

---

## Task 3: admin-church-detail EF — adicionar campos de identidade no response

**Files:**
- Modify: `supabase/functions/admin-church-detail/index.ts`

O response da EF já busca `church.*` via `.select('*')` (linha 74). Basta adicionar os campos ao objeto de retorno (linhas 230-284). Atualmente o retorno inclui `city`, `state`, `name` mas não inclui `pastor_titular_name`, `denomination`, `vision_statement`, `address_full`, `main_phone`, `main_email`, `website_url`, `social_media_handles`, `region`.

- [ ] **Step 1: Adicionar campos ao objeto de retorno da EF**

No arquivo `supabase/functions/admin-church-detail/index.ts`, localizar o bloco `return json({` (linha 230) e adicionar os campos de identidade após `is_matrix`/`parent_church_id`:

Os campos `church.*` já chegam completos via `.select('*')` — só precisamos expô-los no response.

Adicionar APÓS `parent_church_id: church.parent_church_id ?? null,` (linha 241):

```typescript
    // Identidade (campos editáveis na aba Cadastro)
    pastor_titular_name:   church.pastor_titular_name   ?? null,
    pastor_titular_phone:  church.pastor_titular_phone  ?? null,
    denomination:          church.denomination          ?? null,
    vision_statement:      church.vision_statement      ?? null,
    address_full:          church.address_full          ?? null,
    main_phone:            church.main_phone            ?? null,
    main_email:            church.main_email            ?? null,
    website_url:           church.website_url           ?? null,
    social_media_handles:  church.social_media_handles  ?? {},
    region:                church.region                ?? null,
```

- [ ] **Step 2: Verificar que o arquivo ficou correto**

```bash
grep -n "pastor_titular_name" "C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main\supabase\functions\admin-church-detail\index.ts"
```

Expected: linha com `pastor_titular_name: church.pastor_titular_name ?? null`

---

## Task 4: Church.tsx — Tab "Cadastro" + TabCadastro + ?tab=cadastro

**Files:**
- Modify: `web/src/pages/admin/Church.tsx`

Esta é a maior mudança. Precisamos:
1. Adicionar `useSearchParams` para suporte a `?tab=cadastro`
2. Inserir tab "Cadastro" entre "Resumo" e "Assinatura"
3. Adicionar campos de identidade ao `ChurchDetail` interface
4. Implementar `TabCadastro` como componente interno (usa `useChurchIdentity`)
5. Renderizar `<TabCadastro>` no switch de tabs

- [ ] **Step 1: Ler o arquivo Church.tsx completo**

Antes de editar, ler o arquivo completo para confirmar a estrutura atual.

- [ ] **Step 2: Adicionar imports e atualizar ChurchDetail**

Em `Church.tsx`, localizar a seção de imports e o `interface ChurchDetail`. Adicionar:

```typescript
// Novos imports (adicionar junto com os existentes):
import { useSearchParams } from 'react-router-dom'
import { UserCheck, CheckCircle2, XCircle } from 'lucide-react'  // UserCheck provavelmente falta
import { useChurchIdentity } from '@/hooks/useChurchIdentity'

// Na interface ChurchDetail, adicionar após `parent_church_id`:
  pastor_titular_name:   string | null
  pastor_titular_phone:  string | null
  denomination:          string | null
  vision_statement:      string | null
  address_full:          string | null
  main_phone:            string | null
  main_email:            string | null
  website_url:           string | null
  social_media_handles:  { instagram?: string; youtube?: string; facebook?: string } | null
  region:                string | null
```

- [ ] **Step 3: Adicionar tab "Cadastro" ao array TABS**

Localizar o array `TABS` em Church.tsx e inserir `{ id: 'cadastro', label: 'Cadastro', icon: <UserCheck size={14} /> }` entre `resumo` e `assinatura`:

```typescript
const TABS = [
  { id: 'resumo',      label: 'Resumo',          icon: <Building2    size={14} /> },
  { id: 'cadastro',    label: 'Cadastro',         icon: <UserCheck    size={14} /> },  // NOVO
  { id: 'assinatura',  label: 'Assinatura',       icon: <CreditCard   size={14} /> },
  // ... resto igual
]
```

- [ ] **Step 4: Adicionar suporte a ?tab=cadastro (useSearchParams)**

Na função principal do componente `export default function ChurchPage()`, substituir o `useState` de activeTab por `useSearchParams`:

```typescript
// Antes:
const [activeTab, setActiveTab] = useState('resumo')

// Depois:
const [searchParams, setSearchParams] = useSearchParams()
const activeTab = searchParams.get('tab') ?? 'resumo'
const setActiveTab = (tab: string) => setSearchParams({ tab }, { replace: true })
```

- [ ] **Step 5: Criar componente TabCadastro interno**

Adicionar antes do `export default function ChurchPage()` (ou dentro, como componente interno):

```typescript
function TabCadastro({ churchId }: { churchId: string }) {
  const { fields, update, loading, saving, dirty, toast, save } = useChurchIdentity(churchId)

  const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500] transition-colors'

  if (loading) {
    return <div className="flex items-center justify-center h-32"><div className="w-5 h-5 border-2 border-[#e13500] border-t-transparent rounded-full animate-spin" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          toast.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {toast.ok ? <CheckCircle2 size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-600" />}
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Igreja</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome da Igreja</label>
          <input className={inputCls} value={fields.name} onChange={e => update('name', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
            <input className={inputCls} value={fields.city} onChange={e => update('city', e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Estado (UF)</label>
            <input className={inputCls} maxLength={2} value={fields.state} onChange={e => update('state', e.target.value.toUpperCase())} />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Região / Bairro</label>
          <input className={inputCls} value={fields.region} onChange={e => update('region', e.target.value)} />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Denominação</label>
          <input className={inputCls} placeholder="ex: Assembleia de Deus" value={fields.denomination} onChange={e => update('denomination', e.target.value)} />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Visão / Missão</label>
          <textarea className={inputCls} rows={3} maxLength={500} value={fields.vision_statement} onChange={e => update('vision_statement', e.target.value)} />
          <p className="mt-1 text-xs text-gray-400">Até 500 caracteres</p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Completo</label>
          <input className={inputCls} value={fields.address_full} onChange={e => update('address_full', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone Principal</label>
            <input className={inputCls} type="tel" value={fields.main_phone} onChange={e => update('main_phone', e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail Principal</label>
            <input className={inputCls} type="email" value={fields.main_email} onChange={e => update('main_email', e.target.value)} />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Site</label>
          <input className={inputCls} type="url" placeholder="https://" value={fields.website_url} onChange={e => update('website_url', e.target.value)} />
        </div>

        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4 mt-6">Pastor Titular</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Pastor Titular</label>
            <input className={inputCls} value={fields.pastor_titular_name} onChange={e => update('pastor_titular_name', e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone do Pastor (interno)</label>
            <input className={inputCls} type="tel" value={fields.pastor_titular_phone} onChange={e => update('pastor_titular_phone', e.target.value)} />
          </div>
        </div>

        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4 mt-6">Redes Sociais</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
            <input className={inputCls} placeholder="@igrejax" value={fields.social_media_handles.instagram ?? ''} onChange={e => update('social_media_handles', { ...fields.social_media_handles, instagram: e.target.value })} />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">YouTube (channel ID)</label>
            <input className={inputCls} placeholder="UCxxxxx" value={fields.social_media_handles.youtube ?? ''} onChange={e => update('social_media_handles', { ...fields.social_media_handles, youtube: e.target.value })} />
          </div>
        </div>

        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4 mt-6">Configurações Técnicas</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
          <input className={inputCls} placeholder="America/Sao_Paulo" value={fields.timezone} onChange={e => update('timezone', e.target.value)} />
          <p className="mt-1 text-xs text-gray-400">Ex: America/Sao_Paulo, America/Fortaleza</p>
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
          {dirty && <span className="text-xs text-amber-600">Alterações não salvas</span>}
          <div className="ml-auto">
            <button
              onClick={save}
              disabled={saving || !dirty}
              className="px-6 py-2.5 rounded-xl bg-[#e13500] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#FF4D1A] transition-colors"
            >
              {saving ? 'Salvando...' : 'Salvar Cadastro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Adicionar renderização da tab Cadastro no switch**

Localizar o bloco de renderização de tabs (onde está `{activeTab === 'resumo' && ...}`) e adicionar:

```typescript
{activeTab === 'cadastro' && church && <TabCadastro churchId={church.id} />}
```

- [ ] **Step 7: Verificar build sem erros**

```bash
cd "C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main\web"
npx tsc --noEmit 2>&1 | head -40
```

Expected: zero erros TypeScript

---

## Task 5: TabIdentidade — remover 12 campos, adicionar bloco read-only + link

**Files:**
- Modify: `web/src/pages/admin/agent-tabs/TabIdentidade.tsx`

- [ ] **Step 1: Substituir conteúdo de TabIdentidade.tsx**

O novo conteúdo remove os 12 inputs editáveis de dados da Igreja e exibe os dados em read-only. Mantém os 3 overrides do agente. Adiciona botão "Editar cadastro da Igreja" que navega para `/admin/churches/:id?tab=cadastro`.

```typescript
// web/src/pages/admin/agent-tabs/TabIdentidade.tsx
import { useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import type { useChurchAgentFullConfig } from '@/hooks/useChurchAgentConfig'

type Hook = ReturnType<typeof useChurchAgentFullConfig>

interface Props { hook: Hook }

const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500] transition-colors'

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="mb-3">
      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value || <span className="text-gray-400 italic">—</span>}</p>
    </div>
  )
}

export function TabIdentidade({ hook }: Props) {
  const { formData, setFormData, saving, saveIdentidade, markDirty, church } = hook
  const navigate = useNavigate()

  // church vem do hook como Record<string, unknown>
  const churchId = (church?.id as string) ?? ''
  const sm = (church?.social_media_handles as { instagram?: string; youtube?: string } | null) ?? {}

  function update<K extends keyof typeof formData>(key: K, value: typeof formData[K]) {
    setFormData(prev => ({ ...prev, [key]: value }))
    markDirty('identidade')
  }

  return (
    <div className="space-y-4">
      {/* Bloco read-only da Igreja */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04]">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Dados da Igreja</h3>
          <button
            onClick={() => navigate(`/admin/churches/${churchId}?tab=cadastro`)}
            className="flex items-center gap-1.5 text-xs text-[#e13500] hover:text-[#FF4D1A] font-medium transition-colors"
          >
            <ExternalLink size={12} />
            Editar cadastro da Igreja
          </button>
        </div>

        <div className="grid grid-cols-2 gap-x-6">
          <ReadOnlyField label="Nome" value={church?.name as string} />
          <ReadOnlyField label="Denominação" value={church?.denomination as string} />
          <ReadOnlyField label="Cidade" value={church?.city as string} />
          <ReadOnlyField label="Estado" value={church?.state as string} />
          <ReadOnlyField label="Pastor Titular" value={church?.pastor_titular_name as string} />
          <ReadOnlyField label="Telefone do Pastor" value={church?.pastor_titular_phone as string} />
          <ReadOnlyField label="E-mail Principal" value={church?.main_email as string} />
          <ReadOnlyField label="Telefone Principal" value={church?.main_phone as string} />
        </div>

        <ReadOnlyField label="Visão / Missão" value={church?.vision_statement as string} />
        <ReadOnlyField label="Instagram" value={sm.instagram} />
      </div>

      {/* Overrides do Agente */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-black/[0.04]">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Configurações do Agente (override)</h3>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Agente</label>
          <p className="text-xs text-gray-400 mb-1">Como o agente se apresenta. Ex: 'Assistente da Igreja X'</p>
          <input className={inputCls} value={formData.agent_name}
            onChange={e => update('agent_name', e.target.value)} />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Pastor (mencionado pelo agente)</label>
          <p className="text-xs text-gray-400 mb-1">Nome que o agente usa ao referenciar o pastor</p>
          <input className={inputCls} value={formData.pastor_name}
            onChange={e => update('pastor_name', e.target.value)} />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome Curto da Igreja (override)</label>
          <p className="text-xs text-gray-400 mb-1">Substitui o nome completo em mensagens. Ex: 'AD Centro'</p>
          <input className={inputCls} value={formData.church_name_short}
            onChange={e => update('church_name_short', e.target.value)} />
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={saveIdentidade}
            disabled={saving}
            className="px-6 py-2.5 rounded-xl bg-[#e13500] text-white text-sm font-semibold disabled:opacity-50 hover:bg-[#FF4D1A] transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar Overrides'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verificar que compila**

```bash
cd "C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main\web"
npx tsc --noEmit 2>&1 | head -40
```

Expected: zero erros TypeScript

---

## Task 6: Simplificar AgentCockpitFormState + useChurchAgentFullConfig

**Files:**
- Modify: `web/src/types/churchAgentConfig.ts`
- Modify: `web/src/hooks/useChurchAgentConfig.ts`

### 6a — Remover 12 campos de AgentCockpitFormState

- [ ] **Step 1: Editar `web/src/types/churchAgentConfig.ts`**

Substituir a interface `AgentCockpitFormState` pela versão sem os 12 campos `church_*`:

```typescript
// Form state global (persistente entre trocas de aba)
export interface AgentCockpitFormState {
  // Aba 1 — Overrides de agente (church_agent_config)
  agent_name: string
  pastor_name: string
  church_name_short: string
  // Aba 2 — Prompt + Tom
  formality: Formality | ''
  emoji_usage: EmojiUsage | ''
  pastoral_depth: PastoralDepth | ''
  first_contact_delay: FirstContactDelay | ''
  custom_instructions: string
  preferred_verses: string[]
  forbidden_topics: string[]
  denomination_override: string
  // Aba 3 — Follow-up
  followup_enabled: boolean
  enabled_touchpoints: string[]
  duration_days: string
  send_window_start: string
  send_window_end: string
  stop_on_response: boolean
  stop_on_attendance: boolean
  next_action_after_completion: string
  // Aba 4 — Escalonamento
  escalation_enabled: boolean
  escalation_on_no_response_days: string
  escalation_notify_role: string
  escalation_pause_followup: boolean
  escalation_sensitive_case_flag: boolean
  escalation_keywords: string[]
}
```

Campos removidos (os 12 `church_*`):
- church_name, church_city, church_state, church_region
- church_denomination, church_vision_statement, church_address_full
- church_main_phone, church_website_url
- church_pastor_titular_name, church_pastor_titular_phone
- church_social_media_handles

### 6b — Limpar EMPTY_FORM e hydrateForm em useChurchAgentConfig.ts

- [ ] **Step 2: Editar `web/src/hooks/useChurchAgentConfig.ts`**

Substituir o `EMPTY_FORM` removendo os 12 campos `church_*`:

```typescript
const EMPTY_FORM: AgentCockpitFormState = {
  agent_name: '', pastor_name: '', church_name_short: '',
  formality: '', emoji_usage: '', pastoral_depth: '', first_contact_delay: '',
  custom_instructions: '', preferred_verses: [], forbidden_topics: [],
  denomination_override: '',
  followup_enabled: true, enabled_touchpoints: [],
  duration_days: '', send_window_start: '', send_window_end: '',
  stop_on_response: true, stop_on_attendance: true,
  next_action_after_completion: '',
  escalation_enabled: false, escalation_on_no_response_days: '',
  escalation_notify_role: 'pastor', escalation_pause_followup: false,
  escalation_sensitive_case_flag: true, escalation_keywords: [],
}
```

Substituir a função `hydrateForm` removendo os 12 campos `church_*`:

```typescript
function hydrateForm(
  fullConfig: ChurchAgentFullConfig,
  _church: Record<string, unknown>   // mantido como parâmetro para compatibilidade, não usado
): AgentCockpitFormState {
  const c = fullConfig.config ?? null
  const f = fullConfig.followup ?? null
  const esc = (f?.escalation_conditions ?? {}) as Record<string, unknown>
  const agentEsc = c?.escalation_config ?? null
  return {
    agent_name: c?.agent_name ?? '',
    pastor_name: c?.pastor_name ?? '',
    church_name_short: c?.church_name_short ?? '',
    formality: c?.formality ?? '',
    emoji_usage: c?.emoji_usage ?? '',
    pastoral_depth: c?.pastoral_depth ?? '',
    first_contact_delay: c?.first_contact_delay ?? '',
    custom_instructions: c?.custom_instructions ?? '',
    preferred_verses: c?.preferred_verses ?? [],
    forbidden_topics: c?.forbidden_topics ?? [],
    denomination_override: c?.denomination ?? '',
    followup_enabled: f?.followup_enabled ?? true,
    enabled_touchpoints: f?.enabled_touchpoints ?? [],
    duration_days: f?.duration_days != null ? String(f.duration_days) : '',
    send_window_start: f?.send_window_start ?? '',
    send_window_end: f?.send_window_end ?? '',
    stop_on_response: f?.stop_conditions?.on_response ?? true,
    stop_on_attendance: f?.stop_conditions?.on_attendance ?? true,
    next_action_after_completion: f?.next_action_after_completion ?? '',
    escalation_enabled: agentEsc?.enabled ?? false,
    escalation_on_no_response_days: esc.on_no_response_days != null ? String(esc.on_no_response_days) : '',
    escalation_notify_role: esc.notify_role ?? 'pastor',
    escalation_pause_followup: esc.pause_followup ?? false,
    escalation_sensitive_case_flag: esc.sensitive_case_flag ?? true,
    escalation_keywords: agentEsc?.rules?.find(r => r.trigger === 'sensitive_keywords')?.keywords ?? [],
  }
}
```

Substituir o bloco `saveIdentidade` removendo o UPDATE de churches (apenas mantém o RPC de agente):

```typescript
  const saveIdentidade = useCallback(async () => {
    setSaving(true)
    try {
      const payload: ChurchAgentConfigPayload = {
        agent_name:        formData.agent_name        || undefined,
        pastor_name:       formData.pastor_name       || undefined,
        church_name_short: formData.church_name_short || undefined,
      }
      const { error: rpcErr } = await supabase
        .rpc('upsert_church_agent_config_admin', {
          p_church_id:  churchId,
          p_agent_slug: agentSlug,
          p_data:       payload,
        })
      if (rpcErr) throw rpcErr

      clearDirty('identidade')
      showToast(true, 'Overrides do agente salvos com sucesso.')
    } catch (e: unknown) {
      showToast(false, (e as Error).message ?? 'Erro ao salvar overrides')
    } finally {
      setSaving(false)
    }
  }, [churchId, agentSlug, formData, clearDirty, showToast])
```

- [ ] **Step 3: Verificar build completo sem erros**

```bash
cd "C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main\web"
npm run build 2>&1 | tail -20
```

Expected: `✓ built in Xs` sem erros TypeScript ou de módulo

---

## Task 7: Expor `church` no retorno de useChurchAgentFullConfig

**Files:**
- Modify: `web/src/hooks/useChurchAgentConfig.ts`
- Modify: `web/src/pages/admin/agent-tabs/TabIdentidade.tsx` (verificação de types)

O `TabIdentidade` refatorado usa `hook.church` para exibir dados read-only.
Precisamos garantir que `useChurchAgentFullConfig` retorna `church` no objeto de retorno.

- [ ] **Step 1: Verificar retorno do hook**

Localizar no final de `useChurchAgentFullConfig` o objeto `return {` e confirmar que `church` está incluído. Se não estiver, adicionar `church,` ao return:

```typescript
  return {
    fullConfig, church,        // ← garantir que church está aqui
    formData, setFormData,
    loading, error,
    dirtyTabs, saving, toast,
    markDirty, clearDirty,
    saveIdentidade, savePromptTom, saveFollowup, saveEscalonamento,
  }
```

- [ ] **Step 2: Adicionar `main_email` ao select de churches no load()**

No `useChurchAgentFullConfig`, localizar o `.select(...)` da tabela `churches` e adicionar `main_email`:

```typescript
        const { data: churchData, error: churchErr } = await supabase
          .from('churches')
          .select('id,name,city,state,region,denomination,vision_statement,address_full,main_phone,main_email,website_url,pastor_titular_name,pastor_titular_phone,social_media_handles,logo_url,timezone,status,slug')
          .eq('id', churchId)
          .single()
```

- [ ] **Step 3: Build final**

```bash
cd "C:\Users\rmiam\Downloads\ekthos-platform-main\ekthos-platform-main\web"
npm run build 2>&1 | tail -20
```

Expected: `✓ built in Xs` sem erros

---

## Self-Review

### Spec Coverage
- ✅ Zero schema migrations exceto `churches.main_email` (Opção A aprovada)
- ✅ UPDATE direto via RLS (sem novo RPC)
- ✅ Nova aba Cadastro entre Resumo e Assinatura
- ✅ TabIdentidade com 12 campos removidos e 3 overrides mantidos
- ✅ `useChurchIdentity` hook independente
- ✅ admin-church-detail retorna campos de identidade
- ✅ ?tab=cadastro suportado via useSearchParams

### Ordem de Dependências
- Task 1 (branch + migration) → independente, primeiro
- Task 2 (useChurchIdentity) → independente, pode vir antes de Task 4
- Task 3 (EF response) → independente (deploy separado)
- Task 4 (Church.tsx tab) → depende de Task 2 (useChurchIdentity)
- Task 5 (TabIdentidade) → depende de Task 6 (sem church_* no formData)
- Task 6 (AgentCockpitFormState + hydrateForm) → pode vir antes de Task 5
- Task 7 (church no return do hook) → depende de Task 6
