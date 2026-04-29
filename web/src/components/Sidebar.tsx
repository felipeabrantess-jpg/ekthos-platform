/**
 * Sidebar.tsx — Rail + Sub-sidebar contextual (dual-mode)
 *
 * ┌──────┬──────────────────────┐
 * │ RAIL │  SUB-PAINEL          │
 * │ 64px │  240px               │
 * └──────┴──────────────────────┘
 *
 * Rail: 4 categorias (Igreja · Agentes IA · Módulos · Config)
 * Sub-painel: conteúdo contextual por categoria ativa
 * Estado: persiste em localStorage → ekthos_sidebar_category
 * Sino: movido para AppHeader (desktop) e MobileHeader (mobile)
 */

import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  LayoutGrid, Bot, Package, Settings, LogOut,
  CheckCircle2, Lock, ChevronRight, Sparkles,
} from 'lucide-react'
import { useAuth, useLogout } from '@/hooks/useAuth'
import { ROUTE_PERMISSIONS, ROLE_LABELS } from '@/hooks/useRole'
import { usePlan } from '@/hooks/usePlan'
import { useChurch, DEFAULT_MODULES } from '@/hooks/useChurch'
import { IGREJA_NAV } from '@/lib/navigation'
import { AGENTS_CONTENT } from '@/lib/agents-content'
import { MODULES_CONTENT } from '@/lib/modules-content'

type Category = 'igreja' | 'agentes' | 'modulos' | 'config'

const STORAGE_KEY = 'ekthos_sidebar_category'

function inferCategory(pathname: string): Category {
  if (pathname.startsWith('/agentes')) return 'agentes'
  if (pathname.startsWith('/modulos')) return 'modulos'
  if (pathname.startsWith('/configuracoes') || pathname.startsWith('/settings')) return 'config'
  return 'igreja'
}

const RAIL_ITEMS: { id: Category; Icon: typeof LayoutGrid; label: string }[] = [
  { id: 'igreja',  Icon: LayoutGrid, label: 'Igreja'     },
  { id: 'agentes', Icon: Bot,        label: 'Agentes IA' },
  { id: 'modulos', Icon: Package,    label: 'Módulos'    },
  { id: 'config',  Icon: Settings,   label: 'Config.'    },
]

// ── Rail (64px) ──────────────────────────────────────────────────────────────

interface RailProps {
  active: Category
  onSelect: (c: Category) => void
  churchLogoUrl?: string
  churchName?: string
  onLogout: () => void
}

function SidebarRail({ active, onSelect, churchLogoUrl, churchName, onLogout }: RailProps) {
  return (
    <div
      className="flex flex-col h-full shrink-0"
      style={{
        width: 64,
        background: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-default)',
      }}
    >
      {/* Logo da igreja */}
      <div
        className="flex items-center justify-center h-16 shrink-0"
        style={{ borderBottom: '1px solid var(--border-default)' }}
      >
        {churchLogoUrl ? (
          <img src={churchLogoUrl} alt={churchName ?? ''} className="h-8 w-8 object-contain rounded-lg" />
        ) : (
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center font-display font-bold text-sm text-white"
            style={{ background: 'var(--church-primary, var(--color-primary))' }}
          >
            {(churchName ?? 'E').charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Categoria items */}
      <nav className="flex-1 flex flex-col items-center gap-1 py-3">
        {RAIL_ITEMS.map(({ id, Icon, label }) => {
          const isActive = active === id
          return (
            <div key={id} className="relative group">
              <button
                onClick={() => onSelect(id)}
                className="flex items-center justify-center rounded-xl transition-all"
                style={{
                  width: 40, height: 40,
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
                  borderRight: isActive
                    ? '2px solid var(--color-primary)'
                    : '2px solid transparent',
                }}
                onMouseEnter={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--bg-hover)'
                    e.currentTarget.style.color = 'var(--text-primary)'
                  }
                }}
                onMouseLeave={e => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'var(--text-secondary)'
                  }
                }}
              >
                <Icon size={18} strokeWidth={1.75} />
              </button>
              {/* Tooltip */}
              <div
                className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-2 py-1 rounded-md text-[11px] font-medium whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  boxShadow: 'var(--shadow-md)',
                }}
              >
                {label}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Rodapé: logout */}
      <div
        className="flex flex-col items-center gap-2 pb-3 pt-3"
        style={{ borderTop: '1px solid var(--border-default)' }}
      >
        <button
          onClick={onLogout}
          className="flex items-center justify-center rounded-lg transition-all"
          style={{ width: 32, height: 32, color: 'var(--text-tertiary)' }}
          title="Sair"
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-danger)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-tertiary)')}
        >
          <LogOut size={15} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}

// ── Sub-painel: IGREJA ───────────────────────────────────────────────────────

function IgrejaSubPanel({ role, enabledModules }: { role: string | null; enabledModules: Record<string, boolean> }) {
  const roleFilteredItems = IGREJA_NAV.filter(item => {
    if (!role) return false
    const allowed = ROUTE_PERMISSIONS[item.path]
    return (allowed as string[] | undefined)?.includes(role) ?? true
  })

  const enabledItems  = roleFilteredItems.filter(i => !i.moduleKey || enabledModules[i.moduleKey] !== false)
  const disabledItems = roleFilteredItems.filter(i => i.moduleKey && enabledModules[i.moduleKey] === false)

  const navItemBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '6px 12px', fontSize: 13, fontWeight: 500,
    borderRadius: 8, transition: 'all 150ms ease',
    borderLeft: '2px solid transparent', cursor: 'pointer',
    textDecoration: 'none', width: '100%',
  }

  return (
    <div className="space-y-0.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-3"
        style={{ color: 'var(--text-tertiary)' }}>
        Principal
      </p>
      {enabledItems.map(({ path, label, Icon }) => (
        <NavLink
          key={path}
          to={path}
          style={({ isActive }) => ({
            ...navItemBase,
            background: isActive ? 'var(--bg-hover)' : 'transparent',
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderLeftColor: isActive ? 'var(--color-primary)' : 'transparent',
          })}
          onMouseEnter={e => {
            const el = e.currentTarget
            if (!el.dataset.active) {
              el.style.background = 'var(--bg-hover)'
              el.style.color = 'var(--text-primary)'
            }
          }}
          onMouseLeave={e => {
            const el = e.currentTarget
            if (!el.dataset.active) {
              el.style.background = 'transparent'
              el.style.color = 'var(--text-secondary)'
            }
          }}
        >
          <Icon size={15} strokeWidth={1.75} className="shrink-0" />
          <span>{label}</span>
        </NavLink>
      ))}

      {disabledItems.length > 0 && (
        <>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
            style={{ color: 'var(--text-tertiary)', opacity: 0.6 }}>
            Desabilitados
          </p>
          {disabledItems.map(({ path, label, Icon }) => (
            <div
              key={path}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border-l-2 border-transparent cursor-default select-none"
              style={{ color: 'var(--text-tertiary)', opacity: 0.4 }}
              title="Ative nas Configurações"
            >
              <Icon size={15} strokeWidth={1.75} className="shrink-0" />
              <span className="text-[13px]">{label}</span>
              <Lock size={10} strokeWidth={2} className="ml-auto shrink-0" />
            </div>
          ))}
        </>
      )}
    </div>
  )
}

// ── Sub-painel: AGENTES IA ───────────────────────────────────────────────────

interface AgentesSubProps {
  allAgents: ReturnType<typeof usePlan>['allAgents']
  hasAgent: (slug: string) => boolean
  activeAgentSlugs: string[]
  planSlug: string
  planLoading: boolean
}

function AgentesSubPanel({ allAgents, hasAgent, activeAgentSlugs, planSlug, planLoading }: AgentesSubProps) {
  const catalogSlugs = allAgents.map(a => a.slug)
  const activeContent    = AGENTS_CONTENT.filter(c => catalogSlugs.includes(c.slug) && hasAgent(c.slug))
  const standaloneContent = AGENTS_CONTENT.filter(c => !c.moduleId && catalogSlugs.includes(c.slug) && !hasAgent(c.slug) && !c.badge?.includes('Avivamento'))
  const moduleAgents     = AGENTS_CONTENT.filter(c => !!c.moduleId)
  const exclusiveAgents  = AGENTS_CONTENT.filter(c => c.badge?.includes('Avivamento') && planSlug !== 'avivamento' && !hasAgent(c.slug))

  const navItemBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '6px 12px', fontSize: 13, fontWeight: 500,
    borderRadius: 8, transition: 'all 150ms ease',
    borderLeft: '2px solid transparent',
    textDecoration: 'none', width: '100%',
  }

  if (planLoading) {
    return <p className="text-[11px] px-3 py-4" style={{ color: 'var(--text-tertiary)' }}>Carregando...</p>
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between px-3 mb-1 mt-1">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: 'var(--text-tertiary)' }}>
          Agentes IA
        </p>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
          style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
          {activeAgentSlugs.length}/{allAgents.length}
        </span>
      </div>

      {activeContent.length > 0 && (
        <>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-3"
            style={{ color: 'var(--text-tertiary)' }}>Ativos</p>
          {activeContent.map(c => (
            <NavLink key={c.slug} to={`/agentes/${c.slug}/conversar`}
              style={({ isActive }) => ({
                ...navItemBase,
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderLeftColor: isActive ? 'var(--color-primary)' : 'transparent',
              })}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <c.Icon size={14} strokeWidth={1.75} className="shrink-0" />
              <span className="flex-1 truncate">{c.name}</span>
              <CheckCircle2 size={11} className="shrink-0" strokeWidth={2} style={{ color: 'var(--color-success)' }} />
            </NavLink>
          ))}
        </>
      )}

      {standaloneContent.length > 0 && (
        <>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
            style={{ color: 'var(--text-tertiary)' }}>Contratar avulso</p>
          {standaloneContent.map(c => (
            <NavLink key={c.slug} to={`/agentes/${c.slug}`}
              style={({ isActive }) => ({
                ...navItemBase,
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                borderLeftColor: isActive ? 'var(--color-primary)' : 'transparent',
              })}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              <c.Icon size={14} strokeWidth={1.75} className="shrink-0" />
              <span className="flex-1 truncate">{c.name}</span>
            </NavLink>
          ))}
        </>
      )}

      {moduleAgents.length > 0 && (
        <>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
            style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>Via módulo</p>
          {moduleAgents.map(c => (
            <div key={c.slug}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border-l-2 border-transparent cursor-default select-none"
              style={{ color: 'var(--text-tertiary)', opacity: 0.5 }}>
              <c.Icon size={14} strokeWidth={1.75} className="shrink-0" />
              <span className="flex-1 truncate text-[13px]">{c.name}</span>
              <Lock size={10} strokeWidth={2} className="shrink-0" />
            </div>
          ))}
        </>
      )}

      {exclusiveAgents.length > 0 && (
        <>
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
            style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>Plano superior</p>
          {exclusiveAgents.map(c => (
            <NavLink key={c.slug} to={`/agentes/${c.slug}`}
              style={({ isActive }) => ({
                ...navItemBase,
                background: isActive ? 'var(--bg-hover)' : 'transparent',
                color: 'var(--text-tertiary)',
                opacity: 0.5,
                borderLeftColor: 'transparent',
              })}>
              <c.Icon size={14} strokeWidth={1.75} className="shrink-0" />
              <span className="flex-1 truncate">{c.name}</span>
              <Sparkles size={10} strokeWidth={2} className="shrink-0" />
            </NavLink>
          ))}
        </>
      )}

      {activeContent.length === 0 && standaloneContent.length === 0 && moduleAgents.length === 0 && (
        <p className="text-[11px] px-3 py-4 text-center" style={{ color: 'var(--text-tertiary)' }}>
          Nenhum agente configurado
        </p>
      )}
    </div>
  )
}

// ── Sub-painel: MÓDULOS ──────────────────────────────────────────────────────

function ModulosSubPanel() {
  return (
    <div className="space-y-0.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-3"
        style={{ color: 'var(--text-tertiary)' }}>Módulos add-on</p>
      {MODULES_CONTENT.map(mod => (
        <NavLink
          key={mod.id}
          to={`/modulos/${mod.id}`}
          title="Fale com consultor para ativar"
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 12px', borderRadius: 8, transition: 'all 150ms ease',
            borderLeft: '2px solid transparent',
            background: isActive ? 'var(--bg-hover)' : 'transparent',
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            borderLeftColor: isActive ? 'var(--color-primary)' : 'transparent',
            textDecoration: 'none',
          })}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <mod.Icon size={14} strokeWidth={1.75} className="shrink-0 opacity-70" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium leading-tight truncate">{mod.name}</p>
            <p className="text-[10px] leading-tight" style={{ color: 'var(--text-tertiary)' }}>
              {mod.price.replace('/mês', '')}
            </p>
          </div>
          <Lock size={10} className="shrink-0 opacity-25" strokeWidth={2} />
        </NavLink>
      ))}
    </div>
  )
}

// ── Sub-painel: CONFIGURAÇÕES ────────────────────────────────────────────────

function ConfigSubPanel() {
  const navItemBase: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '6px 12px', fontSize: 13, fontWeight: 500,
    borderRadius: 8, transition: 'all 150ms ease',
    borderLeft: '2px solid transparent',
    textDecoration: 'none', width: '100%',
  }

  const ConfigLink = ({ to, label }: { to: string; label: string }) => (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        ...navItemBase,
        background: isActive ? 'var(--bg-hover)' : 'transparent',
        color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
        borderLeftColor: isActive ? 'var(--color-primary)' : 'transparent',
      })}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
    >
      <ChevronRight size={12} strokeWidth={2} className="shrink-0 opacity-40" />
      <span>{label}</span>
    </NavLink>
  )

  const InactiveLink = ({ label }: { label: string }) => (
    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg border-l-2 border-transparent cursor-default select-none"
      style={{ color: 'var(--text-tertiary)', opacity: 0.4 }}>
      <ChevronRight size={12} strokeWidth={2} className="shrink-0" />
      <span className="flex-1 text-[13px]">{label}</span>
      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
        style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)' }}>
        Em breve
      </span>
    </div>
  )

  return (
    <div className="space-y-0.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-3"
        style={{ color: 'var(--text-tertiary)' }}>Identidade</p>
      <ConfigLink to="/configuracoes/dados"      label="Dados da Igreja" />
      <ConfigLink to="/configuracoes/identidade" label="Branding" />

      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
        style={{ color: 'var(--text-tertiary)' }}>Equipe</p>
      <ConfigLink to="/configuracoes/usuarios" label="Usuários e Permissões" />

      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
        style={{ color: 'var(--text-tertiary)' }}>Assinatura</p>
      <ConfigLink to="/configuracoes/plano"   label="Plano e Cobrança" />
      <ConfigLink to="/configuracoes/modulos" label="Módulos e Add-ons" />

      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
        style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>Integrações</p>
      <InactiveLink label="Integrações" />

      <p className="text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-4"
        style={{ color: 'var(--text-tertiary)', opacity: 0.7 }}>Operacional</p>
      <InactiveLink label="Automações" />
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

interface SidebarProps {
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

export default function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const { user, role } = useAuth()
  const logout = useLogout()
  const location = useLocation()
  const { allAgents, activeAgentSlugs, hasAgent, isLoading: planLoading, planSlug } = usePlan()
  const { data: church } = useChurch()

  const enabledModules = church?.enabled_modules ?? DEFAULT_MODULES

  const [activeCategory, setActiveCategory] = useState<Category>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Category | null
    return stored ?? inferCategory(location.pathname)
  })

  useEffect(() => {
    const inferred = inferCategory(location.pathname)
    setActiveCategory(inferred)
    localStorage.setItem(STORAGE_KEY, inferred)
  }, [location.pathname])

  function handleSelectCategory(cat: Category) {
    setActiveCategory(cat)
    localStorage.setItem(STORAGE_KEY, cat)
  }

  function handleLogout() {
    onMobileClose?.()
    logout()
  }

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name  as string | undefined) ??
    user?.email?.split('@')[0] ?? 'Usuário'

  const SUBPANEL_HEADER: Record<Category, string> = {
    igreja:  church?.name ?? 'Igreja',
    agentes: 'Agentes IA',
    modulos: 'Módulos',
    config:  'Configurações',
  }

  const sidebarContent = (
    <>
      {/* Rail 64px */}
      <SidebarRail
        active={activeCategory}
        onSelect={handleSelectCategory}
        churchLogoUrl={church?.logo_url ?? undefined}
        churchName={church?.name ?? undefined}
        onLogout={handleLogout}
      />

      {/* Sub-painel 240px */}
      <div
        className="flex flex-col h-full overflow-hidden"
        style={{
          width: 240,
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-default)',
        }}
      >
        {/* Header do sub-painel */}
        <div
          className="px-4 h-16 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid var(--border-default)' }}
        >
          <span className="text-[11px] font-bold uppercase tracking-widest truncate"
            style={{ color: 'var(--text-tertiary)' }}>
            {SUBPANEL_HEADER[activeCategory]}
          </span>
          {activeCategory === 'agentes' && !planLoading && (
            <span className="text-[9px] font-semibold ml-2 shrink-0"
              style={{ color: 'var(--text-tertiary)' }}>
              {activeAgentSlugs.length}/{allAgents.length}
            </span>
          )}
          {activeCategory === 'config' && role && (
            <span className="text-[9px] font-semibold ml-2 shrink-0"
              style={{ color: 'var(--text-tertiary)' }}>
              {ROLE_LABELS[role]}
            </span>
          )}
        </div>

        {/* Conteúdo scrollável */}
        <nav className="flex-1 overflow-y-auto sidebar-scroll px-2 py-3">
          {activeCategory === 'igreja'  && <IgrejaSubPanel role={role} enabledModules={enabledModules} />}
          {activeCategory === 'agentes' && (
            <AgentesSubPanel allAgents={allAgents} hasAgent={hasAgent}
              activeAgentSlugs={activeAgentSlugs} planSlug={planSlug} planLoading={planLoading} />
          )}
          {activeCategory === 'modulos' && <ModulosSubPanel />}
          {activeCategory === 'config'  && <ConfigSubPanel />}
        </nav>

        {/* Rodapé: nome + role */}
        <div className="px-4 py-3 shrink-0" style={{ borderTop: '1px solid var(--border-default)' }}>
          <p className="text-[12px] font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {displayName}
          </p>
          {role && (
            <p className="text-[10px] truncate" style={{ color: 'var(--text-tertiary)' }}>
              {ROLE_LABELS[role]}
            </p>
          )}
        </div>
      </div>
    </>
  )

  return (
    <>
      {/* Desktop: sidebar inline */}
      <aside className="hidden md:flex h-screen sticky top-0 shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile: drawer overlay */}
      {isMobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/50"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside className="md:hidden fixed left-0 top-0 bottom-0 z-50 flex" style={{ width: 304 }}>
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  )
}
