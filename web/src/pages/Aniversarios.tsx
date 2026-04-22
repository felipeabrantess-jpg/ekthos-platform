// ─────────────────────────────────────────────────────────────────────────────
// Aniversários — próximos 30 dias (nascimento, casamento, batismo)
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gift } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnniversaryPerson {
  id: string
  name: string | null
  birth_date: string | null
  wedding_date: string | null
  baptism_date: string | null
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

function PersonCard({
  person,
  field,
}: {
  person: PersonWithDays
  field: DateField
}) {
  const isToday = person.daysUntil === 0
  return (
    <div
      className={`bg-cream-light rounded-2xl border shadow-sm p-4 flex items-center gap-4 transition-shadow hover:shadow-md ${
        isToday ? 'border-brand-200 bg-brand-50/30' : 'border-cream-dark/50'
      }`}
    >
      {/* Avatar */}
      <div
        className="h-11 w-11 rounded-full flex items-center justify-center shrink-0 text-base font-bold text-white"
        style={{ background: 'var(--church-primary, #e13500)' }}
      >
        {getInitial(person.name)}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ekthos-black truncate">
          {person.name ?? '—'}
        </p>
        <p className="text-xs text-ekthos-black/40 mt-0.5">
          {formatDateShort(person[field]!)}
        </p>
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
      const { data, error } = await supabase
        .from('people')
        .select('id, name, birth_date, wedding_date, baptism_date')
        .eq('church_id', churchId)
        .is('deleted_at', null)
      if (error) throw error
      return (data ?? []) as AnniversaryPerson[]
    },
    enabled: !!churchId,
    staleTime: 5 * 60 * 1000,
  })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Aniversarios() {
  const { churchId } = useAuth()
  const [activeTab, setActiveTab] = useState<Tab>('birth')
  const { data: people, isLoading, isError, refetch } = useAnniversaries(churchId ?? '')

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map(p => (
            <PersonCard key={p.id} person={p} field={tab.field} />
          ))}
        </div>
      )}
    </div>
  )
}
