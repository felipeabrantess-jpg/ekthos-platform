/**
 * CanaisIgrejaPastor — read-only, para /configuracoes/canais
 *
 * Exibe os canais configurados pela Ekthos para a igreja.
 * Sem botões de edição, adição ou exclusão.
 * instance_id mascarado. error_message NÃO renderizado.
 */

import { WifiOff, RefreshCw, AlertCircle } from 'lucide-react'
import type { ChurchChannel } from '@/hooks/useChurchChannels'

// ── Config por provider ───────────────────────────────────────────────────────

const PROVIDER_LABELS: Record<string, string> = {
  zapi:           'Z-API',
  meta_cloud:     'Meta Cloud API',
  instagram:      'Instagram',
  telegram:       'Telegram',
  whatsapp_cloud: 'WhatsApp Cloud',
}

const PROVIDER_ACCENT: Record<string, string> = {
  zapi:           '#EA580C',
  meta_cloud:     '#2563EB',
  instagram:      '#E1306C',
  telegram:       '#229ED9',
  whatsapp_cloud: '#25D366',
}

// ── Config por agent_slug ─────────────────────────────────────────────────────

const AGENT_LABELS: Record<string, string> = {
  'agent-acolhimento':   'Acolhimento',
  'agent-reengajamento': 'Reengajamento',
  'agent-operacao':      'Operação',
  'agent-suporte':       'Suporte',
  'agent-agenda':        'Agenda',
  'agent-financeiro':    'Financeiro',
  'agent-conteudo':      'Conteúdo',
  'agent-formacao':      'Formação',
  'agent-funil':         'Funil',
  'agent-cuidado':       'Cuidado',
  'agent-whatsapp':      'WhatsApp',
  'agent-missoes':       'Missões',
  'agent-relatorios':    'Relatórios',
  'agent-metricas':      'Métricas',
  'agent-proposta':      'Proposta',
  'agent-cadastro':      'Cadastro',
  'agent-escalas':       'Escalas',
}

function agentLabel(slug: string): string {
  return AGENT_LABELS[slug] ?? slug.replace('agent-', '')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function maskInstanceId(id: string | null): string {
  if (!id) return '—'
  if (id.length <= 3) return id
  return `${id.slice(0, 3)}…`
}

function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime()
  const mins  = Math.floor(diff / 60_000)
  const hours = Math.floor(diff / 3_600_000)
  const days  = Math.floor(diff / 86_400_000)
  if (mins  < 1)  return 'agora mesmo'
  if (mins  < 60) return `há ${mins} min`
  if (hours < 24) return `há ${hours}h`
  return `há ${days}d`
}

// ── Status badge ──────────────────────────────────────────────────────────────

type ChannelStatus = ChurchChannel['status']

const STATUS_CONFIG: Record<ChannelStatus, {
  label:     string
  dotClass:  string
  badgeClass: string
}> = {
  connected: {
    label:      'Conectado',
    dotClass:   'bg-green-500',
    badgeClass: 'bg-green-50 text-green-700 border-green-200',
  },
  provisioning: {
    label:      'Configurando',
    dotClass:   'bg-amber-500 animate-pulse',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  pending: {
    label:      'Pendente',
    dotClass:   'bg-gray-400',
    badgeClass: 'bg-gray-100 text-gray-500 border-gray-200',
  },
  error: {
    label:      'Erro',
    dotClass:   'bg-red-500',
    badgeClass: 'bg-red-50 text-red-600 border-red-200',
  },
  disabled: {
    label:      'Desativado',
    dotClass:   'bg-gray-400',
    badgeClass: 'bg-gray-200 text-gray-500 border-gray-300',
  },
}

function StatusBadge({ status }: { status: ChannelStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.badgeClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cfg.dotClass}`} />
      {cfg.label}
    </span>
  )
}

// ── Provider badge ────────────────────────────────────────────────────────────

function ProviderBadge({ provider }: { provider: string }) {
  const accent = PROVIDER_ACCENT[provider] ?? '#6B7280'
  const label  = PROVIDER_LABELS[provider] ?? provider
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold text-white tracking-wide"
      style={{ backgroundColor: accent }}
    >
      {label}
    </span>
  )
}

// ── Agent chip ────────────────────────────────────────────────────────────────

function AgentChip({ slug }: { slug: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-ekthos-black/5 text-ekthos-black/55 border border-black/8">
      <span className="text-[9px] opacity-70">⇉</span>
      {agentLabel(slug)}
    </span>
  )
}

// ── Canal card ────────────────────────────────────────────────────────────────

function CanalCard({ channel }: { channel: ChurchChannel }) {
  const accent = PROVIDER_ACCENT[channel.provider] ?? '#6B7280'

  return (
    <div
      className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden"
      style={{ borderLeft: `3px solid ${accent}` }}
    >
      <div className="p-4 space-y-3">
        {/* Header: provider + status */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <ProviderBadge provider={channel.provider} />
          <StatusBadge status={channel.status} />
        </div>

        {/* display_name */}
        {channel.display_name && (
          <p className="text-sm font-semibold text-ekthos-black leading-snug">
            {channel.display_name}
          </p>
        )}

        {/* Campos técnicos */}
        {(channel.phone_number || channel.provider_instance_id) && (
          <div className="grid grid-cols-2 gap-2">
            {channel.phone_number && (
              <div className="p-2 bg-[#f9eedc] rounded-xl">
                <p className="text-[9px] font-bold uppercase tracking-wider text-ekthos-black/40 mb-0.5">
                  Número
                </p>
                <p className="text-xs font-mono text-ekthos-black/65 truncate">
                  {channel.phone_number}
                </p>
              </div>
            )}
            {channel.provider_instance_id && (
              <div className="p-2 bg-[#f9eedc] rounded-xl">
                <p className="text-[9px] font-bold uppercase tracking-wider text-ekthos-black/40 mb-0.5">
                  Instance ID
                </p>
                <p className="text-xs font-mono text-ekthos-black/65">
                  {maskInstanceId(channel.provider_instance_id)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Agent slugs */}
        {channel.agent_slugs.length > 0 && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-wider text-ekthos-black/35 mb-1.5">
              Agentes roteados
            </p>
            <div className="flex flex-wrap gap-1">
              {channel.agent_slugs.map(slug => (
                <AgentChip key={slug} slug={slug} />
              ))}
            </div>
          </div>
        )}

        {/* updated_at */}
        <p className="text-[10px] text-ekthos-black/28 leading-none">
          Atualizado {relativeTime(channel.updated_at)}
        </p>
      </div>
    </div>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="space-y-3">
      {[1, 2].map(i => (
        <div
          key={i}
          className="h-36 rounded-2xl"
          style={{
            background: 'linear-gradient(90deg, #f9eedc 25%, #EDE0CC 50%, #f9eedc 75%)',
            backgroundSize: '200% 100%',
            animation: 'shimmer 1.5s infinite',
          }}
        />
      ))}
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200% 0; }
          100% { background-position:  200% 0; }
        }
      `}</style>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="h-14 w-14 rounded-2xl bg-ekthos-black/5 flex items-center justify-center mb-4">
        <WifiOff size={24} className="text-ekthos-black/25" strokeWidth={1.5} />
      </div>
      <p className="text-sm font-semibold text-ekthos-black/55">
        Nenhum canal configurado ainda.
      </p>
      <p className="text-xs text-ekthos-black/35 mt-1.5 max-w-xs leading-relaxed">
        A equipe Ekthos configurará seus canais durante a ativação dos agentes.
      </p>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

interface CanaisIgrejaPastorProps {
  channels:  ChurchChannel[]
  isLoading: boolean
  isError:   boolean
  refetch:   () => void
}

export default function CanaisIgrejaPastor({
  channels, isLoading, isError, refetch,
}: CanaisIgrejaPastorProps) {
  if (isLoading) return <Skeleton />

  if (isError) {
    return (
      <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl">
        <AlertCircle size={16} className="text-red-500 shrink-0" strokeWidth={2} />
        <p className="text-sm text-red-700 flex-1">Erro ao carregar canais.</p>
        <button
          onClick={refetch}
          className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 font-medium transition-colors"
        >
          <RefreshCw size={12} strokeWidth={2} />
          Tentar novamente
        </button>
      </div>
    )
  }

  if (channels.length === 0) return <EmptyState />

  return (
    <div className="space-y-3">
      {channels.map(ch => (
        <CanalCard key={ch.id} channel={ch} />
      ))}
    </div>
  )
}
