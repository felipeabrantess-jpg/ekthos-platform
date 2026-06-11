import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { useAppointments, useUpdateAppointment, type Appointment } from '@/features/gabinete/hooks/useAppointments'
import { AppointmentModal } from '@/features/gabinete/components/AppointmentModal'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d)
}

type StatusFilter = 'todos' | Appointment['status']

const STATUS_LABELS: Record<Appointment['status'], string> = {
  solicitado:  'Solicitado',
  confirmado:  'Confirmado',
  realizado:   'Realizado',
  cancelado:   'Cancelado',
}

const STATUS_BADGE: Record<Appointment['status'], 'warning' | 'info' | 'success' | 'danger'> = {
  solicitado: 'warning',
  confirmado: 'info',
  realizado:  'success',
  cancelado:  'danger',
}

// ── GabineteTabBar ────────────────────────────────────────────────────────────

function GabineteTabBar() {
  const base = 'px-4 py-2 text-sm font-medium rounded-lg transition-colors'
  const active = 'bg-white shadow-sm text-ekthos-black'
  const inactive = 'text-ekthos-black/50 hover:text-ekthos-black'
  return (
    <div className="flex gap-1 p-1 bg-cream-dark/30 rounded-xl w-fit">
      <NavLink
        to="/gabinete"
        end
        className={({ isActive }) => `${base} ${isActive ? active : inactive}`}
      >
        Equipe
      </NavLink>
      <NavLink
        to="/gabinete/agendamentos"
        className={({ isActive }) => `${base} ${isActive ? active : inactive}`}
      >
        Agendamentos
      </NavLink>
    </div>
  )
}

// ── AppointmentCard ───────────────────────────────────────────────────────────

function AppointmentCard({
  appt,
  onEdit,
  onMarkRealized,
  onCancel,
}: {
  appt:           Appointment
  onEdit:         (a: Appointment) => void
  onMarkRealized: (a: Appointment) => void
  onCancel:       (a: Appointment) => void
}) {
  const personName = appt.people?.name ?? '—'
  const pastorName = appt.pastor?.name ?? null

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{personName}</p>
          <p className="text-xs text-gray-500 mt-0.5">{appt.appointment_type}</p>
        </div>
        <Badge label={STATUS_LABELS[appt.status]} variant={STATUS_BADGE[appt.status]} />
      </div>

      <div className="flex flex-col gap-1 text-xs text-gray-500">
        <span>📅 {formatDateTime(appt.scheduled_at)}</span>
        {pastorName && <span>👤 {pastorName}</span>}
        {appt.notes && (
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed line-clamp-2 mt-1">
            {appt.notes}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 pt-1 border-t border-gray-50">
        <button
          onClick={() => onEdit(appt)}
          className="text-xs text-brand-600 hover:text-brand-700 font-medium"
        >
          Editar
        </button>
        {appt.status !== 'realizado' && appt.status !== 'cancelado' && (
          <>
            <span className="text-gray-200">|</span>
            <button
              onClick={() => onMarkRealized(appt)}
              className="text-xs text-green-600 hover:text-green-700 font-medium"
            >
              Marcar como realizado
            </button>
            <span className="text-gray-200">|</span>
            <button
              onClick={() => onCancel(appt)}
              className="text-xs text-red-500 hover:text-red-600 font-medium"
            >
              Cancelar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── GabineteAgendamentos ──────────────────────────────────────────────────────

export default function GabineteAgendamentos() {
  const { churchId } = useAuth()
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('todos')
  const [modalOpen, setModalOpen]       = useState(false)
  const [editing, setEditing]           = useState<Appointment | null>(null)
  const update = useUpdateAppointment()

  const { data: appointments = [], isLoading, isError, refetch } = useAppointments(churchId ?? '')

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  const filtered = statusFilter === 'todos'
    ? appointments
    : appointments.filter(a => a.status === statusFilter)

  async function handleMarkRealized(appt: Appointment) {
    await update.mutateAsync({ id: appt.id, church_id: churchId!, status: 'realizado' })
  }

  async function handleCancel(appt: Appointment) {
    await update.mutateAsync({ id: appt.id, church_id: churchId!, status: 'cancelado' })
  }

  function handleEdit(appt: Appointment) {
    setEditing(appt)
    setModalOpen(true)
  }

  function handleNew() {
    setEditing(null)
    setModalOpen(true)
  }

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: 'todos',      label: 'Todos' },
    { key: 'solicitado', label: 'Solicitados' },
    { key: 'confirmado', label: 'Confirmados' },
    { key: 'realizado',  label: 'Realizados' },
    { key: 'cancelado',  label: 'Cancelados' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Gabinete Pastoral</h1>
            <p className="text-sm text-gray-500 mt-1">
              {isLoading ? 'Carregando...' : `${appointments.length} agendamento${appointments.length !== 1 ? 's' : ''}`}
            </p>
          </div>
          <GabineteTabBar />
        </div>
        <Button onClick={handleNew}>+ Novo Agendamento</Button>
      </div>

      {/* Filtros de status */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setStatusFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              statusFilter === f.key
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <ErrorState
          message="Não foi possível carregar os agendamentos."
          onRetry={() => void refetch()}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={statusFilter === 'todos' ? 'Nenhum agendamento' : `Nenhum agendamento ${FILTERS.find(f => f.key === statusFilter)?.label.toLowerCase() ?? ''}`}
          description={statusFilter === 'todos' ? 'Crie o primeiro agendamento pastoral.' : 'Tente outro filtro.'}
          action={statusFilter === 'todos' ? <Button onClick={handleNew}>+ Novo Agendamento</Button> : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(appt => (
            <AppointmentCard
              key={appt.id}
              appt={appt}
              onEdit={handleEdit}
              onMarkRealized={(a) => { void handleMarkRealized(a) }}
              onCancel={(a) => { void handleCancel(a) }}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {modalOpen && (
        <AppointmentModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          churchId={churchId}
          editing={editing}
        />
      )}
    </div>
  )
}
