import { Fragment, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  useEscalas,
  useCreateSchedule,
  usePublishSchedule,
  useCancelSchedule,
  useAddAssignment,
} from '@/features/escalas/hooks/useEscalas'
import { useMinisterios } from '@/features/ministerios/hooks/useMinisterios'
import { useVoluntarios } from '@/features/voluntarios/hooks/useVoluntarios'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import type { ScheduleWithAssignments, ScheduleStatus } from '@/lib/types/joins'

type BadgeVariant = 'gray' | 'blue' | 'green' | 'red'

function statusBadgeVariant(status: ScheduleStatus): BadgeVariant {
  const map: Record<ScheduleStatus, BadgeVariant> = {
    draft: 'gray',
    published: 'blue',
    confirmed: 'green',
    cancelled: 'red',
    completed: 'green',
  }
  return map[status]
}

function statusLabel(status: ScheduleStatus): string {
  const map: Record<ScheduleStatus, string> = {
    draft: 'Rascunho',
    published: 'Publicado',
    confirmed: 'Confirmado',
    cancelled: 'Cancelado',
    completed: 'Concluído',
  }
  return map[status]
}

interface CreateScheduleModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  ministries: Array<{ id: string; name: string }>
}

function CreateScheduleModal({ open, onClose, churchId, ministries }: CreateScheduleModalProps) {
  const createSchedule = useCreateSchedule()
  const [form, setForm] = useState({
    event_name: '',
    ministry_id: '',
    event_date: '',
    event_time: '',
    notes: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.event_name.trim() || !form.ministry_id || !form.event_date) return
    setSubmitting(true)
    setError(null)
    try {
      await createSchedule.mutateAsync({
        church_id: churchId,
        ministry_id: form.ministry_id,
        event_name: form.event_name.trim(),
        event_date: form.event_date,
        event_time: form.event_time || undefined,
        notes: form.notes.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar escala')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nova Escala">
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Evento *</label>
          <Input
            value={form.event_name}
            onChange={(e) => setForm((p) => ({ ...p, event_name: e.target.value }))}
            placeholder="Ex: Culto Dominical"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ministério *</label>
          <select
            value={form.ministry_id}
            onChange={(e) => setForm((p) => ({ ...p, ministry_id: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Selecionar...</option>
            {ministries.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
            <Input
              type="date"
              value={form.event_date}
              onChange={(e) => setForm((p) => ({ ...p, event_date: e.target.value }))}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Horário</label>
            <Input
              type="time"
              value={form.event_time}
              onChange={(e) => setForm((p) => ({ ...p, event_time: e.target.value }))}
            />
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
          <Input
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Informações adicionais..."
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.event_name.trim() || !form.ministry_id || !form.event_date}>
            {submitting ? 'Criando...' : 'Criar Escala'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface AddAssignmentModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  scheduleId: string
  ministryId: string
}

function AddAssignmentModal({ open, onClose, churchId, scheduleId, ministryId }: AddAssignmentModalProps) {
  const addAssignment = useAddAssignment()
  const { data: volunteers } = useVoluntarios(churchId, ministryId)
  const [volunteerId, setVolunteerId] = useState('')
  const [role, setRole] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!volunteerId) return
    setSubmitting(true)
    setError(null)
    try {
      await addAssignment.mutateAsync({
        church_id: churchId,
        schedule_id: scheduleId,
        volunteer_id: volunteerId,
        role: role.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar voluntário')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar à Escala" size="sm">
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Voluntário *</label>
          <select
            value={volunteerId}
            onChange={(e) => setVolunteerId(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          >
            <option value="">Selecionar voluntário...</option>
            {(volunteers ?? []).map((v) => (
              <option key={v.id} value={v.id}>{v.people?.name ?? v.id}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Função na escala</label>
          <Input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Ex: Tecladista, Vocal..."
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !volunteerId}>
            {submitting ? 'Adicionando...' : 'Adicionar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface ScheduleDetailProps {
  schedule: ScheduleWithAssignments
  churchId: string
}

// -- Modal Solicitar Troca (D9) -----------------------------------------------

interface RequestSwapModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  assignmentId: string
  requesterVolunteerId: string
  volunteerName: string
}

function RequestSwapModal({
  open,
  onClose,
  churchId,
  assignmentId,
  requesterVolunteerId,
  volunteerName,
}: RequestSwapModalProps) {
  const requestSwap = useRequestSwap()
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      await requestSwap.mutateAsync({
        churchId,
        assignmentId,
        requesterVolunteerId,
        note: note.trim() || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao solicitar troca')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Solicitar Troca de Escala" size="sm">
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <p className="text-sm text-gray-600">
          Solicitando troca para{' '}
          <span className="font-medium text-gray-900">{volunteerName}</span>.
          O coordenador sera notificado.
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Motivo (opcional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex: viagem, compromisso de saude..."
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary resize-none"
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Enviando...' : 'Solicitar Troca'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// -- Painel de Trocas Pendentes (D9) ------------------------------------------

interface SwapPanelProps {
  churchId: string
}

function SwapPanel({ churchId }: SwapPanelProps) {
  const { data: swaps, isLoading } = useSwapRequests(churchId)
  const resolveSwap = useResolveSwap()

  if (isLoading || !swaps || swaps.length === 0) return null

  async function handleResolve(id: string, status: 'accepted' | 'declined') {
    await resolveSwap.mutateAsync({ id, churchId, status })
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-400 text-white text-xs font-bold">
          {swaps.length}
        </span>
        <h2 className="text-sm font-semibold text-amber-800">
          {swaps.length === 1 ? 'Troca pendente' : 'Trocas pendentes'}
        </h2>
      </div>
      <div className="space-y-2">
        {swaps.map((swap) => (
          <div
            key={swap.id}
            className="bg-white rounded-lg border border-amber-100 px-3 py-2 flex items-center justify-between gap-3"
          >
            <div className="text-xs text-gray-700 min-w-0">
              <span className="font-mono text-gray-400">{swap.assignment_id.slice(0, 8)}...</span>
              {swap.requester_note && (
                <span className="block text-gray-500 truncate mt-0.5">{swap.requester_note}</span>
              )}
            </div>
            <div className="flex gap-1.5 shrink-0">
              <button
                onClick={() => { void handleResolve(swap.id, 'accepted') }}
                disabled={resolveSwap.isPending}
                className="text-xs text-green-700 border border-green-200 rounded px-2 py-0.5 hover:bg-green-50 transition-colors disabled:opacity-50"
              >
                Aceitar
              </button>
              <button
                onClick={() => { void handleResolve(swap.id, 'declined') }}
                disabled={resolveSwap.isPending}
                className="text-xs text-red-600 border border-red-200 rounded px-2 py-0.5 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Recusar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// -- ScheduleDetail com botao Trocar ------------------------------------------

interface ScheduleDetailProps {
  schedule: ScheduleWithAssignments
  churchId: string
}

function ScheduleDetail({ schedule, churchId }: ScheduleDetailProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [swapModal, setSwapModal] = useState<{
    open: boolean
    assignmentId: string
    volunteerId: string
    volunteerName: string
  }>({ open: false, assignmentId: '', volunteerId: '', volunteerName: '' })

  const assignments = schedule.service_schedule_assignments ?? []

  function openSwap(assignmentId: string, volunteerId: string, volunteerName: string) {
    setSwapModal({ open: true, assignmentId, volunteerId, volunteerName })
  }

  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          {`Voluntarios escalados (${assignments.length})`}
        </p>
        <button
          onClick={() => setAddOpen(true)}
          className="text-xs text-primary hover:text-primary font-medium"
        >
          + Adicionar
        </button>
      </div>
      {assignments.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhum voluntario escalado ainda.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assignments.map((a) => {
            const name = a.volunteers?.people?.name ?? 'Voluntario'
            return (
              <div key={a.id} className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 flex items-center gap-2">
                <span>
                  <span className="font-medium text-gray-800">{name}</span>
                  {a.role && <span className="text-gray-500 ml-1">{'·'} {a.role}</span>}
                </span>
                {(schedule.status === 'published' || schedule.status === 'confirmed') && (
                  <button
                    onClick={() => openSwap(a.id, a.volunteer_id, name)}
                    className="text-[10px] text-[#5A5A5A] hover:text-[#e13500] border border-gray-200 rounded px-1.5 py-0.5 transition-colors"
                    title="Solicitar troca"
                  >
                    Trocar
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {addOpen && (
        <AddAssignmentModal
          open={addOpen}
          onClose={() => setAddOpen(false)}
          churchId={churchId}
          scheduleId={schedule.id}
          ministryId={schedule.ministry_id}
        />
      )}
      {swapModal.open && (
        <RequestSwapModal
          open={swapModal.open}
          onClose={() => setSwapModal((m) => ({ ...m, open: false }))}
          churchId={churchId}
          assignmentId={swapModal.assignmentId}
          requesterVolunteerId={swapModal.volunteerId}
          volunteerName={swapModal.volunteerName}
        />
      )}
    </div>
  )
}
  const publishSchedule = usePublishSchedule()
  const cancelSchedule = useCancelSchedule()

  const { data: ministries } = useMinisterios(churchId ?? '')
  const { data: schedules, isLoading, isError, refetch } = useEscalas(churchId ?? '')

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  async function handlePublish(id: string) {
    if (!confirm('Publicar esta escala? Os voluntários serão notificados.')) return
    await publishSchedule.mutateAsync({ id, churchId: churchId! })
  }

  async function handleCancel(id: string) {
    if (!confirm('Cancelar esta escala?')) return
    await cancelSchedule.mutateAsync({ id, churchId: churchId! })
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Escalas</h1>
          <p className="text-sm text-gray-500 mt-1">
            {schedules ? `${schedules.length} escala${schedules.length !== 1 ? 's' : ''}` : 'Carregando...'}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ Nova Escala</Button>
      </div>


      {/* Trocas Pendentes (D9) */}
      <SwapPanel churchId={churchId} />
      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <ErrorState message="Não foi possível carregar as escalas." onRetry={() => void refetch()} />
        ) : (schedules ?? []).length === 0 ? (
          <EmptyState
            title="Nenhuma escala cadastrada"
            description="Crie a primeira escala clicando em 'Nova Escala'."
            action={<Button onClick={() => setCreateOpen(true)}>+ Nova Escala</Button>}
          />
        ) : (
          <div>
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Evento</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ministério</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Voluntários</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(schedules ?? []).map((s) => (
                  <Fragment key={s.id}>
                    <tr className="hover:bg-gray-50 transition-colors border-t border-gray-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleExpand(s.id)}
                          className="text-sm font-medium text-gray-900 hover:text-primary text-left"
                        >
                          {s.event_name}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{s.ministries?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(s.event_date).toLocaleDateString('pt-BR')}
                        {s.event_time && <span className="text-gray-400"> {s.event_time.slice(0, 5)}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={statusLabel(s.status as ScheduleStatus)} variant={statusBadgeVariant(s.status as ScheduleStatus)} />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {s.service_schedule_assignments?.length ?? 0}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleExpand(s.id)}
                            className="text-xs text-primary hover:text-primary font-medium"
                          >
                            {expandedId === s.id ? 'Fechar' : 'Ver'}
                          </button>
                          {s.status === 'draft' && (
                            <button
                              onClick={() => { void handlePublish(s.id) }}
                              className="text-xs text-green-600 hover:text-green-700 font-medium"
                            >
                              Publicar
                            </button>
                          )}
                          {(s.status === 'draft' || s.status === 'published') && (
                            <button
                              onClick={() => { void handleCancel(s.id) }}
                              className="text-xs text-red-500 hover:text-red-600 font-medium"
                            >
                              Cancelar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {expandedId === s.id && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <ScheduleDetail schedule={s} churchId={churchId} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {createOpen && (
        <CreateScheduleModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          churchId={churchId}
          ministries={(ministries ?? []).map((m) => ({ id: m.id, name: m.name }))}
        />
      )}
    </div>
  )
}
