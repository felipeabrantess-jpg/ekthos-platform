import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle, Clock, AlertCircle, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Tipos ──────────────────────────────────────────────────

interface Step {
  step_number: number
  label:       string
  status:      'pending' | 'running' | 'done' | 'failed' | 'skipped'
  error_msg?:  string | null
}

// ── Labels e ícones ────────────────────────────────────────

const STEP_EMOJIS: Record<number, string> = {
  1:  'Criando sua igreja...',
  2:  'Registrando sedes...',
  3:  'Configurando caminho de discipulado...',
  4:  'Criando campos personalizados...',
  5:  'Configurando categorias...',
  6:  'Criando ministérios...',
  7:  'Estruturando rede de células...',
  8:  'Cadastrando equipe...',
  9:  'Configurando alertas...',
  10: 'Ativando Agente Suporte (grátis)...',
  11: 'Ativando agentes do plano...',
  12: 'Processando agentes adicionais...',
  13: 'Criando automações...',
  14: 'Montando dashboard...',
  15: 'Configurando calendário de cultos...',
  16: 'Criando templates de mensagem...',
  17: 'Configurando relatórios automáticos...',
  18: 'Preparando importação de dados...',
  19: 'Definindo metas pastorais...',
  20: 'Finalizando configuração...',
}

// ── Componente de step ─────────────────────────────────────

function StepRow({ step }: { step: Step }) {
  const isRunning = step.status === 'running'
  const isDone    = step.status === 'done'
  const isFailed  = step.status === 'failed'
  const isPending = step.status === 'pending'

  return (
    <div
      className={`flex items-center gap-3 py-2.5 px-4 rounded-xl transition-all ${
        isRunning ? 'bg-red-50' : isDone ? 'bg-emerald-50/50' : ''
      }`}
    >
      {/* Ícone */}
      <div className="w-6 h-6 flex items-center justify-center shrink-0">
        {isDone && (
          <CheckCircle size={18} strokeWidth={2} style={{ color: '#2D7A4F' }} />
        )}
        {isFailed && (
          <AlertCircle size={18} strokeWidth={2} style={{ color: '#e13500' }} />
        )}
        {isRunning && (
          <div className="relative">
            <div
              className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: '#e13500', borderTopColor: 'transparent' }}
            />
          </div>
        )}
        {isPending && (
          <Clock size={16} strokeWidth={1.75} style={{ color: '#D0D0D0' }} />
        )}
      </div>

      {/* Label */}
      <span
        className={`text-sm flex-1 ${
          isDone    ? 'text-gray-500 line-through'
          : isRunning ? 'font-semibold text-gray-800'
          : isFailed  ? 'text-red-600'
          : 'text-gray-300'
        }`}
      >
        {step.label}
        {isRunning && (
          <span className="ml-2 inline-flex gap-0.5">
            {[0, 1, 2].map(i => (
              <span
                key={i}
                className="inline-block w-1 h-1 rounded-full animate-bounce"
                style={{ background: '#e13500', animationDelay: `${i * 150}ms` }}
              />
            ))}
          </span>
        )}
      </span>

      {/* Step number */}
      <span className="text-xs font-mono-ekthos text-gray-300">{step.step_number}/20</span>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────

export default function OnboardingConfiguring() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const sessionId      = searchParams.get('session_id')

  const [steps,       setSteps]       = useState<Step[]>([])
  const [started,     setStarted]     = useState(false)
  const [isDone,      setIsDone]      = useState(false)
  const [churchId,    setChurchId]    = useState<string | null>(null)
  const [engineError, setEngineError] = useState('')
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Inicializa steps placeholders enquanto o engineer não chegou
  useEffect(() => {
    const placeholders: Step[] = Array.from({ length: 20 }, (_, i) => ({
      step_number: i + 1,
      label:       STEP_EMOJIS[i + 1],
      status:      'pending',
    }))
    setSteps(placeholders)
  }, [])

  // Subscreve ao Realtime de onboarding_steps
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`onboarding-steps-${sessionId}`)
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'onboarding_steps',
          filter: `session_id=eq.${sessionId}`,
        },
        (payload) => {
          const updated = payload.new as Step
          setSteps(prev =>
            prev.map(s => s.step_number === updated.step_number ? { ...s, ...updated } : s)
          )
        }
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [sessionId])

  // Verifica quando todos os steps foram concluídos
  useEffect(() => {
    if (steps.length === 0) return
    const allTerminated = steps.every(s => s.status === 'done' || s.status === 'failed' || s.status === 'skipped')
    const allDone = allTerminated && steps.some(s => s.status === 'done')
    if (allDone && !isDone) {
      setIsDone(true)
    }
  }, [steps, isDone])

  // Dispara o Agente Engenheiro
  useEffect(() => {
    if (started || !sessionId) return
    setStarted(true)
    void callEngineer()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function callEngineer() {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/login'); return }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

      const res = await fetch(`${SUPABASE_URL}/functions/v1/onboarding-engineer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ session_id: sessionId }),
      })

      if (!res.ok) {
        const err = await res.json() as { error?: string }
        throw new Error(err.error ?? 'Erro no engenheiro')
      }

      const result = await res.json() as { success: boolean; church_id?: string }
      setChurchId(result.church_id ?? null)
      setIsDone(true)
    } catch (err: unknown) {
      setEngineError((err as { message?: string }).message ?? 'Erro desconhecido')
    }
  }

  function goToDashboard() {
    // Força reload para que useAuth pegue o novo church_id do user_metadata
    window.location.href = '/dashboard'
  }

  // Calcula progresso
  const doneCount    = steps.filter(s => s.status === 'done').length
  const currentStep  = steps.find(s => s.status === 'running')
  const progressPct  = Math.round((doneCount / 20) * 100)

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4" style={{ background: '#f9eedc' }}>
      {/* Logo */}
      <div className="text-center mb-8">
        <h1 className="font-display text-3xl font-bold" style={{ color: '#e13500' }}>Ekthos</h1>
        {isDone
          ? <p className="text-sm text-gray-500 mt-1">Seu CRM está pronto!</p>
          : <p className="text-sm text-gray-500 mt-1">Configurando seu CRM — aguarde cerca de 30 segundos</p>}
      </div>

      {/* Card principal */}
      <div className="w-full max-w-xl bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">

        {/* Barra de progresso */}
        <div className="px-6 pt-6 pb-4 border-b border-black/5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-gray-700">
              {isDone ? 'Configuração concluída' : currentStep?.label ?? 'Iniciando...'}
            </span>
            <span className="font-mono-ekthos text-sm font-bold" style={{ color: '#e13500' }}>
              {progressPct}%
            </span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width:      `${progressPct}%`,
                background: isDone ? '#2D7A4F' : '#e13500',
              }}
            />
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            {doneCount} de 20 etapas concluídas
          </p>
        </div>

        {/* Lista de steps */}
        <div className="px-2 py-3 max-h-96 overflow-y-auto">
          {steps.map(step => (
            <StepRow key={step.step_number} step={step} />
          ))}
        </div>

        {/* Estado de conclusão */}
        {isDone && !engineError && (
          <div className="px-6 pb-6 pt-4 border-t border-black/5">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <CheckCircle size={24} strokeWidth={2} style={{ color: '#2D7A4F' }} />
              </div>
              <h3 className="font-display text-xl font-semibold text-gray-900">
                Seu CRM está pronto!
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Tudo configurado especialmente para a sua igreja.
                <br />
                Bem-vindo à Ekthos!
              </p>
            </div>
            <button
              onClick={goToDashboard}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white transition-all"
              style={{ background: '#e13500' }}
            >
              Ir para o Dashboard
              <ArrowRight size={18} strokeWidth={1.75} />
            </button>
          </div>
        )}

        {/* Erro do engenheiro */}
        {engineError && (
          <div className="px-6 py-4 border-t border-black/5 bg-red-50">
            <p className="text-sm text-red-700 font-semibold mb-1">Ocorreu um problema parcial</p>
            <p className="text-xs text-red-600">{engineError}</p>
            <p className="text-xs text-red-600 mt-1">
              Não se preocupe — as etapas concluídas foram salvas. Entre em contato com o suporte.
            </p>
          </div>
        )}
      </div>

      {/* Dicas durante o carregamento */}
      {!isDone && (
        <div className="mt-6 max-w-xl text-center">
          <TipRotator />
        </div>
      )}
    </div>
  )
}

// ── Dicas rotativas ────────────────────────────────────────

const TIPS = [
  'Estamos criando as etapas do caminho de discipulado da sua igreja...',
  'Cada célula, cada membro, cada meta — tudo sendo configurado com cuidado.',
  'Seus agentes de IA já estão aprendendo sobre a dinâmica da sua congregação.',
  'As automações pastorais vão economizar horas de trabalho manual toda semana.',
  'Em instantes o pastor terá uma visão completa da saúde da congregação.',
]

function TipRotator() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(i => (i + 1) % TIPS.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  return (
    <p className="text-sm text-gray-400 italic transition-opacity">
      {TIPS[index]}
    </p>
  )
}
