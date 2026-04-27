/**
 * Sidebar.tsx — Redesign Fase 1
 *
 * Estrutura: 4 categorias
 *   1. IGREJA     — módulos CRM (role-based + enabled_modules)
 *   2. AGENTES IA — agentes ativos da subscription
 *   3. MÓDULOS    — add-ons pagos (sempre bloqueados até Fase 4)
 *   4. CONTA      — configurações + logout
 */

import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { Lock, Bot, Settings, LogOut, Sparkles } from 'lucide-react'
import { useAuth, useLogout } from '@/hooks/useAuth'
import { ROUTE_PERMISSIONS, ROLE_LABELS } from '@/hooks/useRole'
import NotificationBell from '@/features/notifications/components/NotificationBell'
import { AgentChatButton } from './AgentChatWidget'
import { usePlan } from '@/hooks/usePlan'
import { useChurch, DEFAULT_MODULES } from '@/hooks/useChurch'
import { IGREJA_NAV, MODULE_ADDONS } from '@/lib/navigation'

// ── Helpers visuais ─────────────────────────────────────────────────────────

const SECTION_LABEL = 'text-[10px] font-semibold uppercase tracking-widest px-3 mb-1.5 mt-1'
const SECTION_COLOR = { color: 'rgba(249,238,220,0.3)' }

const NAV_BASE = 'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-all duration-150 rounded-lg border-l-[3px]'
const NAV_ACTIVE = 'text-white bg-white/[0.06] rounded-r-lg'
const NAV_IDLE   = 'text-white/50 border-transparent hover:text-white/80 hover:bg-white/[0.04]'

// ── Componente ──────────────────────────────────────────────────────────────

export default function Sidebar() {
  const { user, role } = useAuth()
  const logout = useLogout()
  const { allAgents, activeAgentSlugs, hasAgent, isLoading: planLoading } = usePlan()
  const { data: church } = useChurch()

  // Estado para tooltip dos módulos bloqueados
  const [hoveredModule, setHoveredModule] = useState<string | null>(null)

  const enabledModules = church?.enabled_modules ?? DEFAULT_MODULES

  // Agentes ativos, ordenados por tier
  const sidebarAgents = allAgents
    .filter(a => hasAgent(a.slug))
    .sort((a, b) => {
      const tierOrder = { free: 0, always_paid: 1, eligible: 2 }
      const tDiff = (tierOrder[a.pricing_tier] ?? 2) - (tierOrder[b.pricing_tier] ?? 2)
      return tDiff !== 0 ? tDiff : a.name.localeCompare(b.name, 'pt-BR')
    })

  // Filtra itens de IGREJA por role
  const roleFilteredItems = IGREJA_NAV.filter(item => {
    if (!role) return false
    const allowed = ROUTE_PERMISSIONS[item.path]
    return allowed?.includes(role) ?? true
  })

  // Separa habilitados e desabilitados por enabled_modules
  const enabledItems  = roleFilteredItems.filter(i => !i.moduleKey || enabledModules[i.moduleKey] !== false)
  const disabledItems = roleFilteredItems.filter(i => i.moduleKey && enabledModules[i.moduleKey] === false)

  // Display name e inicial do avatar
  const displayName =
    (user?.user_metadata?.full_name as string | undefined) ??
    (user?.user_metadata?.name  as string | undefined) ??
    user?.email?.split('@')[0] ?? 'Usuário'
  const initial = displayName.charAt(0).toUpperCase()

  return (
    <aside
      className="w-64 flex flex-col h-screen sticky top-0 shrink-0"
      style={{ background: '#161616' }}
    >
      {/* ── Topo: branding + sino ──────────────────────────────────── */}
      <div className="px-5 py-5 flex items-center justify-between border-b border-white/5">
        {church?.logo_url ? (
          <img
            src={church.logo_url}
            alt={church.name}
            className="h-8 w-auto object-contain max-w-[130px]"
          />
        ) : church?.name ? (
          <span
            className="font-display text-base font-bold truncate max-w-[130px]"
            style={{ color: 'var(--church-primary, #e13500)' }}
          >
            {church.name}
          </span>
        ) : (
          <img
            src="/logo/ekthos-church-200.png"
            alt="Ekthos Church"
            className="h-8 w-auto object-contain max-w-[130px]"
            onError={e => {
              const el = e.currentTarget as HTMLImageElement
              el.style.display = 'none'
            }}
          />
        )}
        <NotificationBell />
      </div>

      {/* ── Navegação (scrollável) ──────────────────────────────────── */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto sidebar-scroll space-y-0.5">

        {/* ─── 1. IGREJA ──────────────────────────────────────────── */}
        <p className={SECTION_LABEL} style={SECTION_COLOR}>Igreja</p>

        {enabledItems.map(({ path, label, Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `${NAV_BASE} ${isActive ? NAV_ACTIVE : NAV_IDLE}`
            }
            style={({ isActive }) =>
              isActive ? { borderColor: 'var(--church-primary, #e13500)' } : {}
            }
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}

        {/* Módulos desabilitados da igreja (enabled_modules = false) */}
        {disabledItems.map(({ path, label, Icon }) => (
          <div
            key={path}
            className={`group relative ${NAV_BASE} cursor-default select-none border-transparent`}
            style={{ color: 'rgba(255,255,255,0.2)' }}
            title="Ative nas Configurações"
          >
            <span className="opacity-40"><Icon size={16} strokeWidth={1.75} /></span>
            <span className="flex-1 opacity-40">{label}</span>
            <Lock size={11} strokeWidth={2} style={{ color: 'rgba(255,255,255,0.25)', flexShrink: 0 }} />
            {/* Tooltip */}
            <div
              className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white whitespace-nowrap pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' }}
            >
              Ative nas Configurações
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent" style={{ borderRightColor: '#161616' }} />
            </div>
          </div>
        ))}

        {/* ─── 2. AGENTES IA ──────────────────────────────────────── */}
        <div className="pt-4">
          <div className="flex items-center justify-between px-3 mb-1.5">
            <p className={SECTION_LABEL.replace('px-3 mb-1.5 mt-1', '')} style={SECTION_COLOR}>
              Agentes IA
            </p>
            {/* Contador: ativos / total no catálogo */}
            {!planLoading && (
              <span
                className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(249,238,220,0.5)' }}
              >
                {activeAgentSlugs.length}/{allAgents.length}
              </span>
            )}
          </div>

          <div className="overflow-y-auto sidebar-scroll" style={{ maxHeight: '180px' }}>
            {planLoading && (
              <p className="text-[11px] px-3 py-1" style={{ color: 'rgba(249,238,220,0.3)' }}>
                Carregando...
              </p>
            )}
            {!planLoading && sidebarAgents.length === 0 && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg"
                style={{ color: 'rgba(249,238,220,0.25)' }}
              >
                <Bot size={14} strokeWidth={1.75} />
                <span className="text-[11px]">Nenhum agente ativo</span>
              </div>
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

        {/* ─── 3. MÓDULOS ─────────────────────────────────────────── */}
        <div className="pt-4">
          <p className={SECTION_LABEL} style={SECTION_COLOR}>Módulos</p>

          {/* TODO Fase 4: substituir por lógica de compra + sub-sidebar */}
          {MODULE_ADDONS.map(mod => (
            <div
              key={mod.id}
              className="group relative"
              onMouseEnter={() => setHoveredModule(mod.id)}
              onMouseLeave={() => setHoveredModule(null)}
            >
              <div
                className={`${NAV_BASE} border-transparent cursor-default select-none`}
                style={{ color: 'rgba(255,255,255,0.25)' }}
              >
                <Sparkles size={16} strokeWidth={1.75} className="opacity-40" />
                <span className="flex-1 opacity-40 text-sm">{mod.label}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-[10px] font-semibold" style={{ color: 'rgba(249,238,220,0.3)' }}>
                    {mod.price}
                  </span>
                  <Lock size={11} strokeWidth={2} style={{ color: 'rgba(255,255,255,0.2)' }} />
                </div>
              </div>

              {/* Tooltip "Em breve" */}
              {hoveredModule === mod.id && (
                <div
                  className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-3 py-2 rounded-xl text-[11px] font-medium text-white whitespace-nowrap pointer-events-none"
                  style={{ background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', minWidth: '180px' }}
                >
                  <p className="font-semibold text-white/90 mb-0.5">{mod.label} — Em breve</p>
                  <p className="text-white/50">{mod.price}/mês</p>
                  <p className="text-white/30 text-[10px] mt-1 leading-tight">{mod.description}</p>
                  <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent" style={{ borderRightColor: '#1f1f1f' }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </nav>

      {/* ── 4. CONTA (rodapé fixo) ──────────────────────────────────── */}
      <div className="border-t border-white/5 px-3 py-3">
        <p className={SECTION_LABEL} style={SECTION_COLOR}>Conta</p>

        {/* Avatar + nome + role */}
        <div className="flex items-center gap-3 px-3 py-2 mb-1">
          <div
            className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
            style={{ background: 'var(--church-primary, #e13500)', color: '#fff' }}
          >
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium truncate" style={{ color: 'rgba(249,238,220,0.85)' }}>
              {displayName}
            </p>
            {role && (
              <p className="text-[10px] truncate" style={{ color: 'rgba(249,238,220,0.35)' }}>
                {ROLE_LABELS[role]}
              </p>
            )}
          </div>
        </div>

        {/* Configurações */}
        <NavLink
          to="/settings/billing"
          className={({ isActive }) =>
            `${NAV_BASE} ${isActive ? NAV_ACTIVE : NAV_IDLE}`
          }
          style={({ isActive }) =>
            isActive ? { borderColor: 'var(--church-primary, #e13500)' } : {}
          }
        >
          <Settings size={16} strokeWidth={1.75} />
          Configurações
        </NavLink>

        {/* Sair */}
        <button
          onClick={logout}
          className={`w-full text-left ${NAV_BASE} border-transparent`}
          style={{ color: 'rgba(255,255,255,0.4)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.7)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.4)')}
        >
          <LogOut size={16} strokeWidth={1.75} />
          Sair
        </button>
      </div>
    </aside>
  )
}
