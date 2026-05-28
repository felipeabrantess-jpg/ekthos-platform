/**
 * Cupons.tsx — /admin/cockpit/cupons
 *
 * Módulo de gestão de cupons Stripe para ekthos_admin.
 * Permite criar, listar, ver detalhes e arquivar cupons LIVE.
 */

import { useState, useCallback, useEffect } from 'react'
import {
  Tag, Plus, RefreshCw, Copy, ExternalLink, Archive,
  CheckCircle, AlertCircle, X, ChevronDown, Loader,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

// ── Types ──────────────────────────────────────────────────────────────────────

interface Coupon {
  id: string
  name: string
  discount_display: string
  discount_type: 'amount_off' | 'percent_off'
  amount_off: number | null
  percent_off: number | null
  duration: 'once' | 'forever'
  redemptions_used: number
  redemptions_max: number | null
  valid_until: string | null
  applies_to: string[] | null
  active: boolean
  archived_at: string | null
  livemode: boolean
  created_at: string
  last_synced_at: string | null
}

interface CouponDetail extends Coupon {
  used_by: Array<{
    church_id: string
    church_name: string
    city: string | null
    state: string | null
    plan_slug: string
    subscribed_at: string
  }>
  audit_events: Array<{
    action: string
    created_at: string
    actor_email: string
    after: Record<string, unknown>
  }>
  payment_link_with_coupon: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function getToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? ''
}

async function callEF(slug: string, body: unknown) {
  const token = await getToken()
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${slug}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  })
  return res.json()
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Toast ────────────────────────────────────────────────────

interface ToastState { msg: string; type: 'success' | 'error'; key: number }

function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm border"
      style={{
        background: type === 'success' ? '#f0fdf4' : '#fef2f2',
        borderColor: type === 'success' ? '#bbf7d0' : '#fecaca',
        color: type === 'success' ? '#166534' : '#991b1b',
      }}
    >
      {type === 'success'
        ? <CheckCircle size={16} className="shrink-0" />
        : <AlertCircle size={16} className="shrink-0" />}
      <span>{msg}</span>
      <button onClick={onClose} className="ml-auto opacity-50 hover:opacity-100"><X size={14} /></button>
    </div>
  )
}

// ── Copy ─────────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // fallback para ambientes sem clipboard API (iframe, http)
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
  }
}

// ── StatusBadge ────────────────────────────────────────────────────────────

function StatusBadge({ active, archived }: { active: boolean; archived: string | null }) {
  if (!active || archived) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
        <Archive size={10} />
        Arquivado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
      <CheckCircle size={10} />
      Ativo
    </span>
  )
}

function LivemodeBadge({ livemode }: { livemode: boolean }) {
  if (!livemode) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">TEST</span>
  }
  return <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">LIVE</span>
}

// ── ModalNovoCupom ──────────────────────────────────────────────────────────

interface ModalNovoCupomProps {
  onClose: () => void
  onCreated: (coupon: { id: string }) => void
}

const PRODUCTS = [
  { label: 'Plano Chamado', value: 'prod_UXxjIUYqumaK6K' },
  { label: 'Agente Acolhimento Pastoral', value: 'prod_UXxjD6zrM12km6' },
]

function ModalNovoCupom({ onClose, onCreated }: ModalNovoCupomProps) {
  const [form, setForm] = useState({
    name: '',
    code: '',
    discount_type: 'amount_off' as 'amount_off' | 'percent_off',
    amount_brl: '',      // em reais com vírgula
    percent_off: '',
    duration: 'once' as 'once' | 'forever',
    max_redemptions: '',
    redeem_by: '',
    applies_to_products: [] as string[],
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<{ id: string; payment_link_chamado: string; payment_link_acolhimento: string; promo_code: string | null } | null>(null)
  const [copyToast, setCopyToast] = useState<ToastState | null>(null)

  async function handleCopy(text: string, label: string) {
    await copyToClipboard(text)
    setCopyToast({ msg: `${label} copiado!`, type: 'success', key: Date.now() })
  }

  function field(key: keyof typeof form) {
    return {
      value: form[key] as string,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm(f => ({ ...f, [key]: e.target.value })),
    }
  }

  function toggleProduct(value: string) {
    setForm(f => ({
      ...f,
      applies_to_products: f.applies_to_products.includes(value)
        ? f.applies_to_products.filter(p => p !== value)
        : [...f.applies_to_products, value],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const amountOff = form.discount_type === 'amount_off'
        ? Math.round(parseFloat(form.amount_brl.replace(',', '.')) * 100)
        : undefined

      const body: Record<string, unknown> = {
        name: form.name.trim(),
        discount_type: form.discount_type,
        duration: form.duration,
      }
      if (form.code.trim()) body.code = form.code.trim().toUpperCase()
      if (form.discount_type === 'amount_off') body.amount_off = amountOff
      if (form.discount_type === 'percent_off') body.percent_off = parseFloat(form.percent_off)
      if (form.max_redemptions.trim()) body.max_redemptions = parseInt(form.max_redemptions)
      if (form.redeem_by) body.redeem_by = new Date(form.redeem_by).toISOString()
      if (form.applies_to_products.length) body.applies_to_products = form.applies_to_products

      const data = await callEF('admin-coupon-create', body)
      if (data.error) { setError(data.error); return }

      setCreated(data)
      onCreated(data)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const inputCls = 'w-full border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30 focus:border-[#e13500]/50'
  const labelCls = 'block text-xs font-semibold text-gray-700 mb-1'

  if (created) {
    const linkChamado = created.payment_link_chamado ?? ''
    const codeForMsg  = created.promo_code ?? created.id
    const msg = `Olá! Temos uma condição especial pra você começar no Ekthos.\n\nAcesse o link abaixo e use o cupom *${codeForMsg}* no campo de código promocional:\n\n${linkChamado}`
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
        <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle size={20} className="text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Cupom criado!</h3>
              <p className="text-xs text-gray-500">Ativo no Stripe LIVE + Promotion Code gerado</p>
            </div>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Código</span>
              <div className="flex items-center gap-2">
                <code className="text-sm font-bold text-[#e13500] font-mono">{codeForMsg}</code>
                <button onClick={() => handleCopy(codeForMsg, 'Código')} className="text-gray-400 hover:text-gray-600">
                  <Copy size={13} />
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Link Plano Chamado</span>
              <a href={linkChamado} target="_blank" rel="noreferrer"
                className="text-xs text-[#e13500] hover:underline flex items-center gap-1">
                Abrir <ExternalLink size={11} />
              </a>
            </div>
            {created.payment_link_acolhimento && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Link Acolhimento</span>
                <a href={created.payment_link_acolhimento} target="_blank" rel="noreferrer"
                  className="text-xs text-[#e13500] hover:underline flex items-center gap-1">
                  Abrir <ExternalLink size={11} />
                </a>
              </div>
            )}
          </div>

          <button
            onClick={() => handleCopy(msg, 'Mensagem WhatsApp')}
            className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold border-2 border-[#e13500] text-[#e13500] hover:bg-[#e13500]/5 transition-colors flex items-center justify-center gap-2"
          >
            <Copy size={14} />
            Copiar mensagem pronta (WhatsApp)
          </button>

          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            Fechar
          </button>
        </div>

        {/* Toast de cópia */}
        {copyToast && (
          <Toast key={copyToast.key} msg={copyToast.msg} type={copyToast.type} onClose={() => setCopyToast(null)} />
        )}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-black/8">
          <h2 className="font-semibold text-gray-900">Novo cupom</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Nome */}
          <div>
            <label className={labelCls}>Nome amigável *</label>
            <input className={inputCls} placeholder='ex: Piloto Amigo R$1 — Plano Chamado' required {...field('name')} />
          </div>

          {/* Código */}
          <div>
            <label className={labelCls}>Código (opcional — autogera se vazio)</label>
            <input className={inputCls} placeholder='EKTHOS_2026_XXXX' {...field('code')}
              onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} />
          </div>

          {/* Tipo de desconto */}
          <div>
            <label className={labelCls}>Tipo de desconto *</label>
            <div className="flex gap-3">
              {[
                { v: 'amount_off', label: 'Valor fixo (R$)' },
                { v: 'percent_off', label: 'Percentual (%)' },
              ].map(({ v, label }) => (
                <label key={v} className="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="discount_type" value={v} checked={form.discount_type === v}
                    onChange={() => setForm(f => ({ ...f, discount_type: v as 'amount_off' | 'percent_off' }))} />
                  <span className="text-sm">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Valor */}
          {form.discount_type === 'amount_off' ? (
            <div>
              <label className={labelCls}>Valor de desconto (R$) *</label>
              <input className={inputCls} placeholder='688,90' required {...field('amount_brl')} />
              <p className="text-xs text-gray-400 mt-1">Digite em reais com vírgula. Ex: 688,90</p>
            </div>
          ) : (
            <div>
              <label className={labelCls}>Percentual de desconto (%) *</label>
              <input className={inputCls} type="number" min="1" max="100" placeholder='50' required {...field('percent_off')} />
            </div>
          )}

          {/* Duração */}
          <div>
            <label className={labelCls}>Duração *</label>
            <select className={inputCls} {...field('duration')}>
              <option value="once">once — apenas na 1ª cobrança</option>
              <option value="forever">forever — todas as cobranças</option>
            </select>
          </div>

          {/* Max usos */}
          <div>
            <label className={labelCls}>Máximo de usos (vazio = ilimitado)</label>
            <input className={inputCls} type="number" min="1" placeholder='5' {...field('max_redemptions')} />
          </div>

          {/* Válido até */}
          <div>
            <label className={labelCls}>Válido até (opcional)</label>
            <input className={inputCls} type="date" {...field('redeem_by')} />
          </div>

          {/* Aplica em */}
          <div>
            <label className={labelCls}>Aplica em (vazio = todos os produtos)</label>
            <div className="space-y-2">
              {PRODUCTS.map(p => (
                <label key={p.value} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.applies_to_products.includes(p.value)}
                    onChange={() => toggleProduct(p.value)} />
                  <span className="text-sm">{p.label}</span>
                </label>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-black/10 text-gray-600 hover:bg-gray-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all flex items-center justify-center gap-2 disabled:opacity-60"
              style={{ background: '#e13500' }}>
              {loading ? <Loader size={15} className="animate-spin" /> : <Plus size={15} />}
              {loading ? 'Criando...' : 'Criar cupom'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── CouponDetailModal ──────────────────────────────────────────────────────

function CouponDetailModal({
  couponId,
  onClose,
  onDeactivated,
}: {
  couponId: string
  onClose: () => void
  onDeactivated: () => void
}) {
  const [data, setData] = useState<CouponDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [deactivating, setDeactivating] = useState(false)
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await callEF('admin-coupon-detail', { coupon_id: couponId })
    if (res.error) { setError(res.error); setLoading(false); return }
    setData(res)
    setLoading(false)
  }, [couponId])

  useState(() => { void load() })

  async function handleDeactivate() {
    setDeactivating(true)
    const res = await callEF('admin-coupon-deactivate', { coupon_id: couponId })
    if (res.error) { setError(res.error); setDeactivating(false); return }
    onDeactivated()
    onClose()
  }

  async function copyLink() {
    if (!data) return
    await copyToClipboard(data.payment_link_with_coupon)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const coupon = data?.coupon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-black/8">
          <div className="flex items-center gap-3">
            <Tag size={18} className="text-[#e13500]" />
            <h2 className="font-semibold text-gray-900">{coupon?.name ?? 'Carregando...'}</h2>
            {coupon && <LivemodeBadge livemode={coupon.livemode} />}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="p-6 text-red-600 text-sm">{error}</div>
        ) : coupon ? (
          <div className="p-6 space-y-6">
            {/* Dados principais */}
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Código', value: coupon.id },
                { label: 'Desconto', value: coupon.discount_display },
                { label: 'Duração', value: coupon.duration === 'once' ? 'Primeira cobrança apenas' : 'Permanente' },
                { label: 'Usos', value: `${coupon.redemptions_used}${coupon.redemptions_max ? `/${coupon.redemptions_max}` : ' (ilimitado)'}` },
                { label: 'Status', value: <StatusBadge active={coupon.active} archived={coupon.archived_at} /> },
                { label: 'Válido até', value: coupon.valid_until ? formatDate(coupon.valid_until) : 'Sem validade' },
                { label: 'Criado em', value: formatDate(coupon.created_at) },
                { label: 'Último sync', value: coupon.last_synced_at ? formatDateTime(coupon.last_synced_at) : '—' },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="text-xs text-gray-500 mb-0.5">{label}</p>
                  <p className="text-sm font-medium text-gray-900">{value}</p>
                </div>
              ))}
            </div>

            {/* Link com cupom */}
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-600 mb-2">Payment Link com cupom pré-aplicado</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs text-gray-700 break-all">{data!.payment_link_with_coupon}</code>
                <button onClick={copyLink}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#e13500] text-[#e13500] hover:bg-[#e13500]/5 transition-colors">
                  <Copy size={12} />
                  {copied ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>

            {/* Igrejas que usaram */}
            {data!.used_by.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Igrejas que usaram este cupom</p>
                <div className="space-y-2">
                  {data!.used_by.map(u => (
                    <div key={u.church_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{u.church_name}</p>
                        <p className="text-xs text-gray-500">{u.city}, {u.state} · {u.plan_slug}</p>
                      </div>
                      <p className="text-xs text-gray-400">{formatDate(u.subscribed_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Histórico de auditoria */}
            {data!.audit_events.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Histórico de auditoria</p>
                <div className="space-y-1.5">
                  {data!.audit_events.map((e, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="font-mono text-gray-600">{e.action}</span>
                      <span className="text-gray-400">{formatDateTime(e.created_at)} · {e.actor_email}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ações */}
            {coupon.active && (
              <div className="border-t border-black/8 pt-4">
                {!confirmDeactivate ? (
                  <button
                    onClick={() => setConfirmDeactivate(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-red-600 border border-red-200 hover:bg-red-50 transition-colors"
                  >
                    <Archive size={14} />
                    Arquivar cupom
                  </button>
                ) : (
                  <div className="p-4 bg-red-50 rounded-xl space-y-3">
                    <p className="text-sm font-medium text-red-800">
                      Isso irá deletar o cupom no Stripe. Cupons já usados continuam válidos nas assinaturas existentes.
                    </p>
                    <div className="flex gap-3">
                      <button onClick={() => setConfirmDeactivate(false)}
                        className="flex-1 py-2 rounded-lg text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                        Cancelar
                      </button>
                      <button onClick={() => void handleDeactivate()} disabled={deactivating}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                        {deactivating ? <Loader size={13} className="animate-spin" /> : null}
                        Confirmar arquivamento
                      </button>
                    </div>
                    {error && <p className="text-xs text-red-700">{error}</p>}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ── Cupons (page principal) ─────────────────────────────────────────────────

export default function Cupons() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [includeArchived, setIncludeArchived] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadCoupons = useCallback(async () => {
    setLoading(true)
    setError(null)
    const data = await callEF('admin-coupons-list', { include_archived: includeArchived })
    if (data.error) { setError(data.error); setLoading(false); return }
    setCoupons(data.coupons ?? [])
    setLoading(false)
  }, [includeArchived, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useState(() => { void loadCoupons() })

  function refresh() { setRefreshKey(k => k + 1) }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900" style={{ fontFamily: 'Playfair Display, serif' }}>
            Cupons
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Gerencie cupons de desconto Stripe LIVE
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-black/10 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Sync
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-all hover:opacity-90"
            style={{ background: '#e13500' }}
          >
            <Plus size={14} />
            Novo cupom
          </button>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-600">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={e => { setIncludeArchived(e.target.checked); refresh() }}
          />
          Incluir arquivados
        </label>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border border-black/8 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 p-6 text-red-600 text-sm">
            <AlertCircle size={16} />
            {error}
          </div>
        ) : coupons.length === 0 ? (
          <div className="text-center py-16">
            <Tag size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm text-gray-500">Nenhum cupom encontrado</p>
            <button
              onClick={() => setShowModal(true)}
              className="mt-4 text-sm text-[#e13500] hover:underline font-medium"
            >
              Criar primeiro cupom
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-black/5">
                {['Nome / Código', 'Desconto', 'Duração', 'Usos', 'Válido até', 'Status', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {coupons.map(c => (
                <tr
                  key={c.id}
                  className="border-b border-black/5 hover:bg-black/[0.02] cursor-pointer transition-colors"
                  onClick={() => setSelectedCouponId(c.id)}
                >
                  <td className="px-4 py-3.5">
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <code className="text-[11px] text-gray-500 font-mono">{c.id}</code>
                      <LivemodeBadge livemode={c.livemode} />
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-700 font-medium">{c.discount_display}</td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">
                    {c.duration === 'once' ? '1ª cobrança' : 'Permanente'}
                  </td>
                  <td className="px-4 py-3.5 text-sm">
                    <span className={`font-mono font-semibold ${
                      c.redemptions_max && c.redemptions_used >= c.redemptions_max
                        ? 'text-red-600'
                        : 'text-gray-700'
                    }`}>
                      {c.redemptions_used}
                    </span>
                    <span className="text-gray-400 text-xs">
                      {c.redemptions_max ? `/${c.redemptions_max}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-gray-500">
                    {c.valid_until ? formatDate(c.valid_until) : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <StatusBadge active={c.active} archived={c.archived_at} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <ChevronDown size={14} className="text-gray-300 ml-auto rotate-[-90deg]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal novo cupom */}
      {showModal && (
        <ModalNovoCupom
          onClose={() => setShowModal(false)}
          onCreated={() => { refresh() }}
        />
      )}

      {/* Modal detalhe */}
      {selectedCouponId && (
        <CouponDetailModal
          couponId={selectedCouponId}
          onClose={() => setSelectedCouponId(null)}
          onDeactivated={refresh}
        />
      )}
    </div>
  )
}
