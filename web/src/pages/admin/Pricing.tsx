import { useEffect, useState, useCallback } from 'react'
import { Tag, Edit2, Loader, CheckCircle, XCircle, Gift, ChevronRight, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

// ── Types ───────────────────────────────────────────────────

interface Plan {
  slug:            string
  name:            string
  description:     string | null
  price_cents:     number
  max_users:       number
  included_agents: number
  max_agents:      number | null
  sort_order:      number
  active:          boolean
  updated_at:      string | null
}

interface Addon {
  slug:        string
  name:        string
  price_cents: number
  active:      boolean
  updated_at:  string | null
}

interface Agent {
  slug:              string
  name:              string
  short_description: string
  category:          string | null
  price_cents:       number
  sort_order:        number
  active:            boolean
  updated_at:        string | null
}

const AGENT_CATEGORIES = ['Operacional', 'Comunicação', 'Formação', 'Vendas', 'Suporte']

// ── Helpers ─────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

const fmtBRL = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)

/** Converte string "R$ 1.299,90" → number 129990 (centavos) */
function parseBRL(raw: string): number {
  const clean = raw.replace(/[^\d,]/g, '').replace(',', '.')
  return Math.round(parseFloat(clean || '0') * 100)
}

/** Formata centavos → "1.299,90" para o input */
function centsToBRLInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',')
}

// ── Toast ────────────────────────────────────────────────────

function Toast({ msg, type, onClose }: { msg: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div
      className="fixed bottom-6 right-6 z-50 flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm border"
      style={{
        background: type === 'success' ? '#f0fdf4' : '#fef2f2',
        borderColor: type === 'success' ? '#bbf7d0' : '#fecaca',
        color: type === 'success' ? '#166534' : '#991b1b',
      }}
    >
      {type === 'success'
        ? <CheckCircle size={16} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: '#16a34a' }} />
        : <XCircle    size={16} strokeWidth={2} className="shrink-0 mt-0.5" style={{ color: '#dc2626' }} />
      }
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 shrink-0 mt-0.5">
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

// ── Field helpers ────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-gray-600 mb-1">{children}</label>
}

function TextInput({ value, onChange, placeholder }: {
  value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition"
    />
  )
}

function NumberInput({ value, onChange, min = 0 }: {
  value: number; onChange: (v: number) => void; min?: number
}) {
  return (
    <input
      type="number"
      min={min}
      value={value}
      onChange={e => onChange(parseInt(e.target.value, 10) || 0)}
      className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition"
    />
  )
}

function PriceInput({ valueCents, onChange }: {
  valueCents: number; onChange: (cents: number) => void
}) {
  const [raw, setRaw] = useState(centsToBRLInput(valueCents))

  function handleChange(v: string) {
    // Permite apenas dígitos e vírgula
    const filtered = v.replace(/[^\d,]/g, '')
    setRaw(filtered)
    onChange(parseBRL(filtered))
  }

  function handleBlur() {
    // Formata ao sair do campo
    const cents = parseBRL(raw)
    setRaw(centsToBRLInput(cents))
    onChange(cents)
  }

  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">R$</span>
      <input
        type="text"
        value={raw}
        onChange={e => handleChange(e.target.value)}
        onBlur={handleBlur}
        className="w-full border border-black/10 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition"
        placeholder="0,00"
      />
    </div>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <div
        className="relative w-10 h-5 rounded-full transition-colors shrink-0"
        style={{ background: checked ? '#2D7A4F' : '#d1d5db' }}
        onClick={() => onChange(!checked)}
      >
        <div
          className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform"
          style={{ transform: checked ? 'translateX(20px)' : 'translateX(2px)' }}
        />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  )
}

// ── Plan Edit Modal ──────────────────────────────────────────

interface PlanModalProps {
  plan: Plan
  onClose: () => void
  onSaved: (msg: string, priceRotated: boolean) => void
}

function PlanModal({ plan, onClose, onSaved }: PlanModalProps) {
  const [name,           setName]           = useState(plan.name)
  const [description,    setDescription]    = useState(plan.description ?? '')
  const [priceCents,     setPriceCents]     = useState(plan.price_cents)
  const [maxUsers,       setMaxUsers]       = useState(plan.max_users)
  const [includedAgents, setIncludedAgents] = useState(plan.included_agents)
  const [maxAgents,      setMaxAgents]      = useState(plan.max_agents ?? 0)
  const [sortOrder,      setSortOrder]      = useState(plan.sort_order)
  const [active,         setActive]         = useState(plan.active)
  const [saving,         setSaving]         = useState(false)
  const [error,          setError]          = useState<string | null>(null)

  const priceChanged = priceCents !== plan.price_cents

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada')

      const res = await fetch(`${SUPABASE_URL}/functions/v1/plans-update`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug:            plan.slug,
          name,
          description:     description || null,
          price_cents:     priceCents,
          max_users:       maxUsers,
          included_agents: includedAgents,
          max_agents:      maxAgents || null,
          sort_order:      sortOrder,
          active,
        }),
      })
      const json = await res.json() as { error?: string; stripe_price_rotated?: boolean }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onSaved('Plano atualizado com sucesso.', json.stripe_price_rotated ?? false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Editar plano <span className="font-mono text-sm text-gray-400 ml-1">{plan.slug}</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <FieldLabel>Nome do plano</FieldLabel>
            <TextInput value={name} onChange={setName} />
          </div>
          <div>
            <FieldLabel>Descrição (opcional)</FieldLabel>
            <TextInput value={description} onChange={setDescription} placeholder="Breve descrição exibida no checkout…" />
          </div>
          <div>
            <FieldLabel>Preço mensal</FieldLabel>
            <PriceInput valueCents={priceCents} onChange={setPriceCents} />
            {priceChanged && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                Um novo Stripe Price será criado. Igrejas existentes mantêm o preço anterior até a próxima renovação.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Máx. usuários incluídos</FieldLabel>
              <NumberInput value={maxUsers} onChange={setMaxUsers} min={1} />
            </div>
            <div>
              <FieldLabel>Agentes incluídos</FieldLabel>
              <NumberInput value={includedAgents} onChange={setIncludedAgents} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Máx. agentes (0 = ilimitado)</FieldLabel>
              <NumberInput value={maxAgents} onChange={setMaxAgents} />
            </div>
            <div>
              <FieldLabel>Ordem de exibição</FieldLabel>
              <NumberInput value={sortOrder} onChange={setSortOrder} />
            </div>
          </div>
          <div className="pt-1">
            <Toggle
              checked={active}
              onChange={setActive}
              label={active ? 'Plano ativo (permite novas assinaturas)' : 'Plano inativo (sem novas assinaturas)'}
            />
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-xs text-red-700 bg-red-50 border border-red-100">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 border border-black/5 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: '#e13500' }}
          >
            {saving
              ? <><Loader size={14} strokeWidth={2} className="animate-spin" /> Salvando…</>
              : 'Salvar alterações'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Addon Edit Modal ─────────────────────────────────────────

interface AddonModalProps {
  addon: Addon
  onClose: () => void
  onSaved: (msg: string, priceRotated: boolean) => void
}

function AddonModal({ addon, onClose, onSaved }: AddonModalProps) {
  const [name,       setName]       = useState(addon.name)
  const [priceCents, setPriceCents] = useState(addon.price_cents)
  const [active,     setActive]     = useState(addon.active)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)

  const priceChanged = priceCents !== addon.price_cents

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada')

      const res = await fetch(`${SUPABASE_URL}/functions/v1/addon-prices-update`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: addon.slug, name, price_cents: priceCents, active }),
      })
      const json = await res.json() as { error?: string; stripe_price_rotated?: boolean }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onSaved('Add-on atualizado com sucesso.', json.stripe_price_rotated ?? false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Editar add-on <span className="font-mono text-sm text-gray-400 ml-1">{addon.slug}</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <FieldLabel>Nome</FieldLabel>
            <TextInput value={name} onChange={setName} />
          </div>
          <div>
            <FieldLabel>Preço mensal</FieldLabel>
            <PriceInput valueCents={priceCents} onChange={setPriceCents} />
            {priceChanged && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                Um novo Stripe Price será criado. Contratos existentes mantêm o valor anterior.
              </p>
            )}
          </div>
          <div className="pt-1">
            <Toggle
              checked={active}
              onChange={setActive}
              label={active ? 'Add-on ativo' : 'Add-on inativo'}
            />
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-xs text-red-700 bg-red-50 border border-red-100">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-black/5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 border border-black/5 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: '#e13500' }}
          >
            {saving
              ? <><Loader size={14} strokeWidth={2} className="animate-spin" /> Salvando…</>
              : 'Salvar alterações'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Planos ──────────────────────────────────────────────

function PlansTab({ toast }: { toast: (msg: string, type: 'success' | 'error') => void }) {
  const [plans,   setPlans]   = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Plan | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('plans')
      .select('slug, name, description, price_cents, max_users, included_agents, max_agents, sort_order, active, updated_at')
      .order('sort_order')
      .order('name')
    if (error) console.error('[PlansTab] supabase error:', error)
    setPlans((data as Plan[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function handleSaved(msg: string, priceRotated: boolean) {
    setEditing(null)
    toast(msg, 'success')
    if (priceRotated) {
      setTimeout(() => {
        toast('Novo Stripe Price criado. Igrejas existentes mantêm o preço anterior até a próxima renovação.', 'success')
      }, 600)
    }
    void load()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </div>
  )

  return (
    <>
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Plano</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Preço/mês</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Usuários</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Agentes incl.</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Máx. agentes</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {plans.map(p => (
              <tr key={p.slug} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-5 py-3.5">
                  <p className="font-semibold text-gray-800 capitalize">{p.name}</p>
                  {p.description && <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{p.description}</p>}
                </td>
                <td className="px-5 py-3.5 font-mono-ekthos font-bold text-gray-800">
                  {fmtBRL(p.price_cents)}
                </td>
                <td className="px-5 py-3.5 text-gray-600">{p.max_users}</td>
                <td className="px-5 py-3.5 text-gray-600">{p.included_agents}</td>
                <td className="px-5 py-3.5 text-gray-500">
                  {p.max_agents == null || p.max_agents === 0 ? '∞' : p.max_agents}
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={p.active
                      ? { background: '#2D7A4F18', color: '#2D7A4F' }
                      : { background: '#00000010', color: '#8A8A8A' }
                    }
                  >
                    {p.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    onClick={() => setEditing(p)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all ml-auto"
                  >
                    <Edit2 size={13} strokeWidth={2} />
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {plans.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            Nenhum plano encontrado.
          </div>
        )}
      </div>

      {editing && (
        <PlanModal
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}

// ── Tab: Add-ons ─────────────────────────────────────────────

function AddonsTab({ toast }: { toast: (msg: string, type: 'success' | 'error') => void }) {
  const [addons,  setAddons]  = useState<Addon[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Addon | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('addon_prices')
      .select('slug, name, price_cents, active, updated_at')
      .order('slug')
    if (error) console.error('[AddonsTab] supabase error:', error)
    setAddons((data as Addon[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function handleSaved(msg: string, priceRotated: boolean) {
    setEditing(null)
    toast(msg, 'success')
    if (priceRotated) {
      setTimeout(() => {
        toast('Novo Stripe Price criado. Contratos existentes mantêm o valor anterior até a próxima renovação.', 'success')
      }, 600)
    }
    void load()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </div>
  )

  return (
    <>
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Add-on</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Slug</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Preço/mês</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {addons.map(a => (
              <tr key={a.slug} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-5 py-3.5 font-semibold text-gray-800">{a.name}</td>
                <td className="px-5 py-3.5 font-mono text-xs text-gray-400">{a.slug}</td>
                <td className="px-5 py-3.5 font-mono-ekthos font-bold text-gray-800">
                  {fmtBRL(a.price_cents)}
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={a.active
                      ? { background: '#2D7A4F18', color: '#2D7A4F' }
                      : { background: '#00000010', color: '#8A8A8A' }
                    }
                  >
                    {a.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    onClick={() => setEditing(a)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all ml-auto"
                  >
                    <Edit2 size={13} strokeWidth={2} />
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {addons.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            Nenhum add-on encontrado.
          </div>
        )}
      </div>

      {editing && (
        <AddonModal
          addon={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}

// ── Agent Edit Modal ─────────────────────────────────────────

interface AgentModalProps {
  agent: Agent
  onClose: () => void
  onSaved: (msg: string, priceRotated: boolean) => void
}

function AgentModal({ agent, onClose, onSaved }: AgentModalProps) {
  const [name,             setName]             = useState(agent.name)
  const [shortDescription, setShortDescription] = useState(agent.short_description)
  const [category,         setCategory]         = useState(agent.category ?? '')
  const [priceCents,       setPriceCents]       = useState(agent.price_cents)
  const [active,           setActive]           = useState(agent.active)
  const [saving,           setSaving]           = useState(false)
  const [error,            setError]            = useState<string | null>(null)

  const priceChanged = priceCents !== agent.price_cents

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sessão expirada')

      const res = await fetch(`${SUPABASE_URL}/functions/v1/agents-catalog-update`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug:              agent.slug,
          name,
          short_description: shortDescription,
          category:          category || null,
          price_cents:       priceCents,
          active,
        }),
      })
      const json = await res.json() as { error?: string; stripe_price_rotated?: boolean }
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      onSaved('Agente atualizado com sucesso.', json.stripe_price_rotated ?? false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">
            Editar agente <span className="font-mono text-sm text-gray-400 ml-1">{agent.slug}</span>
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <FieldLabel>Nome do agente</FieldLabel>
            <TextInput value={name} onChange={setName} />
          </div>
          <div>
            <FieldLabel>Descrição curta</FieldLabel>
            <TextInput value={shortDescription} onChange={setShortDescription} placeholder="Exibida no marketplace…" />
          </div>
          <div>
            <FieldLabel>Categoria</FieldLabel>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full border border-black/10 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition bg-white"
            >
              <option value="">— Sem categoria —</option>
              {AGENT_CATEGORIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <FieldLabel>Preço mensal</FieldLabel>
            <PriceInput valueCents={priceCents} onChange={setPriceCents} />
            {priceChanged && (
              <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1.5">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                Um novo Stripe Price será criado. Igrejas existentes mantêm o valor anterior até a próxima renovação.
              </p>
            )}
          </div>
          <div className="pt-1">
            <Toggle
              checked={active}
              onChange={setActive}
              label={active ? 'Agente ativo no marketplace' : 'Agente inativo (oculto)'}
            />
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-xs text-red-700 bg-red-50 border border-red-100">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-black/5 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 border border-black/5 transition-all"
          >
            Cancelar
          </button>
          <button
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: '#e13500' }}
          >
            {saving
              ? <><Loader size={14} strokeWidth={2} className="animate-spin" /> Salvando…</>
              : 'Salvar alterações'
            }
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tab: Agentes ─────────────────────────────────────────────

function AgentsTab({ toast }: { toast: (msg: string, type: 'success' | 'error') => void }) {
  const [agents,  setAgents]  = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Agent | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('agents_catalog')
      .select('slug, name, short_description, category, price_cents, sort_order, active, updated_at')
      .order('sort_order')
      .order('name')
    if (error) console.error('[AgentsTab] supabase error:', error)
    setAgents((data as Agent[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  function handleSaved(msg: string, priceRotated: boolean) {
    setEditing(null)
    toast(msg, 'success')
    if (priceRotated) {
      setTimeout(() => {
        toast('Novo Stripe Price criado. Igrejas existentes mantêm o preço anterior até a próxima renovação.', 'success')
      }, 600)
    }
    void load()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Spinner size="lg" />
    </div>
  )

  return (
    <>
      <div className="bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Agente</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Categoria</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Preço/mês</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500">Status</th>
              <th className="px-5 py-3 text-xs font-semibold text-gray-500" />
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {agents.map(a => (
              <tr key={a.slug} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-5 py-3.5">
                  <p className="font-semibold text-gray-800">{a.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate max-w-xs">{a.short_description}</p>
                </td>
                <td className="px-5 py-3.5">
                  {a.category
                    ? <span className="text-xs font-medium px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">{a.category}</span>
                    : <span className="text-xs text-gray-300">—</span>
                  }
                </td>
                <td className="px-5 py-3.5 font-mono-ekthos font-bold text-gray-800">
                  {fmtBRL(a.price_cents)}
                </td>
                <td className="px-5 py-3.5">
                  <span
                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full"
                    style={a.active
                      ? { background: '#2D7A4F18', color: '#2D7A4F' }
                      : { background: '#00000010', color: '#8A8A8A' }
                    }
                  >
                    {a.active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    onClick={() => setEditing(a)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-all ml-auto"
                  >
                    <Edit2 size={13} strokeWidth={2} />
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {agents.length === 0 && (
          <div className="py-12 text-center text-sm text-gray-400">
            Nenhum agente encontrado.
          </div>
        )}
      </div>

      {editing && (
        <AgentModal
          agent={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  )
}

// ── Tab: Promoções (placeholder) ─────────────────────────────

function PromotionsTab() {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm">
      <div className="px-6 py-16 flex flex-col items-center gap-4 text-center">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: '#e1350012' }}
        >
          <Gift size={26} strokeWidth={1.5} style={{ color: '#e13500' }} />
        </div>
        <div>
          <p className="font-semibold text-gray-800 text-base">Promoções e Trials</p>
          <p className="text-sm text-gray-400 mt-1 max-w-xs">
            Cupons, descontos percentuais, períodos gratuitos e trials por plano.
            Disponível na Onda P2.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-semibold"
          style={{ background: '#C4841D18', color: '#C4841D' }}>
          Em breve
        </span>
        <a
          href="https://dashboard.stripe.com/coupons"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors mt-1"
        >
          Gerenciar cupons no Stripe Dashboard
          <ChevronRight size={13} strokeWidth={2} />
        </a>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────

type Tab = 'planos' | 'agentes' | 'addons' | 'promocoes'

const TABS: { id: Tab; label: string }[] = [
  { id: 'planos',    label: 'Planos' },
  { id: 'agentes',   label: 'Agentes' },
  { id: 'addons',    label: 'Add-ons' },
  { id: 'promocoes', label: 'Promoções' },
]

interface ToastState { msg: string; type: 'success' | 'error'; key: number }

export default function AdminPricing() {
  const [tab,   setTab]   = useState<Tab>('planos')
  const [toast, setToast] = useState<ToastState | null>(null)

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type, key: Date.now() })
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-gray-900 flex items-center gap-3">
            <Tag size={26} strokeWidth={1.5} style={{ color: '#e13500' }} />
            Pricing
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Catálogo de planos, agentes e add-ons. Alterações de preço criam novo Stripe Price automaticamente.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-black/5">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${
              tab === t.id
                ? 'border-red-600 text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-700'
            }`}
            style={tab === t.id ? { borderColor: '#e13500' } : {}}
          >
            {t.label}
            {t.id === 'promocoes' && (
              <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: '#C4841D18', color: '#C4841D' }}>
                P2
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'planos'    && <PlansTab  toast={showToast} />}
      {tab === 'agentes'   && <AgentsTab toast={showToast} />}
      {tab === 'addons'    && <AddonsTab toast={showToast} />}
      {tab === 'promocoes' && <PromotionsTab />}

      {/* Toast */}
      {toast && (
        <Toast
          key={toast.key}
          msg={toast.msg}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  )
}
