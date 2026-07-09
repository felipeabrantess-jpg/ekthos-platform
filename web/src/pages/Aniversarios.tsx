// ─────────────────────────────────────────────────────────────────────────────
// Aniversários — próximos 30 dias (nascimento, casamento, batismo)
// ─────────────────────────────────────────────────────────────────────────────

import { useState }                from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Gift }                    from 'lucide-react'
import { supabase }                from '@/lib/supabase'
import { useAuth }                 from '@/hooks/useAuth'
import Spinner                     from '@/components/ui/Spinner'
import EmptyState                  from '@/components/ui/EmptyState'
import ErrorState                  from '@/components/ui/ErrorState'
import PersonModal                 from '@/features/people/components/PersonModal'
import type { Person }             from '@/lib/types/joins'

// ── Types ─────────────────────────────────────────────────────────────────────

interface StageInfo {
  id:    string
  name:  string
  slug:  string
  color: string | null
}

interface AnniversaryPerson {
  id:            string
  name:          string | null
  birth_date:    string | null
  wedding_date:  string | null
  baptism_date:  string | null
  person_pipeline?: Array<{ pipeline_stages: StageInfo | null }>
}

type DateField = 'birth_date' | 'wedding_date' | 'baptism_date'

interface PersonWithDays extends AnniversaryPerson {
  daysUntil: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysUntilAnniversary(dateStr: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr + 'T00:00:00')
  const thisYear = new Date(today.getFullYear(), d.getMonth(), d.getDate())
  let diff = Math.floor((thisYear.getTime() - today.getTime()) / 86400000)
  if (diff < 0) {
    const nextYear = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate())
    diff = Math.floor((nextYear.getTime() - today.getTime()) / 86400000)
  }
  return diff
}

function getList(people: AnniversaryPerson[], field: DateField): PersonWithDays[] {
  return people
    .filter(p => p[field] !== null)
    .map(p => ({ ...p, daysUntil: daysUntilAnniversary(p[field]!) }))
    .filter(p => p.daysUntil <= 30)
    .sort((a, b) => a.daysUntil - b.daysUntil)
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })
}

function getInitial(name: string | null): string {
  return (name ?? '?').charAt(0).toUpperCase()
}

// ── Sub-components ────────────────────────────────────────────────────────────

function DaysBadge({ days }: { days: number }) {
  if (days === 0) {
    return (
      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-brand-600 text-white whitespace-nowrap">
        Hoje! 🎉
      </span>
    )
  }
  if (days === 1) {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-warning-bg text-warning whitespace-nowrap">
        Amanhã
      </span>
    )
  }
  if (days <= 7) {
    return (
      <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-success-bg text-success whitespace-nowrap">
        em {days} dias
      </span>
    )
  }
  return (
    <span className="text-xs text-ekthos-black/40 font-medium whitespace-nowrap">
      em {days} dias
    </span>
  )
}

function StageBadge({ stage }: { stage: StageInfo | null | undefined }) {
  if (!stage) return null
  return (
    <span
      className="text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap shrink-0"
      style={{
        backgroundColor: stage.color ? `${stage.color}22` : 'rgba(0,0,0,0.07)',
        color:           stage.color ?? 'var(--color-text-secondary, #5A5A5A)',
      }}
    >
      {stage.name}
    </span>
  )
}

function PersonCard({
  person,
  field,
  onNameClick,
}: {
  person:      PersonWithDays
  field:       DateField
  onNameClick: (id: string) => void
}) {
  const isToday = person.daysUntil === 0
  const stage   = person.person_pipeline?.[0]?.pipeline_stages ?? null

  return (
    <div
      className={`bg-cream-light rounded-xl border shadow-sm p-3 flex items-center gap-3 transition-shadow hover:shadow-md ${
        isToday ? 'border-brand-200 bg-brand-50/30' : 'border-cream-dark/50'
      }`}
    >
      {/* Avatar */}
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
        style={{ background: 'var(--church-primary, var(--color-primary))' }}
      >
        {getInitial(person.name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <button
          type="button"
          onClick={() => onNameClick(person.id)}
          className="text-sm font-semibold text-ekthos-black hover:text-brand-600 truncate text-left w-full transition-colors leading-tight"
        >
          {person.name ?? '—'}
        </button>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <p className="text-xs text-ekthos-black/40 shrink-0">
            {formatDateShort(person[field]!)}
          </p>
          <StageBadge stage={stage} />
        </div>
      </div>

      {/* Days badge */}
      <DaysBadge days={person.daysUntil} />
    </div>
  )
}

// ── Tabs config ───────────────────────────────────────────────────────────────

type Tab = 'birth' | 'wedding' | 'baptism'

const TABS: Array<{ key: Tab; label: string; icon: string; field: DateField }> = [
  { key: 'birth',   label: 'Nascimento', icon: '🎂', field: 'birth_date'   },
  { key: 'wedding', label: 'Casamento',  icon: '💍', field: 'wedding_date' },
  { key: 'baptism', label: 'Batismo',    icon: '✝️', field: 'baptism_date' },
]

// ── Hook ──────────────────────────────────────────────────────────────────────

function useAnniversaries(churchId: string) {
  return useQuery({
    queryKey: ['aniversarios', churchId],
    queryFn: async (): Promise<AnniversaryPerson[]> => {
      const { data, error } = await (supabase as any)
        .from('people')
        .select(`
          id, name, birth_date, wedding_date, baptism_date,
          person_pipeline ( pipeline_stages ( id, name, slug, color ) )
        `)
        .eq('church_id', churchId)
        .is('deleted_at', null)
        .is('left_at', null)
      if (error) throw error
      return (data ?? []) as AnniversaryPerson[]
    },
    enabled: !!churchId,
    staleTime: 5 * 60 * 1000,
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Aniversarios() {
  const { churchId }  = useAuth()
  const queryClient   = useQueryClient()

  // Todos os hooks antes de qualquer return condicional
  const [activeTab,     setActiveTab]     = useState<Tab>('birth')
  const [editingPerson, setEditingPerson] = useState<Person | null>(null)
  const [modalOpen,     setModalOpen]     = useState(false)

  const { data: people, isLoading, isError, refetch } = useAnniversaries(churchId ?? '')

  async function handleEditPerson(personId: string) {
    const { data } = await supabase
      .from('people')
      .select('*')
      .eq('id', personId)
      .single()
    if (data) {
      setEditingPerson(data as Person)
      setModalOpen(true)
    }
  }

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  const tab = TABS.find(t => t.key === activeTab)!
  const list = people ? getList(people, tab.field) : []
  const todayCount = people
    ? TABS.reduce((n, t) => n + getList(people, t.field).filter(p => p.daysUntil === 0).length, 0)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ekthos-black">Aniversários</h1>
          <p className="text-sm text-ekthos-black/50 mt-1">Próximos 30 dias</p>
        </div>
        {todayCount > 0 && (
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-xl bg-brand-50 text-brand-700 border border-brand-200">
            <Gift size={14} strokeWidth={1.75} />
            {todayCount} hoje
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-cream-dark/30 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              activeTab === t.key
                ? 'bg-cream-light shadow-sm text-ekthos-black'
                : 'text-ekthos-black/50 hover:text-ekthos-black/70'
            }`}
          >
            <span role="img" aria-label={t.label}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          title="Nenhum aniversário nos próximos 30 dias"
          description="Certifique-se de que as datas estão cadastradas nos perfis das pessoas."
        />
      ) : (
        <div className="flex flex-col gap-2 max-w-lg">
          {list.map(p => (
            <PersonCard
              key={p.id}
              person={p}
              field={tab.field}
              onNameClick={handleEditPerson}
            />
          ))}
        </div>
      )}

      <PersonModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false)
          setEditingPerson(null)
          void queryClient.invalidateQueries({ queryKey: ['aniversarios', churchId] })
        }}
        churchId={churchId}
        person={editingPerson}
      />
    </div>
  )
}
