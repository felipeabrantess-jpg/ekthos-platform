import { Fragment, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  useEscalas,
  useCreateSchedule,
  usePublishSchedule,
  useCancelSchedule,
  useAddAssignment,
} from '@/features/escalas/hooks/useEscalas'
import {
  useSwapRequests,
  useRequestSwap,
  useResolveSwap,
} from '@/features/escalas/hooks/useSwapRequests'
import { useMinisterios } from '@/features/ministerios/hooks/useMinisterios'
import { useVoluntarios } from '@/features/voluntarios/hooks/useVoluntarios'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import type { ScheduleWithAssignments, ScheduleStatus } from '@/lib/types/joins'
import ModalPortal from '@/components/ui/ModalPortal'

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
  const [overloadModal, setOverloadModal] = useState<{
    open: boolean
    message: string
    onConfirm: () => void
  }>({ open: false, message: '', onConfirm: () => {} })

  async function doAdd() {
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!volunteerId) return

    // Verificação de sobrecarga: consulta RPC antes de adicionar
    const { data: monthCount } = await supabase.rpc('get_volunteer_month_count', {
      p_volunteer_id: volunteerId,
    })

    const volunteer = (volunteers ?? []).find((v) => v.id === volunteerId)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const maxServices: number = (volunteer as any)?.max_services_per_month ?? 4
    const currentCount: number = (monthCount as number | null) ?? 0

    if (currentCount >= maxServices) {
      const volunteerName = volunteer?.people?.name ?? 'Este voluntário'
      setOverloadModal({
        open: true,
        message: `${volunteerName} já tem ${currentCount} escala${currentCount !== 1 ? 's' : ''} este mês (máximo recomendado: ${maxServices}). Deseja adicionar mesmo assim?`,
        onConfirm: () => {
          setOverloadModal((m) => ({ ...m, open: false }))
          void doAdd()
        },
      })
      return
    }

    await doAdd()
  }

  return (
    <>
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

      {/* Modal de confirmação de sobrecarga — sem window.confirm (armadilha #1) */}
      {overloadModal.open && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-lg text-[#161616] mb-2">Voluntário Sobrecarregado</h3>
            <p className="text-[#5A5A5A] text-sm mb-6">{overloadModal.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setOverloadModal((m) => ({ ...m, open: false }))}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:border-[#e13500] hover:text-[#e13500] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { void overloadModal.onConfirm() }}
                className="px-4 py-2 rounded-xl bg-[#e13500] text-white text-sm font-semibold hover:bg-[#c42e00] transition-colors"
              >
                Adicionar mesmo assim
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  )
}

interface ScheduleDetailProps {
  schedule: ScheduleWithAssignments
  churchId: string
}

function ScheduleDetail({ schedule, churchId }: ScheduleDetailProps) {
  const [addOpen, setAddOpen] = useState(false)
  const assignments = schedule.service_schedule_assignments ?? []

  return (
    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Voluntários escalados ({assignments.length})
        </p>
        <button
          onClick={() => setAddOpen(true)}
          className="text-xs text-primary hover:text-primary font-medium"
        >
          + Adicionar
        </button>
      </div>
      {assignments.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhum voluntário escalado ainda.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {assignments.map((a) => (
            <div key={a.id} className="text-xs bg-white border border-gray-200 rounded-lg px-2.5 py-1.5">
              <span className="font-medium text-gray-800">
                {a.volunteers?.people?.name ?? 'Voluntário'}
              </span>
              {a.role && <span className="text-gray-500 ml-1">· {a.role}</span>}
            </div>
          ))}
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
    </div>
  )
}

export default function Escalas() {
  const { churchId } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean
    title: string
    message: string
    onConfirm: () => void
  }>({ open: false, title: '', message: '', onConfirm: () => {} })
  const publishSchedule = usePublishSchedule()
  const cancelSchedule = useCancelSchedule()

  const { data: ministries } = useMinisterios(churchId ?? '')
  const { data: schedules, isLoading, isError, refetch } = useEscalas(churchId ?? '')

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  function handlePublish(id: string) {
    setConfirmModal({
      open: true,
      title: 'Publicar Escala',
      message: 'Publicar esta escala? Os voluntários serão notificados.',
      onConfirm: async () => {
        setConfirmModal((m) => ({ ...m, open: false }))
        await publishSchedule.mutateAsync({ id, churchId: churchId! })
      },
    })
  }

  function handleCancel(id: string) {
    setConfirmModal({
      open: true,
      title: 'Cancelar Escala',
      message: 'Tem certeza que deseja cancelar esta escala? Esta ação não pode ser desfeita.',
      onConfirm: async () => {
        setConfirmModal((m) => ({ ...m, open: false }))
        await cancelSchedule.mutateAsync({ id, churchId: churchId! })
      },
    })
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

      {/* Modal de Confirmação (armadilha #1 — sem window.confirm) */}
      {confirmModal.open && (
        <ModalPortal>
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="font-semibold text-lg text-[#161616] mb-2">{confirmModal.title}</h3>
            <p className="text-[#5A5A5A] text-sm mb-6">{confirmModal.message}</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmModal((m) => ({ ...m, open: false }))}
                className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium hover:border-[#e13500] hover:text-[#e13500] transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => { void confirmModal.onConfirm() }}
                className="px-4 py-2 rounded-xl bg-[#e13500] text-white text-sm font-semibold hover:bg-[#c42e00] transition-colors"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}
