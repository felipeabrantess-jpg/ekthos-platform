/**
 * People.tsx — Fase 2: tabs de categorias
 *
 * Tabs:
 *  - Visão geral    → lista completa (default)
 *  - Aniversários   → pessoas com aniversário no mês atual
 *  - Novos          → stage: visitante
 *  - Líderes        → stage: lider
 *  - Em Risco       → stage: frequentador
 */

import { useState, Component, type ReactNode } from 'react'
import { Pencil, Trash2, Gift, QrCode, ChevronLeft, ChevronRight, Upload } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { usePeople, usePeopleCount, useDeletePerson, PEOPLE_PAGE_SIZE } from '@/features/people/hooks/usePeople'
import PersonModal from '@/features/people/components/PersonModal'
import PersonDetailPanel from '@/features/people/components/PersonDetailPanel'
import QrCodeModal from '@/features/qr-visitor/components/QrCodeModal'
import { ImportacaoMembros } from '@/features/people/components/ImportacaoMembros'
import { useAuth } from '@/hooks/useAuth'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import type { Person, PersonWithStage } from '@/lib/types/joins'

// ── Error Boundary para PersonDetailPanel ────────────────────────────────────
class PanelErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(error: Error) { console.error('[PanelErrorBoundary]', error) }
  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

type BadgeVariant = 'blue' | 'green' | 'yellow' | 'gray' | 'red' | 'purple'

type PeopleTab = 'geral' | 'aniversarios' | 'novos' | 'lideres' | 'em-risco'

const TABS: { id: PeopleTab; label: string }[] = [
  { id: 'geral',         label: 'Visão geral'      },
  { id: 'aniversarios',  label: 'Aniversários'     },
  { id: 'novos',         label: 'Novos Convertidos' },
  { id: 'lideres',       label: 'Líderes'          },
  { id: 'em-risco',      label: 'Em Risco'         },
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

/** Filtra aniversariantes do mês atual via campo birth_date */
function filterBirthdayThisMonth(people: PersonWithStage[]): PersonWithStage[] {
  const now = new Date()
  return people.filter(p => {
    const bday = p.birth_date
    if (!bday) return false
    const d = new Date(bday + 'T00:00:00')
    return d.getMonth() === now.getMonth()
  })
}

function applyTabFilter(tab: PeopleTab, people: PersonWithStage[]): PersonWithStage[] {
  switch (tab) {
    case 'aniversarios': return filterBirthdayThisMonth(people)
    case 'novos':        return filterByStage(people, ['visitante'])
    case 'lideres':      return filterByStage(people, ['lider'])
    case 'em-risco':     return filterByStage(people, ['frequentador'])
    default:             return people
  }
}

// ── ConfirmDeleteModal (A2 — substitui window.confirm) ───────────────────────

interface ConfirmDeleteModalProps {
  person: Person | null
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
  error?: string | null
}

function ConfirmDeleteModal({ person, onConfirm, onCancel, isDeleting, error }: ConfirmDeleteModalProps) {
  if (!person) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 space-y-4">
        <h3 className="text-base font-semibold text-text-primary">Remover pessoa</h3>
        <p className="text-sm text-text-secondary">
          Deseja remover <strong>{person.name ?? 'esta pessoa'}</strong>? A ação pode ser revertida pelo suporte.
        </p>
        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex gap-2 justify-end pt-1">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-sm font-medium border border-border-default text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50"
          >
            {isDeleting ? 'Removendo...' : 'Remover'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── PersonCard — mobile view ──────────────────────────────────────────────────

interface PersonCardMobileProps {
  person: PersonWithStage
  onView: (p: PersonWithStage) => void
  onEdit: (p: Person) => void
  onDelete: (p: Person) => void   // A3: adicionado
}

function PersonCardMobile({ person, onView, onEdit, onDelete }: PersonCardMobileProps) {
  const stage = person.person_pipeline?.[0]?.pipeline_stages

  return (
    <div
      className="bg-white rounded-2xl border border-border-default p-4 shadow-sm active:bg-bg-primary transition-colors cursor-pointer"
      onClick={() => onView(person)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Avatar placeholder */}
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
            style={{ background: 'var(--church-primary, var(--color-primary))' }}
          >
            {(person.name ?? '?').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary truncate">{person.name ?? '—'}</p>
            {person.email && (
              <p className="text-xs text-text-secondary truncate mt-0.5">{person.email}</p>
            )}
            {person.phone && (
              <p className="text-xs text-text-tertiary mt-0.5">{formatPhone(person.phone)}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {stage && (
            <Badge label={stage.name} variant={stageToBadgeVariant(stage.slug)} />
          )}
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => onEdit(person)}
              className="p-2 rounded-lg text-text-tertiary active:text-primary-text active:bg-bg-hover transition-all"
              title="Editar"
            >
              <Pencil size={15} strokeWidth={1.75} />
            </button>
            <button
              onClick={() => onDelete(person)}
              className="p-2 rounded-lg text-text-tertiary active:text-red-600 active:bg-red-50 transition-all"
              title="Remover"
            >
              <Trash2 size={15} strokeWidth={1.75} />
            </button>
          </div>
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
      className="hover:bg-bg-hover transition-colors cursor-pointer"
      onClick={() => onView(person)}
    >
      <td className="px-4 py-3">
        <div>
          <p className="text-sm font-medium text-text-primary">{person.name ?? '—'}</p>
          {person.email && (
            <p className="text-xs text-text-secondary">{person.email}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-text-secondary">
        {formatPhone(person.phone)}
      </td>
      <td className="px-4 py-3">
        {stage ? (
          <Badge label={stage.name} variant={stageToBadgeVariant(stage.slug)} />
        ) : (
          <span className="text-xs text-text-tertiary">Sem stage</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {(person.tags ?? []).slice(0, 3).map((tag) => (
            <span key={tag} className="text-xs bg-bg-hover text-primary-text rounded-full px-2 py-0.5 font-medium">
              {tag}
            </span>
          ))}
          {(person.tags ?? []).length > 3 && (
            <span className="text-xs text-text-tertiary">+{(person.tags ?? []).length - 3}</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-text-secondary">
        {formatDate(person.created_at)}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(person)}
            title="Editar"
            className="p-1.5 rounded-lg text-text-tertiary hover:text-primary-text hover:bg-bg-hover transition-all"
          >
            <Pencil size={14} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => onDelete(person)}
            title="Remover"
            className="p-1.5 rounded-lg text-text-tertiary hover:text-red-600 hover:bg-red-50 transition-all"
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
  const queryClient  = useQueryClient()
  const [activeTab, setActiveTab] = useState<PeopleTab>('geral')
  const [search, setSearch]         = useState('')
  const [currentPage, setCurrentPage] = useState(0)           // A1: paginação
  const [modalOpen, setModalOpen]   = useState(false)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [editingPerson, setEditingPerson]   = useState<Person | null>(null)
  const [deletingId, setDeletingId]         = useState<string | null>(null)
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null) // A2: modal
  const [deleteError, setDeleteError]       = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<PersonWithStage | null>(null)

  // A1: tabs filtradas carregam tudo (client-side); geral pagina no servidor
  const isFilteredTab = activeTab !== 'geral'
  const { data: people, isLoading, isError, refetch } = usePeople(churchId ?? '', {
    search,
    page:     isFilteredTab ? 0 : currentPage,
    pageSize: isFilteredTab ? 500 : PEOPLE_PAGE_SIZE,
  })
  const { data: totalCount } = usePeopleCount(churchId ?? '')
  const deletePerson = useDeletePerson()

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  function handleView(person: PersonWithStage)  { setSelectedPerson(person) }
  function handleEdit(person: Person)           { setEditingPerson(person); setModalOpen(true) }
  function handleNewPerson()                    { setEditingPerson(null); setModalOpen(true) }

  // A2: abre modal em vez de window.confirm
  function handleDelete(person: Person) { setPersonToDelete(person); setDeleteError(null) }

  async function confirmDelete() {
    if (!personToDelete) return
    setDeletingId(personToDelete.id)
    setDeleteError(null)
    try {
      await deletePerson.mutateAsync({ id: personToDelete.id, churchId: churchId! })
      setPersonToDelete(null) // fecha modal SOMENTE em caso de sucesso
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erro ao excluir. Tente novamente.')
    } finally {
      setDeletingId(null)
    }
  }

  const allPeople     = (people ?? []).filter((p) => !deletingId || p.id !== deletingId)
  const filteredPeople = applyTabFilter(activeTab, allPeople)

  // A1: paginação só na tab geral
  const showPagination = activeTab === 'geral' && !search && (totalCount ?? 0) > PEOPLE_PAGE_SIZE
  const totalPages     = Math.ceil((totalCount ?? 0) / PEOPLE_PAGE_SIZE)

  // Mensagens de estado vazio por aba
  const emptyMessages: Record<PeopleTab, { title: string; description: string }> = {
    geral:        { title: 'Nenhuma pessoa cadastrada', description: 'Adicione a primeira pessoa clicando em "Nova Pessoa".' },
    aniversarios: { title: 'Nenhum aniversariante este mês', description: 'Nenhuma pessoa com data de aniversário em ' + new Date().toLocaleString('pt-BR', { month: 'long' }) + '.' },
    novos:        { title: 'Nenhum novo convertido', description: 'Pessoas nos stages Visitante ou Interesse em Grupo aparecerão aqui.' },
    lideres:      { title: 'Nenhum líder cadastrado', description: 'Pessoas no stage Líder aparecerão aqui.' },
    'em-risco':   { title: 'Nenhuma pessoa em risco', description: 'Pessoas inativas ou afastadas aparecerão aqui.' },
  }

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-text-primary">Pessoas</h1>
          <p className="text-xs md:text-sm text-text-secondary mt-1">
            {people
              ? activeTab === 'geral' && !search
                ? `${totalCount ?? allPeople.length} cadastradas`
                : `${filteredPeople.length} encontradas`
              : 'Carregando...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* QR de Entrada */}
          <button
            onClick={() => setQrModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default bg-bg-hover text-primary-text text-sm font-medium hover:bg-bg-hover transition-colors"
          >
            <QrCode size={15} strokeWidth={1.75} />
            <span className="hidden sm:inline">QR de Entrada</span>
          </button>
          {/* Importar planilha — só desktop */}
          <button
            onClick={() => setImportModalOpen(true)}
            className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default bg-bg-hover text-primary-text text-sm font-medium hover:bg-bg-hover transition-colors"
          >
            <Upload size={15} strokeWidth={1.75} />
            Importar
          </button>
          {/* Nova Pessoa — só desktop */}
          <Button onClick={handleNewPerson} className="hidden md:inline-flex">+ Nova Pessoa</Button>
        </div>
      </div>

      {/* ── Tabs: scroll horizontal em mobile ───────────────────── */}
      <div className="flex gap-1 border-b border-border-default -mb-2 overflow-x-auto scrollbar-none pb-px">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); setSearch(''); setCurrentPage(0) }}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary text-primary-text'
                : 'border-transparent text-text-secondary active:text-text-primary'
            }`}
          >
            {tab.id === 'aniversarios' && <Gift size={13} strokeWidth={2} />}
            {tab.label}
            {people && tab.id !== 'geral' && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                activeTab === tab.id
                  ? 'bg-bg-hover text-primary-text'
                  : 'bg-bg-hover text-text-tertiary'
              }`}>
                {applyTabFilter(tab.id, allPeople).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Busca full-width em mobile */}
      {activeTab === 'geral' && (
        <div className="flex gap-3">
          <Input
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(0) }}
            className="w-full md:max-w-sm"
          />
        </div>
      )}

      {/* ── Loading / Error / Empty / Lista ─────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : filteredPeople.length === 0 ? (
        <div className="bg-bg-primary rounded-2xl border border-border-default shadow-sm overflow-hidden">
          <EmptyState
            title={search ? 'Nenhuma pessoa encontrada' : emptyMessages[activeTab].title}
            description={search ? 'Tente buscar por outro nome ou telefone.' : emptyMessages[activeTab].description}
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
                onDelete={handleDelete}
              />
            ))}
          </div>

          {/* ── Desktop: tabela ───────────────────────────────── */}
          <div className="hidden md:block bg-bg-primary rounded-2xl border border-border-default shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-bg-hover border-b border-border-default">
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Nome</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Telefone</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Stage</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Tags</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Cadastro</th>
                    <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-default">
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
      )}

      {/* ── A1: Paginação (só tab Geral, sem busca ativa) ────── */}
      {showPagination && (
        <div className="flex items-center justify-between py-2 px-1">
          <p className="text-xs text-text-tertiary">
            Página {currentPage + 1} de {totalPages} · {totalCount} pessoas
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-hover disabled:opacity-30 transition-colors"
              title="Página anterior"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={currentPage >= totalPages - 1}
              className="p-1.5 rounded-lg text-text-secondary hover:bg-bg-hover disabled:opacity-30 transition-colors"
              title="Próxima página"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── FAB mobile: adicionar pessoa ─────────────────────── */}
      <button
        onClick={handleNewPerson}
        className="md:hidden fixed bottom-6 right-6 z-20 flex items-center justify-center rounded-full shadow-lg active:scale-95 transition-transform"
        style={{ width: 56, height: 56, background: 'var(--church-primary, var(--color-primary))' }}
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
      <PanelErrorBoundary>
        <PersonDetailPanel
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onEdit={(p) => { setSelectedPerson(null); handleEdit(p) }}
        />
      </PanelErrorBoundary>

      {/* QR Code Modal */}
      <QrCodeModal
        open={qrModalOpen}
        onOpenChange={setQrModalOpen}
        churchId={churchId}
      />

      {/* A2: Modal de confirmação de exclusão (substitui window.confirm) */}
      <ConfirmDeleteModal
        person={personToDelete}
        onConfirm={() => { void confirmDelete() }}
        onCancel={() => { setPersonToDelete(null); setDeleteError(null) }}
        isDeleting={deletingId !== null}
        error={deleteError}
      />

      {/* Importação de membros por planilha */}
      <ImportacaoMembros
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={(_count) => {
          void queryClient.invalidateQueries({ queryKey: ['people', churchId] })
          void queryClient.invalidateQueries({ queryKey: ['people-count', churchId] })
        }}
      />
    </div>
  )
}
