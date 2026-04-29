/**
 * ModuleDetail.tsx — /modulos/:id
 *
 * Todos os módulos são consultivos: sem "Adicionar ao plano" enquanto
 * as telas operacionais (MVO) não existem. CTA único: "Falar com consultor".
 *
 * Motivo: honestidade com o pastor — ele não paga por algo que não tem onde acessar.
 * Agentes avulsos mantêm self-service (não passam por aqui).
 */

import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Lock, CheckCircle2, Plus, Loader2,
  Check, AlertCircle, ListOrdered,
} from 'lucide-react'
import { getModuleContent, type ModuleContent } from '@/lib/modules-content'
import { useAddonActions } from '@/hooks/useAddonActions'
import Button from '@/components/ui/Button'

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

// ── Card "Como funciona a contratação" ───────────────────────────────────────

const CONTRATACAO_STEPS = [
  'Você fala com nosso time',
  'Apresentamos o módulo em uma demo curta',
  'Configuramos o ambiente da sua igreja',
  'Treinamos sua equipe',
  'Ativamos o módulo no seu plano',
]

function ComoFuncionaCard() {
  return (
    <div className="p-5 bg-cream-light border border-cream-dark/50 rounded-2xl space-y-4">
      <div className="flex items-center gap-2.5">
        <ListOrdered size={16} className="text-ekthos-black/50 shrink-0" strokeWidth={1.75} />
        <h2 className="text-xs font-bold uppercase tracking-widest text-ekthos-black/50">
          Como funciona a contratação
        </h2>
      </div>
      <ol className="space-y-2.5">
        {CONTRATACAO_STEPS.map((step, i) => (
          <li key={i} className="flex items-start gap-3">
            <div className="mt-0.5 h-5 w-5 rounded-full bg-brand-100 border border-brand-200 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-brand-700">{i + 1}</span>
            </div>
            <span className="text-sm text-ekthos-black/70 leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>
      <p className="text-xs text-ekthos-black/40 italic pt-1">
        Tudo isso sem você precisar mexer em nada.
      </p>
    </div>
  )
}

// ── CTA block (todos os módulos são consultivos) ──────────────────────────────

function ModuleCTA({ module }: { module: ModuleContent }) {
  const { falarComConsultor, loadingConsultor } = useAddonActions()
  const [toast, setToast] = useState<{ ok: boolean; message: string } | null>(null)

  async function handleConsultor() {
    setToast(null)
    const result = await falarComConsultor('module', module.id)
    setToast({ ok: result.ok, message: result.message })
  }

  return (
    <div className="p-5 bg-brand-50 border border-brand-100 rounded-2xl space-y-3">
      <div className="flex items-start gap-3">
        <Lock size={18} className="text-brand-500 shrink-0 mt-0.5" strokeWidth={1.75} />
        <div>
          <p className="text-sm font-semibold text-brand-900">Implementação acompanhada</p>
          <p className="text-xs text-brand-600 mt-0.5 leading-relaxed">
            {module.implementacaoDesc}
          </p>
        </div>
      </div>

      {toast && <Toast ok={toast.ok} message={toast.message} onClose={() => setToast(null)} />}

      <Button
        variant="primary"
        className="w-full"
        disabled={loadingConsultor || !!toast?.ok}
        onClick={() => void handleConsultor()}
      >
        {loadingConsultor ? (
          <><Loader2 size={14} className="animate-spin mr-2" />Enviando...</>
        ) : toast?.ok ? (
          <><Check size={14} className="mr-2" />Mensagem enviada!</>
        ) : (
          'Falar com consultor'
        )}
      </Button>
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
          style={{ background: 'var(--color-primary-bg, var(--bg-hover))', borderColor: 'var(--border-default)' }}
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

        {/* Como funciona a contratação — antes de "Para quem" */}
        <ComoFuncionaCard />

        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-2">Para quem</h2>
          <p className="text-sm text-ekthos-black/65 leading-relaxed">{module.forWhom}</p>
        </div>

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

        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">O que inclui</h2>
          <FeatureList features={module.features} />
        </div>

        <div>
          <h2 className="text-xs font-semibold text-ekthos-black/40 uppercase tracking-widest mb-3">Agentes IA</h2>
          <AgentsList agents={module.agents} />
        </div>
      </div>
    </div>
  )
}
