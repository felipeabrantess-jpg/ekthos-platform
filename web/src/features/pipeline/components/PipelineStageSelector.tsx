// ─────────────────────────────────────────────────────────────────────────────
// PipelineStageSelector — badge clicável para trocar etapa do pipeline
//
// Lê etapa atual de person.person_pipeline[0].pipeline_stages (fonte única).
// Exibe dropdown com as etapas da igreja (pipeline_stages).
// Ao selecionar, chama useUpdatePersonPipelineStage que:
//   - Salva em person_pipeline.stage_id
//   - Invalida ['people'] e ['pipeline-board'] → sincronização bidirecional
//
// Anti-purge: TODAS as cores via style={{ }} inline — nunca bg-${color}-500.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Loader2 } from 'lucide-react'
import { usePipelineStages } from '@/features/pipeline/hooks/usePipeline'
import { useUpdatePersonPipelineStage } from '@/features/pipeline/hooks/useUpdatePersonPipelineStage'
import type { PersonWithStage, PipelineStage } from '@/lib/types/joins'

interface PipelineStageSelectorProps {
  person:   PersonWithStage
  churchId: string
}

export function PipelineStageSelector({ person, churchId }: PipelineStageSelectorProps) {
  const [open, setOpen] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const { data: stages = [] } = usePipelineStages(churchId)
  const updateStage = useUpdatePersonPipelineStage()

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open])

  const pipeline    = person.person_pipeline?.[0]
  const currentId   = pipeline?.stage_id ?? null
  // pipeline_stages pode não incluir 'color' nos tipos gerados — cast seguro
  type StageWithColor = PipelineStage & { color?: string | null }
  const currentStage = pipeline?.pipeline_stages as StageWithColor | null | undefined
  const hex          = (currentStage?.color as string | null | undefined) ?? '#6B7280'
  const label        = currentStage?.name ?? 'Sem etapa'

  function handleSelect(stage: StageWithColor) {
    if (stage.id === currentId) { setOpen(false); return }
    setOpen(false)
    setSaveError(null)
    updateStage
      .mutateAsync({ personId: person.id, stageId: stage.id, churchId })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : 'Erro desconhecido ao salvar estágio'
        console.error('[PipelineStageSelector] Falha ao salvar:', msg, { personId: person.id, stageId: stage.id, churchId })
        setSaveError(msg)
      })
  }

  return (
    <div ref={ref} className="relative inline-block">
      {/* Badge / trigger */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        disabled={updateStage.isPending}
        className="inline-flex items-center gap-1.5 font-medium rounded-full border transition-opacity hover:opacity-80 active:scale-95 disabled:opacity-50"
        style={{
          fontSize:        '11px',
          paddingTop:      '3px',
          paddingBottom:   '3px',
          paddingLeft:     '8px',
          paddingRight:    '6px',
          backgroundColor: hex + '1A',
          color:           hex,
          borderColor:     hex + '40',
        }}
        aria-label={`Etapa atual: ${label}. Clique para alterar`}
      >
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={{ backgroundColor: hex }}
        />
        {updateStage.isPending
          ? <Loader2 size={10} className="animate-spin" />
          : label
        }
        <ChevronDown size={10} strokeWidth={2} />
      </button>

      {saveError && (
        <div
          className="absolute left-0 top-full mt-1 z-50 rounded-lg px-3 py-2 text-xs max-w-[280px]"
          style={{ background: '#FDE8E0', color: '#C42E00', border: '1px solid #e1350040' }}
        >
          <span className="font-semibold">Erro ao salvar:</span> {saveError}
        </div>
      )}

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-lg py-1 min-w-[170px]"
          style={{ border: '1px solid rgba(0,0,0,0.08)' }}
        >
          {stages.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400">Nenhuma etapa configurada</p>
          ) : (
            (stages as StageWithColor[]).map((s) => {
              const sHex    = s.color ?? '#6B7280'
              const isActive = s.id === currentId
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleSelect(s) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-gray-50 transition-colors"
                  style={{ fontWeight: isActive ? 600 : 500 }}
                >
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: sHex }}
                  />
                  <span style={{ color: isActive ? sHex : '#374151' }}>{s.name}</span>
                  {isActive && (
                    <span className="ml-auto text-[10px]" style={{ color: sHex }}>✓</span>
                  )}
                </button>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
