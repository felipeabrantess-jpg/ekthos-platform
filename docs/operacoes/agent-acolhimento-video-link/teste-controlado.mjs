// Teste CONTROLADO de recebimento do vídeo de boas-vindas (acolhimento_boasvindas por link HTTPS).
//
// Envia UMA mensagem do número oficial da IGV (Phone Number ID 1282611328279429) para UM número autorizado,
// com exatamente o payload que o agent-acolhimento enfileira (montado por planD0Welcome, mesma verificação do link).
// Não ativa canal nem agente, não toca em jornadas nem no banco.
//
// Padrão = DRY-RUN (não envia). Para enviar de verdade, TODAS as condições:
//   META_TOKEN   token do System User (variável de ambiente; nunca é impresso)
//   TO_PHONE     número autorizado em E.164, ex.: 5521999999999
//   NOME         primeiro nome para o {{1}} (ex.: Felipe)
//   CONFIRMO_ENVIO=SIM
//
// Uso:  node teste-controlado.mjs                                   (dry-run: mostra payload e verifica o link)
//       META_TOKEN=… TO_PHONE=… NOME=… CONFIRMO_ENVIO=SIM node teste-controlado.mjs
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const esbuild = (() => { for (const p of ['esbuild', '../../../web/node_modules/esbuild', 'C:/Users/felip/ekthos-platform/web/node_modules/esbuild']) { try { return require(p) } catch { /* próximo */ } } throw new Error('esbuild não encontrado') })()
const { code } = esbuild.transformSync(readFileSync(new URL('../../../supabase/functions/_shared/d0-welcome.ts', import.meta.url), 'utf8'), { loader: 'ts', format: 'esm' })
const { planD0Welcome } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))

const PHONE_NUMBER_ID = '1282611328279429'
const VIDEO_URL = 'https://mlqjywqnchilvgkbvicd.supabase.co/storage/v1/object/public/igv-media/acolhimento/boasvindas-igv.mp4'
const nome = (process.env.NOME || 'Teste').trim() || 'Teste'
const to = (process.env.TO_PHONE || '').replace(/\D/g, '')
const mask = p => (p ? p.slice(0, 4) + '*****' + p.slice(-2) : '(não informado)')

const plan = await planD0Welcome({ meta_media: { acolhimento_boasvindas_video_url: VIDEO_URL } }, nome)
if (plan.kind !== 'video_link') { console.error('ABORTADO: o vídeo não passou na verificação →', JSON.stringify(plan)); process.exit(2) }
const body = {
  messaging_product: 'whatsapp', to, type: 'template',
  template: { name: plan.template, language: { code: 'pt_BR' }, components: plan.components },
}
console.log('Verificação do link: OK (' + plan.bytes + ' bytes)')
console.log('Destino:', mask(to), '| De (Phone Number ID):', PHONE_NUMBER_ID)
console.log('Payload:', JSON.stringify({ ...body, to: mask(to) }, null, 1))

const enviar = process.env.CONFIRMO_ENVIO === 'SIM'
if (!enviar) { console.log('\nDRY-RUN: nada foi enviado. Defina CONFIRMO_ENVIO=SIM, META_TOKEN e TO_PHONE para o envio real.'); process.exit(0) }
if (!process.env.META_TOKEN) { console.error('ABORTADO: META_TOKEN ausente'); process.exit(3) }
if (!/^55\d{10,11}$/.test(to)) { console.error('ABORTADO: TO_PHONE deve ser E.164 brasileiro (55 + DDD + número)'); process.exit(4) }

const r = await fetch(`https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`, {
  method: 'POST', headers: { Authorization: 'Bearer ' + process.env.META_TOKEN, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
})
const j = await r.json().catch(() => ({}))
const limpa = s => String(s ?? '').split(process.env.META_TOKEN).join('[removido]')
if (j.error) { console.error('ERRO DA META:', r.status, `${j.error.code}/${j.error.error_subcode ?? ''}`, limpa(j.error.message), limpa(j.error.error_user_msg)); process.exit(1) }
console.log('ACEITO PELA META:', r.status, JSON.stringify({ message_id: j.messages?.[0]?.id, wa_id: j.contacts?.[0]?.wa_id ? mask(j.contacts[0].wa_id) : null }))
console.log('Confirme no aparelho: o vídeo (22 s, vertical) deve aparecer no cabeçalho e tocar.')
