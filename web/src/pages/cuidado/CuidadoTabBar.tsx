import { NavLink }   from 'react-router-dom'
import { useAuth }   from '@/hooks/useAuth'
import { canAccess } from '@/hooks/useRole'

const ALL_TABS = [
  { to: '/cuidado/responsaveis', label: 'Responsáveis', guard: null                  },
  { to: '/cuidado/distribuir',   label: 'Distribuição',  guard: null                  },
  { to: '/cuidado/painel',       label: 'Painel',        guard: null                  },
  { to: '/cuidado/duplicados',   label: 'Duplicados',    guard: null                  },
  { to: '/cuidado/pessoas',      label: 'Pessoas',       guard: '/cuidado/pessoas'    },
]

const base: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '6px 14px', fontSize: 13, fontWeight: 500,
  borderRadius: 8, transition: 'all 150ms ease',
  textDecoration: 'none',
}

export default function CuidadoTabBar() {
  const { role } = useAuth()
  const tabs = ALL_TABS.filter(t => !t.guard || canAccess(role, t.guard))

  return (
    <div className="flex gap-1 flex-wrap" style={{ padding: '0 0 12px 0' }}>
      {tabs.map(({ to, label }) => (
        <NavLink
          key={to}
          to={to}
          style={({ isActive }) => ({
            ...base,
            background: isActive ? 'var(--color-primary)' : 'var(--bg-hover)',
            color:      isActive ? '#fff'                 : 'var(--text-secondary)',
          })}
        >
          {label}
        </NavLink>
      ))}
    </div>
  )
}
