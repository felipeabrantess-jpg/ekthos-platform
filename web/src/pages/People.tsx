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
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { Pencil, Trash2, Gift, QrCode, ChevronLeft, ChevronRight, Upload, Check, Phone, Heart, Download } from 'lucide-react'
import ModalPortal from '@/components/ui/ModalPortal'
import { useDeletePerson } from '@/features/people/hooks/usePeople'
import {
  usePeoplePage, usePeopleStageCounts, fetchPeoplePage, PEOPLE_PAGE_SIZE, STAGE_KEY_NONE,
  type PeoplePageFilters,
} from '@/features/people/hooks/usePeoplePage'
import { useUnit } from '@/contexts/UnitContext'
import { useBirthdayContacts, useToggleBirthdayContact, type BirthdayContact } from '@/features/people/hooks/useBirthdayContacts'
import { useTags } from '@/features/people/hooks/useTags'
import { useAcolhimentoStatus, getCareStatusBadge } from '@/features/people/hooks/useAcolhimentoStatus'
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

/** 'geral' | 'aniversarios' | 'stage:<pipeline_stages.stage_key>' (fonte canônica) */
type PeopleTab = 'geral' | 'aniversarios' | `stage:${string}`
type CareFilter = '' | 'nao_atendida' | 'em_atendimento' | 'atendida' | 'sem_contato_48h'

// ── Helpers ─────────────────────────────────────────────────────────────────

function displayName(name: string | null | undefined, phone: string | null | undefined): string {
  if (name) return name
  if (phone) return `Visitante · ${formatPhone(phone)}`
  return 'Visitante sem nome'
}

function formatPhone(phone: string | null) {
  if (!phone) return '—'
  return phone.replace(/^\+55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}

function formatDate(date: string | null) {
  if (!date) return '—'
  return new Intl.DateTimeFormat('pt-BR').format(new Date(date))
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
  onAtend: (p: PersonWithStage) => void
  showBirthday?: boolean
  showCareBadge?: boolean
}

function PersonCardMobile({ person, allTags, onView, onEdit, onDelete, onAtend, showBirthday, showCareBadge }: PersonCardMobileProps) {
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
          {/* Avatar: foto se disponível, inicial como fallback */}
          {(person as any).avatar_url ? (
            <img
              src={(person as any).avatar_url}
              alt={person.name ?? ''}
              className="h-10 w-10 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
              style={{ background: 'var(--church-primary, var(--color-primary))' }}
            >
              {(person.name ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-sm font-semibold text-text-primary truncate">{displayName(person.name, person.phone)}</p>
              {bdayDay !== null && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                  🎂 dia {bdayDay}
                </span>
              )}
              {showCareBadge && (() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const journeys = (person as any).acolhimento_journey as Array<{ status: string }> | null
                const badge = getCareStatusBadge(journeys)
                if (!badge) return null
                return (
                  <span
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ color: badge.color, backgroundColor: badge.bg }}
                  >
                    {badge.label}
                  </span>
                )
              })()}
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
              onClick={() => onAtend(person)}
              className="p-2 rounded-lg text-text-tertiary active:text-primary active:bg-bg-hover transition-all"
              title="Atender"
            >
              <Heart size={15} strokeWidth={1.75} />
            </button>
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
  onAtend: (p: PersonWithStage) => void
  showBirthday?: boolean
  showCareBadge?: boolean
  /** undefined = coluna oculta; null = ainda carregando */
  contactCount?: number | null
}

function PersonRow({ person, allTags, onView, onEdit, onDelete, onAtend, showBirthday, showCareBadge, contactCount }: PersonRowProps) {
  const bdayDay = showBirthday && person.birth_date
    ? new Date(person.birth_date + 'T00:00:00').getDate()
    : null

  return (
    <tr
      className="hover:bg-bg-hover transition-colors cursor-pointer"
      onClick={() => onView(person)}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {(person as any).avatar_url ? (
            <img
              src={(person as any).avatar_url}
              alt={person.name ?? ''}
              className="h-8 w-8 rounded-full object-cover shrink-0"
            />
          ) : (
            <div
              className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white"
              style={{ background: 'var(--church-primary, var(--color-primary))' }}
            >
              {(person.name ?? '?').charAt(0).toUpperCase()}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium text-text-primary">{displayName(person.name, person.phone)}</p>
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
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-text-secondary">
        {formatPhone(person.phone)}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <TagBadgesCell person={person} allTags={allTags} />
      </td>
      {showCareBadge && (
        <td className="px-4 py-3">
          {(() => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const journeys = (person as any).acolhimento_journey as Array<{ status: string }> | null
            const badge = getCareStatusBadge(journeys)
            if (!badge) return <span className="text-xs text-text-tertiary">—</span>
            return (
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: badge.bg, color: badge.color }}
              >
                {badge.label}
              </span>
            )
          })()}
        </td>
      )}
      {contactCount !== undefined && (
        <td className="px-4 py-3 text-center">
          {contactCount === null ? (
            <span className="text-xs text-text-tertiary">…</span>
          ) : contactCount === 0 ? (
            <span className="text-xs text-text-tertiary">—</span>
          ) : (
            // Visão rápida da sequência de atendimento pastoral: a quantidade REAL de
            // pastoral_contact (get_contact_counts) apresentada como ordinal — "Nº contato".
            <span
              className="inline-flex items-center justify-center h-6 px-2 rounded-full text-xs font-semibold tabular-nums whitespace-nowrap"
              style={{ backgroundColor: '#E1F5EE', color: '#0F6E56' }}
              title={`${contactCount} contato${contactCount === 1 ? '' : 's'} pastoral${contactCount === 1 ? '' : 'is'} formalizado${contactCount === 1 ? '' : 's'} — próximo: ${contactCount + 1}º`}
              data-testid="contatos-ordinal"
            >
              {contactCount}º contato
            </span>
          )}
        </td>
      )}
      <td className="px-4 py-3 text-sm text-text-secondary">
        {formatDate(person.created_at)}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onAtend(person)}
            title="Atender"
            className="p-1.5 rounded-lg text-text-tertiary hover:text-primary hover:bg-bg-hover transition-all"
          >
            <Heart size={14} strokeWidth={1.75} />
          </button>
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
  onNameClick: (person: PersonWithStage) => void
}

const MONTHS_SHORT = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

function BirthdayContactCard({ person, contact, churchId, monthRef, onNameClick }: BirthdayContactCardProps) {
  const toggleContact = useToggleBirthdayContact()
  const stage = person.person_pipeline?.[0]?.pipeline_stages ?? null

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

      {/* 2. Nome + estágio + telefone + quem/quando (quando contatado) */}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => onNameClick(person)}
          className="font-medium text-text-primary hover:text-brand-600 truncate text-left w-full transition-colors leading-tight"
          style={{ fontSize: 16 }}
        >
          {displayName(person.name, person.phone)}
        </button>
        {stage && (
          <span
            className="inline-block text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap mt-0.5"
            style={{
              backgroundColor: stage.color ? `${stage.color}22` : 'rgba(0,0,0,0.07)',
              color:           stage.color ?? '#5A5A5A',
            }}
          >
            {stage.name}
          </span>
        )}
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

/** Aliases de URL antigos (?tab=convertidos etc.) → stage_key canônico */
const LEGACY_TAB_ALIASES: Record<string, string> = {
  novos:       'visitante',
  convertidos: 'novo_convertido',
  membros:     'membro',
  lideres:     'lider',
}

function tabToStageKey(tab: PeopleTab): string | undefined {
  return tab.startsWith('stage:') ? tab.slice('stage:'.length) : undefined
}

export default function People() {
  const { churchId } = useAuth()
  const { selectedUnit, units: churchUnits, isLoading: unitLoading } = useUnit()
  const navigate                        = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient                     = useQueryClient()

  // ── Aba: 'geral' | 'aniversarios' | 'stage:<stage_key>' (URL ?tab=) ─────
  const rawTab = searchParams.get('tab')
  const initialTab: PeopleTab = (() => {
    if (!rawTab || rawTab === 'geral') return 'geral'
    if (rawTab === 'aniversarios') return 'aniversarios'
    const key = LEGACY_TAB_ALIASES[rawTab] ?? rawTab.replace(/^stage:/, '')
    return `stage:${key}`
  })()
  const [activeTab, setActiveTabState] = useState<PeopleTab>(initialTab)
  const activeStageKey = tabToStageKey(activeTab)
  const isBirthdayTab  = activeTab === 'aniversarios'
  const isGeralTab     = activeTab === 'geral'

  function setActiveTab(tab: PeopleTab) {
    setActiveTabState(tab)
    setSearch('')
    setCurrentPage(0)
    setSearchParams(prev => {
      const next = new URLSearchParams(prev)
      const key = tabToStageKey(tab)
      next.set('tab', key ?? tab)
      return next
    }, { replace: true })
  }

  // ── Filtros cumulativos (todos server-side) ──────────────────────────────
  const [search, setSearch]             = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('')
  const [careFilter, setCareFilter]     = useState<CareFilter>('')
  const [createdFrom, setCreatedFrom]   = useState('')
  const [createdTo, setCreatedTo]       = useState('')
  const [currentPage, setCurrentPage]   = useState(0)

  type DateFilter = '7' | '15' | '30' | 'custom' | 'all'
  const validPeriodos: DateFilter[] = ['7', '15', '30', 'custom', 'all']
  const periodoParam = searchParams.get('periodo') as DateFilter | null
  const [dateFilter, setDateFilter] = useState<DateFilter>(
    periodoParam && validPeriodos.includes(periodoParam) ? periodoParam :
    activeStageKey === 'visitante' ? '30' : 'all'
  )
  // Período (só etapa visitante): converte em intervalo de cadastro
  const periodRange = useMemo(() => {
    if (activeStageKey !== 'visitante' || dateFilter === 'all') return { from: '', to: '' }
    if (dateFilter === 'custom') return { from: createdFrom, to: createdTo }
    const d = new Date(Date.now() - parseInt(dateFilter, 10) * 24 * 60 * 60 * 1000)
    return { from: d.toISOString().split('T')[0], to: '' }
  }, [activeStageKey, dateFilter, createdFrom, createdTo])

  // ── Modais / seleção ─────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]             = useState(false)
  const [qrModalOpen, setQrModalOpen]         = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [editingPerson, setEditingPerson]     = useState<Person | null>(null)
  const [deletingId, setDeletingId]           = useState<string | null>(null)
  const [personToDelete, setPersonToDelete]   = useState<Person | null>(null)
  const [deleteError, setDeleteError]         = useState<string | null>(null)
  const [selectedPerson, setSelectedPerson]   = useState<PersonWithStage | null>(null)

  const now          = new Date()
  const currentMonth = now.getMonth() + 1
  const monthRef     = `${now.getFullYear()}-${String(currentMonth).padStart(2, '0')}`

  // ── ÚNICA query de lista + contador ──────────────────────────────────────
  const pageFilters: PeoplePageFilters = {
    unit:        selectedUnit,
    stageKey:    activeStageKey,
    careStatus:  careFilter || undefined,
    source:      sourceFilter || undefined,
    search:      search || undefined,
    birthMonth:  isBirthdayTab ? currentMonth : undefined,
    createdFrom: (activeStageKey === 'visitante' ? periodRange.from : createdFrom) || undefined,
    createdTo:   (activeStageKey === 'visitante' ? periodRange.to   : createdTo)   || undefined,
    page:        currentPage,
    pageSize:    isBirthdayTab ? 500 : PEOPLE_PAGE_SIZE,
  }
  const { data: pageData, isLoading: pageLoading, isError, refetch } =
    usePeoplePage(churchId ?? '', pageFilters, !unitLoading)
  const isLoading = unitLoading || pageLoading
  const items = useMemo(() => (pageData?.items ?? []).filter(p => !deletingId || p.id !== deletingId), [pageData, deletingId])
  const total = pageData?.total ?? 0

  // Badges das abas — mesmos predicados (unidade, deleted, left_at) da lista
  const { data: stageCounts } = usePeopleStageCounts(churchId ?? '', selectedUnit)
  const { data: careStatusData } = useAcolhimentoStatus(churchId ?? '', selectedUnit)
  const { data: allTags = [] } = useTags(churchId ?? '')
  const deletePerson = useDeletePerson()

  const tabs = useMemo(() => {
    const list: { id: PeopleTab; label: string; count: number | null }[] = [
      { id: 'geral',        label: 'Visão geral',  count: stageCounts?.total ?? null },
      { id: 'aniversarios', label: 'Aniversários', count: stageCounts?.aniversarios ?? null },
    ]
    for (const s of stageCounts?.stages ?? []) {
      if (!s.stage_key) continue
      list.push({ id: `stage:${s.stage_key}`, label: s.name, count: s.cnt })
    }
    list.push({ id: `stage:${STAGE_KEY_NONE}`, label: 'Sem etapa', count: stageCounts?.sem_etapa ?? null })
    return list
  }, [stageCounts])
  const activeTabLabel = tabs.find(t => t.id === activeTab)?.label ?? 'Pessoas'

  // Nº de contatos pastorais por pessoa (ids da página atual)
  const visibleIds = useMemo(() => items.map(p => p.id), [items])
  const { data: contactCounts } = useQuery({
    queryKey: ['contact-counts', churchId, visibleIds],
    enabled:  !!churchId && visibleIds.length > 0,
    staleTime: 30_000,
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)('get_contact_counts', {
        p_church_id: churchId, p_person_ids: visibleIds,
      })
      if (error) throw error
      const map = new Map<string, number>()
      for (const r of (data ?? []) as Array<{ person_id: string; cnt: number }>) map.set(r.person_id, Number(r.cnt))
      return map
    },
  })

  // Contatos de aniversário do mês — só na aba Aniversários
  const { data: contactsData = [] } = useBirthdayContacts(isBirthdayTab ? (churchId ?? '') : '', monthRef)
  const contactByPerson = useMemo(() => new Map(contactsData.map((c) => [c.person_id, c])), [contactsData])
  const contactedInList = useMemo(() => items.filter(p => contactByPerson.has(p.id)).length, [items, contactByPerson])

  // Abre painel de detalhe quando URL tem ?person=UUID (notificação in-app)
  useEffect(() => {
    const personParam = searchParams.get('person')
    if (!personParam || items.length === 0) return
    const found = items.find(p => p.id === personParam)
    if (found) {
      setSelectedPerson(found)
      setSearchParams(prev => { const next = new URLSearchParams(prev); next.delete('person'); return next }, { replace: true })
    }
  }, [searchParams, items, setSearchParams])

  // Troca de unidade global → volta à primeira página
  useEffect(() => { setCurrentPage(0) }, [selectedUnit])

  function invalidatePeople() {
    void queryClient.invalidateQueries({ queryKey: ['people-page', churchId] })
    void queryClient.invalidateQueries({ queryKey: ['people-stage-counts', churchId] })
    void queryClient.invalidateQueries({ queryKey: ['acolhimento-status-counts', churchId] })
  }

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  function handleView(person: PersonWithStage)  { setSelectedPerson(person) }
  function handleEdit(person: Person)           { setEditingPerson(person); setModalOpen(true) }
  function handleNewPerson()                    { setEditingPerson(null); setModalOpen(true) }
  function handleAtend(person: PersonWithStage) { navigate(`/pessoas/${person.id}/atendimento`) }
  function handleDelete(person: Person)         { setPersonToDelete(person); setDeleteError(null) }

  async function confirmDelete() {
    if (!personToDelete) return
    setDeletingId(personToDelete.id)
    setDeleteError(null)
    try {
      await deletePerson.mutateAsync({ id: personToDelete.id, churchId: churchId! })
      setPersonToDelete(null)
      invalidatePeople()
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Erro ao excluir. Tente novamente.')
    } finally {
      setDeletingId(null)
    }
  }

  // CSV: mesmo universo da lista (todos os filtros), sem paginação
  async function exportCsv() {
    const { items: all } = await fetchPeoplePage(churchId!, { ...pageFilters, page: 0, pageSize: 5000 })
    const header = ['Nome', 'Telefone', 'Email', 'Etapa', 'Atendimento', 'Unidade', 'Primeira visita', 'Cadastro', 'Origem']
    const rows = all.map(p => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const anyP = p as any
      const badge = getCareStatusBadge(anyP.acolhimento_journey as Array<{ status: string }> | null)
      const unitName = churchUnits.find(u => u.id === anyP.unit_id)?.name ?? ''
      return [
        p.name ?? '', p.phone ?? '', p.email ?? '',
        p.person_pipeline?.[0]?.pipeline_stages?.name ?? '',
        badge?.label ?? 'Não atendida', unitName,
        anyP.first_visit_date ?? '', formatDate(p.created_at), anyP.source ?? '',
      ]
    })
    const csv = [header, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'pessoas.csv'; a.click(); URL.revokeObjectURL(url)
  }

  const pageSize   = isBirthdayTab ? 500 : PEOPLE_PAGE_SIZE
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const showPagination = total > pageSize
  const showFilters = !isBirthdayTab

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-text-primary">Pessoas</h1>
          <p className="text-xs md:text-sm text-text-secondary mt-1">
            {pageData
              ? `${total.toLocaleString('pt-BR')} ${total === 1 ? 'pessoa' : 'pessoas'}${!isGeralTab ? ` · ${activeTabLabel}` : ''}`
              : 'Carregando...'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setQrModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default bg-bg-hover text-primary-text text-sm font-medium hover:bg-bg-hover transition-colors"
          >
            <QrCode size={15} strokeWidth={1.75} />
            <span className="hidden sm:inline">QR de Entrada</span>
          </button>
          <button
            onClick={() => setImportModalOpen(true)}
            className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default bg-bg-hover text-primary-text text-sm font-medium hover:bg-bg-hover transition-colors"
          >
            <Upload size={15} strokeWidth={1.75} />
            Importar
          </button>
          <Button onClick={handleNewPerson} className="hidden md:inline-flex">+ Nova Pessoa</Button>
        </div>
      </div>

      {/* ── Abas (Visão geral, Aniversários, etapas do pipeline, Sem etapa) ── */}
      <div className="flex gap-1 border-b border-border-default -mb-2 overflow-x-auto scrollbar-none pb-px">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-primary text-primary-text'
                : 'border-transparent text-text-secondary active:text-text-primary'
            }`}
          >
            {tab.id === 'aniversarios' && <Gift size={13} strokeWidth={2} />}
            {tab.label}
            {tab.count !== null && (
              <span
                className={`px-1.5 py-0.5 rounded-full font-semibold tabular-nums ${
                  activeTab === tab.id ? 'bg-bg-hover text-primary-text' : 'bg-bg-hover text-text-tertiary'
                }`}
                style={{ fontSize: '10px' }}
              >
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Período — só etapa Visitante */}
      {activeStageKey === 'visitante' && (
        <div className="flex flex-wrap items-center gap-2">
          {(['all', '7', '15', '30'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => { setDateFilter(v as DateFilter); setCurrentPage(0) }}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border transition-colors ${
                dateFilter === v ? 'border-primary text-primary-text bg-bg-hover' : 'border-border-default text-text-secondary hover:text-text-primary bg-bg-hover'
              }`}
              style={dateFilter === v ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}}
            >
              {v === 'all' ? 'Todos' : `${v} dias`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { setDateFilter('custom'); setCurrentPage(0) }}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border border-border-default bg-bg-hover transition-colors ${
              dateFilter === 'custom' ? 'text-primary-text' : 'text-text-secondary hover:text-text-primary'
            }`}
            style={dateFilter === 'custom' ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}}
          >
            Personalizado
          </button>
        </div>
      )}

      {/* Linha de filtros: busca + tipo + origem + cadastro + CSV */}
      {showFilters && (
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(0) }}
            className="w-full md:max-w-sm"
          />

          <select
            value={sourceFilter}
            onChange={e => { setSourceFilter(e.target.value); setCurrentPage(0) }}
            className="px-3 py-2 rounded-xl border border-border-default bg-white text-sm text-text-secondary hover:bg-bg-hover transition-colors"
          >
            <option value="">Todas as origens</option>
            <option value="qr_code">QR Code</option>
            <option value="manual">Manual</option>
            <option value="import_xlsx">Importação</option>
          </select>

          {(activeStageKey !== 'visitante' || dateFilter === 'custom') && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-text-tertiary whitespace-nowrap">Cadastro:</span>
              <input
                type="date"
                value={createdFrom}
                onChange={e => { setCreatedFrom(e.target.value); setCurrentPage(0) }}
                className="px-2 py-1.5 rounded-xl text-sm border border-border-default bg-white text-text-secondary"
                title="Data de cadastro — início"
              />
              <span className="text-text-tertiary text-xs">–</span>
              <input
                type="date"
                value={createdTo}
                onChange={e => { setCreatedTo(e.target.value); setCurrentPage(0) }}
                className="px-2 py-1.5 rounded-xl text-sm border border-border-default bg-white text-text-secondary"
                title="Data de cadastro — fim"
              />
              {(createdFrom || createdTo) && (
                <button
                  type="button"
                  onClick={() => { setCreatedFrom(''); setCreatedTo(''); setCurrentPage(0) }}
                  className="text-xs text-text-tertiary hover:text-text-primary px-1.5 py-1 rounded-lg hover:bg-bg-hover transition-colors"
                  title="Limpar filtro de data"
                >
                  ✕
                </button>
              )}
            </div>
          )}

          {total > 0 && (
            <button
              type="button"
              onClick={() => void exportCsv()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border-default bg-white text-sm text-text-secondary hover:bg-bg-hover transition-colors"
            >
              <Download size={13} strokeWidth={1.75} />
              CSV
            </button>
          )}
        </div>
      )}

      {/* Filtro de atendimento — contadores no mesmo escopo de unidade da lista */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-text-tertiary uppercase tracking-wide">Atendimento:</span>
          {([
            { value: '', label: 'Todos' },
            { value: 'nao_atendida',    label: `Não atendida (${careStatusData?.naoAtendida   ?? '…'})` },
            { value: 'em_atendimento',  label: `Em atendimento (${careStatusData?.emAtendimento ?? '…'})` },
            { value: 'atendida',        label: `Atendida (${careStatusData?.atendida       ?? '…'})` },
            { value: 'sem_contato_48h', label: `Sem contato +48h (${careStatusData?.semContato48h ?? '…'})` },
          ] as const).map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { setCareFilter(opt.value as CareFilter); setCurrentPage(0) }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                careFilter === opt.value ? 'border-primary text-primary-text bg-bg-hover' : 'border-border-default text-text-secondary bg-white hover:bg-bg-hover'
              }`}
              style={careFilter === opt.value ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Loading / Error / Empty / Lista ─────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : items.length === 0 ? (
        <div className="bg-bg-primary rounded-2xl border border-border-default shadow-sm overflow-hidden">
          <EmptyState
            title={search ? 'Nenhuma pessoa encontrada' : isBirthdayTab ? 'Nenhum aniversariante este mês' : `Nenhuma pessoa em "${activeTabLabel}"`}
            description={search ? 'Tente buscar por outro nome ou telefone.' : 'Ajuste os filtros ou a unidade selecionada no topo da página.'}
            action={isGeralTab && !search ? <Button onClick={handleNewPerson}>+ Nova Pessoa</Button> : undefined}
          />
        </div>
      ) : (
        <>
          {isGeralTab && !careFilter && careStatusData && (
            <div
              className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors"
              onClick={() => { setCareFilter('sem_contato_48h'); setCurrentPage(0) }}
            >
              <div>
                <p className="text-sm font-semibold text-amber-800">Entrou e ninguém falou</p>
                <p className="text-xs text-amber-600 mt-0.5">Pessoas cadastradas há mais de 48h sem nenhum contato registrado</p>
              </div>
              <span className="text-xs font-medium text-amber-700 shrink-0">Ver lista →</span>
            </div>
          )}

          {isBirthdayTab && (
            <div className="space-y-1.5 px-0.5">
              <div className="flex items-center justify-between">
                <p className="font-medium text-text-secondary" style={{ fontSize: 14 }}>
                  Aniversariantes de {now.toLocaleString('pt-BR', { month: 'long' })}
                </p>
                <span className="font-semibold text-text-secondary" style={{ fontSize: 13 }}>
                  {contactedInList} de {items.length} contatados
                </span>
              </div>
              <div className="rounded-full overflow-hidden bg-bg-hover" style={{ height: 6 }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: items.length > 0 ? `${(contactedInList / items.length) * 100}%` : '0%', backgroundColor: '#1D9E75' }}
                />
              </div>
            </div>
          )}

          {isBirthdayTab ? (
            <div className="flex flex-col gap-2 max-w-lg">
              {items.map((person) => (
                <BirthdayContactCard
                  key={person.id}
                  person={person}
                  contact={contactByPerson.get(person.id) ?? null}
                  churchId={churchId!}
                  monthRef={monthRef}
                  onNameClick={(p) => handleEdit(p as Person)}
                />
              ))}
            </div>
          ) : (
            <>
              <div className="md:hidden space-y-2">
                {items.map((person) => (
                  <PersonCardMobile
                    key={person.id}
                    person={person}
                    allTags={allTags}
                    onView={handleView}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onAtend={handleAtend}
                    showBirthday={false}
                    showCareBadge
                  />
                ))}
              </div>

              <div className="hidden md:block bg-bg-primary rounded-2xl border border-border-default shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-bg-hover border-b border-border-default">
                        <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Nome</th>
                        <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Telefone</th>
                        <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Tipos</th>
                        <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Atendimento</th>
                        <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest text-center" title="Contatos pastorais registrados">Contatos</th>
                        <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Cadastro</th>
                        <th className="px-4 py-3 text-xs font-semibold text-text-secondary uppercase tracking-widest">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                      {items.map((person) => (
                        <PersonRow
                          key={person.id}
                          person={person}
                          allTags={allTags}
                          onView={handleView}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onAtend={handleAtend}
                          showBirthday={false}
                          showCareBadge
                          contactCount={contactCounts ? (contactCounts.get(person.id) ?? 0) : null}
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

      {/* Paginação — mesmo total da lista */}
      {showPagination && (
        <div className="flex items-center justify-between py-2 px-1">
          <p className="text-xs text-text-tertiary">
            Página {currentPage + 1} de {totalPages} · {total.toLocaleString('pt-BR')} pessoas
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

      {/* FAB mobile */}
      <button
        onClick={handleNewPerson}
        className="md:hidden fixed bottom-6 right-6 z-20 flex items-center justify-center rounded-full shadow-lg active:scale-95 transition-transform"
        style={{ width: 56, height: 56, background: 'var(--church-primary, var(--color-primary))' }}
        aria-label="Nova pessoa"
      >
        <span className="text-white text-2xl font-bold leading-none">+</span>
      </button>

      <PersonModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingPerson(null); invalidatePeople() }}
        churchId={churchId}
        person={editingPerson}
      />

      <PanelErrorBoundary>
        <PersonDetailPanel
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
          onEdit={(p) => { setSelectedPerson(null); handleEdit(p) }}
        />
      </PanelErrorBoundary>

      <QrCodeModal open={qrModalOpen} onOpenChange={setQrModalOpen} churchId={churchId} />

      <ConfirmDeleteModal
        person={personToDelete}
        onConfirm={() => { void confirmDelete() }}
        onCancel={() => { setPersonToDelete(null); setDeleteError(null) }}
        isDeleting={deletingId !== null}
        error={deleteError}
      />

      <ImportacaoMembros
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onSuccess={(_count) => invalidatePeople()}
      />
    </div>
  )
}
