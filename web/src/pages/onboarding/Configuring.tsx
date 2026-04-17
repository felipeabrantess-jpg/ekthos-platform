import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CheckCircle2, AlertCircle, ArrowRight, Circle,
  Bot, Sparkles, MapPin, Users, GitBranch, Network,
  Building2,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Tipos ──────────────────────────────────────────────────

interface Step {
  step_number: number
  label:       string
  status:      'pending' | 'running' | 'done' | 'failed' | 'skipped'
  error_msg?:  string | null
}

interface ConfigSummary {
  churchName:    string
  city:          string
  state:         string
  ministries:    string[]
  cells:         number
  pipeline:      string[]
  primaryColor:  string
  secondaryColor: string
  logoUrl:       string | null
  agentsFree:    string[]
  agentsIncluded: string[]
  agentsRecommended: string[]
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

// ── Mapa slug → nome legível ───────────────────────────────
const AGENT_NAMES: Record<string, string> = {
  'agent-suporte':       'Suporte 24h',
  'agent-onboarding':   'Onboarding de Líderes',
  'agent-cadastro':     'Cadastro Inteligente',
  'agent-conteudo':     'Conteúdo Pastoral',
  'agent-whatsapp':     'WhatsApp Pastoral',
  'agent-financeiro':   'Financeiro Pastoral',
  'agent-metricas':     'Métricas Pastorais',
  'agent-reengajamento':'Reengajamento Pastoral',
  'agent-agenda':       'Agenda Pastoral',
  'agent-escalas':      'Escalas',
  'agent-relatorios':   'Relatórios',
  'agent-cuidado':      'Cuidado Pastoral',
  'agent-funil':        'Funil e Consolidação',
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

// ── Tela de conclusão rica ─────────────────────────────────

function CompletionScreen({
  summary,
  onEnter,
}: {
  summary: ConfigSummary
  onEnter: () => void
}) {
  return (
    <div className="px-6 pb-6 pt-5 border-t border-black/[0.06] fade-slide-up space-y-5">

      {/* Ícone + título */}
      <div className="flex flex-col items-center text-center">
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mb-4 check-pop"
          style={{ background: '#F0FDF4' }}
        >
          <CheckCircle2 size={30} strokeWidth={1.75} style={{ color: '#2D7A4F' }} />
        </div>
        <h3 className="text-xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Georgia, serif' }}>
          Bem-vindo à Ekthos!
        </h3>
        <p className="text-sm text-gray-500 max-w-xs leading-relaxed">
          Seu CRM está configurado e personalizado para a operação pastoral da sua igreja.
        </p>
      </div>

      {/* Identidade visual */}
      <div
        className="rounded-2xl p-4 flex items-center gap-4"
        style={{ background: '#F9EEDC' }}
      >
        {summary.logoUrl ? (
          <img
            src={summary.logoUrl}
            alt={summary.churchName}
            className="h-10 w-auto object-contain rounded shrink-0"
          />
        ) : (
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-base"
            style={{ background: summary.primaryColor }}
          >
            {summary.churchName.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{summary.churchName}</p>
          {(summary.city || summary.state) && (
            <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
              <MapPin size={10} strokeWidth={2} />
              {[summary.city, summary.state].filter(Boolean).join(', ')}
            </p>
          )}
        </div>
        {/* Paleta de cores */}
        <div className="flex gap-1 ml-auto shrink-0">
          <div
            className="w-5 h-5 rounded-full border border-black/10"
            style={{ background: summary.primaryColor }}
            title={summary.primaryColor}
          />
          <div
            className="w-5 h-5 rounded-full border border-black/10"
            style={{ background: summary.secondaryColor }}
            title={summary.secondaryColor}
          />
        </div>
      </div>

      {/* Resumo configurado */}
      <div className="grid grid-cols-2 gap-2">
        {summary.ministries.length > 0 && (
          <div className="rounded-xl border border-black/[0.06] bg-white p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Building2 size={13} strokeWidth={2} style={{ color: '#E13500' }} />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Ministérios</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{summary.ministries.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">
              {summary.ministries.slice(0, 2).join(', ')}{summary.ministries.length > 2 ? '…' : ''}
            </p>
          </div>
        )}
        {summary.cells > 0 && (
          <div className="rounded-xl border border-black/[0.06] bg-white p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Network size={13} strokeWidth={2} style={{ color: '#E13500' }} />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Células</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{summary.cells}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">estruturadas</p>
          </div>
        )}
        {summary.pipeline.length > 0 && (
          <div className={`rounded-xl border border-black/[0.06] bg-white p-3 ${summary.ministries.length === 0 && summary.cells === 0 ? 'col-span-2' : ''}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <GitBranch size={13} strokeWidth={2} style={{ color: '#E13500' }} />
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Pipeline</p>
            </div>
            <p className="text-2xl font-bold text-gray-900">{summary.pipeline.length}</p>
            <p className="text-[11px] text-gray-400 mt-0.5">etapas de discipulado</p>
          </div>
        )}
        <div className="rounded-xl border border-black/[0.06] bg-white p-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Users size={13} strokeWidth={2} style={{ color: '#E13500' }} />
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Agentes</p>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {summary.agentsFree.length + summary.agentsIncluded.length}
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">ativos no CRM</p>
        </div>
      </div>

      {/* Agentes ativos */}
      {(summary.agentsFree.length > 0 || summary.agentsIncluded.length > 0) && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Agentes ativos
          </p>
          <div className="space-y-1.5">
            {[...summary.agentsFree, ...summary.agentsIncluded].map(slug => (
              <div
                key={slug}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-100"
              >
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: '#E13500' }}>
                  <Bot size={13} strokeWidth={1.75} className="text-white" />
                </div>
                <span className="text-sm text-gray-700 flex-1">
                  {AGENT_NAMES[slug] ?? slug}
                </span>
                <CheckCircle2 size={14} strokeWidth={2} style={{ color: '#2D7A4F', flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Agentes recomendados */}
      {summary.agentsRecommended.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
            Recomendados para você
          </p>
          <div className="space-y-1.5">
            {summary.agentsRecommended.map(slug => (
              <div
                key={slug}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white border border-black/[0.07]"
              >
                <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'rgba(225,53,0,0.08)' }}>
                  <Sparkles size={12} strokeWidth={1.75} style={{ color: '#E13500' }} />
                </div>
                <span className="text-sm text-gray-600 flex-1">
                  {AGENT_NAMES[slug] ?? slug}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-2 text-center">
            Ative-os em <strong>Agentes IA</strong> após entrar no CRM.
          </p>
        </div>
      )}

      {/* CTA */}
      <button
        onClick={onEnter}
        className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl font-semibold text-white text-base transition-all hover:opacity-90 active:scale-[0.99]"
        style={{ background: '#E13500' }}
      >
        Entrar no CRM
        <ArrowRight size={18} strokeWidth={2} />
      </button>
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
  const [engineError, setEngineError] = useState('')
  const [summary,     setSummary]     = useState<ConfigSummary | null>(null)
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

      // Carrega summary da sessão para a tela de conclusão
      await loadSummary()
      setIsDone(true)
    } catch (err: unknown) {
      setEngineError((err as { message?: string }).message ?? 'Erro desconhecido')
    }
  }

  async function loadSummary() {
    if (!sessionId) return
    try {
      const { data } = await supabase
        .from('onboarding_sessions')
        .select('config_json, recommended_agents')
        .eq('id', sessionId)
        .single()

      if (!data?.config_json) return
      const c       = data.config_json as Record<string, unknown>
      const tenant  = (c.tenant  as Record<string, unknown>) ?? {}
      const agents  = (c.agents  as Record<string, unknown>) ?? {}
      const pipeline = (c.pipeline as Record<string, unknown>) ?? {}
      const depts    = (c.departments as Array<{ name: string }>) ?? []
      const cells    = ((c.cell_network as Record<string, unknown>)?.total_cells as number) ?? 0

      setSummary({
        churchName:        (tenant.name  as string) ?? '',
        city:              (tenant.city  as string) ?? '',
        state:             (tenant.state as string) ?? '',
        logoUrl:           (tenant.logo_url      as string | null) ?? null,
        primaryColor:      (tenant.primary_color  as string) ?? '#E13500',
        secondaryColor:    (tenant.secondary_color as string) ?? '#670000',
        ministries:        depts.map(d => d.name),
        cells,
        pipeline:          ((pipeline.stages as Array<{ name: string }>) ?? []).map(s => s.name),
        agentsFree:        (agents.free              as string[]) ?? [],
        agentsIncluded:    (agents.included_in_plan  as string[]) ?? [],
        agentsRecommended: (data.recommended_agents  as string[]) ?? [],
      })
    } catch {
      // summary falha silenciosamente — botão "Entrar no CRM" ainda funciona
    }
  }

  function goToDashboard() {
    navigate('/dashboard')
  }

  const doneCount   = steps.filter(s => s.status === 'done').length
  const progressPct = Math.round((doneCount / 20) * 100)
  const currentStep = steps.find(s => s.status === 'running')

  return (
    <>
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
        {/* Header */}
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

          {/* Conclusão rica */}
          {isDone && !engineError && summary && (
            <CompletionScreen summary={summary} onEnter={goToDashboard} />
          )}

          {/* Fallback: conclusão sem summary (raro) */}
          {isDone && !engineError && !summary && (
            <div className="px-6 pb-6 pt-5 border-t border-black/[0.06] fade-slide-up">
              <div className="flex flex-col items-center text-center mb-6">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4 check-pop"
                  style={{ background: '#F0FDF4' }}
                >
                  <CheckCircle2 size={30} strokeWidth={1.75} style={{ color: '#2D7A4F' }} />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1" style={{ fontFamily: 'Georgia, serif' }}>
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
                Entrar no CRM
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
