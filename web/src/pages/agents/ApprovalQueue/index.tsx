/**
 * ApprovalQueue — /agentes/:slug/aprovacao
 *
 * Fila de aprovação de mensagens geradas pelo agente (approval_mode = 'manual').
 * Polling 10s + Realtime subscription.
 *
 * Só aparece quando church_agent_config.approval_mode = 'manual'.
 * Para todas as igrejas existentes, approval_mode = 'auto' (feature flag OFF).
 */

import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  Settings,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PendingMessage {
  id: string
  agent_slug: string
  draft_content: string
  draft_metadata: Record<string, unknown>
  created_at: string
  expires_at: string | null
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'sent'
  conversation_id: string | null
}

interface AgentConfig {
  approval_mode: 'auto' | 'manual'
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}min atrás`
  const h = Math.floor(min / 60)
  return `${h}h atrás`
}

function isExpired(expires_at: string | null) {
  if (!expires_at) return false
  return new Date(expires_at) < new Date()
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyAutoMode({ slug }: { slug: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-sm p-10 max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#f9eedc] mb-6">
          <CheckCircle2 size={28} className="text-[#2D7A4F]" />
        </div>
        <h2 className="font-serif text-2xl font-semibold text-[#161616] mb-3">
          Modo automático ativo
        </h2>
        <p className="text-[#5A5A5A] text-sm leading-relaxed mb-6">
          O agente está enviando mensagens automaticamente, sem necessidade de aprovação.
          Para ativar o modo manual (você aprova cada mensagem antes do envio),
          acesse as configurações do agente.
        </p>
        <Link
          to={`/agentes/${slug}/configurar`}
          className="inline-flex items-center justify-center gap-2 bg-[#161616] text-white
                     font-semibold rounded-xl px-6 py-3 text-sm hover:bg-[#2A2A2A]
                     transition-colors duration-150"
        >
          <Settings size={16} />
          Configurar agente
        </Link>
      </div>
    </div>
  )
}

function EmptyNoMessages() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4">
      <div className="bg-white rounded-3xl border border-black/[0.06] shadow-sm p-10 max-w-sm w-full text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#E8F5E9] mb-5">
          <CheckCircle2 size={24} className="text-[#2D7A4F]" />
        </div>
        <h3 className="font-serif text-xl font-semibold text-[#161616] mb-2">
          Nenhuma mensagem pendente
        </h3>
        <p className="text-[#5A5A5A] text-sm leading-relaxed">
          Quando o agente gerar mensagens para aprovação, elas aparecerão aqui.
        </p>
      </div>
    </div>
  )
}

// ── Card de mensagem pendente ─────────────────────────────────────────────────

function MessageCard({
  msg,
  onApprove,
  onReject,
  processing,
}: {
  msg: PendingMessage
  onApprove: (id: string) => Promise<void>
  onReject: (id: string, reason: string) => Promise<void>
  processing: string | null
}) {
  const [rejectMode, setRejectMode] = useState(false)
  const [rejectReason, setRejectReason] = useState('')

  const expired = isExpired(msg.expires_at)
  const busy = processing === msg.id

  return (
    <div className={`bg-white rounded-2xl border shadow-sm overflow-hidden
      ${expired ? 'border-[#8A8A8A]/20 opacity-60' : 'border-black/[0.06]'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-black/[0.05] bg-[#FAFAFA]">
        <div className="flex items-center gap-2">
          <MessageSquare size={14} className="text-[#5A5A5A]" />
          <span className="text-xs font-medium text-[#5A5A5A]">
            {msg.agent_slug}
          </span>
          {expired && (
            <span className="text-xs font-semibold text-[#8A8A8A] bg-[#f9eedc] px-2 py-0.5 rounded-full">
              Expirada
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-[#8A8A8A]">
          <Clock size={11} />
          {fmtRelative(msg.created_at)}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        <p className="text-sm text-[#161616] leading-relaxed whitespace-pre-wrap">
          {msg.draft_content}
        </p>

        {/* Metadata badges */}
        {msg.draft_metadata && Object.keys(msg.draft_metadata).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(msg.draft_metadata).slice(0, 3).map(([k, v]) => (
              <span
                key={k}
                className="text-xs bg-[#f9eedc] text-[#8A8A8A] px-2 py-0.5 rounded-full"
              >
                {k}: {String(v)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      {!expired && (
        <div className="px-5 pb-4">
          {rejectMode ? (
            <div className="space-y-2">
              <input
                type="text"
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Motivo da rejeição (opcional)"
                className="w-full text-sm border border-black/10 rounded-xl px-3 py-2
                           focus:outline-none focus:ring-2 focus:ring-[#e13500]/20
                           focus:border-[#e13500] transition-all"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => onReject(msg.id, rejectReason)}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-sm font-semibold text-white
                             bg-[#e13500] rounded-xl px-4 py-2 hover:bg-[#FF4D1A]
                             disabled:opacity-50 transition-colors"
                >
                  {busy ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                  Confirmar rejeição
                </button>
                <button
                  onClick={() => { setRejectMode(false); setRejectReason('') }}
                  className="text-sm text-[#5A5A5A] hover:text-[#161616] px-3 py-2 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => onApprove(msg.id)}
                disabled={busy}
                className="flex items-center gap-1.5 text-sm font-semibold text-white
                           bg-[#2D7A4F] rounded-xl px-4 py-2.5 hover:bg-[#245F3E]
                           disabled:opacity-50 transition-colors"
              >
                {busy ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                Aprovar e enviar
              </button>
              <button
                onClick={() => setRejectMode(true)}
                disabled={busy}
                className="flex items-center gap-1.5 text-sm font-medium text-[#e13500]
                           border border-[#e13500]/20 rounded-xl px-4 py-2.5
                           hover:bg-[#FDE8E0] disabled:opacity-50 transition-colors"
              >
                <XCircle size={13} />
                Rejeitar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ApprovalQueue() {
  const { slug } = useParams<{ slug: string }>()
  const { churchId } = useAuth()

  const [messages, setMessages] = useState<PendingMessage[]>([])
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [processing, setProcessing] = useState<string | null>(null)

  const agentSlug = slug ?? ''

  const load = useCallback(async (quiet = false) => {
    if (!churchId || !agentSlug) return
    if (!quiet) setLoading(true)
    else setRefreshing(true)
    setError(null)

    try {
      // Config do agente
      const { data: cfgData } = await supabase
        .from('church_agent_config')
        .select('approval_mode')
        .eq('church_id', churchId)
        .eq('agent_slug', agentSlug)
        .maybeSingle()

      setConfig({ approval_mode: (cfgData?.approval_mode as 'auto' | 'manual') ?? 'auto' })

      // Mensagens pendentes
      const { data: msgs, error: msgsErr } = await supabase
        .from('agent_message_pending_approval')
        .select('*')
        .eq('church_id', churchId)
        .eq('agent_slug', agentSlug)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (msgsErr) throw msgsErr
      setMessages((msgs ?? []) as PendingMessage[])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar fila')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [churchId, agentSlug])

  useEffect(() => { void load() }, [load])

  // Polling 10s
  useEffect(() => {
    const interval = setInterval(() => load(true), 10_000)
    return () => clearInterval(interval)
  }, [load])

  // Realtime
  useEffect(() => {
    if (!churchId || !agentSlug) return
    const channel = supabase
      .channel(`approval_queue_${churchId}_${agentSlug}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_message_pending_approval',
          filter: `church_id=eq.${churchId}`,
        },
        () => { void load(true) }
      )
      .subscribe()

    return () => { void supabase.removeChannel(channel) }
  }, [churchId, agentSlug, load])

  const handleApprove = async (id: string) => {
    setProcessing(id)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-approval-action`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ action: 'approve', message_id: id }),
        }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao aprovar')
    } finally {
      setProcessing(null)
    }
  }

  const handleReject = async (id: string, reason: string) => {
    setProcessing(id)
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-approval-action`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
          },
          body: JSON.stringify({ action: 'reject', message_id: id, reason }),
        }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erro ao rejeitar')
    } finally {
      setProcessing(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9eedc] flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[#e13500]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f9eedc] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-red-200 p-6 max-w-sm w-full text-center">
          <AlertTriangle size={24} className="text-[#e13500] mx-auto mb-3" />
          <p className="text-sm text-[#161616] mb-4">{error}</p>
          <button
            onClick={() => load()}
            className="text-sm text-[#e13500] font-medium hover:underline"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    )
  }

  if (config?.approval_mode === 'auto') {
    return (
      <div className="min-h-screen bg-[#f9eedc]">
        <QueueHeader agentSlug={agentSlug} onRefresh={() => load(true)} refreshing={refreshing} />
        <div className="max-w-3xl mx-auto px-6">
          <EmptyAutoMode slug={agentSlug} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f9eedc]">
      <QueueHeader agentSlug={agentSlug} onRefresh={() => load(true)} refreshing={refreshing} />

      <main className="max-w-3xl mx-auto px-6 pb-12">

        {/* Badge modo manual */}
        <div className="mb-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5"
             style={{ background: '#670000', color: '#F5E0E0' }}>
          <Clock size={13} />
          <span className="text-xs font-bold uppercase tracking-wider">MODO MANUAL ATIVO</span>
        </div>

        {messages.length === 0 ? (
          <EmptyNoMessages />
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[#5A5A5A]">
              <span className="font-semibold text-[#161616]">{messages.length}</span>{' '}
              {messages.length === 1 ? 'mensagem aguardando' : 'mensagens aguardando'} sua aprovação
            </p>
            {messages.map(msg => (
              <MessageCard
                key={msg.id}
                msg={msg}
                onApprove={handleApprove}
                onReject={handleReject}
                processing={processing}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// ── Header ─────────────────────────────────────────────────────────────────────

function QueueHeader({
  agentSlug,
  onRefresh,
  refreshing,
}: {
  agentSlug: string
  onRefresh: () => void
  refreshing: boolean
}) {
  return (
    <header className="px-6 py-6 mb-2">
      <div className="max-w-3xl mx-auto">
        <Link
          to={`/agentes/${agentSlug}`}
          className="inline-flex items-center gap-1.5 text-sm text-[#5A5A5A]
                     hover:text-[#161616] mb-4 transition-colors"
        >
          <ArrowLeft size={14} />
          {agentSlug}
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-serif text-3xl font-semibold text-[#161616] leading-tight">
              Fila de Aprovação
            </h1>
            <p className="text-[#5A5A5A] text-sm mt-1">
              Revise e aprove mensagens antes do envio
            </p>
          </div>
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 text-xs text-[#5A5A5A] font-medium
                       hover:text-[#161616] disabled:opacity-40 transition-colors mt-1"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
            Atualizar
          </button>
        </div>
      </div>
    </header>
  )
}
