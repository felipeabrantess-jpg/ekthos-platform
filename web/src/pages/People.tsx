/**
 * People.tsx — Fase 2: tabs de categorias
 *
 * Tabs:
 *  - Visão geral    → lista completa (default)
 *  - Aniversários   → pessoas com aniversário no mês atual
 *  - Novos          → stage: visitante | interesse-grupo
 *  - Líderes        → stage: lider
 *  - Em Risco       → stage: inativo
 */

import { useState } from 'react'
import { Pencil, Trash2, Gift, QrCode } from 'lucide-react'
import { usePeople, useDeletePerson } from '@/features/people/hooks/usePeople'
import PersonModal from '@/features/people/components/PersonModal'
import PersonDetailPanel from '@/features/people/components/PersonDetailPanel'
import { QrVisitor } from '@/pages/configuracoes/QrVisitor'
import { useAuth } from '@/hooks/useAuth'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import type { Person, PersonWithStage } from '@/lib/types/joins'

type BadgeVariant = 'blue' | 'green' | 'yellow' | 'gray' | 'red' | 'purple'

type PeopleTab = 'geral' | 'aniversarios' | 'novos' | 'lideres' | 'em-risco' | 'qr-visitante'

const TABS: { id: PeopleTab; label: string }[] = [
  { id: 'geral',          label: 'Visão geral'      },
  { id: 'aniversarios',   label: 'Aniversários'     },
  { id: 'novos',          label: 'Novos Convertidos' },
  { id: 'lideres',        label: 'Líderes'          },
  { id: 'em-risco',       label: 'Em Risco'         },
  { id: 'qr-visitante',   label: 'QR Visitante'     },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

function stageToBadgeVariant(slug: string): BadgeVariant {
  const map: Record<string, BadgeVariant> = {
    visitante:         'yellow',
    'interesse-grupo': 'blue',
    'em-acompanhamento': 'purple',
    membro:            'green',
    lider:             'green',
    inativo:           'gray',
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

/** Obtém o slug do stage de uma pessoa (considera apenas o primeiro da fila) */
function getStageSlug(person: PersonWithStage): string | null {
  return person.person_pipeline?.[0]?.pipeline_stages?.slug ?? null
}

/** Filtra pessoas pelo stage slug */
function filterByStage(people: PersonWithStage[], slugs: string[]): PersonWithStage[] {
  return people.filter(p => {
    const s = getStageSlug(p)
    return s !== null && slugs.includes(s)
  })
}

/** Filtra aniversariantes do mês atual via campo birthday (se disponível) */
function filterBirthdayThisMonth(people: PersonWithStage[]): PersonWithStage[] {
  const now = new Date()
  return people.filter(p => {
    // Acesso seguro ao campo birthday (pode não existir no tipo base)
    const bday = (p as unknown as { birthday?: string | null }).birthday
    if (!bday) return false
    const d = new Date(bday + 'T00:00:00')
    return d.getMonth() === now.getMonth()
  })
}

function applyTabFilter(tab: PeopleTab, people: PersonWithStage[]): PersonWithStage[] {
  switch (tab) {
    case 'aniversarios': return filterBirthdayThisMonth(people)
    case 'novos':        return filterByStage(people, ['visitante', 'interesse-grupo'])
    case 'lideres':      return filterByStage(people, ['lider'])
    case 'em-risco':     return filterByStage(people, ['inativo'])
    default:             return people
  }
}

// ── PersonCard — mobile view ──────────────────────────────────────────────────

interface PersonCardMobileProps {
  person: PersonWithStage
  onView: (p: PersonWithStage) => void
  onEdit: (p: Person) => void
}

function PersonCardMobile({ person, onView, onEdit }: PersonCardMobileProps) {
  const stage = person.person_pipeline?.[0]?.pipeline_stages

  return (
    <div
      className="bg-white rounded-2xl border border-cream-dark/50 p-4 shadow-sm active:bg-cream-light transition-colors cursor-pointer"
      onClick={() => onView(person)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar placeholder */}
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
            style={{ background: 'var(--church-primary, #e13500)' }}
          >
            {(person.name ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ekthos-black truncate">{person.name ?? '—'}</p>
            {person.email && (
              <p className="text-xs text-ekthos-black/50 truncate mt-0.5">{person.email}</p>
            )}
            {person.phone && (
              <p className="text-xs text-ekthos-black/40 mt-0.5">{formatPhone(person.phone)}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {stage && (
            <Badge label={stage.name} variant={stageToBadgeVariant(stage.slug)} />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(person) }}
            className="p-2 rounded-lg text-ekthos-black/30 active:text-brand-600 active:bg-brand-50 transition-all"
            title="Editar"
          >
            <Pencil size={15} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Componentes internos ─────────────────────────────────────────────────────

interface PersonRowProps {
  person: PersonWithStage
  onView: (p: PersonWithStage) => void
  onEdit: (p: Person) => void
  onDelete: (p: Person) => void
}

function PersonRow({ person, onView, onEdit, onDelete }: PersonRowProps) {
  const stage = person.person_pipeline?.[0]?.pipeline_stages

  return (
    <tr
      className="hover:bg-cream-dark/30 transition-colors cursor-pointer"
      onClick={() => onView(person)}
    >
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-ekthos-black">{person.name ?? '—'}</p>
          {person.email && (
            <p className="text-xs text-ekthos-black/50">{person.email}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-ekthos-black/60">
        {formatPhone(person.phone)}
      </td>
      <td className="px-4 py-3">
        {stage ? (
          <Badge label={stage.name} variant={stageToBadgeVariant(stage.slug)} />
        ) : (
          <span className="text-xs text-ekthos-black/30">Sem stage</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {person.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs bg-brand-50 text-brand-800 rounded-full px-2 py-0.5 font-medium">
              {tag}
            </span>
          ))}
          {person.tags.length > 3 && (
            <span className="text-xs text-ekthos-black/40">+{person.tags.length - 3}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-ekthos-black/50">
        {formatDate(person.created_at)}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(person)}
            title="Editar"
            className="p-1.5 rounded-lg text-ekthos-black/30 hover:text-brand-600 hover:bg-brand-50 transition-all"
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => onDelete(person)}
            title="Remover"
            className="p-1.5 rounded-lg text-ekthos-black/30 hover:text-red-600 hover:bg-red-50 transition-all"
          >
            <Trash2 size={14} strokeWidth={1.75} />
          </button>
        </div>
      </td>
    </tr>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function People() {
  const { churchId } = useAuth()
  const [activeTab, setActiveTab] = useState<PeopleTab>('geral')
  const [search, setSearch]         = useState('')
  const [modalOpen, setModalOpen]   = useState(false)
  const [editingPerson, setEditingPerson]   = useState<Person | null>(null)
  const [deletingId, setDeletingId]         = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<PersonWithStage | null>(null)

  const { data: people, isLoading, isError, refetch } = usePeople(churchId ?? '', { search })
  const deletePerson = useDeletePerson()

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  function handleView(person: PersonWithStage)  { setSelectedPerson(person) }
  function handleEdit(person: Person)           { setEditingPerson(person); setModalOpen(true) }
  function handleNewPerson()                    { setEditingPerson(null); setModalOpen(true) }

  async function handleDelete(person: Person) {
    if (!confirm(`Remover ${person.name ?? 'esta pessoa'}? Esta ação pode ser revertida.`)) return
    setDeletingId(person.id)
    try {
      await deletePerson.mutateAsync({ id: person.id, churchId: churchId! })
    } finally {
      setDeletingId(null)
    }
  }

  const allPeople     = (people ?? []).filter((p) => !deletingId || p.id !== deletingId)
  const filteredPeople = applyTabFilter(activeTab, allPeople)

  // Mensagens de estado vazio por aba
  const emptyMessages: Record<Exclude<PeopleTab, 'qr-visitante'>, { title: string; description: string }> = {
    geral:        { title: 'Nenhuma pessoa cadastrada', description: 'Adicione a primeira pessoa clicando em "Nova Pessoa".' },
    aniversarios: { title: 'Nenhum aniversariante este mês', description: 'Nenhuma pessoa com data de aniversário em ' + new Date().toLocaleString('pt-BR', { month: 'long' }) + '.' },
    novos:        { title: 'Nenhum novo convertido', description: 'Pessoas nos stages Visitante ou Interesse em Grupo aparecerão aqui.' },
    lideres:      { title: 'Nenhum líder cadastrado', description: 'Pessoas no stage Líder aparecerão aqui.' },
    'em-risco':   { title: 'Nenhuma pessoa em risco', description: 'Pessoas inativas ou afastadas aparecerão aqui.' },
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header — botão "Nova" só visível em desktop */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-ekthos-black">Pessoas</h1>
          <p className="text-xs md:text-sm text-ekthos-black/50 mt-1">
            {people ? `${allPeople.length} cadastradas` : 'Carregando...'}
          </p>
        </div>
        {/* Desktop CTA */}
        <Button onClick={handleNewPerson} className="hidden md:inline-flex">+ Nova Pessoa</Button>
      </div>

      {/* ── Tabs: scroll horizontal em mobile ───────────────────── */}
      <div className="flex gap-1 border-b border-cream-dark/50 -mb-2 overflow-x-auto scrollbar-none pb-px">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSearch('') }}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-ekthos-black/50 active:text-ekthos-black/80'
            }`}
          >
            {tab.id === 'aniversarios' && <Gift size={13} strokeWidth={2} />}
            {tab.id === 'qr-visitante' && <QrCode size={13} strokeWidth={2} />}
            {tab.label}
            {people && tab.id !== 'geral' && tab.id !== 'qr-visitante' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === tab.id
                  ? 'bg-brand-100 text-brand-700'
                  : 'bg-cream-dark/60 text-ekthos-black/40'
              }`}>
                {applyTabFilter(tab.id, allPeople).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── QR Visitante ─────────────────────────────────────── */}
      {activeTab === 'qr-visitante' && <QrVisitor />}

      {/* Busca full-width em mobile */}
      {activeTab === 'geral' && (
        <div className="flex gap-3">
          <Input
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:max-w-sm"
          />
        </div>
      )}

      {/* ── Loading / Error / Empty / Lista ─────────────────────── */}
      {activeTab !== 'qr-visitante' && (isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : filteredPeople.length === 0 ? (
        <div className="bg-cream-light rounded-2xl border border-cream-dark/50 shadow-sm overflow-hidden">
          <EmptyState
            title={search ? 'Nenhuma pessoa encontrada' : emptyMessages[activeTab as Exclude<PeopleTab, 'qr-visitante'>].title}
            description={search ? 'Tente buscar por outro nome ou telefone.' : emptyMessages[activeTab as Exclude<PeopleTab, 'qr-visitante'>].description}
            action={activeTab === 'geral' && !search ? <Button onClick={handleNewPerson}>+ Nova Pessoa</Button> : undefined}
          />
        </div>
      ) : (
        <>
          {/* ── Mobile: cards ─────────────────────────────────── */}
          <div className="md:hidden space-y-2">
            {filteredPeople.map((person) => (
              <PersonCardMobile
                key={person.id}
                person={person}
                onView={handleView}
                onEdit={handleEdit}
              />
            ))}
          </div>

          {/* ── Desktop: tabela ───────────────────────────────── */}
          <div className="hidden md:block bg-cream-light rounded-2xl border border-cream-dark/50 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-cream-dark/40 border-b border-cream-dark/60">
                    <th className="px-4 py-3 text-xs font-semibold text-ekthos-black/50 uppercase tracking-widest">Nome</th>
                    <th className="px-4 py-3 text-xs font-semibold text-ekthos-black/50 uppercase tracking-widest">Telefone</th>
                    <th className="px-4 py-3 text-xs font-semibold text-ekthos-black/50 uppercase tracking-widest">Stage</th>
                    <th className="px-4 py-3 text-xs font-semibold text-ekthos-black/50 uppercase tracking-widest">Tags</th>
                    <th className="px-4 py-3 text-xs font-semibold text-ekthos-black/50 uppercase tracking-widest">Cadastro</th>
                    <th className="px-4 py-3 text-xs font-semibold text-ekthos-black/50 uppercase tracking-widest">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-cream-dark/40">
                  {filteredPeople.map((person) => (
                    <PersonRow
                      key={person.id}
                      person={person}
                      onView={handleView}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ))}

      {/* ── FAB mobile: adicionar pessoa ─────────────────────── */}
      <button
        onClick={handleNewPerson}
        className="md:hidden fixed bottom-6 right-6 z-20 flex items-center justify-center rounded-full shadow-lg active:scale-95 transition-transform"
        style={{ width: 56, height: 56, background: 'var(--church-primary, #e13500)' }}
        aria-label="Nova pessoa"
      >
        <span className="text-white text-2xl font-bold leading-none">+</span>
      </button>

      {/* Modal */}
      <PersonModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingPerson(null) }}
        churchId={churchId}
        person={editingPerson}
      />

      {/* Detail Panel */}
      <PersonDetailPanel
        person={selectedPerson}
        onClose={() => setSelectedPerson(null)}
        onEdit={(p) => { setSelectedPerson(null); handleEdit(p) }}
      />
    </div>
  )
}
