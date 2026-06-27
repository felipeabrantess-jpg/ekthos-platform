/**
 * navigation.ts — Configuração centralizada da navegação do CRM Pastoral
 *
 * Fase 1 (atual):
 *  - TRONCO: módulos CRM core (acessados por role + enabled_modules key)
 *  - BRAÇO Volunteer Pro: VOLUNTEER_PRO_NAV (moduleKey: 'volunteer-pro')
 *  - AGENTES IA: agentes comprados na subscription
 *  - MÓDULOS: add-ons pagos (Volunteer, Kids, Financeiro Pro)
 *  - CONTA: configurações + logout
 */

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  Users2,
  HandHeart,
  Heart,
  HeartHandshake,
  GitBranch,
  Network,
  Building2,
  Wallet,
  Calendar,
  CalendarDays,
  ShieldCheck,
  MessageSquare,
  ClipboardList,
  Megaphone,
  GraduationCap,
  Briefcase,
  Baby,
} from 'lucide-react'

// ── Tipos ────────────────────────────────────────────────────────────────────

export interface NavItem {
  path:      string
  label:     string
  Icon:      LucideIcon
  /** null = sempre visível independente de enabled_modules */
  moduleKey: string | null
}

export interface ModuleAddon {
  id:          string
  label:       string
  price:       string
  description: string
}

// ── Itens da categoria IGREJA (TRONCO CRM) ───────────────────────────────────
//
// Removidos do primeiro nível (Fase 1):
//   - Aniversários → subtela de Pessoas
//   - Voluntários  → BRAÇO Volunteer Pro (VOLUNTEER_PRO_NAV)
//   - Escalas      → BRAÇO Volunteer Pro (VOLUNTEER_PRO_NAV)

export const IGREJA_NAV: NavItem[] = [
  { path: '/dashboard',   label: 'Painel',      Icon: LayoutDashboard, moduleKey: null          },
  { path: '/pessoas',     label: 'Pessoas',     Icon: Users,           moduleKey: 'pessoas'     },
  { path: '/lideres',      label: 'Líderes',     Icon: Users2,          moduleKey: 'pessoas'     },
  { path: '/consolidacao', label: 'Consolidação', Icon: Heart,          moduleKey: 'pipeline'    },
  { path: '/pipeline',    label: 'Discipulado', Icon: GitBranch,        moduleKey: 'pipeline'    },
  { path: '/celulas',     label: 'Células',     Icon: Network,          moduleKey: 'celulas'     },
  { path: '/ministerios', label: 'Ministérios', Icon: Building2,        moduleKey: 'ministerios' },
  { path: '/kids',        label: 'Kids',        Icon: Baby,             moduleKey: null           },
  { path: '/agenda',      label: 'Calendário',  Icon: Calendar,         moduleKey: 'agenda'      },
  { path: '/eventos',     label: 'Eventos',     Icon: CalendarDays,     moduleKey: 'agenda'      },
  { path: '/cursos',       label: 'Cursos',           Icon: GraduationCap, moduleKey: 'agenda' },
  { path: '/empresarios', label: 'Rede de Negócios', Icon: Briefcase,   moduleKey: null     },
  { path: '/oracao',     label: 'Pedidos de Oração', Icon: Heart,       moduleKey: null          },
  { path: '/gabinete',    label: 'Gabinete',    Icon: ShieldCheck,      moduleKey: 'gabinete'    },
  { path: '/cuidado',          label: 'Cuidado',              Icon: HeartHandshake,   moduleKey: null          },
  { path: '/culto/relatorios', label: 'Relatórios de Culto', Icon: ClipboardList,    moduleKey: null          },
  { path: '/financeiro',       label: 'Financeiro',           Icon: Wallet,           moduleKey: 'financeiro'  },
  { path: '/conversas',  label: 'Conversas',   Icon: MessageSquare,    moduleKey: null           },
  { path: '/campanha',   label: 'Campanha',    Icon: Megaphone,        moduleKey: null           },
]

// ── Itens do BRAÇO Volunteer Pro ──────────────────────────────────────────────
// Estas rotas SÓ aparecem quando church.enabled_modules['volunteer-pro'] === true
// moduleKey: 'volunteer-pro' — guard na Sidebar e em ModuleRoute no App.tsx

export const VOLUNTEER_PRO_NAV: NavItem[] = [
  { path: '/volunteer/voluntarios', label: 'Voluntários', Icon: HandHeart,     moduleKey: 'volunteer-pro' },
  { path: '/volunteer/escalas',     label: 'Escalas',     Icon: CalendarDays,  moduleKey: 'volunteer-pro' },
  { path: '/volunteer/relatorios',  label: 'Relatórios',  Icon: ClipboardList, moduleKey: 'volunteer-pro' },
]

// ── Módulos add-on — sempre bloqueados até Fase 4 ─────────────────────────────
//
// Fase 4: implementar compra (Stripe) + sub-sidebar
// Fase 3: manter lock com tooltip "Em breve"

export const MODULE_ADDONS: ModuleAddon[] = [
  {
    id:          'volunteer',
    label:       'Volunteer Pro',
    price:       'R$ 890,00',
    description: 'Gestão de voluntários e escalas de serviço',
  },
  {
    id:          'kids',
    label:       'Kids',
    price:       'R$ 349,90',
    description: 'Ministério infantil — presença e turmas',
  },
  {
    id:          'financeiro-pro',
    label:       'Financeiro Pro',
    price:       'R$ 489,90',
    description: 'Relatórios avançados, centros de custo e automações',
  },
]
