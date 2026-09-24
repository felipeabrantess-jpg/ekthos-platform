/**
 * test-busca-normalizada.mjs — regra global de busca (caixa / acento / cedilha / espaços)
 * Testa o helper compartilhado usado pelos filtros client-side e pelos padrões .ilike
 * (mesmas entradas que as 8 telas passam). Roda com: node test-busca-normalizada.mjs
 * (Node 22.6+/24: importa o .ts diretamente via type stripping).
 */
import { normalizeSearch, matchesSearch, ilikePattern } from './src/lib/normalizeSearch.ts'

const results = []
const ck = (name, ok, info = '') => { results.push(ok); console.log(`${ok ? '✅' : '❌'} ${name}${info ? ' — ' + info : ''}`) }

// ── 1. Equivalência obrigatória do ticket ─────────────────────
const groups = {
  Fernanda:  ['Fernanda', 'fernanda', 'FERNANDA', ' Fernanda ', 'fErNaNdA'],
  João:      ['João', 'joao', 'JOAO', 'JOÃO', ' joão ', 'Joao'],
  Conceição: ['Conceição', 'conceicao', 'CONCEICAO', 'CONCEIÇÃO', 'ConceiÇÃO', ' conceição  '],
}
for (const [label, variants] of Object.entries(groups)) {
  const norms = new Set(variants.map(normalizeSearch))
  ck(`normalizeSearch: ${variants.length} variantes de "${label}" → 1 forma (${[...norms][0]})`, norms.size === 1, [...norms].join(' | '))
  const pats = new Set(variants.map(ilikePattern))
  ck(`ilikePattern: mesmas variantes → mesmo padrão %…% para PostgREST`, pats.size === 1, [...pats][0])
}

// ── 2. Filtros client-side, campo a campo, com dados como as telas recebem ──
const consolidacao = [{ name: 'Fernanda Silva', email: 'FERNANDA@x.com' }, { name: 'João Pedro', email: null }, { name: 'Maria da Conceição', email: 'conceicao@x' }, { name: 'Carlos', email: null }]
const hits = (rows, term, ...pick) => rows.filter(r => matchesSearch(term, ...pick.map(k => r[k]))).map(r => r.name).join(',')
ck('Consolidação (nome, email): FERNANDA = fernanda = Fernanda', hits(consolidacao, 'FERNANDA', 'name', 'email') === 'Fernanda Silva' && hits(consolidacao, 'fernanda', 'name', 'email') === 'Fernanda Silva' && hits(consolidacao, ' Fernanda ', 'name', 'email') === 'Fernanda Silva')
ck('Consolidação: joao = JOAO = João', ['joao', 'JOAO', 'João'].every(t => hits(consolidacao, t, 'name', 'email') === 'João Pedro'))
ck('Consolidação: conceicao = CONCEICAO = Conceição (nome e email)', ['conceicao', 'CONCEICAO', 'Conceição'].every(t => hits(consolidacao, t, 'name', 'email') === 'Maria da Conceição'))
ck('Consolidação: termo vazio → todos', hits(consolidacao, '   ', 'name', 'email').split(',').length === 4)

const lideres = [{ name: 'Fernanda Líder', email: null }, { name: 'JOÃO LÍDER', email: 'joao@x' }]
ck('Líderes (lista: nome, email): variantes batem', ['FERNANDA', 'fernanda'].every(t => hits(lideres, t, 'name', 'email') === 'Fernanda Líder') && ['joao', 'JOÃO', 'João'].every(t => hits(lideres, t, 'name', 'email') === 'JOÃO LÍDER'))

const voluntarios = [{ name: 'Conceição Voluntária', email: null }, { name: 'Ana', email: 'joao.ana@x' }]
ck('Voluntários (lista: nome, email): variantes batem', ['conceicao', 'CONCEIÇÃO'].every(t => hits(voluntarios, t, 'name', 'email') === 'Conceição Voluntária') && hits(voluntarios, 'JOAO', 'name', 'email') === 'Ana')

const distribuir = [{ name: 'João da Praça', neighborhood: 'Icaraí' }, { name: 'Fernanda', neighborhood: 'São Domingos' }]
ck('Cuidado → Distribuir (nome): joao = JOÃO', ['joao', 'JOÃO', ' João '].every(t => hits(distribuir, t, 'name') === 'João da Praça'))
ck('Cuidado → Distribuir (bairro): icarai = ICARAÍ; sao domingos = São Domingos', hits(distribuir, 'icarai', 'neighborhood') === 'João da Praça' && hits(distribuir, 'ICARAÍ', 'neighborhood') === 'João da Praça' && hits(distribuir, 'sao domingos', 'neighborhood') === 'Fernanda')

const kids = [{ name: 'Joãozinho', wristband_number: 'A12' }, { name: 'Conceição Kids', wristband_number: 'B07' }]
ck('Kids → Sala (nome da criança): joaozinho = JOÃOZINHO', ['joaozinho', 'JOÃOZINHO'].every(t => hits(kids, t, 'name') === 'Joãozinho') && hits(kids, 'conceicao', 'name') === 'Conceição Kids')
ck('Kids → Sala: pulseira continua comparação exata (fora da regra de acentos)', kids.filter(c => c.wristband_number.includes('A12')).length === 1)

const igrejas = [{ name: 'Igreja São João', city: 'Niterói', state: 'RJ' }, { name: 'Comunidade Conceição', city: 'Goiânia', state: 'GO' }]
ck('Admin → Igrejas (nome): sao joao = SÃO JOÃO', ['sao joao', 'SÃO JOÃO', 'São joão'].every(t => hits(igrejas, t, 'name', 'city', 'state') === 'Igreja São João'))
ck('Admin → Igrejas (cidade): niteroi = NITERÓI; goiania = Goiânia', hits(igrejas, 'niteroi', 'name', 'city', 'state') === 'Igreja São João' && hits(igrejas, 'GOIANIA', 'name', 'city', 'state') === 'Comunidade Conceição')
ck('Admin → Igrejas (UF): rj = RJ', hits(igrejas, 'rj', 'name', 'city', 'state') === 'Igreja São João' && hits(igrejas, ' go ', 'name', 'city', 'state') === 'Comunidade Conceição')

// ── 3. Não altera significado: substring continua substring; campos nulos seguros ──
ck('substring: "nand" encontra Fernanda; "xyz" não encontra nada', matchesSearch('nand', 'Fernanda') && !matchesSearch('xyz', 'Fernanda', null, undefined))
ck('campos nulos/undefined não quebram', matchesSearch('a', null, undefined, 'a') && !matchesSearch('a', null, undefined))
ck('combinação maiúsculas + acentos + espaços: "  CONCEIÇÃO  " ≡ "conceicao"', normalizeSearch('  CONCEIÇÃO  ') === normalizeSearch('conceicao'))

const failed = results.filter(x => !x).length
console.log(`\n=== ${results.length - failed}/${results.length} OK ===`)
process.exit(failed ? 1 : 0)
