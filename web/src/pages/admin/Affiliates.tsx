import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Users, TrendingUp, DollarSign, CheckCircle, Clock, XCircle,
  Plus, ChevronRight, Loader, X, Download, RefreshCw,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

// ── Types ────────────────────────────────────────────────────

interface Affiliate {
  id:            string
  full_name:     string
  email:         string
  phone:         string | null
  pix_key:       string
  pix_key_kind:  string | null
  social_handle: string | null
  audience_size: number | null
  notes:         string | null
  status:        'active' | 'paused' | 'banned'
  created_at:    string
}

interface Commission {
  id:                      string
  affiliate_id:            string
  reference_month:         string
  base_amount_cents:       number
  commission_amount_cents: number
  status:                  'pending' | 'approved' | 'paid' | 'cancelled'
  approves_at:             string
  approved_at:             string | null
  paid_at:                 string | null
  paid_batch_id:           string | null
  affiliates:              { full_name: string; pix_key: string } | null
  affiliate_conversions:   { churches: { name: string } | null } | null
}

// ── Helpers ──────────────────────────────────────────────────

const fmt = (c: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(c / 100)

const currentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

async function authHeaders() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sessão expirada')
  return { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' }
}

// ── Toast ────────────────────────────────────────────────────

function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t) }, [onClose])
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm border"
      style={{
        background: type === 'success' ? '#f0fdf4' : '#fef2f2',
        borderColor: type === 'success' ? '#bbf7d0' : '#fecaca',
        color: type === 'success' ? '#166534' : '#991b1b',
      }}>
      {type === 'success' ? <CheckCircle size={16} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: '#16a34a' }} />
        : <XCircle size={16} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: '#dc2626' }} />}
      <span className="flex-1">{msg}</span>
      <button onClick={onClose}><X size={14} strokeWidth={2} /></button>
    </div>
  )
}

// ── New Affiliate Modal ───────────────────────────────────────

function NewAffiliateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName,     setFullName]     = useState('')
  const [email,        setEmail]        = useState('')
  const [phone,        setPhone]        = useState('')
  const [pixKey,       setPixKey]       = useState('')
  const [pixKeyKind,   setPixKeyKind]   = useState('cpf')
  const [socialHandle, setSocialHandle] = useState('')
  const [audienceSize, setAudienceSize] = useState('')
  const [notes,        setNotes]        = useState('')
  const [saving,       setSaving]       = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  async function save() {
    if (!fullName.trim() || !email.trim() || !pixKey.trim()) {
      setError('Nome, email e chave PIX são obrigatórios'); return
    }
    setSaving(true); setError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-crud`, {
        method: 'POST', headers,
        body: JSON.stringify({ full_name: fullName, email, phone: phone || null, pix_key: pixKey, pix_key_kind: pixKeyKind, social_handle: socialHandle || null, audience_size: audienceSize ? parseInt(audienceSize) : null, notes: notes || null }),
      })
      const json = await res.json() as { error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onCreated()
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }

  const fi = 'w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Novo Afiliado</h2>
          <button onClick={onClose}><X size={18} strokeWidth={2} className="text-gray-400 hover:text-gray-700" /></button>
        </div>
        <div className="px-6 py-5 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Nome completo *</label>
              <input className={fi} value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
              <input className={fi} type="email" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Telefone</label>
              <input className={fi} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+55 11 99999-9999" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">@ Rede social</label>
              <input className={fi} value={socialHandle} onChange={e => setSocialHandle(e.target.value)} placeholder="@pastor" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de chave PIX *</label>
              <select className={fi} value={pixKeyKind} onChange={e => setPixKeyKind(e.target.value)}>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">Email</option>
                <option value="phone">Telefone</option>
                <option value="random">Chave aleatória</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Chave PIX *</label>
              <input className={fi} value={pixKey} onChange={e => setPixKey(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tamanho da audiência</label>
              <input className={fi} type="number" value={audienceSize} onChange={e => setAudienceSize(e.target.value)} placeholder="ex: 5000" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notas internas</label>
              <textarea className={`${fi} h-16 resize-none`} value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          {error && <div className="rounded-xl px-4 py-3 text-xs text-red-700 bg-red-50 border border-red-100">{error}</div>}
        </div>
        <div className="px-6 py-4 border-t border-black/5 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 border border-black/5">Cancelar</button>
          <button onClick={() => void save()} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--color-primary)' }}>
            {saving ? <><Loader size={14} strokeWidth={2} className="animate-spin" /> Salvando…</> : 'Criar afiliado'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Afiliados ────────────────────────────────────────────

function AffiliatesTab({ toast }: { toast: (m: string, t: 'success' | 'error') => void }) {
  const navigate = useNavigate()
  const [affiliates, setAffiliates] = useState<Affiliate[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('affiliates')
      .select('id, full_name, email, phone, pix_key, pix_key_kind, social_handle, audience_size, notes, status, created_at')
      .neq('status', 'banned')
      .order('created_at', { ascending: false })
    if (error) console.error('[AffiliatesTab]', error)
    setAffiliates((data as Affiliate[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const statusBadge = (s: Affiliate['status']) => {
    if (s === 'active')  return { background: '#2D7A4F18', color: '#2D7A4F', label: 'Ativo' }
    if (s === 'paused')  return { background: '#C4841D18', color: '#C4841D', label: 'Pausado' }
    return { background: '#00000010', color: '#8A8A8A', label: 'Banido' }
  }

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <>
      <div className="flex justify-end mb-4">
        <button onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: 'var(--color-primary)' }}>
          <Plus size={14} strokeWidth={2} /> Novo Afiliado
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Afiliado</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">@ Social</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">PIX</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {affiliates.map(a => {
              const badge = statusBadge(a.status)
              return (
                <tr key={a.id} className="hover:bg-gray-50/60 transition-colors cursor-pointer"
                  onClick={() => navigate(`/admin/afiliados/${a.id}`)}>
                  <td className="px-5 py-3.5">
                    <p className="font-semibold text-gray-800">{a.full_name}</p>
                    <p className="text-xs text-gray-400">{a.email}</p>
                  </td>
                  <td className="px-5 py-3.5 text-sm text-gray-500">{a.social_handle ?? '—'}</td>
                  <td className="px-5 py-3.5">
                    <p className="text-xs font-mono text-gray-600">{a.pix_key}</p>
                    <p className="text-xs text-gray-400 uppercase">{a.pix_key_kind}</p>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex text-xs font-semibold px-2.5 py-0.5 rounded-full"
                      style={{ background: badge.background, color: badge.color }}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <ChevronRight size={15} strokeWidth={1.75} className="text-gray-300 ml-auto" />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {affiliates.length === 0 && (
          <div className="py-14 text-center text-sm text-gray-400">
            Nenhum afiliado cadastrado ainda. Clique em "Novo Afiliado" para começar.
          </div>
        )}
      </div>

      {showNew && (
        <NewAffiliateModal
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); toast('Afiliado criado com sucesso.', 'success'); void load() }}
        />
      )}
    </>
  )
}

// ── Tab: Comissões a Pagar ────────────────────────────────────

function CommissionsTab({ toast }: { toast: (m: string, t: 'success' | 'error') => void }) {
  const [month,       setMonth]       = useState(currentMonth())
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [loading,     setLoading]     = useState(true)
  const [approving,   setApproving]   = useState(false)
  const [exporting,   setExporting]   = useState(false)
  const [markingPaid, setMarkingPaid] = useState(false)
  const [batchId,     setBatchId]     = useState<string | null>(null)
  const [paidRef,     setPaidRef]     = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('affiliate_commissions')
      .select(`id, affiliate_id, reference_month, base_amount_cents, commission_amount_cents, status, approves_at, approved_at, paid_at, paid_batch_id,
        affiliates ( full_name, pix_key ),
        affiliate_conversions ( churches ( name ) )`)
      .eq('reference_month', month)
      .order('created_at', { ascending: false })
    if (error) console.error('[CommissionsTab]', error)
    setCommissions((data as unknown as Commission[]) ?? [])
    setLoading(false)
  }, [month])

  useEffect(() => { void load() }, [load])

  const pending  = commissions.filter(c => c.status === 'pending')
  const approved = commissions.filter(c => c.status === 'approved')
  const paid     = commissions.filter(c => c.status === 'paid')
  const totalApproved = approved.reduce((s, c) => s + c.commission_amount_cents, 0)

  async function approveAll() {
    setApproving(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-commissions-approve`, { method: 'POST', headers, body: '{}' })
      const json = await res.json() as { approved?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      toast(`${json.approved ?? 0} comissões aprovadas.`, 'success')
      void load()
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setApproving(false) }
  }

  async function exportCSV() {
    setExporting(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-commissions-export-csv`, {
        method: 'POST', headers, body: JSON.stringify({ reference_month: month }),
      })
      const json = await res.json() as { csv?: string; batch_id?: string; rows?: number; error?: string }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      // Download CSV
      const blob = new Blob([json.csv ?? ''], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `comissoes_${month}.csv`; a.click()
      URL.revokeObjectURL(url)
      setBatchId(json.batch_id ?? null)
      toast(`CSV gerado com ${json.rows ?? 0} afiliados. Batch criado.`, 'success')
      void load()
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setExporting(false) }
  }

  async function markPaid() {
    if (!batchId) return
    setMarkingPaid(true)
    try {
      const headers = await authHeaders()
      const res = await fetch(`${SUPABASE_URL}/functions/v1/affiliate-commissions-mark-paid`, {
        method: 'POST', headers,
        body: JSON.stringify({ batch_id: batchId, paid_method: 'pix', paid_reference: paidRef }),
      })
      const json = await res.json() as { error?: string; updated?: number }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      toast(`${json.updated ?? 0} comissões marcadas como pagas.`, 'success')
      setBatchId(null); setPaidRef(''); void load()
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setMarkingPaid(false) }
  }

  const statusStyle = (s: Commission['status']) => {
    if (s === 'approved') return { background: '#2D7A4F18', color: '#2D7A4F', label: 'Aprovada' }
    if (s === 'paid')     return { background: '#16357218', color: '#163572', label: 'Paga' }
    if (s === 'cancelled') return { background: '#00000010', color: '#8A8A8A', label: 'Cancelada' }
    return { background: '#C4841D18', color: '#C4841D', label: 'Pendente' }
  }

  const fi = 'border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition'

  return (
    <div className="space-y-5">
      {/* Header controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-medium text-gray-600">Mês:</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className={`${fi} text-xs`} />
          <button onClick={() => void load()} className="p-2 rounded-lg hover:bg-gray-100 transition">
            <RefreshCw size={14} strokeWidth={1.75} className={`text-gray-400 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => void approveAll()} disabled={approving || pending.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-black/10 hover:bg-gray-50 disabled:opacity-40 transition">
            {approving ? <Loader size={12} strokeWidth={2} className="animate-spin" /> : <CheckCircle size={12} strokeWidth={2} />}
            Aprovar vencidas ({pending.filter(c => new Date(c.approves_at) <= new Date()).length})
          </button>
          <button onClick={() => void exportCSV()} disabled={exporting || approved.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition"
            style={{ background: 'var(--color-primary)' }}>
            {exporting ? <Loader size={12} strokeWidth={2} className="animate-spin" /> : <Download size={12} strokeWidth={2} />}
            Exportar CSV ({approved.length})
          </button>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Pendentes', value: pending.length, icon: <Clock size={16} strokeWidth={1.75} />, color: '#C4841D' },
          { label: 'Aprovadas', value: `${approved.length} · ${fmt(totalApproved)}`, icon: <CheckCircle size={16} strokeWidth={1.75} />, color: '#2D7A4F' },
          { label: 'Pagas', value: paid.length, icon: <DollarSign size={16} strokeWidth={1.75} />, color: '#163572' },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-2xl border border-black/5 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-gray-400">{m.label}</p>
              <span style={{ color: m.color }}>{m.icon}</span>
            </div>
            <p className="font-mono-ekthos text-xl font-bold text-gray-900">{m.value}</p>
          </div>
        ))}
      </div>

      {/* Batch mark-paid */}
      {batchId && (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-4 flex items-center gap-3 flex-wrap">
          <p className="text-sm font-medium text-gray-700 flex-1">Batch criado — confirme o pagamento:</p>
          <input className={`${fi} flex-1 min-w-48`} value={paidRef} onChange={e => setPaidRef(e.target.value)} placeholder="Comprovante / referência PIX" />
          <button onClick={() => void markPaid()} disabled={markingPaid}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: '#163572' }}>
            {markingPaid ? <Loader size={13} strokeWidth={2} className="animate-spin" /> : <CheckCircle size={13} strokeWidth={2} />}
            Marcar como pago
          </button>
        </div>
      )}

      {/* Tabela */}
      {loading ? <div className="flex justify-center py-10"><Spinner size="lg" /></div> : (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Afiliado</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Igreja</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Base</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Comissão</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500">Aprovação em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.04]">
              {commissions.map(c => {
                const st = statusStyle(c.status)
                return (
                  <tr key={c.id} className="hover:bg-gray-50/60">
                    <td className="px-5 py-3.5 font-medium text-gray-800">{c.affiliates?.full_name ?? '—'}</td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs">{c.affiliate_conversions?.churches?.name ?? '—'}</td>
                    <td className="px-5 py-3.5 font-mono-ekthos text-gray-700">{fmt(c.base_amount_cents)}</td>
                    <td className="px-5 py-3.5 font-mono-ekthos font-bold text-gray-900">{fmt(c.commission_amount_cents)}</td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full inline-flex"
                        style={{ background: st.background, color: st.color }}>{st.label}</span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      {new Date(c.approves_at).toLocaleDateString('pt-BR')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {commissions.length === 0 && (
            <div className="py-12 text-center text-sm text-gray-400">Nenhuma comissão neste mês.</div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab: Performance ──────────────────────────────────────────

function PerformanceTab() {
  const [stats, setStats] = useState<{
    total_active: number
    total_conversions: number
    total_paid_cents: number
    top_affiliates: Array<{ full_name: string; total_cents: number; conversions: number }>
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [{ count: affCount }, { data: commData }, { data: convData }] = await Promise.all([
        supabase.from('affiliates').select('id', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('affiliate_commissions').select('affiliate_id, commission_amount_cents').eq('status', 'paid'),
        supabase.from('affiliate_conversions').select('affiliate_id, affiliates(full_name)').eq('status', 'active'),
      ])

      // Aggregate by affiliate
      const byAff = new Map<string, { name: string; total: number; conversions: number }>()
      for (const c of (commData ?? []) as Array<{ affiliate_id: string; commission_amount_cents: number }>) {
        const e = byAff.get(c.affiliate_id) ?? { name: '—', total: 0, conversions: 0 }
        e.total += c.commission_amount_cents
        byAff.set(c.affiliate_id, e)
      }
      for (const c of (convData ?? []) as Array<{ affiliate_id: string; affiliates: { full_name: string } | null }>) {
        const e = byAff.get(c.affiliate_id) ?? { name: c.affiliates?.full_name ?? '—', total: 0, conversions: 0 }
        e.name = c.affiliates?.full_name ?? e.name
        e.conversions += 1
        byAff.set(c.affiliate_id, e)
      }

      const top = [...byAff.entries()]
        .map(([, v]) => ({ full_name: v.name, total_cents: v.total, conversions: v.conversions }))
        .sort((a, b) => b.total_cents - a.total_cents)
        .slice(0, 10)

      const totalPaid = (commData ?? []).reduce((s: number, c: { commission_amount_cents: number }) => s + c.commission_amount_cents, 0)

      setStats({
        total_active: affCount ?? 0,
        total_conversions: (convData ?? []).length,
        total_paid_cents: totalPaid,
        top_affiliates: top,
      })
      setLoading(false)
    }
    void load()
  }, [])

  if (loading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Afiliados ativos', value: String(stats?.total_active ?? 0), icon: <Users size={18} strokeWidth={1.75} /> },
          { label: 'Conversões ativas', value: String(stats?.total_conversions ?? 0), icon: <TrendingUp size={18} strokeWidth={1.75} /> },
          { label: 'Comissões pagas', value: fmt(stats?.total_paid_cents ?? 0), icon: <DollarSign size={18} strokeWidth={1.75} /> },
        ].map(m => (
          <div key={m.label} className="bg-white rounded-2xl border border-black/5 shadow-sm p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">{m.label}</p>
              <span style={{ color: 'var(--color-primary)' }}>{m.icon}</span>
            </div>
            <p className="font-mono-ekthos text-2xl font-bold text-gray-900">{m.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
        <div className="px-5 py-4 border-b border-black/5">
          <h3 className="text-sm font-semibold text-gray-800">Top 10 afiliados por comissão paga</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">#</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Afiliado</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Conversões</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Comissão paga</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {(stats?.top_affiliates ?? []).map((a, i) => (
              <tr key={i} className="hover:bg-gray-50/60">
                <td className="px-5 py-3 text-xs text-gray-400 font-mono">{i + 1}</td>
                <td className="px-5 py-3 font-medium text-gray-800">{a.full_name}</td>
                <td className="px-5 py-3 text-gray-600">{a.conversions}</td>
                <td className="px-5 py-3 font-mono-ekthos font-bold text-gray-900">{fmt(a.total_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(stats?.top_affiliates ?? []).length === 0 && (
          <div className="py-10 text-center text-sm text-gray-400">Nenhuma conversão registrada ainda.</div>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────

type Tab = 'afiliados' | 'comissoes' | 'performance'
const TABS: { id: Tab; label: string }[] = [
  { id: 'afiliados',   label: 'Afiliados' },
  { id: 'comissoes',   label: 'Comissões a Pagar' },
  { id: 'performance', label: 'Performance' },
]

interface ToastState { msg: string; type: 'success' | 'error'; key: number }

export default function AdminAffiliates() {
  const [tab,   setTab]   = useState<Tab>('afiliados')
  const [toast, setToast] = useState<ToastState | null>(null)

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type, key: Date.now() })
  }

  return (
    <div className="space-y-6 pb-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Users size={26} strokeWidth={1.5} style={{ color: 'var(--color-primary)' }} />
          Afiliados
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Programa de afiliados com cupons Stripe, comissões automáticas e pagamento via PIX.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-black/5">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
              tab === t.id ? 'border-red-600 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
            style={tab === t.id ? { borderColor: 'var(--color-primary)' } : {}}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'afiliados'   && <AffiliatesTab   toast={showToast} />}
      {tab === 'comissoes'   && <CommissionsTab   toast={showToast} />}
      {tab === 'performance' && <PerformanceTab />}

      {toast && <Toast key={toast.key} msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  )
}
