/**
 * Volunteers.tsx — Módulo de Cuidado de Voluntários
 *
 * Partes:
 *  - Painel de status (total / servindo / afastado / precisa cuidado) — Parte 4
 *  - Lista com badge de care_status — Parte 2
 *  - Drawer de ficha individual (edição inline + histórico) — Partes 2 e 3
 *  - Registro de novo cuidado — Parte 3
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  HandHeart, Search, X, Plus, Trash2, Pencil,
  ChevronRight, Calendar, MessageSquare, Clock, User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import ModalPortal from '@/components/ui/ModalPortal'
import { useAuth } from '@/hooks/useAuth'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import {
  useVoluntarios,
  useCreateVolunteer,
  useUpdateVolunteer,
  useDeactivateVolunteer,
} from '@/features/voluntarios/hooks/useVoluntarios'
import {
  useVolunteerCareStats,
  useCareLogs,
  useAddCareLog,
  useUpdateCareFields,
  type CareStatus,
  type Satisfaction,
  type CareType,
  CARE_STATUS_LABEL,
  SATISFACTION_LABEL,
  CARE_TYPE_LABEL,
} from '@/features/voluntarios/hooks/useVolunteerCare'
import type { VolunteerWithPerson } from '@/lib/types/joins'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ministry { id: string; name: string }
interface PersonResult { id: string; name: string; email: string | null; phone: string | null }

type VolunteerRow = VolunteerWithPerson & {
  ministries?: Ministry | null
  care_status?: CareStatus
  satisfaction?: Satisfaction | null
  care_notes?: string | null
  care_responsible_id?: string | null
}

const ROLE_LABELS: Record<string, string> = {
  volunteer:   'Voluntário',
  leader:      'Líder',
  'co-leader': 'Co-líder',
}

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

// ── Helpers de estilo por status ──────────────────────────────────────────────

function careStatusStyle(status: CareStatus | undefined) {
  switch (status) {
    case 'servindo':
      return { bg: 'bg-[#E8F5E9]', text: 'text-[#2D7A4F]', dot: '#2D7A4F' }
    case 'afastado':
      return { bg: 'bg-amber-50', text: 'text-amber-700', dot: '#D97706' }
    case 'precisa_cuidado':
      return { bg: 'bg-red-50', text: 'text-red-700', dot: '#DC2626' }
    default:
      return { bg: 'bg-bg-hover', text: 'text-text-secondary', dot: '#9CA3AF' }
  }
}

function satisfactionStyle(s: Satisfaction | null | undefined) {
  switch (s) {
    case 'satisfeito':  return 'bg-[#E8F5E9] text-[#2D7A4F]'
    case 'neutro':      return 'bg-amber-50 text-amber-700'
    case 'insatisfeito': return 'bg-red-50 text-red-700'
    default:            return 'bg-bg-hover text-text-secondary'
  }
}

// ── PARTE 4: Painel de status ─────────────────────────────────────────────────

interface CarePanelProps {
  churchId: string
  statusFilter: CareStatus | null
  onFilter: (s: CareStatus | null) => void
}

function CarePanel({ churchId, statusFilter, onFilter }: CarePanelProps) {
  const { data: stats, isLoading } = useVolunteerCareStats(churchId)

  const cards: { label: string; key: CareStatus | null; value: number; color: string; bg: string; border: string }[] = [
    { label: 'Total',           key: null,             value: stats?.total ?? 0,           color: 'text-text-primary',  bg: 'bg-bg-primary',  border: 'border-border-default' },
    { label: 'Servindo',        key: 'servindo',       value: stats?.servindo ?? 0,        color: 'text-[#2D7A4F]',     bg: 'bg-[#F0FBF7]',  border: 'border-[#A8DEC9]' },
    { label: 'Afastados',       key: 'afastado',       value: stats?.afastado ?? 0,        color: 'text-amber-700',      bg: 'bg-amber-50',    border: 'border-amber-200' },
    { label: 'Precisa Cuidado', key: 'precisa_cuidado', value: stats?.precisa_cuidado ?? 0, color: 'text-red-600',        bg: 'bg-red-50',      border: 'border-red-200' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {cards.map(card => {
        const active = statusFilter === card.key
        return (
          <button
            key={card.label}
            onClick={() => onFilter(active ? null : card.key)}
            className={`rounded-2xl border p-4 text-center transition-all hover:shadow-md ${card.bg} ${card.border} ${active ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
          >
            {isLoading ? (
              <div className="h-7 flex items-center justify-center"><Spinner size="sm" /></div>
            ) : (
              <p className={`text-2xl font-bold font-mono ${card.color}`}>{card.value}</p>
            )}
            <p className="text-xs text-text-secondary mt-1 font-medium">{card.label}</p>
          </button>
        )
      })}
    </div>
  )
}

// ── PARTE 3: Timeline de cuidado ──────────────────────────────────────────────

const CARE_TYPE_ICON: Record<CareType, string> = {
  reuniao:  '🤝',
  conversa: '💬',
  visita:   '🏠',
  ligacao:  '📞',
  outro:    '📝',
}

interface AddCareLogFormProps {
  volunteerId: string
  churchId: string
  onDone: () => void
}

function AddCareLogForm({ volunteerId, churchId, onDone }: AddCareLogFormProps) {
  const today = new Date().toISOString().slice(0, 10)
  const [careDate, setCareDate] = useState(today)
  const [careType, setCareType] = useState<CareType>('reuniao')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const addLog = useAddCareLog()

  async function handleSubmit() {
    setError(null)
    try {
      await addLog.mutateAsync({ volunteer_id: volunteerId, church_id: churchId, care_date: careDate, care_type: careType, notes })
      setNotes('')
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar')
    }
  }

  return (
    <div className="border border-border-default rounded-xl p-4 space-y-3 bg-bg-primary">
      <p className="text-sm font-semibold text-text-primary">Registrar cuidado</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Data</label>
          <input
            type="date"
            value={careDate}
            max={today}
            onChange={e => setCareDate(e.target.value)}
            className="w-full rounded-xl border border-border-default px-3 py-2 text-sm bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Tipo</label>
          <select
            value={careType}
            onChange={e => setCareType(e.target.value as CareType)}
            className="w-full rounded-xl border border-border-default px-3 py-2 text-sm bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {(Object.keys(CARE_TYPE_LABEL) as CareType[]).map(t => (
              <option key={t} value={t}>{CARE_TYPE_ICON[t]} {CARE_TYPE_LABEL[t]}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-text-secondary mb-1">O que foi conversado</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Descreva brevemente o encontro..."
          rows={3}
          className="w-full rounded-xl border border-border-default px-3 py-2 text-sm bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-primary resize-none"
        />
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}

      <Button
        onClick={() => { void handleSubmit() }}
        loading={addLog.isPending}
        disabled={addLog.isPending}
        className="w-full"
      >
        Salvar registro
      </Button>
    </div>
  )
}

interface CareTimelineProps {
  volunteerId: string
  churchId: string
}

function CareTimeline({ volunteerId, churchId }: CareTimelineProps) {
  const [showForm, setShowForm] = useState(false)
  const { data: logs = [], isLoading } = useCareLogs(volunteerId)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">Histórico de cuidado</p>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1 text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors"
            style={{ backgroundColor: '#EDE9FE', color: '#5B21B6' }}
          >
            <Plus className="w-3.5 h-3.5" />
            Registrar
          </button>
        )}
      </div>

      {showForm && (
        <AddCareLogForm
          volunteerId={volunteerId}
          churchId={churchId}
          onDone={() => setShowForm(false)}
        />
      )}

      {isLoading ? (
        <div className="flex justify-center py-4"><Spinner size="sm" /></div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-text-tertiary text-center py-4">
          Nenhum registro de cuidado ainda.
        </p>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const d = new Date(log.care_date + 'T12:00:00')
            const dateStr = d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
            return (
              <div
                key={log.id}
                className="flex gap-3 rounded-xl border border-border-default p-3 bg-bg-primary"
              >
                <div
                  className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0 text-lg"
                  style={{ backgroundColor: '#EDE9FE' }}
                >
                  {CARE_TYPE_ICON[log.care_type as CareType] ?? '📝'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold" style={{ color: '#5B21B6' }}>
                      {CARE_TYPE_LABEL[log.care_type as CareType] ?? log.care_type}
                    </span>
                    <span className="text-xs text-text-tertiary flex items-center gap-1">
                      <Calendar className="w-3 h-3" />{dateStr}
                    </span>
                    {log.created_by_name && (
                      <span className="text-xs text-text-tertiary flex items-center gap-1">
                        <User className="w-3 h-3" />{log.created_by_name}
                      </span>
                    )}
                  </div>
                  {log.notes && (
                    <p className="mt-1 text-sm text-text-secondary">{log.notes}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── PARTE 2: Drawer de ficha do voluntário ────────────────────────────────────

interface VolunteerDrawerProps {
  volunteer: VolunteerRow
  churchId: string
  onClose: () => void
}

function VolunteerDrawer({ volunteer, churchId, onClose }: VolunteerDrawerProps) {
  const updateCare = useUpdateCareFields()
  const status = (volunteer as any).care_status as CareStatus ?? 'servindo'
  const satisfaction = (volunteer as any).satisfaction as Satisfaction | null ?? null
  const careNotes = (volunteer as any).care_notes as string | null ?? null

  const [editStatus, setEditStatus] = useState<CareStatus>(status)
  const [editSatisfaction, setEditSatisfaction] = useState<Satisfaction | null>(satisfaction)
  const [editNotes, setEditNotes] = useState(careNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const person = volunteer.people
  const ministry = volunteer.ministries
  const joinedAt = volunteer.joined_at
    ? new Date(volunteer.joined_at).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    : null

  const availDays: number[] = (volunteer as any).availability?.days ?? []
  const availPeriod: string = (volunteer as any).availability?.period ?? ''

  const PERIOD_LABEL: Record<string, string> = {
    morning: 'Manhã', afternoon: 'Tarde', evening: 'Noite', any: 'Qualquer período',
  }

  async function handleSave() {
    setSaving(true)
    try {
      await updateCare.mutateAsync({
        id: volunteer.id,
        church_id: churchId,
        care_status: editStatus,
        satisfaction: editSatisfaction,
        care_notes: editNotes || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  const statusStyle = careStatusStyle(editStatus)

  return (
    <ModalPortal>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/40"
        onClick={onClose}
      />
      {/* Drawer */}
      <div
        className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md flex flex-col overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--color-bg-primary, #fff)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-default shrink-0">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
              style={{ background: 'var(--church-primary, var(--color-primary))' }}
            >
              {(person?.name ?? '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-text-primary leading-tight">{person?.name ?? '—'}</p>
              {ministry && <p className="text-xs text-text-secondary">{ministry.name}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-text-tertiary hover:bg-bg-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body (scrollable) */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Informações básicas */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            {joinedAt && (
              <div className="rounded-xl border border-border-default bg-bg-primary p-3">
                <p className="text-xs text-text-tertiary flex items-center gap-1 mb-0.5">
                  <Clock className="w-3 h-3" />Desde
                </p>
                <p className="font-medium text-text-primary capitalize">{joinedAt}</p>
              </div>
            )}
            {volunteer.role && (
              <div className="rounded-xl border border-border-default bg-bg-primary p-3">
                <p className="text-xs text-text-tertiary mb-0.5">Função</p>
                <p className="font-medium text-text-primary">{ROLE_LABELS[volunteer.role] ?? volunteer.role}</p>
              </div>
            )}
            {availDays.length > 0 && (
              <div className="col-span-2 rounded-xl border border-border-default bg-bg-primary p-3">
                <p className="text-xs text-text-tertiary mb-1.5">Disponibilidade</p>
                <div className="flex flex-wrap gap-1">
                  {availDays.map((d: number) => (
                    <span key={d} className="px-2 py-0.5 rounded-lg text-xs font-medium bg-bg-hover text-text-secondary">
                      {DAYS_PT[d]}
                    </span>
                  ))}
                  {availPeriod && availPeriod !== 'any' && (
                    <span className="px-2 py-0.5 rounded-lg text-xs font-medium bg-bg-hover text-text-secondary">
                      {PERIOD_LABEL[availPeriod] ?? availPeriod}
                    </span>
                  )}
                </div>
              </div>
            )}
            {person?.phone && (
              <div className="rounded-xl border border-border-default bg-bg-primary p-3">
                <p className="text-xs text-text-tertiary mb-0.5">Telefone</p>
                <a href={`tel:${person.phone}`} className="font-medium text-[#2563EB] text-sm hover:underline">
                  {person.phone}
                </a>
              </div>
            )}
          </div>

          {/* Status de serviço */}
          <div>
            <p className="text-sm font-semibold text-text-primary mb-2">Status</p>
            <div className="flex gap-2 flex-wrap">
              {(['servindo', 'afastado', 'precisa_cuidado'] as CareStatus[]).map(s => {
                const st = careStatusStyle(s)
                const active = editStatus === s
                return (
                  <button
                    key={s}
                    onClick={() => setEditStatus(s)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${st.bg} ${st.text} ${active ? 'ring-2 ring-offset-1 ring-current' : 'opacity-60 hover:opacity-90'}`}
                    style={{ borderColor: active ? st.dot : 'transparent' }}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: st.dot }} />
                    {CARE_STATUS_LABEL[s]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Satisfação */}
          <div>
            <p className="text-sm font-semibold text-text-primary mb-2">Satisfação no serviço</p>
            <div className="flex gap-2 flex-wrap">
              {([null, 'satisfeito', 'neutro', 'insatisfeito'] as (Satisfaction | null)[]).map(s => {
                const active = editSatisfaction === s
                const label = s === null ? 'Não definida' : SATISFACTION_LABEL[s]
                return (
                  <button
                    key={label}
                    onClick={() => setEditSatisfaction(s)}
                    className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                      s === null ? 'bg-bg-hover text-text-secondary border-transparent' : satisfactionStyle(s)
                    } ${active ? 'ring-2 ring-offset-1 ring-current' : 'opacity-60 hover:opacity-90'}`}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Anotações de cuidado */}
          <div>
            <p className="text-sm font-semibold text-text-primary mb-2">
              <MessageSquare className="w-4 h-4 inline mr-1" />
              Anotações pastorais
            </p>
            <textarea
              value={editNotes}
              onChange={e => setEditNotes(e.target.value)}
              placeholder="Observações sobre este voluntário..."
              rows={3}
              className="w-full rounded-xl border border-border-default px-3 py-2.5 text-sm bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          {/* Salvar ficha */}
          <Button
            onClick={() => { void handleSave() }}
            loading={saving}
            disabled={saving}
            className="w-full"
          >
            {saved ? '✓ Salvo!' : 'Salvar ficha'}
          </Button>

          {/* Divisor */}
          <div className="border-t border-border-default" />

          {/* PARTE 3: Histórico de cuidado */}
          <CareTimeline volunteerId={volunteer.id} churchId={churchId} />
        </div>
      </div>
    </ModalPortal>
  )
}

// ── AddVolunteerModal ─────────────────────────────────────────────────────────

interface AddVolunteerModalProps {
  onClose: () => void
  churchId: string
  ministries: Ministry[]
  defaultMinistryId?: string
}

function AddVolunteerModal({ onClose, churchId, ministries, defaultMinistryId }: AddVolunteerModalProps) {
  const createVolunteer = useCreateVolunteer()
  const [personSearch, setPersonSearch] = useState('')
  const [selectedPerson, setSelectedPerson] = useState<PersonResult | null>(null)
  const [ministryId, setMinistryId] = useState(defaultMinistryId ?? '')
  const [joinedAt, setJoinedAt] = useState(new Date().toISOString().split('T')[0])
  const [error, setError] = useState<string | null>(null)

  const { data: searchResults = [], isFetching } = useQuery({
    queryKey: ['people_search', churchId, personSearch],
    queryFn: async () => {
      if (personSearch.trim().length < 2) return []
      const { data } = await supabase
        .from('people')
        .select('id, name, email, phone')
        .eq('church_id', churchId)
        .ilike('name', `%${personSearch}%`)
        .is('deleted_at', null)
        .is('left_at', null)
        .limit(8)
      return (data ?? []) as PersonResult[]
    },
    enabled: personSearch.trim().length >= 2,
  })

  async function handleSubmit() {
    if (!selectedPerson || !ministryId) return
    setError(null)
    try {
      await createVolunteer.mutateAsync({
        church_id: churchId,
        person_id: selectedPerson.id,
        ministry_id: ministryId,
        skills: [],
        availability: { days: [], period: 'any' },
        joined_at: joinedAt ? new Date(joinedAt).toISOString() : undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar voluntário')
    }
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-bg-primary w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Adicionar Voluntário</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-bg-hover transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Seção 1 — Quem é ── */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary">Quem é</p>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Pessoa *</label>
            {selectedPerson ? (
              <div className="flex items-center justify-between bg-bg-hover rounded-xl px-3 py-2.5">
                <span className="text-sm font-medium text-text-primary">{selectedPerson.name}</span>
                <button onClick={() => { setSelectedPerson(null); setPersonSearch('') }} className="p-1 rounded text-text-tertiary hover:text-text-secondary">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Buscar por nome..."
                  value={personSearch}
                  onChange={e => setPersonSearch(e.target.value)}
                />
                {personSearch.length >= 2 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-bg-primary border border-border-default rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                    {isFetching ? (
                      <div className="flex justify-center py-3"><Spinner size="sm" /></div>
                    ) : searchResults.length === 0 ? (
                      <p className="text-sm text-text-tertiary text-center py-3">Nenhuma pessoa encontrada</p>
                    ) : (
                      searchResults.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setSelectedPerson(p); setPersonSearch('') }}
                          className="w-full text-left px-4 py-2.5 hover:bg-bg-hover transition-colors"
                        >
                          <p className="text-sm font-medium text-text-primary">{p.name}</p>
                          {p.email && <p className="text-xs text-text-tertiary">{p.email}</p>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Ministério onde serve *</label>
            <select
              value={ministryId}
              onChange={e => setMinistryId(e.target.value)}
              className="block w-full rounded-xl border border-border-default px-3 py-2.5 text-sm bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Selecionar ministério...</option>
              {ministries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>

        {/* ── Seção 2 — Serviço ── */}
        <div className="space-y-3 pt-1 border-t border-border-default">
          <p className="text-xs font-semibold uppercase tracking-widest text-text-tertiary pt-2">Serviço</p>
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1.5">Desde quando serve?</label>
            <input
              type="date"
              value={joinedAt}
              onChange={e => setJoinedAt(e.target.value)}
              className="block w-full rounded-xl border border-border-default px-3 py-2.5 text-sm bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={() => { void handleSubmit() }}
            loading={createVolunteer.isPending}
            disabled={!selectedPerson || !ministryId || createVolunteer.isPending}
            className="flex-1"
          >
            Adicionar
          </Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── EditVolunteerModal ────────────────────────────────────────────────────────

interface EditVolunteerModalProps {
  volunteer: VolunteerRow
  onClose: () => void
  churchId: string
  ministries: Ministry[]
}

interface EditForm {
  ministryId: string
  role: string
  availability: { days: number[]; period: string }
  min_days_between_services: number
  joined_at: string
  willingness: string
  care_status: string
  satisfaction: string
  care_notes: string
  care_responsible_id: string
}

function EditVolunteerModal({ volunteer, onClose, churchId, ministries }: EditVolunteerModalProps) {
  const updateVolunteer = useUpdateVolunteer()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const v = volunteer as any
  const rawDays = v.availability?.days ?? []
  const initialDays: number[] = rawDays.map((d: unknown) => Number(d))

  const [editForm, setEditForm] = useState<EditForm>({
    ministryId:              volunteer.ministries?.id ?? '',
    role:                    volunteer.role ?? 'volunteer',
    availability:            { days: initialDays, period: v.availability?.period ?? 'any' },
    min_days_between_services: v.min_days_between_services ?? 7,
    joined_at:               volunteer.joined_at ? new Date(volunteer.joined_at).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
    willingness:             v.willingness ?? '',
    care_status:             v.care_status ?? 'servindo',
    satisfaction:            v.satisfaction ?? '',
    care_notes:              v.care_notes ?? '',
    care_responsible_id:     v.care_responsible_id ?? '',
  })
  const [error, setError] = useState<string | null>(null)

  // Responsável pelo cuidado — busca e seleção de pessoa
  const [responsibleSearch, setResponsibleSearch] = useState('')
  const [responsiblePerson, setResponsiblePerson] = useState<PersonResult | null>(null)

  // Resolve nome do responsável atual ao abrir o modal
  const { data: resolvedResponsible } = useQuery({
    queryKey: ['person_by_id', editForm.care_responsible_id],
    queryFn: async () => {
      const { data } = await supabase.from('people').select('id, name, email, phone')
        .eq('id', editForm.care_responsible_id).single()
      return data as PersonResult | null
    },
    enabled: Boolean(editForm.care_responsible_id) && !responsiblePerson,
  })

  const { data: responsibleResults = [], isFetching: fetchingResponsible } = useQuery({
    queryKey: ['people_search_responsible', churchId, responsibleSearch],
    queryFn: async () => {
      if (responsibleSearch.trim().length < 2) return []
      const { data } = await supabase.from('people').select('id, name, email, phone')
        .eq('church_id', churchId).ilike('name', `%${responsibleSearch}%`).is('deleted_at', null).is('left_at', null).limit(8)
      return (data ?? []) as PersonResult[]
    },
    enabled: responsibleSearch.trim().length >= 2,
  })

  const displayResponsible = responsiblePerson ?? resolvedResponsible ?? null

  async function handleSave() {
    setError(null)
    try {
      await updateVolunteer.mutateAsync({
        id: volunteer.id,
        church_id: churchId,
        ministry_id: editForm.ministryId || undefined,
        role: editForm.role,
        availability: editForm.availability,
        min_days_between_services: editForm.min_days_between_services,
        joined_at: editForm.joined_at ? new Date(editForm.joined_at).toISOString() : undefined,
        willingness: editForm.willingness || null,
        care_status: editForm.care_status || null,
        satisfaction: editForm.satisfaction || null,
        care_notes: editForm.care_notes || null,
        care_responsible_id: editForm.care_responsible_id || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar')
    }
  }

  function toggleDay(idx: number) {
    setEditForm(f => {
      const updated = f.availability.days.includes(idx)
        ? f.availability.days.filter(d => d !== idx)
        : [...f.availability.days, idx]
      return { ...f, availability: { ...f.availability, days: updated } }
    })
  }

  const selectCls = 'block w-full rounded-xl border border-border-default px-3 py-2.5 text-sm bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-primary'
  const labelCls  = 'block text-sm font-medium text-text-primary mb-1.5'
  const sectionHeaderCls = 'text-xs font-semibold uppercase tracking-widest text-text-tertiary pt-2'

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-bg-primary w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-xl p-5 space-y-5 max-h-[92vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-text-primary">Editar Voluntário</h2>
            <p className="text-sm text-text-secondary mt-0.5">{volunteer.people?.name ?? 'Voluntário'}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-bg-hover transition-colors"><X className="w-4 h-4" /></button>
        </div>

        {/* ── Seção 1 — Quem é ── */}
        <div className="space-y-3 pt-1 border-t border-border-default">
          <p className={sectionHeaderCls}>Quem é</p>
          <div>
            <label className={labelCls}>Ministério onde serve</label>
            <select value={editForm.ministryId} onChange={e => setEditForm(f => ({ ...f, ministryId: e.target.value }))} className={selectCls}>
              <option value="">Sem ministério</option>
              {ministries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Função</label>
            <select value={editForm.role} onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))} className={selectCls}>
              <option value="volunteer">Voluntário</option>
              <option value="leader">Líder</option>
              <option value="co-leader">Co-líder</option>
            </select>
          </div>
        </div>

        {/* ── Seção 2 — Serviço ── */}
        <div className="space-y-3 pt-1 border-t border-border-default">
          <p className={sectionHeaderCls}>Serviço</p>

          <div>
            <label className={labelCls}>Quais dias você consegue servir?</label>
            <div className="flex gap-2 flex-wrap">
              {DAYS_PT.map((day, idx) => (
                <button key={idx} type="button" onClick={() => toggleDay(idx)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                    editForm.availability.days.includes(idx)
                      ? 'bg-primary text-white border-primary'
                      : 'bg-bg-primary text-text-secondary border-border-default hover:border-primary'
                  }`}>
                  {day}
                </button>
              ))}
            </div>
            <select value={editForm.availability.period}
              onChange={e => setEditForm(f => ({ ...f, availability: { ...f.availability, period: e.target.value } }))}
              className={`${selectCls} mt-2`}>
              <option value="any">Qualquer período</option>
              <option value="morning">Manhã</option>
              <option value="afternoon">Tarde</option>
              <option value="evening">Noite</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Você gosta do que faz? É onde queria estar?</label>
            <select value={editForm.willingness} onChange={e => setEditForm(f => ({ ...f, willingness: e.target.value }))} className={selectCls}>
              <option value="">Não informado</option>
              <option value="muito">Muito — é exatamente onde quero estar</option>
              <option value="mais_ou_menos">Mais ou menos — serve, mas poderia ser diferente</option>
              <option value="nao_muito">Não muito — preferia estar em outro lugar</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Desde quando serve?</label>
            <input type="date" value={editForm.joined_at}
              onChange={e => setEditForm(f => ({ ...f, joined_at: e.target.value }))}
              className={selectCls} />
          </div>
        </div>

        {/* ── Seção 3 — Cuidado ── */}
        <div className="space-y-3 pt-1 border-t border-border-default">
          <p className={sectionHeaderCls}>Cuidado</p>

          <div>
            <label className={labelCls}>Como tem se sentido servindo?</label>
            <select value={editForm.satisfaction} onChange={e => setEditForm(f => ({ ...f, satisfaction: e.target.value }))} className={selectCls}>
              <option value="">Não informado</option>
              <option value="satisfeito">Satisfeito</option>
              <option value="neutro">Neutro</option>
              <option value="insatisfeito">Insatisfeito</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Status atual</label>
            <select value={editForm.care_status} onChange={e => setEditForm(f => ({ ...f, care_status: e.target.value }))} className={selectCls}>
              <option value="servindo">Servindo</option>
              <option value="afastado">Afastado</option>
              <option value="precisa_cuidado">Precisa de cuidado</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Tem algo que a igreja pode fazer por você? Algo pra orar junto?</label>
            <textarea
              value={editForm.care_notes}
              onChange={e => setEditForm(f => ({ ...f, care_notes: e.target.value }))}
              placeholder="Anotações de cuidado, pedidos de oração..."
              rows={3}
              className="block w-full rounded-xl border border-border-default px-3 py-2.5 text-sm bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-primary resize-none"
            />
          </div>

          <div>
            <label className={labelCls}>Líder responsável pelo cuidado</label>
            {displayResponsible ? (
              <div className="flex items-center justify-between bg-bg-hover rounded-xl px-3 py-2.5">
                <span className="text-sm font-medium text-text-primary">{displayResponsible.name}</span>
                <button onClick={() => {
                  setResponsiblePerson(null)
                  setResponsibleSearch('')
                  setEditForm(f => ({ ...f, care_responsible_id: '' }))
                }} className="p-1 rounded text-text-tertiary hover:text-text-secondary">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Buscar líder por nome..."
                  value={responsibleSearch}
                  onChange={e => setResponsibleSearch(e.target.value)}
                />
                {responsibleSearch.length >= 2 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-bg-primary border border-border-default rounded-xl shadow-lg z-10 max-h-40 overflow-y-auto">
                    {fetchingResponsible ? (
                      <div className="flex justify-center py-3"><Spinner size="sm" /></div>
                    ) : responsibleResults.length === 0 ? (
                      <p className="text-sm text-text-tertiary text-center py-3">Nenhuma pessoa encontrada</p>
                    ) : (
                      responsibleResults.map(p => (
                        <button key={p.id}
                          onClick={() => {
                            setResponsiblePerson(p)
                            setResponsibleSearch('')
                            setEditForm(f => ({ ...f, care_responsible_id: p.id }))
                          }}
                          className="w-full text-left px-4 py-2.5 hover:bg-bg-hover transition-colors">
                          <p className="text-sm font-medium text-text-primary">{p.name}</p>
                          {p.email && <p className="text-xs text-text-tertiary">{p.email}</p>}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button onClick={() => { void handleSave() }} loading={updateVolunteer.isPending} disabled={updateVolunteer.isPending} className="flex-1">Salvar</Button>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

// ── VolunteerCard ─────────────────────────────────────────────────────────────

interface VolunteerPointsEntry { volunteer_id: string; total_points: number; total_awards: number }

function VolunteerCard({
  volunteer, onRemove, onEdit, onView, points,
}: {
  volunteer: VolunteerRow
  onRemove: (v: VolunteerRow) => void
  onEdit: (v: VolunteerRow) => void
  onView: (v: VolunteerRow) => void
  points?: VolunteerPointsEntry
}) {
  const person = volunteer.people
  const ministry = volunteer.ministries
  const pts = points?.total_points ?? 0
  const medal = pts >= 100 ? '🥇' : pts >= 50 ? '🥈' : pts >= 20 ? '🥉' : '⭐'
  const status = (volunteer as any).care_status as CareStatus ?? 'servindo'
  const st = careStatusStyle(status)

  return (
    <button
      className="bg-bg-primary rounded-2xl border border-border-default p-4 flex gap-3 text-left w-full hover:shadow-md transition-all active:scale-[0.99] cursor-pointer"
      onClick={() => onView(volunteer)}
    >
      <div
        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0"
        style={{ background: 'var(--church-primary, var(--color-primary))' }}
      >
        {(person?.name ?? '?').charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-text-primary text-sm truncate">{person?.name ?? '—'}</p>
          <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
            <button onClick={() => onEdit(volunteer)}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-primary-text hover:bg-bg-hover transition-colors" title="Editar escala">
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => onRemove(volunteer)}
              className="p-1.5 rounded-lg text-text-tertiary hover:text-red-500 hover:bg-red-50 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap gap-1.5 items-center">
          {/* Badge de status de cuidado */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${st.bg} ${st.text}`}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: st.dot }} />
            {CARE_STATUS_LABEL[status]}
          </span>

          {ministry && (
            <span className="inline-flex items-center text-xs font-medium bg-bg-hover text-text-secondary px-2 py-0.5 rounded-lg">
              {ministry.name}
            </span>
          )}
          {volunteer.role && (
            <span className="text-xs text-text-tertiary">{ROLE_LABELS[volunteer.role] ?? volunteer.role}</span>
          )}
          {pts > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-amber-50 text-amber-800 rounded-full px-2 py-0.5">
              {medal} {pts} pts
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-text-tertiary shrink-0 self-center" />
    </button>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function Volunteers() {
  const { churchId } = useAuth()
  const [search, setSearch] = useState('')
  const [ministryFilter, setMinistryFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<CareStatus | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerRow | null>(null)
  const [removingVolunteer, setRemovingVolunteer] = useState<VolunteerRow | null>(null)
  const [drawerVolunteer, setDrawerVolunteer] = useState<VolunteerRow | null>(null)
  const deactivate = useDeactivateVolunteer()

  const { data: ministries = [] } = useQuery({
    queryKey: ['ministries_list', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ministries')
        .select('id, name')
        .eq('church_id', churchId!)
        .eq('is_active', true)
        .order('name')
      return data ?? []
    },
    enabled: Boolean(churchId),
  })

  const { data: volunteers = [], isLoading } = useVoluntarios(churchId ?? '', ministryFilter || undefined)

  const { data: pointsData } = useQuery({
    queryKey: ['volunteer-points', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('volunteer_total_points')
        .select('volunteer_id, total_points, total_awards')
        .eq('church_id', churchId!)
      return Object.fromEntries((data ?? []).map(p => [p.volunteer_id, p as VolunteerPointsEntry]))
    },
    enabled: Boolean(churchId),
  })

  const filteredVolunteers = useMemo(() => {
    let list = volunteers as VolunteerRow[]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(v =>
        (v.people?.name ?? '').toLowerCase().includes(q) ||
        (v.people?.email ?? '').toLowerCase().includes(q)
      )
    }
    if (statusFilter) {
      list = list.filter(v => ((v as any).care_status ?? 'servindo') === statusFilter)
    }
    return list
  }, [volunteers, search, statusFilter])

  async function confirmRemove() {
    if (!removingVolunteer || !churchId) return
    await deactivate.mutateAsync({ id: removingVolunteer.id, churchId })
    setRemovingVolunteer(null)
  }

  return (
    <div className="space-y-5 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-bg-hover flex items-center justify-center">
            <HandHeart className="w-5 h-5 text-primary-text" />
          </div>
          <div>
            <h1 className="font-display text-xl md:text-2xl font-bold text-text-primary">Voluntários</h1>
            <p className="text-sm text-text-secondary">Módulo de Cuidado</p>
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Adicionar</span>
        </Button>
      </div>

      {/* PARTE 4: Painel de status */}
      {churchId && (
        <CarePanel
          churchId={churchId}
          statusFilter={statusFilter}
          onFilter={setStatusFilter}
        />
      )}

      {/* Filtro ativo de status */}
      {statusFilter && (
        <button
          onClick={() => setStatusFilter(null)}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-xl bg-bg-hover text-text-secondary hover:bg-border-default transition-colors"
        >
          <X className="w-3.5 h-3.5" />
          Limpar filtro: {CARE_STATUS_LABEL[statusFilter]}
        </button>
      )}

      {/* Busca */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar voluntário..."
          className="block w-full pl-9 pr-4 py-2.5 rounded-xl border border-border-default text-sm bg-bg-primary text-text-primary focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Filtro por ministério */}
      {ministries.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setMinistryFilter('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              ministryFilter === '' ? 'bg-primary text-white' : 'bg-bg-primary border border-border-default text-text-secondary hover:bg-bg-hover'
            }`}
          >
            Todos
          </button>
          {ministries.map(m => (
            <button
              key={m.id}
              onClick={() => setMinistryFilter(ministryFilter === m.id ? '' : m.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                ministryFilter === m.id ? 'bg-primary text-white' : 'bg-bg-primary border border-border-default text-text-secondary hover:bg-bg-hover'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : filteredVolunteers.length === 0 ? (
        <div className="text-center py-12 text-text-tertiary">
          <HandHeart className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-4">
            {search || ministryFilter || statusFilter ? 'Nenhum voluntário encontrado.' : 'Nenhum voluntário cadastrado ainda.'}
          </p>
          {!search && !ministryFilter && !statusFilter && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar primeiro voluntário
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2">
          {filteredVolunteers.map(v => (
            <VolunteerCard
              key={v.id}
              volunteer={v}
              onRemove={setRemovingVolunteer}
              onEdit={setEditingVolunteer}
              onView={setDrawerVolunteer}
              points={pointsData?.[v.id]}
            />
          ))}
        </div>
      )}

      {/* Drawer de ficha (Partes 2 + 3) */}
      {drawerVolunteer && churchId && (
        <VolunteerDrawer
          volunteer={drawerVolunteer}
          churchId={churchId}
          onClose={() => setDrawerVolunteer(null)}
        />
      )}

      {/* Edit modal */}
      {editingVolunteer && churchId && (
        <EditVolunteerModal
          volunteer={editingVolunteer}
          onClose={() => setEditingVolunteer(null)}
          churchId={churchId}
          ministries={ministries}
        />
      )}

      {/* Add modal */}
      {addOpen && churchId && (
        <AddVolunteerModal
          onClose={() => setAddOpen(false)}
          churchId={churchId}
          ministries={ministries}
          defaultMinistryId={ministryFilter || undefined}
        />
      )}

      {/* Confirm remove */}
      {removingVolunteer && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRemovingVolunteer(null)} />
          <div className="relative bg-bg-primary rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-text-primary">Remover voluntário</h3>
                <p className="text-sm text-text-secondary">Vinculação com ministério</p>
              </div>
            </div>
            <p className="text-sm text-text-secondary">
              Remover <strong>{removingVolunteer.people?.name}</strong> do ministério{' '}
              <strong>{removingVolunteer.ministries?.name}</strong>?
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRemovingVolunteer(null)} className="flex-1">Cancelar</Button>
              <Button
                onClick={() => { void confirmRemove() }}
                loading={deactivate.isPending}
                className="flex-1 !bg-red-600 hover:!bg-red-700"
              >
                Remover
              </Button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}
