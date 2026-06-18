import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/cuidado/responsaveis', label: 'Responsáveis' },
  { to: '/cuidado/distribuir',   label: 'Distribuição'  },
  { to: '/cuidado/painel',       label: 'Painel'        },
  { to: '/cuidado/duplicados',   label: 'Duplicados'    },
]

const base: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center',
  padding: '6px 14px', fontSize: 13, fontWeight: 500,
  borderRadius: 8, transition: 'all 150ms ease',
  textDecoration: 'none',
}

export default function CuidadoTabBar() {
  return (
    <div className="flex gap-1 flex-wrap" style={{ padding: '0 0 12px 0' }}>
      {TABS.map(({ to, label }) => (
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
