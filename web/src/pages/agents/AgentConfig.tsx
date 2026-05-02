/**
 * AgentConfig.tsx — /agentes/:slug/configurar
 *
 * Tela de configuração e controle do agente premium para o pastor.
 * Sprint 2.5 — Modelo assistido: o time Ekthos conecta o número,
 * o pastor pode visualizar o status, testar e pausar/reativar.
 *
 * Estados do agente:
 *   pending_activation → time Ekthos ainda não conectou o número
 *   testing            → número conectado, aguardando teste
 *   active             → funcionando em produção
 *   paused             → pastor pausou temporariamente
 */

import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft, Phone, CheckCircle2, Clock, PauseCircle,
  PlayCircle, Send, AlertCircle, Loader2, Zap,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { getAgentContent } from '@/lib/agents-content'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'

// ── Tipos ───────────────────────────────────────────────────────────────────

interface AgentActivation {
  id:                string
  agent_slug:        string
  active:            boolean
  activation_status: 'pending_activation' | 'testing' | 'active' | 'paused'
}

interface WhatsappChannel {
  id:             string
  phone_number:   string
  context_type:   string | null
  session_status: string
  provider_label: string | null
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending_activation: {
    label: 'Aguardando ativação',
    color: '#C4841D',
    icon: <Clock size={16} strokeWidth={2} />,
  },
  testing: {
    label: 'Em teste',
    color: '#2B6CB0',
    icon: <Zap size={16} strokeWidth={2} />,
  },
  active: {
    label: 'Ativo',
    color: '#2D7A4F',
    icon: <CheckCircle2 size={16} strokeWidth={2} />,
  },
  paused: {
    label: 'Pausado',
    color: '#8A8A8A',
    icon: <PauseCircle size={16} strokeWidth={2} />,
  },
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function AgentConfig() {
  const { slug } = useParams<{ slug: string }>()
  const { churchId } = useAuth()
  const content = slug ? getAgentContent(slug) : null

  const [activation,    setActivation]    = useState<AgentActivation | null>(null)
  const [channel,       setChannel]       = useState<WhatsappChannel | null>(null)
  const [loading,       setLoading]       = useState(true)
  const [toggling,      setToggling]      = useState(false)
  const [testPhone,     setTestPhone]     = useState('')
  const [testMessage,   setTestMessage]   = useState('Olá! Este é um teste do Agente de Acolhimento da nossa igreja. 😊')
  const [testLoading,   setTestLoading]   = useState(false)
  const [toast,         setToast]         = useState<{ ok: boolean; msg: string } | null>(null)

  // ── Carregar dados ────────────────────────────────────────────────────────

  async function load() {
    if (!churchId || !slug) return
    setLoading(true)
    try {
      // Busca subscription_agents dessa igreja para este slug
      const { data: acts } = await supabase
        .from('subscription_agents')
        .select('id, agent_slug, active, activation_status')
        .eq('agent_slug', slug)
        .order('created_at', { ascending: false })
        .limit(1)

      const act = acts?.[0] ?? null
      setActivation(act as AgentActivation | null)

      // Busca canal WhatsApp ativo da igreja
      const { data: ch } = await supabase
        .from('church_whatsapp_channels')
        .select('id, phone_number, context_type, session_status, provider_label')
        .eq('church_id', churchId)
        .eq('active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      setChannel(ch as WhatsappChannel | null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [churchId, slug])

  // ── Pausar / Reativar ────────────────────────────────────────────────────

  async function togglePause() {
    if (!activation || toggling) return
    setToggling(true)
    try {
      const newActive = !activation.active
      const newStatus = newActive ? 'active' : 'paused'

      const { error } = await supabase
        .from('subscription_agents')
        .update({ active: newActive, activation_status: newStatus })
        .eq('id', activation.id)

      if (error) {
        showToast(false, 'Erro ao alterar status do agente. Tente novamente.')
      } else {
        setActivation(prev => prev ? { ...prev, active: newActive, activation_status: newStatus as AgentActivation['activation_status'] } : prev)
        showToast(true, newActive ? 'Agente reativado com sucesso.' : 'Agente pausado. Mensagens automáticas foram suspensas.')
      }
    } finally {
      setToggling(false)
    }
  }

  // ── Enviar mensagem de teste ─────────────────────────────────────────────

  async function sendTest() {
    if (!churchId || !testPhone.trim() || !testMessage.trim()) return
    setTestLoading(true)
    setToast(null)
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/test-whatsapp-message`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          to_phone:  testPhone.trim(),
          message:   testMessage.trim(),
        }),
      })

      const json = await res.json() as { ok: boolean; error?: string; detail?: string }

      if (json.ok) {
        showToast(true, `Mensagem enviada para ${testPhone}! Verifique o WhatsApp.`)
      } else {
        const detail = json.detail ?? json.error ?? 'Erro desconhecido'
        showToast(false, `Falha no envio: ${detail}`)
      }
    } catch {
      showToast(false, 'Erro de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setTestLoading(false)
    }
  }

  function showToast(ok: boolean, msg: string) {
    setToast({ ok, msg })
    setTimeout(() => setToast(null), 6_000)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!content) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-text-secondary">Agente não encontrado.</p>
      </div>
    )
  }

  const { Icon, name } = content
  const status = activation?.activation_status ?? 'pending_activation'
  const statusInfo = STATUS_LABELS[status] ?? STATUS_LABELS.pending_activation
  const canTest = (status === 'testing' || status === 'active') && !!channel
  const canToggle = status === 'active' || status === 'paused'

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2">
        <Link
          to={`/agentes/${slug}`}
          className="flex items-center gap-1.5 text-sm font-medium transition-colors"
          style={{ color: 'var(--text-secondary)' }}
        >
          <ArrowLeft size={14} strokeWidth={2} />
          {name}
        </Link>
        <span style={{ color: 'var(--text-tertiary)' }}>/</span>
        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Configurar</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Spinner size="lg" />
        </div>
      ) : (
        <>
          {/* Card de status principal */}
          <div
            className="rounded-2xl border p-6 space-y-5"
            style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
          >
            {/* Header */}
            <div className="flex items-start gap-4">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'var(--color-primary)15', color: 'var(--color-primary)' }}
              >
                <Icon size={22} strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="font-display text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {name}
                </h1>
                <div className="flex items-center gap-1.5 mt-1">
                  <span style={{ color: statusInfo.color }}>{statusInfo.icon}</span>
                  <span className="text-sm font-medium" style={{ color: statusInfo.color }}>
                    {statusInfo.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Canal WhatsApp */}
            <div
              className="rounded-xl p-4 flex items-center gap-3"
              style={{
                background: channel ? '#F0FFF4' : '#F9F9F9',
                border:     `1px solid ${channel ? '#C3E6CB' : 'var(--border-default)'}`,
              }}
            >
              <Phone
                size={18}
                strokeWidth={1.75}
                style={{ color: channel ? '#2D7A4F' : 'var(--text-tertiary)', shrink: 0 }}
              />
              <div>
                {channel ? (
                  <>
                    <p className="text-sm font-semibold" style={{ color: '#2D7A4F' }}>
                      {channel.phone_number}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: '#4A9466' }}>
                      Canal {channel.context_type === 'pastoral' ? 'Pastoral' : channel.context_type === 'operacional' ? 'Operacional' : ''} · WhatsApp conectado ✓
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                      Número WhatsApp não conectado
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                      Nossa equipe vai entrar em contato para ajudar com a ativação
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Mensagem contextual por status */}
            {status === 'pending_activation' && (
              <div
                className="rounded-xl p-4 flex items-start gap-3"
                style={{ background: '#FFFBF0', border: '1px solid #C4841D30' }}
              >
                <Clock size={16} strokeWidth={2} style={{ color: '#C4841D', marginTop: 1 }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#C4841D' }}>Ativação agendada</p>
                  <p className="text-xs mt-0.5" style={{ color: '#8B6914' }}>
                    Nossa equipe vai entrar em contato em breve para conectar o número WhatsApp da sua igreja e ativar o agente. Fique de olho no seu WhatsApp!
                  </p>
                </div>
              </div>
            )}

            {status === 'testing' && (
              <div
                className="rounded-xl p-4 flex items-start gap-3"
                style={{ background: '#EBF4FF', border: '1px solid #2B6CB030' }}
              >
                <Zap size={16} strokeWidth={2} style={{ color: '#2B6CB0', marginTop: 1 }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: '#2B6CB0' }}>Em fase de teste</p>
                  <p className="text-xs mt-0.5" style={{ color: '#2C5282' }}>
                    O número foi conectado. Use o botão abaixo para enviar uma mensagem de teste e confirmar que está funcionando.
                  </p>
                </div>
              </div>
            )}

            {/* Botão pausar/reativar */}
            {canToggle && (
              <Button
                onClick={togglePause}
                disabled={toggling}
                variant={activation?.active ? 'outline' : 'primary'}
                className="w-full flex items-center justify-center gap-2"
              >
                {toggling ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : activation?.active ? (
                  <><PauseCircle size={15} strokeWidth={2} /> Pausar agente</>
                ) : (
                  <><PlayCircle size={15} strokeWidth={2} /> Reativar agente</>
                )}
              </Button>
            )}
          </div>

          {/* Seção de teste — só aparece quando canal está conectado */}
          {canTest && (
            <div
              className="rounded-2xl border p-6 space-y-4"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
            >
              <div>
                <h2 className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
                  Enviar mensagem de teste
                </h2>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                  Confirme que o número está funcionando enviando uma mensagem de teste para o seu celular.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Número de destino (com DDD)
                  </label>
                  <input
                    type="tel"
                    value={testPhone}
                    onChange={e => setTestPhone(e.target.value)}
                    placeholder="+55 21 99999-9999"
                    className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 transition-all"
                    style={{
                      background:   'var(--bg-primary)',
                      borderColor:  'var(--border-default)',
                      color:        'var(--text-primary)',
                    }}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
                    Mensagem
                  </label>
                  <textarea
                    value={testMessage}
                    onChange={e => setTestMessage(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 transition-all resize-none"
                    style={{
                      background:  'var(--bg-primary)',
                      borderColor: 'var(--border-default)',
                      color:       'var(--text-primary)',
                    }}
                  />
                </div>
              </div>

              <Button
                onClick={sendTest}
                disabled={testLoading || !testPhone.trim() || !testMessage.trim()}
                className="w-full flex items-center justify-center gap-2"
              >
                {testLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <><Send size={14} strokeWidth={2} /> Enviar mensagem de teste</>
                )}
              </Button>
            </div>
          )}

          {/* Seção desabilitada de teste quando canal não conectado */}
          {!canTest && status !== 'pending_activation' && (
            <div
              className="rounded-2xl border p-6 opacity-50"
              style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)' }}
            >
              <div className="flex items-center gap-3">
                <AlertCircle size={18} strokeWidth={1.75} style={{ color: 'var(--text-tertiary)' }} />
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
                    Teste indisponível
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                    O número WhatsApp precisa estar conectado para enviar mensagens de teste.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Toast */}
          {toast && (
            <div
              className={`rounded-2xl border p-4 flex items-start gap-3 ${
                toast.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}
            >
              {toast.ok
                ? <CheckCircle2 size={16} strokeWidth={2.5} className="text-green-600 shrink-0 mt-0.5" />
                : <AlertCircle  size={16} strokeWidth={2}   className="text-red-600 shrink-0 mt-0.5" />
              }
              <p className={`text-sm flex-1 ${toast.ok ? 'text-green-800' : 'text-red-800'}`}>
                {toast.msg}
              </p>
              <button onClick={() => setToast(null)} className="text-xs opacity-40 hover:opacity-70">✕</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
