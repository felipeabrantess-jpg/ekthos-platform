// TODO Fase 1: substituir por query pública de churches + church_pastoral_profile por slug
// Todos os campos de conteúdo abaixo são hardcoded para Fase 0 (IGV only, path-based).
// Horários já persistidos em church_pastoral_profile.horarios_culto (INSERT 2026-06-15).
// Missão/visão/valores aguardam colunas semânticas na tabela ou endpoint público.
export const IGV = {
  churchId:        '6c127559-874a-4748-8fce-55d4079613a5',
  slug:            'igv-itaipu',
  name:            'Igreja Gerando Vencedores',
  pastor:          'Pr. Valdir Brasil',
  address:         'Rua São Fábio 55, Itaipu — Niterói/RJ',
  phone:           '(21) 97711-2618',
  whatsapp:        '5521977112618',
  instagramHandle: 'igvitaipu',
  youtubeUrl:      'https://www.youtube.com/@igrejagerandovencedores',
  primaryColor:    '#D97706',
  secondaryColor:  '#78350F',
  // Foto da fachada (hero background)
  coverUrl: 'https://mlqjywqnchilvgkbvicd.supabase.co/storage/v1/object/public/church-logos/igv-fachada-hero.jpg',
  // Logo oficial IGV — símbolo "G" geométrico branco sobre fundo âmbar (v3)
  logoUrl: 'https://mlqjywqnchilvgkbvicd.supabase.co/storage/v1/object/public/church-logos/igv-logo.jpg',

  missao:
    'Existimos para Gerar Vencedores através do Amor de Deus, formando pessoas curadas, restauradas e cheias do Espírito Santo.',
  visao:
    'Ser uma Igreja acolhedora, relevante e multiplicadora, onde vidas sejam transformadas pela presença de Deus e preparadas para viver o Extraordinário.',
  valores: [
    'A presença de Deus',
    'O amor pelas pessoas',
    'A Comunhão',
    'A Honra',
    'O Serviço',
    'A Transformação',
    'O Cuidado',
    'O Compromisso com o Reino',
  ],
  valoresFrase:
    'Acreditamos que relacionamentos saudáveis sustentam crescimento saudável.',

  horarios: [
    { dia: 'Domingo',        hora: '8h',    local: 'Trindade' },
    { dia: 'Domingo',        hora: '10h',   local: 'Itaipu' },
    { dia: 'Domingo',        hora: '18h',   local: 'Trindade e Itaipu' },
    { dia: 'Quarta-feira',   hora: '19h30', local: 'Itaipu' },
  ],
} as const
