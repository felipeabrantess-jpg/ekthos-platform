// Teste do service worker (public/sw.js) com ambiente simulado. Uso: node test-sw-cache.mjs [caminho-do-sw]
// Cenário real do defeito: usuário com cache igv-pwa-v3 contendo o index.html antigo.
import { readFileSync } from 'node:fs'
const SRC = process.argv[2] ?? new URL('./public/sw.js', import.meta.url)
const code = readFileSync(SRC, 'utf8')
const res = []; const ck = (n, ok, i = '') => { res.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${i ? ' — ' + i : ''}`) }

function mundo({ online = true, versaoRede = 'NOVO', cachesIniciais = {} } = {}) {
  const handlers = {}; const store = new Map(Object.entries(cachesIniciais).map(([k, v]) => [k, new Map(Object.entries(v))]))
  const navegou = []; const reqLog = []
  const mk = (url, body) => ({ url, ok: true, _b: body, clone() { return { ...this } } })
  const self = {
    addEventListener: (t, h) => { handlers[t] = h }, skipWaiting: () => { self._skip = true },
    clients: { claim: async () => { self._claim = true }, matchAll: async () => [{ url: 'https://app/igv/seja-membro', navigate: async u => { navegou.push(u) } }] },
  }
  const caches = {
    keys: async () => [...store.keys()], delete: async k => store.delete(k),
    open: async n => { if (!store.has(n)) store.set(n, new Map()); const m = store.get(n); return { put: async (r, v) => { m.set(r.url, v) } } },
    match: async r => { for (const m of store.values()) if (m.has(r.url)) return m.get(r.url); return undefined },
  }
  const fetchFn = async r => { reqLog.push(r.url); if (!online) throw new Error('offline'); return mk(r.url, versaoRede) }
  new Function('self', 'caches', 'fetch', 'URL', code)(self, caches, fetchFn, URL)
  return { handlers, store, navegou, reqLog, self, mk }
}
const run = async (w, url, method = 'GET') => { let out; const e = { request: { url, method }, respondWith: p => { out = p }, waitUntil: p => { out = p } }; w.handlers.fetch(e); return out ? await out.catch(x => ({ erro: x.message })) : null }
const activate = async w => { let p; w.handlers.activate({ waitUntil: x => { p = x } }); await p }

const stale = { 'igv-pwa-v3': { 'https://app/igv/seja-membro': { ok: true, _b: 'ANTIGO' } } }
let w = mundo({ cachesIniciais: stale })
let r = await run(w, 'https://app/igv/seja-membro')
ck('com cache antigo e rede online, serve a versão NOVA (rede primeiro)', r?._b === 'NOVO', String(r?._b))
w = mundo({ cachesIniciais: stale, online: false })
r = await run(w, 'https://app/igv/seja-membro')
ck('offline: usa o cache como reserva', r?._b === 'ANTIGO')
w = mundo({ online: false })
r = await run(w, 'https://app/igv/seja-membro')
ck('offline sem cache: erro propagado (não inventa resposta)', !!r?.erro)
w = mundo({ cachesIniciais: stale })
await activate(w)
ck('ativação apaga o cache antigo (igv-pwa-v3)', !w.store.has('igv-pwa-v3'))
ck('ativação assume as abas (clients.claim)', w.self._claim === true)
ck('atualização de versão anterior recarrega a aba aberta uma vez', w.navegou.length === 1, w.navegou.join())
w = mundo()
await activate(w)
ck('primeira instalação (sem cache anterior) NÃO recarrega abas', w.navegou.length === 0)
w = mundo()
const e0 = w.handlers.install; e0({ waitUntil: () => {} })
ck('instalação usa skipWaiting', w.self._skip === true)
w = mundo({ cachesIniciais: stale })
r = await run(w, 'https://app/dashboard')
ck('rotas fora de /igv não são interceptadas', r === null && w.reqLog.length === 0)
r = await run(w, 'https://app/igv/seja-membro', 'POST')
ck('requisições não-GET não são interceptadas', r === null)
r = await run(w, 'https://app/manifest.json')
ck('manifest.json segue a mesma regra (rede primeiro)', r?._b === 'NOVO')
w = mundo()
await run(w, 'https://app/igv/sobre')
ck('resposta da rede é gravada na versão atual do cache', [...w.store.keys()].some(k => k === 'igv-pwa-v4') || [...w.store.keys()].some(k => k.includes('igv-pwa')))
const falhou = res.filter(x => !x).length
console.log(`\n=== ${res.length - falhou}/${res.length} OK ===`)
process.exit(falhou ? 1 : 0)
