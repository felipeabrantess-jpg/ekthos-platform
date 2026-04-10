import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, GitBranch, Network, Building2,
  Heart, CalendarRange, Wallet, Calendar, Lock, Bot,
  Settings, LogOut, Bell,
} from 'lucide-react'
import { useAuth, useLogout } from '@/hooks/useAuth'
import { ROUTE_PERMISSIONS, ROLE_LABELS } from '@/hooks/useRole'
import NotificationBell from '@/features/notifications/components/NotificationBell'

interface NavItem {
  path: string
  label: string
  icon: React.ReactNode
}

const ALL_NAV_ITEMS: NavItem[] = [
  { path: '/dashboard',        label: 'Dashboard',    icon: <LayoutDashboard size={20} strokeWidth={1.75} /> },
  { path: '/pessoas',          label: 'Pessoas',      icon: <Users          size={20} strokeWidth={1.75} /> },
  { path: '/pipeline',         label: 'Pipeline',     icon: <GitBranch      size={20} strokeWidth={1.75} /> },
  { path: '/celulas',          label: 'Celulas',      icon: <Network        size={20} strokeWidth={1.75} /> },
  { path: '/ministerios',      label: 'Ministerios',  icon: <Building2      size={20} strokeWidth={1.75} /> },
  { path: '/voluntarios',      label: 'Voluntarios',  icon: <Heart          size={20} strokeWidth={1.75} /> },
  { path: '/escalas',          label: 'Escalas',      icon: <CalendarRange  size={20} strokeWidth={1.75} /> },
  { path: '/financeiro',       label: 'Financeiro',   icon: <Wallet         size={20} strokeWidth={1.75} /> },
  { path: '/agenda',           label: 'Agenda',       icon: <Calendar       size={20} strokeWidth={1.75} /> },
  { path: '/gabinete',         label: 'Gabinete',     icon: <Lock           size={20} strokeWidth={1.75} /> },
  { path: '/agents',           label: 'Agentes IA',   icon: <Bot            size={20} strokeWidth={1.75} /> },
  { path: '/settings/billing', label: 'Configuracoes',icon: <Settings       size={20} strokeWidth={1.75} /> },
]

export default function Sidebar() {
  const { user, role } = useAuth()
  const logout = useLogout()

  const visibleItems = ALL_NAV_ITEMS.filter((item) => {
    if (!role) return false
    const allowed = ROUTE_PERMISSIONS[item.path]
    return allowed?.includes(role) ?? true
  })

  const initial = user?.email?.charAt(0).toUpperCase() ?? 'U'

  return (
    <aside className="w-64 flex flex-col h-screen sticky top-0 shrink-0" style={{ background: '#161616' }}>
      {/* Logo + Notificacoes */}
      <div className="px-5 py-5 flex items-center justify-between border-b border-white/5">
        <span className="font-display text-xl font-bold" style={{ color: '#e13500' }}>
          Ekthos
        </span>
        <NotificationBell />
      </div>

      {/* Navegacao */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {visibleItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150 border-l-[3px] ${
                isActive
                  ? 'text-white border-[#e13500] bg-white/[0.06]'
                  : 'text-white/50 border-transparent hover:text-white/80 hover:bg-white/[0.04]'
              }`
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Rodape de usuario */}
      <div className="px-3 py-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2">
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
            style={{ background: '#e13500', color: '#fff' }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white/80 truncate">{user?.email ?? ''}</p>
            {role && (
              <p className="text-xs text-white/40 truncate">{ROLE_LABELS[role]}</p>
            )}
          </div>
          <button
            onClick={logout}
            title="Sair"
            className="text-white/30 hover:text-white/70 transition-colors"
          >
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  )
}
