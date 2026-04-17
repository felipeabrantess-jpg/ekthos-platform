import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, AlertCircle, ArrowRight, Circle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Tipos ──────────────────────────────────────────────────

interface Step {
  step_number: number
  label:       string
  status:      'pending' | 'running' | 'done' | 'failed' | 'skipped'
  error_msg?:  string | null
}

// ── Labels por step ────────────────────────────────────────

const STEP_LABELS: Record<number, string> = {
  1:  'Criando sua igreja',
  2:  'Registrando sedes',
  3:  'Configurando caminho de discipulado',
  4:  'Criando campos personalizados',
  5:  'Configurando categorias',
  6:  'Criando ministérios',
  7:  'Estruturando rede de células',
  8:  'Cadastrando equipe',
  9:  'Configurando alertas',
  10: 'Ativando Agente Suporte (grátis)',
  11: 'Ativando agentes do plano',
  12: 'Processando agentes adicionais',
  13: 'Criando automações pastorais',
  14: 'Montando dashboard',
  15: 'Configurando calendário de cultos',
  16: 'Criando templates de mensagem',
  17: 'Configurando relatórios automáticos',
  18: 'Preparando importação de dados',
  19: 'Definindo metas pastorais',
  20: 'Finalizando configuração',
}

// ── Step row ───────────────────────────────────────────────

function StepRow({ step }: { step: Step }) {
  const isRunning = step.status === 'running'
  const isDone    = step.status === 'done'
  const isFailed  = step.status === 'failed'
  const isPending = step.status === 'pending' || step.status === 'skipped'

  return (
    <div
      className={`flex items-center gap-3.5 px-4 py-2.5 rounded-2xl transition-all duration-500 ${
        isRunning ? 'bg-red-50'
        : isDone  ? 'bg-emerald-50/50'
        : ''
      }`}
    >
      {/* Ícone */}
      <div className="w-6 h-6 flex items-center justify-center shrink-0">
        {isDone && (
          <span className="check-pop">
            <CheckCircle2 size={20} strokeWidth={2} style={{ color: '#2D7A4F' }} />
          </span>
        )}
        {isFailed && (
          <AlertCircle size={20} strokeWidth={2} style={{ color: '#E13500' }} />
        )}
        {isRunning && (
          <div
            className="w-[18px] h-[18px] rounded-full border-[2.5px] border-t-transparent animate-spin"
            style={{ borderColor: '#E13500', borderTopColor: 'transparent' }}
          />
        )}
        {isPending && (
          <Circle size={16} strokeWidth={1.5} style={{ color: '#DCDCDC' }} />
        )}
      </div>

      {/* Label */}
      <span
        className={`text-sm flex-1 transition-colors duration-300 ${
          isDone    ? 'text-gray-400'
          : isRunning ? 'font-semibold text-gray-900'
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
                style={{ background: '#E13500', animationDelay: `${i * 120}ms` }}
              />
            ))}
          </span>
        )}
      </span>

      {/* Número */}
      <span
        className={`text-[10px] font-bold tabular-nums transition-colors shrink-0 ${
          isDone ? 'text-emerald-400' : isPending ? 'text-gray-300' : ''
        }`}
        style={isRunning ? { color: '#E13500' } : {}}
      >
        {step.step_number}/20
      </span>
    </div>
  )
}

// ── Tips rotativos ─────────────────────────────────────────

const TIPS = [
  'Configurando o caminho de discipulado da sua congregação...',
  'Cada célula, cada membro — tudo sendo preparado com cuidado.',
  'Seus agentes de IA já estão aprendendo sobre a dinâmica da sua igreja.',
  'As automações pastorais vão economizar horas de trabalho toda semana.',
  'Em instantes o pastor terá uma visão completa da saúde da congregação.',
]

function TipRotator() {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIndex(i => (i + 1) % TIPS.length), 4000)
    return () => clearInterval(t)
  }, [])
  return (
    <p className="text-sm text-gray-400 italic text-center leading-relaxed max-w-xs">
      {TIPS[index]}
    </p>
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
  const [engineError, setEngineError] = useState('')
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)

  // Placeholders enquanto o engineer não chegou
  useEffect(() => {
    setSteps(
      Array.from({ length: 20 }, (_, i) => ({
        step_number: i + 1,
        label:       STEP_LABELS[i + 1],
        status:      'pending',
      }))
    )
  }, [])

  // Realtime: onboarding_steps
  useEffect(() => {
    if (!sessionId) return

    const channel = supabase
      .channel(`onboarding-steps-${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'onboarding_steps', filter: `session_id=eq.${sessionId}` },
        payload => {
          const updated = payload.new as Step
          setSteps(prev => prev.map(s =>
            s.step_number === updated.step_number ? { ...s, ...updated } : s
          ))
        }
      )
      .subscribe()

    channelRef.current = channel
    return () => { void supabase.removeChannel(channel) }
  }, [sessionId])

  // Detecta conclusão
  useEffect(() => {
    if (!steps.length) return
    const allTerminated = steps.every(
      s => s.status === 'done' || s.status === 'failed' || s.status === 'skipped'
    )
    if (allTerminated && steps.some(s => s.status === 'done') && !isDone) setIsDone(true)
  }, [steps, isDone])

  // Dispara engineer uma vez
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

      setIsDone(true)
    } catch (err: unknown) {
      setEngineError((err as { message?: string }).message ?? 'Erro desconhecido')
    }
  }

  function goToDashboard() {
    // Hard reload para que useAuth re-inicialize com o novo churchStatus = 'configured'
    window.location.href = '/dashboard'
  }

  const doneCount   = steps.filter(s => s.status === 'done').length
  const progressPct = Math.round((doneCount / 20) * 100)
  const currentStep = steps.find(s => s.status === 'running')

  return (
    <>
      {/* Animações CSS */}
      <style>{`
        @keyframes checkPop {
          0%   { transform: scale(0) rotate(-12deg); opacity: 0; }
          65%  { transform: scale(1.18) rotate(4deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        .check-pop {
          display: inline-flex;
          animation: checkPop 0.38s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        @keyframes fadeSlideUp {
          0%   { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .fade-slide-up {
          animation: fadeSlideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>

      <div
        className="min-h-screen flex flex-col items-center justify-start py-12 px-4"
        style={{ background: '#F9EEDC' }}
      >
        {/* Logo / Header */}
        <div className="text-center mb-10">
          <div
            className="inline-flex items-center justify-center w-12 h-12 rounded-2xl font-bold text-xl text-white mb-5 shadow-sm"
            style={{ background: '#E13500' }}
          >
            E
          </div>
          <h1
            className="text-2xl font-bold text-gray-900 mb-1"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            {isDone ? 'Seu CRM está pronto!' : 'Configurando seu CRM'}
          </h1>
          <p className="text-sm text-gray-400">
            {isDone
              ? 'Tudo preparado especialmente para a sua igreja.'
              : 'Aguarde cerca de 30 segundos...'}
          </p>
        </div>

        {/* Card principal */}
        <div className="w-full max-w-lg bg-white rounded-3xl border border-black/[0.06] shadow-sm overflow-hidden">

          {/* Barra de progresso */}
          <div className="px-6 pt-6 pb-5 border-b border-black/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-gray-700 truncate mr-4">
                {isDone
                  ? 'Configuração concluída'
                  : (currentStep?.label ?? 'Iniciando...')}
              </span>
              <span
                className="text-sm font-bold tabular-nums shrink-0 transition-colors duration-500"
                style={{ color: isDone ? '#2D7A4F' : '#E13500' }}
              >
                {progressPct}%
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: '#F0F0F0' }}>
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width:      `${progressPct}%`,
                  background: isDone ? '#2D7A4F' : '#E13500',
                }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {doneCount} de 20 etapas concluídas
            </p>
          </div>

          {/* Lista de steps */}
          <div className="px-3 py-3 max-h-96 overflow-y-auto space-y-0.5">
            {steps.map(step => (
              <StepRow key={step.step_number} step={step} />
            ))}
          </div>

          {/* Estado de conclusão */}
          {isDone && !engineError && (
            <div className="px-6 pb-6 pt-5 border-t border-black/[0.06] fade-slide-up">
              <div className="flex flex-col items-center text-center mb-6">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4 check-pop"
                  style={{ background: '#F0FDF4' }}
                >
                  <CheckCircle2 size={30} strokeWidth={1.75} style={{ color: '#2D7A4F' }} />
                </div>
                <h3
                  className="text-xl font-bold text-gray-900 mb-1"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  Bem-vindo à Ekthos!
                </h3>
                <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
                  Seu CRM está configurado e personalizado para a operação pastoral da sua igreja.
                </p>
              </div>
              <button
                onClick={goToDashboard}
                className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-semibold text-white text-base transition-all hover:opacity-90 active:scale-[0.99]"
                style={{ background: '#E13500' }}
              >
                Ir para o Dashboard
                <ArrowRight size={18} strokeWidth={2} />
              </button>
            </div>
          )}

          {/* Erro parcial */}
          {engineError && (
            <div
              className="px-6 py-5 border-t border-black/[0.06]"
              style={{ background: '#FFF5F2' }}
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle size={18} strokeWidth={2} style={{ color: '#E13500', flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p className="text-sm font-semibold text-red-700 mb-0.5">Problema parcial detectado</p>
                  <p className="text-xs text-red-600 leading-relaxed">{engineError}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    As etapas concluídas foram salvas. Fale com o suporte para continuar.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Tips rotativos */}
        {!isDone && (
          <div className="mt-8 max-w-sm">
            <TipRotator />
          </div>
        )}
      </div>
    </>
  )
}
