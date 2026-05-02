/**
 * navigation.ts — Configuração centralizada da navegação do CRM Pastoral
 *
 * Fase 1: 4 camadas — IGREJA | AGENTES IA | MÓDULOS | CONTA
 *
 * Regra de design:
 *  - IGREJA: módulos operacionais do CRM (acessados por role + enabled_modules)
 *  - AGENTES IA: agentes comprados na subscription
 *  - MÓDULOS: add-ons pagos separados (Volunteer, Kids, Financeiro Pro)
 *  - CONTA: configurações + logout
 */

import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  Users2,
  HandHeart,
  Heart,
  GitBranch,
  Network,
  Building2,
  Wallet,
  Calendar,
  CalendarDays,
  ShieldCheck,
  MessageSquare,
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

// ── Itens da categoria IGREJA ─────────────────────────────────────────────────
//
// Removidos do primeiro nível (Fase 1):
//   - Aniversários → subtela de Pessoas
//   - Voluntários  → MÓDULOS Volunteer
//   - Escalas      → MÓDULOS Volunteer

export const IGREJA_NAV: NavItem[] = [
  { path: '/dashboard',   label: 'Painel',      Icon: LayoutDashboard, moduleKey: null          },
  { path: '/pessoas',     label: 'Pessoas',     Icon: Users,           moduleKey: 'pessoas'     },
  { path: '/lideres',      label: 'Líderes',      Icon: Users2,     moduleKey: 'pessoas'  },
  { path: '/voluntarios',  label: 'Voluntários',  Icon: HandHeart,  moduleKey: 'pessoas'  },
  { path: '/consolidacao', label: 'Consolidação', Icon: Heart,      moduleKey: 'pipeline' },
  { path: '/pipeline',    label: 'Discipulado', Icon: GitBranch,       moduleKey: 'pipeline'    },
  { path: '/celulas',     label: 'Células',     Icon: Network,         moduleKey: 'celulas'     },
  { path: '/ministerios', label: 'Ministérios', Icon: Building2,       moduleKey: 'ministerios' },
  { path: '/agenda',      label: 'Calendário',  Icon: Calendar,        moduleKey: 'agenda'      },
  { path: '/eventos',     label: 'Eventos',     Icon: CalendarDays,    moduleKey: 'agenda'      },
  { path: '/gabinete',    label: 'Gabinete',    Icon: ShieldCheck,     moduleKey: 'gabinete'    },
  { path: '/financeiro',  label: 'Financeiro',  Icon: Wallet,          moduleKey: 'financeiro'  },
  { path: '/conversas',  label: 'Conversas',   Icon: MessageSquare,   moduleKey: null           },
]

// ── Módulos add-on — sempre bloqueados até Fase 4 ─────────────────────────────
//
// Fase 4: implementar compra (Stripe) + sub-sidebar
// Fase 3: manter lock com tooltip "Em breve"

export const MODULE_ADDONS: ModuleAddon[] = [
  {
    id:          'volunteer',
    label:       'Volunteer',
    price:       'R$ 289,90',
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
