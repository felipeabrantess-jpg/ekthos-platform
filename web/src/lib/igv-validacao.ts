/**
 * Validação compartilhada dos formulários públicos da IGV (/igv).
 * Funções puras: retornam true/false; as mensagens ficam em IGV_MSG.
 */

export const IGV_MSG = {
  nome:     'Digite nome e sobrenome.',
  telefone: 'Digite um telefone válido com DDD, ex.: (21) 99999-9999.',
} as const

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

/** Pelo menos duas palavras com 2+ letras cada. */
export function nomeCompleto(v: string): boolean {
  const palavras = (v ?? '').trim().split(/\s+/).filter(p => (p.match(/\p{L}/gu) ?? []).length >= 2)
  return palavras.length >= 2
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

/** Máscara de digitação: (21) 99999-9999 / (21) 3234-5678. Remove o 55 do DDI colado. */
export function mascaraTelefoneBR(value: string): string {
  let all = (value ?? '').replace(/\D/g, '')
  if ((all.length === 12 || all.length === 13) && all.startsWith('55')) all = all.slice(2)
  const d = all.slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2)  return `(${d}`
  if (d.length <= 6)  return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}
