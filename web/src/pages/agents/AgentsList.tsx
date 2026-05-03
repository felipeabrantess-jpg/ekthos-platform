/**
 * AgentsList.tsx — /agentes
 *
 * Catálogo de 7 agentes (4 interno + 3 premium pastoral).
 * Agentes de módulo NÃO aparecem aqui — apenas dentro do detalhe do módulo.
 *
 * Duas seções:
 *  1. ATIVOS          — agentes que a igreja já usa (hasAgent = true)
 *  2. CONTRATAR AVULSO — elegíveis, não ativos (standalone)
 *
 * Regras:
 *  - "Testar 7 dias grátis" DESABILITADO (placeholder Fase 6)
 */

import { Link } from 'react-router-dom'
import { Sparkles, ChevronRight, CheckCircle2 } from 'lucide-react'
import { usePlan } from '@/hooks/usePlan'
import { AGENTS_CONTENT, type AgentContent } from '@/lib/agents-content'

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPrice(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}/mês`
}

/** Badge visual para "Exclusivo Avivamento" ou moduleId badge */
function AgentBadge({ badge }: { badge?: string }) {
  if (!badge) return null
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-100">
      {badge}
    </span>
  )
}

// ── Card: Agente Ativo ────────────────────────────────────────────────────────

function ActiveAgentCard({ content }: { content: AgentContent }) {
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
          <CheckCircle2 size={13} className="text-green-500" strokeWidth={2} />
          {content.badge && <AgentBadge badge={content.badge} />}
        </div>
        <p className="text-xs text-ekthos-black/50 mt-0.5 line-clamp-1">{content.shortDesc}</p>
      </div>
      <ChevronRight size={16} className="text-ekthos-black/20 group-hover:text-ekthos-black/40 transition-colors shrink-0 mt-1" />
    </Link>
  )
}

// ── Card: Agente Contratável (avulso) ─────────────────────────────────────────

function StandaloneAgentCard({ content }: { content: AgentContent }) {
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
          {content.badge && <AgentBadge badge={content.badge} />}
        </div>
        <p className="text-xs text-ekthos-black/50 mt-0.5 line-clamp-1">{content.shortDesc}</p>
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
  empty,
}: {
  title: string
  subtitle?: string
  children?: React.ReactNode
  empty?: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-ekthos-black/70 uppercase tracking-widest">{title}</h2>
        {subtitle && <p className="text-xs text-ekthos-black/40 mt-0.5">{subtitle}</p>}
      </div>
      {children ?? empty}
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function AgentsList() {
  const { hasAgent, allAgents, isLoading } = usePlan()

  // Catálogo frontend: 7 agentes (4 interno + 3 premium)
  // Filtra pelo catálogo DB para garantir que só exibe o que está ativo no banco
  const catalogSlugs = allAgents.map(a => a.slug)

  // 1. ATIVOS — já em uso pela igreja
  const activeContent = AGENTS_CONTENT.filter(
    c => catalogSlugs.includes(c.slug) && hasAgent(c.slug)
  )

  // 2. CONTRATAR AVULSO — no catálogo, ainda não ativos
  const standaloneContent = AGENTS_CONTENT.filter(
    c => catalogSlugs.includes(c.slug) && !hasAgent(c.slug)
  )

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-ekthos-black">Agentes IA</h1>
          <p className="text-sm text-ekthos-black/50 mt-1">
            Automações inteligentes para a sua Igreja. Cada agente resolve um problema específico.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Sparkles size={16} className="text-brand-400" strokeWidth={1.75} />
          <span className="text-xs text-ekthos-black/40 font-medium">
            {activeContent.length} ativo{activeContent.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* 1. ATIVOS */}
      {!isLoading && (
        <Section
          title="Ativos"
          subtitle="Agentes que sua Igreja já usa"
          empty={
            <div className="text-center py-8 border border-dashed border-cream-dark/60 rounded-2xl">
              <p className="text-sm text-ekthos-black/40">Nenhum agente ativo ainda.</p>
              <p className="text-xs text-ekthos-black/30 mt-1">Contrate agentes abaixo para começar.</p>
            </div>
          }
        >
          {activeContent.length > 0 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activeContent.map(c => (
                <ActiveAgentCard key={c.slug} content={c} />
              ))}
            </div>
          )}
        </Section>
      )}

      {/* 2. CONTRATAR AVULSO */}
      {standaloneContent.length > 0 && (
        <Section
          title="Contratar avulso"
          subtitle="Agentes premium pastorais — consultive, fale com um especialista"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {standaloneContent.map(c => (
              <StandaloneAgentCard key={c.slug} content={c} />
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
