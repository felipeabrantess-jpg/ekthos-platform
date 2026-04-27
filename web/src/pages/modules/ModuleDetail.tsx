/**
 * ModuleDetail.tsx — /modulos/:id
 *
 * Página genérica de módulo pago.
 *
 * Regras:
 *  - Sempre bloqueado — sem botão de compra funcional (placeholder Fase 4 / Stripe)
 *  - "Testar 7 dias grátis" DESABILITADO
 *  - Financeiro Pro: consultive = true → sem CTA de compra, apenas contato
 *  - CTAs desabilitados com tooltip "Em breve"
 */

import { useParams, Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock, CheckCircle2, Plus } from 'lucide-react'
import { getModuleContent, type ModuleContent } from '@/lib/modules-content'
import Button from '@/components/ui/Button'

// ── Feature list ──────────────────────────────────────────────────────────────

function FeatureList({ features }: { features: ModuleContent['features'] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {features.map((f, i) => (
        <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
          <CheckCircle2 size={15} className="text-brand-500 shrink-0 mt-0.5" strokeWidth={2} />
          <div>
            <p className="text-xs font-semibold text-ekthos-black">{f.label}</p>
            <p className="text-xs text-ekthos-black/50 mt-0.5 leading-relaxed">{f.description}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Agents list ───────────────────────────────────────────────────────────────

function AgentsList({ agents }: { agents: ModuleContent['agents'] }) {
  return (
    <div className="space-y-2">
      {agents.map((agent) => {
        const { Icon } = agent
        return (
          <div
            key={agent.slug}
            className="flex items-center gap-3 p-3 bg-white border border-cream-dark/60 rounded-xl"
          >
            <div className="h-8 w-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
              <Icon size={16} className="text-brand-600" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ekthos-black">{agent.name}</p>
            </div>
            {agent.included ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100 shrink-0">
                Incluso
              </span>
            ) : (
              <div className="flex items-center gap-1 shrink-0">
                <Plus size={11} className="text-brand-400" strokeWidth={2.5} />
                <span className="text-[10px] font-semibold text-brand-600">R$ 149,90/mês</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── CTA block ─────────────────────────────────────────────────────────────────

function ModuleCTA({ module }: { module: ModuleContent }) {
  if (module.consultive) {
    return (
      <div className="p-5 bg-brand-50 border border-brand-100 rounded-2xl space-y-3">
        <div className="flex items-start gap-3">
          <Lock size={18} className="text-brand-500 shrink-0 mt-0.5" strokeWidth={1.75} />
          <div>
            <p className="text-sm font-semibold text-brand-900">Módulo consultivo</p>
            <p className="text-xs text-brand-600 mt-0.5 leading-relaxed">
              O {module.name} é configurado com o apoio do time Ekthos para garantir
              que a implantação atenda às necessidades específicas da sua Igreja.
              Entre em contato para saber mais.
            </p>
          </div>
        </div>
        <a
          href="mailto:contato@ekthosai.net?subject=Interesse%20no%20Financeiro%20Pro"
          className="block"
        >
          <Button variant="secondary" className="w-full">
            Falar com o time Ekthos
          </Button>
        </a>
      </div>
    )
  }

  return (
    <div className="p-5 bg-brand-50 border border-brand-100 rounded-2xl space-y-3">
      <div className="flex items-start gap-3">
        <Lock size={18} className="text-brand-500 shrink-0 mt-0.5" strokeWidth={1.75} />
        <div>
          <p className="text-sm font-semibold text-brand-900">Em breve — compra via app</p>
          <p className="text-xs text-brand-600 mt-0.5">
            A contratação de módulos diretamente pelo app chegará em breve.
            Por enquanto, fale com o time Ekthos.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {/* CTA principal desabilitado */}
        <div className="group relative">
          <Button variant="primary" disabled className="w-full cursor-not-allowed opacity-60">
            Contratar {module.name} — Em breve
          </Button>
          <div
            className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity z-10"
            style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Disponível em breve
          </div>
        </div>

        {/* Falar com time */}
        <a
          href={`mailto:contato@ekthosai.net?subject=Interesse%20no%20${encodeURIComponent(module.name)}`}
        >
          <Button variant="secondary" className="w-full">
            Falar com o time Ekthos
          </Button>
        </a>
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ModuleDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const module = id ? getModuleContent(id) : undefined

  if (!module) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-medium text-ekthos-black/50">Módulo não encontrado.</p>
        <Link to="/agentes" className="mt-3 text-xs text-brand-600 hover:underline">
          ← Voltar
        </Link>
      </div>
    )
  }

  const { Icon } = module

  return (
    <div className="max-w-2xl space-y-6">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate(-1)}
        className="flex items-center gap-1.5 text-xs text-ekthos-black/40 hover:text-ekthos-black/70 transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={2} />
        Voltar
      </button>

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
            <h1 className="font-display text-2xl font-bold text-ekthos-black">{module.name}</h1>
            <Lock size={14} className="text-gray-400" strokeWidth={2} />
          </div>
          <p className="text-sm text-ekthos-black/55 mt-1">{module.tagline}</p>
          <p className="text-sm font-bold text-brand-600 mt-2">{module.price}</p>
        </div>
      </div>

      {/* CTA */}
      <ModuleCTA module={module} />

      {/* Conteúdo */}
      <div className="bg-white border border-cream-dark/60 rounded-2xl p-5 space-y-6">
        {/* Para quem */}
        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-2">Para quem</h2>
          <p className="text-sm text-ekthos-black/65 leading-relaxed">{module.forWhom}</p>
        </div>

        {/* Problemas que resolve */}
        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">Problemas que resolve</h2>
          <ul className="space-y-2">
            {module.problems.map((p, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <div className="mt-1 h-1.5 w-1.5 rounded-full bg-brand-400 shrink-0" />
                <span className="text-sm text-ekthos-black/65">{p}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Funcionalidades */}
        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">O que inclui</h2>
          <FeatureList features={module.features} />
        </div>

        {/* Agentes */}
        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">Agentes IA</h2>
          <AgentsList agents={module.agents} />
        </div>
      </div>
    </div>
  )
}
