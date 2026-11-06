// Cópia de web/src/lib/igv-validacao.ts (mesmas regras do app). Mantenha as duas iguais.
/** DDDs existentes no Brasil (Anatel). */
const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

const PARTICULAS = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
const PALAVRAS_PROIBIDAS = new Set(['teste', 'test', 'testes', 'asdf', 'qwerty', 'xpto', 'fulano', 'ciclano', 'beltrano', 'nome', 'sobrenome'])
const TECLADO = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const VOGAL = /[aeiouáàâãéêíóôõúü]/   // y só conta como vogal no fim (Rosy, Mary)

function palavraValida(p: string): boolean {
  const w = p.toLowerCase()
  const letras = w.replace(/['’`´.-]/g, '')
  if (letras.length < 2 || letras.length > 20) return false
  if (PALAVRAS_PROIBIDAS.has(letras)) return false
  if (!VOGAL.test(letras) && !/y$/.test(letras)) return false
  if (/(.)\1\1/.test(letras)) return false                                // aaa, kkk
  if (/[^aeiouyáàâãéêíóôõúü]{5,}/.test(letras)) return false              // 5+ consoantes seguidas
  const vogais = (letras.match(/[aeiouyáàâãéêíóôõúü]/g) ?? []).length
  if (letras.length >= 4 && vogais / letras.length < 0.14) return false
  for (const linha of TECLADO) {
    for (let i = 0; i + 4 <= linha.length; i++) if (letras.includes(linha.slice(i, i + 4))) return false
  }
  return true
}

/** Nome e sobrenome reais: só letras (acentos, hífen e apóstrofo), 2+ palavras com cara de nome. */
export function nomeCompleto(v: string): boolean {
  const nome = (v ?? '').trim().replace(/\s+/g, ' ')
  if (!nome || !/^[\p{L}'’`´ .-]+$/u.test(nome)) return false
  // Iniciais (S, S., Q.R.) e partículas (da, de, dos) não contam como palavra do nome
  const inicial = (p: string) => /^(\p{L}\.*)+$/u.test(p) && p.replace(/\./g, '').length <= 2 && (p.length === 1 || p.includes('.'))
  const principais = nome.split(' ').filter(p => !PARTICULAS.has(p.toLowerCase()) && !inicial(p))
  if (principais.length < 2) return false
  return principais.every(palavraValida)
}

/** Normaliza para os dígitos nacionais (DDD + número), removendo o 55 do DDI. null se impossível. */
export function digitosTelefoneBR(v: string): string | null {
  let d = (v ?? '').replace(/\D/g, '')
  if (d.length > 13) return null
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if (d.length !== 10 && d.length !== 11) return null
  return d
}

function sequenciaObvia(s: string): boolean {
  if (/^(\d)\1*$/.test(s)) return true
  return '0123456789'.includes(s) || '9876543210'.includes(s) ||
    /12345678|23456789|87654321|98765432/.test(s)
}

/** Telefone brasileiro com DDD válido; celular (11 dígitos) começa com 9. */
export function telefoneBR(v: string): boolean {
  const d = digitosTelefoneBR(v)
  if (!d) return false
  if (/^(\d)\1*$/.test(d)) return false
  if (!DDDS.has(Number(d.slice(0, 2)))) return false
  const numero = d.slice(2)
  if (d.length === 11 && numero[0] !== '9') return false
  if (d.length === 10 && !/^[2-5]/.test(numero)) return false
  if (sequenciaObvia(numero)) return false
  if (d.length === 11 && sequenciaObvia(numero.slice(1))) return false
  return true
}

