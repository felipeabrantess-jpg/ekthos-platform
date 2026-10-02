// Regra cadastral: dentro da mesma igreja, 1 pessoa = 1 telefone.
// O banco é a última barreira (trigger people_enforce_unique_phone + índice
// people_church_phone_unique); aqui ficam só a forma canônica e a tradução do erro.

export const PHONE_TAKEN_MESSAGE = 'Este telefone já está vinculado a uma pessoa cadastrada.'

/**
 * Forma canônica do telefone — espelha normalize_phone_br() / people.phone_normalized:
 * só dígitos, sem zeros à esquerda e sem o DDI 55 (quando há 12 ou 13 dígitos).
 * "+55 (21) 99999-9999", "5521999999999" e "21999999999" → "21999999999".
 */
export function phoneKey(raw: string | null | undefined): string {
  const d = (raw ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d
}

/** Erro do banco para telefone que já pertence a outra pessoa da igreja. */
export function isPhoneTakenError(err: unknown): boolean {
  const e = (err ?? {}) as { code?: string; message?: string }
  const msg = typeof err === 'string' ? err : String(e.message ?? '')
  return (
    msg.includes('PHONE_ALREADY_LINKED') ||
    msg.includes('people_church_phone_unique') ||
    msg.includes('people_church_phone_normalized_unique') ||
    msg === PHONE_TAKEN_MESSAGE
  )
}

export class PhoneTakenError extends Error {
  constructor() {
    super(PHONE_TAKEN_MESSAGE)
    this.name = 'PhoneTakenError'
  }
}
