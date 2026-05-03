/**
 * AgentsList.tsx — /agentes
 *
 * Catálogo de 7 agentes (4 interno + 3 premium pastoral).
 * Todos os 7 visíveis sempre em 2 seções fixas:
 *  1. Incluídos no seu plano — 4 internos (incluso em qualquer plano CRM)
 *  2. Premium Pastorais       — 3 premium (contratação avulsa, ativação assistida)
 *
 * Regras:
 *  - Internos: sempre visíveis, sem filtro de hasAgent
 *  - Premium: sempre visíveis, com preço explícito
 *  - Agentes de módulo NÃO aparecem aqui
 */

import { Link } from 'react-router-dom'
import { ChevronRight, CheckCircle2 } from 'lucide-react'
import { INTERNAL_AGENTS, PREMIUM_AGENTS, type AgentContent } from '@/lib/agents-content'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number) {
  return `R$ ${(cents / 100).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}/mês`
}

// ── Card: Agente Interno (incluso no plano) ───────────────────────────────────

function InternalAgentCard({ content }: { content: AgentContent }) {
  const { Icon } = content
  return (
    <Link
      to={`/agentes/${content.slug}`}
      className="group flex items-start gap-4 p-4 bg-white border border-green-100 rounded-2xl shadow-sm hover:shadow-md hover:border-green-200 transition-all"
    >
      <div className="h-10 w-10 rounded-xl bg-green-50 border border-green-100 flex items-center justify-center shrink-0">
        <Icon size={20} className="text-green-600" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-ekthos-black">{content.name}</span>
          <CheckCircle2 size={13} className="text-green-500 shrink-0" strokeWidth={2} />
        </div>
        <p className="text-xs text-ekthos-black/50 mt-0.5 line-clamp-2">{content.shortDesc}</p>
        <p className="text-[10px] font-medium text-green-600 mt-1.5">Incluso no plano</p>
      </div>
      <ChevronRight size={16} className="text-ekthos-black/20 group-hover:text-ekthos-black/40 transition-colors shrink-0 mt-1" />
    </Link>
  )
}

// ── Card: Agente Premium Pastoral ─────────────────────────────────────────────

function PremiumAgentCard({ content }: { content: AgentContent }) {
  const { Icon } = content
  return (
    <Link
      to={`/agentes/${content.slug}`}
      className="group flex items-start gap-4 p-4 bg-white border border-cream-dark/60 rounded-2xl shadow-sm hover:shadow-md hover:border-brand-200 transition-all"
    >
      <div className="h-10 w-10 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
        <Icon size={20} className="text-brand-600" strokeWidth={1.75} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-ekthos-black">{content.name}</span>
          {content.badge && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
              {content.badge}
            </span>
          )}
        </div>
        <p className="text-xs text-ekthos-black/50 mt-0.5 line-clamp-2">{content.shortDesc}</p>
        {content.price && (
          <p className="text-[11px] font-semibold text-brand-600 mt-1.5">{formatPrice(content.price)}</p>
        )}
      </div>
      <ChevronRight size={16} className="text-ekthos-black/20 group-hover:text-brand-400 transition-colors shrink-0 mt-1" />
    </Link>
  )
}

// ── Seção com título ──────────────────────────────────────────────────────────

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-ekthos-black/70 uppercase tracking-widest">{title}</h2>
        {subtitle && <p className="text-xs text-ekthos-black/40 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AgentsList() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-ekthos-black">Agentes IA</h1>
        <p className="text-sm text-ekthos-black/50 mt-1">
          Automações inteligentes para a sua Igreja. Cada agente resolve um problema específico.
        </p>
      </div>

      {/* 1. Incluídos no plano — 4 internos */}
      <Section
        title="Incluídos no seu plano"
        subtitle="Esses agentes operam automaticamente, sem custo adicional."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {INTERNAL_AGENTS.map(c => (
            <InternalAgentCard key={c.slug} content={c} />
          ))}
        </div>
      </Section>

      {/* 2. Premium Pastorais — 3 avulsos */}
      <Section
        title="Premium Pastorais — Contratação Avulsa"
        subtitle="Operam com IA avançada. Exigem ativação assistida pela equipe Ekthos."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {PREMIUM_AGENTS.map(c => (
            <PremiumAgentCard key={c.slug} content={c} />
          ))}
        </div>
      </Section>
    </div>
  )
}
