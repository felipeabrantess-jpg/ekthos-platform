/**
 * modules-content.ts — Conteúdo enriquecido dos módulos pagos
 *
 * Volunteer Pro, Kids Pro e Financeiro Pro.
 * Futuramente migrado para o banco.
 *
 * REGRA: "Testar 7 dias grátis" está DESABILITADO (placeholder Fase 6).
 * REGRA: Financeiro Pro é consultivo — sem botão de compra.
 * REGRA: WhatsApp/Z-API fora do escopo (não listar aqui).
 */

import type { LucideIcon } from 'lucide-react'
import { Users, Shield, BookOpen, CalendarRange, Heart, Mail, DollarSign } from 'lucide-react'

export interface ModuleFeature {
  label:       string
  description: string
}

export interface ModuleAgentEntry {
  slug:       string
  name:       string
  included:   boolean   // true = incluso; false = add-on (+R$ 149,90/mês)
  Icon:       LucideIcon
}

export interface ModuleContent {
  id:          string          // volunteer-pro | kids-pro | financeiro-pro
  name:        string
  tagline:     string          // 1 linha de impacto
  price:       string          // ex: "R$ 289,90/mês"
  priceCents:  number
  Icon:        LucideIcon
  forWhom:     string          // parágrafo "Para quem"
  problems:    string[]        // 3-4 problemas que resolve
  features:    ModuleFeature[] // o que inclui (funcionalidades)
  agents:      ModuleAgentEntry[]
  /** se true, não exibe botão de compra — apenas info + "entre em contato" */
  consultive?: boolean
}

export const MODULES_CONTENT: ModuleContent[] = [
  // ── Volunteer Pro ────────────────────────────────────────────────────────
  {
    id:         'volunteer-pro',
    name:       'Volunteer Pro',
    tagline:    'Gestão completa de voluntários — da escala à valorização.',
    price:      'R$ 289,90/mês',
    priceCents: 28990,
    Icon:       Users,
    forWhom:    'Igrejas com 15 ou mais voluntários ativos e equipe de coordenação que perde horas toda semana montando escalas, confirmando presenças e gerenciando substituições de última hora.',
    problems: [
      'Escala montada na mão toda semana, com risco de esquecimentos e faltas',
      'Confirmações de voluntários via WhatsApp pessoal do coordenador',
      'Sem histórico de frequência — impossível valorizar quem mais serve',
      'Substituições de último minuto sem controle centralizado',
    ],
    features: [
      { label: 'Gestão de voluntários',    description: 'Cadastro completo com funções, disponibilidade e histórico de serviço' },
      { label: 'Montagem automática de escalas', description: 'A IA considera disponibilidade, função e histórico para montar a escala ideal' },
      { label: 'Confirmações via WhatsApp', description: 'Cada voluntário recebe confirmação individual; aceites e recusas atualizados em tempo real' },
      { label: 'Gestão de substituições',  description: 'Trocas e substituições gerenciadas automaticamente, sem intervenção do coordenador' },
      { label: 'Relatórios de frequência', description: 'Histórico completo de presença e ausências por voluntário e por função' },
      { label: 'Valorização automática',   description: 'Mensagens de reconhecimento em datas especiais e marcos de serviço' },
    ],
    agents: [
      { slug: 'agent-escalas',     name: 'Agente Escalas',     included: true,  Icon: CalendarRange },
      { slug: 'agent-voluntarios', name: 'Agente Voluntários', included: false, Icon: Heart         },
    ],
  },

  // ── Kids Pro ─────────────────────────────────────────────────────────────
  {
    id:         'kids-pro',
    name:       'Kids Pro',
    tagline:    'Segurança e cuidado pastoral para cada criança do ministério.',
    price:      'R$ 349,90/mês',
    priceCents: 34990,
    Icon:       Shield,
    forWhom:    'Igrejas com ministério infantil ativo que precisam garantir a segurança no check-in/checkout, acompanhar o desenvolvimento espiritual das crianças e manter os pais engajados durante a semana.',
    problems: [
      'Controle de check-in/checkout manual — risco de entrega errada',
      'Sem registro de desenvolvimento espiritual de cada criança',
      'Pais desinformados sobre o que acontece nas aulas infantis',
      'Professores sem histórico das turmas para se preparar',
    ],
    features: [
      { label: 'Check-in com QR Code',       description: 'QR code exclusivo por família — entrada e saída registradas com segurança e timestamp' },
      { label: 'Validação de retirada',       description: 'Confirmação da identidade do responsável no momento da retirada' },
      { label: 'Ficha pastoral por criança',  description: 'Milestones espirituais, pontos de atenção e sugestões por faixa etária' },
      { label: 'Relatórios para pais',        description: 'Comunicado semanal personalizado por família com o progresso e avisos' },
      { label: 'Avisos e comunicados',        description: 'Notificações de eventos, feriados, mudanças de sala e autorizações' },
      { label: 'Alerta de incidentes',        description: 'Notificação imediata em caso de necessidade médica ou incidente' },
    ],
    agents: [
      { slug: 'agent-kids-seguranca',    name: 'Segurança Kids',         included: true,  Icon: Shield   },
      { slug: 'agent-kids-pastoral',     name: 'Pastoral Infantil',      included: false, Icon: BookOpen },
      { slug: 'agent-kids-comunicacao',  name: 'Comunicação com Pais',   included: false, Icon: Mail     },
    ],
  },

  // ── Financeiro Pro ───────────────────────────────────────────────────────
  {
    id:         'financeiro-pro',
    name:       'Financeiro Pro',
    tagline:    'Controle financeiro completo: folha, prestadores e DRE mensal.',
    price:      'R$ 489,90/mês',
    priceCents: 48990,
    Icon:       DollarSign,
    forWhom:    'Igrejas com operação financeira mais complexa — folha de pagamento de pastores e funcionários, contratos com prestadores PJ/MEI, controle de centros de custo e necessidade de DRE mensal para prestação de contas.',
    problems: [
      'Folha de pagamento calculada em planilha, com risco de erros',
      'Prestadores PJ e MEI sem controle centralizado de contratos e NFs',
      'Sem DRE mensal — tesoureiro não consegue apresentar resultado para a liderança',
      'Centros de custo inexistentes — impossível saber quanto custa cada ministério',
    ],
    features: [
      { label: 'Folha de pagamento',      description: 'Cálculo mensal de pastores e funcionários com holerites e histórico' },
      { label: 'Gestão de prestadores',   description: 'Controle de contratos, pagamentos e notas fiscais de PJ e MEI' },
      { label: 'Centros de custo',        description: 'Alocação de despesas por ministério, célula ou projeto para análise gerencial' },
      { label: 'DRE mensal automático',   description: 'Demonstrativo de Resultado do Exercício pronto para reuniões de liderança' },
      { label: 'Leitura de NFs',          description: 'Import de notas fiscais eletrônicas com classificação automática' },
      { label: 'Relatórios avançados',    description: 'Comparativos mês a mês, orçado vs realizado e projeções' },
    ],
    agents: [
      { slug: 'agent-financeiro', name: 'Assistente Financeiro', included: true, Icon: DollarSign },
    ],
    consultive: true,
  },
]

/** Busca conteúdo de módulo pelo id */
export function getModuleContent(id: string): ModuleContent | undefined {
  return MODULES_CONTENT.find(m => m.id === id)
}
