import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import PersonSelect from '@/components/ui/PersonSelect'
import { supabase } from '@/lib/supabase'
import {
  useCreateAppointment,
  useUpdateAppointment,
  type Appointment,
  type AppointmentInput,
} from '../hooks/useAppointments'

interface Pastor {
  id: string
  name: string | null
}

interface AppointmentModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  personId?: string
  editing?: Appointment | null
}

export function AppointmentModal({ open, onClose, churchId, personId, editing }: AppointmentModalProps) {
  const create = useCreateAppointment()
  const update = useUpdateAppointment()

  const [form, setForm] = useState({
    personId:        personId ?? editing?.person_id ?? '',
    appointmentType: editing?.appointment_type ?? '',
    scheduledAt:     editing?.scheduled_at ? editing.scheduled_at.slice(0, 16) : '',
    pastorId:        editing?.pastor_id ?? '',
    notes:           editing?.notes ?? '',
    status:          editing?.status ?? 'solicitado',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [pastors, setPastors]       = useState<Pastor[]>([])

  useEffect(() => {
    if (!open) return
    setForm({
      personId:        personId ?? editing?.person_id ?? '',
      appointmentType: editing?.appointment_type ?? '',
      scheduledAt:     editing?.scheduled_at ? editing.scheduled_at.slice(0, 16) : '',
      pastorId:        editing?.pastor_id ?? '',
      notes:           editing?.notes ?? '',
      status:          editing?.status ?? 'solicitado',
    })
    setError(null)
  }, [open, editing, personId])

  useEffect(() => {
    if (!open || !churchId) return
    supabase
      .from('profiles')
      .select('id, name')
      .eq('church_id', churchId)
      .order('name')
      .then(({ data }) => setPastors((data ?? []) as Pastor[]))
  }, [open, churchId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.personId || !form.appointmentType.trim() || !form.scheduledAt) return
    setSubmitting(true)
    setError(null)
    try {
      const payload: AppointmentInput = {
        church_id:        churchId,
        person_id:        form.personId,
        appointment_type: form.appointmentType.trim(),
        scheduled_at:     new Date(form.scheduledAt).toISOString(),
        pastor_id:        form.pastorId || null,
        notes:            form.notes.trim() || null,
        status:           form.status,
      }
      if (editing) {
        await update.mutateAsync({ id: editing.id, ...payload })
      } else {
        await create.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar agendamento')
    } finally {
      setSubmitting(false)
    }
  }

  const isValid = !!form.personId && !!form.appointmentType.trim() && !!form.scheduledAt

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? 'Editar Agendamento' : 'Novo Agendamento'}
    >
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        {!personId && !editing && (
          <PersonSelect
            label="Pessoa *"
            value={form.personId}
            onChange={(id) => setForm(p => ({ ...p, personId: id ?? '' }))}
            placeholder="Buscar pelo nome..."
          />
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de atendimento *</label>
          <Input
            value={form.appointmentType}
            onChange={(e) => setForm(p => ({ ...p, appointmentType: e.target.value }))}
            placeholder="Ex: Aconselhamento, Visita, Oração..."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data e hora *</label>
          <Input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => setForm(p => ({ ...p, scheduledAt: e.target.value }))}
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pastor responsável</label>
          <select
            value={form.pastorId}
            onChange={(e) => setForm(p => ({ ...p, pastorId: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
          >
            <option value="">Sem pastor definido</option>
            {pastors.map(pastor => (
              <option key={pastor.id} value={pastor.id}>{pastor.name ?? pastor.id}</option>
            ))}
          </select>
        </div>

        {editing && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm(p => ({ ...p, status: e.target.value as 'solicitado' | 'confirmado' | 'realizado' | 'cancelado' }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="solicitado">Solicitado</option>
              <option value="confirmado">Confirmado</option>
              <option value="realizado">Realizado</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))}
            placeholder="Notas internas..."
            rows={3}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose} disabled={submitting}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !isValid}>
            {submitting ? 'Salvando...' : editing ? 'Salvar' : 'Agendar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
