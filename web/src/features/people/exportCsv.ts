/**
 * exportCsv — monta o CSV de Pessoas a partir do payload da RPC export_people_rows.
 *
 * Itens 21 / 18 / 25:
 *  - 1 pessoa = 1 linha; o universo é exatamente o da lista (a RPC aplica os mesmos filtros);
 *  - sem corte de 1.000 linhas: a RPC devolve um escalar jsonb, não linhas;
 *  - contatos ILIMITADOS em colunas dinâmicas "Nº contato — data / resultado / responsável",
 *    até o maior ordinal do universo exportado (max_contacts), sem limite artificial;
 *  - ministérios (ministry_members ⟶ ministries) concatenados com " | " em ordem de nome;
 *  - responsável = ator persistido no evento, nome resolvido no banco (nunca o owner da jornada);
 *  - data do contato = regra canônica de get_person_contacts (contact_date, senão created_at).
 * Toda regra de negócio vem do banco; aqui só há formatação.
 */
import { getCareStatusBadge } from './hooks/useAcolhimentoStatus'
import { resultLabel, channelLabel } from '@/features/atendimento/contactLabels'
import { UNIT_ALL, UNIT_NONE, type UnitScope } from '@/lib/filters/unitScope'

export interface ExportContact {
  ordinal: number
  event_id: string
  contact_date: string
  result: string | null
  channel: string | null
  notes: string | null
  actor_id: string | null
  actor_name: string
}

export interface ExportRow {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  etapa: string | null
  care_state: string | null
  care_alert: boolean
  /** unidade cadastral (referência) */
  unit_id: string | null
  /** unidade OPERACIONAL (cutoff aplicado no banco) — é a que vai para a coluna "Unidade" */
  unit_operational_id?: string | null
  unit_name: string | null
  first_visit_date: string | null
  created_at: string
  source: string | null
  ministerios: string
  contacts_count: number
  contacts: ExportContact[]
}

export interface ExportPayload {
  total: number
  max_contacts: number
  alert_threshold_hours?: number
  rows: ExportRow[]
}

const SOURCE_LABEL: Record<string, string> = { qr_code: 'QR Code', manual: 'Manual', import_xlsx: 'Importação' }

const pad = (n: number) => String(n).padStart(2, '0')
/** dd/mm/aaaa (data civil, sem fuso) */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (m && iso.length === 10) return `${m[3]}/${m[2]}/${m[1]}`
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return iso
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}
/** dd/mm/aaaa hh:mm no fuso do navegador */
export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso); if (Number.isNaN(d.getTime())) return iso
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Escapa um valor para CSV (RFC 4180): aspas duplas sempre, aspas internas duplicadas. */
export const csvCell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`

export const ordinalLabel = (n: number) => `${n}º contato`

export function buildPeopleHeader(maxContacts: number, alertHours = 48): string[] {
  const header = [
    'Nome', 'Telefone', 'Email', 'Etapa', 'Atendimento', `Sem contato +${alertHours}h`, 'Unidade', 'Ministérios',
    'Primeira visita', 'Cadastro', 'Origem', 'Qtd contatos',
  ]
  for (let n = 1; n <= maxContacts; n++) {
    header.push(`${ordinalLabel(n)} — data`, `${ordinalLabel(n)} — resultado`, `${ordinalLabel(n)} — responsável`)
  }
  return header
}

export function buildPeopleRow(r: ExportRow, maxContacts: number): string[] {
  const row = [
    r.name ?? '', r.phone ?? '', r.email ?? '', r.etapa ?? '',
    getCareStatusBadge(r.care_state)?.label ?? 'Não atendida',
    r.care_alert ? 'Sim' : 'Não',
    r.unit_name ?? '', r.ministerios ?? '',
    fmtDate(r.first_visit_date), fmtDate(r.created_at),
    r.source ? (SOURCE_LABEL[r.source] ?? r.source) : '',
    String(r.contacts_count ?? 0),
  ]
  const contacts = [...(r.contacts ?? [])].sort((a, b) => a.ordinal - b.ordinal)
  for (let n = 1; n <= maxContacts; n++) {
    const c = contacts[n - 1]
    if (c && c.ordinal === n) {
      const res = resultLabel(c.result)
      row.push(fmtDateTime(c.contact_date), c.channel ? `${res} (${channelLabel(c.channel)})` : res, c.actor_name ?? '')
    } else {
      row.push('', '', '')
    }
  }
  return row
}

export function buildPeopleCsv(payload: ExportPayload, opts: { unitScope?: UnitScope; units?: { id: string; name: string }[] } = {}): { text: string; filename: string; rows: number; columns: number } {
  const maxContacts = Math.max(0, Number(payload.max_contacts ?? 0))
  const header = buildPeopleHeader(maxContacts, payload.alert_threshold_hours ?? 48)
  const lines = [header, ...(payload.rows ?? []).map(r => buildPeopleRow(r, maxContacts))]
  const text = lines.map(l => l.map(csvCell).join(',')).join('\r\n')
  const scope = opts.unitScope === UNIT_ALL || !opts.unitScope ? 'todas'
    : opts.unitScope === UNIT_NONE ? 'sem-unidade'
    : (opts.units?.find(u => u.id === opts.unitScope)?.name ?? 'unidade').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-')
  const d = new Date()
  const filename = `pessoas-${scope}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.csv`
  return { text, filename, rows: lines.length - 1, columns: header.length }
}
