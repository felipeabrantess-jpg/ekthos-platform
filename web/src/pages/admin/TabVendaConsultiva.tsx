// ============================================================
// TabVendaConsultiva — Cockpit Link Consultivo (P2)
//
// Gera links Stripe Checkout rastreados para uma igreja via
// admin-cockpit-link EF. Todos os links incluem metadata
// obrigatória: church_id, admin_id, origin='cockpit_consultivo'.
//
// REGRA: NUNCA exibir link sem audit trail. Somente Price IDs
// canônicos do whitelist são aceitos pelo backend.
// ============================================================

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Copy, CheckCircle2, ExternalLink, Loader } from 'lucide-react'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

// ── Produtos (Price IDs canônicos LIVE) ────────────────────

const PRODUTOS = [
  { price_id: 'price_1TYroEHfvCy1ruEN6j4QxHmU', label: 'Plano Chamado — R$689,90/mês',      mode: 'subscription' },
  { price_id: 'price_1Tcya5HfvCy1ruENDXuf9KlM', label: 'Plano Missão — R$1.639,90/mês',      mode: 'subscription' },
  { price_id: 'price_1Tcya8HfvCy1ruENe5NqXPWH', label: 'Plano Avivamento — R$2.469,90/mês',  mode: 'subscription' },
  { price_id: 'price_1TcyZmHfvCy1ruEND2SbGerK', label: 'Recarga Emergencial — R$99,00',       mode: 'payment'      },
  { price_id: 'price_1TcyZpHfvCy1ruENrQi5YdZu', label: 'Recarga Ponte — R$269,00',            mode: 'payment'      },
  { price_id: 'price_1TYroFHfvCy1ruENm4Lunluh', label: 'Agent Acolhimento — R$290,00',        mode: 'payment'      },
]

// ── Props ──────────────────────────────────────────────────

interface TabVendaConsultivaProps {
  churchId:   string
  churchName: string
}

// ── Componente ─────────────────────────────────────────────

export default function TabVendaConsultiva({ churchId, churchName }: TabVendaConsultivaProps) {
  const [priceId,   setPriceId]   = useState(PRODUTOS[0].price_id)
  const [coupon,    setCoupon]    = useState('')
  const [note,      setNote]      = useState('')
  const [loading,   setLoading]   = useState(false)
  const [result,    setResult]    = useState<{ url: string; expires_at: string } | null>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [copied,    setCopied]    = useState(false)

  const selectedProduto = PRODUTOS.find(p => p.price_id === priceId)!

  async function gerarLink() {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sessão expirada. Faça login novamente.')

      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-cockpit-link`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          church_id: churchId,
          price_id:  priceId,
          coupon:    coupon.trim() || undefined,
          note:      note.trim()   || undefined,
        }),
      })

      const body = await res.json()
      if (!res.ok) {
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
      }

      setResult(body as { url: string; expires_at: string })
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Erro ao gerar link')
    } finally {
      setLoading(false)
    }
  }

  async function copyLink() {
    if (!result?.url) return
    await navigator.clipboard.writeText(result.url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const inputCls = [
    'w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm',
    'focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500]',
    'transition-colors bg-white',
  ].join(' ')

  return (
    <div className="max-w-xl space-y-6">
      {/* Header */}
      <div>
        <h3 className="font-display text-lg font-semibold text-gray-900">Venda Consultiva</h3>
        <p className="text-sm text-gray-500 mt-1">
          Gere um link Stripe rastreado para <strong>{churchName}</strong>.
          Todos os links são registrados em auditoria.
        </p>
      </div>

      {/* Form */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 space-y-4">
        {/* Produto */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Produto</label>
          <select
            className={inputCls}
            value={priceId}
            onChange={e => { setPriceId(e.target.value); setResult(null) }}
            disabled={loading}
          >
            {PRODUTOS.map(p => (
              <option key={p.price_id} value={p.price_id}>{p.label}</option>
            ))}
          </select>
          <p className="text-xs text-gray-400 mt-1">
            Modo: <span className="font-medium">{selectedProduto.mode === 'subscription' ? 'Assinatura recorrente' : 'Pagamento único'}</span>
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
            disabled={loading}
            maxLength={50}
          />
        </div>

        {/* Nota interna */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Nota interna <span className="text-gray-400 font-normal">(opcional — registrada em auditoria)</span>
          </label>
          <textarea
            className={inputCls}
            rows={2}
            placeholder="Ex: Indicação por Felipe — ligação consultiva 31/05"
            value={note}
            onChange={e => setNote(e.target.value.slice(0, 200))}
            disabled={loading}
          />
          <p className="text-xs text-gray-400 text-right">{note.length}/200</p>
        </div>

        {/* Botão */}
        <button
          onClick={() => void gerarLink()}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50 w-full justify-center"
          style={{ background: 'var(--color-primary)' }}
        >
          {loading ? <Loader size={14} className="animate-spin" /> : <ExternalLink size={14} />}
          {loading ? 'Gerando link...' : 'Gerar link de pagamento'}
        </button>
      </div>

      {/* Erro */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Link gerado */}
      {result && (
        <div className="bg-white rounded-2xl border border-green-200 shadow-sm p-5 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600 shrink-0" />
            <span className="text-sm font-semibold text-green-700">Link gerado com sucesso</span>
          </div>

          <div className="flex items-center gap-2 bg-gray-50 rounded-xl border border-gray-200 px-3 py-2">
            <span className="text-xs text-gray-600 truncate flex-1 font-mono">{result.url}</span>
            <button
              onClick={() => void copyLink()}
              className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: copied ? '#2D7A4F18' : 'var(--color-primary)18',
                color:      copied ? '#2D7A4F'   : 'var(--color-primary)',
              }}
            >
              {copied ? <CheckCircle2 size={12} /> : <Copy size={12} />}
              {copied ? 'Copiado!' : 'Copiar'}
            </button>
          </div>

          <p className="text-xs text-gray-400">
            Expira em: <span className="font-medium text-gray-600">
              {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(result.expires_at))}
            </span>
          </p>

          <p className="text-xs text-gray-400">
            Este link foi registrado em auditoria (<code className="font-mono">admin_events</code>).
          </p>
        </div>
      )}
    </div>
  )
}
