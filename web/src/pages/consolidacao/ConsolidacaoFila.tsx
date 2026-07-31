import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Heart, AlertTriangle, Clock, ChevronRight, Loader2, Users, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { JourneyProvider } from '@/features/journey/context/JourneyProvider'
import { useJourneyFlag } from '@/features/journey/hooks/useJourneyFlag'
import {
  useCareQueue,
  useRegisterTouch,
  useJourneyAssign,
  useJourneyOpen,
  useJourneyAdvance,
  type CareQueueItem,
} from '@/features/journey/hooks/useCareQueue'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

// ── Tipos auxiliares ──────────────────────────────────────────

interface PipelineStage {
  id:          string
  name:        string
  order_index: number
}

// ── Toast ─────────────────────────────────────────────────────

interface ToastState { msg: string; type: 'success' | 'error' | 'info'; key: number }

function Toast({ msg, type, onClose }: { msg: string; type: ToastState['type']; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  const colors = {
    success: { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' },
    error:   { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' },
    info:    { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af' },
  }
  const c = colors[type]

  return (
    <div
      className="fixed bottom-6 inset-x-4 md:inset-x-auto md:right-6 md:left-auto z-50 flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm border"
      style={{ background: c.bg, borderColor: c.border, color: c.text }}
    >
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 shrink-0 text-xs font-medium">fechar</button>
    </div>
  )
}

// ── Modal de seleção de etapa ─────────────────────────────────

interface StageModalProps {
  stages:   PipelineStage[]
  onSelect: (stageId: string) => void
  onClose:  () => void
}

function StageModal({ stages, onSelect, onClose }: StageModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl md:rounded-2xl w-full max-w-sm p-5 space-y-3 shadow-2xl">
        <p className="font-semibold text-ekthos-black text-base">Em qual etapa colocar?</p>
        <div className="space-y-2">
          {stages.map((s) => (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-border-default hover:border-primary hover:bg-bg-hover text-sm font-medium text-text-primary transition-colors"
            >
              {s.name}
              <ChevronRight size={14} className="text-text-secondary" />
            </button>
          ))}
        </div>
        <button onClick={onClose} className="w-full py-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ── Badges de categoria ───────────────────────────────────────

const CATEGORY_LABELS: Record<CareQueueItem['category'], string> = {
  overdue:  'Prazo Vencido',
  no_owner: 'Sem Responsável',
  newcomer: 'Novo Convertido',
}

const CATEGORY_COLORS: Record<CareQueueItem['category'], string> = {
  overdue:  'bg-red-50 text-red-700 border border-red-200',
  no_owner: 'bg-amber-50 text-amber-700 border border-amber-200',
  newcomer: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
}

const CATEGORY_ICONS: Record<CareQueueItem['category'], React.ReactNode> = {
  overdue:  <AlertTriangle size={11} strokeWidth={2} />,
  no_owner: <Clock        size={11} strokeWidth={2} />,
  newcomer: <Heart        size={11} strokeWidth={2} />,
}

// ── CareCard ──────────────────────────────────────────────────

interface CareCardProps {
  item:     CareQueueItem
  stages:   PipelineStage[]
  onToast:  (msg: string, type: ToastState['type']) => void
}

function CareCard({ item, stages, onToast }: CareCardProps) {
  const { user } = useAuth()
  const [showStageModal, setShowStageModal] = useState(false)

  const registerTouch = useRegisterTouch()
  const assignOwner   = useJourneyAssign()
  const journeyOpen   = useJourneyOpen()
  const journeyAdvance = useJourneyAdvance()

  const isBusy = registerTouch.isPending || assignOwner.isPending || journeyOpen.isPending || journeyAdvance.isPending

  function handleVersionConflict(err: unknown) {
    const msg = String(err)
    if (msg.includes('JOURNEY_VERSION_CONFLICT')) {
      onToast('Esta jornada foi atualizada por outra pessoa ao mesmo tempo. Atualize a página para continuar.', 'info')
    } else if (msg.includes('JOURNEY_ALREADY_OPEN')) {
      onToast('Esta pessoa já tem uma jornada ativa. Atualize a página.', 'info')
    } else {
      onToast('Não foi possível realizar a ação. Tente novamente.', 'error')
    }
  }

  async function handleJaFalei() {
    try {
      if (item.category === 'newcomer') {
        // Newcomer: abre jornada no estágio atual (ou primeiro disponível)
        const stageId = item.stage_id ?? stages[0]?.id
        if (!stageId) { onToast('Esta pessoa não tem estágio configurado.', 'error'); return }
        await journeyOpen.mutateAsync({ person_id: item.person_id, stage_id: stageId })
        onToast(`Jornada de ${item.person_name.split(' ')[0]} iniciada com sucesso.`, 'success')
      } else if (item.category === 'no_owner' && item.journey_id && item.version != null) {
        // Sem responsável: atribui usuário atual
        await assignOwner.mutateAsync({
          journey_id: item.journey_id,
          expected_version: item.version,
          owner_id: user!.id,
        })
        await registerTouch.mutateAsync({ journey_id: item.journey_id, touch_type: 'pastoral_contact' })
        onToast(`Você ficou responsável por ${item.person_name.split(' ')[0]}.`, 'success')
      } else if (item.category === 'overdue' && item.journey_id) {
        await registerTouch.mutateAsync({
          journey_id: item.journey_id,
          touch_type: 'pastoral_contact',
          payload: { note: 'Contato realizado pela fila de cuidado' },
        })
        onToast(`Contato registrado para ${item.person_name.split(' ')[0]}.`, 'success')
      }
    } catch (err) {
      handleVersionConflict(err)
    }
  }

  async function handleColocarEtapa(stageId: string) {
    setShowStageModal(false)
    try {
      if (item.category === 'newcomer' || !item.journey_id) {
        await journeyOpen.mutateAsync({ person_id: item.person_id, stage_id: stageId })
        onToast(`${item.person_name.split(' ')[0]} adicionado(a) à jornada.`, 'success')
      } else if (item.version != null) {
        await journeyAdvance.mutateAsync({
          journey_id: item.journey_id,
          expected_version: item.version,
          new_stage_id: stageId,
        })
        onToast(`${item.person_name.split(' ')[0]} avançou de etapa.`, 'success')
      }
    } catch (err) {
      handleVersionConflict(err)
    }
  }

  const firstName = item.person_name.split(' ')[0]

  return (
    <>
      <div className="bg-white rounded-2xl border border-border-default p-4 space-y-3 shadow-sm">
        {/* Header do card */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-ekthos-black text-sm leading-tight truncate">
              {item.person_name}
            </p>
            {item.stage_name && (
              <p className="text-xs text-text-secondary mt-0.5">{item.stage_name}</p>
            )}
          </div>
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold shrink-0 ${CATEGORY_COLORS[item.category]}`}>
            {CATEGORY_ICONS[item.category]}
            {CATEGORY_LABELS[item.category]}
          </span>
        </div>

        {/* Contexto */}
        {item.category === 'overdue' && item.days_overdue != null && (
          <p className="text-xs text-red-600 font-medium">
            {item.days_overdue === 1
              ? 'Atraso de 1 dia'
              : `Atraso de ${item.days_overdue} dias`}
            {item.next_step ? ` — ${item.next_step}` : ''}
          </p>
        )}
        {item.category === 'newcomer' && (
          <p className="text-xs text-emerald-600 font-medium">Convertido recentemente — ainda sem acompanhamento</p>
        )}
        {item.category === 'no_owner' && (
          <p className="text-xs text-amber-600 font-medium">Ninguém está acompanhando ainda</p>
        )}

        {/* Ações */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="secondary"
            size="sm"
            loading={isBusy}
            onClick={handleJaFalei}
            className="flex-1 text-xs"
          >
            {item.category === 'newcomer' ? 'Iniciar jornada' : `Já falei com ${firstName}`}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={isBusy}
            onClick={() => setShowStageModal(true)}
            className="flex-1 text-xs"
          >
            Colocar na Etapa
          </Button>
        </div>
      </div>

      {showStageModal && (
        <StageModal
          stages={stages}
          onSelect={handleColocarEtapa}
          onClose={() => setShowStageModal(false)}
        />
      )}
    </>
  )
}

// ── Conteúdo da fila (dentro do JourneyProvider) ──────────────

function CareQueueContent() {
  const { churchId } = useAuth()
  const { data: items = [], isLoading, error, refetch, dataUpdatedAt } = useCareQueue(churchId)
  const queryClient = useQueryClient()
  const [toast, setToast] = useState<ToastState | null>(null)

  const { data: stages = [] } = useQuery<PipelineStage[]>({
    queryKey: ['pipeline-stages', churchId],
    queryFn: async () => {
      if (!churchId) return []
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id, name, order_index')
        .eq('church_id', churchId)
        .order('order_index', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!churchId,
    staleTime: 120_000,
  })

  function showToast(msg: string, type: ToastState['type']) {
    setToast({ msg, type, key: Date.now() })
  }

  const updatedLabel = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-text-secondary">
        <Spinner size="lg" />
        <p className="text-sm">Carregando a fila de cuidado…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-red-500">
        <AlertTriangle size={32} />
        <p className="text-sm font-medium">Não foi possível carregar a fila.</p>
        <Button variant="secondary" size="sm" onClick={() => void refetch()}>Tentar novamente</Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header com contador e atualização */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">
            {items.length === 0
              ? 'Fila vazia'
              : `${items.length} ${items.length === 1 ? 'pessoa' : 'pessoas'} aguardando`}
          </span>
        </div>
        <button
          onClick={() => void queryClient.invalidateQueries({ queryKey: ['care-queue', churchId] })}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-primary transition-colors"
        >
          <RefreshCw size={12} strokeWidth={2} />
          {updatedLabel ? `atualizado às ${updatedLabel}` : 'atualizar'}
        </button>
      </div>

      {/* Cards */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
            <Heart size={22} className="text-emerald-500" />
          </div>
          <p className="text-sm font-semibold text-text-primary">Tudo em dia!</p>
          <p className="text-xs text-text-secondary max-w-[200px]">
            Nenhuma pessoa aguardando acompanhamento no momento.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <CareCard
              key={item.journey_id ?? item.person_id}
              item={item}
              stages={stages}
              onToast={showToast}
            />
          ))}
          {items.length === 15 && (
            <p className="text-center text-xs text-text-secondary py-2">
              Mostrando as 15 pessoas de maior prioridade
            </p>
          )}
        </div>
      )}

      {toast && (
        <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} key={toast.key} />
      )}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────

export default function ConsolidacaoFila() {
  const { data: flagEnabled, isLoading: flagLoading } = useJourneyFlag()

  return (
    <div className="space-y-6 pb-8">
      {/* Cabeçalho */}
      <div>
        <h1 className="font-display text-xl md:text-2xl font-bold text-ekthos-black">
          Fila de Cuidado
        </h1>
        <p className="text-sm text-text-secondary mt-1">
          Pessoas que precisam de acompanhamento pastoral agora
        </p>
      </div>

      {flagLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {!flagLoading && !flagEnabled && (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-bg-hover flex items-center justify-center">
            <Loader2 size={24} className="text-text-secondary" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-semibold text-text-primary">Módulo não ativado</p>
            <p className="text-xs text-text-secondary max-w-[220px]">
              A jornada unificada ainda não está ativa para esta igreja.
              Entre em contato com a equipe Ekthos para habilitar.
            </p>
          </div>
        </div>
      )}

      {!flagLoading && flagEnabled && (
        <JourneyProvider>
          <CareQueueContent />
        </JourneyProvider>
      )}
    </div>
  )
}
