/**
 * SettingsLayout.tsx — /configuracoes
 *
 * Layout com tabs verticais para a área de configurações reestruturada.
 *
 * Tabs:
 *  - Dados         → /configuracoes/dados      (dados básicos da igreja)
 *  - Identidade    → /configuracoes/identidade (cores e logo — usa Branding existente)
 *  - Plano         → /configuracoes/plano      (assinatura e faturamento)
 *  - Usuários      → /configuracoes/usuarios   (equipe com acesso)
 *  - Módulos       → /configuracoes/modulos    (módulos add-on)
 */

import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { Building2, Palette, CreditCard, Users, Package } from 'lucide-react'

const TABS = [
  { path: 'dados',       label: 'Dados',      Icon: Building2,   description: 'Nome, endereço e CNPJ' },
  { path: 'identidade',  label: 'Identidade', Icon: Palette,     description: 'Logo e cores da Igreja' },
  { path: 'plano',       label: 'Plano',      Icon: CreditCard,  description: 'Assinatura e faturamento' },
  { path: 'usuarios',    label: 'Usuários',   Icon: Users,       description: 'Equipe com acesso ao sistema' },
  { path: 'modulos',     label: 'Módulos',    Icon: Package,     description: 'Add-ons pagos' },
]

export function ConfiguracoesLayout() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-bold text-ekthos-black">Configurações</h1>
        <p className="text-sm text-ekthos-black/50 mt-1">Gerencie sua Igreja, equipe e assinatura</p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Sidebar de tabs vertical */}
        <nav className="w-52 shrink-0 space-y-0.5">
          {TABS.map(tab => (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={({ isActive }) =>
                `flex items-start gap-3 px-3 py-2.5 rounded-xl transition-all ${
                  isActive
                    ? 'bg-brand-50 border border-brand-100 text-brand-800'
                    : 'text-ekthos-black/60 hover:text-ekthos-black hover:bg-cream-dark/40'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <tab.Icon
                    size={16}
                    strokeWidth={1.75}
                    className={`mt-0.5 shrink-0 ${isActive ? 'text-brand-600' : 'text-ekthos-black/40'}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{tab.label}</p>
                    <p className="text-[10px] text-ekthos-black/40 mt-0.5 leading-tight truncate">{tab.description}</p>
                  </div>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Conteúdo da tab selecionada */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}

/** Rota index — redireciona para Dados */
export function ConfiguracoesIndex() {
  return <Navigate to="dados" replace />
}
