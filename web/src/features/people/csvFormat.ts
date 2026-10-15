/**
 * csvFormat — formatação CSV compatível com o Excel em português do Brasil. Sem dependências.
 *
 * Por que ";": o Excel pt-BR usa o separador de lista do Windows (";", porque a vírgula é o separador decimal).
 * Um CSV com "," abre inteiro na coluna A. Mesmo assim o arquivo continua sendo CSV válido (RFC 4180) com outro
 * delimitador, e o app já grava BOM UTF-8 + text/csv;charset=utf-8 (acentos preservados).
 *
 * Regras:
 *  - todo campo vai entre aspas duplas; aspas internas são duplicadas ("" ) → ";" , "," e aspas dentro do dado são seguros;
 *  - quebras de linha dentro de um campo viram "\n" (o Excel mantém dentro da célula); o fim de linha do registro é "\r\n";
 *  - proteção contra injeção de fórmula (OWASP "CSV injection"): texto livre que começa com = + - @ TAB ou CR recebe
 *    um apóstrofo à frente. Nomes e e-mails vêm de formulários públicos (QR / seja-membro), então isso é necessário;
 *  - telefone: o Excel converte "+5521966900021" / "21966900021" em número (notação científica, perde o "+"). Telefones
 *    brasileiros reconhecíveis saem no formato "+55 (21) 96690-0021" / "(21) 96690-0021", que o Excel mantém como texto.
 *    Valores não reconhecíveis (ex.: "972860835") saem exatamente como estão.
 */

export const CSV_DELIMITER = ';'
export const CSV_NEWLINE = '\r\n'

/** Escapa um valor (RFC 4180): aspas duplas sempre, aspas internas duplicadas, quebras normalizadas para \n. */
export const csvCell = (v: unknown): string =>
  `"${String(v ?? '').replace(/\r\n?/g, '\n').replace(/"/g, '""')}"`

/** Prefixa com apóstrofo texto que o Excel interpretaria como fórmula. */
export function protectFormula(v: unknown): string {
  const s = String(v ?? '')
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
}

/**
 * Telefone legível e seguro para o Excel. Só reformata quando é um número brasileiro reconhecível
 * (10–11 dígitos nacionais, com ou sem o DDI 55); qualquer outro valor é devolvido intacto.
 */
export function formatPhoneForExcel(raw: string | null | undefined): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  const digits = s.replace(/\D/g, '')
  // "+" explícito com DDI diferente de 55 = número estrangeiro: devolve intacto
  if (s.startsWith('+') && !digits.startsWith('55')) return s
  let national = digits
  let ddi = false
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) { national = digits.slice(2); ddi = true }
  if (national.length !== 10 && national.length !== 11) return s
  // número nacional começando em 0 (ex.: "02119643512") não é um telefone válido: não reformata
  if (national.startsWith('0')) return s
  const ddd = national.slice(0, 2)
  const rest = national.slice(2)
  const local = rest.length === 9 ? `${rest.slice(0, 5)}-${rest.slice(5)}` : `${rest.slice(0, 4)}-${rest.slice(4)}`
  return `${ddi ? '+55 ' : ''}(${ddd}) ${local}`
}

/** Junta linhas já formatadas em texto CSV (sem BOM; o BOM é prefixado por quem grava o arquivo). */
export function toCsvText(lines: string[][]): string {
  return lines.map(l => l.map(csvCell).join(CSV_DELIMITER)).join(CSV_NEWLINE)
}
