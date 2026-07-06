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

import { useState, useMemo, useEffect, Component, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Pencil, Trash2, Gift, QrCode, ChevronLeft, ChevronRight, Upload, Settings2, ChevronDown, Check, Phone } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import ModalPortal from '@/components/ui/ModalPortal'
import { usePeople, usePeopleCount, useDeletePerson, PEOPLE_PAGE_SIZE } from '@/features/people/hooks/usePeople'
import { useBirthdayContacts, useToggleBirthdayContact, type BirthdayContact } from '@/features/people/hooks/useBirthdayContacts'
import { useTags } from '@/features/people/hooks/useTags'
import { useChurchUnits } from '@/features/people/hooks/useChurchUnits'
import PersonModal from '@/features/people/components/PersonModal'
import PersonDetailPanel from '@/features/people/components/PersonDetailPanel'
import QrCodeModal from '@/features/qr-visitor/components/QrCodeModal'
import { ImportacaoMembros } from '@/features/people/components/ImportacaoMembros'
import { TagBadgesCell } from '@/features/people/components/TagBadgesCell'
import { useAuth } from '@/hooks/useAuth'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import type { Person, PersonWithStage, Tag } from '@/lib/types/joins'

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

type PeopleTab = 'geral' | 'aniversarios' | 'novos' | 'convertidos' | 'lideres' | 'em-risco'

const TABS: { id: PeopleTab; label: string }[] = [
  { id: 'geral',         label: 'Visão geral'       },
  { id: 'aniversarios',  label: 'Aniversários'      },
  { id: 'novos',         label: 'Novos Visitantes'  },
  { id: 'convertidos',   label: 'Novos Convertidos' },
  { id: 'lideres',       label: 'Líderes'           },
  { id: 'em-risco',      label: 'Em Risco'          },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

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
    case 'novos':        return people.filter(p => p.person_stage === 'visitante')
    case 'convertidos': {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const cutoff = thirtyDaysAgo.toISOString().split('T')[0]
      return people.filter(p => p.conversion_date != null && p.conversion_date >= cutoff)
    }
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
    <ModalPortal>
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
    </ModalPortal>
  )
}

// ── PersonCard — mobile view ──────────────────────────────────────────────────

interface PersonCardMobileProps {
  person: PersonWithStage
  allTags: Tag[]
  onView: (p: PersonWithStage) => void
  onEdit: (p: Person) => void
  onDelete: (p: Person) => void
  showBirthday?: boolean
}

function PersonCardMobile({ person, allTags, onView, onEdit, onDelete, showBirthday }: PersonCardMobileProps) {
  const bdayDay = showBirthday && person.birth_date
    ? new Date(person.birth_date + 'T00:00:00').getDate()
    : null

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
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-text-primary truncate">{person.name ?? '—'}</p>
              {bdayDay !== null && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                  🎂 dia {bdayDay}
                </span>
              )}
            </div>
            {person.email && (
              <p className="text-xs text-text-secondary truncate mt-0.5">{person.email}</p>
            )}
            {person.phone && (
              <p className="text-xs text-text-tertiary mt-0.5">{formatPhone(person.phone)}</p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <div onClick={(e) => e.stopPropagation()}>
            <TagBadgesCell person={person} allTags={allTags} />
          </div>
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
  allTags: Tag[]
  onView: (p: PersonWithStage) => void
  onEdit: (p: Person) => void
  onDelete: (p: Person) => void
  showBirthday?: boolean
}

function PersonRow({ person, allTags, onView, onEdit, onDelete, showBirthday }: PersonRowProps) {
  const bdayDay = showBirthday && person.birth_date
    ? new Date(person.birth_date + 'T00:00:00').getDate()
    : null

  return (
    <tr
      className="hover:bg-bg-hover transition-colors cursor-pointer"
      onClick={() => onView(person)}
    >
      <td className="px-4 py-3">
        <div>
          <div className="flex items-center gap-1.5">
            <p className="text-sm font-medium text-text-primary">{person.name ?? '—'}</p>
            {bdayDay !== null && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                🎂 dia {bdayDay}
              </span>
            )}
          </div>
          {person.email && (
            <p className="text-xs text-text-secondary">{person.email}</p>
          )}
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-text-secondary">
        {formatPhone(person.phone)}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <TagBadgesCell person={person} allTags={allTags} />
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

// ── BirthdayContactCard — linha compacta CRM de parabéns ────────────────────

interface BirthdayContactCardProps {
  person: PersonWithStage
  contact: BirthdayContact | null
  churchId: string
  monthRef: string
}

const MONTHS_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

function BirthdayContactCard({ person, contact, churchId, monthRef }: BirthdayContactCardProps) {
  const toggleContact = useToggleBirthdayContact()

  const bday      = person.birth_date ? new Date(person.birth_date + 'T00:00:00') : null
  const dayStr    = bday ? String(bday.getDate()).padStart(2, '0') : '?'
  const monthStr  = bday ? MONTHS_SHORT[bday.getMonth()] : '?'

  const isContacted  = Boolean(contact)
  const contactedAt  = contact?.contacted_at ? new Date(contact.contacted_at) : null
  const contactedLabel = contact && contactedAt
    ? `✓ Contatado por ${contact.contacted_by_name} · ${contactedAt.toLocaleDateString('pt-BR')} às ${contactedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
    : null

  // Número limpo para WhatsApp: remove não-dígitos, garante prefixo 55
  const waPhone = person.phone
    ? '55' + person.phone.replace(/\D/g, '').replace(/^55/, '')
    : null

  const handleToggle = () => {
    void toggleContact.mutateAsync({
      contactId: contact?.id ?? null,
      personId:  person.id,
      churchId,
      monthRef,
    })
  }

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all ${
        isContacted ? 'border-[#A8DEC9]' : 'bg-bg-primary border-border-default'
      }`}
      style={isContacted ? { backgroundColor: '#F0FBF7' } : undefined}
    >
      {/* 1. Quadradinho de data */}
      <div
        className="flex flex-col items-center justify-center rounded-[10px] shrink-0 select-none"
        style={{ width: 52, height: 52, backgroundColor: '#FAEEDA' }}
      >
        <span className="font-bold leading-none" style={{ fontSize: 20, color: '#854F0B' }}>
          {dayStr}
        </span>
        <span className="font-semibold uppercase leading-none mt-0.5" style={{ fontSize: 11, color: '#BA7517' }}>
          {monthStr}
        </span>
      </div>

      {/* 2. Nome + telefone + quem/quando (quando contatado) */}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-text-primary truncate" style={{ fontSize: 16 }}>
          {person.name ?? '—'}
        </p>
        {person.phone ? (
          <a
            href={`tel:${person.phone}`}
            className="truncate block hover:underline"
            style={{ fontSize: 14, color: '#2563EB' }}
            onClick={(e) => e.stopPropagation()}
          >
            {formatPhone(person.phone)}
          </a>
        ) : (
          <span className="text-text-tertiary" style={{ fontSize: 13 }}>Sem telefone</span>
        )}
        {isContacted && contactedLabel && (
          <p className="truncate mt-0.5" style={{ fontSize: 11, color: '#0F6E56' }}>
            {contactedLabel}
          </p>
        )}
      </div>

      {/* 3. Botão WhatsApp */}
      {waPhone && (
        <a
          href={`https://wa.me/${waPhone}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex items-center justify-center rounded-xl shrink-0 transition-opacity hover:opacity-80 active:opacity-60"
          style={{ width: 38, height: 38, backgroundColor: '#1D9E75' }}
          title="Abrir no WhatsApp"
        >
          {/* WhatsApp logo SVG inline */}
          <svg width="20" height="20" viewBox="0 0 32 32" fill="white" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 3C8.832 3 3 8.832 3 16c0 2.41.661 4.664 1.813 6.594L3 29l6.563-1.781A12.935 12.935 0 0016 29c7.168 0 13-5.832 13-13S23.168 3 16 3zm0 2c6.086 0 11 4.914 11 11s-4.914 11-11 11a10.94 10.94 0 01-5.594-1.531l-.375-.22-3.937 1.063 1.094-3.813-.25-.406A10.94 10.94 0 015 16C5 9.914 9.914 5 16 5zm-3.094 5.438c-.2 0-.527.074-.8.374-.274.3-1.044 1.02-1.044 2.485 0 1.465 1.067 2.883 1.215 3.083.149.2 2.067 3.227 5.075 4.398.71.277 1.261.44 1.692.567.71.21 1.356.18 1.867.11.57-.079 1.75-.716 2-1.4.248-.686.248-1.28.173-1.404-.074-.124-.273-.198-.57-.347-.298-.148-1.754-.867-2.027-.965-.273-.099-.473-.149-.672.149-.2.298-.77.966-.942 1.165-.173.2-.348.224-.645.075-.298-.15-1.254-.46-2.39-1.474-.882-.788-1.478-1.762-1.65-2.059-.173-.299-.018-.46.129-.606.133-.133.298-.347.446-.521.148-.174.198-.3.297-.499.1-.2.05-.372-.024-.52-.074-.15-.67-1.614-.918-2.21-.24-.578-.485-.499-.667-.509-.175-.008-.374-.01-.573-.01z"/>
          </svg>
        </a>
      )}

      {/* 4. Botão marcar/desmarcar contato */}
      <button
        onClick={handleToggle}
        disabled={toggleContact.isPending}
        className="shrink-0 flex items-center gap-1.5 font-medium rounded-xl transition-all active:scale-[0.97] disabled:opacity-60 whitespace-nowrap"
        style={{
          padding: '9px 16px',
          fontSize: 14,
          ...(isContacted
            ? { backgroundColor: '#E1F5EE', color: '#0F6E56', border: '1.5px solid #A8DEC9' }
            : { backgroundColor: '#BA7517', color: '#FFFFFF', border: '1.5px solid transparent' }),
        }}
      >
        {toggleContact.isPending ? (
          <span style={{ fontSize: 13 }}>...</span>
        ) : isContacted ? (
          <><Check size={14} strokeWidth={2.5} />Contatado</>
        ) : (
          <><Phone size={14} strokeWidth={2} />Marcar contato</>
        )}
      </button>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function People() {
  const { churchId } = useAuth()
  const navigate      = useNavigate()
  const queryClient   = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const validTabs: PeopleTab[] = ['geral', 'aniversarios', 'novos', 'convertidos', 'lideres', 'em-risco']
  const tabParam = searchParams.get('tab') as PeopleTab | null
  const [activeTab, setActiveTab] = useState<PeopleTab>(
    tabParam && validTabs.includes(tabParam) ? tabParam : 'geral'
  )

  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabParam])
  const [search, setSearch]         = useState('')
  const [tagFilter, setTagFilter]   = useState<string>('')     // tag id ou '' = todos
  const [tagDropOpen, setTagDropOpen] = useState(false)
  const [unitFilter, setUnitFilter] = useState<string>('')     // unit id | 'none' | ''
  const [unitDropOpen, setUnitDropOpen] = useState(false)
  const [currentPage, setCurrentPage] = useState(0)           // A1: paginação
  const [modalOpen, setModalOpen]   = useState(false)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [editingPerson, setEditingPerson]   = useState<Person | null>(null)
  const [deletingId, setDeletingId]         = useState<string | null>(null)
  const [personToDelete, setPersonToDelete] = useState<Person | null>(null) // A2: modal
  const [deleteError, setDeleteError]       = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<PersonWithStage | null>(null)
  type DateFilter = '7' | '15' | '30' | 'custom' | 'all'
  const [dateFilter, setDateFilter] = useState<DateFilter>('7')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  // A1: tabs filtradas carregam tudo (client-side); geral pagina no servidor
  // Aniversários: filtro no servidor via birth_month (coluna gerada) — retorna todos do mês
  const isFilteredTab  = activeTab !== 'geral'
  const isBirthdayTab  = activeTab === 'aniversarios'
  const now            = new Date()
  const currentMonth   = now.getMonth() + 1  // 1-12
  const monthRef       = `${now.getFullYear()}-${String(currentMonth).padStart(2, '0')}`
  const { data: people, isLoading, isError, refetch } = usePeople(churchId ?? '', {
    search,
    page:       isFilteredTab ? 0 : currentPage,
    pageSize:   isFilteredTab ? 500 : PEOPLE_PAGE_SIZE,
    unitId:     unitFilter || undefined,
    birthMonth: isBirthdayTab ? currentMonth : undefined,
  })
  const { data: totalCount } = usePeopleCount(churchId ?? '')
  const { data: allTags = [] } = useTags(churchId ?? '')
  const { data: churchUnits = [] } = useChurchUnits(churchId ?? '')
  const deletePerson = useDeletePerson()
  // Contatos de aniversário do mês — só carrega quando na aba Aniversários
  const { data: contactsData = [] } = useBirthdayContacts(
    isBirthdayTab ? (churchId ?? '') : '',
    monthRef,
  )
  const contactByPerson = useMemo(
    () => new Map(contactsData.map((c) => [c.person_id, c])),
    [contactsData],
  )

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

  const allPeople = (people ?? []).filter((p) => !deletingId || p.id !== deletingId)
  const tabFiltered = applyTabFilter(activeTab, allPeople)
  // Filtro por tag (client-side — person_tags já vem no payload)
  const tagFiltered = tagFilter
    ? tabFiltered.filter((p) =>
        (p.person_tags ?? []).some((pt) => pt.tag_id === tagFilter)
      )
    : tabFiltered
  // Filtro por data de cadastro (apenas na aba novos)
  const filteredPeople = useMemo(() => {
    if (activeTab !== 'novos') return tagFiltered
    if (dateFilter === 'all') return tagFiltered
    if (dateFilter === 'custom') {
      const from = customFrom ? new Date(customFrom + 'T00:00:00') : null
      const to   = customTo   ? new Date(customTo   + 'T23:59:59') : null
      return tagFiltered.filter(p => {
        const d = p.created_at ? new Date(p.created_at) : null
        if (!d) return false
        if (from && d < from) return false
        if (to   && d > to)   return false
        return true
      })
    }
    const days = parseInt(dateFilter, 10)
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
    return tagFiltered.filter(p => p.created_at && new Date(p.created_at) >= cutoff)
  }, [activeTab, tagFiltered, dateFilter, customFrom, customTo])

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
            onClick={() => { setActiveTab(tab.id); setSearch(''); setCurrentPage(0); setSearchParams(tab.id === 'geral' ? {} : { tab: tab.id }) }}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary text-primary-text'
                : 'border-transparent text-text-secondary active:text-text-primary'
            }`}
          >
            {tab.id === 'aniversarios' && <Gift size={13} strokeWidth={2} />}
            {tab.label}
            {people && tab.id !== 'geral' && (
              <span
                className={`px-1.5 py-0.5 rounded-full font-semibold ${
                  activeTab === tab.id
                    ? 'bg-bg-hover text-primary-text'
                    : 'bg-bg-hover text-text-tertiary'
                }`}
                style={{ fontSize: '10px' }}
              >
                {applyTabFilter(tab.id, allPeople).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Filtro de período — aba Novos Visitantes */}
      {activeTab === 'novos' && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {(['7', '15', '30', 'all'] as const).map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setDateFilter(opt)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                dateFilter === opt
                  ? 'bg-primary-text text-white border-primary-text'
                  : 'bg-white text-text-secondary border-border-default hover:bg-bg-hover'
              }`}
            >
              {opt === 'all' ? 'Todos' : `Últimos ${opt} dias`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setDateFilter('custom')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              dateFilter === 'custom'
                ? 'bg-primary-text text-white border-primary-text'
                : 'bg-white text-text-secondary border-border-default hover:bg-bg-hover'
            }`}
          >
            Personalizado
          </button>
          {dateFilter === 'custom' && (
            <div className="flex items-center gap-2 mt-1 w-full sm:w-auto sm:mt-0">
              <input
                type="date"
                value={customFrom}
                onChange={e => setCustomFrom(e.target.value)}
                className="px-2 py-1.5 rounded-xl border border-border-default text-xs text-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-text-tertiary">até</span>
              <input
                type="date"
                value={customTo}
                onChange={e => setCustomTo(e.target.value)}
                className="px-2 py-1.5 rounded-xl border border-border-default text-xs text-text-primary bg-white focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          )}
        </div>
      )}

      {/* Busca + Filtros */}
      {activeTab === 'geral' && (
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(0) }}
            className="w-full md:max-w-sm"
          />

          {/* Filtro por tag (só aparece se há flags criadas) */}
          {allTags.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setTagDropOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default bg-white text-sm text-text-secondary hover:bg-bg-hover transition-colors"
              >
                <span
                  className="h-2 w-2 rounded-full shrink-0"
                  style={{
                    backgroundColor: tagFilter
                      ? (allTags.find((t) => t.id === tagFilter)?.color ?? '#6B7280')
                      : '#d1d5db',
                  }}
                />
                {tagFilter
                  ? allTags.find((t) => t.id === tagFilter)?.name
                  : 'Todos os tipos'}
                <ChevronDown size={12} className={`transition-transform ${tagDropOpen ? 'rotate-180' : ''}`} />
              </button>

              {tagDropOpen && (
                <ul className="absolute left-0 top-full mt-1 z-30 bg-white rounded-xl border border-border-default shadow-lg py-1" style={{ minWidth: '160px' }}>
                  <li>
                    <button
                      type="button"
                      onClick={() => { setTagFilter(''); setTagDropOpen(false); setCurrentPage(0) }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${!tagFilter ? 'font-semibold text-text-primary bg-bg-hover' : 'text-text-secondary hover:bg-bg-hover'}`}
                    >
                      Todos os tipos
                    </button>
                  </li>
                  {allTags.map((tag) => (
                    <li key={tag.id}>
                      <button
                        type="button"
                        onClick={() => { setTagFilter(tag.id); setTagDropOpen(false); setCurrentPage(0) }}
                        className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition-colors ${tagFilter === tag.id ? 'font-semibold bg-bg-hover' : 'hover:bg-bg-hover'}`}
                      >
                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                        <span className="flex-1">{tag.name}</span>
                        {tagFilter === tag.id && <span className="text-text-tertiary" style={{ fontSize: '10px' }}>✓</span>}
                      </button>
                    </li>
                  ))}
                  <li className="border-t border-border-default mt-1 pt-1">
                    <button
                      type="button"
                      onClick={() => { setTagDropOpen(false); navigate('/pessoas/flags') }}
                      className="w-full text-left px-3 py-2 text-xs text-text-tertiary hover:text-text-secondary flex items-center gap-1.5 transition-colors"
                    >
                      <Settings2 size={11} />
                      Gerenciar tipos
                    </button>
                  </li>
                </ul>
              )}
            </div>
          )}

          {/* Filtro por unidade (só aparece se há unidades cadastradas) */}
          {churchUnits.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUnitDropOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default bg-white text-sm text-text-secondary hover:bg-bg-hover transition-colors"
              >
                {unitFilter
                  ? unitFilter === 'none'
                    ? 'Não definida'
                    : (churchUnits.find((u) => u.id === unitFilter)?.name ?? 'Unidade')
                  : 'Todas as unidades'}
                <ChevronDown size={12} className={`transition-transform ${unitDropOpen ? 'rotate-180' : ''}`} />
              </button>

              {unitDropOpen && (
                <ul className="absolute left-0 top-full mt-1 z-30 bg-white rounded-xl border border-border-default shadow-lg py-1" style={{ minWidth: '180px' }}>
                  <li>
                    <button
                      type="button"
                      onClick={() => { setUnitFilter(''); setUnitDropOpen(false); setCurrentPage(0) }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${!unitFilter ? 'font-semibold text-text-primary bg-bg-hover' : 'text-text-secondary hover:bg-bg-hover'}`}
                    >
                      Todas as unidades
                    </button>
                  </li>
                  {churchUnits.map((unit) => (
                    <li key={unit.id}>
                      <button
                        type="button"
                        onClick={() => { setUnitFilter(unit.id); setUnitDropOpen(false); setCurrentPage(0) }}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${unitFilter === unit.id ? 'font-semibold bg-bg-hover' : 'hover:bg-bg-hover'}`}
                      >
                        {unit.name}
                        {unitFilter === unit.id && <span className="ml-2 text-text-tertiary" style={{ fontSize: '10px' }}>✓</span>}
                      </button>
                    </li>
                  ))}
                  <li>
                    <button
                      type="button"
                      onClick={() => { setUnitFilter('none'); setUnitDropOpen(false); setCurrentPage(0) }}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${unitFilter === 'none' ? 'font-semibold bg-bg-hover' : 'text-text-secondary hover:bg-bg-hover'}`}
                    >
                      Não definida
                      {unitFilter === 'none' && <span className="ml-2 text-text-tertiary" style={{ fontSize: '10px' }}>✓</span>}
                    </button>
                  </li>
                </ul>
              )}
            </div>
          )}
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
          {/* ── Birthday CRM: cabeçalho de progresso ────────────────────── */}
          {isBirthdayTab && (
            <div className="space-y-1.5 px-0.5">
              <div className="flex items-center justify-between">
                <p className="font-medium text-text-secondary" style={{ fontSize: 14 }}>
                  Aniversariantes de {now.toLocaleString('pt-BR', { month: 'long' })}
                </p>
                <span className="font-semibold text-text-secondary" style={{ fontSize: 13 }}>
                  {contactsData.length} de {filteredPeople.length} contatados
                </span>
              </div>
              <div className="rounded-full overflow-hidden bg-bg-hover" style={{ height: 6 }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: filteredPeople.length > 0
                      ? `${(contactsData.length / filteredPeople.length) * 100}%`
                      : '0%',
                    backgroundColor: '#1D9E75',
                  }}
                />
              </div>
            </div>
          )}

          {/* ── Birthday CRM: lista compacta ─────────────────────────────── */}
          {isBirthdayTab ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filteredPeople.map((person) => (
                <BirthdayContactCard
                  key={person.id}
                  person={person}
                  contact={contactByPerson.get(person.id) ?? null}
                  churchId={churchId!}
                  monthRef={monthRef}
                />
              ))}
            </div>
          ) : (
            <>
              {/* ── Mobile: cards ─────────────────────────────────── */}
              <div className="md:hidden space-y-2">
                {filteredPeople.map((person) => (
                  <PersonCardMobile
                    key={person.id}
                    person={person}
                    allTags={allTags}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    showBirthday={false}
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
                        <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Tipos</th>
                        <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Cadastro</th>
                        <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                      {filteredPeople.map((person) => (
                        <PersonRow
                          key={person.id}
                          person={person}
                          allTags={allTags}
                          onView={handleView}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          showBirthday={false}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
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
