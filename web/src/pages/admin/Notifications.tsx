import { useEffect, useState } from 'react'
import {
  Bell, RefreshCw, CheckCircle, AlertTriangle, Info,
  Clock, ChevronDown, ChevronUp,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface InternalNotification {
  id:                string
  notification_type: string
  church_id:         string | null
  agent_slug:        string | null
  subscription_id:   string | null
  title:             string
  message:           string
  metadata:          Record<string, unknown> | null
  status:            'pending' | 'in_progress' | 'resolved' | 'dismissed'
  assigned_to:       string | null
  resolved_at:       string | null
  resolved_by:       string | null
  created_at:        string
  updated_at:        string
}

// ── Config de tipos ────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  agent_purchase_pending:   { label: 'Compra pendente',     color: '#C4841D', bg: '#C4841D18', icon: <Clock size={14} /> },
  agent_setup_completed:    { label: 'Setup concluído',     color: '#2D7A4F', bg: '#2D7A4F18', icon: <CheckCircle size={14} /> },
  agent_paused_no_credits:  { label: 'Agente pausado',      color: '#e13500', bg: '#e1350018', icon: <AlertTriangle size={14} /> },
  agent_failed_delivery:    { label: 'Falha de entrega',    color: '#e13500', bg: '#e1350018', icon: <AlertTriangle size={14} /> },
  churn_risk_detected:      { label: 'Risco de churn',      color: '#670000', bg: '#67000018', icon: <AlertTriangle size={14} /> },
  general:                  { label: 'Geral',               color: '#5A5A5A', bg: '#5A5A5A18', icon: <Info size={14} /> },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pendente',       color: '#C4841D', bg: '#C4841D18' },
  in_progress: { label: 'Em andamento',   color: '#2B6CB0', bg: '#2B6CB018' },
  resolved:    { label: 'Resolvido',      color: '#2D7A4F', bg: '#2D7A4F18' },
  dismissed:   { label: 'Dispensado',     color: '#8A8A8A', bg: '#8A8A8A18' },
}

function relDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function shortId(uuid: string | null): string {
  if (!uuid) return '—'
  return uuid.slice(0, 8) + '…'
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function AdminNotifications() {
  const [notifications, setNotifications] = useState<InternalNotification[]>([])
  const [loading,       setLoading]        = useState(true)
  const [filter,        setFilter]         = useState<'pending' | 'in_progress' | 'all'>('pending')
  const [resolving,     setResolving]      = useState<string | null>(null)
  const [expanded,      setExpanded]       = useState<string | null>(null)

  async function load() {
    setLoading(true)
    try {
      let q = supabase
        .from('internal_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (filter !== 'all') {
        q = q.eq('status', filter)
      } else {
        q = q.in('status', ['pending', 'in_progress'])
      }

      const { data } = await q
      setNotifications((data ?? []) as InternalNotification[])
    } catch {
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [filter])

  async function resolve(id: string) {
    setResolving(id)
    try {
      await supabase.rpc('resolve_notification', { p_notification_id: id })
      void load()
    } catch {
      // silencioso — load mostrará estado correto
    } finally {
      setResolving(null)
    }
  }

  const pending     = notifications.filter(n => n.status === 'pending')
  const inProgress  = notifications.filter(n => n.status === 'in_progress')

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-gray-900">Alertas Internos</h1>
          <p className="text-sm text-gray-400 mt-1">Notificações operacionais da plataforma Ekthos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 bg-white border border-black/5 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pendentes',     count: pending.length,    color: '#C4841D' },
          { label: 'Em andamento',  count: inProgress.length, color: '#2B6CB0' },
          { label: 'Total ativo',   count: notifications.length, color: '#161616' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{card.label}</p>
            <p className="text-3xl font-mono font-bold mt-1" style={{ color: card.color }}>{card.count}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex gap-2">
        {(['pending', 'in_progress', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
            style={filter === f
              ? { background: 'var(--color-primary)', color: '#fff' }
              : { background: '#fff', color: '#5A5A5A', border: '1px solid rgba(0,0,0,0.08)' }
            }
          >
            {{ pending: 'Pendentes', in_progress: 'Em andamento', all: 'Todos ativos' }[f]}
          </button>
        ))}
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-black/5">
          <Bell size={32} strokeWidth={1.5} className="text-gray-300 mb-3" />
          <p className="text-sm text-gray-400">Nenhum alerta no momento</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/5 bg-gray-50">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Tipo</th>
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Título</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Church</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-400">Criado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {notifications.map(n => {
                const typeConf   = TYPE_CONFIG[n.notification_type]   ?? TYPE_CONFIG['general']
                const statusConf = STATUS_CONFIG[n.status]            ?? STATUS_CONFIG['pending']
                const isExpanded = expanded === n.id
                return (
                  <>
                    <tr
                      key={n.id}
                      className="border-b border-black/[0.04] hover:bg-gray-50/50 transition-colors cursor-pointer"
                      onClick={() => setExpanded(isExpanded ? null : n.id)}
                    >
                      <td className="px-5 py-3.5">
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{ color: typeConf.color, background: typeConf.bg }}
                        >
                          {typeConf.icon}
                          {typeConf.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="font-medium text-gray-800">{n.title}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="font-mono text-xs text-gray-400">{shortId(n.church_id)}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{ color: statusConf.color, background: statusConf.bg }}
                        >
                          {statusConf.label}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-gray-400 text-xs whitespace-nowrap">
                        {relDate(n.created_at)}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          {n.status !== 'resolved' && n.status !== 'dismissed' && (
                            <button
                              onClick={e => { e.stopPropagation(); void resolve(n.id) }}
                              disabled={resolving === n.id}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all disabled:opacity-50"
                              style={{ background: '#2D7A4F' }}
                            >
                              {resolving === n.id
                                ? <RefreshCw size={12} className="animate-spin" />
                                : <CheckCircle size={12} />
                              }
                              Resolver
                            </button>
                          )}
                          {isExpanded
                            ? <ChevronUp size={14} className="text-gray-400" />
                            : <ChevronDown size={14} className="text-gray-400" />
                          }
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr key={`${n.id}-detail`} className="bg-gray-50/50">
                        <td colSpan={6} className="px-5 py-4">
                          <div className="space-y-2">
                            <p className="text-sm text-gray-700">{n.message}</p>
                            {n.agent_slug && (
                              <p className="text-xs text-gray-400">Agente: <span className="font-mono">{n.agent_slug}</span></p>
                            )}
                            {n.metadata && Object.keys(n.metadata).length > 0 && (
                              <pre className="text-xs bg-white border border-black/5 rounded-lg p-3 overflow-auto max-h-32 text-gray-600">
                                {JSON.stringify(n.metadata, null, 2)}
                              </pre>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
