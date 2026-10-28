// node supabase/functions/campaign-blast-sender/authorize.test.ts   (Node 22+, sem disparo real)
import { authorizeSend, MAX_TEST_SENDS } from './authorize.ts'

const IGV = 'igv', OUTRA = 'outra'
const pessoa = { church_id: IGV, phone: '+55 (21) 99999-0001', deleted_at: null, left_at: null }
const base = { blastChurchId: IGV, callerChurchId: IGV, callerRole: 'admin', phone: '+5521999990001', person: pessoa, personIdGiven: true, testSendsSoFar: 0 }
const cases: [string, Parameters<typeof authorizeSend>[0], boolean, number?][] = [
  ['admin da igreja → pessoa da campanha', base, true],
  ['sem login (anon) → 401', { ...base, callerChurchId: null, callerRole: null }, false, 401],
  ['admin de OUTRA igreja → 403 (isolamento)', { ...base, callerChurchId: OUTRA }, false, 403],
  ['perfil não-admin (secretary) → 403', { ...base, callerRole: 'secretary' }, false, 403],
  ['ministry_leader → 403', { ...base, callerRole: 'ministry_leader' }, false, 403],
  ['person_id de outra igreja → 422', { ...base, person: { ...pessoa, church_id: OUTRA } }, false, 422],
  ['person_id inexistente → 422', { ...base, person: null }, false, 422],
  ['pessoa excluída → 422', { ...base, person: { ...pessoa, deleted_at: '2026-10-26' } }, false, 422],
  ['pessoa que saiu → 422', { ...base, person: { ...pessoa, left_at: '2026-10-01' } }, false, 422],
  ['telefone trocado (person_id válido + número qualquer) → 422', { ...base, phone: '+5511988887777' }, false, 422],
  ['teste sem person_id dentro do limite', { ...base, personIdGiven: false, person: null, testSendsSoFar: MAX_TEST_SENDS - 1 }, true],
  ['teste sem person_id acima do limite → 429', { ...base, personIdGiven: false, person: null, testSendsSoFar: MAX_TEST_SENDS }, false, 429],
  ['teste por admin de outra igreja → 403', { ...base, personIdGiven: false, person: null, callerChurchId: OUTRA }, false, 403],
]
let fail = 0
for (const [n, input, ok, status] of cases) {
  const r = authorizeSend(input)
  const pass = r.ok === ok && (ok || (!r.ok && r.status === status))
  if (!pass) fail++
  console.log(`${pass ? '✅' : '❌'} ${n}${pass ? '' : ' — ' + JSON.stringify(r)}`)
}
const r0 = authorizeSend(base)
const usesDb = r0.ok && r0.phone === pessoa.phone
console.log(`${usesDb ? '✅' : '❌'} envio usa o telefone do CADASTRO, não o do corpo da requisição`); if (!usesDb) fail++
console.log(`\n=== ${cases.length + 1 - fail}/${cases.length + 1} OK ===`)
process.exit(fail ? 1 : 0)
