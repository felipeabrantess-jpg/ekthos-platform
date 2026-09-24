/**
 * Normaliza texto de busca para comparar com a coluna gerada `people.name_sort`
 * (= unaccent(lower(trim(name)))). Remove acentos/cedilha e baixa a caixa,
 * para que "Fernanda", "FERNANDA", "fernánda" e "Conceição"/"conceicao" batam.
 */
/**
 * Filtro client-side: verdadeiro se ALGUM dos campos contém o termo, comparando
 * ambos normalizados (caixa, acento e cedilha ignorados; espaços nas pontas
 * ignorados). Termo vazio → sempre verdadeiro (sem filtro).
 */
export function matchesSearch(term: string, ...fields: Array<string | null | undefined>): boolean {
  const q = normalizeSearch(term ?? '')
  if (q.length === 0) return true
  return fields.some((f) => normalizeSearch(f ?? '').includes(q))
}

/** Padrão para PostgREST .ilike(...) sobre colunas *_sort (unaccent(lower(...))). */
export function ilikePattern(term: string): string {
  return `%${normalizeSearch(term)}%`
}

export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}
