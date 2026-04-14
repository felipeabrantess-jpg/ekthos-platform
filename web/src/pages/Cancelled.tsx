// Página exibida quando a assinatura foi cancelada.
// Permite reativar via Stripe ou exportar dados antes da exclusão.

import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useState, useEffect } from 'react'
import Spinner from '@/components/ui/Spinner'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
// Dados são retidos por 30 dias após cancelamento
const DATA_RETENTION_DAYS = 30

export default function Cancelled() {
  const { user, churchId } = useAuth()
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [cancelledAt, setCancelledAt] = useState<string | null>(null)
  const [daysLeft, setDaysLeft] = useState<number | null>(null)

  // Busca data de cancelamento para exibir countdown
  useEffect(() => {
    if (!churchId) return
    void supabase
      .from('subscriptions')
      .select('cancel_at_period_end, current_period_end, updated_at')
      .eq('church_id', churchId)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        const refDate = data.current_period_end ?? data.updated_at
        if (refDate) {
          setCancelledAt(refDate)
          const deletion = new Date(refDate).getTime() + DATA_RETENTION_DAYS * 86400000
          const left = Math.max(0, Math.ceil((deletion - Date.now()) / 86400000))
          setDaysLeft(left)
        }
      })
  }, [churchId])

  async function handleReactivate() {
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
        body: JSON.stringify({ church_id: churchId, mode: 'subscription' }),
      })
      if (res.ok) {
        const { url } = await res.json() as { url: string }
        if (url) window.location.href = url
      }
    } catch (err) {
      console.error('[Cancelled] reactivate error:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleExport() {
    if (!churchId) return
    setExporting(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      const res = await fetch(`${SUPABASE_URL}/functions/v1/export-church-data`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ church_id: churchId }),
      })
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `ekthos-export-${churchId}.zip`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      console.error('[Cancelled] export error:', err)
    } finally {
      setExporting(false)
    }
  }

  function formatDate(iso: string) {
    return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date(iso))
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
            style={{ background: '#67000015' }}
          >
            <svg
              className="w-8 h-8"
              style={{ color: '#670000' }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.75}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
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
            Assinatura encerrada
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            {user?.email && (
              <span className="font-medium text-gray-700">{user.email}</span>
            )}
            {user?.email && ' — '}
            Sua assinatura foi cancelada. Seus dados continuam disponíveis
            por mais{' '}
            {daysLeft !== null ? (
              <span className="font-semibold text-gray-800">{daysLeft} dias</span>
            ) : (
              `${DATA_RETENTION_DAYS} dias`
            )}{' '}
            após o encerramento.
          </p>

          {cancelledAt && daysLeft !== null && (
            <div
              className="mt-3 px-4 py-2 rounded-lg text-xs font-medium"
              style={{
                background: daysLeft <= 7 ? '#e1350012' : '#6700000a',
                color: daysLeft <= 7 ? '#e13500' : '#670000',
              }}
            >
              {daysLeft > 0
                ? `Dados excluídos em: ${formatDate(
                    new Date(new Date(cancelledAt).getTime() + DATA_RETENTION_DAYS * 86400000).toISOString()
                  )} (${daysLeft} dias restantes)`
                : 'Prazo de retenção encerrado — dados em processo de exclusão'}
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className="space-y-3">
          <button
            onClick={() => void handleReactivate()}
            disabled={loading}
            className="w-full py-3 px-4 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50"
            style={{ background: '#670000' }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size="sm" />
                Redirecionando...
              </span>
            ) : (
              'Reativar minha conta'
            )}
          </button>

          <button
            onClick={() => void handleExport()}
            disabled={exporting}
            className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting ? (
              <span className="flex items-center justify-center gap-2">
                <Spinner size="sm" />
                Gerando arquivo...
              </span>
            ) : (
              'Exportar meus dados (.zip)'
            )}
          </button>
        </div>

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
