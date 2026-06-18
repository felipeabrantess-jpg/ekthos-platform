/**
 * GabinetePedidosPWA — /gabinete/pedidos  (CRM interno)
 * Lista pedidos de agendamento pastoral originados pelo PWA público (/igv/gabinete).
 * LGPD máximo: dado mais sensível. Só autenticados com church_id correto.
 */

import { useState }                               from 'react'
import { Link }                                   from 'react-router-dom'
import { useQuery, useMutation, useQueryClient }  from '@tanstack/react-query'
import { Building2, CheckCircle2, UserCheck, XCircle, Users, Clock } from 'lucide-react'
import { useAuth }                                from '@/hooks/useAuth'
import { supabase }                               from '@/lib/supabase'
import Spinner                                    from '@/components/ui/Spinner'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type AppointmentStatus = 'solicitado' | 'confirmado' | 'realizado' | 'cancelado'

interface PWAAppointment {
  id:                      string
  person_id:               string
  appointment_type:        string
  theme:                   string | null
  preferred_datetime_text: string | null
  cabinet_pastor_id:       string | null
  slot_id:                 string | null
  status:                  AppointmentStatus
  created_at:              string
  people:   { id: string; name: string | null; phone: string | null } | null
  cabinet_pastor: { id: string; role: string; people: { name: string | null } | null } | null
  cabinet_slot: { slot_datetime: string; duration_minutes: number } | null
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  solicitado: 'Solicitado',
  confirmado: 'Confirmado',
  realizado:  'Realizado',
  cancelado:  'Cancelado',
}

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  solicitado: 'bg-amber-100 text-amber-800',
  confirmado: 'bg-blue-100 text-blue-800',
  realizado:  'bg-emerald-100 text-emerald-800',
  cancelado:  'bg-gray-100 text-gray-500',
}

const NEXT_STATUS: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
  solicitado: 'confirmado',
  confirmado: 'realizado',
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

// ── Card ──────────────────────────────────────────────────────────────────────

function AppointmentCard({
  item,
  onAdvance,
  onCancel,
  advancing,
  cancelling,
}: {
  item:       PWAAppointment
  onAdvance:  (id: string, next: AppointmentStatus) => void
  onCancel:   (id: string) => void
  advancing:  boolean
  cancelling: boolean
}) {
  const next       = NEXT_STATUS[item.status]
  const personName = item.people?.name ?? '—'
  const phone      = item.people?.phone ?? null
  const pastorName = item.cabinet_pastor?.people?.name ?? item.cabinet_pastor?.role ?? null

  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] p-4 shadow-sm flex flex-col gap-3">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-[0.9rem] truncate">{personName}</p>
          {phone && <p className="text-[0.74rem] text-gray-400 mt-0.5">{phone}</p>}
        </div>
        <span className={`shrink-0 text-[0.7rem] font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[item.status]}`}>
          {STATUS_LABEL[item.status]}
        </span>
      </div>

      {/* Detalhes */}
      <div className="flex flex-col gap-1.5 text-[0.8rem] text-gray-600">
        {item.theme && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Tema:</span>
            <span className="font-medium text-gray-800">{item.theme}</span>
            <span className="text-gray-300 mx-1">·</span>
            <span className="text-gray-500">{item.appointment_type}</span>
          </div>
        )}
        {pastorName && (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Pastor:</span>
            <span className="font-medium text-gray-800">{pastorName}</span>
          </div>
        )}
        {item.cabinet_slot?.slot_datetime ? (
          <div className="flex items-center gap-1.5">
            <Clock size={12} strokeWidth={2} className="text-amber-600 shrink-0" />
            <span className="font-semibold text-amber-700">
              {new Intl.DateTimeFormat('pt-BR', {
                weekday: 'short', day: 'numeric', month: 'short',
                hour: '2-digit', minute: '2-digit',
              }).format(new Date(item.cabinet_slot.slot_datetime))}
            </span>
            <span className="text-gray-400">· {item.cabinet_slot.duration_minutes}min</span>
          </div>
        ) : item.preferred_datetime_text ? (
          <div className="flex items-center gap-1.5">
            <span className="text-gray-400">Preferência:</span>
            <span className="italic text-gray-600">{item.preferred_datetime_text}</span>
          </div>
        ) : null}
      </div>

      {/* Rodapé: data + ações */}
      <div className="flex items-center justify-between pt-1.5 border-t border-black/[0.04]">
        <p className="text-[0.72rem] text-gray-400">{formatDate(item.created_at)}</p>
        <div className="flex items-center gap-2">
          {next && (
            <button
              onClick={() => onAdvance(item.id, next)}
              disabled={advancing}
              className="flex items-center gap-1 text-[0.76rem] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {advancing ? (
                <span className="w-3 h-3 border-2 border-amber-400/40 border-t-amber-600 rounded-full animate-spin" />
              ) : next === 'confirmado' ? (
                <UserCheck size={12} strokeWidth={2} />
              ) : (
                <CheckCircle2 size={12} strokeWidth={2} />
              )}
              {next === 'confirmado' ? 'Confirmar' : 'Realizado'}
            </button>
          )}
          {item.status !== 'cancelado' && item.status !== 'realizado' && (
            <button
              onClick={() => onCancel(item.id)}
              disabled={cancelling}
              className="flex items-center gap-1 text-[0.76rem] font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-2.5 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {cancelling ? (
                <span className="w-3 h-3 border-2 border-red-300/40 border-t-red-500 rounded-full animate-spin" />
              ) : (
                <XCircle size={12} strokeWidth={2} />
              )}
              Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function GabinetePedidosPWA() {
  const { churchId }         = useAuth()
  const qc                   = useQueryClient()
  const [filter, setFilter]  = useState<AppointmentStatus | 'todos'>('todos')
  const [advancingId, setAdvancingId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['gabinete_pwa_pedidos', churchId, filter],
    enabled:  !!churchId,
    queryFn: async () => {
      let q = (supabase as any)
        .from('pastoral_appointments')
        .select('id, person_id, appointment_type, theme, preferred_datetime_text, cabinet_pastor_id, slot_id, status, created_at, people(id, name, phone), cabinet_pastor:pastoral_cabinet(id, role, people(name)), cabinet_slot:cabinet_slots(slot_datetime, duration_minutes)')
        .eq('source', 'igv_pwa')
        .order('created_at', { ascending: false })

      if (filter !== 'todos') q = q.eq('status', filter)

      const { data, error: qErr } = await q
      if (qErr) throw qErr
      return (data ?? []) as PWAAppointment[]
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: AppointmentStatus }) => {
      const { error: upErr } = await (supabase as any)
        .from('pastoral_appointments')
        .update({ status })
        .eq('id', id)
      if (upErr) throw upErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gabinete_pwa_pedidos', churchId] })
    },
    onSettled: () => { setAdvancingId(null); setCancellingId(null) },
  })

  function handleAdvance(id: string, next: AppointmentStatus) {
    setAdvancingId(id)
    updateMutation.mutate({ id, status: next })
  }

  function handleCancel(id: string) {
    setCancellingId(id)
    updateMutation.mutate({ id, status: 'cancelado' })
  }

  const counts = {
    todos:      items.length,
    solicitado: items.filter(i => i.status === 'solicitado').length,
    confirmado: items.filter(i => i.status === 'confirmado').length,
    realizado:  items.filter(i => i.status === 'realizado').length,
    cancelado:  items.filter(i => i.status === 'cancelado').length,
  }

  const FILTERS: { key: AppointmentStatus | 'todos'; label: string }[] = [
    { key: 'todos',      label: 'Todos'      },
    { key: 'solicitado', label: 'Solicitados' },
    { key: 'confirmado', label: 'Confirmados' },
    { key: 'realizado',  label: 'Realizados'  },
    { key: 'cancelado',  label: 'Cancelados'  },
  ]

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <Building2 size={18} strokeWidth={1.75} className="text-amber-700" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-[1.05rem] font-bold text-gray-900">Pedidos — Gabinete</h1>
          <p className="text-[0.78rem] text-gray-400 mt-0.5">
            {counts.todos} pedido{counts.todos !== 1 ? 's' : ''} recebido{counts.todos !== 1 ? 's' : ''} pelo app
          </p>
        </div>
        <Link
          to="/gabinete/pastores"
          className="shrink-0 flex items-center gap-1.5 text-[0.78rem] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-2 rounded-xl transition-colors"
        >
          <Users size={14} strokeWidth={2} />
          Pastores
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 no-scrollbar">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[0.78rem] font-semibold transition-colors ${
              filter === f.key
                ? 'bg-amber-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
            {f.key !== 'todos' && counts[f.key] > 0 && (
              <span className="ml-1.5 text-[0.7rem] opacity-70">({counts[f.key]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="md" />
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-500 text-[0.85rem]">
          Erro ao carregar pedidos. Recarregue a página.
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
            <Building2 size={22} strokeWidth={1.5} className="text-amber-400" />
          </div>
          <p className="text-gray-400 text-[0.85rem]">
            {filter === 'todos'
              ? 'Nenhum pedido de agendamento recebido pelo app ainda.'
              : `Nenhum pedido "${STATUS_LABEL[filter as AppointmentStatus]}".`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(item => (
            <AppointmentCard
              key={item.id}
              item={item}
              onAdvance={handleAdvance}
              onCancel={handleCancel}
              advancing={advancingId === item.id}
              cancelling={cancellingId === item.id}
            />
          ))}
        </div>
      )}

    </div>
  )
}
