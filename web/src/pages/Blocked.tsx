// Página exibida quando a assinatura está suspensa (pagamento pendente).
// Redireciona para stripe-checkout para regularização.

import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useState } from 'react'
import Spinner from '@/components/ui/Spinner'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

export default function Blocked() {
  const { user, churchId } = useAuth()
  const [loading, setLoading] = useState(false)

  async function handleRegularize() {
    if (!churchId) return
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ church_id: churchId, mode: 'payment' }),
      })

      if (res.ok) {
        const { url } = await res.json() as { url: string }
        if (url) window.location.href = url
      }
    } catch (err) {
      console.error('[Blocked] stripe-checkout error:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ background: '#f9eedc' }}
    >
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center space-y-5">
        {/* Ícone */}
        <div className="flex justify-center">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center"
            style={{ background: '#e1350015' }}
          >
            <svg
              className="w-8 h-8"
              style={{ color: '#e13500' }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
          </div>
        </div>

        {/* Título */}
        <div>
          <h1
            className="text-2xl font-bold text-gray-900"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Conta suspensa
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {user?.email && (
              <span className="font-medium text-gray-700">{user.email}</span>
            )}
            {user?.email && ' — '}
            Identificamos um problema com o pagamento da sua assinatura. Para
            continuar usando a plataforma, regularize agora.
          </p>
        </div>

        {/* CTA principal */}
        <button
          onClick={() => void handleRegularize()}
          disabled={loading || !churchId}
          className="w-full py-3 px-4 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50"
          style={{ background: '#e13500' }}
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Spinner size="sm" />
              Redirecionando...
            </span>
          ) : (
            'Regularizar pagamento'
          )}
        </button>

        {/* Links secundários */}
        <div className="flex flex-col gap-2 pt-1">
          <a
            href="mailto:suporte@ekthos.com.br"
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
