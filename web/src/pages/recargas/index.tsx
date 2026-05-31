/**
 * RecargasPage — /recargas
 *
 * 2 cards de pacote (Emergencial 100cr/R$99 + Ponte 300cr/R$269)
 * Saldo atual (cycle + topup)
 * Projeção de esgotamento
 * CTA: chama topup-checkout EF
 * Block se stripe_price_id não configurado (mostra aviso Felipe)
 */

import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Zap,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Loader2,
  CreditCard,
  ExternalLink,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CreditPackage {
  slug: string
  credits: number
  price_cents: number
  ttl_days: number
  stripe_price_id: string | null
  description?: string
}

interface SaldoEscopo {
  agent_scope: string
  cycle_credits: number
  topup_credits: number
  total_disponivel: number
  expires_at: string | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(cents: number) {
  return `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`
}

function fmtDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
}

const PACKAGE_META: Record<string, { label: string; badge: string; features: string[]; color: string }> = {
  'topup-emergencial': {
    label: 'Emergencial',
    badge: '100 créditos',
    color: 'border-[#e13500]',
    features: [
      '100 créditos de recarga',
      'Válidos por 90 dias',
      'Ideal para cobrir período de pico',
      'Sem compromisso de assinatura',
    ],
  },
  'topup-ponte': {
    label: 'Ponte',
    badge: '300 créditos',
    color: 'border-[#670000]',
    features: [
      '300 créditos de recarga',
      'Válidos por 90 dias',
      'Melhor custo por crédito (R$0,90/cr)',
      'Ideal para planejamento mensal',
    ],
  },
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function RecargasPage() {
  const { churchId } = useAuth()
  const [packages, setPackages] = useState<CreditPackage[]>([])
  const [saldos, setSaldos] = useState<SaldoEscopo[]>([])
  const [loading, setLoading] = useState(true)
  const [purchasing, setPurchasing] = useState<string | null>(null)
  const [purchaseError, setPurchaseError] = useState<string | null>(null)
  const [successSlug, setSuccessSlug] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!churchId) return
    setLoading(true)

    const [pkgRes, saldoRes] = await Promise.all([
      supabase
        .from('credit_packages')
        .select('slug, credits, price_cents, ttl_days, stripe_price_id')
        .in('slug', ['topup-emergencial', 'topup-ponte'])
        .order('credits'),
      supabase
        .from('church_agent_credits')
        .select('agent_scope, cycle_credits, topup_credits, expires_at')
        .eq('church_id', churchId),
    ])

    setPackages((pkgRes.data ?? []) as CreditPackage[])
    setSaldos(
      (saldoRes.data ?? []).map(r => ({
        ...r,
        total_disponivel: (r.cycle_credits ?? 0) + (r.topup_credits ?? 0),
      }))
    )
    setLoading(false)
  }, [churchId])

  useEffect(() => {
    void load()
    // Se voltou de ?topup=success
    const params = new URLSearchParams(window.location.search)
    if (params.get('topup') === 'success') {
      setSuccessSlug('success')
    }
  }, [load])

  const handleBuy = async (pkg: CreditPackage) => {
    if (!pkg.stripe_price_id) return
    setPurchasing(pkg.slug)
    setPurchaseError(null)

    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/topup-checkout`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ recharge_slug: pkg.slug }),
      }
    )

    const body = await res.json() as { url?: string; error?: string; message?: string }
    setPurchasing(null)

    if (body.error) {
      if (body.error === 'topup_limit_reached') {
        setPurchaseError(body.message ?? 'Você já tem créditos de recarga disponíveis. Use-os antes de recarregar.')
      } else {
        setPurchaseError(body.message ?? `Erro: ${body.error}`)
      }
      return
    }

    if (body.url) {
      window.location.href = body.url
    }
  }

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f9eedc] flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[#e13500]" />
      </div>
    )
  }

  const totalTopup   = saldos.reduce((s, r) => s + (r.topup_credits ?? 0), 0)
  const totalCycle   = saldos.reduce((s, r) => s + (r.cycle_credits ?? 0), 0)
  const totalSaldo   = totalCycle + totalTopup
  const topupExpires = saldos.find(s => s.expires_at)?.expires_at ?? null

  return (
    <div className="min-h-screen bg-[#f9eedc]">
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="px-6 py-6 mb-2">
        <div className="max-w-4xl mx-auto">
          <Link
            to="/consumo"
            className="inline-flex items-center gap-1.5 text-sm text-[#5A5A5A] hover:text-[#161616] mb-4 transition-colors"
          >
            <ArrowLeft size={14} />
            Consumo
          </Link>
          <h1 className="font-serif text-3xl font-semibold text-[#161616] leading-tight">
            Recarregar Créditos
          </h1>
          <p className="text-[#5A5A5A] text-sm mt-1">
            Pacotes com validade de 90 dias. Não expiram com a renovação mensal.
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pb-12 space-y-6">

        {/* ── Sucesso ─────────────────────────────────────────── */}
        {successSlug && (
          <div className="rounded-2xl border border-[#2D7A4F]/30 bg-[#E8F5E9] p-4 flex items-center gap-3">
            <CheckCircle2 size={18} className="text-[#2D7A4F] shrink-0" />
            <p className="text-sm text-[#2D7A4F] font-medium">
              Recarga processada com sucesso! Os créditos aparecerão em instantes.
            </p>
          </div>
        )}

        {/* ── Saldo atual ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-black/[0.06] p-5 shadow-sm">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#E8F5E9] mb-3">
              <CreditCard size={18} className="text-[#2D7A4F]" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#5A5A5A] mb-1">Saldo total</p>
            <p className="font-mono text-2xl font-bold text-[#161616]">{totalSaldo}</p>
            <p className="text-xs text-[#8A8A8A] mt-1">créditos disponíveis</p>
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] p-5 shadow-sm">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#f9eedc] mb-3">
              <Zap size={18} className="text-[#C4841D]" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#5A5A5A] mb-1">Recarga ativa</p>
            <p className="font-mono text-2xl font-bold text-[#161616]">{totalTopup}</p>
            <p className="text-xs text-[#8A8A8A] mt-1">
              {topupExpires ? `expira ${fmtDate(topupExpires)}` : 'sem recarga ativa'}
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-black/[0.06] p-5 shadow-sm col-span-2 md:col-span-1">
            <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-[#E3F2FD] mb-3">
              <Clock size={18} className="text-[#2B6CB0]" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[#5A5A5A] mb-1">Ciclo mensal</p>
            <p className="font-mono text-2xl font-bold text-[#161616]">{totalCycle}</p>
            <p className="text-xs text-[#8A8A8A] mt-1">renova todo mês</p>
          </div>
        </div>

        {/* ── Error ───────────────────────────────────────────── */}
        {purchaseError && (
          <div className="rounded-2xl border border-[#e13500]/30 bg-[#FDE8E0] p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-[#e13500] shrink-0 mt-0.5" />
            <p className="text-sm text-[#e13500]">{purchaseError}</p>
          </div>
        )}

        {/* ── Cards de pacote ─────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {packages.map(pkg => {
            const meta = PACKAGE_META[pkg.slug]
            const notConfigured = !pkg.stripe_price_id
            const isLoading = purchasing === pkg.slug

            return (
              <div
                key={pkg.slug}
                className={`bg-white rounded-2xl border-2 p-6 shadow-sm relative overflow-hidden
                  ${meta?.color ?? 'border-[#EDE0CC]'}`}
              >
                {/* Radial glow */}
                <div
                  className="absolute top-0 right-0 w-40 h-40 rounded-full opacity-20 -translate-y-1/2 translate-x-1/2"
                  style={{ background: 'radial-gradient(circle, #f9eedc 0%, transparent 70%)' }}
                />

                <div className="relative">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#5A5A5A] mb-1">
                        {meta?.label ?? pkg.slug}
                      </p>
                      <p className="font-mono text-3xl font-bold text-[#161616]">
                        {fmtPrice(pkg.price_cents)}
                      </p>
                      <p className="text-xs text-[#8A8A8A] mt-0.5">pagamento único</p>
                    </div>
                    <span className="inline-block rounded-full bg-[#FDE8E0] text-[#e13500] text-xs font-bold px-3 py-1">
                      {meta?.badge ?? `${pkg.credits} cr`}
                    </span>
                  </div>

                  {/* Features */}
                  <ul className="space-y-2 mb-5">
                    {(meta?.features ?? []).map(f => (
                      <li key={f} className="flex items-center gap-2 text-sm text-[#5A5A5A]">
                        <CheckCircle2 size={14} className="text-[#2D7A4F] shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  {notConfigured ? (
                    <div className="rounded-xl bg-[#f9eedc] border border-[#EDE0CC] p-3 text-center">
                      <p className="text-xs text-[#8A8A8A] mb-1">
                        Pacote ainda não configurado no Stripe
                      </p>
                      <a
                        href="https://dashboard.stripe.com/products"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-[#e13500] font-medium hover:underline"
                      >
                        Configurar no Stripe Dashboard
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleBuy(pkg)}
                      disabled={isLoading || !!purchasing}
                      className="w-full flex items-center justify-center gap-2 bg-[#e13500] text-white
                                 font-semibold rounded-xl py-3 text-sm
                                 hover:bg-[#FF4D1A] disabled:opacity-50 disabled:cursor-not-allowed
                                 transition-colors duration-150"
                    >
                      {isLoading
                        ? <><Loader2 size={15} className="animate-spin" /> Redirecionando…</>
                        : <><Zap size={15} /> Recarregar {meta?.badge}</>
                      }
                    </button>
                  )}
                </div>
              </div>
            )
          })}

          {/* Se não há pacotes cadastrados */}
          {packages.length === 0 && (
            <div className="col-span-2 bg-white rounded-2xl border border-black/[0.06] p-10 text-center">
              <Zap size={28} className="text-[#8A8A8A] mx-auto mb-3" />
              <p className="text-sm text-[#5A5A5A] mb-1">Nenhum pacote de recarga disponível</p>
              <p className="text-xs text-[#8A8A8A]">
                Os pacotes aparecerão aqui assim que forem configurados no Stripe.
              </p>
            </div>
          )}
        </div>

        {/* ── Links ───────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          <Link
            to="/consumo"
            className="inline-flex items-center gap-2 bg-white rounded-xl border border-black/[0.08]
                       px-5 py-2.5 text-sm font-medium text-[#161616]
                       hover:border-[#e13500] hover:text-[#e13500] transition-colors duration-150"
          >
            Ver consumo detalhado
          </Link>
          <Link
            to="/agentes"
            className="inline-flex items-center gap-2 bg-white rounded-xl border border-black/[0.08]
                       px-5 py-2.5 text-sm font-medium text-[#161616]
                       hover:border-[#e13500] hover:text-[#e13500] transition-colors duration-150"
          >
            Gerenciar agentes
          </Link>
        </div>
      </main>
    </div>
  )
}
