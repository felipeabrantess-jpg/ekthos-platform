/**
 * Volunteers.tsx — Lista de voluntários (/voluntarios)
 *
 * Design idêntico a /lideres:
 * - Cards mobile-first
 * - Filtro por ministério (chips)
 * - Busca por nome
 * - Stats (total, por ministério top 3)
 * - "+ Adicionar" com busca de pessoa por nome (não UUID)
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { HandHeart, Search, X, Plus, Trash2, Pencil } from 'lucide-react'
import { supabase } from '@/lib/supabase'
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
import type { VolunteerWithPerson } from '@/lib/types/joins'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Ministry { id: string; name: string }
interface PersonResult { id: string; name: string; email: string | null; phone: string | null }

type VolunteerRow = VolunteerWithPerson & {
  ministries?: Ministry | null
}

const ROLE_LABELS: Record<string, string> = {
  volunteer:  'Voluntário',
  leader:     'Líder',
  'co-leader': 'Co-líder',
}

// ── AddVolunteerModal (com busca por nome) ────────────────────────────────────

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
  const [role, setRole] = useState('volunteer')
  const [error, setError] = useState<string | null>(null)

  // Search people by name
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
        role,
        skills: [],
        availability: { days: [], period: 'any' },
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar voluntário')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl p-5 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ekthos-black">Adicionar Voluntário</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-cream transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Person search */}
        <div>
          <label className="block text-sm font-medium text-ekthos-black mb-1.5">Pessoa *</label>
          {selectedPerson ? (
            <div className="flex items-center justify-between bg-brand-50 rounded-xl px-3 py-2.5">
              <span className="text-sm font-medium text-brand-700">{selectedPerson.name}</span>
              <button
                onClick={() => { setSelectedPerson(null); setPersonSearch('') }}
                className="p-1 rounded text-brand-400 hover:text-brand-600"
              >
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
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-black/10 rounded-xl shadow-lg z-10 max-h-48 overflow-y-auto">
                  {isFetching ? (
                    <div className="flex justify-center py-3"><Spinner size="sm" /></div>
                  ) : searchResults.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">Nenhuma pessoa encontrada</p>
                  ) : (
                    searchResults.map(p => (
                      <button
                        key={p.id}
                        onClick={() => { setSelectedPerson(p); setPersonSearch('') }}
                        className="w-full text-left px-4 py-2.5 hover:bg-cream transition-colors"
                      >
                        <p className="text-sm font-medium text-ekthos-black">{p.name}</p>
                        {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Ministry */}
        <div>
          <label className="block text-sm font-medium text-ekthos-black mb-1.5">Ministério *</label>
          <select
            value={ministryId}
            onChange={e => setMinistryId(e.target.value)}
            className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="">Selecionar ministério...</option>
            {ministries.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Role */}
        <div>
          <label className="block text-sm font-medium text-ekthos-black mb-1.5">Função</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="volunteer">Voluntário</option>
            <option value="leader">Líder</option>
            <option value="co-leader">Co-líder</option>
          </select>
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
  )
}

// ── EditVolunteerModal ────────────────────────────────────────────────────────

const DAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

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
}

function EditVolunteerModal({ volunteer, onClose, churchId, ministries }: EditVolunteerModalProps) {
  const updateVolunteer = useUpdateVolunteer()

  // Normaliza availability.days para number[] independente do que vier do banco
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawDays = (volunteer as any).availability?.days ?? []
  const initialDays: number[] = rawDays.map((d: unknown) => Number(d))

  const [editForm, setEditForm] = useState<EditForm>({
    ministryId: volunteer.ministries?.id ?? '',
    role: volunteer.role ?? 'volunteer',
    availability: {
      days: initialDays,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      period: (volunteer as any).availability?.period ?? 'any',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    min_days_between_services: (volunteer as any).min_days_between_services ?? 7,
  })
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (updateVolunteer.mutateAsync as any)({
        id: volunteer.id,
        church_id: churchId,
        ministry_id: editForm.ministryId || undefined,
        role: editForm.role,
        availability: editForm.availability,
        min_days_between_services: editForm.min_days_between_services,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar voluntário')
    }
  }

  function toggleDay(idx: number) {
    setEditForm(f => {
      const current = f.availability.days
      const updated = current.includes(idx) ? current.filter(d => d !== idx) : [...current, idx]
      return { ...f, availability: { ...f.availability, days: updated } }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-md md:rounded-2xl rounded-t-2xl shadow-xl p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-ekthos-black">Editar Voluntário</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-cream transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-sm font-medium text-brand-700 bg-brand-50 rounded-xl px-3 py-2.5">
          {volunteer.people?.name ?? 'Voluntário'}
        </p>

        {/* Ministério */}
        <div>
          <label className="block text-sm font-medium text-ekthos-black mb-1.5">Ministério</label>
          <select
            value={editForm.ministryId}
            onChange={e => setEditForm(f => ({ ...f, ministryId: e.target.value }))}
            className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="">Sem ministério</option>
            {ministries.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Função */}
        <div>
          <label className="block text-sm font-medium text-ekthos-black mb-1.5">Função</label>
          <select
            value={editForm.role}
            onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
            className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="volunteer">Voluntário</option>
            <option value="leader">Líder</option>
            <option value="co-leader">Co-líder</option>
          </select>
        </div>

        {/* Dias disponíveis */}
        <div>
          <label className="text-sm font-medium text-[#5A5A5A] mb-2 block">Dias disponíveis</label>
          <div className="flex gap-2 flex-wrap">
            {DAYS_PT.map((day, idx) => {
              const isSelected = editForm.availability.days.includes(idx)
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-all ${
                    isSelected
                      ? 'bg-[#e13500] text-white border-[#e13500]'
                      : 'bg-white text-[#5A5A5A] border-gray-200 hover:border-[#e13500]'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>

        {/* Período preferencial */}
        <div>
          <label className="text-sm font-medium text-[#5A5A5A] mb-2 block">Período preferencial</label>
          <select
            value={editForm.availability.period}
            onChange={e => setEditForm(f => ({ ...f, availability: { ...f.availability, period: e.target.value } }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          >
            <option value="any">Qualquer período</option>
            <option value="morning">Manhã</option>
            <option value="afternoon">Tarde</option>
            <option value="evening">Noite</option>
          </select>
        </div>

        {/* Intervalo mínimo entre escalas */}
        <div>
          <label className="text-sm font-medium text-[#5A5A5A] mb-2 block">
            Intervalo mínimo entre escalas (dias)
          </label>
          <input
            type="number"
            min="1"
            max="90"
            value={editForm.min_days_between_services}
            onChange={e => setEditForm(f => ({ ...f, min_days_between_services: parseInt(e.target.value) || 7 }))}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-600"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancelar</Button>
          <Button
            onClick={() => { void handleSave() }}
            loading={updateVolunteer.isPending}
            disabled={updateVolunteer.isPending}
            className="flex-1"
          >
            Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── VolunteerCard ─────────────────────────────────────────────────────────────

function VolunteerCard({ volunteer, onRemove, onEdit }: { volunteer: VolunteerRow; onRemove: (v: VolunteerRow) => void; onEdit: (v: VolunteerRow) => void }) {
  const person = volunteer.people
  const ministry = volunteer.ministries
  return (
    <div className="bg-white rounded-2xl border border-black/10 p-4 flex gap-3">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-cream flex items-center justify-center text-brand-600 font-semibold text-sm shrink-0">
        {(person?.name ?? '?').charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-ekthos-black text-sm truncate">{person?.name ?? '—'}</p>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onEdit(volunteer)}
              className="p-1.5 rounded-lg text-gray-300 hover:text-brand-500 hover:bg-brand-50 transition-colors"
              title="Editar"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onRemove(volunteer)}
              className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {person?.email && <p className="text-xs text-gray-400 truncate">{person.email}</p>}
        {person?.phone && <p className="text-xs text-gray-400">{person.phone}</p>}

        <div className="mt-2 flex flex-wrap gap-2">
          {ministry && (
            <span className="inline-flex items-center gap-1 text-xs font-medium bg-brand-50 text-brand-700 px-2 py-0.5 rounded-lg">
              {ministry.name}
            </span>
          )}
          {volunteer.role && (
            <span className="text-xs text-gray-500">
              {ROLE_LABELS[volunteer.role] ?? volunteer.role}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Volunteers() {
  const { churchId } = useAuth()
  const [search, setSearch] = useState('')
  const [ministryFilter, setMinistryFilter] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editingVolunteer, setEditingVolunteer] = useState<VolunteerRow | null>(null)
  const [removingVolunteer, setRemovingVolunteer] = useState<VolunteerRow | null>(null)
  const deactivate = useDeactivateVolunteer()

  // Fetch ministries for filter chips
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

  const { data: volunteers = [], isLoading } = useVoluntarios(
    churchId ?? '',
    ministryFilter || undefined,
  )

  const filteredVolunteers = (volunteers as VolunteerRow[]).filter(v =>
    !search.trim() ||
    (v.people?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (v.people?.email ?? '').toLowerCase().includes(search.toLowerCase())
  )

  async function confirmRemove() {
    if (!removingVolunteer || !churchId) return
    await deactivate.mutateAsync({ id: removingVolunteer.id, churchId })
    setRemovingVolunteer(null)
  }

  // Stats
  const total = (volunteers as VolunteerRow[]).length
  const byMinistry = (volunteers as VolunteerRow[]).reduce<Record<string, number>>((acc, v) => {
    const name = v.ministries?.name ?? 'Sem ministério'
    acc[name] = (acc[name] ?? 0) + 1
    return acc
  }, {})
  const topMinistries = Object.entries(byMinistry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cream flex items-center justify-center">
            <HandHeart className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-ekthos-black">Voluntários</h1>
            <p className="text-sm text-gray-500">Servidores ativos na igreja</p>
          </div>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" />
          <span className="hidden sm:inline">Adicionar</span>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border border-black/10 p-4 text-center">
          <p className="text-2xl font-bold text-ekthos-black">{total}</p>
          <p className="text-xs text-gray-400 mt-1">Total</p>
        </div>
        {topMinistries.map(([name, count]) => (
          <div key={name} className="bg-white rounded-2xl border border-black/10 p-4 text-center">
            <p className="text-2xl font-bold text-ekthos-black">{count}</p>
            <p className="text-xs text-gray-400 mt-1 truncate" title={name}>{name}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar voluntário..."
          className="block w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/10 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
        />
      </div>

      {/* Ministry filter chips */}
      {ministries.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setMinistryFilter('')}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
              ministryFilter === '' ? 'bg-brand-600 text-white' : 'bg-white border border-black/10 text-gray-600 hover:bg-cream'
            }`}
          >
            Todos
          </button>
          {ministries.map(m => (
            <button
              key={m.id}
              onClick={() => setMinistryFilter(ministryFilter === m.id ? '' : m.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                ministryFilter === m.id ? 'bg-brand-600 text-white' : 'bg-white border border-black/10 text-gray-600 hover:bg-cream'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : filteredVolunteers.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <HandHeart className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm mb-4">
            {search || ministryFilter ? 'Nenhum voluntário encontrado.' : 'Nenhum voluntário cadastrado ainda.'}
          </p>
          {!search && !ministryFilter && (
            <Button onClick={() => setAddOpen(true)}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar primeiro voluntário
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filteredVolunteers.map(v => (
            <VolunteerCard key={v.id} volunteer={v} onRemove={setRemovingVolunteer} onEdit={setEditingVolunteer} />
          ))}
        </div>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRemovingVolunteer(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-ekthos-black">Remover voluntário</h3>
                <p className="text-sm text-gray-500">Vinculação com ministério</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">
              Remover <strong>{removingVolunteer.people?.name}</strong> do ministério{' '}
              <strong>{removingVolunteer.ministries?.name}</strong>?
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRemovingVolunteer(null)} className="flex-1">
                Cancelar
              </Button>
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
      )}
    </div>
  )
}
