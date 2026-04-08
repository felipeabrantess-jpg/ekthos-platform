import { useState } from 'react'
import { usePeople, useDeletePerson } from '@/features/people/hooks/usePeople'
import PersonModal from '@/features/people/components/PersonModal'
import { useAuth } from '@/hooks/useAuth'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import type { Person, PersonWithStage } from '@/lib/database.types'

type BadgeVariant = 'blue' | 'green' | 'yellow' | 'gray' | 'red' | 'purple'

// Mapeamento de stage slug → cor do badge
function stageToBadgeVariant(slug: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    visitante: 'yellow',
    'interesse-grupo': 'blue',
    'em-acompanhamento': 'purple',
    membro: 'green',
    lider: 'green',
    inativo: 'gray',
  }
  return map[slug] ?? 'gray'
}

function formatPhone(phone: string | null) {
  if (!phone) return '—'
  return phone.replace(/^\+55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}

function formatDate(date: string | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date))
}

interface PersonRowProps {
  person: PersonWithStage
  onEdit: (p: Person) => void
  onDelete: (p: Person) => void
}

function PersonRow({ person, onEdit, onDelete }: PersonRowProps) {
  const stage = person.person_pipeline?.[0]?.pipeline_stages

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-gray-900">{person.name ?? '—'}</p>
          {person.email && (
            <p className="text-xs text-gray-500">{person.email}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">
        {formatPhone(person.phone)}
      </td>
      <td className="px-4 py-3">
        {stage ? (
          <Badge label={stage.name} variant={stageToBadgeVariant(stage.slug)} />
        ) : (
          <span className="text-xs text-gray-400">Sem stage</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {person.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
              {tag}
            </span>
          ))}
          {person.tags.length > 3 && (
            <span className="text-xs text-gray-400">+{person.tags.length - 3}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">
        {formatDate(person.created_at)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(person)}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium"
          >
            Editar
          </button>
          <button
            onClick={() => onDelete(person)}
            className="text-xs text-red-500 hover:text-red-600 font-medium"
          >
            Remover
          </button>
        </div>
      </td>
    </tr>
  )
}

export default function People() {
  const { churchId } = useAuth()
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: people, isLoading, isError, refetch } = usePeople(churchId ?? '', { search })
  const deletePerson = useDeletePerson()

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  function handleEdit(person: Person) {
    setEditingPerson(person)
    setModalOpen(true)
  }

  function handleNewPerson() {
    setEditingPerson(null)
    setModalOpen(true)
  }

  async function handleDelete(person: Person) {
    if (!confirm(`Remover ${person.name ?? 'esta pessoa'}? Esta ação pode ser revertida.`)) return
    setDeletingId(person.id)
    try {
      await deletePerson.mutateAsync({ id: person.id, churchId })
    } finally {
      setDeletingId(null)
    }
  }

  const displayedPeople = (people ?? []).filter((p) => !deletingId || p.id !== deletingId)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pessoas</h1>
          <p className="text-sm text-gray-500 mt-1">
            {people ? `${people.length} cadastradas` : 'Carregando...'}
          </p>
        </div>
        <Button onClick={handleNewPerson}>
          + Nova Pessoa
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <Input
          placeholder="Buscar por nome, telefone ou e-mail..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : isError ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : displayedPeople.length === 0 ? (
          <EmptyState
            title={search ? 'Nenhuma pessoa encontrada' : 'Nenhuma pessoa cadastrada'}
            description={search ? 'Tente buscar por outro nome ou telefone.' : 'Adicione a primeira pessoa clicando em "Nova Pessoa".'}
            action={!search ? <Button onClick={handleNewPerson}>+ Nova Pessoa</Button> : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Telefone</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cadastro</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayedPeople.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      <PersonModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingPerson(null) }}
        churchId={churchId}
        person={editingPerson}
      />
    </div>
  )
}
