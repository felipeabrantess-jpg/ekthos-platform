// Teste de fetchAllExportPages (web/src/features/people/exportPaging.ts) — lógica pura, sem banco e sem navegador.
// Uso: node test-export-paging.mjs   (requer esbuild, já presente via vite)
import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'

const src = readFileSync(new URL('./src/features/people/exportPaging.ts', import.meta.url), 'utf8')
const { code } = await transform(src, { loader: 'ts', format: 'esm' })
const mod = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
const { fetchAllExportPages, isMissingFunctionError, isTransientError, ExportPagingError } = mod

const res = []; const ck = (n, ok, i = '') => { res.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${i ? ' — ' + i : ''}`) }
const noSleep = async () => {}

// base simulada: 2.345 linhas ordenadas por (created_at DESC, id DESC), cursor = linha mais antiga da página
const ALL = Array.from({ length: 2345 }, (_, i) => ({ id: `id-${String(2345 - i).padStart(5, '0')}`, created_at: `2026-10-${String(1 + (i % 28)).padStart(2, '0')}T10:00:00Z`, n: i % 7 }))
const makeServer = ({ limit = 1000, failFirst = 0, errMsg = 'canceling statement due to statement timeout' } = {}) => {
  let calls = 0; const cursors = []; let fails = failFirst
  const fn = async cur => {
    calls++; cursors.push(cur)
    if (fails > 0) { fails--; throw Object.assign(new Error(errMsg), { code: /timeout/.test(errMsg) ? '57014' : '42501' }) }
    const start = cur.id ? ALL.findIndex(r => r.id === cur.id) + 1 : 0
    const slice = ALL.slice(start, start + limit)
    const last = slice[slice.length - 1]
    return { rows: slice, max_contacts: Math.max(0, ...slice.map(r => r.n)), alert_threshold_hours: 48, has_more: start + limit < ALL.length, next_after_created_at: last?.created_at ?? null, next_after_id: last?.id ?? null }
  }
  return { fn, get calls() { return calls }, cursors }
}

let s = makeServer()
let out = await fetchAllExportPages(s.fn, { sleep: noSleep })
ck('junta todas as páginas: 2.345 linhas em 3 chamadas', out.rows.length === 2345 && s.calls === 3 && out.total === 2345, `${out.rows.length} linhas, ${s.calls} chamadas`)
ck('ordem preservada e sem duplicidade', out.rows.every((r, i) => r.id === ALL[i].id) && new Set(out.rows.map(r => r.id)).size === 2345)
ck('max_contacts = máximo entre as páginas', out.max_contacts === 6, String(out.max_contacts))
ck('alert_threshold_hours vem da primeira página', out.alert_threshold_hours === 48)
ck('primeira chamada sem cursor; seguintes avançam', s.cursors[0].id === null && s.cursors[1].id === 'id-01346' && s.cursors[2].id === 'id-00346', JSON.stringify(s.cursors.map(c => c.id)))

s = makeServer({ limit: 5000 })
out = await fetchAllExportPages(s.fn, { sleep: noSleep })
ck('base menor que a página: 1 chamada', out.rows.length === 2345 && s.calls === 1)

s = makeServer({ failFirst: 2 })
out = await fetchAllExportPages(s.fn, { sleep: noSleep })
ck('timeout transitório: tenta de novo e conclui', out.rows.length === 2345 && s.calls === 5, `${s.calls} chamadas`)

s = makeServer({ failFirst: 9 })
let erro = null; try { await fetchAllExportPages(s.fn, { sleep: noSleep, retries: 2 }) } catch (e) { erro = e }
ck('timeout persistente: desiste após as tentativas e propaga o erro', erro && /statement timeout/.test(erro.message) && s.calls === 3, `${s.calls} chamadas`)

s = makeServer({ failFirst: 1, errMsg: 'permission denied' })
erro = null; try { await fetchAllExportPages(s.fn, { sleep: noSleep }) } catch (e) { erro = e }
ck('erro não transitório não é repetido', erro && s.calls === 1)

erro = null
try { await fetchAllExportPages(async () => { throw Object.assign(new Error('Could not find the function public.export_people_rows_page'), { code: 'PGRST202' }) }, { sleep: noSleep }) } catch (e) { erro = e }
ck('função inexistente propaga (cliente cai no RPC antigo)', erro && isMissingFunctionError(erro.message, erro.code))
ck('classificadores de erro', isTransientError('canceling statement due to statement timeout') && !isTransientError('permission denied') && isMissingFunctionError('', 'PGRST202'))

// salvaguardas contra laço infinito
erro = null
try { await fetchAllExportPages(async () => ({ rows: [{ id: 'x' }], has_more: true, next_after_created_at: 't', next_after_id: 'x' }), { sleep: noSleep }) } catch (e) { erro = e }
ck('cursor que não avança é detectado', erro instanceof ExportPagingError && /Cursor não avançou/.test(erro.message))
erro = null
try { await fetchAllExportPages(async () => ({ rows: [], has_more: true, next_after_created_at: 't', next_after_id: 'y' }), { sleep: noSleep }) } catch (e) { erro = e }
ck('página vazia com has_more é detectada', erro instanceof ExportPagingError)
erro = null
let k = 0
try { await fetchAllExportPages(async () => ({ rows: [{ id: 'r' + k }], has_more: true, next_after_created_at: 't' + k, next_after_id: 'r' + k++ }), { sleep: noSleep, maxPages: 5 }) } catch (e) { erro = e }
ck('limite de páginas é respeitado', erro instanceof ExportPagingError && /excedeu 5 páginas/.test(erro.message), String(k))
erro = null
try { await fetchAllExportPages(async () => ({ rows: [{ id: 'a' }], has_more: true }), { sleep: noSleep }) } catch (e) { erro = e }
ck('has_more sem cursor é detectado', erro instanceof ExportPagingError && /sem cursor/.test(erro.message))

const falhou = res.filter(x => !x).length
console.log(`\n=== ${res.length - falhou}/${res.length} OK ===`)
process.exit(falhou ? 1 : 0)
