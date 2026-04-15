import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Building2, TrendingUp, ArrowLeft, UserPlus, CheckSquare } from 'lucide-react'

const NAV = [
  { to: '/admin/cockpit',      label: 'Cockpit',      icon: <LayoutDashboard size={16} strokeWidth={1.75} /> },
  { to: '/admin/churches',     label: 'Igrejas',      icon: <Building2       size={16} strokeWidth={1.75} /> },
  { to: '/admin/onboardings',  label: 'Onboardings',  icon: <UserPlus        size={16} strokeWidth={1.75} /> },
  { to: '/admin/tasks',        label: 'Tarefas',      icon: <CheckSquare     size={16} strokeWidth={1.75} /> },
  { to: '/admin/revenue',      label: 'Receita',      icon: <TrendingUp      size={16} strokeWidth={1.75} /> },
]

export default function AdminLayout() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#f9eedc' }}>
      {/* Banner vermelho admin */}
      <div
        className="w-full flex items-center justify-between px-6 py-2.5 shrink-0"
        style={{ background: '#670000' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-white/60 uppercase tracking-widest">
            Ekthos Admin
          </span>
          <span className="text-white/30 text-xs">·</span>
          <span className="text-xs text-white/80">Painel de controle global</span>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          className="flex items-center gap-1.5 text-xs text-white/70 hover:text-white transition-colors"
        >
          <ArrowLeft size={13} strokeWidth={2} />
          Voltar ao CRM
        </button>
      </div>

      {/* Layout principal */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar admin */}
        <aside
          className="w-52 shrink-0 flex flex-col py-6 px-3 gap-1"
          style={{ background: '#161616' }}
        >
          <p className="text-[10px] font-semibold text-white/30 uppercase tracking-widest px-3 mb-2">
            Navegação
          </p>
          {NAV.map(({ to, label, icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/5'
                }`
              }
            >
              {icon}
              {label}
            </NavLink>
          ))}
        </aside>

        {/* Conteúdo */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
