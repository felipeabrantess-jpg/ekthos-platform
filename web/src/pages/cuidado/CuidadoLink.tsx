/**
 * CuidadoLink — /cuidado/:token  (PÚBLICA — sem login, sem sidebar)
 * Página do responsável de cuidado. Acesso via token privado de 256-bit.
 *
 * Segurança:
 *   - Token validado pela EF (server-side). Inválido → 404.
 *   - Responsável vê APENAS suas pessoas (filtrado no banco pela EF).
 *   - PATCH valida responsible_id no banco — 0 linhas → 403.
 *   - Sem JWT. Sem auth. Token é a única credencial.
 *   - LGPD: sem analytics/GTM. Sem log de observações.
 *
 * UX: mobile-first 375px. Auto-save ao trocar status (feedback visual).
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams }                        from 'react-router-dom'
import { HeartHandshake, CheckCircle2, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react'

// ── Constantes ────────────────────────────────────────────────────────────────

const EF_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/agent-cuidado`

const CARE_STATUSES: { value: string; label: string; color: string; bg: string }[] = [
  { value: 'pendente',    label: 'Pendente',    color: '#92400e', bg: '#fef3c7' },
  { value: 'contatado',   label: 'Contatado',   color: '#1e40af', bg: '#dbeafe' },
  { value: 'visitado',    label: 'Visitado',    color: '#5b21b6', bg: '#ede9fe' },
  { value: 'cuidando',    label: 'Cuidando',    color: '#065f46', bg: '#d1fae5' },
  { value: 'sem_sucesso', label: 'Sem sucesso', color: '#991b1b', bg: '#fee2e2' },
]

const TYPE_LABELS: Record<string, string> = {
  pastor:     'Pastor(a)',
  lider:      'Líder',
  voluntario: 'Voluntário(a)',
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PersonCare {
  id:               string
  name:             string | null
  phone:            string | null
  neighborhood:     string | null
  care_status:      string | null
  care_observation: string | null
  care_next_step:   string | null
  care_updated_at:  string | null
}

interface Responsible {
  name:   string
  region: string | null
  type:   string
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function formatPhone(phone: string | null) {
  if (!phone) return '—'
  return phone.replace(/^\+55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}

function getStatusCfg(value: string | null) {
  return CARE_STATUSES.find(s => s.value === value) ?? CARE_STATUSES[0]
}

// ── Card de pessoa ─────────────────────────────────────────────────────────────

interface PersonCardProps {
  person:  PersonCare
  token:   string
  onUpdate: (id: string, updates: Partial<PersonCare>) => void
}

function PersonCard({ person, token, onUpdate }: PersonCardProps) {
  const [expanded,    setExpanded]    = useState(false)
  const [status,      setStatus]      = useState(person.care_status ?? 'pendente')
  const [observation, setObservation] = useState(person.care_observation ?? '')
  const [nextStep,    setNextStep]    = useState(person.care_next_step ?? '')
  const [saveState,   setSaveState]   = useState<SaveState>('idle')

  const save = useCallback(async (updates: {
    care_status?:      string
    care_observation?: string
    care_next_step?:   string
  }) => {
    setSaveState('saving')
    try {
      const res = await fetch(EF_URL, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, person_id: person.id, ...updates }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.error === 'forbidden') {
          setSaveState('error')
          return
        }
        throw new Error(`HTTP ${res.status}`)
      }
      const { updated } = await res.json()
      onUpdate(person.id, updated)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } catch {
      setSaveState('error')
      setTimeout(() => setSaveState('idle'), 3000)
    }
  }, [token, person.id, onUpdate])

  async function handleStatusChange(newStatus: string) {
    setStatus(newStatus)
    await save({ care_status: newStatus })
  }

  const cfg = getStatusCfg(status)

  return (
    <div
      className="rounded-2xl overflow-hidden mb-3"
      style={{ border: '1px solid #e5e7eb', background: '#fff' }}
    >
      {/* Header compacto */}
      <div className="flex items-center gap-3 px-4 py-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
          style={{ background: '#f3f4f6', color: '#374151' }}
        >
          {(person.name ?? '?').charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900 truncate">{person.name ?? '—'}</p>
          <p className="text-xs text-gray-500">{formatPhone(person.phone)}</p>
          {person.neighborhood && (
            <p className="text-xs text-gray-400">{person.neighborhood}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Badge de status */}
          <span
            className="text-xs font-semibold rounded-full px-2.5 py-1"
            style={{ background: cfg.bg, color: cfg.color }}
          >
            {cfg.label}
          </span>
          {/* Indicador de save */}
          {saveState === 'saving' && (
            <div className="w-4 h-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
          )}
          {saveState === 'saved' && (
            <CheckCircle2 size={16} className="text-green-500" />
          )}
          {saveState === 'error' && (
            <AlertCircle size={16} className="text-red-500" />
          )}
          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(e => !e)}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
          >
            {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Painel expandido */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
          {/* Seletor de status */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
              Status do cuidado
            </p>
            <div className="flex flex-wrap gap-2">
              {CARE_STATUSES.map(s => (
                <button
                  key={s.value}
                  onClick={() => { void handleStatusChange(s.value) }}
                  className="rounded-full px-3 py-1.5 text-xs font-semibold transition-all"
                  style={{
                    background: status === s.value ? s.bg  : '#f3f4f6',
                    color:      status === s.value ? s.color : '#6b7280',
                    border:     status === s.value ? `2px solid ${s.color}` : '2px solid transparent',
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Observação */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">
              Observação
            </label>
            <textarea
              value={observation}
              onChange={e => setObservation(e.target.value)}
              onBlur={() => { void save({ care_observation: observation }) }}
              placeholder="Como está a pessoa? O que observou?"
              rows={3}
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 resize-none focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Próximo passo */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 block">
              Próximo passo
            </label>
            <input
              type="text"
              value={nextStep}
              onChange={e => setNextStep(e.target.value)}
              onBlur={() => { void save({ care_next_step: nextStep }) }}
              placeholder="Ex: Ligar semana que vem, visitar domingo..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {/* Mensagem de erro */}
          {saveState === 'error' && (
            <p className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle size={12} />
              Erro ao salvar. Verifique sua conexão.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function CuidadoLink() {
  const { token } = useParams<{ token: string }>()
  const [responsible, setResponsible] = useState<Responsible | null>(null)
  const [people,      setPeople]      = useState<PersonCare[]>([])
  const [loading,     setLoading]     = useState(true)
  const [notFound,    setNotFound]    = useState(false)

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return }
    void (async () => {
      try {
        const res = await fetch(`${EF_URL}?token=${token}`)
        if (res.status === 404) { setNotFound(true); return }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = await res.json()
        setResponsible(body.responsible)
        setPeople(body.people)
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  function handleUpdate(id: string, updates: Partial<PersonCare>) {
    setPeople(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f9fafb' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-sm text-gray-500">Carregando...</p>
        </div>
      </div>
    )
  }

  // ── Não encontrado / token inválido ────────────────────────────────────────
  if (notFound || !responsible) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f9fafb' }}>
        <div className="text-center max-w-sm">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: '#fee2e2' }}
          >
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Link inválido</h1>
          <p className="text-sm text-gray-500">
            Este link não existe ou expirou. Solicite um novo link ao responsável da pastoral.
          </p>
        </div>
      </div>
    )
  }

  // ── Conteúdo principal ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#f9fafb' }}>
      {/* Header */}
      <div className="sticky top-0 z-10 px-4 py-4 border-b border-gray-200" style={{ background: '#fff' }}>
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#eff6ff' }}
          >
            <HeartHandshake size={20} className="text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-900 text-sm truncate">{responsible.name}</p>
            <p className="text-xs text-gray-500">
              {TYPE_LABELS[responsible.type] ?? responsible.type}
              {responsible.region ? ` · ${responsible.region}` : ''}
            </p>
          </div>
          <div className="ml-auto shrink-0">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700">
              {people.length} {people.length === 1 ? 'pessoa' : 'pessoas'}
            </span>
          </div>
        </div>
      </div>

      {/* Lista de pessoas */}
      <div className="max-w-lg mx-auto px-4 py-6">
        {people.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <HeartHandshake size={40} className="text-gray-300" strokeWidth={1.25} />
            <p className="text-sm text-gray-500">
              Nenhuma pessoa atribuída a você ainda.
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-4">
              Toque em uma pessoa para ver detalhes e marcar o status de cuidado.
            </p>
            {people.map(p => (
              <PersonCard
                key={p.id}
                person={p}
                token={token!}
                onUpdate={handleUpdate}
              />
            ))}
          </>
        )}

        {/* Rodapé LGPD */}
        <p className="text-center text-xs text-gray-400 mt-8">
          Este link é pessoal e intransferível. As informações aqui são confidenciais.
        </p>
      </div>
    </div>
  )
}
