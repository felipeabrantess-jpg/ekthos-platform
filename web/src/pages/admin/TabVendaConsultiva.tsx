// ============================================================
// TabVendaConsultiva v2 — Cockpit de Vendas e Ativações
//
// Dois modos unificados:
//   1. Ativação Imediata — cortesia ou trial sem pagamento
//      → admin-cockpit-sell (módulos + agentes)
//   2. Link de Pagamento — Stripe Checkout rastreado
//      → admin-cockpit-link (planos + agentes com Price ID)
//
// Regras:
//   - Todos os eventos registrados em admin_events
//   - Somente ekthos_admin pode operar
//   - Price IDs canônicos LIVE nunca alterados aqui
//   - Volunteer Pro (sem Price ID) só via Ativação Imediata
// ============================================================

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Copy, CheckCircle2, ExternalLink, Loader, Zap, Link2,
  Package, Bot, ChevronRight, AlertCircle, Gift,
} from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

// ── Produtos com Price ID (Stripe Checkout) ────────────────

const PRODUTOS_PAGAMENTO = [
  { group: 'Planos CRM',
    items: [
      { price_id: 'price_1TYroEHfvCy1ruEN6j4QxHmU', label: 'Plano Chamado',    detail: 'R$689,90/mês',    mode: 'subscription' },
      { price_id: 'price_1Tcya5HfvCy1ruENDXuf9KlM', label: 'Plano Missão',     detail: 'R$1.639,90/mês',  mode: 'subscription' },
      { price_id: 'price_1Tcya8HfvCy1ruENe5NqXPWH', label: 'Plano Avivamento', detail: 'R$2.469,90/mês',  mode: 'subscription' },
    ]
  },
  { group: 'Agentes IA',
    items: [
      { price_id: 'price_1TYroFHfvCy1ruENm4Lunluh', label: 'Agente Acolhimento',    detail: 'R$290,00',  mode: 'payment' },
    ]
  },
  { group: 'Recargas de Créditos',
    items: [
      { price_id: 'price_1TcyZmHfvCy1ruEND2SbGerK', label: 'Recarga Emergencial', detail: 'R$99,00 · 100 créditos',  mode: 'payment' },
      { price_id: 'price_1TcyZpHfvCy1ruENrQi5YdZu', label: 'Recarga Ponte',       detail: 'R$269,00 · 300 créditos', mode: 'payment' },
    ]
  },
]

const TODOS_PRODUTOS = PRODUTOS_PAGAMENTO.flatMap(g => g.items)

// ── Itens ativáveis sem pagamento ──────────────────────────

const MODULOS_ATIVAVEIS = [
  { key: 'voluntarios', label: 'Voluntários Pro', detail: 'Gestão de voluntários + escalas WhatsApp', activatesAgent: 'agent-escalas' },
  { key: 'escalas',     label: 'Escalas',          detail: 'Escalas de serviço separadas (já incluso no Voluntários Pro)', activatesAgent: 'agent-escalas' },
]

const AGENTES_ATIVAVEIS = [
  { slug: 'agent-escalas',       label: 'Agente Escalas',       detail: 'Notificações e confirmações de escala via WhatsApp' },
  { slug: 'agent-acolhimento',   label: 'Agente Acolhimento',   detail: 'Boas-vindas automáticas e nutrição de novos membros' },
  { slug: 'agent-reengajamento', label: 'Agente Reengajamento', detail: 'Detecta e reativa membros ausentes automaticamente' },
  { slug: 'agent-operacao',      label: 'Agente Operação',      detail: 'Triagem e roteamento inteligente de conversas' },
]

const TIPOS_ATIVACAO = [
  { id: 'courtesy', label: 'Cortesia',      detail: 'Grátis · sem prazo de vencimento',   days: null },
  { id: 'trial7',   label: 'Trial 7 dias',  detail: 'Expira automaticamente em 7 dias',   days: 7   },
  { id: 'trial14',  label: 'Trial 14 dias', detail: 'Expira automaticamente em 14 dias',  days: 14  },
  { id: 'trial30',  label: 'Trial 30 dias', detail: 'Expira automaticamente em 30 dias',  days: 30  },
]

// ── Props ──────────────────────────────────────────────────

interface TabVendaConsultivaProps {
  churchId:   string
  churchName: string
}

// ── Helpers ────────────────────────────────────────────────

function cls(...args: (string | false | undefined)[]) {
  return args.filter(Boolean).join(' ')
}

// ── Componente ─────────────────────────────────────────────

export default function TabVendaConsultiva({ churchId, churchName }: TabVendaConsultivaProps) {
  const [mode, setMode] = useState<'ativacao' | 'link'>('ativacao')

  // ── Modo 1: Ativação Imediata ──────────────────────────────
  const [selectedModulos, setSelectedModulos] = useState<string[]>([])
  const [selectedAgentes, setSelectedAgentes] = useState<string[]>([])
  const [tipoAtivacao, setTipoAtivacao]       = useState('courtesy')
  const [ativLoading, setAtivLoading]         = useState(false)
  const [ativResult,  setAtivResult]          = useState<{ activated: string[]; errors: string[] } | null>(null)
  const [ativError,   setAtivError]           = useState<string | null>(null)

  function toggleModulo(key: string) {
    setSelectedModulos(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    )
    setAtivResult(null)
  }

  function toggleAgente(slug: string) {
    setSelectedAgentes(prev =>
      prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug]
    )
    setAtivResult(null)
  }

  const tipoSel   = TIPOS_ATIVACAO.find(t => t.id === tipoAtivacao)!
  const nothingSel = selectedModulos.length === 0 && selectedAgentes.length === 0

  async function ativar() {
    if (nothingSel) return
    setAtivLoading(true)
    setAtivError(null)
    setAtivResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada. Faça login novamente.')

      const agents = selectedAgentes.map(slug => ({
        slug,
        grant_type: tipoSel.days ? 'trial' : 'courtesy',
        ...(tipoSel.days ? { trial_days: tipoSel.days } : {}),
      }))

      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-cockpit-sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ church_id: churchId, agents, modules: selectedModulos }),
      })

      const body = await res.json() as { ok?: boolean; activated?: string[]; errors?: string[]; error?: string }
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setAtivResult({ activated: body.activated ?? [], errors: body.errors ?? [] })
    } catch (err: unknown) {
      setAtivError((err as Error).message ?? 'Erro ao ativar')
    } finally {
      setAtivLoading(false)
    }
  }

  // ── Modo 2: Link de Pagamento ──────────────────────────────
  const [priceId,    setPriceId]    = useState(TODOS_PRODUTOS[0].price_id)
  const [coupon,     setCoupon]     = useState('')
  const [note,       setNote]       = useState('')
  const [linkLoading, setLinkLoading] = useState(false)
  const [linkResult,  setLinkResult]  = useState<{ url: string; expires_at: string } | null>(null)
  const [linkError,   setLinkError]   = useState<string | null>(null)
  const [copied,     setCopied]     = useState(false)

  const selectedProduto = TODOS_PRODUTOS.find(p => p.price_id === priceId)!

  async function gerarLink() {
    setLinkLoading(true)
    setLinkError(null)
    setLinkResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada. Faça login novamente.')

      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-cockpit-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          church_id: churchId,
          price_id:  priceId,
          coupon:    coupon.trim() || undefined,
          note:      note.trim()   || undefined,
        }),
      })

      const body = await res.json() as { url?: string; expires_at?: string; error?: string }
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
      setLinkResult({ url: body.url!, expires_at: body.expires_at! })
    } catch (err: unknown) {
      setLinkError((err as Error).message ?? 'Erro ao gerar link')
    } finally {
      setLinkLoading(false)
    }
  }

  async function copyLink() {
    if (!linkResult?.url) return
    await navigator.clipboard.writeText(linkResult.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // ── Estilos ────────────────────────────────────────────────

  const inputCls = [
    'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500]',
    'transition-colors bg-white',
  ].join(' ')

  const checkboxItemCls = (active: boolean) => cls(
    'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all select-none',
    active
      ? 'border-[#e13500]/40 bg-[#e13500]/5'
      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
  )

  const radioItemCls = (active: boolean) => cls(
    'flex items-center gap-3 px-4 py-2.5 rounded-xl border cursor-pointer transition-all select-none text-sm',
    active
      ? 'border-[#e13500]/40 bg-[#e13500]/5 font-semibold text-[#e13500]'
      : 'border-gray-200 hover:border-gray-300 text-gray-700'
  )

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Header */}
      <div>
        <h3 className="font-display text-lg font-semibold text-gray-900">Venda Consultiva</h3>
        <p className="text-sm text-gray-500 mt-1">
          Ative módulos e agentes ou gere links Stripe para <strong>{churchName}</strong>.
          Todas as ações são registradas em auditoria.
        </p>
      </div>

      {/* Mode Switcher */}
      <div className="flex gap-2 p-1 bg-gray-100 rounded-2xl w-fit">
        <button
          onClick={() => setMode('ativacao')}
          className={cls(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
            mode === 'ativacao'
              ? 'bg-white shadow-sm text-[#e13500]'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Zap size={14} />
          Ativação Imediata
        </button>
        <button
          onClick={() => setMode('link')}
          className={cls(
            'flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all',
            mode === 'link'
              ? 'bg-white shadow-sm text-[#e13500]'
              : 'text-gray-500 hover:text-gray-700'
          )}
        >
          <Link2 size={14} />
          Link de Pagamento
        </button>
      </div>

      {/* ── MODO 1: ATIVAÇÃO IMEDIATA ── */}
      {mode === 'ativacao' && (
        <div className="space-y-5">

          {/* Info */}
          <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <Gift size={15} className="text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">
              <strong>Ativação sem pagamento</strong> — use para demos, testes internos e cortesias.
              Módulos e agentes são ativados instantaneamente via <code className="font-mono">admin-cockpit-sell</code>.
            </p>
          </div>

          {/* Módulos */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Package size={14} className="text-gray-500" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Módulos</span>
            </div>
            <div className="space-y-2">
              {MODULOS_ATIVAVEIS.map(m => (
                <label key={m.key} className={checkboxItemCls(selectedModulos.includes(m.key))}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#e13500]"
                    checked={selectedModulos.includes(m.key)}
                    onChange={() => toggleModulo(m.key)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{m.label}</span>
                      {m.activatesAgent && (
                        <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
                          auto-ativa {m.activatesAgent}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 mt-0.5 block">{m.detail}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Agentes */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Bot size={14} className="text-gray-500" />
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Agentes IA</span>
            </div>
            <div className="space-y-2">
              {AGENTES_ATIVAVEIS.map(a => (
                <label key={a.slug} className={checkboxItemCls(selectedAgentes.includes(a.slug))}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#e13500]"
                    checked={selectedAgentes.includes(a.slug)}
                    onChange={() => toggleAgente(a.slug)}
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-gray-800 block">{a.label}</span>
                    <span className="text-xs text-gray-500 mt-0.5 block">{a.detail}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Tipo de Ativação */}
          <div>
            <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
              Tipo de Ativação
            </div>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_ATIVACAO.map(t => (
                <label key={t.id} className={radioItemCls(tipoAtivacao === t.id)}>
                  <input
                    type="radio"
                    name="tipoAtivacao"
                    value={t.id}
                    checked={tipoAtivacao === t.id}
                    onChange={() => setTipoAtivacao(t.id)}
                    className="accent-[#e13500]"
                  />
                  <div>
                    <div className="font-semibold leading-tight">{t.label}</div>
                    <div className="text-xs text-gray-500 font-normal leading-tight mt-0.5">{t.detail}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Botão Ativar */}
          <button
            onClick={() => void ativar()}
            disabled={ativLoading || nothingSel}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40 w-full justify-center bg-[#e13500] hover:bg-[#FF4D1A] active:bg-[#C42E00]"
          >
            {ativLoading
              ? <><Loader size={14} className="animate-spin" /> Ativando...</>
              : <><Zap size={14} /> Ativar Agora
                  {!nothingSel && (
                    <span className="ml-1 opacity-75">
                      ({selectedModulos.length + selectedAgentes.length} item{selectedModulos.length + selectedAgentes.length !== 1 ? 's' : ''} · {tipoSel.label})
                    </span>
                  )}
                </>
            }
          </button>

          {/* Erro ativação */}
          {ativError && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {ativError}
            </div>
          )}

          {/* Resultado ativação */}
          {ativResult && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4 space-y-2">
              <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                <CheckCircle2 size={15} />
                Ativação concluída
              </div>
              {ativResult.activated.length > 0 && (
                <ul className="space-y-1">
                  {ativResult.activated.map(a => (
                    <li key={a} className="flex items-center gap-2 text-xs text-green-700">
                      <ChevronRight size={12} />
                      {a}
                    </li>
                  ))}
                </ul>
              )}
              {ativResult.errors.length > 0 && (
                <ul className="space-y-1 mt-2">
                  {ativResult.errors.map(e => (
                    <li key={e} className="flex items-center gap-2 text-xs text-amber-700">
                      <AlertCircle size={12} />
                      {e}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-green-600 mt-1">Registrado em <code className="font-mono">admin_events</code>.</p>
            </div>
          )}
        </div>
      )}

      {/* ── MODO 2: LINK DE PAGAMENTO ── */}
      {mode === 'link' && (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 space-y-4">

          {/* Produto */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Produto</label>
            <select
              className={inputCls}
              value={priceId}
              onChange={e => { setPriceId(e.target.value); setLinkResult(null) }}
              disabled={linkLoading}
            >
              {PRODUTOS_PAGAMENTO.map(group => (
                <optgroup key={group.group} label={group.group}>
                  {group.items.map(p => (
                    <option key={p.price_id} value={p.price_id}>
                      {p.label} — {p.detail}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              Modo: <span className="font-medium">
                {selectedProduto.mode === 'subscription' ? 'Assinatura recorrente' : 'Pagamento único'}
              </span>
            </p>
          </div>

          {/* Cupom */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Cupom de desconto <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <input
              type="text"
              className={inputCls}
              placeholder="Ex: FUNDADOR50"
              value={coupon}
              onChange={e => setCoupon(e.target.value.toUpperCase())}
              disabled={linkLoading}
              maxLength={50}
            />
            <p className="text-xs text-gray-400 mt-1">
              Cupons disponíveis: <span className="font-mono font-medium">FUNDADOR50</span> (50% forever),{' '}
              <span className="font-mono font-medium">AMIGO_AGENTE_R1</span> (R$289 off),{' '}
              <span className="font-mono font-medium">AMIGO_PILOTO_R1</span> (R$688,90 off)
            </p>
          </div>

          {/* Nota interna */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Nota interna <span className="text-gray-400 font-normal">(opcional — registrada em auditoria)</span>
            </label>
            <textarea
              className={inputCls}
              rows={2}
              placeholder="Ex: Indicação por Felipe — ligação consultiva 01/06"
              value={note}
              onChange={e => setNote(e.target.value.slice(0, 200))}
              disabled={linkLoading}
            />
            <p className="text-xs text-gray-400 text-right">{note.length}/200</p>
          </div>

          {/* Aviso Volunteer Pro */}
          <div className="flex items-start gap-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-xl">
            <AlertCircle size={13} className="text-blue-500 mt-0.5 shrink-0" />
            <p className="text-xs text-blue-700">
              <strong>Volunteer Pro</strong> ainda não tem Price ID Stripe. Para liberar, use{' '}
              <button
                className="underline font-semibold"
                onClick={() => setMode('ativacao')}
              >
                Ativação Imediata
              </button>{' '}
              e selecione o módulo Voluntários.
            </p>
          </div>

          {/* Botão Gerar Link */}
          <button
            onClick={() => void gerarLink()}
            disabled={linkLoading}
            className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 w-full justify-center bg-[#e13500] hover:bg-[#FF4D1A] active:bg-[#C42E00]"
          >
            {linkLoading
              ? <><Loader size={14} className="animate-spin" /> Gerando link...</>
              : <><ExternalLink size={14} /> Gerar Link de Pagamento</>
            }
          </button>

          {/* Erro link */}
          {linkError && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-sm text-red-700">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              {linkError}
            </div>
          )}

          {/* Link gerado */}
          {linkResult && (
            <div className="bg-green-50 rounded-2xl border border-green-200 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-green-600 shrink-0" />
                <span className="text-sm font-semibold text-green-700">Link gerado com sucesso</span>
              </div>

              <div className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2">
                <span className="text-xs text-gray-600 truncate flex-1 font-mono">{linkResult.url}</span>
                <button
                  onClick={() => void copyLink()}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: copied ? '#2D7A4F18' : '#e1350018',
                    color:      copied ? '#2D7A4F'   : '#e13500',
                  }}
                >
                  {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>

              <p className="text-xs text-gray-400">
                Expira em:{' '}
                <span className="font-medium text-gray-600">
                  {new Intl.DateTimeFormat('pt-BR', {
                    day: '2-digit', month: '2-digit', year: '2-digit',
                    hour: '2-digit', minute: '2-digit',
                  }).format(new Date(linkResult.expires_at))}
                </span>
              </p>
              <p className="text-xs text-gray-400">
                Registrado em <code className="font-mono">admin_events</code>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
