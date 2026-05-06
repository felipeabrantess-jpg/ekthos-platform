import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Building2, CreditCard, Users, Activity,
  Heart, DollarSign, FileText, Bot, UserCheck,
  Loader, StickyNote, Save, Trash2, CheckCircle2, XCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'
import ModalHabilitarAgente from '@/components/admin/ModalHabilitarAgente'
import { useChurchIdentity } from '@/hooks/useChurchIdentity'

// ── Tipos ──────────────────────────────────────────────────

interface ChurchDetail {
  id:                string
  name:              string
  logo_url:          string | null
  city:              string | null
  state:             string | null
  status:            string
  created_at:        string
  timezone:          string
  // Assinatura
  plan_slug:         string | null
  subscription_status: string | null
  current_period_end:  string | null
  mrr:               number
  // Operação
  members_count:     number
  cells_count:       number
  ministries_count:  number
  pipeline_stages:   number
  // Saúde
  health_score:      number | null
  health_components: Record<string, number>
  // Usuários
  users: Array<{ id: string; email: string; role: string; last_sign_in?: string }>
  // Agentes
  agents: Array<{
    id:             string
    name:           string
    status:         string
    calls_30d:      number
    source?:        'subscription' | 'trial' | 'courtesy' | 'paid'
    grant_ends_at?: string | null
  }>
  // Logs
  logs: Array<{ id: string; action: string; created_at: string; metadata?: Record<string, unknown> }>
  // Precificação customizada
  subscription_id:          string | null
  custom_plan_price_cents:  number | null
  custom_user_price_cents:  number | null
  custom_agent_price_cents: number | null
  price_notes:              string | null
  // Identidade da Igreja
  pastor_titular_name:   string | null
  pastor_titular_phone:  string | null
  denomination:          string | null
  vision_statement:      string | null
  address_full:          string | null
  main_phone:            string | null
  main_email:            string | null
  website_url:           string | null
  social_media_handles:  { instagram?: string; youtube?: string; facebook?: string } | null
  region:                string | null
  // Notas internas
  notes: Array<{
    id:            string
    body:          string
    pinned:        boolean
    admin_user_id: string
    created_at:    string
    updated_at:    string
  }>
}

// ── Helpers ────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)

function relDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

// ── Tab system ─────────────────────────────────────────────

const TABS = [
  { id: 'resumo',      label: 'Resumo',          icon: <Building2    size={14} strokeWidth={1.75} /> },
  { id: 'cadastro',    label: 'Cadastro',         icon: <UserCheck    size={14} strokeWidth={1.75} /> },
  { id: 'assinatura',  label: 'Assinatura',       icon: <CreditCard   size={14} strokeWidth={1.75} /> },
  { id: 'operacao',    label: 'Operação',         icon: <Activity     size={14} strokeWidth={1.75} /> },
  { id: 'saude',       label: 'Saúde',            icon: <Heart        size={14} strokeWidth={1.75} /> },
  { id: 'financeiro',  label: 'Financeiro',       icon: <DollarSign   size={14} strokeWidth={1.75} /> },
  { id: 'pricing',     label: 'Precificação',      icon: <DollarSign   size={14} strokeWidth={1.75} /> },
  { id: 'notas',       label: 'Notas Internas',   icon: <FileText     size={14} strokeWidth={1.75} /> },
  { id: 'logs',        label: 'Logs e Ações',     icon: <FileText     size={14} strokeWidth={1.75} /> },
]

// ── Componentes de sub-seção ───────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-black/[0.04] last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-sm font-medium text-gray-800">{value}</span>
    </div>
  )
}

function MetricMini({ label, value, color = 'var(--color-primary)' }: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="bg-gray-50 rounded-xl p-4 text-center">
      <p className="font-mono-ekthos text-2xl font-bold" style={{ color }}>{value}</p>
      <p className="text-xs text-gray-400 mt-1">{label}</p>
    </div>
  )
}

function HealthBar({ score, label }: { score: number; label: string }) {
  const color = score >= 70 ? '#2D7A4F' : score >= 40 ? '#C4841D' : 'var(--color-primary)'
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="text-xs text-gray-500 w-36 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="font-mono-ekthos text-xs font-bold w-8 text-right" style={{ color }}>{score}</span>
    </div>
  )
}

// ── Tabs ───────────────────────────────────────────────────

function TabResumo({ data }: { data: ChurchDetail }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Info geral */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Informações</h3>
        <InfoRow label="Nome" value={data.name} />
        <InfoRow label="Cidade" value={data.city ? `${data.city}, ${data.state}` : '—'} />
        <InfoRow label="Fuso horário" value={data.timezone} />
        <InfoRow label="Cadastrada em" value={relDate(data.created_at)} />
        <InfoRow label="Status" value={
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: data.status === 'configured' ? '#2D7A4F18' : 'var(--color-primary)18',
              color:      data.status === 'configured' ? '#2D7A4F'   : 'var(--color-primary)',
            }}
          >
            {data.status === 'configured' ? 'Ativa' : data.status}
          </span>
        } />
      </div>

      {/* Métricas resumo */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Operação</h3>
        <div className="grid grid-cols-2 gap-3">
          <MetricMini label="Membros" value={data.members_count} color="#670000" />
          <MetricMini label="Células" value={data.cells_count} color="#2D7A4F" />
          <MetricMini label="Ministérios" value={data.ministries_count} color="#C4841D" />
          <MetricMini label="Etapas pipeline" value={data.pipeline_stages} color="#4F6EE1" />
        </div>
      </div>
    </div>
  )
}

function TabAssinatura({ data }: { data: ChurchDetail }) {
  const PLAN_NAMES: Record<string, string> = {
    chamado: 'Chamado', missao: 'Missão', avivamento: 'Avivamento',
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Plano e Assinatura</h3>
        <InfoRow label="Plano" value={PLAN_NAMES[data.plan_slug ?? ''] ?? data.plan_slug ?? '—'} />
        <InfoRow label="Status" value={data.subscription_status ?? '—'} />
        <InfoRow label="Renovação" value={relDate(data.current_period_end)} />
        <InfoRow label="MRR" value={<span className="font-mono-ekthos font-bold" style={{ color: 'var(--color-primary)' }}>{fmt(data.mrr)}</span>} />
      </div>
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Usuários ({data.users.length})</h3>
        {data.users.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Nenhum usuário cadastrado</p>
        ) : (
          <div className="space-y-2">
            {data.users.map(u => (
              <div key={u.id} className="flex items-center gap-3 py-2">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ background: 'var(--color-primary)' }}
                >
                  {(u.email ?? u.id).charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{u.email ?? u.id}</p>
                  <p className="text-[10px] text-gray-400">{u.role}</p>
                </div>
                <span className="text-[10px] text-gray-400">{relDate(u.last_sign_in ?? null)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TabOperacao({ data, onAgentChange }: { data: ChurchDetail; onAgentChange: () => void }) {
  const [grantModalOpen,    setGrantModalOpen]    = useState(false)
  const [revokingSlug,      setRevokingSlug]      = useState<string | null>(null)
  const [confirmRevokeSlug, setConfirmRevokeSlug] = useState<string | null>(null)
  const [revokeError,       setRevokeError]       = useState<string | null>(null)

  async function handleRevoke(agentSlug: string) {
    setRevokingSlug(agentSlug)
    setRevokeError(null)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) { setRevokeError('Sessão inválida.'); setRevokingSlug(null); return }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-agent-grant`,
        {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ church_id: data.id, agent_slug: agentSlug }),
        }
      )
      const json = await res.json()
      if (!res.ok || !json.ok) { setRevokeError(json.error ?? 'Erro ao revogar.'); return }
      onAgentChange()
    } catch (e: unknown) {
      setRevokeError((e as Error).message ?? 'Erro de rede.')
    } finally {
      setRevokingSlug(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricMini label="Membros" value={data.members_count} />
        <MetricMini label="Células" value={data.cells_count} color="#2D7A4F" />
        <MetricMini label="Ministérios" value={data.ministries_count} color="#C4841D" />
        <MetricMini label="Etapas" value={data.pipeline_stages} color="#4F6EE1" />
      </div>
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-800">
            Agentes de IA ({data.agents.length})
          </h3>
          <button
            type="button"
            onClick={() => setGrantModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-all hover:opacity-90"
            style={{ background: '#e13500' }}
          >
            + Habilitar agente
          </button>
        </div>

        {revokeError && (
          <p className="text-xs text-red-600 mb-2">{revokeError}</p>
        )}

        {data.agents.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Nenhum agente configurado</p>
        ) : (
          <div className="space-y-2">
            {data.agents.map(a => (
              <div key={a.id} className="flex items-center gap-3 py-2 border-b border-black/[0.04] last:border-0">
                <Bot size={16} strokeWidth={1.75} className="text-gray-400 shrink-0" />
                <span className="flex-1 text-sm text-gray-700">{a.name}</span>

                {/* Badge de source (grants manuais) */}
                {a.source && a.source !== 'subscription' && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    a.source === 'trial'     ? 'bg-amber-50 text-amber-700' :
                    a.source === 'courtesy'  ? 'bg-emerald-50 text-emerald-700' :
                                               'bg-blue-50 text-blue-700'
                  }`}>
                    {a.source === 'trial'
                      ? `Trial${a.grant_ends_at ? ` até ${new Date(a.grant_ends_at).toLocaleDateString('pt-BR')}` : ''}`
                      : a.source === 'courtesy' ? 'Cortesia' : 'Pago manual'}
                  </span>
                )}

                <span className="bg-emerald-50 text-emerald-700 text-xs px-2 py-0.5 rounded-full font-medium">
                  Ativo
                </span>
                <span className="font-mono-ekthos text-xs text-gray-400">{a.calls_30d} chamadas/30d</span>
                <Link
                  to={`/admin/churches/${data.id}/agentes/${a.id}`}
                  className="text-xs font-medium text-[#e13500] hover:underline flex items-center gap-1 ml-2"
                >
                  Configurar →
                </Link>

                {/* Botão Revogar (apenas grants manuais) */}
                {a.source && a.source !== 'subscription' && (
                  confirmRevokeSlug === a.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => { setConfirmRevokeSlug(null); void handleRevoke(a.id) }}
                        disabled={revokingSlug === a.id}
                        className="text-[10px] font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        Confirmar
                      </button>
                      <span className="text-gray-300">|</span>
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeSlug(null)}
                        className="text-[10px] text-gray-400 hover:text-gray-600"
                      >
                        Cancelar
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRevokeSlug(a.id)}
                      disabled={revokingSlug === a.id}
                      className="text-xs text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
                      title="Revogar acesso"
                    >
                      {revokingSlug === a.id ? '…' : '✕'}
                    </button>
                  )
                )}
              </div>
            ))}
          </div>
        )}

        <ModalHabilitarAgente
          open={grantModalOpen}
          onClose={() => setGrantModalOpen(false)}
          churchId={data.id}
          onSuccess={onAgentChange}
        />
      </div>
    </div>
  )
}

function TabSaude({ data }: { data: ChurchDetail }) {
  const score = data.health_score ?? 0
  const color = score >= 70 ? '#2D7A4F' : score >= 40 ? '#C4841D' : 'var(--color-primary)'

  const COMPONENT_LABELS: Record<string, string> = {
    consolidacao: 'Taxa de Consolidação',
    celulas:      'Rede de Células',
    financeiro:   'Saúde Financeira',
    engajamento:  'Engajamento Geral',
    discipulado:  'Caminho de Discipulado',
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Score geral */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 flex flex-col items-center justify-center gap-4">
        <div
          className="w-28 h-28 rounded-full flex items-center justify-center"
          style={{ background: color + '18', border: `4px solid ${color}` }}
        >
          <span className="font-mono-ekthos text-4xl font-bold" style={{ color }}>{score}</span>
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-800">
            {score >= 70 ? 'Saúde boa' : score >= 40 ? 'Atenção necessária' : 'Crítico'}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">Score de saúde pastoral (0–100)</p>
        </div>
      </div>

      {/* Componentes */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Breakdown</h3>
        {Object.entries(data.health_components).length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Score ainda não calculado</p>
        ) : (
          Object.entries(data.health_components).map(([key, val]) => (
            <HealthBar
              key={key}
              label={COMPONENT_LABELS[key] ?? key}
              score={Math.round(val)}
            />
          ))
        )}
      </div>
    </div>
  )
}

function TabFinanceiro({ data }: { data: ChurchDetail }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 text-center">
          <p className="font-mono-ekthos text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>{fmt(data.mrr)}</p>
          <p className="text-xs text-gray-400 mt-1">MRR (plano base)</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 text-center">
          <p className="font-mono-ekthos text-2xl font-bold text-gray-700">{data.users.length}</p>
          <p className="text-xs text-gray-400 mt-1">Usuários (assentos)</p>
        </div>
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 text-center">
          <p className="font-mono-ekthos text-2xl font-bold text-gray-700">{data.agents.length}</p>
          <p className="text-xs text-gray-400 mt-1">Agentes ativos</p>
        </div>
      </div>
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Histórico de MRR</h3>
        <div className="flex items-center justify-center h-40 text-sm text-gray-400">
          Dados de histórico financeiro disponíveis em breve.
        </div>
      </div>
    </div>
  )
}

function TabLogs({ data, onImpersonate }: { data: ChurchDetail; onImpersonate: () => void }) {
  return (
    <div className="space-y-6">
      {/* Ações rápidas */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Ações Admin</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={onImpersonate}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: '#670000' }}
          >
            <UserCheck size={15} strokeWidth={1.75} />
            Entrar como pastor
          </button>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-all">
            <Users size={15} strokeWidth={1.75} />
            Convidar usuário
          </button>
        </div>
      </div>

      {/* Logs */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-black/5">
          <h3 className="text-sm font-semibold text-gray-800">Logs de Atividade</h3>
          <p className="text-xs text-gray-400 mt-0.5">Últimas ações realizadas nesta igreja</p>
        </div>
        {data.logs.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-sm text-gray-400">
            Nenhum log registrado
          </div>
        ) : (
          <div className="divide-y divide-black/[0.03]">
            {data.logs.map(log => (
              <div key={log.id} className="px-5 py-3 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Activity size={12} strokeWidth={1.75} className="text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700">{log.action}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{relDate(log.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function TabPricing({ data, churchId, onSaved }: { data: ChurchDetail; churchId: string; onSaved: () => void }) {
  const fmtCents = (c: number | null) =>
    c === null ? '' : (c / 100).toFixed(2).replace('.', ',')
  const parseCents = (s: string): number | null => {
    const n = parseFloat(s.replace(',', '.').replace(/\s/g, ''))
    return isNaN(n) ? null : Math.round(n * 100)
  }

  const [planVal,  setPlanVal]  = useState(fmtCents(data.custom_plan_price_cents))
  const [userVal,  setUserVal]  = useState(fmtCents(data.custom_user_price_cents))
  const [agentVal, setAgentVal] = useState(fmtCents(data.custom_agent_price_cents))
  const [notes,    setNotes]    = useState(data.price_notes ?? '')
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)

  async function save() {
    setSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-church-pricing`, {
        method:  'PATCH',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          church_id:                churchId,
          custom_plan_price_cents:  parseCents(planVal),
          custom_user_price_cents:  parseCents(userVal),
          custom_agent_price_cents: parseCents(agentVal),
          price_notes:              notes.trim() || null,
        }),
      })
      if (!res.ok) throw new Error()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      onSaved()
    } catch {
      // ignore
    } finally {
      setSaving(false)
    }
  }

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-1">Precificação Customizada</h3>
        <p className="text-xs text-gray-400 mb-4">
          Deixe em branco para usar o preço padrão do plano.
          Campos preenchidos substituem o preço tabela para esta conta.
        </p>

        <div className="space-y-4">
          {/* Plano */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Preço do plano (R$) — substitui preço tabela
            </label>
            <input
              type="text"
              value={planVal}
              onChange={e => setPlanVal(e.target.value)}
              placeholder="Ex: 299,00  (vazio = usa tabela)"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-mono-ekthos focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
            />
          </div>

          {/* Usuário */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Preço por usuário extra (R$)
            </label>
            <input
              type="text"
              value={userVal}
              onChange={e => setUserVal(e.target.value)}
              placeholder="Ex: 19,90  (vazio = usa tabela)"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-mono-ekthos focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
            />
          </div>

          {/* Agente */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Preço por agente extra (R$)
            </label>
            <input
              type="text"
              value={agentVal}
              onChange={e => setAgentVal(e.target.value)}
              placeholder="Ex: 39,90  (vazio = usa tabela)"
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-mono-ekthos focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
            />
          </div>

          {/* Motivo */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Motivo do desconto / condição comercial
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Desconto parceiro estratégico — aprovado por Felipe em 15/04/2026"
              rows={2}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none"
              style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-4 pt-4 border-t border-black/[0.04]">
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}
          >
            {saving
              ? <Loader size={14} strokeWidth={2} className="animate-spin" />
              : <Save size={14} strokeWidth={2} />
            }
            {saving ? 'Salvando...' : 'Salvar preços'}
          </button>
          {saved && (
            <span className="text-xs font-medium text-emerald-600">✓ Salvo com sucesso</span>
          )}
        </div>
      </div>

      {/* Preview do MRR com preços customizados */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">MRR atual desta conta</h3>
        <div className="text-center py-4">
          <p className="font-mono-ekthos text-3xl font-bold" style={{ color: 'var(--color-primary)' }}>
            {fmt(data.mrr)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {data.custom_plan_price_cents !== null
              ? 'Com preço customizado ativo'
              : 'Preço padrão do plano'
            }
          </p>
        </div>
      </div>
    </div>
  )
}

function TabNotas({ data, churchId, onSaved }: { data: ChurchDetail; churchId: string; onSaved: () => void }) {
  const [notes,     setNotes]     = useState(data.notes)
  const [newBody,   setNewBody]   = useState('')
  const [newPinned, setNewPinned] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting,   setDeleting]   = useState<string | null>(null)

  async function addNote() {
    if (!newBody.trim()) return
    setSubmitting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-notes-crud`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ church_id: churchId, body: newBody.trim(), pinned: newPinned }),
      })
      if (!res.ok) throw new Error()
      const note = await res.json() as typeof notes[0]
      setNotes(prev => [note, ...prev])
      setNewBody('')
      setNewPinned(false)
      onSaved()
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  async function deleteNote(id: string) {
    setDeleting(id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      await fetch(`${SUPABASE_URL}/functions/v1/admin-notes-crud`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      setNotes(prev => prev.filter(n => n.id !== id))
      onSaved()
    } catch {
      // ignore
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* Formulário de nova nota */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Nova nota interna</h3>
        <textarea
          value={newBody}
          onChange={e => setNewBody(e.target.value)}
          placeholder="Escreva sua observação sobre esta conta..."
          rows={3}
          className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none"
          style={{ '--tw-ring-color': 'var(--color-primary)' } as React.CSSProperties}
        />
        <div className="flex items-center justify-between mt-3">
          <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newPinned}
              onChange={e => setNewPinned(e.target.checked)}
              className="rounded"
            />
            Fixar nota no topo
          </label>
          <button
            onClick={() => void addNote()}
            disabled={submitting || !newBody.trim()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
            style={{ background: 'var(--color-primary)' }}
          >
            {submitting && <Loader size={13} strokeWidth={2} className="animate-spin" />}
            <StickyNote size={13} strokeWidth={2} />
            Adicionar nota
          </button>
        </div>
      </div>

      {/* Lista de notas */}
      {notes.length === 0 ? (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-10 text-center">
          <StickyNote size={36} strokeWidth={1.5} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-400">Nenhuma nota registrada para esta conta</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notes.map(note => (
            <div
              key={note.id}
              className="bg-white rounded-2xl border shadow-sm p-4"
              style={{ borderColor: note.pinned ? 'var(--color-primary)30' : 'rgba(0,0,0,0.05)' }}
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {note.pinned && (
                    <span className="text-[10px] font-bold uppercase tracking-wider mb-1 block"
                      style={{ color: 'var(--color-primary)' }}>
                      📌 Fixada
                    </span>
                  )}
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.body}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Intl.DateTimeFormat('pt-BR', {
                      day: '2-digit', month: '2-digit', year: '2-digit',
                      hour: '2-digit', minute: '2-digit',
                    }).format(new Date(note.created_at))}
                  </p>
                </div>
                <button
                  onClick={() => void deleteNote(note.id)}
                  disabled={deleting === note.id}
                  className="shrink-0 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  {deleting === note.id
                    ? <Loader size={14} strokeWidth={2} className="animate-spin" />
                    : <Trash2 size={14} strokeWidth={1.75} />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function TabCadastro({ churchId }: { churchId: string }) {
  const { fields, update, loading, saving, dirty, toast, save } = useChurchIdentity(churchId)

  const inputCls = 'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500] transition-colors'

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="w-5 h-5 border-2 border-[#e13500] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          toast.ok ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {toast.ok
            ? <CheckCircle2 size={16} className="text-green-600" />
            : <XCircle size={16} className="text-red-600" />}
          {toast.msg}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
        <h3 className="text-sm font-semibold text-gray-800 mb-4">Igreja</h3>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Nome da Igreja</label>
          <input className={inputCls} value={fields.name} onChange={e => update('name', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Cidade</label>
            <input className={inputCls} value={fields.city} onChange={e => update('city', e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Estado (UF)</label>
            <input className={inputCls} maxLength={2} value={fields.state} onChange={e => update('state', e.target.value.toUpperCase())} />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Região / Bairro</label>
          <input className={inputCls} value={fields.region} onChange={e => update('region', e.target.value)} />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Denominação</label>
          <input className={inputCls} placeholder="ex: Assembleia de Deus" value={fields.denomination} onChange={e => update('denomination', e.target.value)} />
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Visão / Missão</label>
          <textarea className={inputCls} rows={3} maxLength={500} value={fields.vision_statement} onChange={e => update('vision_statement', e.target.value)} />
          <p className="mt-1 text-xs text-gray-400">Até 500 caracteres</p>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Endereço Completo</label>
          <input className={inputCls} value={fields.address_full} onChange={e => update('address_full', e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Telefone Principal</label>
            <input className={inputCls} type="tel" value={fields.main_phone} onChange={e => update('main_phone', e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">E-mail Principal</label>
            <input className={inputCls} type="email" value={fields.main_email} onChange={e => update('main_email', e.target.value)} />
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Site</label>
          <input className={inputCls} type="url" placeholder="https://" value={fields.website_url} onChange={e => update('website_url', e.target.value)} />
        </div>

        <h3 className="text-sm font-semibold text-gray-800 mb-4 mt-6">Pastor Titular</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome do Pastor Titular</label>
            <input className={inputCls} value={fields.pastor_titular_name} onChange={e => update('pastor_titular_name', e.target.value)} />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Telefone do Pastor (interno)</label>
            <input className={inputCls} type="tel" value={fields.pastor_titular_phone} onChange={e => update('pastor_titular_phone', e.target.value)} />
          </div>
        </div>

        <h3 className="text-sm font-semibold text-gray-800 mb-4 mt-6">Redes Sociais</h3>

        <div className="grid grid-cols-2 gap-4">
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">Instagram</label>
            <input className={inputCls} placeholder="@igrejax"
              value={fields.social_media_handles.instagram ?? ''}
              onChange={e => update('social_media_handles', { ...fields.social_media_handles, instagram: e.target.value })} />
          </div>
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-600 mb-1">YouTube (channel ID)</label>
            <input className={inputCls} placeholder="UCxxxxx"
              value={fields.social_media_handles.youtube ?? ''}
              onChange={e => update('social_media_handles', { ...fields.social_media_handles, youtube: e.target.value })} />
          </div>
        </div>

        <h3 className="text-sm font-semibold text-gray-800 mb-4 mt-6">Configurações Técnicas</h3>

        <div className="mb-4">
          <label className="block text-xs font-medium text-gray-600 mb-1">Timezone</label>
          <input className={inputCls} placeholder="America/Sao_Paulo" value={fields.timezone} onChange={e => update('timezone', e.target.value)} />
          <p className="mt-1 text-xs text-gray-400">Ex: America/Sao_Paulo, America/Fortaleza</p>
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t border-gray-100">
          {dirty && <span className="text-xs text-amber-600 font-medium">Alterações não salvas</span>}
          <div className="ml-auto">
            <button
              onClick={() => void save()}
              disabled={saving || !dirty}
              className="px-6 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-colors"
              style={{ background: 'var(--color-primary)' }}
            >
              {saving ? 'Salvando...' : 'Salvar Cadastro'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────

const EMPTY_DETAIL: ChurchDetail = {
  id: '', name: '', logo_url: null, city: null, state: null,
  status: 'onboarding', created_at: '', timezone: 'America/Sao_Paulo',
  plan_slug: null, subscription_status: null, current_period_end: null, mrr: 0,
  members_count: 0, cells_count: 0, ministries_count: 0, pipeline_stages: 0,
  health_score: null, health_components: {},
  users: [], agents: [], logs: [],
  subscription_id: null, custom_plan_price_cents: null, custom_user_price_cents: null,
  custom_agent_price_cents: null, price_notes: null, notes: [],
  // Identidade
  pastor_titular_name: null, pastor_titular_phone: null,
  denomination: null, vision_statement: null, address_full: null,
  main_phone: null, main_email: null, website_url: null,
  social_media_handles: null, region: null,
}

export default function AdminChurch() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = searchParams.get('tab') ?? 'resumo'
  const setTab = (t: string) => setSearchParams({ tab: t }, { replace: true })
  const [data,    setData]    = useState<ChurchDetail | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!id) return
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-church-detail?id=${id}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) throw new Error('Erro')
      const json = await res.json() as ChurchDetail
      setData(json)
    } catch {
      // Fallback mínimo para exibir layout sem crash
      setData({ ...EMPTY_DETAIL, id: id ?? '' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [id])

  async function startImpersonate() {
    if (!data) return
    // Registra sessão de impersonação na tabela de auditoria
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('impersonate_sessions').insert({
          admin_user_id: session.user.id,
          church_id:     data.id,
          notes:         `Impersonação iniciada via detalhe da igreja — ${data.name}`,
        })
      }
    } catch (err) {
      console.error('[impersonate] failed to log session:', err)
    }
    localStorage.setItem('impersonating', JSON.stringify({
      church_id:   data.id,
      church_name: data.name,
    }))
    navigate('/dashboard')
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/admin/churches')}
          className="w-8 h-8 rounded-lg flex items-center justify-center bg-white border border-black/5 text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-all"
        >
          <ArrowLeft size={16} strokeWidth={1.75} />
        </button>
        <div className="flex items-center gap-3 flex-1">
          {data.logo_url ? (
            <img src={data.logo_url} alt={data.name} className="w-10 h-10 rounded-xl object-cover" />
          ) : (
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
              style={{ background: 'var(--color-primary)' }}
            >
              {data.name.charAt(0)}
            </div>
          )}
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900">{data.name}</h1>
            {(data.city || data.state) && (
              <p className="text-sm text-gray-400">{[data.city, data.state].filter(Boolean).join(', ')}</p>
            )}
          </div>
        </div>
        {/* Botão impersonate */}
        <button
          onClick={startImpersonate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: '#670000' }}
        >
          <UserCheck size={15} strokeWidth={1.75} />
          Entrar como pastor
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-xl border border-black/5 shadow-sm p-1 overflow-x-auto">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
              tab === t.id
                ? 'text-white'
                : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
            }`}
            style={tab === t.id ? { background: 'var(--color-primary)' } : undefined}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Conteúdo da tab */}
      {tab === 'resumo'     && <TabResumo      data={data} />}
      {tab === 'cadastro'   && <TabCadastro    churchId={id ?? ''} />}
      {tab === 'assinatura' && <TabAssinatura  data={data} />}
      {tab === 'operacao'   && <TabOperacao    data={data} onAgentChange={load} />}
      {tab === 'saude'      && <TabSaude       data={data} />}
      {tab === 'financeiro' && <TabFinanceiro  data={data} />}
      {tab === 'pricing'    && <TabPricing data={data} churchId={id ?? ''} onSaved={load} />}
      {tab === 'notas'      && <TabNotas   data={data} churchId={id ?? ''} onSaved={load} />}
      {tab === 'logs'       && <TabLogs        data={data} onImpersonate={startImpersonate} />}
    </div>
  )
}
