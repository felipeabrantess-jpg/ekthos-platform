/**
 * Ativacoes.tsx — /admin/cockpit/ativacoes
 *
 * Lista de subscription_agents com activation_status pending_activation | in_setup.
 * Time Ekthos usa para acompanhar e executar ativações manualmente.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Clock, Wrench, RefreshCw, AlertCircle, ChevronRight,
  Bot, Building2, CheckCircle2,
} from 'lucide-react'
import { usePendingActivations, type PendingActivation } from '@/hooks/usePendingActivations'

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending_activation') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
        <Clock size={11} strokeWidth={2.5} />
        Aguardando ativação
      </span>
    )
  }
  if (status === 'in_setup') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-200">
        <Wrench size={11} strokeWidth={2.5} />
        Em setup
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
      {status}
    </span>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function AgentLabel(slug: string) {
  const MAP: Record<string, string> = {
    'agent-acolhimento':   'Acolhimento Pastoral',
    'agent-reengajamento': 'Reengajamento Pastoral',
    'agent-operacao':      'Operação Pastoral',
  }
  return MAP[slug] ?? slug
}

// ── Row ───────────────────────────────────────────────────────────────────────

function ActivationRow({ item }: { item: PendingActivation }) {
  const navigate = useNavigate()
  return (
    <tr
      className="border-b border-black/5 hover:bg-black/[0.02] cursor-pointer transition-colors"
      onClick={() => navigate(`/admin/cockpit/ativacoes/${item.sa_id}`)}
    >
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
            <Building2 size={14} className="text-brand-600" strokeWidth={1.75} />
          </div>
          <div>
            <p className="text-sm font-medium text-ekthos-black">{item.church_name}</p>
            <p className="text-[11px] text-ekthos-black/40 font-mono">{item.church_id.slice(0, 8)}…</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-brand-500 shrink-0" strokeWidth={1.75} />
          <span className="text-sm text-ekthos-black/80">{item.agent_name || AgentLabel(item.agent_slug)}</span>
        </div>
      </td>
      <td className="px-4 py-3.5">
        <StatusBadge status={item.activation_status} />
      </td>
      <td className="px-4 py-3.5 text-xs text-ekthos-black/50">
        {formatDate(item.created_at)}
      </td>
      <td className="px-4 py-3.5">
        {item.notification_status === 'in_progress' ? (
          <span className="text-xs text-orange-600 font-medium">Em andamento</span>
        ) : item.notification_status === 'pending' ? (
          <span className="text-xs text-amber-600 font-medium">Novo</span>
        ) : (
          <span className="text-xs text-ekthos-black/30">—</span>
        )}
      </td>
      <td className="px-4 py-3.5 text-right">
        <ChevronRight size={15} className="text-ekthos-black/25 ml-auto" />
      </td>
    </tr>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function Ativacoes() {
  const { data, isLoading, isError, error, refetch, isFetching } = usePendingActivations()

  const pending  = data?.filter(d => d.activation_status === 'pending_activation') ?? []
  const inSetup  = data?.filter(d => d.activation_status === 'in_setup') ?? []
  const total    = (data?.length ?? 0)

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-ekthos-black">
            Ativações de Agentes
          </h1>
          <p className="text-sm text-ekthos-black/50 mt-1">
            Igrejas aguardando setup manual pelo time Ekthos.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ekthos-black/60 hover:text-ekthos-black border border-black/10 rounded-xl hover:bg-black/5 transition-all disabled:opacity-40"
        >
          <RefreshCw size={13} strokeWidth={2} className={isFetching ? 'animate-spin' : ''} />
          Atualizar
        </button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-amber-100 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-amber-700/70 uppercase tracking-widest">Aguardando</p>
          <p className="text-3xl font-bold text-amber-700 mt-1 font-mono">{pending.length}</p>
        </div>
        <div className="bg-white border border-orange-100 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-orange-700/70 uppercase tracking-widest">Em Setup</p>
          <p className="text-3xl font-bold text-orange-700 mt-1 font-mono">{inSetup.length}</p>
        </div>
        <div className="bg-white border border-black/8 rounded-2xl p-4">
          <p className="text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest">Total</p>
          <p className="text-3xl font-bold text-ekthos-black mt-1 font-mono">{total}</p>
        </div>
      </div>

      {/* Tabela */}
      <div className="bg-white border border-black/8 rounded-2xl overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-sm text-ekthos-black/40">
            <RefreshCw size={16} className="animate-spin mr-2" />
            Carregando...
          </div>
        )}

        {isError && (
          <div className="flex items-start gap-2.5 p-5 text-sm text-red-700">
            <AlertCircle size={16} strokeWidth={1.75} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Erro ao carregar ativações</p>
              <p className="text-xs text-red-500 mt-0.5 font-mono">
                {error instanceof Error ? error.message : 'Erro desconhecido'}
              </p>
            </div>
          </div>
        )}

        {!isLoading && !isError && total === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <CheckCircle2 size={32} className="text-green-400 mb-3" strokeWidth={1.5} />
            <p className="text-sm font-medium text-ekthos-black/60">Nenhuma ativação pendente</p>
            <p className="text-xs text-ekthos-black/35 mt-1">
              Todas as igrejas estão com agentes ativos.
            </p>
          </div>
        )}

        {!isLoading && !isError && total > 0 && (
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/8">
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest">Igreja</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest">Agente</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest">Status</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest">Comprado em</th>
                <th className="text-left px-4 py-3 text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest">Notificação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data!.map(item => (
                <ActivationRow key={item.sa_id} item={item} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
