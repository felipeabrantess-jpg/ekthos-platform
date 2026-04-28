/**
 * Sidebar.tsx — Rail + Sub-sidebar contextual
 *
 * Arquitetura premium inspirada em Linear / Notion / Stripe.
 *
 * ┌──────┬──────────────────────┐
 * │ RAIL │  SUB-PAINEL          │
 * │ 64px │  240px               │
 * └──────┴──────────────────────┘
 *
 * Rail: 4 categorias (Igreja · Agentes IA · Módulos · Config)
 * Sub-painel: conteúdo contextual por categoria ativa
 * Estado: persiste em localStorage → ekthos_sidebar_category
 * Auto-sync: categoria inferida da URL ao navegar
 */

import { useState, useEffect } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import {
  LayoutGrid, Bot, Package, Settings, LogOut,
  CheckCircle2, Lock, ChevronRight, Sparkles,
} from 'lucide-react'
import { useAuth, useLogout } from '@/hooks/useAuth'
import { ROUTE_PERMISSIONS, ROLE_LABELS } from '@/hooks/useRole'
import NotificationBell from '@/features/notifications/components/NotificationBell'
import { AgentChatButton } from './AgentChatWidget'
import { usePlan } from '@/hooks/usePlan'
import { useChurch, DEFAULT_MODULES } from '@/hooks/useChurch'
import { IGREJA_NAV } from '@/lib/navigation'
import { AGENTS_CONTENT } from '@/lib/agents-content'
import { MODULES_CONTENT } from '@/lib/modules-content'

// ── Tipos ────────────────────────────────────────────────────────────────────

type Category = 'igreja' | 'agentes' | 'modulos' | 'config'

const STORAGE_KEY = 'ekthos_sidebar_category'

// ── Inferir categoria a partir da URL ────────────────────────────────────────

function inferCategory(pathname: string): Category {
  if (pathname.startsWith('/agentes')) return 'agentes'
  if (pathname.startsWith('/modulos')) return 'modulos'
  if (pathname.startsWith('/configuracoes') || pathname.startsWith('/settings')) return 'config'
  return 'igreja'
}

// ── Estilos ──────────────────────────────────────────────────────────────────

const NAV_ITEM = 'flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-lg transition-all duration-150'
const NAV_ACTIVE = 'bg-white/[0.07] text-white border-l-2'
const NAV_IDLE = 'text-white/45 border-l-2 border-transparent hover:text-white/70 hover:bg-white/[0.04]'

const SECTION_LABEL = 'text-[9px] font-bold uppercase tracking-[0.15em] px-3 mb-1 mt-3 select-none'
const SECTION_COLOR = { color: 'rgba(249,238,220,0.25)' }

// ── Rail (64px) ──────────────────────────────────────────────────────────────

const RAIL_ITEMS: { id: Category; Icon: typeof LayoutGrid; label: string }[] = [
  { id: 'igreja',  Icon: LayoutGrid, label: 'Igreja'     },
  { id: 'agentes', Icon: Bot,        label: 'Agentes IA' },
  { id: 'modulos', Icon: Package,    label: 'Módulos'    },
  { id: 'config',  Icon: Settings,   label: 'Config.'    },
]

interface RailProps {
  active: Category
  onSelect: (c: Category) => void
  churchLogoUrl?: string
  churchName?: string
  userInitial: string
  onLogout: () => void
}

function SidebarRail({ active, onSelect, churchLogoUrl, churchName, userInitial, onLogout }: RailProps) {
  return (
    <div
      className="flex flex-col h-full shrink-0"
      style={{ width: 64, background: '#0f0f0f', borderRight: '1px solid rgba(255,255,255,0.04)' }}
    >
      {/* Logo da igreja */}
      <div className="flex items-center justify-center h-16 shrink-0 border-b border-white/[0.04]">
        {churchLogoUrl ? (
          <img src={churchLogoUrl} alt={churchName ?? ''} className="h-8 w-8 object-contain rounded-lg" />
        ) : (
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center font-display font-bold text-sm"
            style={{ background: 'var(--church-primary, #e13500)', color: '#fff' }}
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
                className="flex items-center justify-center rounded-xl transition-all duration-150"
                style={{
                  width: 40, height: 40,
                  background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.35)',
                  borderRight: isActive ? '2px solid var(--church-primary, #e13500)' : '2px solid transparent',
                }}
                onMouseEnter={e => {
                  if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.7)'
                }}
                onMouseLeave={e => {
                  if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.35)'
                }}
              >
                <Icon size={18} strokeWidth={1.75} />
              </button>
              {/* Tooltip */}
              <div
                className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-2 py-1 rounded-md text-[11px] font-medium text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                {label}
              </div>
            </div>
          )
        })}
      </nav>

      {/* Rodapé: avatar + sino + logout */}
      <div className="flex flex-col items-center gap-2 pb-3 border-t border-white/[0.04] pt-3">
        <NotificationBell />
        <div
          className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
          style={{ background: 'var(--church-primary, #e13500)', color: '#fff' }}
          title="Perfil"
        >
          {userInitial}
        </div>
        <button
          onClick={onLogout}
          className="flex items-center justify-center rounded-lg transition-all"
          style={{ width: 32, height: 32, color: 'rgba(255,255,255,0.25)' }}
          title="Sair"
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.6)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
        >
          <LogOut size={15} strokeWidth={1.75} />
        </button>
      </div>
    </div>
  )
}

// ── Sub-painel: IGREJA ───────────────────────────────────────────────────────

interface IgrejaSubProps {
  role: string | null
  enabledModules: Record<string, boolean>
}

function IgrejaSubPanel({ role, enabledModules }: IgrejaSubProps) {
  const roleFilteredItems = IGREJA_NAV.filter(item => {
    if (!role) return false
    const allowed = ROUTE_PERMISSIONS[item.path]
    return allowed?.includes(role) ?? true
  })

  const enabledItems  = roleFilteredItems.filter(i => !i.moduleKey || enabledModules[i.moduleKey] !== false)
  const disabledItems = roleFilteredItems.filter(i => i.moduleKey && enabledModules[i.moduleKey] === false)

  return (
    <div className="space-y-0.5">
      <p className={SECTION_LABEL} style={SECTION_COLOR}>Principal</p>
      {enabledItems.map(({ path, label, Icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            `${NAV_ITEM} ${isActive ? NAV_ACTIVE : NAV_IDLE}`
          }
          style={({ isActive }) =>
            isActive ? { borderColor: 'var(--church-primary, #e13500)' } : {}
          }
        >
          <Icon size={15} strokeWidth={1.75} className="shrink-0" />
          <span>{label}</span>
        </NavLink>
      ))}

      {disabledItems.length > 0 && (
        <>
          <p className={SECTION_LABEL} style={{ ...SECTION_COLOR, marginTop: 16 }}>Desabilitados</p>
          {disabledItems.map(({ path, label, Icon }) => (
            <div
              key={path}
              className={`${NAV_ITEM} border-l-2 border-transparent cursor-default select-none`}
              style={{ color: 'rgba(255,255,255,0.15)' }}
              title="Ative nas Configurações"
            >
              <Icon size={15} strokeWidth={1.75} className="shrink-0 opacity-40" />
              <span className="opacity-40">{label}</span>
              <Lock size={10} strokeWidth={2} className="ml-auto shrink-0 opacity-30" />
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

  const activeContent = AGENTS_CONTENT.filter(c => catalogSlugs.includes(c.slug) && hasAgent(c.slug))
  const standaloneContent = AGENTS_CONTENT.filter(
    c => !c.moduleId && catalogSlugs.includes(c.slug) && !hasAgent(c.slug) && !c.badge?.includes('Avivamento')
  )
  const moduleAgents = AGENTS_CONTENT.filter(c => !!c.moduleId)
  const exclusiveAgents = AGENTS_CONTENT.filter(
    c => c.badge?.includes('Avivamento') && planSlug !== 'avivamento' && !hasAgent(c.slug)
  )

  if (planLoading) {
    return <p className="text-[11px] px-3 py-4" style={{ color: 'rgba(249,238,220,0.3)' }}>Carregando...</p>
  }

  return (
    <div className="space-y-0.5">
      {/* Header contador */}
      <div className="flex items-center justify-between px-3 mb-1 mt-1">
        <p className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: 'rgba(249,238,220,0.25)' }}>
          Agentes IA
        </p>
        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(249,238,220,0.4)' }}>
          {activeAgentSlugs.length}/{allAgents.length}
        </span>
      </div>

      {/* ATIVOS — link direto para o chat */}
      {activeContent.length > 0 && (
        <>
          <p className={SECTION_LABEL} style={SECTION_COLOR}>Ativos</p>
          {activeContent.map(c => (
            <NavLink
              key={c.slug}
              to={`/agentes/${c.slug}/conversar`}
              className={({ isActive }) => `${NAV_ITEM} ${isActive ? NAV_ACTIVE : NAV_IDLE}`}
              style={({ isActive }) => isActive ? { borderColor: 'var(--church-primary, #e13500)' } : {}}
              title={`Conversar com ${c.name}`}
            >
              <c.Icon size={14} strokeWidth={1.75} className="shrink-0" />
              <span className="flex-1 truncate">{c.name}</span>
              <CheckCircle2 size={11} className="text-green-400 shrink-0" strokeWidth={2} />
            </NavLink>
          ))}
        </>
      )}

      {/* CONTRATAR AVULSO */}
      {standaloneContent.length > 0 && (
        <>
          <p className={SECTION_LABEL} style={{ ...SECTION_COLOR, marginTop: 12 }}>Contratar avulso</p>
          {standaloneContent.map(c => (
            <NavLink
              key={c.slug}
              to={`/agentes/${c.slug}`}
              className={({ isActive }) => `${NAV_ITEM} ${isActive ? NAV_ACTIVE : NAV_IDLE}`}
              style={({ isActive }) => isActive ? { borderColor: 'var(--church-primary, #e13500)' } : {}}
            >
              <c.Icon size={14} strokeWidth={1.75} className="shrink-0" />
              <span className="flex-1 truncate">{c.name}</span>
            </NavLink>
          ))}
        </>
      )}

      {/* VIA MÓDULO */}
      {moduleAgents.length > 0 && (
        <>
          <p className={SECTION_LABEL} style={{ ...SECTION_COLOR, marginTop: 12 }}>Via módulo</p>
          {moduleAgents.map(c => (
            <NavLink
              key={c.slug}
              to={`/agentes/${c.slug}`}
              className={({ isActive }) => `${NAV_ITEM} ${isActive ? NAV_ACTIVE : NAV_IDLE}`}
              style={({ isActive }) => isActive ? { borderColor: 'var(--church-primary, #e13500)' } : {}}
            >
              <c.Icon size={14} strokeWidth={1.75} className="shrink-0 opacity-50" />
              <span className="flex-1 truncate opacity-60">{c.name}</span>
              <Lock size={10} className="shrink-0 opacity-30" strokeWidth={2} />
            </NavLink>
          ))}
        </>
      )}

      {/* EXCLUSIVO PLANO SUPERIOR */}
      {exclusiveAgents.length > 0 && (
        <>
          <p className={SECTION_LABEL} style={{ ...SECTION_COLOR, marginTop: 12 }}>Plano superior</p>
          {exclusiveAgents.map(c => (
            <NavLink
              key={c.slug}
              to={`/agentes/${c.slug}`}
              className={({ isActive }) => `${NAV_ITEM} ${isActive ? NAV_ACTIVE : NAV_IDLE}`}
              style={({ isActive }) => isActive ? { borderColor: 'var(--church-primary, #e13500)' } : {}}
            >
              <c.Icon size={14} strokeWidth={1.75} className="shrink-0 opacity-50" />
              <span className="flex-1 truncate opacity-50">{c.name}</span>
              <Sparkles size={10} className="shrink-0 opacity-30" strokeWidth={2} />
            </NavLink>
          ))}
        </>
      )}

      {activeContent.length === 0 && standaloneContent.length === 0 && moduleAgents.length === 0 && (
        <p className="text-[11px] px-3 py-4 text-center" style={{ color: 'rgba(249,238,220,0.25)' }}>
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
      <p className={SECTION_LABEL} style={SECTION_COLOR}>Módulos add-on</p>
      {MODULES_CONTENT.map(mod => (
        <NavLink
          key={mod.id}
          to={`/modulos/${mod.id}`}
          title="Fale com consultor para ativar"
          className={({ isActive }) => `${NAV_ITEM} ${isActive ? NAV_ACTIVE : NAV_IDLE}`}
          style={({ isActive }) => isActive ? { borderColor: 'var(--church-primary, #e13500)' } : {}}
        >
          <mod.Icon size={14} strokeWidth={1.75} className="shrink-0 opacity-70" />
          <div className="flex-1 min-w-0">
            <p className="text-[12px] font-medium leading-tight truncate">{mod.name}</p>
            <p className="text-[10px] leading-tight" style={{ color: 'rgba(249,238,220,0.3)' }}>
              {mod.price.replace('/mês', '')}
            </p>
            <p className="text-[9px] leading-tight mt-0.5" style={{ color: 'rgba(249,238,220,0.2)' }}>
              Implementação acompanhada
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
  const GROUP_LABEL = (label: string) => (
    <p className={SECTION_LABEL} style={SECTION_COLOR}>{label}</p>
  )

  const ConfigLink = ({ to, label }: { to: string; label: string }) => (
    <NavLink
      to={to}
      className={({ isActive }) => `${NAV_ITEM} ${isActive ? NAV_ACTIVE : NAV_IDLE}`}
      style={({ isActive }) => isActive ? { borderColor: 'var(--church-primary, #e13500)' } : {}}
    >
      <ChevronRight size={12} strokeWidth={2} className="shrink-0 opacity-40" />
      <span>{label}</span>
    </NavLink>
  )

  const InactiveLink = ({ label }: { label: string }) => (
    <div
      className={`${NAV_ITEM} border-l-2 border-transparent cursor-default select-none`}
      style={{ color: 'rgba(255,255,255,0.15)' }}
    >
      <ChevronRight size={12} strokeWidth={2} className="shrink-0" />
      <span className="flex-1">{label}</span>
      <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(249,238,220,0.25)' }}>
        Em breve
      </span>
    </div>
  )

  return (
    <div className="space-y-0.5">
      {GROUP_LABEL('Identidade')}
      <ConfigLink to="/configuracoes/dados"      label="Dados da Igreja" />
      <ConfigLink to="/configuracoes/identidade" label="Branding" />

      {GROUP_LABEL('Equipe')}
      <ConfigLink to="/configuracoes/usuarios"   label="Usuários e Permissões" />

      {GROUP_LABEL('Assinatura')}
      <ConfigLink to="/configuracoes/plano"      label="Plano e Cobrança" />
      <ConfigLink to="/configuracoes/modulos"    label="Módulos e Add-ons" />

      {GROUP_LABEL('Integrações')}
      <InactiveLink label="Integrações" />

      {GROUP_LABEL('Operacional')}
      <InactiveLink label="Automações" />
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function Sidebar() {
  const { user, role } = useAuth()
  const logout = useLogout()
  const location = useLocation()
  const { allAgents, activeAgentSlugs, hasAgent, isLoading: planLoading, planSlug } = usePlan()
  const { data: church } = useChurch()

  const enabledModules = church?.enabled_modules ?? DEFAULT_MODULES

  // Estado de categoria persistido em localStorage
  const [activeCategory, setActiveCategory] = useState<Category>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Category | null
    return stored ?? inferCategory(location.pathname)
  })

  // Sincroniza categoria com URL ao navegar
  useEffect(() => {
    const inferred = inferCategory(location.pathname)
    setActiveCategory(inferred)
    localStorage.setItem(STORAGE_KEY, inferred)
  }, [location.pathname])

  function handleSelectCategory(cat: Category) {
    setActiveCategory(cat)
    localStorage.setItem(STORAGE_KEY, cat)
  }

  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name  as string | undefined) ??
    user?.email?.split('@')[0] ?? 'Usuário'
  const userInitial = displayName.charAt(0).toUpperCase()

  // Sub-painel header por categoria
  const SUBPANEL_HEADER: Record<Category, string> = {
    igreja:  church?.name ?? 'Igreja',
    agentes: 'Agentes IA',
    modulos: 'Módulos',
    config:  'Configurações',
  }

  return (
    <aside className="flex h-screen sticky top-0 shrink-0">
      {/* ── Coluna 1: Rail 64px ─────────────────────────────── */}
      <SidebarRail
        active={activeCategory}
        onSelect={handleSelectCategory}
        churchLogoUrl={church?.logo_url ?? undefined}
        churchName={church?.name ?? undefined}
        userInitial={userInitial}
        onLogout={logout}
      />

      {/* ── Coluna 2: Sub-painel 240px ──────────────────────── */}
      <div
        className="flex flex-col h-full overflow-hidden"
        style={{
          width: 240,
          background: '#161616',
          borderRight: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        {/* Header do sub-painel */}
        <div
          className="px-4 h-16 flex items-center justify-between shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
        >
          <span
            className="text-[11px] font-bold uppercase tracking-widest truncate"
            style={{ color: 'rgba(249,238,220,0.45)' }}
          >
            {SUBPANEL_HEADER[activeCategory]}
          </span>
          {/* Info extra no header */}
          {activeCategory === 'agentes' && !planLoading && (
            <span className="text-[9px] font-semibold ml-2 shrink-0" style={{ color: 'rgba(249,238,220,0.3)' }}>
              {activeAgentSlugs.length}/{allAgents.length}
            </span>
          )}
          {activeCategory === 'config' && role && (
            <span className="text-[9px] font-semibold ml-2 shrink-0" style={{ color: 'rgba(249,238,220,0.3)' }}>
              {ROLE_LABELS[role]}
            </span>
          )}
        </div>

        {/* Conteúdo scrollável */}
        <nav className="flex-1 overflow-y-auto sidebar-scroll px-2 py-3">
          {activeCategory === 'igreja' && (
            <IgrejaSubPanel role={role} enabledModules={enabledModules} />
          )}
          {activeCategory === 'agentes' && (
            <AgentesSubPanel
              allAgents={allAgents}
              hasAgent={hasAgent}
              activeAgentSlugs={activeAgentSlugs}
              planSlug={planSlug}
              planLoading={planLoading}
            />
          )}
          {activeCategory === 'modulos' && <ModulosSubPanel />}
          {activeCategory === 'config' && <ConfigSubPanel />}
        </nav>

        {/* Rodapé do sub-painel: nome + role */}
        <div
          className="px-4 py-3 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}
        >
          <p className="text-[12px] font-medium truncate" style={{ color: 'rgba(249,238,220,0.7)' }}>
            {displayName}
          </p>
          {role && (
            <p className="text-[10px] truncate" style={{ color: 'rgba(249,238,220,0.3)' }}>
              {ROLE_LABELS[role]}
            </p>
          )}
        </div>
      </div>
    </aside>
  )
}
