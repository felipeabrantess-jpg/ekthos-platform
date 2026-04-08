import { useState, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePipelineStages, usePipelineBoard, useMovePersonToStage } from '@/features/pipeline/hooks/usePipeline'
import Spinner from '@/components/ui/Spinner'
import ErrorState from '@/components/ui/ErrorState'
import type { PersonWithStage, PipelineStage } from '@/lib/database.types'

function daysAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'Hoje'
  if (days === 1) return 'Ontem'
  return `Há ${days} dias`
}

interface PersonCardProps {
  person: PersonWithStage
  onDragStart: (personId: string, fromStageId: string) => void
  onClick: (person: PersonWithStage) => void
}

function PersonCard({ person, onDragStart, onClick }: PersonCardProps) {
  const pipeline = person.person_pipeline?.[0]
  const lastActivity = pipeline?.last_activity_at

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
      <p className="text-sm font-medium text-gray-900 truncate">{person.name ?? '—'}</p>
      {person.phone && (
        <p className="text-xs text-gray-500 mt-0.5">{person.phone}</p>
      )}
      {lastActivity && (
        <p className="text-xs text-gray-400 mt-1">{daysAgo(lastActivity)}</p>
      )}
    </div>
  )
}

interface DetailPanelProps {
  person: PersonWithStage
  onClose: () => void
}

function DetailPanel({ person, onClose }: DetailPanelProps) {
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
            <span className="text-gray-500 w-16 shrink-0">E-mail</span>
            <span className="text-gray-900">{person.email ?? '—'}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-gray-500 w-16 shrink-0">Telefone</span>
            <span className="text-gray-900">{person.phone ?? '—'}</span>
          </div>
          {person.tags.length > 0 && (
            <div className="flex gap-2">
              <span className="text-gray-500 w-16 shrink-0">Tags</span>
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
        <h3 className="text-sm font-semibold text-gray-700 truncate">{stage.name}</h3>
        <span className="ml-2 text-xs font-medium text-gray-500 bg-gray-200 rounded-full px-2 py-0.5 shrink-0">
          {people.length}
        </span>
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Pipeline</h1>
        <p className="text-sm text-gray-500 mt-1">Acompanhe a jornada das pessoas</p>
      </div>

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
              <p className="text-sm">Nenhum estágio configurado ainda.</p>
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
