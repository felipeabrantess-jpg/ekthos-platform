/**
 * Normaliza texto de busca para comparar com a coluna gerada `people.name_sort`
 * (= unaccent(lower(trim(name)))). Remove acentos/cedilha e baixa a caixa,
 * para que "Fernanda", "FERNANDA", "fernánda" e "Conceição"/"conceicao" batam.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
