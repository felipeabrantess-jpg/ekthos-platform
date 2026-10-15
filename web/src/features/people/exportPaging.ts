/**
 * exportPaging — junta as páginas de export_people_rows_page num único payload de CSV.
 *
 * Por quê: uma chamada única montava o CSV inteiro (5.434 pessoas ≈ 1,2 MB de jsonb) e, sob carga do banco,
 * estourava o statement_timeout de 8 s do papel authenticated (HTTP 500). Em páginas por cursor cada chamada
 * leva ~0,3–0,5 s e o tempo total cresce linearmente, sem nunca encostar no limite por chamada.
 *
 * Sem dependências: toda regra de negócio vem do banco; aqui só há o laço, o cursor e as salvaguardas.
 */

export interface ExportPageCursor {
  createdAt: string | null
  id: string | null
}

export interface ExportPageResult<Row> {
  rows: Row[]
  max_contacts?: number | null
  alert_threshold_hours?: number | null
  has_more?: boolean | null
  next_after_created_at?: string | null
  next_after_id?: string | null
}

export interface ExportAllPayload<Row> {
  total: number
  max_contacts: number
  alert_threshold_hours?: number
  rows: Row[]
}

/** Erro "função não existe" do PostgREST (migration ainda não aplicada) — o chamador pode cair no RPC antigo. */
export function isMissingFunctionError(message: string | null | undefined, code?: string | null): boolean {
  return code === 'PGRST202' || /could not find the function|function .* does not exist/i.test(message ?? '')
}

/** Falha transitória que vale uma nova tentativa (timeout de statement, 5xx, rede). */
export function isTransientError(message: string | null | undefined, code?: string | null): boolean {
  return code === '57014' || /statement timeout|canceling statement|timeout|temporarily|fetch failed|network/i.test(message ?? '')
}

export class ExportPagingError extends Error {
  constructor(message: string, readonly cause?: unknown) { super(message) }
}

export async function fetchAllExportPages<Row>(
  fetchPage: (cursor: ExportPageCursor) => Promise<ExportPageResult<Row>>,
  opts: { maxPages?: number; retries?: number; retryDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ExportAllPayload<Row>> {
  const maxPages = opts.maxPages ?? 200
  const retries = opts.retries ?? 2
  const sleep = opts.sleep ?? (ms => new Promise<void>(r => setTimeout(r, ms)))

  const rows: Row[] = []
  let maxContacts = 0
  let alertHours: number | undefined
  let cursor: ExportPageCursor = { createdAt: null, id: null }

  for (let page = 1; ; page++) {
    if (page > maxPages) throw new ExportPagingError(`Exportação excedeu ${maxPages} páginas`)

    let res: ExportPageResult<Row> | undefined
    for (let attempt = 0; ; attempt++) {
      try {
        res = await fetchPage(cursor)
        break
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const code = (err as { code?: string } | null)?.code
        // a primeira página precisa propagar "função inexistente" para o chamador cair no RPC antigo
        if (isMissingFunctionError(msg, code) || attempt >= retries || !isTransientError(msg, code)) throw err
        await sleep((opts.retryDelayMs ?? 400) * (attempt + 1))
      }
    }

    const pageRows = res?.rows ?? []
    rows.push(...pageRows)
    maxContacts = Math.max(maxContacts, Number(res?.max_contacts ?? 0))
    if (alertHours === undefined && res?.alert_threshold_hours != null) alertHours = Number(res.alert_threshold_hours)

    if (!res?.has_more) break

    const next: ExportPageCursor = { createdAt: res.next_after_created_at ?? null, id: res.next_after_id ?? null }
    if (!next.createdAt || !next.id) throw new ExportPagingError('Página sem cursor de continuação')
    if (next.createdAt === cursor.createdAt && next.id === cursor.id) throw new ExportPagingError('Cursor não avançou')
    if (pageRows.length === 0) throw new ExportPagingError('Página vazia com has_more = true')
    cursor = next
  }

  return { total: rows.length, max_contacts: maxContacts, alert_threshold_hours: alertHours, rows }
}
