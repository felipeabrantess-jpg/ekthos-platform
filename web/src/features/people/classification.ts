/**
 * Classificação única de Pessoas (Release 1) — tipos, rótulos e tradução de erros.
 * Toda regra vive no banco (person_classification / person_set_classification / person_set_stage);
 * aqui só há apresentação e contrato.
 */
export type Classification = 'visitor' | 'member' | null

export interface PersonRole {
  role: 'leader' | 'volunteer'
  basis: string
  ref_id: string | null
  ref_name: string | null
}

export interface PersonClassification {
  classification: Classification
  /** 'validated' = decisão registrada; 'legacy' = derivada das evidências do legado (transição, só leitura); null = sem evidência */
  source?: 'validated' | 'legacy' | null
  is_leader: boolean
  is_volunteer: boolean
  roles: PersonRole[]
  stage_key: string | null
  stage_name: string | null
  condition: 'afastado' | null
  label: string
}

export type ClassificationFilter = '' | 'visitor' | 'member' | 'none'
export type RoleFilter = '' | 'member_only' | 'volunteer' | 'leader' | 'leader_volunteer'

export const CLASSIFICATION_LABEL: Record<'visitor' | 'member' | 'none', string> = {
  visitor: 'Visitante',
  member:  'Membro',
  none:    'Não classificado',
}

export const ROLE_FILTER_LABEL: Record<Exclude<RoleFilter, ''>, string> = {
  member_only:      'Somente membros (sem função)',
  volunteer:        'Membros voluntários',
  leader:           'Membros líderes',
  leader_volunteer: 'Líderes que também são voluntários',
}

export const ROLE_BASIS_LABEL: Record<string, string> = {
  ministry_leader:      'Líder de ministério',
  ministry_lider:       'Líder de ministério',
  ministry_coordenador: 'Coordenador de ministério',
  cell_leader:          'Líder de célula',
  cell_co_leader:       'Vice-líder de célula',
  volunteer_active:     'Voluntário',
}

/** Rótulo principal (prioridade Líder > Voluntário > Membro). Fallback quando a linha ainda não traz o campo. */
export function classificationLabel(c: PersonClassification | null | undefined): string {
  if (!c) return 'Não classificado'
  return c.label ?? CLASSIFICATION_LABEL[c.classification ?? 'none']
}

/** Cor da etiqueta por classificação */
export function classificationBadge(c: PersonClassification | null | undefined): { label: string; color: string; bg: string } {
  const label = classificationLabel(c)
  switch (c?.classification) {
    case 'member':  return { label, color: '#065f46', bg: '#d1fae5' }
    case 'visitor': return { label, color: '#1e40af', bg: '#dbeafe' }
    default:        return { label, color: '#6b7280', bg: '#f3f4f6' }
  }
}

/** Traduz erros das RPCs de classificação/etapa para o operador. Devolve null se não for um erro conhecido. */
export function classificationErrorMessage(err: unknown): string | null {
  const m = err instanceof Error ? err.message : String(err ?? '')
  if (/CLASSIFICATION_REQUIRED/.test(m)) {
    const detail = m.replace(/^.*CLASSIFICATION_REQUIRED:\s*/, '').split('\n')[0]
    return `Só um Membro pode ter essa etapa ou função. ${detail}`.trim()
  }
  if (/STAGE_CONFLICT/.test(m))        return 'Um Membro não pode ir para a etapa Visitante. Mude a classificação primeiro, com justificativa.'
  if (/HAS_ROLES/.test(m)) {
    try {
      const json = m.slice(m.indexOf('['), m.lastIndexOf(']') + 1)
      const roles = JSON.parse(json) as PersonRole[]
      const list = roles.map(r => `${ROLE_BASIS_LABEL[r.basis] ?? r.role}${r.ref_name ? ` (${r.ref_name})` : ''}`).join(', ')
      return `Esta pessoa tem funções ativas que precisam ser regularizadas antes de deixar de ser Membro: ${list}.`
    } catch {
      return 'Esta pessoa tem funções ativas (liderança ou voluntariado) que precisam ser regularizadas antes de deixar de ser Membro.'
    }
  }
  if (/REASON_REQUIRED/.test(m))        return 'Informe a justificativa para esta mudança de classificação.'
  if (/CONFIRMATION_REQUIRED/.test(m))  return 'Confirme a mudança de classificação.'
  if (/PERSON_TYPE_TAG_DEPRECATED/.test(m)) return 'As etiquetas de tipo foram substituídas pela classificação. Use o campo Classificação.'
  if (/PIPELINE_DIRECT_WRITE|CLASSIFICATION_DIRECT_WRITE/.test(m)) return 'Esta alteração precisa passar pelo fluxo de classificação/etapa. Recarregue a página e tente novamente.'
  if (/FORBIDDEN|42501|permission denied/i.test(m)) return 'Você não tem permissão para alterar esta pessoa (fora do seu escopo de atendimento, ministério ou célula).'
  return null
}
