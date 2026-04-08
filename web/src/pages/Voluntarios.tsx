import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  useVoluntarios,
  useCreateVolunteer,
  useDeactivateVolunteer,
} from '@/features/voluntarios/hooks/useVoluntarios'
import { useMinisterios } from '@/features/ministerios/hooks/useMinisterios'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import type { VolunteerWithPerson, MinistryWithLeader } from '@/lib/database.types'

const WEEKDAYS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo']

interface VolunteerFormData {
  personId: string
  ministryId: string
  role: string
  skills: string
  availabilityDays: string[]
  period: string
}

const emptyForm: VolunteerFormData = {
  personId: '',
  ministryId: '',
  role: '',
  skills: '',
  availabilityDays: [],
  period: '',
}

interface AddVolunteerModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  ministries: MinistryWithLeader[]
  defaultMinistryId?: string
}

function AddVolunteerModal({ open, onClose, churchId, ministries, defaultMinistryId }: AddVolunteerModalProps) {
  const createVolunteer = useCreateVolunteer()
  const [form, setForm] = useState<VolunteerFormData>({
    ...emptyForm,
    ministryId: defaultMinistryId ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleDay(day: string) {
    setForm((prev) => ({
      ...prev,
      availabilityDays: prev.availabilityDays.includes(day)
        ? prev.availabilityDays.filter((d) => d !== day)
        : [...prev.availabilityDays, day],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.personId.trim() || !form.ministryId) return
    setSubmitting(true)
    setError(null)
    try {
      await createVolunteer.mutateAsync({
        church_id: churchId,
        person_id: form.personId.trim(),
        ministry_id: form.ministryId,
        role: form.role.trim() || undefined,
        skills: form.skills
          ? form.skills.split(',').map((s) => s.trim()).filter(Boolean)
          : [],
        availability: {
          days: form.availabilityDays,
          period: form.period,
        },
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao cadastrar voluntário')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Adicionar Voluntário" size="md">
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">ID da Pessoa (person_id) *</label>
          <Input
            value={form.personId}
            onChange={(e) => setForm((p) => ({ ...p, personId: e.target.value }))}
            placeholder="UUID da pessoa cadastrada"
            required
          />
          <p className="text-xs text-gray-400 mt-1">Cole o ID da pessoa da seção Pessoas</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Ministério *</label>
          <select
            value={form.ministryId}
            onChange={(e) => setForm((p) => ({ ...p, ministryId: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            required
          >
            <option value="">Selecionar ministério...</option>
            {ministries.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Função</label>
          <Input
            value={form.role}
            onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
            placeholder="Ex: Músico, Sonoplasta..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Habilidades</label>
          <Input
            value={form.skills}
            onChange={(e) => setForm((p) => ({ ...p, skills: e.target.value }))}
            placeholder="Separadas por vírgula: Piano, Violão, Guitarra"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Disponibilidade</label>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${
                  form.availabilityDays.includes(day)
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Período</label>
          <select
            value={form.period}
            onChange={(e) => setForm((p) => ({ ...p, period: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Qualquer</option>
            <option value="manha">Manhã</option>
            <option value="tarde">Tarde</option>
            <option value="noite">Noite</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.personId.trim() || !form.ministryId}>
            {submitting ? 'Salvando...' : 'Adicionar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface VolunteerRowProps {
  volunteer: VolunteerWithPerson & { ministries?: { id: string; name: string } | null }
  onDeactivate: (v: VolunteerWithPerson) => void
}

function VolunteerRow({ volunteer, onDeactivate }: VolunteerRowProps) {
  const person = volunteer.people
  const ministry = (volunteer as VolunteerWithPerson & { ministries?: { id: string; name: string } | null }).ministries

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-gray-900">{person?.name ?? '—'}</p>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{person?.phone ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{ministry?.name ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-600">{volunteer.role ?? '—'}</td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {volunteer.skills.slice(0, 3).map((skill) => (
            <span key={skill} className="text-xs bg-blue-50 text-blue-700 rounded px-1.5 py-0.5">
              {skill}
            </span>
          ))}
          {volunteer.skills.length > 3 && (
            <span className="text-xs text-gray-400">+{volunteer.skills.length - 3}</span>
          )}
          {volunteer.skills.length === 0 && <span className="text-xs text-gray-400">—</span>}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {volunteer.availability?.days?.length > 0
          ? volunteer.availability.days.join(', ')
          : '—'}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => onDeactivate(volunteer)}
          className="text-xs text-red-500 hover:text-red-600 font-medium"
        >
          Desativar
        </button>
      </td>
    </tr>
  )
}

export default function Voluntarios() {
  const { churchId } = useAuth()
  const [selectedMinistryId, setSelectedMinistryId] = useState<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const deactivate = useDeactivateVolunteer()

  const { data: ministries } = useMinisterios(churchId ?? '')
  const {
    data: volunteers,
    isLoading,
    isError,
    refetch,
  } = useVoluntarios(churchId ?? '', selectedMinistryId || undefined)

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  async function handleDeactivate(v: VolunteerWithPerson) {
    if (!confirm(`Desativar ${v.people?.name ?? 'este voluntário'}?`)) return
    await deactivate.mutateAsync({ id: v.id, churchId: churchId! })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Voluntários</h1>
          <p className="text-sm text-gray-500 mt-1">
            {volunteers ? `${volunteers.length} voluntário${volunteers.length !== 1 ? 's' : ''}` : 'Carregando...'}
          </p>
        </div>
        <Button onClick={() => setModalOpen(true)}>+ Adicionar Voluntário</Button>
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <select
          value={selectedMinistryId}
          onChange={(e) => setSelectedMinistryId(e.target.value)}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
        >
          <option value="">Todos os ministérios</option>
          {(ministries ?? []).map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <ErrorState message="Não foi possível carregar os voluntários." onRetry={() => void refetch()} />
        ) : (volunteers ?? []).length === 0 ? (
          <EmptyState
            title="Nenhum voluntário cadastrado"
            description="Adicione o primeiro voluntário clicando em 'Adicionar Voluntário'."
            action={<Button onClick={() => setModalOpen(true)}>+ Adicionar Voluntário</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefone</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ministério</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Função</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Habilidades</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Disponibilidade</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(volunteers ?? []).map((v) => (
                  <VolunteerRow
                    key={v.id}
                    volunteer={v as VolunteerWithPerson & { ministries?: { id: string; name: string } | null }}
                    onDeactivate={handleDeactivate}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modalOpen && (
        <AddVolunteerModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          churchId={churchId}
          ministries={ministries ?? []}
          defaultMinistryId={selectedMinistryId || undefined}
        />
      )}
    </div>
  )
}
