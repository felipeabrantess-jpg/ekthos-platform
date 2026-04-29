import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Eye } from 'lucide-react'
import Sidebar from './Sidebar'
import MobileHeader from './MobileHeader'
import AppHeader from './AppHeader'
import { useChurch } from '@/hooks/useChurch'
import { NotificationsProvider } from '@/features/notifications/context/NotificationsContext'

interface ImpersonatingState {
  church_id:   string
  church_name: string
}

function ImpersonateBanner({ state, onExit }: {
  state: ImpersonatingState
  onExit: () => void
}) {
  return (
    <div
      className="w-full flex items-center justify-between px-6 py-2 shrink-0 z-50"
      style={{ background: '#670000' }}
    >
      <div className="flex items-center gap-2 text-xs text-white/80">
        <Eye size={13} strokeWidth={2} />
        <span>Visualizando como:</span>
        <span className="font-semibold text-white">{state.church_name}</span>
      </div>
      <button
        onClick={onExit}
        className="text-xs text-white/70 hover:text-white underline transition-colors"
      >
        Sair da visualização
      </button>
    </div>
  )
}

export default function Layout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [impersonating, setImpersonating] = useState<ImpersonatingState | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { data: church } = useChurch()

  // Fecha drawer ao navegar
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  // Inject church CSS variables globally so all components can use them
  useEffect(() => {
    const primary   = church?.primary_color   ?? '#E13500'
    const secondary = church?.secondary_color ?? '#670000'
    document.documentElement.style.setProperty('--church-primary',   primary)
    document.documentElement.style.setProperty('--church-secondary', secondary)
    return () => {
      document.documentElement.style.removeProperty('--church-primary')
      document.documentElement.style.removeProperty('--church-secondary')
    }
  }, [church?.primary_color, church?.secondary_color])

  useEffect(() => {
    const raw = localStorage.getItem('impersonating')
    if (raw) {
      try {
        setImpersonating(JSON.parse(raw) as ImpersonatingState)
      } catch {
        localStorage.removeItem('impersonating')
      }
    }
  }, [])

  function exitImpersonate() {
    localStorage.removeItem('impersonating')
    navigate('/admin/churches')
    window.location.reload()
  }

  return (
    <NotificationsProvider>
    <div className="flex flex-col h-screen overflow-hidden" style={{ background: '#f9eedc' }}>
      {/* Mobile-only top header */}
      <MobileHeader onMenuClick={() => setSidebarOpen(true)} />

      {impersonating && (
        <ImpersonateBanner state={impersonating} onExit={exitImpersonate} />
      )}

      {/* Desktop header — fora do main para não ficar dentro de overflow-y-auto */}
      <AppHeader />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar isMobileOpen={sidebarOpen} onMobileClose={() => setSidebarOpen(false)} />

        {/* Main content — pt-14 on mobile to clear fixed MobileHeader */}
        <main className="flex-1 overflow-y-auto pt-14 md:pt-0" style={{ background: '#f9eedc' }}>
          <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 md:py-8 page-content">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
    </NotificationsProvider>
  )
}
