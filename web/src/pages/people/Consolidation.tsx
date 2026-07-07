import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Heart, AlertTriangle, Clock, Phone, Copy, CheckCircle, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Input from '@/components/ui/Input'
import Spinner from '@/components/ui/Spinner'

interface ConsolidationPerson {
  id: string
  name: string
  email: string | null
  phone: string | null
  avatar_url: string | null
  conversion_date: string | null
  first_visit_date: string | null
  created_at: string
  stage_name: string | null
  days_in_stage: number
  at_risk: boolean
}

// ── Toast ────────────────────────────────────────────────────
interface ToastState { msg: string; type: 'success' | 'error'; key: number }

function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm max-w-xs border"
      style={{
        background:   type === 'success' ? '#f0fdf4' : '#fef2f2',
        borderColor:  type === 'success' ? '#bbf7d0' : '#fecaca',
        color:        type === 'success' ? '#166534' : '#991b1b',
      }}
    >
      {type === 'success'
        ? <CheckCircle size={16} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: '#16a34a' }} />
        : <X           size={16} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: '#dc2626' }} />
      }
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 shrink-0 mt-0.5">
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

// ── Helpers de telefone ───────────────────────────────────────

/** Remove tudo que não é dígito, sem "+". Ex: "+55 21 99703-3891" → "5521997033891" */
function normalizePhoneDigits(phone: string): string {
  return phone.replace(/\D/g, '')
}

function daysSince(dateStr: string | null): number {
  if (!dateStr) return 0
  const d = new Date(dateStr)
  const now = new Date()
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Ícone WhatsApp SVG (inline — sem dependência externa)
function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.126 1.533 5.861L.057 23.997l6.305-1.654A11.954 11.954 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 01-5.006-1.371l-.359-.213-3.722.976.994-3.634-.234-.373A9.817 9.817 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/>
    </svg>
  )
}

function PersonRow({ person, onCopy }: { person: ConsolidationPerson; onCopy: (msg: string) => void }) {
  const hasPhone = Boolean(person.phone)
  const phoneDigits = hasPhone ? normalizePhoneDigits(person.phone!) : ''

  const firstName = (person.name ?? '').split(' ')[0]
  const waMessage = encodeURIComponent(
    `Oi ${firstName}, aqui é da Igreja Gerando Vencedores! Que alegria ter você com a gente 🧡 Posso te ajudar em algo?`
  )
  const waUrl  = `https://wa.me/${phoneDigits}?text=${waMessage}`
  const telUrl = person.phone ? `tel:${person.phone.trim()}` : undefined

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(person.phone!)
      onCopy('Telefone copiado!')
    } catch {
      onCopy('Não foi possível copiar.')
    }
  }

  const actionBtn = (label: string, disabled: boolean, extraClass: string) =>
    `inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
      disabled
        ? 'opacity-40 cursor-not-allowed bg-gray-100 text-gray-400'
        : extraClass
    }`

  return (
    <div className={`bg-white rounded-2xl border p-4 flex gap-3 items-start ${person.at_risk ? 'border-red-200' : 'border-black/10'}`}>
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-cream flex items-center justify-center text-brand-600 font-semibold text-sm shrink-0">
        {(person.name ?? '?').charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-ekthos-black text-sm truncate">{person.name ?? '(sem nome)'}</p>
          {person.at_risk && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium bg-red-50 text-red-600 shrink-0">
              <AlertTriangle className="w-3 h-3" />
              em risco
            </span>
          )}
        </div>

        {person.email && <p className="text-xs text-gray-400 truncate">{person.email}</p>}
        {person.phone
          ? <p className="text-xs text-gray-400">{person.phone}</p>
          : <p className="text-xs text-red-400 italic">Sem telefone cadastrado</p>
        }

        <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
          {person.conversion_date && (
            <span className="flex items-center gap-1">
              <Heart className="w-3 h-3 text-brand-600" />
              Convertido em {formatDate(person.conversion_date)}
            </span>
          )}
          {person.first_visit_date && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Primeira visita {formatDate(person.first_visit_date)}
            </span>
          )}
          {person.stage_name && (
            <span className="bg-brand-50 text-brand-700 px-2 py-0.5 rounded-lg font-medium">
              {person.stage_name} · {person.days_in_stage}d
            </span>
          )}
        </div>

        {/* Ações rápidas */}
        <div className="mt-3 flex flex-wrap gap-2">
          {/* WhatsApp */}
          {hasPhone ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={actionBtn('WhatsApp', false, 'bg-[#e8f9f2] text-[#1D9E75] hover:bg-[#d0f3e6]')}
              title="Abrir WhatsApp"
            >
              <WhatsAppIcon size={14} />
              WhatsApp
            </a>
          ) : (
            <span className={actionBtn('WhatsApp', true, '')} title="Sem telefone cadastrado">
              <WhatsAppIcon size={14} />
              WhatsApp
            </span>
          )}

          {/* Ligar */}
          {hasPhone ? (
            <a
              href={telUrl}
              className={actionBtn('Ligar', false, 'bg-blue-50 text-blue-600 hover:bg-blue-100')}
              title="Ligar"
            >
              <Phone size={13} />
              Ligar
            </a>
          ) : (
            <span className={actionBtn('Ligar', true, '')} title="Sem telefone cadastrado">
              <Phone size={13} />
              Ligar
            </span>
          )}

          {/* Copiar */}
          <button
            onClick={hasPhone ? handleCopy : undefined}
            disabled={!hasPhone}
            className={actionBtn('Copiar', !hasPhone, 'bg-gray-100 text-gray-600 hover:bg-gray-200')}
            title={hasPhone ? 'Copiar telefone' : 'Sem telefone cadastrado'}
          >
            <Copy size={13} />
            Copiar
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Consolidation() {
  const { churchId } = useAuth()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'at_risk'>('all')
  const [toast,  setToast]  = useState<ToastState | null>(null)

  function showToast(msg: string) {
    setToast({ msg, type: 'success', key: Date.now() })
  }

  const { data: people = [], isLoading } = useQuery({
    queryKey: ['consolidation', churchId],
    enabled: !!churchId,
    queryFn: async () => {
      // Get people with recent activity (last 90 days).
      // C2: usa OR entre conversion_date, first_visit_date e created_at como fallback
      // para incluir visitantes que chegaram via QR Code mas sem conversion_date.
      const ninetyDaysAgo = new Date()
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
      const dateStr = ninetyDaysAgo.toISOString().split('T')[0]

      const { data } = await supabase
        .from('people')
        .select('id, name, email, phone, avatar_url, conversion_date, first_visit_date, person_stage, created_at')
        .eq('church_id', churchId!)
        // C2: OR entre os 3 campos para incluir visitantes QR Code (sem conversion_date)
        .or(`conversion_date.gte.${dateStr},first_visit_date.gte.${dateStr},created_at.gte.${dateStr}`)
        .is('deleted_at', null)
        .not('name', 'is', null)
        .order('conversion_date', { ascending: false, nullsFirst: false })

      return (data ?? []).map(p => {
        // C2: fallback hierárquico: conversion_date → first_visit_date → created_at
        const refDate = p.conversion_date ?? p.first_visit_date ?? p.created_at
        const days = daysSince(refDate)
        // person_stage is ENUM — show its value as label directly
        const stageName = p.person_stage as string | null

        return {
          ...p,
          stage_name: stageName,
          days_in_stage: days,
          at_risk: days > 30,
        } as ConsolidationPerson
      })
    },
  })

  const filtered = people
    .filter(p => filter === 'all' || p.at_risk)
    .filter(p =>
      (p.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.email ?? '').toLowerCase().includes(search.toLowerCase())
    )

  const atRiskCount = people.filter(p => p.at_risk).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center">
          <Heart className="w-5 h-5 text-brand-600" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-ekthos-black">Consolidação</h1>
          <p className="text-sm text-gray-500">Pessoas nas etapas de entrada do discipulado</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-black/10 p-4 text-center">
          <p className="text-2xl font-bold text-ekthos-black">{people.length}</p>
          <p className="text-xs text-gray-400 mt-1">Em consolidação</p>
        </div>
        <div className={`rounded-2xl border p-4 text-center ${atRiskCount > 0 ? 'bg-red-50 border-red-200' : 'bg-white border-black/10'}`}>
          <p className={`text-2xl font-bold ${atRiskCount > 0 ? 'text-red-600' : 'text-ekthos-black'}`}>{atRiskCount}</p>
          <p className="text-xs text-gray-400 mt-1">Em risco (+30 dias)</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Input
          placeholder="Buscar pessoa..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="flex-1"
        />
        <div className="flex border border-black/10 rounded-xl overflow-hidden shrink-0">
          {(['all', 'at_risk'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-gray-500 hover:bg-cream'
              }`}
            >
              {f === 'all' ? 'Todos' : 'Em risco'}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Heart className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {search || filter === 'at_risk'
              ? 'Nenhuma pessoa encontrada.'
              : 'Nenhuma pessoa em consolidação.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(person => (
            <PersonRow key={person.id} person={person} onCopy={showToast} />
          ))}
        </div>
      )}

      {toast && (
        <Toast key={toast.key} msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  )
}
