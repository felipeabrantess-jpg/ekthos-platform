import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, Users, GitBranch, Network, Building2,
  Heart, CalendarRange, Wallet, Calendar, Lock, Bot,
  Settings, LogOut,
} from 'lucide-react'
import { useAuth, useLogout } from '@/hooks/useAuth'
import { ROUTE_PERMISSIONS, ROLE_LABELS } from '@/hooks/useRole'
import NotificationBell from '@/features/notifications/components/NotificationBell'
import { AgentChatButton } from './AgentChatWidget'
import { usePlan } from '@/hooks/usePlan'
import { useChurch, DEFAULT_MODULES } from '@/hooks/useChurch'

interface NavItem {
  path:      string
  label:     string
  icon:      React.ReactNode
  moduleKey: string | null   // null = sempre visível (ex: Dashboard, Agents, Settings)
}

// Chave de módulo por rota — tem que bater com EnabledModules
const ALL_NAV_ITEMS: NavItem[] = [
  { path: '/dashboard',        label: 'Dashboard',    icon: <LayoutDashboard size={16} strokeWidth={1.75} />, moduleKey: null },
  { path: '/pessoas',          label: 'Pessoas',      icon: <Users          size={16} strokeWidth={1.75} />, moduleKey: 'pessoas' },
  { path: '/pipeline',         label: 'Discipulado',  icon: <GitBranch      size={16} strokeWidth={1.75} />, moduleKey: 'pipeline' },
  { path: '/celulas',          label: 'Células',       icon: <Network        size={16} strokeWidth={1.75} />, moduleKey: 'celulas' },
  { path: '/ministerios',      label: 'Ministérios',   icon: <Building2      size={16} strokeWidth={1.75} />, moduleKey: 'ministerios' },
  { path: '/voluntarios',      label: 'Voluntários',   icon: <Heart          size={16} strokeWidth={1.75} />, moduleKey: 'voluntarios' },
  { path: '/escalas',          label: 'Escalas',       icon: <CalendarRange  size={16} strokeWidth={1.75} />, moduleKey: 'escalas' },
  { path: '/financeiro',       label: 'Financeiro',    icon: <Wallet         size={16} strokeWidth={1.75} />, moduleKey: 'financeiro' },
  { path: '/agenda',           label: 'Agenda',        icon: <Calendar       size={16} strokeWidth={1.75} />, moduleKey: 'agenda' },
  { path: '/gabinete',         label: 'Gabinete',      icon: <Lock           size={16} strokeWidth={1.75} />, moduleKey: 'gabinete' },
  { path: '/agents',           label: 'Agentes IA',    icon: <Bot            size={16} strokeWidth={1.75} />, moduleKey: null },
  { path: '/settings/billing', label: 'Configurações', icon: <Settings       size={16} strokeWidth={1.75} />, moduleKey: null },
]

export default function Sidebar() {
  const { user, role } = useAuth()
  const logout = useLogout()
  const { allAgents, hasAgent, isLoading: planLoading } = usePlan()
  const { data: church } = useChurch()

  const enabledModules = church?.enabled_modules ?? DEFAULT_MODULES

  // Agentes ativos para esta subscription, ordenados: free primeiro, depois always_paid
  const sidebarAgents = allAgents
    .filter(a => hasAgent(a.slug))
    .sort((a, b) => {
      const tierOrder = { free: 0, always_paid: 1, eligible: 2 }
      const tDiff = (tierOrder[a.pricing_tier] ?? 2) - (tierOrder[b.pricing_tier] ?? 2)
      if (tDiff !== 0) return tDiff
      return a.name.localeCompare(b.name, 'pt-BR')
    })

  // Filtra por role
  const roleFilteredItems = ALL_NAV_ITEMS.filter((item) => {
    if (!role) return false
    const allowed = ROUTE_PERMISSIONS[item.path]
    return allowed?.includes(role) ?? true
  })

  // Separa: itens habilitados (navegáveis) e desabilitados (cadeado)
  const enabledItems  = roleFilteredItems.filter(item => !item.moduleKey || enabledModules[item.moduleKey] !== false)
  const disabledItems = roleFilteredItems.filter(item => item.moduleKey && enabledModules[item.moduleKey] === false)

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name as string | undefined) ??
    user?.email?.split('@')[0] ?? 'Usuário'
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <aside className="w-64 flex flex-col h-screen sticky top-0 shrink-0" style={{ background: '#161616' }}>
      {/* Logo + Notificações */}
      <div className="px-5 py-5 flex items-center justify-between border-b border-white/5">
        {church?.logo_url ? (
          <img
            src={church.logo_url}
            alt={church.name}
            className="h-8 w-auto object-contain max-w-[130px]"
          />
        ) : (
          <span
            className="font-display text-xl font-bold truncate max-w-[130px]"
            style={{ color: 'var(--church-primary, #e13500)' }}
          >
            {church?.name ?? 'Ekthos'}
          </span>
        )}
        <NotificationBell />
      </div>

      {/* Navegação */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto sidebar-scroll">

        {/* Itens habilitados */}
        {enabledItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150 border-l-[3px] ${
                isActive
                  ? 'text-white bg-white/[0.06] rounded-r-lg'
                  : 'text-white/50 border-transparent hover:text-white/80 hover:bg-white/[0.04] hover:rounded-lg'
              }`
            }
            style={({ isActive }) =>
              isActive ? { borderColor: 'var(--church-primary, #e13500)' } : {}
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}

        {/* Itens desabilitados — visíveis com cadeado */}
        {disabledItems.length > 0 && (
          <>
            <div className="pt-2 pb-1">
              <div className="border-t border-white/5" />
            </div>
            {disabledItems.map((item) => (
              <div
                key={item.path}
                className="group relative flex items-center gap-3 px-3 py-2.5 text-sm font-medium border-l-[3px] border-transparent cursor-default select-none"
                style={{ color: 'rgba(255,255,255,0.2)' }}
                title="Ative nas Configurações"
              >
                {/* Ícone do módulo (opaco) */}
                <span className="opacity-40">{item.icon}</span>
                <span className="flex-1 opacity-40">{item.label}</span>

                {/* Cadeado à direita */}
                <Lock size={11} strokeWidth={2} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />

                {/* Tooltip ao hover */}
                <div
                  className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                  style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
                >
                  Ative nas Configurações
                  {/* Seta */}
                  <div
                    className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent"
                    style={{ borderRightColor: '#161616' }}
                  />
                </div>
              </div>
            ))}
          </>
        )}
      </nav>

      {/* Agentes IA — acesso rápido */}
      <div className="px-3 pb-2 border-t border-white/5 pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest px-3 mb-1.5" style={{ color: 'rgba(249,238,220,0.3)' }}>
          Assistentes
        </p>
        <div className="overflow-y-auto sidebar-scroll" style={{ maxHeight: '220px' }}>
          {planLoading && (
            <p className="text-[11px] px-3 py-1" style={{ color: 'rgba(249,238,220,0.3)' }}>
              Carregando...
            </p>
          )}
          {!planLoading && sidebarAgents.length === 0 && (
            <p className="text-[11px] px-3 py-1" style={{ color: 'rgba(249,238,220,0.3)' }}>
              Nenhum assistente ativo
            </p>
          )}
          {!planLoading && sidebarAgents.map(agent => (
            <AgentChatButton
              key={agent.slug}
              agentSlug={agent.slug}
              agentName={agent.name}
            />
          ))}
        </div>
      </div>

      {/* Rodapé de usuário */}
      <div className="px-3 py-4 border-t border-white/5">
        <div className="flex items-center gap-3 px-3 py-2">
          <div
            className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
            style={{ background: 'var(--church-primary, #e13500)', color: '#fff' }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: 'rgba(249,238,220,0.9)' }}>{displayName}</p>
            {role && (
              <p className="text-xs truncate" style={{ color: 'rgba(249,238,220,0.4)' }}>{ROLE_LABELS[role]}</p>
            )}
          </div>
          <button
            onClick={logout}
            title="Sair"
            className="text-white/50 hover:text-white/80 transition-colors"
          >
            <LogOut size={16} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </aside>
  )
}
