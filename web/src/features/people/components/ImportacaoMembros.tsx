/**
 * ImportacaoMembros v2 — Auto-detecção · Import direto · Lote reversível
 *
 * Fluxo: Upload → auto-detect colunas → normaliza → dedup → grava → resultado + desfazer
 *
 * Decisões de design (Felipe aprovadas):
 *  - Reconhece colunas de qualquer CRM por sinônimos PT-BR (sem mapeamento manual)
 *  - Importa direto sem tela de preview / confirmação
 *  - import_batch_id UUID em cada pessoa → desfazer lote inteiro com 1 clique
 *  - source = 'import_xlsx', is_bulk_import = true  → suprime boas-vindas (agent-acolhimento)
 *  - last_contact_at = NOW() - 21d                   → entra na régua de reengajamento gradual
 *  - Dedup por TELEFONE APENAS (B1): e-mail familiar não identifica pessoa
 *  - CELULAR tem prioridade sobre TELEFONE na detecção
 *
 * Bugs mantidos (B1-B5 — 2026-06-05):
 *  - B1: e-mail sozinho não causa isDuplicate (telefone é identificador)
 *  - B2: dedup intra-planilha por telefone (mesmo nº duas vezes no arquivo)
 *  - B3: telefones 7-9 dígitos (sem DDD) → phoneWarning, pessoa entra sem telefone
 *  - B4: normalizeName strip do artefato ´/Â´ (export Eclésia)
 *  - B5: serial Excel como string ("22840") → normalizeDate correto
 *       (impede "+022840-01-01" → erro Postgres "time zone displacement out of range")
 *
 * Campos detectados automaticamente (20+):
 *  nome · celular · telefone 2 (RECADO) · e-mail
 *  nascimento · batismo · casamento · decisão · cadastro
 *  estado civil · instagram · chamado
 *  CEP · CPF · endereço · número · complemento · bairro · cidade · UF
 *
 * Desfazer lote:
 *  UPDATE people SET deleted_at = NOW()
 *  WHERE import_batch_id = $batchId AND church_id = $churchId AND deleted_at IS NULL
 */

import { useState, useCallback, useRef } from 'react'
import {
  Upload, FileSpreadsheet, X, Check,
  AlertCircle, Loader2, Info, AlertTriangle, RotateCcw,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import ModalPortal from '@/components/ui/ModalPortal'

// ── Constants ────────────────────────────────────────────────────────────────────

// Synonyms ordered by specificity (most specific first avoids false positives).
// Each entry: [fieldKey, normalizedSynonyms[]] — all values already pre-normalized.
// phone_fallback is used only when no 'phone' (celular/whatsapp) column is found.
const FIELD_SYNONYMS: [string, string[]][] = [
  ['name',               ['nome completo', 'nome do membro', 'membro', 'nome']],
  ['phone',              ['whatsapp', 'celular', 'cel']],          // prioridade sobre TELEFONE
  ['phone_fallback',     ['telefone', 'fone', 'tel', 'contato']],
  ['phone_secondary',    ['recado', 'tel recado', 'fone recado']],
  ['email',              ['e mail pessoal', 'email pessoal', 'e mail', 'email']],
  ['birth_date',         ['data nasc', 'dt nasc', 'dt nascimento', 'data nascimento', 'aniversario', 'nascimento']],
  ['marital_status',     ['estado civil', 'estadocivil', 'civil']],
  ['zip_code',           ['cep', 'cod postal', 'codigo postal']],
  ['cpf',                ['cpf', 'documento', 'doc']],
  ['street',             ['endereco', 'logradouro', 'rua']],
  ['street_number',      ['numero', 'num']],
  ['address_complement', ['complemento', 'comp', 'apto']],
  ['neighborhood',       ['bairro']],
  ['city',               ['cidade', 'municipio']],
  ['state',              ['uf', 'estado', 'sigla']],
  ['instagram_handle',   ['instagram pessoal', 'instagram', 'insta']],
  ['calling',            ['chamado', 'dons', 'vocacao', 'ministerio']],
  ['baptism_date',       ['data batismo', 'dt batismo', 'batismo']],
  ['wedding_date',       ['data casamento', 'casamento', 'matrimonio']],
  ['conversion_date',    ['d decisao', 'data decisao', 'decisao', 'dt decisao']],
  ['membership_date',    ['data cadastro', 'dt cadastro', 'cadastro']],
]

// Labels usados no relatório de avisos e no resumo de mapeamento
const FIELD_LABELS: Record<string, string> = {
  name: 'Nome', phone: 'Celular', phone_secondary: 'Tel. 2', email: 'E-mail',
  birth_date: 'Nascimento', baptism_date: 'Batismo', wedding_date: 'Casamento',
  conversion_date: 'Decisão', membership_date: 'Cadastro',
  marital_status: 'Estado Civil', zip_code: 'CEP', cpf: 'CPF',
  street: 'Endereço', street_number: 'Número', address_complement: 'Complemento',
  neighborhood: 'Bairro', city: 'Cidade', state: 'UF',
  instagram_handle: 'Instagram', calling: 'Chamado',
}

const BATCH_SIZE = 50

// ── Types ────────────────────────────────────────────────────────────────────────

type Step = 'idle' | 'processing' | 'done' | 'undoing' | 'undone'

interface ParsedRow {
  raw:                string[]
  name:               string
  phone:              string | null
  phone_secondary:    string | null
  phoneWarning:       string | null
  email:              string | null
  birth_date:         string | null
  baptism_date:       string | null
  wedding_date:       string | null
  conversion_date:    string | null
  membership_date:    string | null
  dateWarning:        string | null
  marital_status:     string | null
  zip_code:           string | null
  cpf:                string | null
  street:             string | null
  street_number:      string | null
  address_complement: string | null
  neighborhood:       string | null
  city:               string | null
  state:              string | null
  instagram_handle:   string | null
  calling:            string | null
  rowError:           string | null
  isDuplicate:        boolean
  dupReason:          string | null
  warnings:           string[]
  isDiscarded:        boolean   // sem telefone E sem email → não inserir (critério de contato mínimo)
  isWeakContact:      boolean   // sem telefone MAS com email → tag 'contato-fraco'
}

interface ImportResult {
  batchId:     string
  inserted:    number
  duplicates:  number
  discarded:   number          // sem telefone E sem email — descartados silenciosamente
  errorRows:   { name: string; reason: string }[]
  warningRows: { name: string; msgs: string[] }[]
  colMap:      Record<string, number>
  colHeaders:  string[]
}

interface ImportacaoMembrosProps {
  open:      boolean
  onClose:   () => void
  onSuccess: (count: number) => void
}

// ── Normalization helpers ─────────────────────────────────────────────────────────

// Normaliza nome de coluna: remove acentos, lowercase, não-alfanum → espaço
function normalizeColName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// B3: telefones 7-9 dígitos → warning, pessoa entra sem telefone
function normalizePhone(raw: string): { phone: string | null; warning: string | null } {
  if (!raw?.trim()) return { phone: null, warning: null }
  const digits = raw.replace(/\D/g, '')
  if (!digits) return { phone: null, warning: null }
  if (digits.length >= 12 && digits.startsWith('55')) return { phone: `+${digits}`, warning: null }
  if (digits.length === 11) return { phone: `+55${digits}`, warning: null }
  if (digits.length === 10) return { phone: `+55${digits}`, warning: null }
  if (digits.length >= 7 && digits.length <= 9)
    return { phone: null, warning: `Telefone incompleto (${digits.length} dígitos, sem DDD?): "${raw.trim()}"` }
  return { phone: null, warning: null }
}

// B5: serial Excel como string ("22840") + DD/MM/AAAA + YYYY-MM-DD + fallback
// Validação de ano (1900–hoje) impede "+022840-01-01" → erro Postgres
function normalizeDate(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  const CURRENT_YEAR = new Date().getFullYear()

  const fromSerial = (n: number): string | null => {
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86400000)
    if (isNaN(d.getTime())) return null
    const y = d.getUTCFullYear()
    return (y >= 1900 && y <= CURRENT_YEAR) ? d.toISOString().split('T')[0] : null
  }

  // Serial como número real (raro — caso xlsx.js não stringifique)
  if (typeof raw === 'number' && raw > 0) return fromSerial(raw)

  const str = String(raw).trim()
  if (!str) return null

  // B5: serial Excel como string — 4 a 6 dígitos sem separador
  if (/^\d{4,6}$/.test(str)) return fromSerial(parseInt(str, 10))

  // DD/MM/AAAA ou DD-MM-AAAA
  const dmY = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (dmY) {
    const y = parseInt(dmY[3], 10)
    if (y < 1900 || y > CURRENT_YEAR) return null
    return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const y = parseInt(str.split('-')[0], 10)
    return (y >= 1900 && y <= CURRENT_YEAR) ? str : null
  }

  // Fallback genérico com validação de ano
  const d = new Date(str)
  if (!isNaN(d.getTime())) {
    const y = d.getUTCFullYear()
    return (y >= 1900 && y <= CURRENT_YEAR) ? d.toISOString().split('T')[0] : null
  }

  return null
}

function normalizeEmail(raw: string): string | null {
  if (!raw?.trim()) return null
  const t = raw.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null
}

// B4: remove artefato ´ (U+00B4) e Â´ (double-encoded UTF-8) do export Eclésia
function normalizeName(raw: string): string {
  let s = String(raw ?? '').trim()
  s = s.replace(/^(Â´|´)+/, '').trim()
  s = s.replace(/\s+/g, ' ')
  return s
}

// Filtra placeholders "NÃO INFORMADO" do Eclésia, passa outros valores como estão
function normalizeMaritalStatus(raw: string): string | null {
  if (!raw?.trim()) return null
  const t = raw.trim()
  if (/^\.:/.test(t) || /nao\s*informado/i.test(t) || /não\s*informado/i.test(t)) return null
  return t
}

// CEP: garante 8 dígitos com zero à esquerda (ex: 01310100 SP)
function normalizeCep(raw: string): string | null {
  if (!raw?.trim()) return null
  const digits = raw.replace(/\D/g, '')
  if (!digits) return null
  return digits.padStart(8, '0').slice(0, 8)
}

function normalizeText(raw: string): string | null {
  const t = String(raw ?? '').trim()
  return t || null
}

// ── Column auto-detection ─────────────────────────────────────────────────────────

// Valida conteúdo da coluna para desempate quando nome é ambíguo
function contentMatchesField(field: string, vals: string[]): boolean {
  const nonEmpty = vals.filter(Boolean)
  if (!nonEmpty.length) return true // coluna vazia: aceita pelo nome
  switch (field) {
    case 'phone':
    case 'phone_fallback':
    case 'phone_secondary':
      return nonEmpty.some(v => /\d{7,}/.test(v.replace(/\D/g, '')))
    case 'email':
      return nonEmpty.some(v => v.includes('@'))
    case 'birth_date':
    case 'baptism_date':
    case 'wedding_date':
    case 'conversion_date':
    case 'membership_date': {
      const isDateLike = (v: string) =>
        /^\d{4,6}$/.test(v) ||
        /\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4}/.test(v) ||
        /^\d{4}-\d{2}-\d{2}$/.test(v)
      return nonEmpty.some(isDateLike)
    }
    case 'name':
      return nonEmpty.some(v => /[a-zA-ZÀ-ÿ]{2,}/.test(v))
    default:
      return true
  }
}

// Detecta quais colunas do arquivo mapeiam para quais campos do Ekthos
function detectColumns(headers: string[], sampleRows: string[][]): Record<string, number> {
  const normHeaders = headers.map(normalizeColName)
  const colMap: Record<string, number> = {}
  const used = new Set<number>()

  for (const [field, synonyms] of FIELD_SYNONYMS) {
    for (const syn of synonyms) {
      const idx = normHeaders.findIndex((h, i) => !used.has(i) && h === syn)
      if (idx >= 0) {
        const sample = sampleRows.slice(0, 5).map(r => r[idx] ?? '')
        if (contentMatchesField(field, sample)) {
          colMap[field] = idx
          used.add(idx)
          break
        }
      }
    }
  }

  // phone_fallback (TELEFONE) → phone se nenhum celular/whatsapp encontrado
  if (!('phone' in colMap) && 'phone_fallback' in colMap) {
    colMap.phone = colMap.phone_fallback
  }
  delete colMap.phone_fallback

  return colMap
}

// ── Component ─────────────────────────────────────────────────────────────────────

export function ImportacaoMembros({ open, onClose, onSuccess }: ImportacaoMembrosProps) {
  const { churchId } = useAuth()

  const [step,        setStep]        = useState<Step>('idle')
  const [procLabel,   setProcLabel]   = useState<string>('')
  const [result,      setResult]      = useState<ImportResult | null>(null)
  const [undoneCount, setUndoneCount] = useState<number>(0)
  const [fileError,   setFileError]   = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Main import flow ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!churchId) return
    setFileError(null)
    setStep('processing')
    setProcLabel('Lendo arquivo…')

    try {
      // 1. Parse xlsx/csv
      let data: unknown[][] = []
      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text()
        data = Papa.parse<string[]>(text, { skipEmptyLines: true }).data
      } else {
        const buffer = await file.arrayBuffer()
        const wb     = XLSX.read(buffer, { type: 'array', cellDates: false })
        const ws     = wb.Sheets[wb.SheetNames[0]]
        data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
      }

      if (data.length < 2) {
        setFileError('Arquivo vazio ou sem dados além do cabeçalho.')
        setStep('idle')
        return
      }

      const headers = (data[0] as unknown[]).map(h => String(h ?? '').trim())
      const rawRows = (data.slice(1) as unknown[][])
        .map(r => r.map(c => String(c ?? '').trim()))
        .filter(r => r.some(c => c !== ''))

      if (!rawRows.length) {
        setFileError('Nenhuma linha com dados encontrada após o cabeçalho.')
        setStep('idle')
        return
      }

      // 2. Auto-detecção de colunas
      setProcLabel('Detectando colunas…')
      const colMap = detectColumns(headers, rawRows.slice(0, 5))

      if (!('name' in colMap)) {
        setFileError(
          'Coluna de nome não encontrada. Verifique se o arquivo tem NOME, MEMBRO ou "NOME COMPLETO".'
        )
        setStep('idle')
        return
      }

      // Helper: lê valor da coluna por field key
      const get = (row: string[], key: string): string =>
        colMap[key] !== undefined ? (row[colMap[key]] ?? '') : ''

      // 3. Normalização de cada linha (B3 + B4 + B5 aplicados)
      const processed: ParsedRow[] = rawRows.map(row => {
        const name = normalizeName(get(row, 'name')) // B4

        if (!name) {
          return {
            raw: row, name: get(row, 'name'), phone: null, phone_secondary: null,
            phoneWarning: null, email: null, birth_date: null, baptism_date: null,
            wedding_date: null, conversion_date: null, membership_date: null,
            dateWarning: null, marital_status: null, zip_code: null, cpf: null,
            street: null, street_number: null, address_complement: null,
            neighborhood: null, city: null, state: null, instagram_handle: null,
            calling: null, rowError: 'Nome obrigatório', isDuplicate: false,
            dupReason: null, warnings: [], isDiscarded: false, isWeakContact: false,
          }
        }

        const { phone, warning: phoneWarning } = normalizePhone(get(row, 'phone'))   // B3
        const { phone: phSec }                 = normalizePhone(get(row, 'phone_secondary'))
        const email                            = normalizeEmail(get(row, 'email'))

        // Critério de contato mínimo (decisão Felipe 2026-06-05):
        //   • tem telefone → entra normalmente
        //   • sem telefone MAS com email → entra com tag 'contato-fraco'
        //   • sem telefone E sem email → descartado (não inserir)
        const isDiscarded  = !phone && !email
        const isWeakContact = !phone && !!email

        // B5: parse de todas as datas + coleta de warnings por data ilegível
        const DATE_FIELDS: [string, string][] = [
          ['birth_date',      get(row, 'birth_date')],
          ['baptism_date',    get(row, 'baptism_date')],
          ['wedding_date',    get(row, 'wedding_date')],
          ['conversion_date', get(row, 'conversion_date')],
          ['membership_date', get(row, 'membership_date')],
        ]
        const parsedDates: Record<string, string | null> = {}
        const dateWarns: string[] = []
        for (const [k, v] of DATE_FIELDS) {
          const parsed = normalizeDate(v)
          parsedDates[k] = parsed
          if (v.trim() && !parsed)
            dateWarns.push(`${FIELD_LABELS[k] ?? k} ilegível: "${v.trim().slice(0, 20)}"`)
        }

        const warnings: string[] = [
          ...(phoneWarning ? [phoneWarning] : []),
          ...dateWarns,
        ]

        return {
          raw: row, name,
          phone,              phone_secondary:    phSec,
          phoneWarning,       email,
          birth_date:         parsedDates.birth_date       ?? null,
          baptism_date:       parsedDates.baptism_date     ?? null,
          wedding_date:       parsedDates.wedding_date     ?? null,
          conversion_date:    parsedDates.conversion_date  ?? null,
          membership_date:    parsedDates.membership_date  ?? null,
          dateWarning:        dateWarns.length ? dateWarns.join(' | ') : null,
          marital_status:     normalizeMaritalStatus(get(row, 'marital_status')),
          zip_code:           normalizeCep(get(row, 'zip_code')),
          cpf:                normalizeText(get(row, 'cpf')),
          street:             normalizeText(get(row, 'street')),
          street_number:      normalizeText(get(row, 'street_number')),
          address_complement: normalizeText(get(row, 'address_complement')),
          neighborhood:       normalizeText(get(row, 'neighborhood')),
          city:               normalizeText(get(row, 'city')),
          state:              normalizeText(get(row, 'state')),
          instagram_handle:   normalizeText(get(row, 'instagram_handle')),
          calling:            normalizeText(get(row, 'calling')),
          rowError: null, isDuplicate: false, dupReason: null, warnings,
          isDiscarded, isWeakContact,
        }
      })

      // 4. B2: dedup intra-planilha por telefone
      const seenPhones = new Set<string>()
      const afterIntra: ParsedRow[] = processed.map(row => {
        if (row.rowError || !row.phone) return row
        if (seenPhones.has(row.phone))
          return { ...row, isDuplicate: true, dupReason: `Telefone repetido na planilha: ${row.phone}` }
        seenPhones.add(row.phone)
        return row
      })

      // 5. B1: dedup contra banco — só telefone
      setProcLabel('Verificando duplicatas…')
      const phonesToCheck = [...new Set(
        afterIntra.filter(r => r.phone && !r.rowError && !r.isDuplicate).map(r => r.phone!),
      )]
      const existingPhones = new Set<string>()
      for (let i = 0; i < phonesToCheck.length; i += 100) {
        const { data: dbRows } = await supabase
          .from('people')
          .select('phone')
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .in('phone', phonesToCheck.slice(i, i + 100))
        ;(dbRows ?? []).forEach(p => { if (p.phone) existingPhones.add(p.phone) })
      }

      const deduped: ParsedRow[] = afterIntra.map(row => {
        if (row.rowError || row.isDuplicate) return row
        if (row.phone && existingPhones.has(row.phone))
          return { ...row, isDuplicate: true, dupReason: `Telefone já cadastrado: ${row.phone}` }
        return row
      })

      // 6. Insert em massa com import_batch_id
      // Critério de contato mínimo: isDiscarded → não entra na base (contado mas não nomeado no resultado)
      const toInsert = deduped.filter(r => !r.rowError && !r.isDuplicate && !r.isDiscarded)
      setProcLabel(`Importando ${toInsert.length} ${toInsert.length === 1 ? 'pessoa' : 'pessoas'}…`)

      const batchId       = crypto.randomUUID()
      const lastContactAt = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
      const errorRows: { name: string; reason: string }[] = []
      let inserted = 0

      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE).map(row => {
          // Constrói objeto apenas com campos não-nulos para evitar sobrescrever defaults
          const obj: Record<string, unknown> = {
            church_id:       churchId,
            name:            row.name,
            source:          'import_xlsx',
            is_bulk_import:  true,        // suprime boas-vindas
            last_contact_at: lastContactAt,  // entra régua reengajamento gradual
            optout:          false,
            tags:            row.isWeakContact ? ['contato-fraco'] : [],  // sem telefone, só email
            import_batch_id: batchId,     // permite desfazer lote
          }
          if (row.phone)              obj.phone              = row.phone
          if (row.phone_secondary)    obj.phone_secondary    = row.phone_secondary
          if (row.email)              obj.email              = row.email
          if (row.birth_date)         obj.birth_date         = row.birth_date
          if (row.baptism_date)       obj.baptism_date       = row.baptism_date
          if (row.wedding_date)       obj.wedding_date       = row.wedding_date
          if (row.conversion_date)    obj.conversion_date    = row.conversion_date
          if (row.membership_date)    obj.membership_date    = row.membership_date
          if (row.marital_status)     obj.marital_status     = row.marital_status
          if (row.zip_code)           obj.zip_code           = row.zip_code
          if (row.cpf)                obj.cpf                = row.cpf
          if (row.street)             obj.street             = row.street
          if (row.street_number)      obj.street_number      = row.street_number
          if (row.address_complement) obj.address_complement = row.address_complement
          if (row.neighborhood)       obj.neighborhood       = row.neighborhood
          if (row.city)               obj.city               = row.city
          if (row.state)              obj.state              = row.state
          if (row.instagram_handle)   obj.instagram_handle   = row.instagram_handle
          if (row.calling)            obj.calling            = row.calling
          return obj
        })

        const { data: batchData, error: batchErr } = await supabase
          .from('people')
          .insert(batch)
          .select('id')

        if (batchErr) {
          // Fallback linha-a-linha: preserva o máximo do lote
          for (const row of batch) {
            const { error: rowErr } = await supabase.from('people').insert(row)
            if (rowErr) errorRows.push({ name: String(row.name), reason: rowErr.message })
            else inserted++
          }
        } else {
          inserted += (batchData ?? batch).length
        }
      }

      // 7. Monta resultado
      const warningRows = deduped
        .filter(r => !r.rowError && !r.isDuplicate && r.warnings.length > 0)
        .map(r => ({ name: r.name, msgs: r.warnings }))

      setResult({
        batchId,
        inserted,
        duplicates:  deduped.filter(r => r.isDuplicate).length,
        discarded:   deduped.filter(r => r.isDiscarded).length,  // sem telefone E sem email
        errorRows,
        warningRows,
        colMap,
        colHeaders:  headers,
      })
      setStep('done')
      if (inserted > 0) onSuccess(inserted)

    } catch (err) {
      console.error('[ImportacaoMembros]', err)
      setFileError('Erro inesperado ao processar o arquivo. Tente novamente.')
      setStep('idle')
    }
  }, [churchId, onSuccess])

  // ── Desfazer lote ─────────────────────────────────────────────────────────────

  const undoBatch = useCallback(async () => {
    if (!result || !churchId) return
    setProcLabel('Desfazendo lote…')
    setStep('undoing')
    try {
      const { data, error } = await supabase
        .from('people')
        .update({ deleted_at: new Date().toISOString() })
        .eq('import_batch_id', result.batchId)
        .eq('church_id', churchId)
        .is('deleted_at', null)
        .select('id')

      if (error) throw new Error(error.message)
      setUndoneCount((data ?? []).length)
      setStep('undone')
    } catch (err) {
      console.error('[ImportacaoMembros] undoBatch error', err)
      setFileError('Erro ao desfazer lote. Tente novamente.')
      setStep('done')
    }
  }, [result, churchId])

  // ── Reset ─────────────────────────────────────────────────────────────────────

  const reset = useCallback(() => {
    setStep('idle')
    setProcLabel('')
    setResult(null)
    setUndoneCount(0)
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }, [])

  if (!open) return null

  // Resumo do mapeamento detectado para exibição no resultado
  const detectedSummary = result
    ? Object.entries(result.colMap)
        .map(([k, idx]) => `${result.colHeaders[idx] ?? `col${idx}`} → ${FIELD_LABELS[k] ?? k}`)
        .join(' · ')
    : ''

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#EDE0CC] shrink-0">
          <div>
            <h2 className="font-semibold text-[#161616] text-lg flex items-center gap-2">
              <FileSpreadsheet size={18} className="text-[#e13500]" />
              Importar Membros
            </h2>
            <p className="text-xs text-[#8A8A8A] mt-0.5">
              {step === 'idle'       && 'Detecta colunas de qualquer planilha automaticamente'}
              {step === 'processing' && procLabel}
              {step === 'done'       && result && [
                `${result.inserted} importadas`,
                `${result.duplicates} duplicadas`,
                result.discarded > 0 ? `${result.discarded} descartadas` : null,
                `${result.warningRows.length} avisos`,
              ].filter(Boolean).join(' · ')}
              {step === 'undoing'    && 'Desfazendo lote…'}
              {step === 'undone'     && 'Lote desfeito com sucesso'}
            </p>
          </div>
          <button
            onClick={() => { reset(); onClose() }}
            className="p-2 rounded-lg hover:bg-[#f9eedc] text-[#8A8A8A] transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0">

          {/* IDLE — Drop zone */}
          {step === 'idle' && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-[#EDE0CC] rounded-xl p-10 text-center cursor-pointer hover:border-[#e13500] hover:bg-[#f9eedc] transition-all"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  e.preventDefault()
                  const f = e.dataTransfer.files[0]
                  if (f) void handleFile(f)
                }}
              >
                <Upload size={40} className="mx-auto text-[#EDE0CC] mb-3" />
                <p className="font-medium text-[#161616] mt-2">Clique ou arraste o arquivo aqui</p>
                <p className="text-sm text-[#8A8A8A] mt-1">Excel (.xlsx, .xls) ou CSV (.csv)</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) void handleFile(f)
                }}
              />
              {fileError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                  <AlertCircle size={16} className="text-[#e13500] shrink-0 mt-0.5" />
                  <p className="text-sm text-[#e13500]">{fileError}</p>
                </div>
              )}
              <div className="bg-[#f9eedc] rounded-xl p-4 space-y-1.5 text-sm text-[#5A5A5A]">
                <p className="font-semibold text-[#161616] flex items-center gap-1.5">
                  <Info size={14} className="text-[#e13500]" />
                  Informações importantes
                </p>
                <p>• A primeira linha deve ser o cabeçalho (NOME, CELULAR, E-MAIL…)</p>
                <p>• Colunas detectadas automaticamente — Eclésia, Arena, qualquer CRM</p>
                <p>• Membros importados <strong>não recebem boas-vindas</strong></p>
                <p>• Entram no reengajamento gradual (máx. 50 msg/dia — sem risco de spam)</p>
                <p>• Duplicatas por <strong>telefone</strong> são ignoradas automaticamente</p>
                <p>• Sem telefone <em>e</em> sem e-mail → linha descartada (sem canal de contato)</p>
                <p>• Só e-mail (sem telefone) → importado com marcador <em>contato fraco</em></p>
                <p>• Importação <strong>reversível</strong> — desfaça o lote inteiro com 1 clique</p>
              </div>
            </div>
          )}

          {/* PROCESSING / UNDOING */}
          {(step === 'processing' || step === 'undoing') && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <Loader2 size={40} className="animate-spin text-[#e13500]" />
              <p className="text-[#161616] font-medium">
                {step === 'undoing' ? 'Desfazendo lote…' : procLabel}
              </p>
            </div>
          )}

          {/* DONE — Resultado */}
          {step === 'done' && result && (
            <div className="space-y-4">

              {/* Métricas */}
              <div className={`grid gap-3 ${result.discarded > 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.inserted}</p>
                  <p className="text-xs text-green-600 mt-0.5">Importadas</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{result.duplicates}</p>
                  <p className="text-xs text-yellow-600 mt-0.5">Duplicadas</p>
                </div>
                {result.discarded > 0 && (
                  <div className="bg-gray-100 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-gray-500">{result.discarded}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Sem contato</p>
                  </div>
                )}
                <div className={`rounded-xl p-3 text-center ${result.warningRows.length > 0 ? 'bg-orange-50' : 'bg-[#f9eedc]'}`}>
                  <p className={`text-2xl font-bold ${result.warningRows.length > 0 ? 'text-orange-600' : 'text-[#8A8A8A]'}`}>
                    {result.warningRows.length}
                  </p>
                  <p className={`text-xs mt-0.5 ${result.warningRows.length > 0 ? 'text-orange-500' : 'text-[#8A8A8A]'}`}>
                    Avisos
                  </p>
                </div>
              </div>

              {/* Info descartados — apenas count, sem nomes (critério de contato mínimo) */}
              {result.discarded > 0 && (
                <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <Info size={14} className="text-gray-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-500">
                    <strong>{result.discarded}</strong> linha{result.discarded === 1 ? '' : 's'} descartada{result.discarded === 1 ? '' : 's'} por não ter telefone nem e-mail.
                    Não é possível entrar em contato sem pelo menos um canal — essas pessoas não foram importadas.
                  </p>
                </div>
              )}

              {/* Sem inserções */}
              {result.inserted === 0 && (
                <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                  <AlertCircle size={16} className="text-yellow-600 shrink-0" />
                  <p className="text-sm text-yellow-700">
                    Nenhuma pessoa nova importada. Verifique se já não estão cadastradas ou se a coluna NOME foi detectada.
                  </p>
                </div>
              )}

              {/* Mapeamento detectado */}
              {detectedSummary && (
                <div className="bg-[#f9eedc] rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-[#8A8A8A] uppercase tracking-wide mb-1.5">
                    Mapeamento automático detectado
                  </p>
                  <p className="text-xs text-[#5A5A5A] leading-relaxed break-words">{detectedSummary}</p>
                </div>
              )}

              {/* Avisos por pessoa */}
              {result.warningRows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-orange-600 uppercase tracking-wide mb-2">
                    <AlertTriangle size={12} className="inline mr-1" />
                    {result.warningRows.length} pessoa(s) importadas com dados incompletos
                  </p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {result.warningRows.slice(0, 10).map((r, i) => (
                      <div key={i} className="bg-orange-50 rounded-lg px-3 py-2 text-xs">
                        <span className="font-medium text-[#161616]">{r.name}</span>
                        <span className="text-orange-600 ml-2">{r.msgs.join(', ')}</span>
                      </div>
                    ))}
                    {result.warningRows.length > 10 && (
                      <p className="text-xs text-[#8A8A8A] px-1">+{result.warningRows.length - 10} mais</p>
                    )}
                  </div>
                </div>
              )}

              {/* Erros de inserção */}
              {result.errorRows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#e13500] uppercase tracking-wide mb-2">
                    {result.errorRows.length} pessoa(s) não importadas por erro
                  </p>
                  <div className="space-y-1 max-h-28 overflow-y-auto">
                    {result.errorRows.map((r, i) => (
                      <div key={i} className="text-xs bg-red-50 rounded px-3 py-1.5 flex justify-between gap-2">
                        <span className="text-[#161616] truncate">{r.name}</span>
                        <span className="text-[#e13500] shrink-0">{r.reason.slice(0, 60)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Info do lote */}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 space-y-0.5">
                <p className="text-xs text-blue-700">
                  <span className="font-semibold">ID do lote:</span>{' '}
                  <span className="font-mono">{result.batchId.slice(0, 8)}…</span>
                </p>
                <p className="text-xs text-blue-600">
                  Reengajamento gradual — máx. 50 msg/dia por cron. Nenhum disparo imediato.
                </p>
              </div>

              {/* Botão desfazer lote */}
              {result.inserted > 0 && (
                <button
                  onClick={() => { void undoBatch() }}
                  className="w-full flex items-center justify-center gap-2 border border-[#EDE0CC] rounded-xl px-4 py-2.5 text-sm text-[#5A5A5A] hover:border-[#e13500] hover:text-[#e13500] transition-colors"
                >
                  <RotateCcw size={14} />
                  Desfazer este lote ({result.inserted} {result.inserted === 1 ? 'pessoa' : 'pessoas'})
                </button>
              )}
            </div>
          )}

          {/* UNDONE — Confirmação desfazer */}
          {step === 'undone' && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-14 h-14 rounded-full bg-[#f9eedc] flex items-center justify-center">
                <Check size={24} className="text-[#e13500]" />
              </div>
              <p className="text-lg font-semibold text-[#161616]">Lote desfeito</p>
              <p className="text-sm text-[#8A8A8A] text-center max-w-xs">
                {undoneCount} {undoneCount === 1 ? 'pessoa removida' : 'pessoas removidas'} da base.
                A operação é reversível — os registros têm <code className="text-xs">deleted_at</code> preenchido, não foram apagados.
              </p>
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-[#EDE0CC] flex items-center justify-between shrink-0">
          {step === 'idle' && (
            <p className="text-xs text-[#8A8A8A]">
              Importação reversível — desfaça qualquer lote com 1 clique
            </p>
          )}
          {(step === 'done' || step === 'undone') && (
            <Button size="sm" onClick={() => { reset(); onClose() }} className="ml-auto">
              Fechar
            </Button>
          )}
        </div>

      </div>
    </div>
    </ModalPortal>
  )
}
