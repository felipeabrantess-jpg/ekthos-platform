/**
 * RelatoriosCulto — /culto/relatorios
 *
 * CRM autenticado: gerenciar voluntários/reporters + histórico de cultos submetidos.
 * Acesso por church_id via RLS (auth_church_id()) — policies criadas na Fatia 1.
 *
 * Tabs:
 *   "Histórico"  — lista de cultos submetidos, filtro sede+período, detalhe expansível
 *   "Voluntários" — reporters (links de preenchimento), criar, copiar, ativar/desativar
 */

import { useState, Fragment } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ClipboardList,
  Plus,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Church,
  Mic2,
  BookOpen,
  Music2,
  Baby,
  DoorOpen,
  ShieldCheck,
  HandHeart,
  StickyNote,
  X,
} from 'lucide-react'
import { useAuth }   from '@/hooks/useAuth'
import { supabase }  from '@/lib/supabase'
import Spinner       from '@/components/ui/Spinner'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Reporter {
  id:         string
  name:       string
  sede:       string
  fill_token: string
  is_active:  boolean
  created_at: string
}

interface ServiceReport {
  id:                 string
  sede:               string
  service_date:       string | null
  service_type:       string
  service_type_other: string | null
  pastor_name:        string | null
  is_guest_pastor:    boolean
  guest_pastor_name:  string | null
  worship_leader:     string | null
  sermon_topic:       string | null
  total_people:       number | null
  total_visitors:     number | null
  notes:              string | null
  view_token:         string
  submitted_at:       string | null
  service_report_reporters: { name: string | null } | null
}

interface AreaCount {
  area_name:       string
  volunteer_count: number
  kids_count:      number | null
}

// ── Constantes ────────────────────────────────────────────────────────────────

const SEDE_LABELS: Record<string, string> = {
  itaipu:   'Itaipu',
  trindade: 'Trindade',
  geral:    'Geral',
}

const SEDE_COLORS: Record<string, { bg: string; color: string }> = {
  itaipu:   { bg: '#dbeafe', color: '#1e40af' },
  trindade: { bg: '#dcfce7', color: '#166534' },
  geral:    { bg: '#f3f4f6', color: '#374151' },
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  domingo_manha: 'Dom. manhã',
  domingo_noite: 'Dom. noite',
  quarta:        'Quarta-feira',
  especial:      'Especial',
}

type AreaKey = 'kids' | 'recepcao' | 'portaria' | 'louvor' | 'intercessao'

const AREA_CONFIG: Record<AreaKey, { label: string; Icon: React.FC<{ size?: number; className?: string }> }> = {
  kids:        { label: 'Kids',        Icon: Baby        },
  recepcao:    { label: 'Recepção',    Icon: DoorOpen    },
  portaria:    { label: 'Portaria',    Icon: ShieldCheck },
  louvor:      { label: 'Louvor',      Icon: Music2      },
  intercessao: { label: 'Intercessão', Icon: HandHeart   },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null): string {
  if (!d) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day:     'numeric',
      month:   'short',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(d + 'T12:00:00'))
  } catch { return d }
}

// ── CopyButton ────────────────────────────────────────────────────────────────

function CopyButton({ text, label = 'Copiar' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors whitespace-nowrap"
      style={{ background: copied ? '#dcfce7' : '#f3f4f6', color: copied ? '#166534' : '#374151' }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copiado!' : label}
    </button>
  )
}

// ── SedeBadge ─────────────────────────────────────────────────────────────────

function SedeBadge({ sede }: { sede: string }) {
  const colors = SEDE_COLORS[sede] ?? SEDE_COLORS.geral
  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: colors.bg, color: colors.color }}
    >
      {SEDE_LABELS[sede] ?? sede}
    </span>
  )
}

// ── CreateReporterModal ───────────────────────────────────────────────────────

interface CreateReporterModalProps {
  churchId:  string
  onClose:   () => void
  onCreated: () => void
}

function CreateReporterModal({ churchId, onClose, onCreated }: CreateReporterModalProps) {
  const [name,    setName]    = useState('')
  const [sede,    setSede]    = useState('itaipu')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) { setError('Nome é obrigatório.'); return }
    setLoading(true)
    setError(null)
    const { error: err } = await supabase
      .from('service_report_reporters')
      .insert({ church_id: churchId, name: name.trim(), sede })
    setLoading(false)
    if (err) { setError(err.message); return }
    onCreated()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-bold text-gray-900">Novo Voluntário</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={e => void handleSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">
              Nome do voluntário
            </label>
            <input
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              placeholder="Ex: Maria da Silva"
              value={name}
              onChange={e => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Sede</label>
            <select
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
              value={sede}
              onChange={e => setSede(e.target.value)}
            >
              <option value="itaipu">Itaipu</option>
              <option value="trindade">Trindade</option>
              <option value="geral">Geral</option>
            </select>
          </div>

          <p className="text-xs text-gray-400">
            Um link único será gerado para este voluntário. Compartilhe com ele para que
            preencha os relatórios de culto.
          </p>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-gray-200 rounded-xl py-2.5 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Criando...' : 'Criar voluntário'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── ReportDetail (áreas, expansível) ─────────────────────────────────────────

function ReportDetail({ reportId }: { reportId: string }) {
  const { data: areas, isLoading } = useQuery({
    queryKey: ['service_report_areas', reportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_report_area_counts')
        .select('area_name, volunteer_count, kids_count')
        .eq('report_id', reportId)
      if (error) throw error
      return (data ?? []) as AreaCount[]
    },
  })

  if (isLoading) return <div className="py-2"><Spinner size="sm" /></div>
  if (!areas?.length) return null

  return (
    <div className="flex flex-wrap gap-2">
      {areas.map(a => {
        const cfg = AREA_CONFIG[a.area_name as AreaKey]
        if (!cfg) return null
        const Icon = cfg.Icon
        return (
          <div
            key={a.area_name}
            className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}
          >
            <Icon size={14} className="text-blue-500 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-blue-900 leading-tight">{cfg.label}</p>
              <p className="text-xs text-blue-600 leading-tight">
                {a.volunteer_count} vol.
                {a.area_name === 'kids' && a.kids_count != null
                  ? ` · ${a.kids_count} cri.`
                  : ''}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

type Tab = 'historico' | 'voluntarios'

export default function RelatoriosCulto() {
  const { churchId }   = useAuth()
  const queryClient    = useQueryClient()

  const [tab,         setTab]         = useState<Tab>('historico')
  const [createOpen,  setCreateOpen]  = useState(false)
  const [expandedId,  setExpandedId]  = useState<string | null>(null)

  // Filtros do histórico
  const [filterSede, setFilterSede] = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')

  // ── Query: reporters
  const { data: reporters, isLoading: loadingReporters } = useQuery({
    queryKey: ['service_report_reporters', churchId],
    queryFn:  async () => {
      const { data, error } = await supabase
        .from('service_report_reporters')
        .select('id, name, sede, fill_token, is_active, created_at')
        .eq('church_id', churchId!)
        .order('created_at')
      if (error) throw error
      return data as Reporter[]
    },
    enabled: !!churchId,
  })

  // ── Query: histórico de cultos
  const { data: reports, isLoading: loadingReports } = useQuery({
    queryKey: ['service_reports', churchId, filterSede, filterFrom, filterTo],
    queryFn:  async () => {
      let q = supabase
        .from('service_reports')
        .select('id, sede, service_date, service_type, service_type_other, pastor_name, is_guest_pastor, guest_pastor_name, worship_leader, sermon_topic, total_people, total_visitors, notes, view_token, submitted_at, service_report_reporters(name)')
        .eq('church_id', churchId!)
        .eq('status', 'submitted')
        .order('service_date', { ascending: false })
      if (filterSede) q = q.eq('sede', filterSede)
      if (filterFrom) q = q.gte('service_date', filterFrom)
      if (filterTo)   q = q.lte('service_date', filterTo)
      const { data, error } = await q
      if (error) throw error
      return data as ServiceReport[]
    },
    enabled: !!churchId,
  })

  // ── Toggle reporter ativo/inativo
  const handleToggleActive = async (r: Reporter) => {
    await supabase
      .from('service_report_reporters')
      .update({ is_active: !r.is_active })
      .eq('id', r.id)
      .eq('church_id', churchId!)
    void queryClient.invalidateQueries({ queryKey: ['service_report_reporters', churchId] })
  }

  const fillLink = (token: string) =>
    `${window.location.origin}/culto/preencher/${token}`
  const viewLink = (token: string) =>
    `${window.location.origin}/culto/ver/${token}`

  const hasFilters = !!(filterSede || filterFrom || filterTo)

  // ── Guard ─────────────────────────────────────────────────────────────────
  if (!churchId) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-gray-500">Igreja não identificada.</p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#eff6ff' }}
          >
            <ClipboardList size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Relatórios de Culto</h1>
            <p className="text-xs text-gray-500">Registro de presença e voluntários por culto</p>
          </div>
        </div>

        {tab === 'voluntarios' && (
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} /> Novo Voluntário
          </button>
        )}
      </div>

      {/* Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {(['historico', 'voluntarios'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={
              tab === t
                ? { background: '#fff', color: '#1d4ed8', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }
                : { color: '#6b7280' }
            }
          >
            {t === 'historico' ? 'Histórico de cultos' : 'Voluntários / links'}
          </button>
        ))}
      </div>

      {/* ── Tab: Histórico ─────────────────────────────────────────────────── */}
      {tab === 'historico' && (
        <div className="space-y-4">

          {/* Filtros */}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Sede</label>
              <select
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={filterSede}
                onChange={e => setFilterSede(e.target.value)}
              >
                <option value="">Todas as sedes</option>
                <option value="itaipu">Itaipu</option>
                <option value="trindade">Trindade</option>
                <option value="geral">Geral</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">De</label>
              <input
                type="date"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Até</label>
              <input
                type="date"
                className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                value={filterTo}
                onChange={e => setFilterTo(e.target.value)}
              />
            </div>
            {hasFilters && (
              <button
                onClick={() => { setFilterSede(''); setFilterFrom(''); setFilterTo('') }}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 py-2 transition-colors"
              >
                <X size={12} /> Limpar filtros
              </button>
            )}
          </div>

          {/* Tabela de cultos */}
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: '#fff', border: '1px solid #e5e7eb' }}
          >
            {loadingReports ? (
              <div className="py-12 flex justify-center"><Spinner /></div>
            ) : !reports?.length ? (
              <div className="py-14 text-center">
                <Church size={32} className="text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">
                  {hasFilters ? 'Nenhum culto neste período / sede.' : 'Nenhum culto registrado ainda.'}
                </p>
                {!hasFilters && (
                  <p className="text-xs text-gray-400 mt-1">
                    Compartilhe o link com o voluntário para que ele preencha após o culto.
                  </p>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[680px]">
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <th className="w-8" />
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Sede</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Pastor</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Pessoas</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Visitantes</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {reports.map((r, i) => {
                        const isExpanded = expandedId === r.id
                        return (
                          <Fragment key={r.id}>
                            <tr
                              style={{
                                borderTop:   i > 0 ? '1px solid #f9fafb' : 'none',
                                cursor:      'pointer',
                                background:  isExpanded ? '#f8faff' : undefined,
                              }}
                              onClick={() => setExpandedId(isExpanded ? null : r.id)}
                            >
                              <td className="pl-4 py-3 text-gray-400">
                                {isExpanded
                                  ? <ChevronDown  size={14} />
                                  : <ChevronRight size={14} />
                                }
                              </td>
                              <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                                {formatDate(r.service_date)}
                              </td>
                              <td className="px-4 py-3">
                                <SedeBadge sede={r.sede} />
                              </td>
                              <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                                {r.service_type === 'outro'
                                  ? (r.service_type_other ?? 'Outro')
                                  : (SERVICE_TYPE_LABELS[r.service_type] ?? r.service_type)
                                }
                              </td>
                              <td className="px-4 py-3 text-gray-700 max-w-[160px]">
                                <span className="truncate block">
                                  {r.is_guest_pastor && r.guest_pastor_name
                                    ? <>
                                        {r.pastor_name ?? '—'}
                                        <span
                                          className="ml-1.5 text-xs rounded-full px-2 py-0.5 font-medium"
                                          style={{ background: '#fef9c3', color: '#854d0e' }}
                                        >
                                          Convidado
                                        </span>
                                      </>
                                    : (r.pastor_name ?? '—')
                                  }
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right font-medium text-gray-900">
                                {r.total_people ?? '—'}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-600">
                                {r.total_visitors ?? '—'}
                              </td>
                              <td className="px-4 py-3">
                                <CopyButton text={viewLink(r.view_token)} label="Copiar link" />
                              </td>
                            </tr>

                            {/* Detalhe expansível */}
                            {isExpanded && (
                              <tr style={{ background: '#f8faff', borderTop: '1px solid #e0eaff' }}>
                                <td colSpan={8} className="px-6 pb-5 pt-3">
                                  <div className="space-y-3 max-w-2xl">

                                    {/* Informações adicionais */}
                                    {(r.worship_leader || r.sermon_topic || (r.is_guest_pastor && r.guest_pastor_name)) && (
                                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                                        {r.worship_leader && (
                                          <span className="flex items-center gap-1.5">
                                            <Music2 size={13} className="text-gray-400" />
                                            Louvor: <strong className="text-gray-800">{r.worship_leader}</strong>
                                          </span>
                                        )}
                                        {r.sermon_topic && (
                                          <span className="flex items-center gap-1.5">
                                            <BookOpen size={13} className="text-gray-400" />
                                            Tema: <strong className="text-gray-800">{r.sermon_topic}</strong>
                                          </span>
                                        )}
                                        {r.is_guest_pastor && r.guest_pastor_name && (
                                          <span className="flex items-center gap-1.5">
                                            <Mic2 size={13} className="text-gray-400" />
                                            Pastor convidado: <strong className="text-gray-800">{r.guest_pastor_name}</strong>
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {/* Áreas de serviço */}
                                    <ReportDetail reportId={r.id} />

                                    {/* Observações */}
                                    {r.notes && (
                                      <div className="flex items-start gap-2 text-sm text-gray-600">
                                        <StickyNote size={13} className="text-gray-400 mt-0.5 shrink-0" />
                                        <span className="whitespace-pre-wrap leading-relaxed">{r.notes}</span>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Rodapé: contagem */}
                <div
                  className="px-4 py-2"
                  style={{ borderTop: '1px solid #f9fafb' }}
                >
                  <p className="text-xs text-gray-400">
                    {reports.length} culto{reports.length !== 1 ? 's' : ''} encontrado{reports.length !== 1 ? 's' : ''}
                    {hasFilters ? ' (filtros ativos)' : ''}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Voluntários / links ────────────────────────────────────────── */}
      {tab === 'voluntarios' && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid #e5e7eb' }}
        >
          {loadingReporters ? (
            <div className="py-12 flex justify-center"><Spinner /></div>
          ) : !reporters?.length ? (
            <div className="py-14 text-center">
              <p className="text-sm text-gray-500">Nenhum voluntário cadastrado ainda.</p>
              <button
                onClick={() => setCreateOpen(true)}
                className="mt-3 text-sm text-blue-600 hover:underline"
              >
                Criar primeiro voluntário
              </button>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Sede</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Link do voluntário</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reporters.map((r, i) => (
                      <tr
                        key={r.id}
                        style={{ borderTop: i > 0 ? '1px solid #f9fafb' : 'none' }}
                      >
                        <td className="px-4 py-3 font-medium text-gray-900">{r.name}</td>
                        <td className="px-4 py-3"><SedeBadge sede={r.sede} /></td>
                        <td className="px-4 py-3">
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={
                              r.is_active
                                ? { background: '#dcfce7', color: '#166534' }
                                : { background: '#f3f4f6', color: '#6b7280' }
                            }
                          >
                            {r.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {r.is_active ? (
                            <CopyButton text={fillLink(r.fill_token)} label="Copiar link" />
                          ) : (
                            <span className="text-xs text-gray-400">Link desativado</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => void handleToggleActive(r)}
                            className="text-xs px-2 py-1 rounded-lg border transition-colors hover:bg-gray-50"
                            style={{
                              borderColor: '#e5e7eb',
                              color: r.is_active ? '#dc2626' : '#2563eb',
                            }}
                          >
                            {r.is_active ? 'Desativar' : 'Reativar'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-2" style={{ borderTop: '1px solid #f9fafb' }}>
                <p className="text-xs text-gray-400">
                  {reporters.length} voluntário{reporters.length !== 1 ? 's' : ''} cadastrado{reporters.length !== 1 ? 's' : ''}
                </p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Modal criar reporter ──────────────────────────────────────────────── */}
      {createOpen && (
        <CreateReporterModal
          churchId={churchId}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ['service_report_reporters', churchId] })
          }}
        />
      )}

    </div>
  )
}
