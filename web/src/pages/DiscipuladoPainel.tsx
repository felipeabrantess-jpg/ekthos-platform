import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Settings2, AlertCircle, ChevronRight, Users } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import {
  useDiscipuladoOverview,
  useDiscipuladoStagePeople,
  type DiscipuladoStage,
} from '@/features/pipeline/hooks/useDiscipulado'
import Spinner from '@/components/ui/Spinner'
import ErrorState from '@/components/ui/ErrorState'

// ── Helpers ────────────────────────────────────────────────────

function diasLabel(n: number): string {
  if (n === 0) return 'Hoje'
  if (n === 1) return '1 dia'
  return `${n} dias`
}

// ── Skeleton ──────────────────────────────────────────────────

function StageSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="shrink-0 w-40 h-24 rounded-2xl bg-bg-hover animate-pulse" />
      ))}
    </div>
  )
}

function PeopleSkeleton() {
  return (
    <div className="space-y-2">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className="h-16 rounded-xl bg-bg-hover animate-pulse" />
      ))}
    </div>
  )
}

// ── StageStrip ─────────────────────────────────────────────────

interface StageStripProps {
  stage: DiscipuladoStage
  isActive: boolean
  onClick: () => void
}

function StageStrip({ stage, isActive, onClick }: StageStripProps) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 flex flex-col gap-1.5 p-3 rounded-2xl border text-left transition-all active:scale-95 min-w-[9rem] ${
        isActive
          ? 'bg-primary border-primary shadow-md'
          : 'bg-bg-primary border-border-default hover:border-primary/40 hover:bg-bg-hover'
      }`}
    >
      <span className={`text-xs font-semibold truncate max-w-full ${isActive ? 'text-white/80' : 'text-ekthos-black/50'}`}>
        {stage.stage_name}
      </span>
      <span className={`text-2xl font-bold leading-none font-display ${isActive ? 'text-white' : 'text-ekthos-black'}`}>
        {stage.total}
      </span>
      <div className="flex flex-wrap gap-1 mt-0.5">
        {stage.entraram > 0 && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            isActive ? 'bg-white/20 text-white' : 'bg-green-100 text-green-700'
          }`}>
            +{stage.entraram}
          </span>
        )}
        {stage.avancaram > 0 && (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
            isActive ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
          }`}>
            ↗{stage.avancaram}
          </span>
        )}
        {stage.parados > 0 && (
          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
            isActive ? 'bg-white/25 text-white' : 'bg-orange-100 text-orange-700'
          }`}>
            ⏸{stage.parados}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Legend ──────────────────────────────────────────────────

function Legend() {
  return (
    <div className="flex flex-wrap gap-3 text-xs text-ekthos-black/40">
      <span className="flex items-center gap-1">
        <span className="bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">+N</span>
        entraram (30d)
      </span>
      <span className="flex items-center gap-1">
        <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">↗N</span>
        avançaram (30d)
      </span>
      <span className="flex items-center gap-1">
        <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-medium">⏸N</span>
        parados
      </span>
    </div>
  )
}

// ── PersonRow ──────────────────────────────────────────────────

interface PersonRowProps {
  personId: string
  nome: string | null
  telefone: string | null
  diasNaEtapa: number
  responsavel: string | null
  atrasado: boolean
  onClick: () => void
}

function PersonRow({ nome, telefone, diasNaEtapa, responsavel, atrasado, onClick }: PersonRowProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-border-default bg-bg-primary hover:bg-bg-hover hover:border-primary/30 transition-all text-left active:scale-[0.99]"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-ekthos-black truncate">{nome ?? '—'}</p>
          {atrasado && (
            <span className="shrink-0 text-[10px] font-semibold bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
              atrasado
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          {telefone && (
            <span className="text-xs text-ekthos-black/50 truncate">{telefone}</span>
          )}
          {responsavel && (
            <span className="text-xs text-ekthos-black/40 truncate">→ {responsavel}</span>
          )}
        </div>
      </div>
      <div className="shrink-0 flex flex-col items-end gap-0.5">
        <span className={`text-xs font-semibold ${atrasado ? 'text-orange-600' : 'text-ekthos-black/40'}`}>
          {diasLabel(diasNaEtapa)}
        </span>
        <ChevronRight size={14} className="text-ekthos-black/20" />
      </div>
    </button>
  )
}

// ── StageList ──────────────────────────────────────────────────

const PAGE_SIZE = 50

interface StageListProps {
  churchId: string
  stage: DiscipuladoStage
}

function StageList({ churchId, stage }: StageListProps) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [offset, setOffset] = useState(0)

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val)
    // Simple debounce via timeout ref would be better, but this suffices
    const timer = setTimeout(() => {
      setDebouncedSearch(val)
      setOffset(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [])

  const { data, isLoading, isError, refetch } = useDiscipuladoStagePeople(
    churchId,
    stage.stage_id,
    { limit: PAGE_SIZE, offset, search: debouncedSearch || undefined }
  )

  const people = data ?? []
  const hasMore = people.length === PAGE_SIZE

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ekthos-black/30 pointer-events-none" />
        <input
          type="text"
          placeholder="Buscar por nome ou telefone…"
          value={search}
          onChange={e => handleSearchChange(e.target.value)}
          className="w-full pl-8 pr-3 py-2.5 rounded-xl border border-border-default bg-bg-primary text-sm text-ekthos-black placeholder:text-ekthos-black/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <PeopleSkeleton />
      ) : isError ? (
        <ErrorState message="Não foi possível carregar as pessoas." onRetry={() => void refetch()} />
      ) : people.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2 text-ekthos-black/40">
          <Users size={32} strokeWidth={1.5} />
          <p className="text-sm">
            {debouncedSearch
              ? 'Nenhuma pessoa encontrada para essa busca.'
              : 'Nenhuma pessoa nesta etapa.'}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {people.map(p => (
              <PersonRow
                key={p.person_id}
                personId={p.person_id}
                nome={p.nome}
                telefone={p.telefone}
                diasNaEtapa={p.dias_na_etapa}
                responsavel={p.responsavel}
                atrasado={p.atrasado}
                onClick={() => navigate(`/pessoas/${p.person_id}/atendimento`)}
              />
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-1 text-xs text-ekthos-black/40">
            <button
              disabled={offset === 0}
              onClick={() => setOffset(o => Math.max(0, o - PAGE_SIZE))}
              className="px-3 py-1.5 rounded-lg border border-border-default disabled:opacity-30 hover:bg-bg-hover transition-all"
            >
              ← Anterior
            </button>
            <span>{offset + 1}–{offset + people.length}</span>
            <button
              disabled={!hasMore}
              onClick={() => setOffset(o => o + PAGE_SIZE)}
              className="px-3 py-1.5 rounded-lg border border-border-default disabled:opacity-30 hover:bg-bg-hover transition-all"
            >
              Próxima →
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── DiscipuladoPainel (main) ───────────────────────────────────

export default function DiscipuladoPainel() {
  const { churchId } = useAuth()
  const navigate = useNavigate()
  const [activeStageId, setActiveStageId] = useState<string | null>(null)

  const { data: stages, isLoading, isError, refetch } = useDiscipuladoOverview(churchId ?? '')

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-ekthos-black">Caminho de discipulado</h1>
          <p className="text-xs md:text-sm text-ekthos-black/50 mt-1">Acompanhe a jornada de cada pessoa</p>
        </div>
        <StageSkeleton />
      </div>
    )
  }

  if (isError) {
    return (
      <ErrorState
        message="Não foi possível carregar o painel de discipulado."
        onRetry={() => void refetch()}
      />
    )
  }

  const displayedStages = stages ?? []
  const effectiveStageId = activeStageId ?? displayedStages[0]?.stage_id ?? null
  const activeStage = displayedStages.find(s => s.stage_id === effectiveStageId) ?? null

  // Total SLA estourado no painel
  const totalParados = displayedStages.reduce((acc, s) => acc + s.parados, 0)

  return (
    <div className="space-y-5 md:space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl md:text-2xl font-bold text-ekthos-black">Caminho de discipulado</h1>
          <p className="text-xs md:text-sm text-ekthos-black/50 mt-1">Acompanhe a jornada de cada pessoa</p>
        </div>
        <button
          onClick={() => navigate('/configuracoes/discipulado')}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-gray-500 border border-black/10 hover:border-primary hover:text-primary-text bg-white transition-colors"
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Configurar</span>
        </button>
      </div>

      {/* SLA alert */}
      {totalParados > 0 && (
        <div className="flex items-center gap-2 bg-bg-hover border border-border-default rounded-xl px-4 py-2.5 text-sm text-primary-text">
          <AlertCircle size={16} strokeWidth={1.75} className="shrink-0" />
          <span>
            <strong>{totalParados} {totalParados === 1 ? 'pessoa' : 'pessoas'}</strong> parada
            {totalParados === 1 ? '' : 's'} além do prazo esperado
          </span>
        </div>
      )}

      {/* Phase path */}
      {displayedStages.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-2 text-ekthos-black/40">
          <Users size={40} strokeWidth={1.5} />
          <p className="text-sm">Nenhuma etapa configurada ainda.</p>
          <button
            onClick={() => navigate('/configuracoes/discipulado')}
            className="mt-2 text-xs text-primary-text underline underline-offset-2"
          >
            Configurar etapas
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-none">
            {displayedStages.map(stage => (
              <StageStrip
                key={stage.stage_id}
                stage={stage}
                isActive={stage.stage_id === effectiveStageId}
                onClick={() => setActiveStageId(stage.stage_id)}
              />
            ))}
          </div>

          <Legend />

          {/* Divider */}
          <hr className="border-border-default" />

          {/* Stage list */}
          {activeStage && (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 className="font-display text-base font-semibold text-ekthos-black">
                  {activeStage.stage_name}
                </h2>
                <span className="text-sm text-ekthos-black/40">{activeStage.total} pessoas</span>
              </div>
              <StageList churchId={churchId} stage={activeStage} />
            </div>
          )}
        </>
      )}
    </div>
  )
}
