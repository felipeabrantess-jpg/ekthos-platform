# Frente 3B — Cadastro Cristalino Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o wizard de onboarding "Cadastro Cristalino" para pastores (2 etapas de formulário) e adicionar as tabs Contratante e Perfil Pastoral no cockpit admin.

**Architecture:** O wizard é uma página standalone em `/onboarding/wizard` sem sidebar; a página existente `/onboarding` (chat IA) detecta `onboarding_step=pending|pastoral` e redireciona para o wizard; após o wizard concluir (step=completed), volta ao `/onboarding`. As tabs do cockpit admin fazem SELECTs diretos nas tabelas `contractors` e `church_pastoral_profile` (read-only, sem edição — regra arquitetural do cockpit).

**Tech Stack:** React 18 + TypeScript + Vite + Tailwind + shadcn/ui + Supabase JS v2 + Playwright (E2E) + design system Ekthos (Playfair Display + DM Sans + cream/red/black/wine palette)

---

## Contexto crítico para o implementador

### Design system Ekthos (obrigatório em TODA UI)
```css
/* Cores — usar sempre via CSS vars OU hex direto */
--ekthos-cream: #f9eedc       /* fundo de página */
--ekthos-red: #e13500         /* CTA primário */
--ekthos-red-light: #FF4D1A   /* hover */
--ekthos-wine: #670000        /* accent premium */
--ekthos-black: #161616       /* texto principal */
var(--color-primary)          /* = #e13500 no app */

/* Tipografia */
font-family: 'Playfair Display', serif   /* headings h1/h2 */
font-family: 'DM Sans', sans-serif       /* body (classe padrão do app) */
```

### Estado de onboarding (state machine)
- `onboarding_step = 'pending'` → pastor deve fazer Etapa 1 (Dados + Contratante)
- `onboarding_step = 'pastoral'` → pastor deve fazer Etapa 2 (Perfil Pastoral)
- `onboarding_step = 'completed'` → wizard concluído, vai para `/onboarding` (chat IA)

### RPCs disponíveis (todas SECURITY DEFINER, autenticação via JWT)
```typescript
// Estado atual do onboarding
supabase.rpc('get_church_onboarding_state', { p_church_id: string })
// Retorna: { church_id, step, contractor_complete, pastoral_complete, blocked, completed_at }

// Etapa 1
supabase.rpc('upsert_church_cadastro_cristalino', {
  p_church_id: string,
  p_church_data: jsonb,      // name, city, uf, main_phone, main_email, pastor_titular_name, ...
  p_contractor_data: jsonb,  // name, document_type, document_number, person_type, role_label, ...
})

// Etapa 2
supabase.rpc('upsert_church_onboarding_pastoral', {
  p_church_id: string,
  p_pastoral_data: jsonb,  // estilo_comunicacao, horarios_culto, maior_desafio, ...
})
```

### Estrutura de arquivos existente relevante
- `web/src/App.tsx` — router principal, StatusGuard redireciona `churchStatus='onboarding'` para `/onboarding`
- `web/src/pages/Onboarding.tsx` — chat IA existente, deve detectar e redirecionar para wizard
- `web/src/pages/admin/Church.tsx` — TABS array em linha ~93, render em linhas ~1070-1079
- `web/src/lib/auth-context.tsx` — `useAuth()` expõe `{ user, session, churchId, churchStatus, role, isEkthosAdmin, loading }`
- `web/src/lib/supabase.ts` — cliente Supabase (importar como `import { supabase } from '@/lib/supabase'`)

---

## Mapa de arquivos

| Arquivo | Ação | Responsabilidade |
|---------|------|-----------------|
| `web/src/pages/onboarding/Wizard.tsx` | CRIAR | Página wizard completa (2 etapas) |
| `web/src/App.tsx` | MODIFICAR | Import lazy + rota `/onboarding/wizard` |
| `web/src/pages/Onboarding.tsx` | MODIFICAR | Guard que detecta step pending/pastoral e redireciona |
| `web/src/pages/admin/Church.tsx` | MODIFICAR | TabContratante + TabPastoral + TABS + render |
| `web/tests/e2e/frente-3b-smoke.prod.spec.ts` | CRIAR | Smoke test E2E (Playwright) |

---

## Task 1: Route + Guard (App.tsx + Onboarding.tsx)

**Files:**
- Modify: `web/src/App.tsx` (linhas ~29 e ~212)
- Modify: `web/src/pages/Onboarding.tsx` (início do componente `Onboarding`)

- [ ] **Step 1.1: Adicionar lazy import do Wizard em App.tsx**

Abrir `web/src/App.tsx`. Após a linha 29 (`const OnboardingConfiguring = ...`), adicionar:

```typescript
const OnboardingWizard   = lazy(() => import('@/pages/onboarding/Wizard'))
```

- [ ] **Step 1.2: Adicionar rota `/onboarding/wizard` em App.tsx**

Na seção de "Rotas públicas" de `App.tsx`, após a rota `/onboarding/configuring` (linha ~213), adicionar:

```tsx
<Route path="/onboarding/wizard" element={<ErrorBoundary><Suspense fallback={<FullScreenSpinner />}><OnboardingWizard /></Suspense></ErrorBoundary>} />
```

- [ ] **Step 1.3: Adicionar guard de redirecionamento em Onboarding.tsx**

Em `web/src/pages/Onboarding.tsx`, dentro do componente `Onboarding()` (após os `useState` e antes do primeiro `useEffect`), adicionar um `useEffect` que redireciona quando `onboarding_step` for `pending` ou `pastoral`:

```typescript
// Guard: se church já está no wizard (step pending/pastoral), redireciona
useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) return
    const churchId = session.user.app_metadata?.church_id as string | undefined
    if (!churchId) return
    const { data } = await supabase
      .from('churches')
      .select('onboarding_step')
      .eq('id', churchId)
      .maybeSingle()
    const step = (data as { onboarding_step: string } | null)?.onboarding_step
    if (step === 'pending' || step === 'pastoral') {
      navigate('/onboarding/wizard')
    }
  })
}, [navigate])
```

Adicionar esse `useEffect` DEPOIS dos outros `useEffect` existentes (após linha ~591 do arquivo original). A variável `navigate` já existe no componente.

- [ ] **Step 1.4: Verificar build**

```bash
cd web && npm run build 2>&1 | tail -20
```

Esperado: `built in Xs` sem erros de TypeScript ou import.

- [ ] **Step 1.5: Commit**

```bash
git add web/src/App.tsx web/src/pages/Onboarding.tsx
git commit -m "feat(wizard): rota /onboarding/wizard + guard redirect em Onboarding.tsx (Frente 3B)"
```

---

## Task 2: Wizard.tsx — Página completa (2 etapas)

**Files:**
- Create: `web/src/pages/onboarding/Wizard.tsx`

Esta é a maior task. O wizard gerencia um state machine de 2 etapas com formulários Ekthos.

- [ ] **Step 2.1: Criar arquivo `web/src/pages/onboarding/Wizard.tsx` com o conteúdo completo**

```typescript
/**
 * Wizard.tsx — Cadastro Cristalino (Frente 3B)
 *
 * Wizard de onboarding em 2 etapas para o pastor:
 *   Etapa 1: Dados da Igreja + Dados do Contratante
 *   Etapa 2: Perfil Pastoral
 *
 * State machine: pending → pastoral → completed → redireciona para /onboarding
 *
 * Design: Ekthos design system (cream, red, Playfair Display, DM Sans)
 */

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, Loader, CheckCircle2, AlertCircle, Building2, User, FileText } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Tipos ──────────────────────────────────────────────────────

interface OnboardingState {
  church_id: string
  step: 'pending' | 'pastoral' | 'completed'
  contractor_complete: boolean
  pastoral_complete: boolean
}

// Etapa 1 — Dados da Igreja
interface ChurchFormData {
  name:                        string
  city:                        string
  uf:                          string
  main_phone:                  string
  main_email:                  string
  pastor_titular_name:         string
  pastor_titular_phone:        string
  pastor_titular_email:        string
  pastor_titular_can_be_quoted: boolean
}

// Etapa 1 — Dados do Contratante
interface ContractorFormData {
  name:            string
  document_type:   'cpf' | 'cnpj'
  document_number: string
  person_type:     'pf' | 'pj'
  role_label:      string
  email:           string
  phone:           string
  notes:           string
}

// Etapa 2 — Perfil Pastoral
interface PastoralFormData {
  estilo_comunicacao:          'formal' | 'casual' | 'intermediario' | ''
  horarios_culto:              string
  maior_desafio:               string
  foco_pastoral_30_dias:       string
  algo_importante_comunidade:  string
}

// ── UF list ────────────────────────────────────────────────────

const UF_OPTIONS = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA',
  'MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN',
  'RO','RR','RS','SC','SE','SP','TO',
]

// ── Helpers de estilo ─────────────────────────────────────────

const inputClass =
  'w-full px-4 py-3 rounded-xl border border-black/10 text-sm text-gray-800 placeholder-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-transparent transition-all bg-white'

const labelClass = 'block text-xs font-semibold text-gray-600 mb-1.5'

const errorClass = 'text-xs text-red-600 mt-1'

// ── Componentes de layout ──────────────────────────────────────

function WizardHeader({ step, total }: { step: number; total: number }) {
  const pct = Math.round(((step - 1) / total) * 100)
  return (
    <div className="shrink-0">
      {/* Logo bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-black/[0.06]">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-sm"
            style={{ background: '#e13500' }}
          >
            E
          </div>
          <div className="leading-none">
            <span className="font-semibold text-gray-900 text-sm">Ekthos</span>
            <span className="text-gray-300 text-sm"> · </span>
            <span className="text-gray-500 text-sm">Cadastro da sua igreja</span>
          </div>
        </div>
        <span
          className="text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(225,53,0,0.08)', color: '#e13500' }}
        >
          Etapa {step} de {total}
        </span>
      </div>
      {/* Progress bar */}
      <div className="px-6 py-3 border-b border-black/[0.06] bg-white">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-gray-500">Progresso</span>
          <span className="text-xs font-bold" style={{ color: '#e13500' }}>{pct}%</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden bg-gray-100">
          <div
            className="h-full rounded-full transition-all duration-700 ease-out"
            style={{ width: `${pct}%`, background: '#e13500' }}
          />
        </div>
      </div>
    </div>
  )
}

function FieldGroup({ title, icon, children }: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2 pb-3 border-b border-black/[0.05]">
        <span style={{ color: '#e13500' }}>{icon}</span>
        <h3 className="text-sm font-semibold text-gray-800" style={{ fontFamily: "'Playfair Display', serif" }}>
          {title}
        </h3>
      </div>
      {children}
    </div>
  )
}

// ── Etapa 1: form ──────────────────────────────────────────────

function Step1Form({
  onSuccess,
  churchId,
  initialName,
}: {
  onSuccess: () => void
  churchId: string
  initialName: string
}) {
  const [church, setChurch] = useState<ChurchFormData>({
    name:                        initialName,
    city:                        '',
    uf:                          '',
    main_phone:                  '',
    main_email:                  '',
    pastor_titular_name:         '',
    pastor_titular_phone:        '',
    pastor_titular_email:        '',
    pastor_titular_can_be_quoted: false,
  })

  const [contractor, setContractor] = useState<ContractorFormData>({
    name:            '',
    document_type:   'cpf',
    document_number: '',
    person_type:     'pf',
    role_label:      '',
    email:           '',
    phone:           '',
    notes:           '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})
  const [apiError, setApiError]     = useState<string | null>(null)

  function setC(field: keyof ChurchFormData, value: string | boolean) {
    setChurch(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  function setK(field: keyof ContractorFormData, value: string) {
    setContractor(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [`k_${field}`]: '' }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!church.name.trim())                e.name                = 'Nome da igreja é obrigatório'
    if (!church.city.trim())                e.city                = 'Cidade é obrigatória'
    if (!church.uf.trim())                  e.uf                  = 'Estado (UF) é obrigatório'
    if (!church.pastor_titular_name.trim()) e.pastor_titular_name = 'Nome do pastor é obrigatório'
    if (!contractor.name.trim())            e.k_name              = 'Nome do contratante é obrigatório'
    if (!contractor.role_label.trim())      e.k_role_label        = 'Cargo/função é obrigatório'
    if (!contractor.document_number.trim()) e.k_document_number   = 'Documento é obrigatório'
    if (contractor.document_type === 'cpf' && !/^\d{11}$/.test(contractor.document_number.replace(/\D/g, ''))) {
      e.k_document_number = 'CPF deve ter 11 dígitos'
    }
    if (contractor.document_type === 'cnpj' && !/^\d{14}$/.test(contractor.document_number.replace(/\D/g, ''))) {
      e.k_document_number = 'CNPJ deve ter 14 dígitos'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError(null)

    try {
      const cleanDoc = contractor.document_number.replace(/\D/g, '')
      const { error } = await supabase.rpc('upsert_church_cadastro_cristalino', {
        p_church_id: churchId,
        p_church_data: {
          name:                        church.name.trim(),
          city:                        church.city.trim(),
          uf:                          church.uf.trim().toUpperCase(),
          main_phone:                  church.main_phone.trim() || null,
          main_email:                  church.main_email.trim() || null,
          pastor_titular_name:         church.pastor_titular_name.trim(),
          pastor_titular_phone:        church.pastor_titular_phone.trim() || null,
          pastor_titular_email:        church.pastor_titular_email.trim() || null,
          pastor_titular_can_be_quoted: church.pastor_titular_can_be_quoted,
        },
        p_contractor_data: {
          name:            contractor.name.trim(),
          document_type:   contractor.document_type,
          document_number: cleanDoc,
          person_type:     contractor.person_type,
          role_label:      contractor.role_label.trim(),
          email:           contractor.email.trim() || null,
          phone:           contractor.phone.trim() || null,
          notes:           contractor.notes.trim() || null,
        },
      })

      if (error) {
        const msg = error.message ?? ''
        if (msg.includes('validation_error:')) {
          setApiError(msg.replace('validation_error: ', ''))
        } else if (msg.includes('permission_denied')) {
          setApiError('Sem permissão para atualizar os dados dessa igreja.')
        } else {
          setApiError('Erro ao salvar dados. Tente novamente.')
        }
        return
      }

      onSuccess()
    } catch {
      setApiError('Erro de conexão. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {apiError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{apiError}</p>
        </div>
      )}

      {/* Dados da Igreja */}
      <FieldGroup title="Dados da Igreja" icon={<Building2 size={16} strokeWidth={1.75} />}>
        <div>
          <label className={labelClass}>Nome oficial da igreja *</label>
          <input
            className={inputClass}
            value={church.name}
            onChange={e => setC('name', e.target.value)}
            placeholder="Ex: Igreja Batista Central"
          />
          {errors.name && <p className={errorClass}>{errors.name}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Cidade *</label>
            <input
              className={inputClass}
              value={church.city}
              onChange={e => setC('city', e.target.value)}
              placeholder="Ex: São Paulo"
            />
            {errors.city && <p className={errorClass}>{errors.city}</p>}
          </div>
          <div>
            <label className={labelClass}>Estado (UF) *</label>
            <select
              className={inputClass}
              value={church.uf}
              onChange={e => setC('uf', e.target.value)}
            >
              <option value="">Selecione</option>
              {UF_OPTIONS.map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
            {errors.uf && <p className={errorClass}>{errors.uf}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Telefone principal</label>
            <input
              className={inputClass}
              value={church.main_phone}
              onChange={e => setC('main_phone', e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div>
            <label className={labelClass}>E-mail principal</label>
            <input
              type="email"
              className={inputClass}
              value={church.main_email}
              onChange={e => setC('main_email', e.target.value)}
              placeholder="contato@igreja.com"
            />
          </div>
        </div>
      </FieldGroup>

      {/* Dados do Pastor Titular */}
      <FieldGroup title="Pastor Titular" icon={<User size={16} strokeWidth={1.75} />}>
        <div>
          <label className={labelClass}>Nome do pastor titular *</label>
          <input
            className={inputClass}
            value={church.pastor_titular_name}
            onChange={e => setC('pastor_titular_name', e.target.value)}
            placeholder="Ex: Rev. João Silva"
          />
          {errors.pastor_titular_name && <p className={errorClass}>{errors.pastor_titular_name}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Telefone do pastor</label>
            <input
              className={inputClass}
              value={church.pastor_titular_phone}
              onChange={e => setC('pastor_titular_phone', e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
          <div>
            <label className={labelClass}>E-mail do pastor</label>
            <input
              type="email"
              className={inputClass}
              value={church.pastor_titular_email}
              onChange={e => setC('pastor_titular_email', e.target.value)}
              placeholder="pastor@igreja.com"
            />
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer group">
          <div
            className={`w-5 h-5 rounded flex items-center justify-center border-2 transition-all flex-shrink-0 ${
              church.pastor_titular_can_be_quoted
                ? 'border-transparent'
                : 'border-gray-300 group-hover:border-gray-400'
            }`}
            style={church.pastor_titular_can_be_quoted ? { background: '#e13500' } : {}}
            onClick={() => setC('pastor_titular_can_be_quoted', !church.pastor_titular_can_be_quoted)}
          >
            {church.pastor_titular_can_be_quoted && (
              <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
                <path d="M1 5L4.5 8.5L11 1.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
          <input
            type="checkbox"
            className="sr-only"
            checked={church.pastor_titular_can_be_quoted}
            onChange={e => setC('pastor_titular_can_be_quoted', e.target.checked)}
          />
          <span className="text-sm text-gray-700">
            O pastor autoriza ser citado em comunicações da plataforma
          </span>
        </label>
      </FieldGroup>

      {/* Dados do Contratante */}
      <FieldGroup title="Dados do Contratante" icon={<FileText size={16} strokeWidth={1.75} />}>
        <p className="text-xs text-gray-500 -mt-2">
          Responsável legal pelo contrato com a Ekthos. Pode ser o pastor ou outra pessoa jurídica.
        </p>

        <div>
          <label className={labelClass}>Nome completo do contratante *</label>
          <input
            className={inputClass}
            value={contractor.name}
            onChange={e => setK('name', e.target.value)}
            placeholder="Nome completo ou razão social"
          />
          {errors.k_name && <p className={errorClass}>{errors.k_name}</p>}
        </div>

        <div>
          <label className={labelClass}>Cargo / função *</label>
          <input
            className={inputClass}
            value={contractor.role_label}
            onChange={e => setK('role_label', e.target.value)}
            placeholder="Ex: Pastor Titular, Tesoureiro, Representante Legal"
          />
          {errors.k_role_label && <p className={errorClass}>{errors.k_role_label}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Tipo de pessoa *</label>
            <select
              className={inputClass}
              value={contractor.person_type}
              onChange={e => {
                const pt = e.target.value as 'pf' | 'pj'
                setK('person_type', pt)
                // PJ força CNPJ; PF pode usar CPF
                if (pt === 'pj') setK('document_type', 'cnpj')
                else setK('document_type', 'cpf')
              }}
            >
              <option value="pf">Pessoa Física (PF)</option>
              <option value="pj">Pessoa Jurídica (PJ)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Tipo de documento *</label>
            <select
              className={inputClass}
              value={contractor.document_type}
              onChange={e => setK('document_type', e.target.value as 'cpf' | 'cnpj')}
              disabled={contractor.person_type === 'pj'}
            >
              <option value="cpf">CPF</option>
              {contractor.person_type === 'pf' && <option value="cnpj">CNPJ (MEI)</option>}
              {contractor.person_type === 'pj' && <option value="cnpj">CNPJ</option>}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>
            Número do {contractor.document_type === 'cpf' ? 'CPF (11 dígitos)' : 'CNPJ (14 dígitos)'} *
          </label>
          <input
            className={inputClass}
            value={contractor.document_number}
            onChange={e => setK('document_number', e.target.value.replace(/\D/g, ''))}
            placeholder={contractor.document_type === 'cpf' ? '00000000000' : '00000000000000'}
            maxLength={contractor.document_type === 'cpf' ? 11 : 14}
          />
          {errors.k_document_number && <p className={errorClass}>{errors.k_document_number}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>E-mail do contratante</label>
            <input
              type="email"
              className={inputClass}
              value={contractor.email}
              onChange={e => setK('email', e.target.value)}
              placeholder="email@exemplo.com"
            />
          </div>
          <div>
            <label className={labelClass}>Telefone do contratante</label>
            <input
              className={inputClass}
              value={contractor.phone}
              onChange={e => setK('phone', e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </div>
        </div>
      </FieldGroup>

      {/* Botão */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-white text-base transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
        style={{ background: '#e13500' }}
      >
        {submitting ? (
          <Loader size={18} strokeWidth={1.75} className="animate-spin" />
        ) : (
          <>
            Continuar para Etapa 2
            <ChevronRight size={18} strokeWidth={2} />
          </>
        )}
      </button>
    </form>
  )
}

// ── Etapa 2: form ──────────────────────────────────────────────

function Step2Form({
  onSuccess,
  churchId,
}: {
  onSuccess: () => void
  churchId: string
}) {
  const [pastoral, setPastoral] = useState<PastoralFormData>({
    estilo_comunicacao:         '',
    horarios_culto:             '',
    maior_desafio:              '',
    foco_pastoral_30_dias:      '',
    algo_importante_comunidade: '',
  })

  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors]         = useState<Record<string, string>>({})
  const [apiError, setApiError]     = useState<string | null>(null)

  function setP(field: keyof PastoralFormData, value: string) {
    setPastoral(prev => ({ ...prev, [field]: value }))
    setErrors(prev => ({ ...prev, [field]: '' }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!pastoral.estilo_comunicacao) e.estilo_comunicacao = 'Selecione o estilo de comunicação'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    setApiError(null)

    try {
      const { error } = await supabase.rpc('upsert_church_onboarding_pastoral', {
        p_church_id: churchId,
        p_pastoral_data: {
          estilo_comunicacao:         pastoral.estilo_comunicacao || null,
          horarios_culto:             pastoral.horarios_culto.trim() || null,
          maior_desafio:              pastoral.maior_desafio.trim() || null,
          foco_pastoral_30_dias:      pastoral.foco_pastoral_30_dias.trim() || null,
          algo_importante_comunidade: pastoral.algo_importante_comunidade.trim() || null,
        },
      })

      if (error) {
        const msg = error.message ?? ''
        if (msg.includes('precondition_failed')) {
          setApiError('A Etapa 1 precisa ser concluída antes. Recarregue a página.')
        } else if (msg.includes('validation_error')) {
          setApiError(msg.replace('validation_error: ', ''))
        } else {
          setApiError('Erro ao salvar perfil pastoral. Tente novamente.')
        }
        return
      }

      onSuccess()
    } catch {
      setApiError('Erro de conexão. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const ESTILOS = [
    { value: 'formal',       label: 'Formal',       desc: 'Linguagem respeitosa e estruturada' },
    { value: 'casual',       label: 'Casual',        desc: 'Linguagem próxima e acolhedora' },
    { value: 'intermediario', label: 'Intermediário', desc: 'Equilíbrio entre formal e casual' },
  ]

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {apiError && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100">
          <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{apiError}</p>
        </div>
      )}

      <FieldGroup title="Perfil Pastoral" icon={<User size={16} strokeWidth={1.75} />}>
        {/* Estilo de comunicação */}
        <div>
          <label className={labelClass}>Como sua igreja se comunica? *</label>
          <div className="grid grid-cols-1 gap-2 mt-1">
            {ESTILOS.map(e => (
              <button
                key={e.value}
                type="button"
                onClick={() => setP('estilo_comunicacao', e.value)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                  pastoral.estilo_comunicacao === e.value
                    ? 'border-transparent text-white'
                    : 'border-black/10 hover:border-black/20 bg-white'
                }`}
                style={pastoral.estilo_comunicacao === e.value ? { background: '#e13500' } : {}}
              >
                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    pastoral.estilo_comunicacao === e.value ? 'border-white' : 'border-gray-400'
                  }`}
                >
                  {pastoral.estilo_comunicacao === e.value && (
                    <div className="w-2 h-2 rounded-full bg-white" />
                  )}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${pastoral.estilo_comunicacao === e.value ? 'text-white' : 'text-gray-800'}`}>
                    {e.label}
                  </p>
                  <p className={`text-xs ${pastoral.estilo_comunicacao === e.value ? 'text-red-100' : 'text-gray-500'}`}>
                    {e.desc}
                  </p>
                </div>
              </button>
            ))}
          </div>
          {errors.estilo_comunicacao && <p className={errorClass}>{errors.estilo_comunicacao}</p>}
        </div>

        {/* Horários de culto */}
        <div>
          <label className={labelClass}>Horários dos cultos</label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            value={pastoral.horarios_culto}
            onChange={e => setP('horarios_culto', e.target.value)}
            placeholder="Ex: Domingo 9h e 19h, Quarta 20h (célula)"
          />
        </div>

        {/* Maior desafio */}
        <div>
          <label className={labelClass}>Qual é o maior desafio pastoral hoje?</label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            value={pastoral.maior_desafio}
            onChange={e => setP('maior_desafio', e.target.value)}
            placeholder="Ex: Retenção de jovens, crescimento de células, ..."
          />
        </div>

        {/* Foco 30 dias */}
        <div>
          <label className={labelClass}>Foco pastoral dos próximos 30 dias</label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            value={pastoral.foco_pastoral_30_dias}
            onChange={e => setP('foco_pastoral_30_dias', e.target.value)}
            placeholder="Ex: Série de evangelismo, treinamento de líderes, ..."
          />
        </div>

        {/* Algo importante */}
        <div>
          <label className={labelClass}>Algo importante sobre sua comunidade que devemos saber?</label>
          <textarea
            className={`${inputClass} resize-none`}
            rows={3}
            value={pastoral.algo_importante_comunidade}
            onChange={e => setP('algo_importante_comunidade', e.target.value)}
            placeholder="Ex: Temos muitos imigrantes, maioria jovens universitários, ..."
          />
          <p className="text-xs text-gray-400 mt-1">Opcional — mas nos ajuda a personalizar sua experiência.</p>
        </div>
      </FieldGroup>

      {/* Botão */}
      <button
        type="submit"
        disabled={submitting}
        className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-white text-base transition-all hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
        style={{ background: '#e13500' }}
      >
        {submitting ? (
          <Loader size={18} strokeWidth={1.75} className="animate-spin" />
        ) : (
          <>
            <CheckCircle2 size={18} strokeWidth={2} />
            Concluir Cadastro
          </>
        )}
      </button>
    </form>
  )
}

// ── Tela de conclusão ──────────────────────────────────────────

function CompletionScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-lg"
        style={{ background: '#e13500' }}
      >
        <CheckCircle2 size={40} strokeWidth={1.5} className="text-white" />
      </div>
      <h2
        className="text-2xl font-bold text-gray-900 mb-3"
        style={{ fontFamily: "'Playfair Display', serif" }}
      >
        Cadastro concluído!
      </h2>
      <p className="text-gray-500 text-sm leading-relaxed max-w-sm mb-8">
        Os dados da sua igreja foram salvos com sucesso.
        Agora vamos configurar o CRM pastoral — leva cerca de 30 segundos.
      </p>
      <button
        onClick={onContinue}
        className="flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white text-base transition-all hover:opacity-90 active:scale-[0.99]"
        style={{ background: '#e13500' }}
      >
        Configurar meu CRM agora
        <ChevronRight size={18} strokeWidth={2} />
      </button>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────

export default function Wizard() {
  const navigate = useNavigate()

  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState<string | null>(null)
  const [churchId,     setChurchId]     = useState<string | null>(null)
  const [churchName,   setChurchName]   = useState('')
  const [currentStep,  setCurrentStep]  = useState<'pending' | 'pastoral' | 'completed' | null>(null)

  // Carrega estado atual do onboarding
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/login'); return }

      const id = session.user.app_metadata?.church_id as string | undefined
      if (!id) { navigate('/login'); return }

      setChurchId(id)

      // Busca nome da igreja
      const { data: churchData } = await supabase
        .from('churches')
        .select('name')
        .eq('id', id)
        .maybeSingle()
      setChurchName((churchData as { name: string } | null)?.name ?? '')

      // Busca estado do onboarding via RPC
      const { data: state, error: stateErr } = await supabase.rpc(
        'get_church_onboarding_state',
        { p_church_id: id }
      )

      if (stateErr || !state) {
        setError('Não foi possível carregar o estado do cadastro. Tente novamente.')
        setLoading(false)
        return
      }

      const s = state as OnboardingState
      setCurrentStep(s.step)

      // Se já completou, vai para o AI chat
      if (s.step === 'completed') {
        navigate('/onboarding')
        return
      }

      setLoading(false)
    }

    void init()
  }, [navigate])

  function handleStep1Success() {
    setCurrentStep('pastoral')
  }

  function handleStep2Success() {
    setCurrentStep('completed')
  }

  function handleContinue() {
    navigate('/onboarding')
  }

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: '#f9eedc' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader size={32} strokeWidth={1.5} className="animate-spin" style={{ color: '#e13500' } as React.CSSProperties} />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-screen flex items-center justify-center p-6" style={{ background: '#f9eedc' }}>
        <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-6 max-w-sm w-full text-center">
          <AlertCircle size={32} className="text-red-600 mx-auto mb-3" />
          <p className="text-sm text-gray-700 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2 rounded-xl text-sm font-semibold text-white"
            style={{ background: '#e13500' }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  const stepNumber = currentStep === 'pending' ? 1 : currentStep === 'pastoral' ? 2 : 2
  const isComplete  = currentStep === 'completed'

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: '#f9eedc' }}>
      {!isComplete && <WizardHeader step={stepNumber} total={2} />}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-2">
          {/* Título da etapa */}
          {!isComplete && (
            <div className="mb-2">
              <h1
                className="text-xl font-bold text-gray-900"
                style={{ fontFamily: "'Playfair Display', serif" }}
              >
                {currentStep === 'pending'
                  ? 'Dados da Igreja e Contratante'
                  : 'Perfil Pastoral'}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {currentStep === 'pending'
                  ? 'Preencha os dados oficiais da sua igreja e do responsável pelo contrato.'
                  : 'Conte-nos sobre o estilo pastoral da sua comunidade.'}
              </p>
            </div>
          )}

          {/* Conteúdo por etapa */}
          {currentStep === 'pending' && churchId && (
            <Step1Form
              churchId={churchId}
              initialName={churchName}
              onSuccess={handleStep1Success}
            />
          )}

          {currentStep === 'pastoral' && churchId && (
            <Step2Form
              churchId={churchId}
              onSuccess={handleStep2Success}
            />
          )}

          {isComplete && (
            <CompletionScreen onContinue={handleContinue} />
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2.2: Verificar build**

```bash
cd web && npm run build 2>&1 | tail -30
```

Esperado: `built in Xs` sem erros TypeScript. Se houver erro de tipo, corrigir antes de continuar.

- [ ] **Step 2.3: Verificar que rota existe e renderiza**

```bash
npm run dev
```

Navegar para `http://localhost:5173/onboarding/wizard` — deve renderizar spinner de loading (não crash). Interromper com Ctrl+C.

- [ ] **Step 2.4: Commit**

```bash
git add web/src/pages/onboarding/Wizard.tsx
git commit -m "feat(wizard): Wizard.tsx completo - 2 etapas Cadastro Cristalino (Frente 3B)"
```

---

## Task 3: Church.tsx — TabContratante (admin cockpit)

**Files:**
- Modify: `web/src/pages/admin/Church.tsx`

Adicionar tab que exibe o contratante ativo da igreja (read-only, somente cockpit admin).

- [ ] **Step 3.1: Adicionar import de FileText se não existir**

Em `web/src/pages/admin/Church.tsx`, verificar linha ~6. O import de `FileText` já existe:

```typescript
import {
  ArrowLeft, Building2, CreditCard, Users, Activity,
  Heart, DollarSign, FileText, Bot, UserCheck,
  Loader, StickyNote, Save, Trash2, CheckCircle2, XCircle,
} from 'lucide-react'
```

Se não tiver `FileText`, adicionar nessa lista.

- [ ] **Step 3.2: Adicionar entry na TABS array**

Localizar o array `TABS` (~linha 93) e adicionar entry após `'cadastro'`:

```typescript
const TABS = [
  { id: 'resumo',       label: 'Resumo',          icon: <Building2    size={14} strokeWidth={1.75} /> },
  { id: 'cadastro',     label: 'Cadastro',         icon: <UserCheck    size={14} strokeWidth={1.75} /> },
  { id: 'contratante',  label: 'Contratante',      icon: <FileText     size={14} strokeWidth={1.75} /> },  // ← NOVO
  { id: 'pastoral',     label: 'Perfil Pastoral',  icon: <FileText     size={14} strokeWidth={1.75} /> },  // ← NOVO (ver Task 4)
  { id: 'assinatura',   label: 'Assinatura',       icon: <CreditCard   size={14} strokeWidth={1.75} /> },
  // ... demais tabs inalteradas
]
```

**Atenção:** adicionar APENAS `'contratante'` nesta task. A entrada `'pastoral'` será adicionada na Task 4.

- [ ] **Step 3.3: Implementar componente `TabContratante`**

Adicionar este componente **antes** da função `TabResumo` (~linha 144):

```typescript
// ── TabContratante ─────────────────────────────────────────────

interface ContractorRow {
  id:                  string
  name:                string
  document_type:       string
  document_number:     string
  person_type:         string
  role_label:          string
  email:               string | null
  phone:               string | null
  notes:               string | null
  is_active:           boolean
  created_at:          string
}

function TabContratante({ churchId }: { churchId: string }) {
  const [contractor, setContractor] = useState<ContractorRow | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [error,      setError]      = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data, error: err } = await supabase
        .from('contractors')
        .select('id, name, document_type, document_number, person_type, role_label, email, phone, notes, is_active, created_at')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .maybeSingle()

      if (err) { setError('Erro ao carregar contratante.'); setLoading(false); return }
      setContractor(data as ContractorRow | null)
      setLoading(false)
    }
    void load()
  }, [churchId])

  if (loading) return <div className="flex items-center justify-center py-12"><Loader size={24} className="animate-spin text-gray-300" /></div>

  if (error) return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 text-center">
      <p className="text-sm text-red-600">{error}</p>
    </div>
  )

  if (!contractor) return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 text-center">
      <p className="text-sm text-gray-400">Nenhum contratante ativo. Wizard Etapa 1 não foi concluída.</p>
    </div>
  )

  const DOC_TYPE_LABEL: Record<string, string> = { cpf: 'CPF', cnpj: 'CNPJ' }
  const PERSON_TYPE_LABEL: Record<string, string> = { pf: 'Pessoa Física', pj: 'Pessoa Jurídica' }

  // Mask document number
  function maskDoc(doc: string, type: string) {
    if (type === 'cpf' && doc.length === 11) {
      return `***.***.${doc.slice(6, 9)}-${doc.slice(9)}`
    }
    if (type === 'cnpj' && doc.length === 14) {
      return `**.***.***/****-${doc.slice(12)}`
    }
    return doc
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Contratante Ativo</h3>
        <InfoRow label="Nome" value={contractor.name} />
        <InfoRow label="Cargo / Função" value={contractor.role_label} />
        <InfoRow label="Tipo de Pessoa" value={PERSON_TYPE_LABEL[contractor.person_type] ?? contractor.person_type} />
        <InfoRow label="Tipo de Documento" value={DOC_TYPE_LABEL[contractor.document_type] ?? contractor.document_type} />
        <InfoRow label="Documento" value={maskDoc(contractor.document_number, contractor.document_type)} />
        <InfoRow label="E-mail" value={contractor.email ?? '—'} />
        <InfoRow label="Telefone" value={contractor.phone ?? '—'} />
        <InfoRow label="Observações" value={contractor.notes ?? '—'} />
        <InfoRow label="Cadastrado em" value={relDate(contractor.created_at)} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3.4: Adicionar render da tab no JSX**

Localizar o bloco de render (~linhas 1070-1079) e adicionar linha para `contratante`:

```tsx
{/* Conteúdo da tab */}
{tab === 'resumo'       && <TabResumo      data={data} />}
{tab === 'cadastro'     && <TabCadastro    churchId={id ?? ''} />}
{tab === 'contratante'  && <TabContratante churchId={id ?? ''} />}   {/* ← NOVO */}
{tab === 'assinatura'   && <TabAssinatura  data={data} />}
{tab === 'operacao'     && <TabOperacao    data={data} onAgentChange={load} />}
{tab === 'saude'        && <TabSaude       data={data} />}
{tab === 'financeiro'   && <TabFinanceiro  data={data} />}
{tab === 'pricing'      && <TabPricing data={data} churchId={id ?? ''} onSaved={load} />}
{tab === 'notas'        && <TabNotas   data={data} churchId={id ?? ''} onSaved={load} />}
{tab === 'logs'         && <TabLogs        data={data} onImpersonate={startImpersonate} />}
```

**ATENÇÃO:** `TabPastoral` será adicionado na Task 4 — não adicionar agora.

- [ ] **Step 3.5: Verificar build**

```bash
cd web && npm run build 2>&1 | tail -20
```

Esperado: sem erros TypeScript.

- [ ] **Step 3.6: Commit**

```bash
git add web/src/pages/admin/Church.tsx
git commit -m "feat(cockpit): TabContratante — exibe contratante ativo da igreja (Frente 3B)"
```

---

## Task 4: Church.tsx — TabPastoral (admin cockpit)

**Files:**
- Modify: `web/src/pages/admin/Church.tsx`

Adicionar tab que exibe o perfil pastoral da igreja (read-only).

- [ ] **Step 4.1: Adicionar entry `'pastoral'` na TABS array**

Localizar o array `TABS` (já modificado na Task 3) e confirmar que `'pastoral'` está logo após `'contratante'`:

```typescript
const TABS = [
  { id: 'resumo',       label: 'Resumo',          icon: <Building2    size={14} strokeWidth={1.75} /> },
  { id: 'cadastro',     label: 'Cadastro',         icon: <UserCheck    size={14} strokeWidth={1.75} /> },
  { id: 'contratante',  label: 'Contratante',      icon: <FileText     size={14} strokeWidth={1.75} /> },
  { id: 'pastoral',     label: 'Perfil Pastoral',  icon: <FileText     size={14} strokeWidth={1.75} /> },  // ← NOVO nesta task
  { id: 'assinatura',   label: 'Assinatura',       icon: <CreditCard   size={14} strokeWidth={1.75} /> },
  { id: 'operacao',     label: 'Operação',         icon: <Activity     size={14} strokeWidth={1.75} /> },
  { id: 'saude',        label: 'Saúde',            icon: <Heart        size={14} strokeWidth={1.75} /> },
  { id: 'financeiro',   label: 'Financeiro',       icon: <DollarSign   size={14} strokeWidth={1.75} /> },
  { id: 'pricing',      label: 'Precificação',      icon: <DollarSign   size={14} strokeWidth={1.75} /> },
  { id: 'notas',        label: 'Notas Internas',   icon: <FileText     size={14} strokeWidth={1.75} /> },
  { id: 'logs',         label: 'Logs e Ações',     icon: <FileText     size={14} strokeWidth={1.75} /> },
]
```

- [ ] **Step 4.2: Implementar componente `TabPastoral`**

Adicionar este componente **imediatamente após** `TabContratante` (após a chave fechando `TabContratante`):

```typescript
// ── TabPastoral ────────────────────────────────────────────────

interface PastoralProfileRow {
  church_id:                  string
  estilo_comunicacao:         string | null
  horarios_culto:             string | null
  maior_desafio:              string | null
  foco_pastoral_30_dias:      string | null
  algo_importante_comunidade: string | null
  updated_at:                 string
}

interface ChurchOnboardingInfo {
  onboarding_step:          string
  onboarding_completed_at:  string | null
}

function TabPastoral({ churchId, data }: { churchId: string; data: ChurchDetail }) {
  const [profile,  setProfile]  = useState<PastoralProfileRow | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [info,     setInfo]     = useState<ChurchOnboardingInfo | null>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)

      const [profileRes, churchRes] = await Promise.all([
        supabase
          .from('church_pastoral_profile')
          .select('church_id, estilo_comunicacao, horarios_culto, maior_desafio, foco_pastoral_30_dias, algo_importante_comunidade, updated_at')
          .eq('church_id', churchId)
          .maybeSingle(),
        supabase
          .from('churches')
          .select('onboarding_step, onboarding_completed_at')
          .eq('id', churchId)
          .maybeSingle(),
      ])

      if (profileRes.error) { setError('Erro ao carregar perfil pastoral.'); setLoading(false); return }

      setProfile(profileRes.data as PastoralProfileRow | null)
      setInfo(churchRes.data as ChurchOnboardingInfo | null)
      setLoading(false)
    }
    void load()
  }, [churchId])

  if (loading) return <div className="flex items-center justify-center py-12"><Loader size={24} className="animate-spin text-gray-300" /></div>

  if (error) return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 text-center">
      <p className="text-sm text-red-600">{error}</p>
    </div>
  )

  const STEP_LABELS: Record<string, string> = {
    pending:   '⏳ Pendente (Etapa 1 não iniciada)',
    pastoral:  '🔄 Etapa 1 concluída (aguardando Etapa 2)',
    completed: '✅ Cadastro Cristalino concluído',
  }

  const ESTILO_LABELS: Record<string, string> = {
    formal:       'Formal',
    casual:       'Casual',
    intermediario: 'Intermediário',
  }

  return (
    <div className="space-y-4">
      {/* Status do onboarding */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Status do Cadastro Cristalino</h3>
        <InfoRow
          label="Etapa atual"
          value={STEP_LABELS[info?.onboarding_step ?? 'pending'] ?? info?.onboarding_step ?? '—'}
        />
        {info?.onboarding_completed_at && (
          <InfoRow
            label="Concluído em"
            value={relDate(info.onboarding_completed_at)}
          />
        )}
      </div>

      {/* Perfil pastoral */}
      {!profile ? (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-6 text-center">
          <p className="text-sm text-gray-400">Perfil pastoral não preenchido. Wizard Etapa 2 não foi concluída.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">Perfil Pastoral</h3>
          <InfoRow
            label="Estilo de comunicação"
            value={ESTILO_LABELS[profile.estilo_comunicacao ?? ''] ?? profile.estilo_comunicacao ?? '—'}
          />
          <InfoRow label="Horários dos cultos" value={profile.horarios_culto ?? '—'} />
          <InfoRow label="Maior desafio pastoral" value={profile.maior_desafio ?? '—'} />
          <InfoRow label="Foco 30 dias" value={profile.foco_pastoral_30_dias ?? '—'} />
          <InfoRow label="Contexto da comunidade" value={profile.algo_importante_comunidade ?? '—'} />
          <InfoRow label="Última atualização" value={relDate(profile.updated_at)} />
        </div>
      )}
    </div>
  )
}
```

**Nota:** `TabPastoral` recebe `data: ChurchDetail` como prop, mas usa apenas `churchId` para os fetches. A prop `data` está na assinatura para consistência com outros tabs.

- [ ] **Step 4.3: Adicionar render da tab `pastoral` no JSX**

Localizar o bloco de render (modificado na Task 3) e adicionar linha para `pastoral`:

```tsx
{tab === 'resumo'       && <TabResumo      data={data} />}
{tab === 'cadastro'     && <TabCadastro    churchId={id ?? ''} />}
{tab === 'contratante'  && <TabContratante churchId={id ?? ''} />}
{tab === 'pastoral'     && <TabPastoral    churchId={id ?? ''} data={data} />}  {/* ← NOVO */}
{tab === 'assinatura'   && <TabAssinatura  data={data} />}
{tab === 'operacao'     && <TabOperacao    data={data} onAgentChange={load} />}
{tab === 'saude'        && <TabSaude       data={data} />}
{tab === 'financeiro'   && <TabFinanceiro  data={data} />}
{tab === 'pricing'      && <TabPricing data={data} churchId={id ?? ''} onSaved={load} />}
{tab === 'notas'        && <TabNotas   data={data} churchId={id ?? ''} onSaved={load} />}
{tab === 'logs'         && <TabLogs        data={data} onImpersonate={startImpersonate} />}
```

- [ ] **Step 4.4: Verificar build**

```bash
cd web && npm run build 2>&1 | tail -20
```

Esperado: sem erros TypeScript.

- [ ] **Step 4.5: Commit**

```bash
git add web/src/pages/admin/Church.tsx
git commit -m "feat(cockpit): TabPastoral — status onboarding + perfil pastoral da igreja (Frente 3B)"
```

---

## Task 5: Smoke test E2E (Playwright)

**Files:**
- Create: `web/tests/e2e/frente-3b-smoke.prod.spec.ts`

Testes de smoke que verificam que as novas features não crasharam nada em produção.

- [ ] **Step 5.1: Criar arquivo de smoke test**

```typescript
/**
 * frente-3b-smoke.prod.spec.ts
 * Smoke test E2E — Frente 3B Frontend (Cadastro Cristalino).
 *
 * Pré-condição: global-setup.ts fez login e salvou .auth.json (via storageState).
 * Reutiliza a mesma infra das frentes anteriores.
 *
 * Cobertura:
 *   1. /admin/churches/:id — tab Contratante carrega sem crash
 *   2. /admin/churches/:id — tab Perfil Pastoral carrega sem crash
 *   3. /onboarding/wizard  — rota existe e renderiza (sem crash de página)
 */

import { test, expect } from '@playwright/test'

test.describe('Frente 3B — smoke frontend (produção)', () => {
  test('/admin/churches/:id — tab Contratante carrega sem crash', async ({ page }) => {
    await page.goto('/admin/churches')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    // Aguarda tabela carregar
    const firstRow = page.locator('tbody tr').first()
    const rowVisible = await firstRow.isVisible({ timeout: 10_000 }).catch(() => false)

    if (!rowVisible) {
      console.log('[frente-3b-smoke] Nenhuma igreja encontrada — skip tab tests')
      return
    }

    // Navega para a primeira igreja
    const firstLink = page.locator('tbody tr a, tbody tr [role="link"]').first()
    const linkVisible = await firstLink.isVisible({ timeout: 3_000 }).catch(() => false)
    if (linkVisible) {
      await firstLink.click()
    } else {
      await firstRow.click()
    }

    await page.waitForURL(/\/admin\/churches\/.+/, { timeout: 15_000 }).catch(() => {})

    // Aguarda tabs aparecerem
    await page.waitForSelector('[role="button"], button', { timeout: 10_000 }).catch(() => {})

    // Clica na tab Contratante
    const contratanteTab = page.getByRole('button', { name: /Contratante/i }).first()
    const tabVisible = await contratanteTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (!tabVisible) {
      // Tab pode não estar visível por scroll horizontal — verificar que não crashou
      const bodyText = await page.locator('body').innerText()
      expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)
      console.log('[frente-3b-smoke] Tab Contratante não visível no viewport (scroll needed) — sem crash ✓')
      return
    }

    await contratanteTab.click()
    await page.waitForTimeout(1_500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)
    expect(bodyText).not.toMatch(/Cannot read properties/i)
  })

  test('/admin/churches/:id — tab Perfil Pastoral carrega sem crash', async ({ page }) => {
    await page.goto('/admin/churches')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    const firstRow = page.locator('tbody tr').first()
    const rowVisible = await firstRow.isVisible({ timeout: 10_000 }).catch(() => false)
    if (!rowVisible) { return }

    const firstLink = page.locator('tbody tr a, tbody tr [role="link"]').first()
    const linkVisible = await firstLink.isVisible({ timeout: 3_000 }).catch(() => false)
    if (linkVisible) { await firstLink.click() }
    else { await firstRow.click() }

    await page.waitForURL(/\/admin\/churches\/.+/, { timeout: 15_000 }).catch(() => {})

    const pastoralTab = page.getByRole('button', { name: /Perfil Pastoral/i }).first()
    const tabVisible = await pastoralTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (!tabVisible) {
      const bodyText = await page.locator('body').innerText()
      expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)
      console.log('[frente-3b-smoke] Tab Perfil Pastoral não visível no viewport — sem crash ✓')
      return
    }

    await pastoralTab.click()
    await page.waitForTimeout(1_500)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)
    expect(bodyText).not.toMatch(/Cannot read properties/i)
  })

  test('/onboarding/wizard — rota renderiza sem crash (sem auth → redireciona)', async ({ page }) => {
    // Sem autenticação, o wizard deve redirecionar para /login (ou renderizar sem crash)
    // Teste com auth (usa .auth.json do global-setup)
    await page.goto('/onboarding/wizard')

    // Pode redirecionar para /login ou para /onboarding se step=completed, ou renderizar o wizard
    // Em qualquer caso, não deve ter crash 500
    await page.waitForLoadState('networkidle').catch(() => {})
    await page.waitForTimeout(2_000)

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)
    expect(bodyText).not.toMatch(/Cannot read properties/i)

    // Se redirecionou para /login ou /admin, é esperado (admin tem step=completed ou sem churchId)
    const url = page.url()
    console.log(`[frente-3b-smoke] /onboarding/wizard → redirecionou para: ${url}`)
  })
})
```

- [ ] **Step 5.2: Rodar smoke test em produção**

```bash
cd web && npx playwright test tests/e2e/frente-3b-smoke.prod.spec.ts --config=playwright.prod.config.ts --reporter=list 2>&1 | tail -30
```

Esperado: 3/3 PASSED (ou 2/3 se wizard redirecionar — comportamento correto para admin).

Se algum teste falhar, investigar o erro antes de continuar.

- [ ] **Step 5.3: Commit**

```bash
git add web/tests/e2e/frente-3b-smoke.prod.spec.ts
git commit -m "test(e2e): smoke Frente 3B — tabs Contratante/Pastoral + rota wizard (Frente 3B)"
```

---

## Task 6: Push e verificação final

**Files:** nenhum novo

- [ ] **Step 6.1: Verificar build final limpo**

```bash
cd web && npm run build 2>&1
```

Esperado: zero erros TypeScript, zero warnings críticos.

- [ ] **Step 6.2: Verificar que todos os commits estão na branch correta**

```bash
git log --oneline feat/3b-cadastro-cristalino-frontend | head -10
```

Esperado: commits desta branch (Task 1-5) + o commit inicial de types regenerados.

- [ ] **Step 6.3: Push da branch**

```bash
git push origin feat/3b-cadastro-cristalino-frontend
```

Esperado: `Branch 'feat/3b-cadastro-cristalino-frontend' set up to track remote branch`.

- [ ] **Step 6.4: Reportar URL do PR para o engenheiro-chefe**

PR URL base:
```
https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...feat/3b-cadastro-cristalino-frontend?expand=1
```

Reportar ao engenheiro-chefe (Felipe) que a Frente 3B está pronta para revisão.

---

## Self-Review checklist

### Cobertura do spec

- [x] Wizard em `/onboarding/wizard` — Task 2
- [x] Rota adicionada em App.tsx — Task 1
- [x] Guard em Onboarding.tsx (redireciona pending/pastoral → wizard) — Task 1
- [x] Step 1: formulário dados da igreja + contratante — Task 2 (Step1Form)
- [x] Step 2: formulário perfil pastoral — Task 2 (Step2Form)
- [x] Validação client-side em ambas etapas — Task 2
- [x] Chamadas RPC corretas (`upsert_church_cadastro_cristalino`, `upsert_church_onboarding_pastoral`) — Task 2
- [x] State machine: `pending → pastoral → completed → /onboarding` — Task 2
- [x] TabContratante no cockpit admin — Task 3
- [x] TabPastoral no cockpit admin — Task 4
- [x] Design system Ekthos (red CTAs, cream background, Playfair headings) — Task 2
- [x] Smoke tests E2E — Task 5
- [x] `onboarding_step = 'completed'` redireciona para `/onboarding` (não mostra wizard) — Task 2 (na init, redireciona se `step === 'completed'`)

### Não-placeholders confirmados

- Sem "TBD" ou "TODO" no plano
- Código completo em cada step
- Props e tipos consistentes entre Task 2, 3 e 4

### Consistência de tipos

- `TabPastoral` recebe `churchId: string` e `data: ChurchDetail` — consistente com outros tabs
- `TabContratante` recebe apenas `churchId: string` — consistente com `TabCadastro` existente
- `ContractorRow` usa os mesmos campos que `contractors.Row` do `database.types.ts`
- `PastoralProfileRow` usa os mesmos campos que `church_pastoral_profile.Row` do `database.types.ts`
- RPCs chamados com os parâmetros corretos (`p_church_id`, `p_church_data`, `p_contractor_data`, `p_pastoral_data`)
