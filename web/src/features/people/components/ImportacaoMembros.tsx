/**
 * ImportacaoMembros — Feature de importação em massa de membros via xlsx/csv.
 *
 * Fluxo: Upload → Mapeamento de colunas → Preview + dedup → Importar → Resultado
 *
 * Decisões de design (Felipe aprovadas):
 *  - source = 'import_xlsx', is_bulk_import = true   → suprime boas-vindas
 *  - last_contact_at = NOW() - 21d                    → entra na régua de reengajamento
 *  - Dedup por phone + email (deleted_at IS NULL)     → ignora duplicatas ativas
 *  - Inserts diretos via supabase.from('people')      → nunca chama dispatch-person-event
 *  - Batch de 50 + fallback row-by-row em erro de lote
 */

import { useState, useCallback, useRef } from 'react'
import {
  Upload, FileSpreadsheet, X, ChevronRight, Check,
  AlertCircle, Loader2, Info,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'

// ── Types ──────────────────────────────────────────────────────────────────────

type Step = 'upload' | 'mapping' | 'preview' | 'importing' | 'done'

interface EkthosField { key: string; label: string; required?: boolean }

const EKTHOS_FIELDS: EkthosField[] = [
  { key: 'name',           label: 'Nome completo',        required: true },
  { key: 'phone',          label: 'Telefone / Celular' },
  { key: 'email',          label: 'E-mail' },
  { key: 'birth_date',     label: 'Data de nascimento' },
  { key: 'marital_status', label: 'Estado civil' },
  { key: 'neighborhood',   label: 'Bairro' },
  { key: 'city',           label: 'Cidade' },
  { key: 'state',          label: 'Estado (UF)' },
  { key: 'baptism_date',   label: 'Data de batismo' },
  { key: 'calling',        label: 'Dons / Chamado' },
]

type Mapping = Record<string, number | null>

interface ParsedRow {
  raw:            string[]
  name:           string
  phone:          string | null
  email:          string | null
  birth_date:     string | null
  marital_status: string | null
  neighborhood:   string | null
  city:           string | null
  state:          string | null
  baptism_date:   string | null
  calling:        string | null
  rowError:       string | null
  isDuplicate:    boolean
}

interface ImportResult {
  inserted:  number
  skipped:   number
  errors:    number
  errorRows: { name: string; reason: string }[]
}

// ── Normalização ───────────────────────────────────────────────────────────────

function normalizePhone(raw: string): string | null {
  if (!raw?.trim()) return null
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return null
  if (digits.length === 11) return `+55${digits}`           // 021 9XXXX-XXXX
  if (digits.length === 10) return `+55${digits}`           // 021 XXXX-XXXX
  if (digits.length >= 12 && digits.startsWith('55')) return `+${digits}`
  return raw.trim() // keep as-is se não reconhecido
}

function normalizeDate(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined || raw === '') return null
  // Excel número serial
  if (typeof raw === 'number' && raw > 0) {
    // Epoch Excel: 1 = 1900-01-01, com bug do ano 1900 (offset 2)
    const d = new Date(Date.UTC(1899, 11, 30) + raw * 86400000)
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
    return null
  }
  const str = String(raw).trim()
  if (!str) return null
  // DD/MM/YYYY ou DD-MM-YYYY
  const dmY = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (dmY) return `${dmY[3]}-${dmY[2].padStart(2, '0')}-${dmY[1].padStart(2, '0')}`
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  // Fallback
  const d = new Date(str)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return null
}

function normalizeEmail(raw: string): string | null {
  if (!raw?.trim()) return null
  const t = raw.trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null
}

function normalizeName(raw: string): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ')
}

// ── Auto-sugestão de mapeamento ────────────────────────────────────────────────

const SYNONYMS: Record<string, string[]> = {
  name:           ['nome', 'name', 'membro', 'full name', 'nome completo', 'nome_completo'],
  phone:          ['telefone', 'celular', 'fone', 'phone', 'whatsapp', 'tel', 'contato', 'cel'],
  email:          ['email', 'e-mail', 'correio', 'mail'],
  birth_date:     ['nascimento', 'dt nasc', 'data nasc', 'data de nascimento', 'birthday', 'birth_date', 'dt_nascimento', 'datanascimento'],
  marital_status: ['estado civil', 'civil', 'estado_civil', 'marital'],
  neighborhood:   ['bairro', 'neighborhood', 'district'],
  city:           ['cidade', 'city', 'municipio', 'município'],
  state:          ['estado', 'uf', 'state', 'sigla'],
  baptism_date:   ['batismo', 'data batismo', 'data de batismo', 'baptism', 'dt batismo'],
  calling:        ['dons', 'chamado', 'talentos', 'ministério', 'ministerio', 'calling'],
}

function autoSuggest(headers: string[]): Mapping {
  const mapping: Mapping = {}
  EKTHOS_FIELDS.forEach(f => {
    const syns = SYNONYMS[f.key] ?? [f.key]
    const idx  = headers.findIndex(h => {
      const n = h.toLowerCase().trim()
      return syns.some(s => n === s || n.includes(s) || s.includes(n))
    })
    mapping[f.key] = idx >= 0 ? idx : null
  })
  return mapping
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface ImportacaoMembrosProps {
  open:      boolean
  onClose:   () => void
  onSuccess: (count: number) => void
}

// ── Componente ─────────────────────────────────────────────────────────────────

export function ImportacaoMembros({ open, onClose, onSuccess }: ImportacaoMembrosProps) {
  const { churchId } = useAuth()

  const [step,         setStep]         = useState<Step>('upload')
  const [headers,      setHeaders]      = useState<string[]>([])
  const [rawRows,      setRawRows]      = useState<string[][]>([])
  const [mapping,      setMapping]      = useState<Mapping>({})
  const [parsedRows,   setParsedRows]   = useState<ParsedRow[]>([])
  const [result,       setResult]       = useState<ImportResult | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [fileError,    setFileError]    = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Parse do arquivo ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setFileError(null)
    setIsProcessing(true)
    try {
      let data: unknown[][] = []

      if (file.name.toLowerCase().endsWith('.csv')) {
        const text = await file.text()
        const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true })
        data = parsed.data
      } else {
        const buffer = await file.arrayBuffer()
        const wb = XLSX.read(buffer, { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' })
      }

      if (data.length < 2) {
        setFileError('Arquivo vazio ou com apenas cabeçalho. Verifique se há dados além da linha de título.')
        return
      }

      const hdrs = (data[0] as unknown[]).map(h => String(h ?? '').trim())
      const rows = (data.slice(1) as unknown[][])
        .map(r => r.map(c => String(c ?? '').trim()))
        .filter(r => r.some(c => c !== ''))

      if (rows.length === 0) {
        setFileError('Nenhuma linha com dados encontrada após o cabeçalho.')
        return
      }

      setHeaders(hdrs)
      setRawRows(rows)
      setMapping(autoSuggest(hdrs))
      setStep('mapping')
    } catch (err) {
      setFileError('Não foi possível ler o arquivo. Certifique-se de que é um Excel (.xlsx/.xls) ou CSV (.csv) válido.')
      console.error('[ImportacaoMembros] parse error', err)
    } finally {
      setIsProcessing(false)
    }
  }, [])

  // ── Preview + dedup ───────────────────────────────────────────────────────────

  const processPreview = useCallback(async () => {
    if (!churchId) return
    setIsProcessing(true)

    const get = (row: string[], key: string): string =>
      mapping[key] !== null && mapping[key] !== undefined
        ? (row[mapping[key] as number] ?? '')
        : ''

    // Parse de cada linha
    const processed: ParsedRow[] = rawRows.map(row => {
      const rawName = get(row, 'name')
      const name    = normalizeName(rawName)
      const rowError  = !name ? 'Nome obrigatório' : null

      return {
        raw:            row,
        name,
        phone:          normalizePhone(get(row, 'phone')),
        email:          normalizeEmail(get(row, 'email')),
        birth_date:     normalizeDate(get(row, 'birth_date')),
        marital_status: get(row, 'marital_status') || null,
        neighborhood:   get(row, 'neighborhood')   || null,
        city:           get(row, 'city')           || null,
        state:          get(row, 'state')          || null,
        baptism_date:   normalizeDate(get(row, 'baptism_date')),
        calling:        get(row, 'calling')        || null,
        rowError,
        isDuplicate: false,
      }
    })

    // Dedup: coleta phones/emails e consulta DB
    const phones = [...new Set(processed.filter(r => r.phone && !r.rowError).map(r => r.phone!))]
    const emails = [...new Set(processed.filter(r => r.email && !r.rowError).map(r => r.email!))]

    const existingPhones = new Set<string>()
    const existingEmails = new Set<string>()

    if (phones.length > 0) {
      // Checa em lotes de 100 para não estourar URL
      for (let i = 0; i < phones.length; i += 100) {
        const { data } = await supabase
          .from('people')
          .select('phone')
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .in('phone', phones.slice(i, i + 100))
        ;(data ?? []).forEach(p => { if (p.phone) existingPhones.add(p.phone) })
      }
    }

    if (emails.length > 0) {
      for (let i = 0; i < emails.length; i += 100) {
        const { data } = await supabase
          .from('people')
          .select('email')
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .in('email', emails.slice(i, i + 100))
        ;(data ?? []).forEach(p => { if (p.email) existingEmails.add(p.email) })
      }
    }

    const final = processed.map(row => ({
      ...row,
      isDuplicate: !row.rowError && (
        (!!row.phone && existingPhones.has(row.phone)) ||
        (!!row.email && existingEmails.has(row.email))
      ),
    }))

    setParsedRows(final)
    setIsProcessing(false)
    setStep('preview')
  }, [rawRows, mapping, churchId])

  // ── Insert em massa ───────────────────────────────────────────────────────────

  const executeImport = useCallback(async () => {
    if (!churchId) return
    setStep('importing')

    const toInsert = parsedRows.filter(r => !r.rowError && !r.isDuplicate)
    // 21 dias atrás → entra na régua de reengajamento sem disparar agora
    const lastContactAt = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()

    const BATCH_SIZE = 50
    const errorRows: { name: string; reason: string }[] = []
    let inserted = 0

    for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
      const batch = toInsert.slice(i, i + BATCH_SIZE).map(row => ({
        church_id:        churchId,
        name:             row.name,
        phone:            row.phone            ?? undefined,
        email:            row.email            ?? undefined,
        birth_date:       row.birth_date       ?? undefined,
        marital_status:   row.marital_status   ?? undefined,
        neighborhood:     row.neighborhood     ?? undefined,
        city:             row.city             ?? undefined,
        state:            row.state            ?? undefined,
        baptism_date:     row.baptism_date     ?? undefined,
        calling:          row.calling          ?? undefined,
        source:           'import_xlsx'     as const,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        is_bulk_import:   true              as any,   // suprime boas-vindas
        last_contact_at:  lastContactAt,              // entra régua reengajamento
        optout:           false,
        tags:             [] as string[],
      }))

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: batchData, error: batchErr } = await supabase.from('people').insert(batch as any).select('id')

      if (batchErr) {
        // Fallback: tenta linha a linha para não perder o lote todo
        for (const row of batch) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: rowErr } = await supabase.from('people').insert(row as any)
          if (rowErr) errorRows.push({ name: row.name, reason: rowErr.message })
          else inserted++
        }
      } else {
        inserted += (batchData ?? batch).length
      }
    }

    const skipped = parsedRows.filter(r => r.isDuplicate).length
    setResult({ inserted, skipped, errors: errorRows.length, errorRows })
    setStep('done')
    if (inserted > 0) onSuccess(inserted)
  }, [parsedRows, churchId, onSuccess])

  // ── Reset ─────────────────────────────────────────────────────────────────────

  const reset = () => {
    setStep('upload')
    setHeaders([])
    setRawRows([])
    setMapping({})
    setParsedRows([])
    setResult(null)
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  if (!open) return null

  const validRows  = parsedRows.filter(r => !r.rowError && !r.isDuplicate)
  const errorCount = parsedRows.filter(r => !!r.rowError).length
  const dupCount   = parsedRows.filter(r => r.isDuplicate).length

  return (
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
              {step === 'upload'    && 'Importe membros de planilha Excel ou CSV (Eclésia, Arena, etc.)'}
              {step === 'mapping'   && `${rawRows.length} linhas detectadas — mapeie as colunas`}
              {step === 'preview'   && `Preview: ${validRows.length} prontas, ${dupCount} duplicadas, ${errorCount} com erro`}
              {step === 'importing' && 'Importando... aguarde'}
              {step === 'done'      && 'Importação concluída'}
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

          {/* STEP: UPLOAD */}
          {step === 'upload' && (
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
                {isProcessing ? (
                  <Loader2 size={40} className="mx-auto text-[#e13500] animate-spin" />
                ) : (
                  <Upload size={40} className="mx-auto text-[#EDE0CC] mb-3" />
                )}
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
                <p>• A primeira linha deve ser o cabeçalho (Nome, Telefone, E-mail…)</p>
                <p>• Membros importados <strong>não recebem mensagem de boas-vindas</strong></p>
                <p>• Entram na régua de reengajamento de forma gradual (máx. 50/dia)</p>
                <p>• Duplicatas por telefone ou e-mail são ignoradas automaticamente</p>
              </div>
            </div>
          )}

          {/* STEP: MAPPING */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <p className="text-sm text-[#5A5A5A]">
                Ligue cada campo do Ekthos com a coluna da sua planilha. O sistema sugeriu automaticamente — revise e ajuste se necessário.
              </p>
              <div className="divide-y divide-[#EDE0CC]">
                {EKTHOS_FIELDS.map(field => (
                  <div key={field.key} className="flex items-center gap-3 py-2.5">
                    <div className="w-44 shrink-0">
                      <span className="text-sm font-medium text-[#161616]">{field.label}</span>
                      {field.required && <span className="ml-1 text-[#e13500] text-xs">*</span>}
                    </div>
                    <ChevronRight size={14} className="text-[#EDE0CC] shrink-0" />
                    <select
                      value={mapping[field.key] !== null && mapping[field.key] !== undefined ? String(mapping[field.key]) : ''}
                      onChange={e => setMapping(m => ({
                        ...m,
                        [field.key]: e.target.value === '' ? null : Number(e.target.value),
                      }))}
                      className="flex-1 text-sm border border-[#EDE0CC] rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#e13500] bg-white"
                    >
                      <option value="">— não importar —</option>
                      {headers.map((h, i) => (
                        <option key={i} value={i}>
                          {h || `Coluna ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {mapping['name'] === null && (
                <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                  <AlertCircle size={16} className="text-yellow-600 shrink-0" />
                  <p className="text-sm text-yellow-700">O campo <strong>Nome completo</strong> é obrigatório para importar.</p>
                </div>
              )}
            </div>
          )}

          {/* STEP: PREVIEW */}
          {step === 'preview' && !isProcessing && (
            <div className="space-y-4">
              {/* Cards de contagem */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{validRows.length}</p>
                  <p className="text-xs text-green-600 mt-0.5">Prontas</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{dupCount}</p>
                  <p className="text-xs text-yellow-600 mt-0.5">Duplicatas (ignorar)</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-[#e13500]">{errorCount}</p>
                  <p className="text-xs text-[#e13500] mt-0.5">Com erro (ignorar)</p>
                </div>
              </div>

              {validRows.length === 0 && (
                <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                  <AlertCircle size={16} className="text-yellow-600 shrink-0" />
                  <p className="text-sm text-yellow-700">
                    Nenhuma linha válida para importar. Verifique o mapeamento de colunas.
                  </p>
                </div>
              )}

              {/* Amostra das válidas */}
              {validRows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#8A8A8A] uppercase tracking-wide mb-2">
                    Amostra — primeiras {Math.min(5, validRows.length)} de {validRows.length}
                  </p>
                  <div className="space-y-1.5">
                    {validRows.slice(0, 5).map((row, i) => (
                      <div key={i} className="flex items-center gap-2 bg-[#f9eedc] rounded-lg px-3 py-2 text-sm">
                        <Check size={13} className="text-green-600 shrink-0" />
                        <span className="font-medium text-[#161616] truncate min-w-0">{row.name}</span>
                        {row.phone && <span className="text-[#8A8A8A] text-xs shrink-0">{row.phone}</span>}
                        {row.email && <span className="text-[#8A8A8A] text-xs truncate min-w-0">{row.email}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Amostra de erros */}
              {errorCount > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#e13500] uppercase tracking-wide mb-2">
                    Linhas com erro (primeiras {Math.min(5, errorCount)})
                  </p>
                  <div className="space-y-1.5">
                    {parsedRows.filter(r => !!r.rowError).slice(0, 5).map((row, i) => (
                      <div key={i} className="flex items-center gap-2 bg-red-50 rounded-lg px-3 py-2 text-sm">
                        <AlertCircle size={13} className="text-[#e13500] shrink-0" />
                        <span className="text-[#161616] truncate min-w-0">{row.raw[0] || '(sem nome)'}</span>
                        <span className="text-[#e13500] text-xs ml-auto shrink-0">{row.rowError}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-700">
                <p className="font-semibold mb-0.5">Sobre o reengajamento</p>
                <p className="text-xs">
                  As pessoas importadas entram na régua de reengajamento automaticamente — mas o agente envia
                  no máximo 50 mensagens/dia por cadência normal. Não há risco de spam em massa.
                </p>
              </div>
            </div>
          )}

          {/* Preview loading */}
          {step === 'preview' && isProcessing && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 size={32} className="animate-spin text-[#e13500]" />
              <p className="text-sm text-[#8A8A8A]">Verificando duplicatas…</p>
            </div>
          )}

          {/* STEP: IMPORTING */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <Loader2 size={40} className="animate-spin text-[#e13500]" />
              <p className="text-[#161616] font-medium">Importando membros…</p>
              <p className="text-sm text-[#8A8A8A]">Isso pode levar alguns segundos</p>
            </div>
          )}

          {/* STEP: DONE */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className="flex flex-col items-center py-6 gap-3">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <Check size={30} className="text-green-600" />
                </div>
                <p className="text-lg font-semibold text-[#161616]">Importação concluída!</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{result.inserted}</p>
                  <p className="text-xs text-green-600 mt-0.5">Importadas</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-yellow-700">{result.skipped}</p>
                  <p className="text-xs text-yellow-600 mt-0.5">Ignoradas (dup)</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-[#e13500]">{result.errors}</p>
                  <p className="text-xs text-[#e13500] mt-0.5">Erros</p>
                </div>
              </div>
              {result.errorRows.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[#e13500] uppercase tracking-wide mb-2">
                    Linhas com falha
                  </p>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {result.errorRows.map((r, i) => (
                      <div key={i} className="text-xs bg-red-50 rounded px-3 py-1.5 flex justify-between gap-2">
                        <span className="text-[#161616] truncate">{r.name}</span>
                        <span className="text-[#e13500] shrink-0">{r.reason.slice(0, 60)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.inserted > 0 && (
                <p className="text-xs text-center text-[#8A8A8A]">
                  {result.inserted} membro(s) adicionado(s). Atualiza a lista de Pessoas automaticamente.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <div className="px-6 py-4 border-t border-[#EDE0CC] flex items-center justify-between shrink-0">

          {step === 'upload' && (
            <p className="text-xs text-[#8A8A8A]">Nenhum dado é enviado antes de confirmar</p>
          )}

          {step === 'mapping' && (
            <>
              <Button variant="secondary" size="sm" onClick={reset}>← Voltar</Button>
              <Button
                size="sm"
                onClick={() => { void processPreview() }}
                disabled={isProcessing || mapping['name'] === null || mapping['name'] === undefined}
              >
                {isProcessing ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Verificar dados →
              </Button>
            </>
          )}

          {step === 'preview' && !isProcessing && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setStep('mapping')}>← Ajustar</Button>
              <Button
                size="sm"
                onClick={() => { void executeImport() }}
                disabled={validRows.length === 0}
              >
                Importar {validRows.length} {validRows.length === 1 ? 'pessoa' : 'pessoas'} →
              </Button>
            </>
          )}

          {step === 'done' && (
            <Button size="sm" onClick={() => { reset(); onClose() }} className="ml-auto">
              Fechar
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
