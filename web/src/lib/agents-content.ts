/**
 * agents-content.ts — Conteúdo enriquecido dos agentes IA
 *
 * Complementa agents_catalog (DB) com descrições longas, bullets e
 * informações de perfil. Futuramente migrado para o banco.
 *
 * moduleId: se definido, o agente pertence a um módulo pago e
 * não aparece na seção "Contratar Avulso" da listagem.
 */

import type { LucideIcon } from 'lucide-react'
import {
  MessageCircle,
  Rocket,
  UserPlus,
  PenTool,
  BarChart3,
  MessageSquare,
  DollarSign,
  UserCheck,
  CalendarCheck,
  CalendarRange,
  Heart,
  Shield,
  BookOpen,
  Mail,
} from 'lucide-react'

export interface AgentContent {
  slug:          string
  name:          string
  Icon:          LucideIcon
  shortDesc:     string          // 1 linha — para cards
  longDesc:      string          // parágrafo — para detalhe
  howItWorks:    string[]        // 3-5 bullets
  forWhom:       string          // parágrafo "Para quem"
  badge?:        string          // ex: "Exclusivo Avivamento"
  note?:         string          // nota extra no detalhe
  moduleId?:     string          // se vinculado a módulo pago
  price?:        number          // em cents; null = incluso no plano
}

export const AGENTS_CONTENT: AgentContent[] = [
  // ── Inclusos no plano (always_paid / free) ────────────────────────

  {
    slug:       'agent-suporte',
    name:       'Suporte 24h',
    Icon:       MessageCircle,
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

  // ── Elegíveis — contratar avulso (R$ 149,90/mês) ─────────────────

  {
    slug:       'agent-cadastro',
    name:       'Assistente de Cadastro',
    Icon:       UserPlus,
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
    price:    14990,
  },

  {
    slug:       'agent-conteudo',
    name:       'Conteúdo para Redes',
    Icon:       PenTool,
    shortDesc:  'Cria posts, legendas e artes-texto para as redes sociais da igreja.',
    longDesc:   'Produz conteúdo escrito para Instagram, WhatsApp e outras redes no tom e identidade da sua Igreja. Gera posts devocionais, avisos de eventos, agradecimentos pós-culto e campanhas de mobilização — sem precisar de redator ou agência.',
    howItWorks: [
      'Cria textos com base no tema do culto ou evento da semana',
      'Adapta o tom para formal, leve ou jovem conforme o canal',
      'Sugere hashtags e horários ideais de publicação',
      'Gera variações para testes A/B de engajamento',
    ],
    forWhom: 'Igrejas com redes sociais ativas e equipe de comunicação enxuta ou voluntária.',
    price:    14990,
  },

  {
    slug:       'agent-metricas',
    name:       'Insights e Métricas',
    Icon:       BarChart3,
    shortDesc:  'Analisa dados da igreja e responde perguntas sobre crescimento.',
    longDesc:   'Transforma os dados do CRM em respostas diretas. Em vez de exportar planilhas, o pastor pergunta "Quantas pessoas entraram este mês?", "Qual célula cresceu mais?" e recebe a resposta com análise. Identifica tendências, queda de presença e oportunidades de ação.',
    howItWorks: [
      'Responde perguntas em linguagem natural sobre qualquer dado',
      'Compara períodos (mês vs mês, trimestre vs trimestre)',
      'Identifica células e ministérios em queda ou crescimento',
      'Gera relatórios resumidos prontos para reuniões de equipe',
      'Aponta membros que merecem atenção pastoral urgente',
    ],
    forWhom: 'Líderes que tomam decisões com base em dados e pastores que se reportam a uma liderança apostólica.',
    price:    14990,
  },

  {
    slug:       'agent-whatsapp',
    name:       'Atendente WhatsApp',
    Icon:       MessageSquare,
    shortDesc:  'Responde visitantes e membros no WhatsApp da igreja 24h.',
    longDesc:   'Atende o WhatsApp oficial da Igreja respondendo dúvidas sobre cultos, horários, endereço, cadastro de novos membros e encaminhamento de pedidos de oração. Identifica o momento certo de chamar um pastor ou secretário humano.',
    howItWorks: [
      'Responde perguntas frequentes sem intervenção humana',
      'Coleta dados de visitantes e cria ficha automaticamente',
      'Registra pedidos de oração e encaminha para equipe pastoral',
      'Identifica membros em crise e aciona suporte imediato',
      'Escala para humano com contexto completo da conversa',
    ],
    forWhom:  'Igrejas com WhatsApp ativo e volume de mensagens que sobrecarrega a secretaria. Exclusivo para o plano Avivamento.',
    badge:    'Exclusivo Avivamento',
    price:    14990,
  },

  {
    slug:       'agent-financeiro',
    name:       'Assistente Financeiro',
    Icon:       DollarSign,
    shortDesc:  'Registra despesas, classifica lançamentos e organiza as finanças.',
    longDesc:   'Permite registrar entradas e saídas pelo chat — sem abrir telas de formulário. Classifica automaticamente por categoria, sugere centro de custo e mantém o financeiro organizado para o tesoureiro e o pastor. No Financeiro Pro, opera com capacidade expandida: folha de pagamento, prestadores, NFs e DRE.',
    howItWorks: [
      'Registra lançamentos via conversa ("paguei R$ 1.200 de aluguel")',
      'Classifica despesas e sugere categorias automaticamente',
      'Responde consultas de saldo, totais por período e categorias',
      'Gera resumos financeiros para reuniões de tesouraria',
      'No Financeiro Pro: calcula folha, organiza prestadores e lê NFs',
    ],
    forWhom: 'Tesoureiros e pastores que querem simplicidade no dia a dia financeiro. Potencializado no módulo Financeiro Pro.',
    note:    'Incluído no módulo Financeiro Pro com capacidade expandida: folha de pagamento, prestadores PJ/MEI, notas fiscais e DRE mensal.',
    price:   14990,
  },

  {
    slug:       'agent-reengajamento',
    name:       'Reengajamento de Membros',
    Icon:       UserCheck,
    shortDesc:  'Identifica membros afastados e sugere abordagens de reconexão.',
    longDesc:   'Monitora padrões de presença e inatividade para sinalizar quem precisa de atenção pastoral antes que se perca definitivamente. Sugere o momento certo, o canal certo e a abordagem mais eficaz para cada caso.',
    howItWorks: [
      'Identifica membros sem registro de atividade nos últimos 30/60/90 dias',
      'Cruza dados de célula, culto e pipeline para medir engajamento real',
      'Sugere mensagem personalizada para o líder de célula enviar',
      'Rastreia o resultado de cada abordagem (voltou / não respondeu)',
      'Gera lista de "Em Risco" para reunião pastoral semanal',
    ],
    forWhom: 'Pastores de células, supervisores e pastores executivos preocupados com retenção.',
    price:   14990,
  },

  {
    slug:       'agent-agenda',
    name:       'Assistente de Agenda',
    Icon:       CalendarCheck,
    shortDesc:  'Organiza eventos, envia lembretes e confirma presenças.',
    longDesc:   'Centraliza a agenda da Igreja e cuida do ciclo completo dos eventos: criação, comunicação, lembretes e confirmação de presença. Elimina o trabalho manual de mandar mensagem um por um e garante que os participantes certos recebam a informação certa na hora certa.',
    howItWorks: [
      'Cria eventos via conversa (nome, data, local, público-alvo)',
      'Envia lembretes automáticos 7, 3 e 1 dia antes do evento',
      'Confirma presenças e mantém lista atualizada em tempo real',
      'Notifica organizadores sobre queda de confirmações',
      'Pós-evento: coleta feedback e registra presença final',
    ],
    forWhom: 'Igrejas com agenda semanal intensa, retiros, conferências e eventos externos.',
    price:   14990,
  },

  // ── Módulo Volunteer Pro ──────────────────────────────────────────

  {
    slug:      'agent-escalas',
    name:      'Agente Escalas',
    Icon:      CalendarRange,
    shortDesc: 'Monta escalas automaticamente e confirma via WhatsApp.',
    longDesc:  'Elimina o trabalho semanal de montar escalas de voluntários. O agente considera disponibilidade, funções, histórico e restrições de cada pessoa para montar a escala ideal — e ainda confirma com cada voluntário via WhatsApp.',
    howItWorks: [
      'Monta escala automática respeitando disponibilidade cadastrada',
      'Envia confirmação individual para cada voluntário escalado',
      'Gerencia trocas e substituições sem intervenção humana',
      'Registra faltas e ajusta escalas futuras automaticamente',
      'Alerta o coordenador quando a escala está incompleta',
    ],
    forWhom:  'Coordenadores de voluntários com equipes de 15+ pessoas e escalas semanais.',
    badge:    'Incluso no Volunteer Pro',
    moduleId: 'volunteer-pro',
  },

  {
    slug:      'agent-voluntarios',
    name:      'Agente Voluntários',
    Icon:      Heart,
    shortDesc: 'Recruta, engaja e acompanha voluntários da sua equipe.',
    longDesc:  'Vai além da escala: o agente cuida do ciclo completo do voluntário — desde o interesse inicial até o desenvolvimento como líder. Monitora engajamento, celebra marcos e identifica quem precisa de atenção antes de desistir.',
    howItWorks: [
      'Recebe inscrições de novos voluntários e coleta disponibilidade',
      'Faz onboarding automatizado por função (recepção, louvor, mídia)',
      'Monitora frequência e engajamento de cada voluntário',
      'Envia mensagem de valorização em datas especiais',
      'Alerta o coordenador sobre voluntários em risco de desistir',
    ],
    forWhom:  'Igrejas que querem reter talentos voluntários e construir uma equipe de serviço sólida.',
    badge:    'Add-on do Volunteer Pro — R$ 149,90/mês',
    moduleId: 'volunteer-pro',
    price:    14990,
  },

  // ── Módulo Kids Pro ───────────────────────────────────────────────

  {
    slug:      'agent-kids-seguranca',
    name:      'Segurança Kids',
    Icon:      Shield,
    shortDesc: 'Controla check-in e checkout de crianças com validação parental.',
    longDesc:  'Garante que cada criança entre e saia do ministério infantil com total segurança. O agente opera o sistema de check-in com QR code, valida a identidade de quem retira a criança e registra o histórico completo.',
    howItWorks: [
      'Gera QR code exclusivo por família no cadastro',
      'Valida identidade do responsável no momento da retirada',
      'Registra entradas e saídas com timestamp preciso',
      'Alerta a equipe sobre crianças não retiradas no prazo',
      'Mantém histórico completo para auditorias e pais',
    ],
    forWhom:  'Qualquer Igreja com ministério infantil ativo e preocupação com segurança das crianças.',
    badge:    'Incluso no Kids Pro',
    moduleId: 'kids-pro',
  },

  {
    slug:      'agent-kids-pastoral',
    name:      'Pastoral Infantil',
    Icon:      BookOpen,
    shortDesc: 'Acompanha o desenvolvimento espiritual de cada criança.',
    longDesc:  'Mantém ficha pastoral de cada criança com milestones espirituais, pontos de atenção e sugestões de atividades. Informa os pais sobre o progresso e alerta professores sobre necessidades individuais.',
    howItWorks: [
      'Registra marcos espirituais (primeira oração, batismo, etc.)',
      'Sugere atividades e temas de acordo com a faixa etária',
      'Identifica crianças que precisam de atenção especial',
      'Gera relatório mensal para os pais',
      'Ajuda professores a se prepararem para turmas específicas',
    ],
    forWhom:  'Igrejas com programa infantil estruturado e foco em desenvolvimento espiritual das crianças.',
    badge:    'Add-on do Kids Pro — R$ 149,90/mês',
    moduleId: 'kids-pro',
    price:    14990,
  },

  {
    slug:      'agent-kids-comunicacao',
    name:      'Comunicação com Pais',
    Icon:      Mail,
    shortDesc: 'Envia relatórios, avisos e comunicados diretamente aos pais.',
    longDesc:  'Mantém os pais informados e engajados sem sobrecarregar a equipe de professores. Envia relatórios semanais automáticos, avisos de evento e comunicações emergenciais — tudo personalizado por família.',
    howItWorks: [
      'Envia relatório semanal personalizado para cada família',
      'Comunica avisos de eventos, feriados e mudanças de sala',
      'Alerta imediato em caso de incidente ou necessidade médica',
      'Coleta autorização para fotos e atividades especiais',
      'Permite aos pais responder com perguntas ou observações',
    ],
    forWhom:  'Igrejas que querem fortalecer o vínculo com as famílias através do ministério infantil.',
    badge:    'Add-on do Kids Pro — R$ 149,90/mês',
    moduleId: 'kids-pro',
    price:    14990,
  },
]

/** Busca conteúdo de um agente pelo slug */
export function getAgentContent(slug: string): AgentContent | undefined {
  return AGENTS_CONTENT.find(a => a.slug === slug)
}

/** Agentes disponíveis para contratação avulsa (não vinculados a módulo) */
export const STANDALONE_AGENT_SLUGS = AGENTS_CONTENT
  .filter(a => !a.moduleId)
  .map(a => a.slug)
