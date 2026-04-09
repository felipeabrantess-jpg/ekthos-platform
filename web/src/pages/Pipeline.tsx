import { useState, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePipelineStages, usePipelineBoard, useMovePersonToStage } from '@/features/pipeline/hooks/usePipeline'
import Spinner from '@/components/ui/Spinner'
import ErrorState from '@/components/ui/ErrorState'
import type { PersonWithStage, PipelineStage } from '@/lib/database.types'

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
  const status = slaStatus(pipeline?.entered_at, pipeline?.pipeline_stages?.sla_hours)

  return (
    <div
      draggable
      onDragStart={() => {
        if (pipeline?.stage_id) {
          onDragStart(person.id, pipeline.stage_id)
        }
      }}
      onClick={() => onClick(person)}
      className="bg-white rounded-lg border border-gray-200 p-3 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow select-none"
    >
      <div className="flex items-start justify-between gap-1">
        <p className="text-sm font-medium text-gray-900 truncate">{person.name ?? '—'}</p>
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
        <p className="text-xs text-gray-500 mt-0.5">{person.phone}</p>
      )}
      {lastActivity && (
        <p className="text-xs text-gray-400 mt-1">{daysAgo(lastActivity)}</p>
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
  const status = slaStatus(pipeline?.entered_at, pipeline?.pipeline_stages?.sla_hours)
  const slaHours = pipeline?.pipeline_stages?.sla_hours
  const elapsed = pipeline?.entered_at ? hoursElapsed(pipeline.entered_at) : null

  return (
    <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30" />
      <div
        className="relative bg-white rounded-xl shadow-xl p-5 w-full max-w-sm z-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">{person.name ?? '—'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-gray-500 w-20 shrink-0">E-mail</span>
            <span className="text-gray-900">{person.email ?? '—'}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500 w-20 shrink-0">Telefone</span>
            <span className="text-gray-900">{person.phone ?? '—'}</span>
          </div>

          {pipeline?.entered_at && (
            <div className="flex gap-2">
              <span className="text-gray-500 w-20 shrink-0">Nesta etapa</span>
              <span className="text-gray-900">{daysAgo(pipeline.entered_at)}</span>
            </div>
          )}

          {slaHours && elapsed !== null && (
            <div className="flex gap-2">
              <span className="text-gray-500 w-20 shrink-0">SLA</span>
              <span className={
                status === 'breach'  ? 'font-semibold text-red-600' :
                status === 'warning' ? 'font-semibold text-amber-600' :
                'text-gray-900'
              }>
                {elapsed}h / {slaHours}h
                {status === 'breach'  && ' — Prazo estourado'}
                {status === 'warning' && ' — Atenção'}
              </span>
            </div>
          )}

          {person.tags.length > 0 && (
            <div className="flex gap-2">
              <span className="text-gray-500 w-20 shrink-0">Tags</span>
              <div className="flex flex-wrap gap-1">
                {person.tags.map((tag) => (
                  <span key={tag} className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{tag}</span>
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
    return slaStatus(pipeline?.entered_at, stage.sla_hours) === 'breach'
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
      className={`flex flex-col rounded-xl border ${isDragOver ? 'ring-2 ring-blue-400 border-blue-200 bg-blue-50' : 'border-gray-200 bg-gray-50'} min-w-[260px] max-w-[260px] transition-all`}
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-gray-200">
        <div className="flex items-center gap-1.5 min-w-0">
          <h3 className="text-sm font-semibold text-gray-700 truncate">{stage.name}</h3>
          {stage.sla_hours && (
            <span className="text-xs text-gray-400 shrink-0">{stage.sla_hours}h</span>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-1">
          {breachCount > 0 && (
            <span className="text-xs font-semibold text-white bg-red-500 rounded-full px-1.5 py-0.5 leading-none">
              {breachCount}
            </span>
          )}
          <span className="text-xs font-medium text-gray-500 bg-gray-200 rounded-full px-2 py-0.5">
            {people.length}
          </span>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 p-2 min-h-[120px] flex-1">
        {people.length === 0 ? (
          <p className="text-xs text-gray-400 text-center pt-4 px-2">
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
// Pipeline page
// ──────────────────────────────────────────────────────────────

export default function Pipeline() {
  const { churchId } = useAuth()
  const [dragging, setDragging] = useState<{ personId: string; fromStageId: string } | null>(null)
  const [selectedPerson, setSelectedPerson] = useState<PersonWithStage | null>(null)

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

  // Total de pessoas com SLA estourado em todo o board
  const totalBreaches = displayedStages.reduce((acc, stage) => {
    const people = displayedBoard[stage.id] ?? []
    return acc + people.filter((p) => {
      const pipeline = p.person_pipeline?.[0]
      return slaStatus(pipeline?.entered_at, stage.sla_hours) === 'breach'
    }).length
  }, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Caminho de discipulado</h1>
        <p className="text-sm text-gray-500 mt-1">Acompanhe a jornada de cada pessoa</p>
      </div>

      {/* SLA alert banner */}
      {totalBreaches > 0 && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          <span>
            <strong>{totalBreaches} {totalBreaches === 1 ? 'pessoa' : 'pessoas'}</strong> com prazo de contato estourado
          </span>
        </div>
      )}

      {/* Kanban Board */}
      <div className="overflow-x-auto pb-4">
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
            <div className="flex items-center justify-center w-full py-16 text-gray-400">
              <p className="text-sm">Nenhuma etapa configurada ainda.</p>
            </div>
          )}
        </div>
      </div>

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
