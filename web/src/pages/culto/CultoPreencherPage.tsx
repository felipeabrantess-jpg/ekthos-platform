/**
 * CultoPreencherPage — /culto/preencher/:token  (PÚBLICA — sem login, sem sidebar)
 *
 * Voluntário usa o link fixo da sede para preencher o Registro de Culto.
 * Cada acesso carrega o rascunho ativo (draft) ou formulário em branco.
 * Auto-save via PATCH ao alterar campos; POST ao "Finalizar".
 *
 * Segurança (idêntico ao Cuidado):
 *   - Token 256-bit validado pela EF (server-side). Inválido → 404.
 *   - Nenhum dado sensível de membros exposto (só contagens + nome pastor).
 *   - Sem JWT. Token é a única credencial.
 *   - LGPD: sem analytics, sem log de textos livres no frontend.
 *
 * UX: mobile-first 375px. Voluntário usa no celular no dia do culto.
 *
 * ⚠️ PENDENTE: EF service-report-handler está com verify_jwt=true (spend cap
 *    bloqueou redeploy). Fluxo UI está completo; teste E2E fica pendente até
 *    Felipe desabilitar spend cap e redeploy com verify_jwt=false.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams }                                 from 'react-router-dom'
import {
  Church,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
} from 'lucide-react'

// ── Constantes ────────────────────────────────────────────────────────────────

const EF_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/service-report-handler`

const SERVICE_TYPES = [
  { value: 'domingo_manha', label: 'Domingo manhã'  },
  { value: 'domingo_noite', label: 'Domingo noite'  },
  { value: 'quarta',        label: 'Quarta-feira'   },
  { value: 'especial',      label: 'Culto especial' },
] as const

type ServiceTypeValue = typeof SERVICE_TYPES[number]['value']

const SEDE_LABELS: Record<string, string> = {
  itaipu:   'Itaipu',
  trindade: 'Trindade',
  geral:    'Geral',
}

const AREAS = [
  { key: 'kids',        label: 'Kids',       hasKidsCount: true  },
  { key: 'recepcao',    label: 'Recepção',   hasKidsCount: false },
  { key: 'portaria',    label: 'Portaria',   hasKidsCount: false },
  { key: 'louvor',      label: 'Louvor',     hasKidsCount: false },
  { key: 'intercessao', label: 'Intercessão',hasKidsCount: false },
] as const

type AreaKey = typeof AREAS[number]['key']

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Reporter {
  name: string
  sede: string
}

interface AreaState {
  active:          boolean
  volunteer_count: number
  kids_count:      number | null
}

interface FormState {
  service_date:      string
  service_type:      ServiceTypeValue
  pastor_name:       string
  is_guest_pastor:   boolean
  guest_pastor_name: string
  worship_leader:    string
  sermon_topic:      string
  total_people:      string
  total_visitors:    string
  notes:             string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type PageState = 'loading' | 'form' | 'success' | 'not_found' | 'error'

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyForm(): FormState {
  return {
    service_date:      '',
    service_type:      'domingo_manha',
    pastor_name:       '',
    is_guest_pastor:   false,
    guest_pastor_name: '',
    worship_leader:    '',
    sermon_topic:      '',
    total_people:      '',
    total_visitors:    '',
    notes:             '',
  }
}

function emptyAreas(): Record<AreaKey, AreaState> {
  return Object.fromEntries(
    AREAS.map(a => [a.key, { active: false, volunteer_count: 0, kids_count: null }])
  ) as Record<AreaKey, AreaState>
}

function areasPayload(areas: Record<AreaKey, AreaState>) {
  const result: Record<string, { volunteer_count: number; kids_count?: number } | null> = {}
  for (const a of AREAS) {
    if (areas[a.key].active) {
      result[a.key] = {
        volunteer_count: areas[a.key].volunteer_count,
        ...(a.hasKidsCount && areas[a.key].kids_count !== null
          ? { kids_count: areas[a.key].kids_count as number }
          : {}),
      }
    } else {
      result[a.key] = null
    }
  }
  return result
}

// ── Toggle de área ────────────────────────────────────────────────────────────

interface AreaToggleProps {
  areaKey:  AreaKey
  label:    string
  hasKids:  boolean
  state:    AreaState
  onChange: (key: AreaKey, next: Partial<AreaState>) => void
}

function AreaToggle({ areaKey, label, hasKids, state, onChange }: AreaToggleProps) {
  const [expanded, setExpanded] = useState(state.active)

  function handleToggle() {
    const next = !state.active
    setExpanded(next)
    onChange(areaKey, { active: next })
  }

  return (
    <div
      className="rounded-2xl overflow-hidden mb-3"
      style={{ border: `1px solid ${state.active ? '#3b82f6' : '#e5e7eb'}`, background: '#fff' }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-3">
          {/* Toggle visual */}
          <div
            className="w-10 h-6 rounded-full relative transition-colors duration-200 shrink-0"
            style={{ background: state.active ? '#3b82f6' : '#d1d5db' }}
          >
            <div
              className="w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-200 shadow-sm"
              style={{ left: state.active ? '22px' : '4px' }}
            />
          </div>
          <span
            className="text-sm font-semibold"
            style={{ color: state.active ? '#1d4ed8' : '#6b7280' }}
          >
            {label}
          </span>
        </div>
        {state.active && (
          expanded
            ? <ChevronUp   size={16} className="text-blue-400 shrink-0" />
            : <ChevronDown size={16} className="text-blue-400 shrink-0" />
        )}
      </button>

      {/* Campos expandidos */}
      {state.active && expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-blue-100">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-1">
              Voluntários escalados
            </label>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              value={state.volunteer_count || ''}
              onChange={e => onChange(areaKey, { volunteer_count: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              placeholder="0"
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
          {hasKids && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 block mb-1">
                Crianças presentes
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={state.kids_count ?? ''}
                onChange={e => onChange(areaKey, { kids_count: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                placeholder="0"
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tela de sucesso ────────────────────────────────────────────────────────────

interface SuccessScreenProps {
  viewUrl:  string
  sede:     string
}

function SuccessScreen({ viewUrl, sede }: SuccessScreenProps) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(viewUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 3000)
    } catch {
      /* fallback: select text */
      const el = document.querySelector<HTMLInputElement>('#view-url-input')
      el?.select()
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12" style={{ background: '#f0fdf4' }}>
      <div className="max-w-sm w-full">
        {/* Ícone de sucesso */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center mb-4"
            style={{ background: '#dcfce7' }}
          >
            <CheckCircle2 size={40} className="text-green-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 text-center mb-1">
            Relatório enviado!
          </h1>
          <p className="text-sm text-gray-500 text-center">
            Sede {SEDE_LABELS[sede] ?? sede} — registro salvo no CRM
          </p>
        </div>

        {/* Link de visualização */}
        <div
          className="rounded-2xl p-4 mb-4"
          style={{ background: '#fff', border: '1px solid #d1fae5' }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Link para o Pr. Valdir
          </p>
          <input
            id="view-url-input"
            type="text"
            readOnly
            value={viewUrl}
            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-xs text-gray-700 bg-gray-50 focus:outline-none mb-3"
          />
          <button
            type="button"
            onClick={() => { void handleCopy() }}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition-all"
            style={{
              background: copied ? '#16a34a' : '#2563eb',
              color: '#fff',
            }}
          >
            {copied
              ? <><Check size={16} /> Link copiado!</>
              : <><Copy size={16} /> Copiar link</>
            }
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center leading-relaxed">
          Copie o link e envie para o Pr. Valdir no WhatsApp.
          Ele poderá ver o relatório completo sem precisar de login.
        </p>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function CultoPreencherPage() {
  const { token } = useParams<{ token: string }>()

  const [pageState,   setPageState]   = useState<PageState>('loading')
  const [reporter,    setReporter]    = useState<Reporter | null>(null)
  const [form,        setForm]        = useState<FormState>(emptyForm())
  const [areas,       setAreas]       = useState<Record<AreaKey, AreaState>>(emptyAreas())
  const [saveState,   setSaveState]   = useState<SaveState>('idle')
  const [submitting,  setSubmitting]  = useState(false)
  const [viewUrl,     setViewUrl]     = useState('')

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Carga inicial ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) { setPageState('not_found'); return }
    void (async () => {
      try {
        const res = await fetch(`${EF_URL}?fill_token=${token}`)
        if (res.status === 404) { setPageState('not_found'); return }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = await res.json() as {
          reporter: Reporter
          draft:    Record<string, unknown> | null
          areas:    { area_name: string; volunteer_count: number; kids_count: number | null }[]
        }
        setReporter(body.reporter)

        // Preenche rascunho se existir
        if (body.draft) {
          const d = body.draft
          setForm({
            service_date:      (d.service_date as string)  ?? '',
            service_type:      (d.service_type as ServiceTypeValue) ?? 'domingo_manha',
            pastor_name:       (d.pastor_name as string)   ?? '',
            is_guest_pastor:   (d.is_guest_pastor as boolean) ?? false,
            guest_pastor_name: (d.guest_pastor_name as string) ?? '',
            worship_leader:    (d.worship_leader as string) ?? '',
            sermon_topic:      (d.sermon_topic as string)  ?? '',
            total_people:      d.total_people != null ? String(d.total_people) : '',
            total_visitors:    d.total_visitors != null ? String(d.total_visitors) : '',
            notes:             (d.notes as string) ?? '',
          })
        }

        // Preenche áreas
        if (body.areas?.length) {
          setAreas(prev => {
            const next = { ...prev }
            for (const a of body.areas) {
              const key = a.area_name as AreaKey
              if (key in next) {
                next[key] = {
                  active:          true,
                  volunteer_count: a.volunteer_count,
                  kids_count:      a.kids_count,
                }
              }
            }
            return next
          })
        }

        setPageState('form')
      } catch {
        setPageState('error')
      }
    })()
  }, [token])

  // ── Auto-save (debounce 1.5s) ──────────────────────────────────────────────
  const autoSave = useCallback(
    (nextForm: FormState, nextAreas: Record<AreaKey, AreaState>) => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => {
        void (async () => {
          setSaveState('saving')
          try {
            const res = await fetch(EF_URL, {
              method:  'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                fill_token:        token,
                service_date:      nextForm.service_date      || undefined,
                service_type:      nextForm.service_type,
                pastor_name:       nextForm.pastor_name       || undefined,
                is_guest_pastor:   nextForm.is_guest_pastor,
                guest_pastor_name: nextForm.guest_pastor_name || undefined,
                worship_leader:    nextForm.worship_leader    || undefined,
                sermon_topic:      nextForm.sermon_topic      || undefined,
                total_people:      nextForm.total_people ? parseInt(nextForm.total_people, 10) : undefined,
                total_visitors:    nextForm.total_visitors ? parseInt(nextForm.total_visitors, 10) : undefined,
                notes:             nextForm.notes             || undefined,
                areas:             areasPayload(nextAreas),
              }),
            })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            setSaveState('saved')
            setTimeout(() => setSaveState('idle'), 2000)
          } catch {
            setSaveState('error')
            setTimeout(() => setSaveState('idle'), 3000)
          }
        })()
      }, 1500)
    },
    [token]
  )

  function updateForm(patch: Partial<FormState>) {
    const next = { ...form, ...patch }
    setForm(next)
    autoSave(next, areas)
  }

  function updateArea(key: AreaKey, patch: Partial<AreaState>) {
    const next = { ...areas, [key]: { ...areas[key], ...patch } }
    setAreas(next)
    autoSave(form, next)
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.service_date) return
    setSubmitting(true)
    try {
      const res = await fetch(EF_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fill_token:        token,
          service_date:      form.service_date,
          service_type:      form.service_type,
          pastor_name:       form.pastor_name       || undefined,
          is_guest_pastor:   form.is_guest_pastor,
          guest_pastor_name: form.guest_pastor_name || undefined,
          worship_leader:    form.worship_leader    || undefined,
          sermon_topic:      form.sermon_topic      || undefined,
          total_people:      form.total_people ? parseInt(form.total_people, 10) : undefined,
          total_visitors:    form.total_visitors ? parseInt(form.total_visitors, 10) : undefined,
          notes:             form.notes             || undefined,
          areas:             areasPayload(areas),
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const body = await res.json() as { view_url: string }
      setViewUrl(body.view_url)
      setPageState('success')
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Estados de página ──────────────────────────────────────────────────────
  if (pageState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f9fafb' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    )
  }

  if (pageState === 'not_found') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f9fafb' }}>
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#fee2e2' }}>
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Link inválido</h1>
          <p className="text-sm text-gray-500">
            Este link não existe ou foi desativado. Solicite um novo link à equipe Ekthos.
          </p>
        </div>
      </div>
    )
  }

  if (pageState === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f9fafb' }}>
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#fef3c7' }}>
            <AlertCircle size={28} className="text-yellow-500" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Erro ao carregar</h1>
          <p className="text-sm text-gray-500 mb-4">
            Não conseguimos carregar o formulário. Verifique sua conexão e tente novamente.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ background: '#2563eb' }}
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (pageState === 'success') {
    return <SuccessScreen viewUrl={viewUrl} sede={reporter?.sede ?? 'geral'} />
  }

  // ── Formulário ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen pb-24" style={{ background: '#f9fafb' }}>
      {/* Header fixo */}
      <div
        className="sticky top-0 z-10 border-b border-gray-200 px-4 py-4"
        style={{ background: '#fff' }}
      >
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#eff6ff' }}
          >
            <Church size={20} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm">Registro de Culto</p>
            <p className="text-xs text-gray-500">
              Sede {reporter ? (SEDE_LABELS[reporter.sede] ?? reporter.sede) : '—'}
            </p>
          </div>
          {/* Indicador de auto-save */}
          <div className="shrink-0">
            {saveState === 'saving' && (
              <div className="flex items-center gap-1.5 text-xs text-blue-500">
                <Loader2 size={12} className="animate-spin" />
                Salvando...
              </div>
            )}
            {saveState === 'saved' && (
              <div className="flex items-center gap-1.5 text-xs text-green-600">
                <CheckCircle2 size={12} />
                Salvo
              </div>
            )}
            {saveState === 'error' && (
              <div className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertCircle size={12} />
                Erro ao salvar
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Formulário */}
      <form onSubmit={(e) => { void handleSubmit(e) }} className="max-w-lg mx-auto px-4 pt-6 space-y-6">

        {/* ── Bloco: Culto ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Culto</h2>

          {/* Data */}
          <div className="mb-4">
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">
              Data do culto <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={form.service_date}
              onChange={e => updateForm({ service_date: e.target.value })}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Tipo de culto */}
          <div className="mb-4">
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">Tipo de culto</label>
            <div className="grid grid-cols-2 gap-2">
              {SERVICE_TYPES.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => updateForm({ service_type: t.value })}
                  className="rounded-xl px-3 py-2.5 text-sm font-medium transition-all text-left"
                  style={{
                    background: form.service_type === t.value ? '#dbeafe' : '#f9fafb',
                    color:      form.service_type === t.value ? '#1e40af' : '#6b7280',
                    border:     `2px solid ${form.service_type === t.value ? '#3b82f6' : '#e5e7eb'}`,
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ── Bloco: Pastor ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Pastor</h2>

          {/* Nome do pastor */}
          <div className="mb-4">
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">
              Pastor que pregou
            </label>
            <input
              type="text"
              value={form.pastor_name}
              onChange={e => updateForm({ pastor_name: e.target.value })}
              placeholder="Ex: Pr. Valdir"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Convidado toggle */}
          <div className="mb-4">
            <button
              type="button"
              onClick={() => updateForm({ is_guest_pastor: !form.is_guest_pastor })}
              className="flex items-center gap-3 w-full"
            >
              <div
                className="w-10 h-6 rounded-full relative transition-colors duration-200 shrink-0"
                style={{ background: form.is_guest_pastor ? '#3b82f6' : '#d1d5db' }}
              >
                <div
                  className="w-4 h-4 bg-white rounded-full absolute top-1 transition-all duration-200 shadow-sm"
                  style={{ left: form.is_guest_pastor ? '22px' : '4px' }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700">Pastor convidado</span>
            </button>
          </div>

          {/* Nome do convidado */}
          {form.is_guest_pastor && (
            <div className="mb-4">
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                Nome do convidado
              </label>
              <input
                type="text"
                value={form.guest_pastor_name}
                onChange={e => updateForm({ guest_pastor_name: e.target.value })}
                placeholder="Nome completo do pastor convidado"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          )}
        </section>

        {/* ── Bloco: Louvor ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Louvor</h2>

          <div className="mb-4">
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">
              Responsável pelo louvor/adoração
            </label>
            <input
              type="text"
              value={form.worship_leader}
              onChange={e => updateForm({ worship_leader: e.target.value })}
              placeholder="Nome do ministro/adorador"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          <div className="mb-4">
            <label className="text-sm font-semibold text-gray-700 block mb-1.5">
              Tema/palavra
            </label>
            <input
              type="text"
              value={form.sermon_topic}
              onChange={e => updateForm({ sermon_topic: e.target.value })}
              placeholder="Ex: Fé que move montanhas — Marcos 11:23"
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </section>

        {/* ── Bloco: Presença ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Presença</h2>

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                Total de pessoas
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.total_people}
                onChange={e => updateForm({ total_people: e.target.value })}
                placeholder="0"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-gray-700 block mb-1.5">
                Visitantes
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                value={form.total_visitors}
                onChange={e => updateForm({ total_visitors: e.target.value })}
                placeholder="0"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>
        </section>

        {/* ── Bloco: Áreas ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Áreas de serviço
          </h2>
          <p className="text-xs text-gray-400 mb-3">
            Ative apenas as áreas que funcionaram neste culto.
          </p>
          {AREAS.map(a => (
            <AreaToggle
              key={a.key}
              areaKey={a.key}
              label={a.label}
              hasKids={a.hasKidsCount}
              state={areas[a.key]}
              onChange={updateArea}
            />
          ))}
        </section>

        {/* ── Observações ── */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
            Observações
          </h2>
          <textarea
            value={form.notes}
            onChange={e => updateForm({ notes: e.target.value })}
            placeholder="Algo importante que aconteceu no culto? Situações especiais, pedidos de oração, avisos..."
            rows={4}
            className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
        </section>

        {/* ── Botão Finalizar ── */}
        <div className="fixed bottom-0 left-0 right-0 px-4 pb-6 pt-4" style={{ background: '#f9fafb' }}>
          <div className="max-w-lg mx-auto">
            {!form.service_date && (
              <p className="text-xs text-center text-red-500 mb-2">
                Informe a data do culto para finalizar.
              </p>
            )}
            <button
              type="submit"
              disabled={!form.service_date || submitting}
              className="w-full rounded-2xl py-4 text-base font-bold text-white transition-all disabled:opacity-50"
              style={{ background: form.service_date ? '#2563eb' : '#9ca3af' }}
            >
              {submitting
                ? <span className="flex items-center justify-center gap-2"><Loader2 size={18} className="animate-spin" /> Finalizando...</span>
                : 'Finalizar e gerar link'}
            </button>
          </div>
        </div>

        {/* Espaçador do botão fixo */}
        <div className="h-4" />
      </form>
    </div>
  )
}
