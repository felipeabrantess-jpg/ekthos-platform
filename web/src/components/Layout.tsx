import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Eye } from 'lucide-react'
import Sidebar from './Sidebar'
import MobileHeader from './MobileHeader'
import AppHeader from './AppHeader'
import { useChurch } from '@/hooks/useChurch'
import { NotificationsProvider } from '@/features/notifications/context/NotificationsContext'
import { AgentDrawerProvider } from '@/contexts/AgentDrawerContext'
import { UnitProvider } from '@/contexts/UnitContext'
import { AgentDrawer } from '@/components/agents/AgentDrawer'
import { supabase } from '@/lib/supabase'
import { useAuth, type ImpersonationState } from '@/lib/auth-context'

function ImpersonateBanner({ state, onExit, exitLoading, exitError }: {
  state: ImpersonationState
  onExit: () => void
  exitLoading: boolean
  exitError: string | null
}) {
  return (
    <div
      className="w-full flex items-center justify-between px-6 py-2 shrink-0 z-50"
      style={{ background: 'var(--color-danger)', color: '#fff' }}
    >
      <div className="flex items-center gap-2 text-xs text-white/80">
        <Eye size={13} strokeWidth={2} />
        <span>Visualizando como:</span>
        <span className="font-semibold text-white">{state.church_name}</span>
        {exitError && (
          <span className="text-white/70 ml-2">({exitError})</span>
        )}
      </div>
      <button
        onClick={onExit}
        disabled={exitLoading}
        className="text-xs text-white/70 hover:text-white underline transition-colors disabled:opacity-50"
      >
        {exitLoading ? 'Encerrando...' : 'Sair da visualização'}
      </button>
    </div>
  )
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  // Impersonação: estado vem do backend via AuthContext (get_my_tenant_context).
  // localStorage não decide nada aqui.
  const { impersonation: impersonating, refreshTenant } = useAuth()
  const queryClient = useQueryClient()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { data: church } = useChurch()

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Injetar CSS vars de branding da igreja
  useEffect(() => {
    const primary   = church?.primary_color   ?? '#29B6FF'
    const secondary = church?.secondary_color ?? '#1FA8F0'
    document.documentElement.style.setProperty('--church-primary',   primary)
    document.documentElement.style.setProperty('--church-secondary', secondary)
    return () => {
      document.documentElement.style.removeProperty('--church-primary')
      document.documentElement.style.removeProperty('--church-secondary')
    }
  }, [church?.primary_color, church?.secondary_color])

  const [exitLoading, setExitLoading] = useState(false)
  const [exitError,   setExitError]   = useState<string | null>(null)

  async function exitImpersonate() {
    if (exitLoading) return
    setExitLoading(true)
    setExitError(null)

    const session_id = impersonating?.session_id ?? null
    if (!session_id) {
      // Nada aberto no backend: apenas ressincroniza o contexto
      await refreshTenant()
      setExitLoading(false)
      return
    }

    // O backend é a autoridade: só consideramos a impersonação encerrada
    // quando a sessão server-side for fechada. Falha aqui NÃO apaga o estado.
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Sessão expirada')
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-end-impersonation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({ session_id, ended_reason: 'manual_exit' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `Erro ${res.status} ao encerrar sessão`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao encerrar sessão'
      console.error('[impersonate] end failed:', msg)
      setExitError(msg)
      setExitLoading(false)
      return
    }

    // Tenant voltou ao original no backend → recarrega contexto e limpa caches
    await refreshTenant()
    queryClient.clear()
    setExitLoading(false)
    navigate('/admin/churches')
  }

  return (
    <NotificationsProvider>
      <AgentDrawerProvider>
      <UnitProvider>
        {/* flex ROW: sidebar esquerda | coluna de conteúdo direita */}
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
          <Sidebar isMobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

          {/* Coluna de conteúdo: topbar + main */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Mobile: header fixo (hamburger + nome da igreja + sino) */}
            <MobileHeader onMenuClick={() => setSidebarOpen(true)} />

            {impersonating && (
              <ImpersonateBanner state={impersonating} onExit={() => void exitImpersonate()} exitLoading={exitLoading} exitError={exitError} />
            )}

            {/* Desktop: topbar (sino + avatar) — ACIMA do main, fora do overflow-y-auto */}
            <AppHeader />

            {/* Conteúdo — pt-14 mobile (clear do MobileHeader fixo), pt-0 desktop */}
            <main className="flex-1 overflow-y-auto pt-14 md:pt-0" style={{ background: 'var(--bg-primary)' }}>
              <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-8 page-content">
                <Outlet />
              </div>
            </main>
          </div>
        </div>

        {/* Drawer flutuante do Assistente Pastoral — fora do scroll */}
        <AgentDrawer />
      </UnitProvider>
      </AgentDrawerProvider>
    </NotificationsProvider>
  )
}
