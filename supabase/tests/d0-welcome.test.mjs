// Teste do boas-vindas D+0 (vídeo por link) — _shared/d0-welcome.ts e a tryD0WelcomeTemplate do agent-acolhimento corrigido.
// Zero mensagens, zero banco. Uso: node supabase/tests/d0-welcome.test.mjs
// Opcional (rede, só leitura — HEAD/Range/GET na URL pública): IGV_VIDEO_LIVE=1 [IGV_VIDEO_SHA256=...]
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const esbuild = (() => { for (const p of ['esbuild', '../../web/node_modules/esbuild', 'C:/Users/felip/ekthos-platform/web/node_modules/esbuild']) { try { return require(p) } catch { /* próximo */ } } throw new Error('esbuild não encontrado') })()

const root = new URL('../../', import.meta.url)
const tsToModule = async (path) => {
  const { code } = esbuild.transformSync(readFileSync(new URL(path, root), 'utf8'), { loader: 'ts', format: 'esm' })
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))
}
const { planD0Welcome, checkVideoUrl, isValidHttpsUrl, D0_VIDEO_MAX_BYTES } = await tsToModule('supabase/functions/_shared/d0-welcome.ts')

const res = []; const ck = (n, ok, i = '') => { res.push(ok); console.log(`${ok ? '✅' : '❌'} ${n}${i ? ' — ' + i : ''}`) }
const URL_OK = 'https://mlqjywqnchilvgkbvicd.supabase.co/storage/v1/object/public/igv-media/acolhimento/boasvindas-igv.mp4'

// fetch simulado: responde conforme o cenário
const mkFetch = (scn) => async (url, init = {}) => {
  scn.calls.push({ url: String(url), method: init.method ?? 'GET', range: init.headers?.Range, redirect: init.redirect })
  if (scn.throws) { const e = new Error(scn.throws); e.name = scn.throws === 'abort' ? 'AbortError' : 'TypeError'; throw e }
  const rule = scn.byMethod?.[init.method ?? 'GET'] ?? scn
  const h = new Headers(rule.headers ?? {})
  return new Response(null, { status: rule.status ?? 200, headers: h })
}
const scn = (o) => ({ calls: [], ...o })

// ── 1. verificação do link ──
let s = scn({ status: 200, headers: { 'content-type': 'video/mp4', 'content-length': '4676784' } })
let r = await checkVideoUrl(URL_OK, mkFetch(s))
ck('link válido: 200, video/mp4, 4,68 MB → ok', r.ok && r.bytes === 4676784, JSON.stringify(r))
ck('verificação usa HEAD e não segue redirecionamento', s.calls[0].method === 'HEAD' && s.calls[0].redirect === 'manual')
s = scn({ byMethod: { HEAD: { status: 405 }, GET: { status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-0/4676784' } } } })
r = await checkVideoUrl(URL_OK, mkFetch(s))
ck('HEAD recusado (405) → GET Range 0-0 e lê o tamanho do Content-Range', r.ok && r.bytes === 4676784 && s.calls[1].range === 'bytes=0-0', JSON.stringify(r))
for (const [nome, o, motivo] of [
  ['arquivo inexistente (Storage devolve 400)', { status: 400, headers: { 'content-type': 'application/json' } }, 'http_400'],
  ['404', { status: 404 }, 'http_404'],
  ['500', { status: 500 }, 'http_500'],
  ['redirecionamento 301', { status: 301, headers: { location: 'http://x' } }, 'redirect_301'],
  ['tipo errado (text/html)', { status: 200, headers: { 'content-type': 'text/html', 'content-length': '10' } }, 'bad_content_type:text/html'],
  ['sem content-type', { status: 200, headers: { 'content-length': '10' } }, 'bad_content_type:none'],
  ['maior que 16 MB', { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(D0_VIDEO_MAX_BYTES + 1) } }, `too_large:${D0_VIDEO_MAX_BYTES + 1}`],
  ['arquivo vazio', { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': '0' } }, 'empty_file'],
]) {
  r = await checkVideoUrl(URL_OK, mkFetch(scn(o)))
  ck(`falha explícita: ${nome} → ${motivo}`, !r.ok && r.reason === motivo, r.reason)
}
r = await checkVideoUrl(URL_OK, mkFetch(scn({ throws: 'abort' })))
ck('timeout → reason timeout', !r.ok && r.reason === 'timeout')
r = await checkVideoUrl(URL_OK, mkFetch(scn({ throws: 'dns' })))
ck('erro de rede → reason network_error', !r.ok && r.reason === 'network_error')
for (const u of ['http://x.com/a.mp4', 'ftp://x/a.mp4', 'https://user:pw@x.com/a.mp4', 'not a url', '', null])
  ck(`URL inválida rejeitada sem chamar a rede: ${JSON.stringify(u)}`, !isValidHttpsUrl(u))
s = scn({ status: 200 }); r = await checkVideoUrl('http://x.com/a.mp4', mkFetch(s))
ck('http:// → invalid_url e nenhuma requisição', !r.ok && r.reason === 'invalid_url' && s.calls.length === 0)

// ── 2. plano D+0 ──
const okFetch = mkFetch(scn({ status: 200, headers: { 'content-type': 'video/mp4', 'content-length': '4676784' } }))
const badFetch = mkFetch(scn({ status: 404 }))
let p = await planD0Welcome({ meta_media: { acolhimento_boasvindas_video_url: URL_OK }, meta_templates: { acolhimento: 'acolhimento_boasvindas_v2' }, meta_media_ids: { acolhimento_boasvindas: '1770957757241974' } }, 'Maria', okFetch)
ck('vídeo por link tem prioridade sobre texto e media id; usa o template APROVADO acolhimento_boasvindas',
  p.kind === 'video_link' && p.template === 'acolhimento_boasvindas'
  && p.components[0].type === 'header' && p.components[0].parameters[0].video.link === URL_OK && !('id' in p.components[0].parameters[0].video)
  && p.components[1].parameters[0].text === 'Maria', JSON.stringify(p.components))
p = await planD0Welcome({ meta_media: { acolhimento_boasvindas_video_url: URL_OK }, meta_templates: { acolhimento: 'acolhimento_boasvindas_v2' } }, 'Maria', badFetch)
ck('vídeo configurado e indisponível → video_unavailable, SEM cair no template de texto', p.kind === 'video_unavailable' && p.reason === 'http_404', JSON.stringify(p))
p = await planD0Welcome({ meta_media: { acolhimento_boasvindas_video_url: 'http://inseguro/a.mp4' } }, 'Maria', okFetch)
ck('URL configurada inválida → video_unavailable (invalid_url), nunca texto', p.kind === 'video_unavailable' && p.reason === 'invalid_url')
p = await planD0Welcome({ meta_templates: { acolhimento: 'acolhimento_boasvindas_v2' } }, 'Ana', okFetch)
ck('sem vídeo configurado: template de texto, só corpo', p.kind === 'text_template' && p.components.length === 1 && p.components[0].type === 'body')
p = await planD0Welcome({ meta_media_ids: { acolhimento_boasvindas: '123' } }, 'Ana', okFetch)
ck('somente legado: media id com aviso de expiração', p.kind === 'legacy_media_id' && p.components[0].parameters[0].video.id === '123' && /expira/.test(p.warning))
p = await planD0Welcome({}, 'Ana', okFetch); ck('nada configurado → none (comportamento anterior)', p.kind === 'none')
p = await planD0Welcome(null, 'Ana', okFetch); ck('metadata nulo → none', p.kind === 'none')
p = await planD0Welcome({ meta_media: { acolhimento_boasvindas_video_url: URL_OK }, meta_templates: { acolhimento_video: 'outro_template_video' } }, 'Ana', okFetch)
ck('nome do template de vídeo pode ser trocado por metadata (sem deploy)', p.kind === 'video_link' && p.template === 'outro_template_video')

// ── 3. tryD0WelcomeTemplate do agent-acolhimento corrigido (extraída do arquivo, com stubs) ──
const src = readFileSync(new URL('docs/operacoes/agent-acolhimento-video-link/agent-acolhimento.index.v56+video-link.ts.txt', root), 'utf8')
const i0 = src.indexOf('async function tryD0WelcomeTemplate'), i1 = src.indexOf('async function processJourney')
const fnJs = esbuild.transformSync(src.slice(i0, i1), { loader: 'ts' }).code
const mkEnv = ({ metadata, person = { first_name: 'Joana', name: 'Joana Silva' }, enqueueOk = true }) => {
  const log = { enqueue: [], advance: [], err: [], warn: [], out: [] }
  const q = (data) => { const o = { select: () => o, eq: () => o, order: () => o, limit: () => o, maybeSingle: async () => ({ data }) }; return o }
  const supabaseAdmin = { from: (t) => t === 'church_whatsapp_channels' ? q({ metadata }) : q(person) }
  const executeTool = async (name, args) => {
    if (name === 'enqueue_message') { log.enqueue.push(args); return enqueueOk ? { ok: true } : { ok: false, error: 'queue_down' } }
    log.advance.push(args); return { ok: true }
  }
  const console2 = { log: (...a) => log.out.push(a.join(' ')), warn: (...a) => log.warn.push(a.join(' ')), error: (...a) => log.err.push(a.join(' ')) }
  const make = new Function('supabaseAdmin', 'executeTool', 'planD0Welcome', 'AGENT_SLUG', 'console', fnJs + '\nreturn tryD0WelcomeTemplate')
  return { log, run: (fetchFn) => make(supabaseAdmin, executeTool, (m, n) => planD0Welcome(m, n, fetchFn), 'agent-acolhimento', console2)('church-1', 'person-1', 'journey-1') }
}
let env = mkEnv({ metadata: { meta_media: { acolhimento_boasvindas_video_url: URL_OK } } })
let out = await env.run(okFetch)
let sent = env.log.enqueue[0] && JSON.parse(env.log.enqueue[0].message)
ck('envio com vídeo OK: enfileira template aprovado com header video.link + corpo com o primeiro nome',
  out === 'D0_template_dispatched' && sent.name === 'acolhimento_boasvindas' && sent.language === 'pt_BR'
  && sent.components[0].parameters[0].video.link === URL_OK && sent.components[1].parameters[0].text === 'Joana', JSON.stringify(sent))
ck('texto do corpo não é alterado: só o parâmetro {{1}}', sent.components[1].parameters.length === 1 && sent.components[1].type === 'body')
ck('jornada avança para D+3 com o resumo "vídeo por link"', env.log.advance[0].next_touchpoint === 'D+3' && /vídeo por link/.test(env.log.advance[0].touchpoint_summary))

env = mkEnv({ metadata: { meta_media: { acolhimento_boasvindas_video_url: URL_OK }, meta_templates: { acolhimento: 'acolhimento_boasvindas_v2' } } })
out = await env.run(badFetch)
ck('vídeo indisponível: NADA é enfileirado e a jornada não avança', out && typeof out === 'object' && out.status === 'video_unavailable' && env.log.enqueue.length === 0 && env.log.advance.length === 0, JSON.stringify(out))
ck('vídeo indisponível: erro identificável no log (VIDEO_INDISPONIVEL + motivo + url + pessoa)', env.log.err.some(l => /VIDEO_INDISPONIVEL/.test(l) && /http_404/.test(l) && l.includes(URL_OK) && /person-1/.test(l)), env.log.err[0]?.slice(0, 120))
ck('vídeo indisponível: não retorna null (sem fallback silencioso para texto livre do Claude)', out !== null)

env = mkEnv({ metadata: { meta_media: { acolhimento_boasvindas_video_url: URL_OK } }, enqueueOk: false })
out = await env.run(okFetch)
ck('falha ao enfileirar com vídeo: falha explícita (objeto), não null', out && typeof out === 'object' && out.status === 'enqueue_failed' && out.reason === 'queue_down', JSON.stringify(out))

env = mkEnv({ metadata: { meta_templates: { acolhimento: 'acolhimento_boasvindas_v2' } } })
out = await env.run(okFetch); sent = JSON.parse(env.log.enqueue[0].message)
ck('sem vídeo configurado: template de texto como antes (só body)', out === 'D0_template_dispatched' && sent.name === 'acolhimento_boasvindas_v2' && sent.components.length === 1)
env = mkEnv({ metadata: { meta_media_ids: { acolhimento_boasvindas: '999' } } })
out = await env.run(okFetch); sent = JSON.parse(env.log.enqueue[0].message)
ck('legado por media id continua funcionando e avisa', out === 'D0_template_dispatched' && sent.components[0].parameters[0].video.id === '999' && env.log.warn.some(l => /legado/.test(l)))
env = mkEnv({ metadata: {} }); out = await env.run(okFetch)
ck('nada configurado: null (Claude), como antes', out === null && env.log.enqueue.length === 0)
env = mkEnv({ metadata: { meta_media: { acolhimento_boasvindas_video_url: URL_OK } }, person: { first_name: null, name: null } })
out = await env.run(okFetch); sent = JSON.parse(env.log.enqueue[0].message)
ck('sem nome: usa "amigo"', sent.components[1].parameters[0].text === 'amigo')

// ── 4. chamador: trata o objeto de falha (checagem estática do patch) ──
const callerIdx = src.indexOf("typeof d0Result === 'object'")
const caller = src.slice(callerIdx - 80, callerIdx + 1100)
ck('chamador: reagenda em 1 h como pending, registra status error e não debita créditos',
  /status: 'pending'/.test(caller) && /next_touchpoint_at: retryAt/.test(caller) && /status: 'error'/.test(caller) && /d0_video_/.test(caller) && !/debit_agent_credits/.test(caller))
ck('chamador: o objeto de falha é tratado ANTES do ramo de sucesso (que debita créditos)',
  src.indexOf("typeof d0Result === 'object'") < src.indexOf("p_operation_type: 'touchpoint'") )

// ── 5. (opcional) URL pública real, somente leitura ──
if (process.env.IGV_VIDEO_LIVE === '1') {
  const live = await checkVideoUrl(URL_OK)
  ck('LIVE: URL pública do Storage passa na verificação', live.ok && live.bytes === 4676784, JSON.stringify(live))
  const g = await fetch(URL_OK, { redirect: 'manual' }); const buf = Buffer.from(await g.arrayBuffer())
  const sha = createHash('sha256').update(buf).digest('hex')
  ck('LIVE: arquivo servido é idêntico (sha256) à cópia original da Meta', sha === (process.env.IGV_VIDEO_SHA256 ?? 'c72627f00ebbdfaf7157566510a1059caae9363b173d25cb6118e95401726a7a'), sha.slice(0, 16))
  const plan = await planD0Welcome({ meta_media: { acolhimento_boasvindas_video_url: URL_OK } }, 'Teste')
  ck('LIVE: plano D+0 contra a URL real = video_link', plan.kind === 'video_link')
}

const falhou = res.filter(x => !x).length
console.log(`\n=== ${res.length - falhou}/${res.length} OK ===`)
process.exit(falhou ? 1 : 0)
