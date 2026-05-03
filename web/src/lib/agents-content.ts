/**
 * agents-content.ts — Conteúdo enriquecido dos agentes IA
 *
 * Sprint 3 — 01/05/2026: Catálogo definitivo — 7 agentes
 * 4 internos (inclusos em qualquer plano) + 3 premium pastorais (avulsos)
 *
 * Agentes de módulo NÃO listados aqui — aparecem apenas dentro
 * do detalhe do módulo (Volunteer Pro, Kids Pro, Financeiro Pro).
 *
 * Agentes removidos (descontinuados): agent-conteudo, agent-metricas,
 * agent-whatsapp, agent-agenda, agent-voluntarios, agent-kids-*,
 * agent-financeiro (volta em Sprint Financeiro Pro)
 */

import type { LucideIcon } from 'lucide-react'
import {
  MessageCircle,
  Rocket,
  UserPlus,
  Settings2,
  Heart,
  Zap,
  UserCheck,
} from 'lucide-react'

export interface AgentContent {
  slug:          string
  name:          string
  Icon:          LucideIcon
  shortDesc:     string          // 1 linha — para cards
  longDesc:      string          // parágrafo — para detalhe
  howItWorks:    string[]        // 3-5 bullets
  forWhom:       string          // parágrafo "Para quem"
  badge?:        string          // ex: "Premium Pastoral"
  note?:         string          // nota extra no detalhe
  moduleId?:     string          // se vinculado a módulo pago
  price?:        number          // em cents; null = incluso no plano
  category:      'interno' | 'premium' | 'modulo'
}

export const AGENTS_CONTENT: AgentContent[] = [
  // ── Internos — inclusos em qualquer plano ────────────────────────

  {
    slug:       'agent-suporte',
    name:       'Suporte 24h',
    Icon:       MessageCircle,
    category:   'interno',
    shortDesc:  'Tira dúvidas sobre o Ekthos a qualquer hora, sem espera.',
    longDesc:   'O Suporte 24h resolve dúvidas operacionais e técnicas sobre o Ekthos sem precisar abrir chamado ou aguardar atendimento humano. Conhece todas as funcionalidades da plataforma e guia o usuário pelo caminho mais rápido para resolver o que precisa.',
    howItWorks: [
      'Responde perguntas sobre qualquer tela ou funcionalidade',
      'Guia o passo a passo de configurações complexas',
      'Indica onde encontrar cada recurso do sistema',
      'Escalona para a equipe Ekthos quando necessário',
    ],
    forWhom: 'Toda igreja que usa o Ekthos. Disponível 24h para pastores, líderes e secretários.',
  },

  {
    slug:       'agent-onboarding',
    name:       'Onboarding de Líderes',
    Icon:       Rocket,
    category:   'interno',
    shortDesc:  'Guia novos líderes no primeiro acesso e nas primeiras semanas.',
    longDesc:   'O Onboarding de Líderes acompanha cada novo usuário desde o primeiro login até a plena utilização do sistema. Adapta a trilha de aprendizado ao perfil (admin, secretária, líder de célula) e garante que ninguém fique parado por falta de conhecimento da ferramenta.',
    howItWorks: [
      'Detecta o perfil do usuário e propõe trilha personalizada',
      'Ensina o cadastro das primeiras pessoas e células',
      'Explica o fluxo de discipulado e stages do pipeline',
      'Verifica se os módulos estão configurados corretamente',
      'Faz check-in periódico nas primeiras semanas de uso',
    ],
    forWhom: 'Igrejas em expansão de equipe ou que estão migrando de outras ferramentas.',
  },

  {
    slug:       'agent-cadastro',
    name:       'Assistente de Cadastro',
    Icon:       UserPlus,
    category:   'interno',
    shortDesc:  'Cadastra membros e visitantes via conversa, sem formulário.',
    longDesc:   'Em vez de preencher formulários, o agente coleta os dados da pessoa em uma conversa natural — nome, telefone, endereço, data de nascimento — e salva diretamente no sistema. Elimina erros de digitação e acelera o cadastro durante recepção, eventos e visitas domiciliares.',
    howItWorks: [
      'Coleta dados por conversa em linguagem natural',
      'Valida formato de telefone, CPF e e-mail automaticamente',
      'Sugere busca antes de criar duplicatas',
      'Atualiza fichas existentes com novos dados informados',
      'Classifica automaticamente no stage correto do pipeline',
    ],
    forWhom: 'Igrejas com fluxo ativo de visitantes e conversões semanais. Ideal para recepcionistas e pastores de evangelismo.',
  },

  {
    slug:       'agent-config',
    name:       'Configurador Inteligente',
    Icon:       Settings2,
    category:   'interno',
    shortDesc:  'Configura pipeline, áreas e ministérios via conversa natural.',
    longDesc:   'O Configurador Inteligente guia o pastor ou administrador pela personalização do sistema sem precisar navegar por menus técnicos. Configura etapas do pipeline, cria áreas ministeriais, ajusta escalas e adapta o Ekthos à realidade única da sua Igreja — tudo por conversa.',
    howItWorks: [
      'Cria e reorganiza etapas do pipeline de discipulado',
      'Configura áreas, ministérios e células da Igreja',
      'Ajusta nomenclaturas e campos personalizados',
      'Orienta sobre melhores práticas de configuração',
      'Aplica mudanças com confirmação antes de salvar',
    ],
    forWhom: 'Administradores e pastores responsáveis pela configuração inicial e ajustes do sistema.',
  },

  // ── Premium Pastorais — vendidos sempre à parte ──────────────────

  {
    slug:       'agent-acolhimento',
    name:       'Acolhimento Pastoral',
    Icon:       Heart,
    category:   'premium',
    shortDesc:  'Acolhe visitantes e conduz os primeiros 90 dias na Igreja.',
    longDesc:   'O Acolhimento Pastoral cuida de cada novo visitante desde o primeiro contato até o enraizamento na comunidade. Mantém contato semanal personalizado, conduz a trilha de integração e garante que nenhum visitante se sinta esquecido nos primeiros 90 dias.',
    howItWorks: [
      'Registra o visitante e inicia contato no mesmo dia',
      'Envia mensagem personalizada via WhatsApp a cada semana',
      'Convida para próximos passos: célula, batismo, servir',
      'Alerta o pastor sobre visitantes sem resposta por 14+ dias',
      'Atualiza o pipeline automaticamente conforme avanços',
    ],
    forWhom: 'Igrejas com fluxo semanal de visitantes e pastores que querem zero visitante perdido nos primeiros 90 dias.',
    badge:   'Premium Pastoral',
    price:   29000,
  },

  {
    slug:       'agent-operacao',
    name:       'Operação Pastoral',
    Icon:       Zap,
    category:   'premium',
    shortDesc:  'Orquestra antes, durante e depois de cada culto ou evento.',
    longDesc:   'O Operação Pastoral cuida do ciclo completo de cada culto ou evento: prepara a equipe antes, suporta a operação durante e faz o fechamento automático depois. Elimina a dependência de uma pessoa centralizar tudo — o agente é o coordenador operacional da Igreja.',
    howItWorks: [
      'Envia briefing para a equipe 24h antes do culto',
      'Confirma a presença de líderes e voluntários escalados',
      'Coordena check-in de crianças e recepção de visitantes',
      'Faz fechamento operacional pós-culto com métricas e pendências',
      'Registra presença, visitantes e dízimos automaticamente',
    ],
    forWhom: 'Igrejas com equipe de ministério estruturada e pastores que querem operação sem gargalo humano.',
    badge:   'Premium Pastoral',
    price:   39000,
  },

  {
    slug:       'agent-reengajamento',
    name:       'Reengajamento Pastoral',
    Icon:       UserCheck,
    category:   'premium',
    shortDesc:  'Detecta membros esfriando e retoma o vínculo antes que se percam.',
    longDesc:   'O Reengajamento Pastoral monitora continuamente os padrões de presença e atividade para identificar quem está se afastando antes que seja tarde. Retoma o contato no momento certo, com a abordagem certa, via WhatsApp — sem que o pastor precise fazer isso manualmente.',
    howItWorks: [
      'Detecta membros inativos há 30, 60 ou 90 dias automaticamente',
      'Cruza dados de célula, culto e pipeline para medir engajamento real',
      'Retoma contato com mensagem personalizada ao histórico da pessoa',
      'Rastreia resposta e escalona para pastor quando necessário',
      'Gera lista semanal de "Em Risco" para reunião pastoral',
    ],
    forWhom: 'Pastores de células, supervisores e pastores executivos preocupados com retenção de membros.',
    badge:   'Premium Pastoral',
    price:   29000,
  },

]

/** Busca conteúdo de um agente pelo slug */
export function getAgentContent(slug: string): AgentContent | undefined {
  return AGENTS_CONTENT.find(a => a.slug === slug)
}

/** Slugs de todos os 7 agentes do catálogo frontend */
export const ALL_AGENT_SLUGS = AGENTS_CONTENT.map(a => a.slug)

/** Agentes por categoria */
export const INTERNAL_AGENTS = AGENTS_CONTENT.filter(a => a.category === 'interno')
export const PREMIUM_AGENTS  = AGENTS_CONTENT.filter(a => a.category === 'premium')
