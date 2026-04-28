import { useState } from 'react'
import { MessageSquare, ChevronRight, X, ExternalLink, RefreshCw } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface OutboxMessage {
  id: string
  church_id: string
  church_name: string | null
  person_id: string | null
  person_name: string | null
  channel: string
  driver: string
  to_address: string
  body_text: string
  body_template_id: string | null
  variables: Record<string, unknown>
  source: string
  source_event: string | null
  status: string
  attempts: number
  max_attempts: number
  driver_response: Record<string, unknown>
  driver_message_id: string | null
  sent_at: string | null
  failed_at: string | null
  error_message: string | null
  created_at: string
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────
function useAdminMessages(filters: {
  churchId: string
  status: string
  channel: string
}) {
  return useQuery({
    queryKey: ['admin-messages', filters],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = supabase as any
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = sb
        .from('message_outbox')
        .select(`
          id, church_id, person_id, channel, driver, to_address,
          body_text, body_template_id, variables, source, source_event,
          status, attempts, max_attempts,
          driver_response, driver_message_id,
          sent_at, failed_at, error_message, created_at,
          churches(name),
          people(name)
        `)
        .order('created_at', { ascending: false })
        .limit(100)

      if (filters.churchId)  q = q.eq('church_id', filters.churchId)
      if (filters.status)    q = q.eq('status', filters.status)
      if (filters.channel)   q = q.eq('channel', filters.channel)

      const { data, error } = await q
      if (error) throw error

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return ((data as any[]) ?? []).map((r) => {
        const churchRaw = r.churches as { name?: string } | null
        const personRaw = r.people   as { name?: string } | null
        return {
          ...r,
          church_name: churchRaw?.name ?? null,
          person_name: personRaw?.name ?? null,
        } as OutboxMessage
      })
    },
    refetchInterval: 15_000,
  })
}

// ─────────────────────────────────────────────────────────────
// Helpers visuais
// ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    queued:              'bg-yellow-100 text-yellow-800',
    dispatching:         'bg-blue-100 text-blue-800',
    sent:                'bg-green-100 text-green-800',
    delivered:           'bg-green-200 text-green-900',
    read:                'bg-emerald-100 text-emerald-800',
    failed:              'bg-red-100 text-red-800',
    skipped:             'bg-gray-100 text-gray-600',
    pending_user_action: 'bg-orange-100 text-orange-800',
  }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  )
}

function ChannelBadge({ channel }: { channel: string }) {
  const map: Record<string, string> = {
    whatsapp: 'bg-green-50 text-green-700',
    sms:      'bg-blue-50 text-blue-700',
    email:    'bg-purple-50 text-purple-700',
    in_app:   'bg-gray-50 text-gray-700',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[channel] ?? 'bg-gray-50 text-gray-600'}`}>
      {channel}
    </span>
  )
}

function DriverBadge({ driver }: { driver: string }) {
  const map: Record<string, string> = {
    mock_internal:   'bg-slate-100 text-slate-600',
    wa_me_link:      'bg-emerald-50 text-emerald-700',
    zapi:            'bg-teal-50 text-teal-700',
    meta_cloud_api:  'bg-blue-50 text-blue-700',
    twilio_sms:      'bg-red-50 text-red-700',
    resend_email:    'bg-violet-50 text-violet-700',
  }
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[driver] ?? 'bg-gray-50 text-gray-600'}`}>
      {driver}
    </span>
  )
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min  = Math.floor(diff / 60_000)
  const hrs  = Math.floor(diff / 3_600_000)
  const days = Math.floor(diff / 86_400_000)
  if (min < 1)   return 'agora'
  if (min < 60)  return `${min}min atrás`
  if (hrs < 24)  return `${hrs}h atrás`
  return `${days}d atrás`
}

// ─────────────────────────────────────────────────────────────
// Drawer de detalhes
// ─────────────────────────────────────────────────────────────
function MessageDrawer({
  message,
  onClose,
}: {
  message: OutboxMessage
  onClose: () => void
}) {
  const waUrl = message.channel === 'whatsapp' && message.to_address
    ? `https://wa.me/${message.to_address.replace(/\D/g, '')}?text=${encodeURIComponent(message.body_text)}`
    : null

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* Overlay */}
      <div className="flex-1 bg-black/40" onClick={onClose} />

      {/* Drawer */}
      <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-gray-400" />
            <span className="font-semibold text-gray-900 text-sm font-sans">Detalhes da mensagem</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 px-6 py-5 space-y-5 font-sans">
          {/* Meta */}
          <div className="flex flex-wrap gap-2">
            <StatusBadge  status={message.status} />
            <ChannelBadge channel={message.channel} />
            <DriverBadge  driver={message.driver} />
          </div>

          {/* Corpo da mensagem */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Texto</p>
            <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed border border-gray-100">
              {message.body_text}
            </div>
          </div>

          {/* Info principal */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Igreja</p>
              <p className="font-medium text-gray-800">{message.church_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Destinatário</p>
              <p className="font-medium text-gray-800">{message.person_name ?? message.to_address}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Origem</p>
              <p className="font-medium text-gray-800">{message.source}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">Tentativas</p>
              <p className="font-medium text-gray-800">{message.attempts} / {message.max_attempts}</p>
            </div>
            {message.sent_at && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Enviado em</p>
                <p className="font-medium text-gray-800">{new Date(message.sent_at).toLocaleString('pt-BR')}</p>
              </div>
            )}
            {message.failed_at && (
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Falhou em</p>
                <p className="font-medium text-gray-800">{new Date(message.failed_at).toLocaleString('pt-BR')}</p>
              </div>
            )}
          </div>

          {/* Variables */}
          {Object.keys(message.variables ?? {}).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Variáveis</p>
              <pre className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700 overflow-auto border border-gray-100">
                {JSON.stringify(message.variables, null, 2)}
              </pre>
            </div>
          )}

          {/* Driver response */}
          {Object.keys(message.driver_response ?? {}).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Resposta do driver</p>
              <pre className="bg-gray-50 rounded-xl p-3 text-xs text-gray-700 overflow-auto border border-gray-100">
                {JSON.stringify(message.driver_response, null, 2)}
              </pre>
            </div>
          )}

          {/* Error */}
          {message.error_message && (
            <div>
              <p className="text-xs font-semibold text-red-500 uppercase tracking-wide mb-1.5">Erro</p>
              <div className="bg-red-50 rounded-xl p-3 text-xs text-red-700 border border-red-100">
                {message.error_message}
              </div>
            </div>
          )}

          {/* Botão wa.me */}
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#25D366' }}
            >
              <ExternalLink size={15} />
              Abrir WhatsApp
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Página principal
// ─────────────────────────────────────────────────────────────
export default function AdminComunicacao() {
  const [selectedMessage, setSelectedMessage] = useState<OutboxMessage | null>(null)
  const [filterChurchId, setFilterChurchId]   = useState('')
  const [filterStatus,   setFilterStatus]     = useState('')
  const [filterChannel,  setFilterChannel]    = useState('')

  const { data: messages = [], isLoading, refetch } = useAdminMessages({
    churchId: filterChurchId,
    status:   filterStatus,
    channel:  filterChannel,
  })

  // Coletar lista única de igrejas a partir dos dados para o dropdown
  const churches = Array.from(
    new Map(messages.map(m => [m.church_id, m.church_name ?? m.church_id])).entries()
  )

  return (
    <div className="font-sans">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Playfair Display, serif' }}>
          Mensagens automáticas
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Visão global — todas as mensagens de todas as igrejas (modo teste)
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-5">
        {/* Igreja */}
        <select
          value={filterChurchId}
          onChange={e => setFilterChurchId(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">Todas as igrejas</option>
          {churches.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        {/* Status */}
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">Todos os status</option>
          {['queued','dispatching','sent','delivered','read','failed','skipped','pending_user_action'].map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        {/* Canal */}
        <select
          value={filterChannel}
          onChange={e => setFilterChannel(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
        >
          <option value="">Todos os canais</option>
          {['whatsapp','sms','email','in_app'].map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        {/* Refresh */}
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1.5 text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw size={13} />
          Atualizar
        </button>
      </div>

      {/* Tabela desktop */}
      <div className="hidden md:block">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Carregando...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">Nenhuma mensagem ainda.</p>
            <p className="text-gray-400 text-xs mt-1">Mensagens automáticas aparecerão aqui conforme o sistema dispara.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-left">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Igreja</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Destinatário</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Canal</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Driver</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Texto</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Origem</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                  <th className="px-4 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {messages.map(msg => (
                  <tr
                    key={msg.id}
                    onClick={() => setSelectedMessage(msg)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-gray-800 font-medium max-w-[120px] truncate">
                      {msg.church_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[130px] truncate">
                      {msg.person_name ?? msg.to_address}
                    </td>
                    <td className="px-4 py-3"><ChannelBadge channel={msg.channel} /></td>
                    <td className="px-4 py-3"><DriverBadge  driver={msg.driver}  /></td>
                    <td className="px-4 py-3 text-gray-600 max-w-[180px]">
                      <span className="truncate block" title={msg.body_text}>
                        {msg.body_text.substring(0, 60)}{msg.body_text.length > 60 ? '…' : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge  status={msg.status}  /></td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{msg.source}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">{relativeTime(msg.created_at)}</td>
                    <td className="px-4 py-3">
                      <ChevronRight size={14} className="text-gray-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cards mobile */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Carregando...</div>
        ) : messages.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500 text-sm">Nenhuma mensagem ainda.</p>
            <p className="text-gray-400 text-xs mt-1">Mensagens automáticas aparecerão aqui conforme o sistema dispara.</p>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              onClick={() => setSelectedMessage(msg)}
              className="bg-white rounded-2xl border border-gray-100 p-4 cursor-pointer shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <StatusBadge  status={msg.status}  />
                  <ChannelBadge channel={msg.channel} />
                  <DriverBadge  driver={msg.driver}  />
                </div>
                <span className="text-gray-400 text-xs shrink-0">{relativeTime(msg.created_at)}</span>
              </div>
              <p className="text-sm font-medium text-gray-800 mb-0.5">{msg.church_name ?? '—'}</p>
              <p className="text-xs text-gray-500 mb-1.5">{msg.person_name ?? msg.to_address}</p>
              <p className="text-xs text-gray-600 line-clamp-2">{msg.body_text}</p>
            </div>
          ))
        )}
      </div>

      {/* Drawer */}
      {selectedMessage && (
        <MessageDrawer
          message={selectedMessage}
          onClose={() => setSelectedMessage(null)}
        />
      )}
    </div>
  )
}
