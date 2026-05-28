// web/src/components/admin/ModalHabilitarAgente.tsx
// Sprint 3A.1 — Modal de habilitação de agente premium
import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Modal from '@/components/ui/Modal'

// ── Tipos ──────────────────────────────────────────────────

interface GrantableAgent {
  slug:         string
  name:         string
  pricing_tier: string
  price_cents:  number
  category:     string
  grant: {
    id:         string
    grant_type: string
    active:     boolean
    starts_at:  string
    ends_at:    string | null
    notes:      string | null
  } | null
}

interface Props {
  open:      boolean
  onClose:   () => void
  churchId:  string
  onSuccess: () => void  // chamado após grant criado — pai recarrega dados
}

type GrantType = 'courtesy' | 'trial' | 'paid'

const GRANT_LABELS: Record<GrantType, { label: string; desc: string; color: string }> = {
  courtesy: { label: 'Cortesia',       desc: 'Gratuito permanente. Sem cobrança.',                      color: '#2D7A4F' },
  trial:    { label: 'Trial',          desc: 'Gratuito por X dias, expira automaticamente.',             color: '#C4841D' },
  paid:     { label: 'Pago (manual)',  desc: 'Confirmar pagamento externo via Stripe. Informe o PI ID.', color: '#2B6CB0' },
}

function fmtBRL(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
}

// ── Componente ─────────────────────────────────────────────

export default function ModalHabilitarAgente({ open, onClose, churchId, onSuccess }: Props) {
  const [agents,      setAgents]      = useState<GrantableAgent[]>([])
  const [loadingList, setLoadingList] = useState(false)
  const [listError,   setListError]   = useState<string | null>(null)

  const [selectedSlug,   setSelectedSlug]   = useState<string>('')
  const [grantType,      setGrantType]      = useState<GrantType>('courtesy')
  const [durationDays,   setDurationDays]   = useState<string>('14')
  const [notes,          setNotes]          = useState<string>('')
  const [stripePI,       setStripePI]       = useState<string>('')

  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState<string | null>(null)
  const [saveOk,     setSaveOk]     = useState(false)

  // Ref para cancelar o setTimeout de pós-sucesso (evita double-call se modal reabrir rápido)
  const saveOkTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Carregar catálogo quando modal abre
  useEffect(() => {
    if (!open || !churchId) return
    let cancelled = false
    if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current)
    setLoadingList(true)
    setListError(null)
    setSelectedSlug('')
    setGrantType('courtesy')
    setDurationDays('14')
    setNotes('')
    setStripePI('')
    setSaveError(null)
    setSaveOk(false)

    supabase.rpc('admin_list_grantable_agents', { p_church_id: churchId })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { setListError(error.message); return }
        // data é um array JSON retornado como jsonb — pode ser string ou array
        try {
          const list: GrantableAgent[] = Array.isArray(data) ? data : JSON.parse(data as string) ?? []
          setAgents(list)
        } catch {
          setListError('Resposta inesperada do servidor.')
        }
      })
      .finally(() => { if (!cancelled) setLoadingList(false) })

    return () => {
      cancelled = true
      if (saveOkTimerRef.current) clearTimeout(saveOkTimerRef.current)
    }
  }, [open, churchId])

  const selectedAgent = agents.find(a => a.slug === selectedSlug)
  const alreadyGranted = selectedAgent?.grant?.active === true

  const handleSubmit = useCallback(async () => {
    if (!selectedSlug) { setSaveError('Selecione um agente.'); return }
    if (grantType === 'trial' && (!durationDays || Number(durationDays) <= 0)) {
      setSaveError('Informe quantos dias de trial.'); return
    }
    if (grantType === 'paid' && !stripePI.trim()) {
      setSaveError('Informe o Stripe Payment Intent ID.'); return
    }

    setSaving(true)
    setSaveError(null)
    setSaveOk(false)

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (!token) { setSaveError('Sessão inválida — recarregue a página.'); setSaving(false); return }

    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-agent-grant`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            church_id:                churchId,
            agent_slug:               selectedSlug,
            grant_type:               grantType,
            duration_days:            grantType === 'trial' ? Number(durationDays) : undefined,
            notes:                    notes.trim() || undefined,
            stripe_payment_intent_id: grantType === 'paid' ? stripePI.trim() : undefined,
          }),
        }
      )
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setSaveError(json.error ?? 'Erro ao habilitar agente.')
        return
      }
      setSaveOk(true)
      saveOkTimerRef.current = setTimeout(() => {
        onSuccess()
        onClose()
      }, 1200)
    } catch (e: unknown) {
      setSaveError((e as Error).message ?? 'Erro de rede.')
    } finally {
      setSaving(false)
    }
  }, [selectedSlug, grantType, durationDays, notes, stripePI, churchId, onSuccess, onClose])

  return (
    <Modal open={open} onClose={onClose} title="Habilitar Agente" size="md">
      {/* Modal.tsx já provê px-6 py-4 no wrapper — não adicionar padding extra */}
      <div className="space-y-5">

        {/* Loading catálogo */}
        {loadingList && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" />
            Carregando catálogo de agentes…
          </div>
        )}

        {listError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            <AlertCircle size={16} />
            {listError}
          </div>
        )}

        {/* Selector de agente */}
        {!loadingList && !listError && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Agente
            </label>
            <select
              value={selectedSlug}
              onChange={e => setSelectedSlug(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#e13500]/30"
            >
              <option value="">Selecione um agente…</option>
              {agents.map(a => (
                <option key={a.slug} value={a.slug} disabled={a.grant?.active === true}>
                  {a.name}
                  {a.pricing_tier === 'always_paid' ? ` (${fmtBRL(a.price_cents)}/mês)` : ' (Free)'}
                  {a.grant?.active ? ' — já habilitado' : ''}
                </option>
              ))}
            </select>
            {alreadyGranted && (
              <p className="text-xs text-amber-600">
                ⚠️ Este agente já está habilitado para esta igreja. Habilitar novamente substituirá o grant atual.
              </p>
            )}
          </div>
        )}

        {/* Tipo de grant */}
        {selectedSlug && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Modo de habilitação
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(GRANT_LABELS) as [GrantType, typeof GRANT_LABELS[GrantType]][]).map(([type, meta]) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setGrantType(type)}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${
                    grantType === type
                      ? 'border-current'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                  style={{ borderColor: grantType === type ? meta.color : undefined }}
                >
                  <p className="text-sm font-semibold" style={{ color: meta.color }}>{meta.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{meta.desc}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Duração (trial) */}
        {selectedSlug && grantType === 'trial' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Duração do trial (dias)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={durationDays}
              onChange={e => setDurationDays(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#e13500]/30"
              placeholder="Ex: 14"
            />
          </div>
        )}

        {/* Stripe PI (paid) */}
        {selectedSlug && grantType === 'paid' && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Stripe Payment Intent ID
            </label>
            <input
              type="text"
              value={stripePI}
              onChange={e => setStripePI(e.target.value)}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#e13500]/30"
              placeholder="pi_3abc..."
            />
          </div>
        )}

        {/* Notas */}
        {selectedSlug && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Notas internas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#e13500]/30"
              placeholder="Ex: Demo para onboarding, trocado por plano antigo…"
            />
          </div>
        )}

        {/* Erro */}
        {saveError && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg p-3">
            <AlertCircle size={16} />
            {saveError}
          </div>
        )}

        {/* Sucesso */}
        {saveOk && (
          <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg p-3">
            <CheckCircle2 size={16} />
            Agente habilitado com sucesso!
          </div>
        )}

        {/* Ações */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !selectedSlug || loadingList}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
            style={{ background: '#e13500' }}
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Habilitando…
              </span>
            ) : 'Habilitar agente'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
