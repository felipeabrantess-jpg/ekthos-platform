// node supabase/functions/visitor-capture/log-mask.test.ts   (Node 22+; não executa a função nem toca o banco)
import { maskPhone, maskIp } from './log-mask.ts'
import { readFileSync } from 'node:fs'

let fail = 0
const ck = (n: string, ok: boolean, info = '') => { if (!ok) fail++; console.log(`${ok ? '✅' : '❌'} ${n}${info ? ' — ' + info : ''}`) }

ck('celular BR com DDI', maskPhone('+5521998765432') === '+55*******5432', maskPhone('+5521998765432'))
ck('fixo BR sem 9º dígito', maskPhone('+552198765432') === '+55******5432', maskPhone('+552198765432'))
ck('sem "+"', maskPhone('21998765432') === '21*****5432', maskPhone('21998765432'))
ck('curto/vazio/nulo não vaza', maskPhone('1234') === '****' && maskPhone('') === '****' && maskPhone(null) === '****')
ck('telefone mascarado não contém o número do meio', !maskPhone('+5521998765432').includes('99876'))
ck('IPv4', maskIp('189.12.34.56') === '189.12.*.*', maskIp('189.12.34.56'))
ck('IPv6', maskIp('2804:14c:65:1::1') === '2804:14c:*', maskIp('2804:14c:65:1::1'))
ck('IP vazio', maskIp('') === '*' && maskIp(undefined) === '*')

// nenhum console.* da função recebe phoneClean / phone / existing.phone / ip sem máscara
const src = readFileSync(new URL('./index.ts', import.meta.url), 'utf8')
const logs = src.split('\n').filter(l => /console\.(log|warn|error|info)\(/.test(l))
const vaza = logs.filter(l => /,\s*(phoneClean|phone|existing\.phone|ip|email|name)\s*[,)]/.test(l))
ck(`nenhum dos ${logs.length} logs imprime telefone/IP/e-mail/nome sem máscara`, vaza.length === 0, vaza.join(' | '))

console.log(`\n=== ${fail ? 'FALHOU' : 'OK'} ===`)
process.exit(fail ? 1 : 0)
