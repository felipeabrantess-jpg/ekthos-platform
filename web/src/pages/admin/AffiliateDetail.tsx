import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Edit2, Plus, Loader, CheckCircle, XCircle,
  X, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

// ── Types ────────────────────────────────────────────────────

interface Affiliate {
  id: string; full_name: string; email: string; phone: string | null
  document: string | null; pix_key: string; pix_key_kind: string | null
  social_handle: string | null; audience_size: number | null
  notes: string | null; status: string; created_at: string
}

interface Coupon {
  id: string; code: string
  discount_kind: string; discount_value: number; discount_duration_months: number | null
  commission_kind: string; commission_value: number; commission_duration_months: number | null
  applies_to_plans: string[] | null
  max_redemptions: number | null; current_redemptions: number
  ends_at: string | null; active: boolean; created_at: string
  stripe_promotion_code_id: string | null
}

interface Conversion {
  id: string; church_id: string; converted_at: string
  initial_plan: string | null; initial_amount_cents: number | null; status: string
  churches: { name: string } | null
  affiliate_coupons: { code: string } | null
}

interface Commission {
  id: string; reference_month: string
  base_amount_cents: number; commission_amount_cents: number
  status: string; approves_at: string; approved_at: string | null; paid_at: string | null
}

// ── Helpers ──────────────────────────────────────────────────

const fmt = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

const fmtDate = (s: string) => new Date(s).toLocaleDateString('pt-BR')

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão expirada')
  return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
}

function generateCode(name: string): string {
  const slug = name.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  return `${slug}${Math.floor(10 + Math.random() * 90)}`
}

// ── Toast ────────────────────────────────────────────────────

function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm border"
      style={{
        background: type === 'success' ? '#f0fdf4' : '#fef2f2',
        borderColor: type === 'success' ? '#bbf7d0' : '#fecaca',
        color: type === 'success' ? '#166534' : '#991b1b',
      }}>
      {type === 'success'
        ? <CheckCircle size={16} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: '#16a34a' }} />
        : <XCircle    size={16} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: '#dc2626' }} />}
      <span className="flex-1">{msg}</span>
      <button onClick={onClose}><X size={14} strokeWidth={2} /></button>
    </div>
  )
}

// ── New Coupon Modal ──────────────────────────────────────────

function NewCouponModal({ affiliateId, affiliateName, onClose, onCreated }: {
  affiliateId: string; affiliateName: string
  onClose: () => void; onCreated: () => void
}) {
  const [code,          setCode]          = useState(generateCode(affiliateName))
  const [discountKind,  setDiscountKind]  = useState('percent_first')
  const [discountVal,   setDiscountVal]   = useState('')
  const [discountDur,   setDiscountDur]   = useState('')
  const [commKind,      setCommKind]      = useState('percent_first')
  const [commVal,       setCommVal]       = useState('')
  const [commDur,       setCommDur]       = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [endsAt,        setEndsAt]        = useState('')
  const [plans,         setPlans]         = useState<string[]>([])
  const [saving,        setSaving]        = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  const allPlans = ['chamado', 'missao', 'avivamento']

  function togglePlan(p: string) {
    setPlans(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  }

  async function save() {
    if (!discountVal || !commVal) { setError('Preencha os valores de desconto e comissão'); return }
    setSaving(true); setError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-coupon-create`, {
        method: 'POST', headers,
        body: JSON.stringify({
          affiliate_id: affiliateId,
          code: code.toUpperCase(),
          discount_kind: discountKind,
          discount_value: parseInt(discountVal),
          discount_duration_months: discountDur ? parseInt(discountDur) : null,
          commission_kind: commKind,
          commission_value: commKind === 'fixed_per_sale'
            ? Math.round(parseFloat(commVal.replace(',', '.')) * 100)
            : parseInt(commVal),
          commission_duration_months: commDur ? parseInt(commDur) : null,
          applies_to_plans: plans.length > 0 ? plans : null,
          max_redemptions: maxRedemptions ? parseInt(maxRedemptions) : null,
          ends_at: endsAt || null,
        }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onCreated()
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  const fi = 'w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition'
  const label = (t: string) => <label className="block text-xs font-medium text-gray-600 mb-1">{t}</label>

  const showDiscountDuration = discountKind === 'percent_recurring'
  const showCommDuration = commKind === 'percent_recurring'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl">
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Novo Cupom — {affiliateName}</h2>
          <button onClick={onClose}><X size={18} strokeWidth={2} className="text-gray-400" /></button>
        </div>

        <div className="px-6 py-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Código */}
          <div>
            {label('Código do cupom *')}
            <div className="flex gap-2">
              <input className={`${fi} font-mono uppercase flex-1`} value={code} onChange={e => setCode(e.target.value.toUpperCase())} />
              <button onClick={() => setCode(generateCode(affiliateName))}
                className="px-3 py-2 rounded-lg border border-black/10 text-xs text-gray-500 hover:bg-gray-50 whitespace-nowrap">
                Gerar
              </button>
            </div>
          </div>

          {/* Planos */}
          <div>
            {label('Aplicar nos planos (vazio = todos)')}
            <div className="flex gap-2 flex-wrap">
              {allPlans.map(p => (
                <button key={p} onClick={() => togglePlan(p)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition capitalize ${plans.includes(p) ? 'border-red-400 text-red-700 bg-red-50' : 'border-black/10 text-gray-500 hover:bg-gray-50'}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Desconto */}
          <div className="rounded-xl border border-black/5 p-4 space-y-3 bg-gray-50/50">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Desconto pro cliente</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                {label('Tipo *')}
                <select className={fi} value={discountKind} onChange={e => setDiscountKind(e.target.value)}>
                  <option value="percent_first">% primeiro mês</option>
                  <option value="percent_recurring">% recorrente</option>
                  <option value="trial_days">Trial em dias</option>
                </select>
              </div>
              <div>
                {label(discountKind === 'trial_days' ? 'Dias de trial *' : 'Percentual % *')}
                <input className={fi} type="number" min="0" value={discountVal} onChange={e => setDiscountVal(e.target.value)}
                  placeholder={discountKind === 'trial_days' ? 'ex: 14' : 'ex: 20'} />
              </div>
              {showDiscountDuration && (
                <div>
                  {label('Duração em meses (vazio = sempre)')}
                  <input className={fi} type="number" min="1" value={discountDur} onChange={e => setDiscountDur(e.target.value)} placeholder="ex: 3" />
                </div>
              )}
            </div>
          </div>

          {/* Comissão */}
          <div className="rounded-xl border border-black/5 p-4 space-y-3 bg-gray-50/50">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Comissão pro afiliado</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                {label('Tipo *')}
                <select className={fi} value={commKind} onChange={e => setCommKind(e.target.value)}>
                  <option value="percent_first">% primeiro pagamento</option>
                  <option value="percent_recurring">% recorrente</option>
                  <option value="fixed_per_sale">Valor fixo R$ por venda</option>
                </select>
              </div>
              <div>
                {label(commKind === 'fixed_per_sale' ? 'Valor R$ *' : 'Percentual % *')}
                <input className={fi} type="number" min="0" step={commKind === 'fixed_per_sale' ? '0.01' : '1'}
                  value={commVal} onChange={e => setCommVal(e.target.value)}
                  placeholder={commKind === 'fixed_per_sale' ? 'ex: 50,00' : 'ex: 15'} />
              </div>
              {showCommDuration && (
                <div>
                  {label('Duração em meses (vazio = lifetime)')}
                  <input className={fi} type="number" min="1" value={commDur} onChange={e => setCommDur(e.target.value)} placeholder="ex: 12" />
                </div>
              )}
            </div>
          </div>

          {/* Limites */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              {label('Máx. resgates (vazio = ilimitado)')}
              <input className={fi} type="number" min="1" value={maxRedemptions} onChange={e => setMaxRedemptions(e.target.value)} placeholder="ex: 100" />
            </div>
            <div>
              {label('Data de expiração (vazio = sem prazo)')}
              <input className={fi} type="date" value={endsAt} onChange={e => setEndsAt(e.target.value)} />
            </div>
          </div>

          {error && <div className="rounded-xl px-4 py-3 text-xs text-red-700 bg-red-50 border border-red-100">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-black/5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 border border-black/5">Cancelar</button>
          <button onClick={() => void save()} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}>
            {saving ? <><Loader size={14} strokeWidth={2} className="animate-spin" />Criando…</> : 'Criar cupom'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Status badges ─────────────────────────────────────────────

function conversionBadge(s: string) {
  if (s === 'active')  return { bg: '#2D7A4F18', c: '#2D7A4F', l: 'Ativa' }
  if (s === 'churned') return { bg: 'var(--color-primary)18', c: 'var(--color-primary)', l: 'Churn' }
  if (s === 'refunded') return { bg: '#C4841D18', c: '#C4841D', l: 'Reemb.' }
  return { bg: '#00000010', c: '#8A8A8A', l: 'Maturada' }
}

function commissionBadge(s: string) {
  if (s === 'approved') return { bg: '#2D7A4F18', c: '#2D7A4F', l: 'Aprovada' }
  if (s === 'paid')     return { bg: '#16357218', c: '#163572', l: 'Paga' }
  if (s === 'cancelled') return { bg: '#00000010', c: '#8A8A8A', l: 'Cancelada' }
  return { bg: '#C4841D18', c: '#C4841D', l: 'Pendente' }
}

function discountLabel(kind: string, value: number, dur: number | null) {
  if (kind === 'trial_days') return `${value} dias grátis`
  if (kind === 'percent_first') return `${value}% 1º mês`
  return `${value}%${dur ? ` por ${dur}m` : ' forever'}`
}

function commissionLabel(kind: string, value: number, dur: number | null) {
  if (kind === 'fixed_per_sale') return `R$ ${(value / 100).toFixed(2)} fixo`
  if (kind === 'percent_first')  return `${value}% 1ª venda`
  return `${value}%${dur ? ` por ${dur}m` : ' lifetime'}`
}

// ── Page ──────────────────────────────────────────────────────

interface ToastState { msg: string; type: 'success' | 'error'; key: number }

export default function AffiliateDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [affiliate,   setAffiliate]   = useState<Affiliate | null>(null)
  const [coupons,     setCoupons]     = useState<Coupon[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showNewCoupon, setShowNewCoupon] = useState(false)
  const [togglingCoupon, setTogglingCoupon] = useState<string | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)

  // Edit affiliate inline
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue,    setEditValue]    = useState('')
  const [savingField,  setSavingField]  = useState(false)

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type, key: Date.now() })
  }

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [affRes, couponsRes, convsRes, commsRes] = await Promise.all([
      supabase.from('affiliates').select('*').eq('id', id).single(),
      supabase.from('affiliate_coupons').select('*').eq('affiliate_id', id).order('created_at', { ascending: false }),
      supabase.from('affiliate_conversions').select('id, church_id, converted_at, initial_plan, initial_amount_cents, status, churches(name), affiliate_coupons(code)').eq('affiliate_id', id).order('converted_at', { ascending: false }),
      supabase.from('affiliate_commissions').select('id, reference_month, base_amount_cents, commission_amount_cents, status, approves_at, approved_at, paid_at').eq('affiliate_id', id).order('created_at', { ascending: false }).limit(50),
    ])
    if (affRes.error) { console.error('[AffiliateDetail]', affRes.error); navigate('/admin/afiliados'); return }
    setAffiliate(affRes.data as Affiliate)
    setCoupons((couponsRes.data ?? []) as Coupon[])
    setConversions((convsRes.data as unknown as Conversion[]) ?? [])
    setCommissions((commsRes.data as unknown as Commission[]) ?? [])
    setLoading(false)
  }, [id, navigate])

  useEffect(() => { void load() }, [load])

  async function saveField(field: string, value: string) {
    setSavingField(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-crud`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ id, [field]: value }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      showToast('Atualizado.', 'success')
      setEditingField(null)
      void load()
    } catch (e) { showToast((e as Error).message, 'error') }
    finally { setSavingField(false) }
  }

  async function toggleCoupon(coupon: Coupon) {
    setTogglingCoupon(coupon.id)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-coupon-toggle`, {
        method: 'POST', headers,
        body: JSON.stringify({ coupon_id: coupon.id, active: !coupon.active }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      showToast(`Cupom ${!coupon.active ? 'ativado' : 'desativado'}.`, 'success')
      void load()
    } catch (e) { showToast((e as Error).message, 'error') }
    finally { setTogglingCoupon(null) }
  }

  function startEdit(field: string, current: string) {
    setEditingField(field); setEditValue(current)
  }

  if (loading) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>
  if (!affiliate) return null

  const fi = 'border border-black/10 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition'

  function EditableRow({ label, field, value }: { label: string; field: string; value: string }) {
    const isEditing = editingField === field
    return (
      <div className="flex items-center gap-3 py-2.5 border-b border-black/[0.04] last:border-0">
        <span className="text-xs text-gray-400 w-32 shrink-0">{label}</span>
        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input className={`${fi} flex-1`} value={editValue} onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void saveField(field, editValue); if (e.key === 'Escape') setEditingField(null) }} />
            <button onClick={() => void saveField(field, editValue)} disabled={savingField}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--color-primary)' }}>
              {savingField ? <Loader size={12} strokeWidth={2} className="animate-spin" /> : 'OK'}
            </button>
            <button onClick={() => setEditingField(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"><X size={12} strokeWidth={2} /></button>
          </div>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            <span className="text-sm text-gray-800 flex-1">{value || '—'}</span>
            <button onClick={() => startEdit(field, value)} className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-100 text-gray-400 transition">
              <Edit2 size={12} strokeWidth={2} />
            </button>
          </div>
        )}
        {!isEditing && (
          <button onClick={() => startEdit(field, value)} className="p-1.5 rounded hover:bg-gray-100 text-gray-300 hover:text-gray-500 transition">
            <Edit2 size={12} strokeWidth={2} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/admin/afiliados')}
          className="p-2 rounded-xl hover:bg-black/5 transition text-gray-400 hover:text-gray-700">
          <ArrowLeft size={18} strokeWidth={1.75} />
        </button>
        <div>
          <h1 className="font-display text-2xl font-bold text-gray-900">{affiliate.full_name}</h1>
          <p className="text-sm text-gray-400">{affiliate.email} {affiliate.social_handle && `· ${affiliate.social_handle}`}</p>
        </div>
        <span className={`ml-auto text-xs font-semibold px-3 py-1 rounded-full ${affiliate.status === 'active' ? '' : ''}`}
          style={affiliate.status === 'active'
            ? { background: '#2D7A4F18', color: '#2D7A4F' }
            : { background: '#C4841D18', color: '#C4841D' }}>
          {affiliate.status === 'active' ? 'Ativo' : affiliate.status === 'paused' ? 'Pausado' : 'Banido'}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card: Dados pessoais */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
          <div className="px-5 py-4 border-b border-black/5">
            <h3 className="text-sm font-semibold text-gray-800">Dados pessoais</h3>
          </div>
          <div className="px-5 py-2">
            <EditableRow label="Nome completo"   field="full_name"     value={affiliate.full_name} />
            <EditableRow label="Email"            field="email"         value={affiliate.email} />
            <EditableRow label="Telefone"         field="phone"         value={affiliate.phone ?? ''} />
            <EditableRow label="Documento"        field="document"      value={affiliate.document ?? ''} />
            <EditableRow label="Chave PIX"        field="pix_key"       value={affiliate.pix_key} />
            <EditableRow label="Tipo PIX"         field="pix_key_kind"  value={affiliate.pix_key_kind ?? ''} />
            <EditableRow label="@ Social"         field="social_handle" value={affiliate.social_handle ?? ''} />
            <EditableRow label="Audiência"        field="audience_size" value={String(affiliate.audience_size ?? '')} />
            <EditableRow label="Notas internas"   field="notes"         value={affiliate.notes ?? ''} />
          </div>
        </div>

        {/* Card: Cupons */}
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
          <div className="px-5 py-4 border-b border-black/5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-800">Cupons ({coupons.length})</h3>
            <button onClick={() => setShowNewCoupon(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white"
              style={{ background: 'var(--color-primary)' }}>
              <Plus size={12} strokeWidth={2} /> Novo
            </button>
          </div>
          <div className="divide-y divide-black/[0.04]">
            {coupons.map(c => (
              <div key={c.id} className="px-5 py-3.5 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-bold text-gray-800">{c.code}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${c.active ? '' : ''}`}
                      style={c.active ? { background: '#2D7A4F18', color: '#2D7A4F' } : { background: '#00000010', color: '#8A8A8A' }}>
                      {c.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Desconto: {discountLabel(c.discount_kind, c.discount_value, c.discount_duration_months)}
                    {' · '}Comissão: {commissionLabel(c.commission_kind, c.commission_value, c.commission_duration_months)}
                  </p>
                  <p className="text-xs text-gray-300 mt-0.5">
                    {c.current_redemptions}{c.max_redemptions ? `/${c.max_redemptions}` : ''} usos
                    {c.ends_at && ` · Expira ${fmtDate(c.ends_at)}`}
                  </p>
                </div>
                <button onClick={() => void toggleCoupon(c)} disabled={togglingCoupon === c.id}
                  className="shrink-0 text-gray-400 hover:text-gray-700 transition mt-0.5">
                  {togglingCoupon === c.id
                    ? <Loader size={16} strokeWidth={2} className="animate-spin" />
                    : c.active
                      ? <ToggleRight size={20} strokeWidth={1.75} style={{ color: '#2D7A4F' }} />
                      : <ToggleLeft  size={20} strokeWidth={1.75} />
                  }
                </button>
              </div>
            ))}
            {coupons.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-gray-400">Nenhum cupom criado ainda.</div>
            )}
          </div>
        </div>
      </div>

      {/* Card: Conversões */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
        <div className="px-5 py-4 border-b border-black/5">
          <h3 className="text-sm font-semibold text-gray-800">Conversões ({conversions.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Igreja</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Cupom</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Plano</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Valor inicial</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Data</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {conversions.map(c => {
              const b = conversionBadge(c.status)
              return (
                <tr key={c.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3 font-medium text-gray-800">{c.churches?.name ?? '—'}</td>
                  <td className="px-5 py-3 font-mono text-xs text-gray-500">{c.affiliate_coupons?.code ?? '—'}</td>
                  <td className="px-5 py-3 text-gray-500 capitalize">{c.initial_plan ?? '—'}</td>
                  <td className="px-5 py-3 font-mono-ekthos text-gray-700">{c.initial_amount_cents ? fmt(c.initial_amount_cents) : '—'}</td>
                  <td className="px-5 py-3 text-xs text-gray-400">{fmtDate(c.converted_at)}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full inline-flex"
                      style={{ background: b.bg, color: b.c }}>{b.l}</span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {conversions.length === 0 && <div className="py-10 text-center text-sm text-gray-400">Nenhuma conversão registrada.</div>}
      </div>

      {/* Card: Comissões */}
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
        <div className="px-5 py-4 border-b border-black/5">
          <h3 className="text-sm font-semibold text-gray-800">Comissões (últimas 50)</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Mês ref.</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Base</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Comissão</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Aprovação prevista</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {commissions.map(c => {
              const b = commissionBadge(c.status)
              return (
                <tr key={c.id} className="hover:bg-gray-50/60">
                  <td className="px-5 py-3 font-mono text-xs text-gray-600">{c.reference_month}</td>
                  <td className="px-5 py-3 font-mono-ekthos text-gray-600">{fmt(c.base_amount_cents)}</td>
                  <td className="px-5 py-3 font-mono-ekthos font-bold text-gray-900">{fmt(c.commission_amount_cents)}</td>
                  <td className="px-5 py-3">
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full inline-flex"
                      style={{ background: b.bg, color: b.c }}>{b.l}</span>
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-400">{fmtDate(c.approves_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {commissions.length === 0 && <div className="py-10 text-center text-sm text-gray-400">Nenhuma comissão ainda.</div>}
      </div>

      {showNewCoupon && (
        <NewCouponModal
          affiliateId={affiliate.id}
          affiliateName={affiliate.full_name}
          onClose={() => setShowNewCoupon(false)}
          onCreated={() => { setShowNewCoupon(false); showToast('Cupom criado com sucesso.', 'success'); void load() }}
        />
      )}

      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
