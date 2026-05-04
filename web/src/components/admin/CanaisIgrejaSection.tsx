/**
 * CanaisIgrejaSection — Seção "Canais da Igreja" no cockpit admin
 *
 * Configuração de canais de comunicação genéricos (Z-API, Meta Cloud, etc.)
 * com seleção de agentes por canal (agent_slugs) e provisionamento via n8n.
 *
 * Design: precision instrument dashboard — industrial/técnico quente.
 * Paleta: cream/black/red Ekthos. Accent lateral por provider.
 * Status como LED pulsante. Agent slugs como routing chips.
 *
 * PASSO 7 — lê church_channels, não church_whatsapp_channels.
 */

import { useState } from 'react'
import {
  Radio, Plus, Loader2, Check, AlertCircle, Zap,
  Pencil, RefreshCw, Signal, SignalZero,
} from 'lucide-react'
import {
  useChurchChannels,
  useUpsertChannel,
  type ChurchChannel,
  type UpsertChannelParams,
} from '@/hooks/useChurchChannels'

// ── Props ─────────────────────────────────────────────────────────────────────

interface CanaisIgrejaSectionProps {
  churchId:    string
  churchName:  string
  onChanged?:  () => void
}

// ── Constantes ────────────────────────────────────────────────────────────────

const PROVIDERS = [
  { value: 'zapi',           label: 'Z-API',           accent: '#EA580C', available: true  },
  { value: 'meta_cloud',     label: 'Meta Cloud API',  accent: '#2563EB', available: true  },
  { value: 'instagram',      label: 'Instagram',       accent: '#E1306C', available: false },
  { value: 'telegram',       label: 'Telegram',        accent: '#0088cc', available: false },
  { value: 'whatsapp_cloud', label: 'WhatsApp Cloud',  accent: '#25D366', available: false },
]

const AGENT_OPTIONS = [
  { slug: 'agent-acolhimento',    label: 'Acolhimento'   },
  { slug: 'agent-reengajamento',  label: 'Reengajamento' },
  { slug: 'agent-operacao',       label: 'Operação'      },
]

// Defaults de agent_slugs por provider
const PROVIDER_DEFAULT_AGENTS: Record<string, string[]> = {
  zapi:           ['agent-reengajamento'],
  meta_cloud:     ['agent-acolhimento', 'agent-operacao'],
  instagram:      ['agent-acolhimento'],
  telegram:       ['agent-reengajamento'],
  whatsapp_cloud: ['agent-acolhimento', 'agent-operacao'],
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getProviderConfig(provider: string) {
  return PROVIDERS.find(p => p.value === provider) ?? {
    value: provider, label: provider, accent: '#6B7280', available: false,
  }
}

function maskInstanceId(id: string | null) {
  if (!id) return '—'
  if (id.length <= 8) return id
  return `${id.slice(0, 5)}…${id.slice(-3)}`
}

// ── Status LED ─────────────────────────────────────────────────────────────

function StatusLED({ status }: { status: ChurchChannel['status'] }) {
  const cfg = {
    pending:      { color: '#d97706', label: 'Pendente',      pulse: false },
    provisioning: { color: '#2563eb', label: 'Provisionando', pulse: true  },
    connected:    { color: '#16a34a', label: 'Conectado',     pulse: false },
    error:        { color: '#dc2626', label: 'Erro',          pulse: false },
    disabled:     { color: '#6b7280', label: 'Desativado',    pulse: false },
  }[status]

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block w-2 h-2 rounded-full shrink-0 ${cfg.pulse ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: cfg.color, boxShadow: `0 0 0 2px ${cfg.color}33` }}
      />
      <span
        className="text-[10px] font-semibold uppercase tracking-wider"
        style={{ color: cfg.color }}
      >
        {cfg.label}
      </span>
    </span>
  )
}

// ── Provider Tag ─────────────────────────────────────────────────────────────

function ProviderTag({ provider }: { provider: string }) {
  const cfg = getProviderConfig(provider)
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-widest"
      style={{
        backgroundColor: `${cfg.accent}18`,
        color: cfg.accent,
        border: `1px solid ${cfg.accent}33`,
      }}
    >
      {cfg.label}
    </span>
  )
}

// ── Agent Chip ────────────────────────────────────────────────────────────────

function AgentChip({ slug }: { slug: string }) {
  const opt = AGENT_OPTIONS.find(a => a.slug === slug)
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-ekthos-black/5 text-ekthos-black/60 border border-black/8">
      <Radio size={8} strokeWidth={2.5} />
      {opt?.label ?? slug}
    </span>
  )
}

// ── Form State ────────────────────────────────────────────────────────────────

interface FormState {
  provider:             string
  provider_instance_id: string
  phone_number:         string
  display_name:         string
  agent_slugs:          string[]
  initial_status:       'pending' | 'connected'
}

const EMPTY_FORM: FormState = {
  provider:             'zapi',
  provider_instance_id: '',
  phone_number:         '',
  display_name:         '',
  agent_slugs:          PROVIDER_DEFAULT_AGENTS['zapi'],
  initial_status:       'pending',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CanaisIgrejaSection({
  churchId,
  churchName,
  onChanged,
}: CanaisIgrejaSectionProps) {
  const { data: channels = [], isLoading } = useChurchChannels(churchId)
  const upsert = useUpsertChannel()

  const [showModal,  setShowModal]  = useState(false)
  const [editingId,  setEditingId]  = useState<string | null>(null)
  const [form,       setForm]       = useState<FormState>(EMPTY_FORM)
  const [errMsg,     setErrMsg]     = useState<string | null>(null)
  const [savedOk,    setSavedOk]    = useState(false)

  const openNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setErrMsg(null); setSavedOk(false)
    setShowModal(true)
  }

  const openEdit = (ch: ChurchChannel) => {
    setEditingId(ch.id)
    setForm({
      provider:             ch.provider,
      provider_instance_id: ch.provider_instance_id ?? '',
      phone_number:         ch.phone_number ?? '',
      display_name:         ch.display_name ?? '',
      agent_slugs:          ch.agent_slugs ?? [],
      initial_status:       ch.status === 'connected' ? 'connected' : 'pending',
    })
    setErrMsg(null); setSavedOk(false)
    setShowModal(true)
  }

  const handleProviderChange = (provider: string) => {
    setForm(f => ({
      ...f,
      provider,
      agent_slugs: PROVIDER_DEFAULT_AGENTS[provider] ?? [],
    }))
  }

  const toggleAgent = (slug: string) => {
    setForm(f => ({
      ...f,
      agent_slugs: f.agent_slugs.includes(slug)
        ? f.agent_slugs.filter(s => s !== slug)
        : [...f.agent_slugs, slug],
    }))
  }

  const handleSave = async () => {
    setErrMsg(null); setSavedOk(false)
    if (!form.provider_instance_id.trim()) {
      setErrMsg('Instance ID / Phone Number ID é obrigatório')
      return
    }
    if (!form.phone_number.trim()) {
      setErrMsg('Número WhatsApp é obrigatório')
      return
    }
    if (form.agent_slugs.length === 0) {
      setErrMsg('Selecione pelo menos 1 agente para este canal')
      return
    }
    try {
      await upsert.mutateAsync({
        church_id:            churchId,
        provider:             form.provider,
        provider_instance_id: form.provider_instance_id.trim(),
        phone_number:         form.phone_number.trim(),
        display_name:         form.display_name.trim() || `${getProviderConfig(form.provider).label} — ${churchName}`,
        agent_slugs:          form.agent_slugs,
        initial_status:       form.initial_status,
        channel_id:           editingId ?? undefined,
      } satisfies UpsertChannelParams)
      setSavedOk(true)
      onChanged?.()
      setTimeout(() => { setShowModal(false); setSavedOk(false) }, 1200)
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : 'Erro desconhecido')
    }
  }

  const handleReprovision = async (ch: ChurchChannel) => {
    try {
      await upsert.mutateAsync({
        church_id:            churchId,
        provider:             ch.provider,
        provider_instance_id: ch.provider_instance_id ?? '',
        phone_number:         ch.phone_number ?? '',
        display_name:         ch.display_name ?? '',
        agent_slugs:          ch.agent_slugs,
        initial_status:       'pending',
        channel_id:           ch.id,
      } satisfies UpsertChannelParams)
      onChanged?.()
    } catch (e: unknown) {
      console.error('[CanaisIgrejaSection] reprovision error', e)
    }
  }

  const activeProvider = PROVIDERS.find(p => p.value === form.provider)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Seção principal ──────────────────────────────────────────────── */}
      <div className="p-5 border-b border-black/5">

        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[11px] font-semibold text-ekthos-black/40 uppercase tracking-widest flex items-center gap-1.5">
              <Radio size={10} className="text-brand-500" />
              Canais da Igreja
            </p>
            <p className="text-[10px] text-ekthos-black/35 mt-0.5 leading-relaxed max-w-[280px]">
              Configure os canais de comunicação para que os agentes enviem, recebam e roteiem mensagens.
            </p>
          </div>
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition-all duration-150 shrink-0 shadow-sm hover:shadow"
          >
            <Plus size={11} strokeWidth={2.5} />
            Adicionar
          </button>
        </div>

        {/* Skeleton */}
        {isLoading && (
          <div className="space-y-2.5">
            {[1,2].map(i => (
              <div key={i} className="h-[72px] rounded-xl bg-cream-dark animate-pulse" style={{ opacity: 1 - i * 0.2 }} />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isLoading && channels.length === 0 && (
          <div className="relative overflow-hidden border border-dashed border-black/10 rounded-xl py-7 px-4 text-center">
            {/* Subtle grid bg */}
            <div
              className="absolute inset-0 opacity-[0.03]"
              style={{
                backgroundImage: 'linear-gradient(#161616 1px,transparent 1px),linear-gradient(90deg,#161616 1px,transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />
            <SignalZero size={28} className="mx-auto text-ekthos-black/15 mb-2.5" strokeWidth={1.25} />
            <p className="text-xs font-semibold text-ekthos-black/40">Nenhum canal configurado</p>
            <p className="text-[10px] text-ekthos-black/25 mt-1">
              Adicione Z-API ou Meta Cloud para iniciar o roteamento de mensagens.
            </p>
          </div>
        )}

        {/* Canal cards */}
        {!isLoading && channels.length > 0 && (
          <div className="space-y-2.5">
            {channels.map(ch => {
              const provCfg = getProviderConfig(ch.provider)
              const canReprovision = ch.status === 'error' || ch.status === 'pending'
              return (
                <div
                  key={ch.id}
                  className="relative overflow-hidden bg-cream-light border border-black/8 rounded-xl p-3.5"
                  style={{ borderLeft: `3px solid ${provCfg.accent}` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {/* Row 1: provider + status */}
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <ProviderTag provider={ch.provider} />
                        <StatusLED status={ch.status} />
                      </div>

                      {/* Row 2: display_name */}
                      <p className="text-sm font-semibold text-ekthos-black truncate leading-snug">
                        {ch.display_name || `${provCfg.label} — ${ch.phone_number}`}
                      </p>

                      {/* Row 3: phone + instance */}
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[10px] text-ekthos-black/45 font-mono tracking-tight">
                          {ch.phone_number || '—'}
                        </span>
                        {ch.provider_instance_id && (
                          <>
                            <span className="text-[10px] text-ekthos-black/20">·</span>
                            <span className="text-[10px] text-ekthos-black/35 font-mono">
                              {maskInstanceId(ch.provider_instance_id)}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Row 4: agent routing chips */}
                      {ch.agent_slugs.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {ch.agent_slugs.map(slug => (
                            <AgentChip key={slug} slug={slug} />
                          ))}
                        </div>
                      )}

                      {/* Error message */}
                      {ch.error_message && (
                        <div className="flex items-start gap-1.5 mt-2 p-2 bg-red-50 border border-red-100 rounded-lg">
                          <AlertCircle size={10} strokeWidth={2} className="text-red-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-red-600 leading-relaxed">{ch.error_message}</p>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {canReprovision && (
                        <button
                          onClick={() => handleReprovision(ch)}
                          disabled={upsert.isPending}
                          title="Reenviar provisionamento"
                          className="p-1.5 rounded-lg text-ekthos-black/35 hover:text-brand-600 hover:bg-brand-50 disabled:opacity-40 transition-colors"
                        >
                          {upsert.isPending
                            ? <Loader2 size={11} className="animate-spin" />
                            : <Zap size={11} strokeWidth={2} />}
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(ch)}
                        title="Editar canal"
                        className="p-1.5 rounded-lg text-ekthos-black/35 hover:text-ekthos-black/70 hover:bg-black/5 transition-colors"
                      >
                        <Pencil size={11} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Modal formulário ─────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ maxHeight: '90vh', overflowY: 'auto' }}
          >
            {/* Modal header com accent do provider */}
            <div
              className="px-6 py-4 border-b border-black/5"
              style={{ borderTop: `3px solid ${activeProvider?.accent ?? '#e13500'}` }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${activeProvider?.accent ?? '#e13500'}15` }}
                >
                  <Signal size={14} style={{ color: activeProvider?.accent ?? '#e13500' }} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ekthos-black">
                    {editingId ? 'Editar canal' : 'Novo canal de comunicação'}
                  </h3>
                  <p className="text-[10px] text-ekthos-black/40 mt-0.5">{churchName}</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">

              {/* Provider selection */}
              <div>
                <label className="text-[11px] font-semibold text-ekthos-black/50 uppercase tracking-wider block mb-2">
                  Provider
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {PROVIDERS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => { if (!editingId && p.available) handleProviderChange(p.value) }}
                      disabled={!!editingId || !p.available}
                      className={[
                        'flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all duration-150 text-left',
                        form.provider === p.value && p.available
                          ? 'shadow-sm'
                          : 'border-black/8 bg-cream-light text-ekthos-black/40',
                        !p.available ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer',
                        editingId ? 'opacity-60 cursor-not-allowed' : '',
                      ].join(' ')}
                      style={form.provider === p.value && p.available ? {
                        backgroundColor: `${p.accent}10`,
                        borderColor: `${p.accent}40`,
                        color: p.accent,
                      } : {}}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: p.available ? p.accent : '#9ca3af' }}
                      />
                      <span>{p.label}</span>
                      {!p.available && (
                        <span className="ml-auto text-[9px] font-semibold text-ekthos-black/25 uppercase">em breve</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Phone number */}
              <div>
                <label className="text-[11px] font-semibold text-ekthos-black/50 uppercase tracking-wider block mb-1.5">
                  Número WhatsApp
                </label>
                <input
                  type="text"
                  value={form.phone_number}
                  onChange={e => setForm(f => ({ ...f, phone_number: e.target.value }))}
                  placeholder="+5511999999999"
                  className="w-full text-sm text-ekthos-black placeholder:text-ekthos-black/25 bg-cream-light border border-black/8 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-200 font-mono"
                />
              </div>

              {/* Provider Instance ID */}
              <div>
                <label className="text-[11px] font-semibold text-ekthos-black/50 uppercase tracking-wider block mb-1.5">
                  {form.provider === 'zapi' ? 'Instance ID (Z-API)' : 'Phone Number ID (Meta)'}
                </label>
                <input
                  type="text"
                  value={form.provider_instance_id}
                  onChange={e => setForm(f => ({ ...f, provider_instance_id: e.target.value }))}
                  placeholder={form.provider === 'zapi' ? '3F28840B3A853234BB5A…' : '123456789012345'}
                  className="w-full text-sm text-ekthos-black placeholder:text-ekthos-black/25 bg-cream-light border border-black/8 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-200 font-mono text-xs"
                />
              </div>

              {/* Display name */}
              <div>
                <label className="text-[11px] font-semibold text-ekthos-black/50 uppercase tracking-wider block mb-1.5">
                  Nome de exibição
                  <span className="ml-1 font-normal normal-case text-ekthos-black/30">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.display_name}
                  onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
                  placeholder={`Ex: Reengajamento via Z-API — ${churchName}`}
                  className="w-full text-sm text-ekthos-black placeholder:text-ekthos-black/25 bg-cream-light border border-black/8 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-200"
                />
              </div>

              {/* Agent slugs — routing chips */}
              <div>
                <label className="text-[11px] font-semibold text-ekthos-black/50 uppercase tracking-wider block mb-1.5">
                  Agentes roteados por este canal
                </label>
                <div className="flex flex-col gap-1.5">
                  {AGENT_OPTIONS.map(opt => {
                    const selected = form.agent_slugs.includes(opt.slug)
                    return (
                      <button
                        key={opt.slug}
                        onClick={() => toggleAgent(opt.slug)}
                        className={[
                          'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-xs font-medium transition-all duration-150 text-left',
                          selected
                            ? 'bg-ekthos-black text-white border-ekthos-black shadow-sm'
                            : 'bg-cream-light border-black/8 text-ekthos-black/50 hover:border-black/20',
                        ].join(' ')}
                      >
                        <Radio size={12} strokeWidth={selected ? 2.5 : 1.5} />
                        {opt.label}
                        <span className="ml-auto font-mono text-[9px] opacity-50">{opt.slug}</span>
                        {selected && (
                          <Check size={10} strokeWidth={3} className="ml-1 text-white shrink-0" />
                        )}
                      </button>
                    )
                  })}
                </div>
                <p className="text-[10px] text-ekthos-black/30 mt-1.5 leading-relaxed">
                  Mensagens chegando neste canal serão roteadas para os agentes selecionados.
                </p>
              </div>

              {/* Status inicial */}
              <div>
                <label className="text-[11px] font-semibold text-ekthos-black/50 uppercase tracking-wider block mb-1.5">
                  Status inicial
                </label>
                <div className="flex gap-2">
                  {(['pending', 'connected'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => setForm(f => ({ ...f, initial_status: s }))}
                      className={[
                        'flex-1 py-2 rounded-xl text-xs font-semibold border transition-all duration-150',
                        form.initial_status === s
                          ? s === 'connected'
                            ? 'bg-green-600 border-green-600 text-white'
                            : 'bg-ekthos-black/5 border-ekthos-black/20 text-ekthos-black/70'
                          : 'bg-cream-light border-black/8 text-ekthos-black/40',
                      ].join(' ')}
                    >
                      {s === 'pending' ? 'Pendente (padrão)' : '✓ Já conectado'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Feedback */}
              {errMsg && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl">
                  <AlertCircle size={12} strokeWidth={2} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{errMsg}</p>
                </div>
              )}
              {savedOk && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-xl">
                  <Check size={12} strokeWidth={2.5} className="text-green-600" />
                  <p className="text-xs text-green-700 font-medium">Canal salvo e provisionamento disparado!</p>
                </div>
              )}

              {/* Botões */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-2.5 text-sm font-medium text-ekthos-black/60 bg-cream-light border border-black/10 rounded-xl hover:bg-cream-dark transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={upsert.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 disabled:opacity-40 rounded-xl transition-all"
                  style={{
                    background: upsert.isPending ? undefined : `linear-gradient(135deg, ${activeProvider?.accent ?? '#e13500'} 0%, #c42e00 100%)`,
                  }}
                >
                  {upsert.isPending
                    ? <><Loader2 size={13} className="animate-spin" /> Salvando…</>
                    : <><Zap size={13} strokeWidth={2.5} /> Salvar e provisionar</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
