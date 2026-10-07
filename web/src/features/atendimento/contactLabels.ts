/**
 * Rótulos de canal e resultado de contato pastoral — fonte única para a tela de
 * Atendimento e para a exportação CSV de Pessoas (os valores brutos vivem em
 * journey_events.payload.channel / .result).
 */
export const CHANNEL_LABELS: Record<string, string> = {
  presencial: 'Pessoalmente',
  whatsapp:   'WhatsApp',
  ligacao:    'Ligação',
  email:      'E-mail',
  visita:     'Visita domiciliar',
}

export const RESULT_LABELS: Record<string, string> = {
  realizado:        'Contato realizado',
  sem_resposta:     'Sem resposta',
  reagendado:       'Reagendado',
  encaminhado:      'Encaminhado',
  nao_atendeu:      'Não atendeu',
  numero_errado:    'Número errado',
  pediu_retorno:    'Pediu retorno',
  nao_quer_contato: 'Não quer contato (encerra jornada)',
  mudou_de_igreja:  'Mudou de Igreja (encerra jornada)',
}

/** Rótulo curto do resultado para planilhas (sem o sufixo "(encerra jornada)"). */
export function resultLabel(result: string | null | undefined): string {
  if (!result) return ''
  return (RESULT_LABELS[result] ?? result).replace(/ \(encerra jornada\)$/, '')
}

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return ''
  return CHANNEL_LABELS[channel] ?? channel
}
