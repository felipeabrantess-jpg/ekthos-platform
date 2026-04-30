import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { X, AlertTriangle, Settings2 } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePipelineStages, usePipelineBoard, useMovePersonToStage } from '@/features/pipeline/hooks/usePipeline'
import Spinner from '@/components/ui/Spinner'
import ErrorState from '@/components/ui/ErrorState'
import type { PersonWithStage, PipelineStage } from '@/lib/types/joins'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function daysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  return `Há ${days} dias`
}

function hoursElapsed(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 3600000)
}

function slaStatus(enteredAt: string | undefined, slaHours: number | null | undefined): 'ok' | 'warning' | 'breach' {
  if (!slaHours || !enteredAt) return 'ok'
  const elapsed = hoursElapsed(enteredAt)
  if (elapsed >= slaHours) return 'breach'
  if (elapsed >= slaHours * 0.75) return 'warning'
  return 'ok'
}

// ──────────────────────────────────────────────────────────────
// PersonCard
// ──────────────────────────────────────────────────────────────

interface PersonCardProps {
  person: PersonWithStage
  onDragStart: (personId: string, fromStageId: string) => void
  onClick: (person: PersonWithStage) => void
}

function PersonCard({ person, onDragStart, onClick }: PersonCardProps) {
  const pipeline = person.person_pipeline?.[0]
  const lastActivity = pipeline?.last_activity_at
  const status = slaStatus(pipeline?.entered_at ?? undefined, pipeline?.pipeline_stages?.sla_hours)

  return (
    <div
      draggable
      onDragStart={() => {
        if (pipeline?.stage_id) {
          onDragStart(person.id, pipeline.stage_id)
        }
      }}
      onClick={() => onClick(person)}
      className="bg-bg-primary rounded-xl border border-border-default p-3 shadow-sm cursor-grab active:cursor-grabbing hover:bg-white hover:shadow-md transition-all select-none"
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium text-ekthos-black truncate">{person.name ?? '—'}</p>
        {status === 'breach' && (
          <span className="shrink-0 text-xs font-semibold text-white bg-red-500 rounded-full px-1.5 py-0.5 leading-none">
            SLA
          </span>
        )}
        {status === 'warning' && (
          <span className="shrink-0 text-xs font-semibold text-white bg-amber-400 rounded-full px-1.5 py-0.5 leading-none">
            SLA
          </span>
        )}
      </div>
      {person.phone && (
        <p className="text-xs text-ekthos-black/50 mt-0.5">{person.phone}</p>
      )}
      {lastActivity && (
        <p className="text-xs text-ekthos-black/40 mt-1">{daysAgo(lastActivity)}</p>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// DetailPanel
// ──────────────────────────────────────────────────────────────

interface DetailPanelProps {
  person: PersonWithStage
  onClose: () => void
}

function DetailPanel({ person, onClose }: DetailPanelProps) {
  const pipeline = person.person_pipeline?.[0]
  const status = slaStatus(pipeline?.entered_at ?? undefined, pipeline?.pipeline_stages?.sla_hours)
  const slaHours = pipeline?.pipeline_stages?.sla_hours
  const elapsed = pipeline?.entered_at ? hoursElapsed(pipeline.entered_at) : null

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative bg-bg-primary rounded-2xl shadow-xl p-5 w-full max-w-sm z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base font-semibold text-ekthos-black">{person.name ?? '—'}</h3>
          <button onClick={onClose} className="p-1 rounded-lg text-ekthos-black/30 hover:text-ekthos-black/70 hover:bg-bg-hover transition-all">
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-ekthos-black/40 w-20 shrink-0">E-mail</span>
            <span className="text-ekthos-black">{person.email ?? '—'}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-ekthos-black/40 w-20 shrink-0">Telefone</span>
            <span className="text-ekthos-black">{person.phone ?? '—'}</span>
          </div>

          {pipeline?.entered_at != null && (
            <div className="flex gap-2">
              <span className="text-ekthos-black/40 w-20 shrink-0">Nesta etapa</span>
              <span className="text-ekthos-black">{daysAgo(pipeline.entered_at ?? '')}</span>
            </div>
          )}

          {slaHours && elapsed !== null && (
            <div className="flex gap-2">
              <span className="text-ekthos-black/40 w-20 shrink-0">SLA</span>
              <span className={
                status === 'breach'  ? 'font-semibold text-primary-text' :
                status === 'warning' ? 'font-semibold text-warning' :
                'text-ekthos-black'
              }>
                {elapsed}h / {slaHours}h
                {status === 'breach'  && ' — Prazo estourado'}
                {status === 'warning' && ' — Atenção'}
              </span>
            </div>
          )}

          {person.tags.length > 0 && (
            <div className="flex gap-2">
              <span className="text-ekthos-black/40 w-20 shrink-0">Tags</span>
              <div className="flex flex-wrap gap-1">
                {person.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-bg-hover text-primary-text rounded-full px-2 py-0.5 font-medium">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// KanbanColumn
// ──────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  stage: PipelineStage
  people: PersonWithStage[]
  onDragStart: (personId: string, fromStageId: string) => void
  onDrop: (toStageId: string) => void
  onCardClick: (person: PersonWithStage) => void
}

function KanbanColumn({ stage, people, onDragStart, onDrop, onCardClick }: KanbanColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const dragCounter = useRef(0)

  // Count cards with active SLA breach for column header alert
  const breachCount = people.filter((p) => {
    const pipeline = p.person_pipeline?.[0]
    return slaStatus(pipeline?.entered_at ?? undefined, stage.sla_hours) === 'breach'
  }).length

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDragEnter() {
    dragCounter.current += 1
    setIsDragOver(true)
  }

  function handleDragLeave() {
    dragCounter.current -= 1
    if (dragCounter.current === 0) {
      setIsDragOver(false)
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setIsDragOver(false)
    onDrop(stage.id)
  }

  return (
    <div
      className={`flex flex-col rounded-2xl border ${isDragOver ? 'ring-2 ring-primary/40 border-border-default bg-bg-hover/30' : 'border-border-default bg-bg-hover'} min-w-[260px] max-w-[260px] transition-all`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-default">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="text-sm font-semibold text-ekthos-black truncate">{stage.name}</h3>
          {stage.sla_hours && (
            <span className="text-xs text-ekthos-black/40 shrink-0">{stage.sla_hours}h</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {breachCount > 0 && (
            <span className="text-xs font-semibold text-white bg-primary rounded-full px-1.5 py-0.5 leading-none">
              {breachCount}
            </span>
          )}
          <span className="text-xs font-medium text-ekthos-black/60 bg-bg-hover rounded-full px-2 py-0.5">
            {people.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 min-h-[120px] flex-1">
        {people.length === 0 ? (
          <p className="text-xs text-ekthos-black/40 text-center pt-4 px-2">
            Nenhuma pessoa nesta etapa
          </p>
        ) : (
          people.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              onDragStart={onDragStart}
              onClick={onCardClick}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// MobileStagePicker — seleciona coluna ativa no mobile
// ──────────────────────────────────────────────────────────────

interface MobileStagePickerProps {
  stages: PipelineStage[]
  activeId: string | null
  board: Record<string, PersonWithStage[]>
  onSelect: (id: string) => void
}

function MobileStagePicker({ stages, activeId, board, onSelect }: MobileStagePickerProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {stages.map(stage => {
        const count = (board[stage.id] ?? []).length
        const isActive = activeId === stage.id
        return (
          <button
            key={stage.id}
            onClick={() => onSelect(stage.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium whitespace-nowrap shrink-0 transition-all active:scale-95 ${
              isActive
                ? 'text-white shadow-sm'
                : 'bg-bg-hover text-ekthos-black/60 active:bg-bg-hover'
            }`}
            style={isActive ? { background: (stage as PipelineStage & { color?: string }).color ?? 'var(--color-primary)' } : {}}
          >
            {stage.name}
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              isActive ? 'bg-white/25 text-white' : 'bg-ekthos-black/10 text-ekthos-black/50'
            }`}>
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Pipeline page
// ──────────────────────────────────────────────────────────────

export default function Pipeline() {
  const { churchId } = useAuth()
  const navigate = useNavigate()
  const [dragging, setDragging] = useState<{ personId: string; fromStageId: string } | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<PersonWithStage | null>(null)
  const [mobileActiveStageId, setMobileActiveStageId] = useState<string | null>(null)

  const { data: stages, isLoading: stagesLoading, isError: stagesError, refetch: refetchStages } = usePipelineStages(churchId ?? '')
  const { data: board, isLoading: boardLoading, isError: boardError, refetch: refetchBoard } = usePipelineBoard(churchId ?? '')
  const movePersonToStage = useMovePersonToStage()

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  const isLoading = stagesLoading || boardLoading
  const isError = stagesError || boardError

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) {
    return (
      <ErrorState
        message="Não foi possível carregar o pipeline."
        onRetry={() => { void refetchStages(); void refetchBoard() }}
      />
    )
  }

  function handleDragStart(personId: string, fromStageId: string) {
    setDragging({ personId, fromStageId })
  }

  function handleDrop(toStageId: string) {
    if (!dragging || !churchId) return
    if (dragging.fromStageId === toStageId) {
      setDragging(null)
      return
    }
    void movePersonToStage.mutateAsync({
      personId: dragging.personId,
      newStageId: toStageId,
      churchId,
    })
    setDragging(null)
  }

  const displayedStages = stages ?? []
  const displayedBoard = board ?? {}

  // Auto-select first stage on mobile when stages load
  const effectiveStageId = mobileActiveStageId ?? displayedStages[0]?.id ?? null

  // Total de pessoas com SLA estourado em todo o board
  const totalBreaches = displayedStages.reduce((acc, stage) => {
    const people = displayedBoard[stage.id] ?? []
    return acc + people.filter((p) => {
      const pipeline = p.person_pipeline?.[0]
      return slaStatus(pipeline?.entered_at ?? undefined, stage.sla_hours) === 'breach'
    }).length
  }, 0)

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-ekthos-black">Caminho de discipulado</h1>
          <p className="text-xs md:text-sm text-ekthos-black/50 mt-1">Acompanhe a jornada de cada pessoa</p>
        </div>
        <button
          onClick={() => navigate('/configuracoes/discipulado')}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-500 border border-black/10 hover:border-primary hover:text-primary-text bg-white transition-colors shrink-0"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Configurar</span>
        </button>
      </div>

      {/* SLA alert banner */}
      {totalBreaches > 0 && (
        <div className="flex items-center gap-2 bg-bg-hover border border-border-default rounded-xl px-4 py-2.5 text-sm text-primary-text">
          <AlertTriangle size={16} strokeWidth={1.75} className="shrink-0" />
          <span>
            <strong>{totalBreaches} {totalBreaches === 1 ? 'pessoa' : 'pessoas'}</strong> com prazo de contato estourado
          </span>
        </div>
      )}

      {/* ── Mobile: stage picker + coluna ativa ──────────────── */}
      {displayedStages.length > 0 && (
        <div className="md:hidden space-y-3">
          <MobileStagePicker
            stages={displayedStages}
            activeId={effectiveStageId}
            board={displayedBoard}
            onSelect={setMobileActiveStageId}
          />
          {effectiveStageId && (
            <KanbanColumn
              stage={displayedStages.find(s => s.id === effectiveStageId)!}
              people={displayedBoard[effectiveStageId] ?? []}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onCardClick={setSelectedPerson}
            />
          )}
        </div>
      )}

      {/* ── Desktop: kanban horizontal ───────────────────────── */}
      <div className="hidden md:block overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-max">
          {displayedStages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              people={displayedBoard[stage.id] ?? []}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onCardClick={setSelectedPerson}
            />
          ))}
          {displayedStages.length === 0 && (
            <div className="flex items-center justify-center w-full py-16">
              <p className="text-sm text-ekthos-black/40">Nenhuma etapa configurada ainda.</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile empty state */}
      {displayedStages.length === 0 && (
        <div className="md:hidden flex items-center justify-center py-16">
          <p className="text-sm text-ekthos-black/40">Nenhuma etapa configurada ainda.</p>
        </div>
      )}

      {/* Detail panel */}
      {selectedPerson && (
        <DetailPanel
          person={selectedPerson}
          onClose={() => setSelectedPerson(null)}
        />
      )}
    </div>
  )
}
