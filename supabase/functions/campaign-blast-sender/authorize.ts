// ============================================================
// Regra de autorização do campaign-blast-sender (sem I/O — testável sem disparo real).
//   1. Só um ADMIN logado da MESMA igreja da campanha pode disparar.
//   2. Destinatário com person_id: pessoa ativa da igreja da campanha, e o telefone
//      enviado tem de ser o telefone cadastrado dela (o envio usa o telefone do banco).
//   3. Sem person_id = número de TESTE: no máximo MAX_TEST_SENDS por campanha.
// ============================================================

export const MAX_TEST_SENDS = 5

export function digits(raw: string): string {
  const d = String(raw ?? '').replace(/\D/g, '')
  return d.startsWith('55') ? d : `55${d}`
}

export interface AuthorizeInput {
  blastChurchId: string
  callerChurchId: string | null
  callerRole: string | null
  phone: string
  person: { church_id: string; phone: string | null; deleted_at: string | null; left_at: string | null } | null
  personIdGiven: boolean
  testSendsSoFar: number
}

export type AuthorizeResult =
  | { ok: true; phone: string }
  | { ok: false; status: 401 | 403 | 422 | 429; error: string }

export function authorizeSend(i: AuthorizeInput): AuthorizeResult {
  if (!i.callerChurchId || !i.callerRole) return { ok: false, status: 401, error: 'não autenticado' }
  if (i.callerChurchId !== i.blastChurchId) return { ok: false, status: 403, error: 'campanha de outra igreja' }
  if (i.callerRole !== 'admin') return { ok: false, status: 403, error: 'somente administradores podem disparar campanhas' }

  if (i.personIdGiven) {
    const p = i.person
    if (!p || p.church_id !== i.blastChurchId || p.deleted_at || p.left_at || !p.phone) {
      return { ok: false, status: 422, error: 'destinatário não pertence a esta campanha' }
    }
    if (digits(p.phone) !== digits(i.phone)) {
      return { ok: false, status: 422, error: 'telefone não confere com o cadastro do destinatário' }
    }
    return { ok: true, phone: p.phone }
  }

  if (i.testSendsSoFar >= MAX_TEST_SENDS) {
    return { ok: false, status: 429, error: `limite de ${MAX_TEST_SENDS} envios de teste por campanha atingido` }
  }
  return { ok: true, phone: i.phone }
}
