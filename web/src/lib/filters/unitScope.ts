/**
 * Escopo de unidade — dimensão operacional DENTRO do tenant (church_id).
 *
 *  'all'  → todas as unidades da igreja (escolha explícita, nunca implícita)
 *  'none' → somente pessoas SEM UNIDADE OPERACIONAL (visão de saneamento)
 *  uuid   → uma unidade específica (church_units.id)
 *
 * church_id continua sendo o isolamento multi-tenant; unit nunca o substitui.
 *
 * REGRA DE NEGÓCIO (vive no banco, nunca aqui):
 *  - people.unit_id           = dado armazenado/histórico.
 *  - unidade OPERACIONAL      = people_operational_unit(unit_id, created_at, churches.unit_cutoff_date):
 *        igreja sem unit_cutoff_date → people.unit_id
 *        igreja com unit_cutoff_date → cadastros anteriores ao corte = sem unidade; demais = unit_id
 *  O frontend só envia o escopo (p_unit_id); as RPCs canônicas aplicam a regra.
 *  NÃO reproduzir o corte no cliente e NÃO filtrar people.unit_id direto para representar
 *  a unidade operacional de uma pessoa.
 */
export type UnitScope = 'all' | 'none' | string

export const UNIT_PARAM = 'unidade'
export const UNIT_ALL: UnitScope = 'all'
export const UNIT_NONE: UnitScope = 'none'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Normaliza um valor vindo de URL/storage; qualquer coisa inválida vira 'all'. */
export function parseUnitScope(raw: string | null | undefined, validUnitIds: readonly string[]): UnitScope {
  if (!raw) return UNIT_ALL
  if (raw === UNIT_ALL || raw === UNIT_NONE) return raw
  if (UUID_RE.test(raw) && validUnitIds.includes(raw)) return raw
  return UNIT_ALL
}

/**
 * Converte o escopo para o parâmetro `p_unit_id` das RPCs canônicas
 * (`NULL` = todas, `'none'` = sem unidade, uuid = unidade).
 */
export function unitScopeToRpcParam(scope: UnitScope): string | null {
  return scope === UNIT_ALL ? null : scope
}

export function unitStorageKey(churchId: string): string {
  return `ekthos:unit:${churchId}`
}
