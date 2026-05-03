/**
 * AgentDetail.tsx — /agentes/:slug
 *
 * Estados:
 *  - "active"       → agente em uso; instrução de uso na sidebar
 *  - "contractable" → elegível, não ativo
 *                     CTA: [Adicionar ao meu plano] + [Falar com consultor]
 *  - "module-bound" → vinculado a módulo
 *                     CTA: [Conhecer módulo] → /modulos/:moduleId
 *  - "unavailable"  → plano incompatível (ex: agent-whatsapp no Missão)
 *                     CTA: [Falar com consultor]
 *
 * REGRA: "Testar 7 dias grátis" continua DESABILITADO (Fase 6)
 */

import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Lock, MessageCircle, Loader2, Check, AlertCircle } from 'lucide-react'
import { usePlan } from '@/hooks/usePlan'
import { getAgentContent } from '@/lib/agents-content'
import { useAddonActions } from '@/hooks/useAddonActions'
import Button from '@/components/ui/Button'
import { AgentStatusBlock } from '@/components/agents/AgentStatusBlock'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type AgentState = 'active' | 'contractable' | 'module-bound' | 'unavailable'

function getAgentState(
  slug: string,
  hasAgent: (s: string) => boolean,
  planSlug: string,
  moduleId?: string
): AgentState {
  if (slug === 'agent-whatsapp' && planSlug !== 'avivamento') return 'unavailable'
  if (hasAgent(slug)) return 'active'
  if (moduleId) return 'module-bound'
  return 'contractable'
}

function formatPrice(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

// ── Toast inline ─────────────────────────────────────────────────────────────

function Toast({ ok, message, onClose }: { ok: boolean; message: string; onClose: () => void }) {
  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-2xl border ${
        ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
      }`}
    >
      {ok
        ? <Check size={16} className="text-green-600 shrink-0 mt-0.5" strokeWidth={2.5} />
        : <AlertCircle size={16} className="text-red-600 shrink-0 mt-0.5" strokeWidth={2} />
      }
      <p className={`text-sm flex-1 ${ok ? 'text-green-800' : 'text-red-800'}`}>{message}</p>
      <button onClick={onClose} className="text-xs opacity-40 hover:opacity-70 shrink-0">✕</button>
    </div>
  )
}

// ── CTA por estado ────────────────────────────────────────────────────────────

interface CTAProps {
  state: AgentState
  slug: string
  moduleId?: string
  planSlug: string
}

function AgentCTA({ state, slug, moduleId }: CTAProps) {
  const { adicionarAoPlano, falarComConsultor, loadingAddon, loadingConsultor } = useAddonActions()
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleAdicionar() {
    setToast(null)
    const result = await adicionarAoPlano('agent', slug)
    setToast({ ok: result.ok, message: result.message })
  }

  async function handleConsultor(context: 'agent' | 'plan') {
    setToast(null)
    const result = await falarComConsultor(context, slug)
    setToast({ ok: result.ok, message: result.message })
  }

  if (state === 'active') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-100 rounded-2xl">
          <CheckCircle2 size={20} className="text-green-500 shrink-0" strokeWidth={2} />
          <div>
            <p className="text-sm font-semibold text-green-800">Agente ativo</p>
            <p className="text-xs text-green-600 mt-0.5">
              Converse com este agente agora.
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link to={`/agentes/${slug}/conversar`} className="flex-1">
            <Button variant="primary" className="w-full">
              Conversar com agente →
            </Button>
          </Link>
          <Link to={`/agentes/${slug}/configurar`}>
            <Button variant="outline" className="px-4">
              Configurar
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (state === 'module-bound') {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-4 bg-brand-50 border border-brand-100 rounded-2xl">
          <Lock size={18} className="text-brand-400 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-semibold text-brand-900">Disponível via módulo</p>
            <p className="text-xs text-brand-600 mt-0.5">
              Este agente faz parte de um módulo pago. Conheça o módulo para adicionar ao seu plano.
            </p>
          </div>
        </div>
        <Link to={`/modulos/${moduleId}`}>
          <Button variant="primary" className="w-full">
            Conhecer módulo →
          </Button>
        </Link>
      </div>
    )
  }

  if (state === 'unavailable') {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-100 rounded-2xl">
          <Lock size={18} className="text-amber-500 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-semibold text-amber-900">Exclusivo do plano Avivamento</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Este agente está disponível apenas no plano Avivamento. Fale com um consultor para fazer o upgrade.
            </p>
          </div>
        </div>
        {toast && <Toast ok={toast.ok} message={toast.message} onClose={() => setToast(null)} />}
        <Button
          variant="primary"
          className="w-full"
          disabled={loadingConsultor}
          onClick={() => void handleConsultor('plan')}
        >
          {loadingConsultor ? (
            <><Loader2 size={14} className="animate-spin mr-2" />Enviando...</>
          ) : (
            'Falar com consultor'
          )}
        </Button>
      </div>
    )
  }

  // ── contractable: CTAs reais ─────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {toast && <Toast ok={toast.ok} message={toast.message} onClose={() => setToast(null)} />}

      <Button
        variant="primary"
        className="w-full"
        disabled={loadingAddon || !!toast?.ok}
        onClick={() => void handleAdicionar()}
      >
        {loadingAddon ? (
          <><Loader2 size={14} className="animate-spin mr-2" />Registrando pedido...</>
        ) : toast?.ok ? (
          <><Check size={14} className="mr-2" />Pedido registrado!</>
        ) : (
          'Adicionar ao meu plano'
        )}
      </Button>

      <Button
        variant="secondary"
        className="w-full"
        disabled={loadingConsultor}
        onClick={() => void handleConsultor('agent')}
      >
        {loadingConsultor ? (
          <><Loader2 size={14} className="animate-spin mr-2" />Enviando...</>
        ) : (
          'Falar com consultor'
        )}
      </Button>

      {/* Trial desabilitado — Fase 6 */}
      <div className="group relative">
        <button
          disabled
          className="w-full text-xs text-ekthos-black/30 cursor-not-allowed py-1 hover:text-ekthos-black/40 transition-colors"
        >
          Testar 7 dias grátis — disponível em breve
        </button>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AgentDetail() {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { hasAgent, planSlug, isLoading, allAgents } = usePlan()

  const content = slug ? getAgentContent(slug) : undefined
  const catalogAgent = allAgents.find(a => a.slug === slug)

  if (!content || !catalogAgent) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-ekthos-black/50">Agente não encontrado.</p>
        <Link to="/agentes" className="mt-3 text-xs text-brand-600 hover:underline">
          ← Voltar para Agentes
        </Link>
      </div>
    )
  }

  const state = getAgentState(slug!, hasAgent, planSlug, content.moduleId)
  const { Icon } = content

  return (
    <div className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-ekthos-black/40 hover:text-ekthos-black/70 transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={2} />
        Agentes IA
      </button>

      {/* C1: Bloco de status de ativação (pending_activation, in_setup, paused, cancelled) */}
      <AgentStatusBlock slug={slug!} />

      {/* Hero */}
      <div className="flex items-start gap-5">
        <div
          className="h-14 w-14 rounded-2xl border flex items-center justify-center shrink-0"
          style={{ background: 'rgba(225,53,0,0.06)', borderColor: 'rgba(225,53,0,0.12)' }}
        >
          <Icon size={26} className="text-brand-600" strokeWidth={1.75} />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="font-display text-2xl font-bold text-ekthos-black">{content.name}</h1>
            {content.badge && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
                {content.badge}
              </span>
            )}
          </div>
          <p className="text-sm text-ekthos-black/55 mt-1">{content.shortDesc}</p>
          {content.price && state === 'contractable' && (
            <p className="text-sm font-bold text-brand-600 mt-2">
              {formatPrice(content.price)}/mês
            </p>
          )}
        </div>
      </div>

      {/* CTA */}
      {!isLoading && (
        <AgentCTA
          state={state}
          slug={slug!}
          moduleId={content.moduleId}
          planSlug={planSlug}
        />
      )}

      {/* Descrição */}
      <div className="bg-white border border-cream-dark/60 rounded-2xl p-5 space-y-5">
        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-2">O que faz</h2>
          <p className="text-sm text-ekthos-black/70 leading-relaxed">{content.longDesc}</p>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">Como funciona</h2>
          <ul className="space-y-2">
            {content.howItWorks.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <div className="mt-0.5 h-4 w-4 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                  <span className="text-[9px] font-bold text-brand-700">{i + 1}</span>
                </div>
                <span className="text-sm text-ekthos-black/65">{step}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-2">Para quem</h2>
          <p className="text-sm text-ekthos-black/60 leading-relaxed">{content.forWhom}</p>
        </div>

        {content.note && (
          <div className="flex items-start gap-2.5 p-3 bg-brand-50 border border-brand-100 rounded-xl">
            <MessageCircle size={14} className="text-brand-500 shrink-0 mt-0.5" strokeWidth={1.75} />
            <p className="text-xs text-brand-700 leading-relaxed">{content.note}</p>
          </div>
        )}
      </div>
    </div>
  )
}
