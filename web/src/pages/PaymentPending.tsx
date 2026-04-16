// Página exibida quando a church está em status 'pending_payment'.
// Redireciona para o Stripe Checkout ou detecta pagamento confirmado.

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Spinner from '@/components/ui/Spinner'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

export default function PaymentPending() {
  const { user, churchId } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading]     = useState(false)
  const [checking, setChecking]   = useState(false)
  const [planSlug, setPlanSlug]   = useState<string | null>(null)
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null)
  const [error, setError]         = useState<string | null>(null)

  // Busca plan_slug e checkout_url existente da subscription
  useEffect(() => {
    if (!churchId) return
    void supabase
      .from('subscriptions')
      .select('plan_slug, stripe_checkout_session_id')
      .eq('church_id', churchId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.plan_slug) setPlanSlug(data.plan_slug)
      })
  }, [churchId])

  // Verifica se pagamento foi confirmado (polling manual)
  const checkPaymentStatus = useCallback(async () => {
    if (!churchId) return
    setChecking(true)
    try {
      const { data } = await supabase
        .from('churches')
        .select('status')
        .eq('id', churchId)
        .maybeSingle()

      if (data?.status === 'onboarding') {
        // Força refresh da sessão para atualizar churchStatus no AuthContext
        await supabase.auth.refreshSession()
        navigate('/onboarding', { replace: true })
      } else {
        setError('Pagamento ainda não confirmado. Aguarde alguns segundos e tente novamente.')
      }
    } catch {
      setError('Erro ao verificar status. Tente novamente.')
    } finally {
      setChecking(false)
    }
  }, [churchId, navigate])

  // Se voltou do Stripe com ?session_id, verifica status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('session_id')) {
      void checkPaymentStatus()
    }
  }, [checkPaymentStatus])

  async function handleGoToCheckout() {
    if (!churchId || !planSlug) return
    setLoading(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          Authorization:  `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan_slug:   planSlug,
          success_url: `${window.location.origin}/payment-pending`,
          cancel_url:  `${window.location.origin}/payment-pending`,
        }),
      })

      if (res.ok) {
        const { url } = await res.json() as { url: string }
        if (url) window.location.href = url
        else setError('Não foi possível gerar o link de pagamento.')
      } else {
        const { error: apiErr } = await res.json() as { error: string }
        setError(apiErr ?? 'Erro ao gerar link de pagamento.')
      }
    } catch (e) {
      console.error('[PaymentPending] checkout error:', e)
      setError('Erro inesperado. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const hasPlan = !!planSlug

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: '#f0f4ff' }}
    >
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-5">
        {/* Ícone */}
        <div className="flex justify-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: '#3b5bdb15' }}
          >
            <svg className="w-8 h-8" style={{ color: '#3b5bdb' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75}
                d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
          </div>
        </div>

        {/* Título */}
        <div>
          <h1
            className="text-2xl font-bold text-gray-900"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Ative sua conta
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {user?.email && (
              <span className="font-medium text-gray-700">{user.email}</span>
            )}
            {user?.email && <br />}
            Sua conta está pronta. Conclua o pagamento para começar a usar o Ekthos CRM.
          </p>
        </div>

        {/* Erro */}
        {error && (
          <div className="rounded-lg px-4 py-3 text-sm text-red-700 bg-red-50 border border-red-100">
            {error}
          </div>
        )}

        {/* CTAs */}
        <div className="space-y-3">
          <button
            onClick={() => void handleGoToCheckout()}
            disabled={loading || !hasPlan}
            className="w-full py-3 px-4 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50"
            style={{ background: '#3b5bdb' }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size="sm" />
                Redirecionando...
              </span>
            ) : (
              'Ir para o pagamento'
            )}
          </button>

          <button
            onClick={() => void checkPaymentStatus()}
            disabled={checking}
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {checking ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size="sm" />
                Verificando...
              </span>
            ) : (
              'Já paguei — verificar acesso'
            )}
          </button>
        </div>

        {/* Links secundários */}
        <div className="flex flex-col gap-2 pt-1">
          <a
            href="mailto:suporte@ekthosai.net"
            className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2"
          >
            Falar com o suporte
          </a>
          <button
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Sair da conta
          </button>
        </div>
      </div>
    </div>
  )
}
