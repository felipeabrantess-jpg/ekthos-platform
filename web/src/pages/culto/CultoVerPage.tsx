/**
 * CultoVerPage — /culto/ver/:token  (PÚBLICA — sem login, sem sidebar)
 *
 * Visualização do relatório de culto para o pastor.
 * Acesso via view_token gerado na submissão pelo voluntário.
 *
 * Segurança:
 *   - Token 256-bit validado pela EF (server-side). Inválido ou não-submitted → 404.
 *   - Somente leitura: nenhuma escrita acontece nesta página.
 *   - Sem JWT. Token é a única credencial.
 *   - LGPD: sem analytics. Dados exibidos: contagens + nomes de pastores/líderes.
 *     Sem dados de membros identificados.
 *
 * UX: mobile-first 375px. Pastor abre via link recebido no WhatsApp.
 *
 * ⚠️ PENDENTE: EF service-report-handler está com verify_jwt=true (spend cap
 *    bloqueou redeploy). Fluxo UI completo; teste E2E fica pendente até
 *    Felipe desabilitar spend cap e redeploy com verify_jwt=false.
 */

import { useState, useEffect } from 'react'
import { useParams }           from 'react-router-dom'
import {
  Church,
  AlertCircle,
  Calendar,
  Users,
  Mic2,
  BookOpen,
  ClipboardList,
  Baby,
  DoorOpen,
  ShieldCheck,
  Music2,
  HandHeart,
  StickyNote,
} from 'lucide-react'

// ── Constantes ────────────────────────────────────────────────────────────────

const EF_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/service-report-handler`

const SERVICE_TYPE_LABELS: Record<string, string> = {
  domingo_manha: 'Domingo manhã',
  domingo_noite: 'Domingo noite',
  quarta:        'Quarta-feira',
  especial:      'Culto especial',
}

const SEDE_LABELS: Record<string, string> = {
  itaipu:   'Itaipu',
  trindade: 'Trindade',
  geral:    'Geral',
}

const AREA_CONFIG: Record<string, { label: string; icon: React.FC<{ size?: number; className?: string }> }> = {
  kids:        { label: 'Kids',        icon: Baby        },
  recepcao:    { label: 'Recepção',    icon: DoorOpen    },
  portaria:    { label: 'Portaria',    icon: ShieldCheck },
  louvor:      { label: 'Louvor',      icon: Music2      },
  intercessao: { label: 'Intercessão', icon: HandHeart   },
}

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Report {
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
  submitted_at:       string | null
}

interface AreaCount {
  area_name:       string
  volunteer_count: number
  kids_count:      number | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—'
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day:     'numeric',
      month:   'long',
      year:    'numeric',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(dateStr + 'T12:00:00'))
  } catch {
    return dateStr
  }
}

function formatSubmittedAt(ts: string | null) {
  if (!ts) return null
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day:    'numeric',
      month:  'short',
      hour:   '2-digit',
      minute: '2-digit',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(ts))
  } catch {
    return null
  }
}

// ── Linha de dado ─────────────────────────────────────────────────────────────

interface DataRowProps {
  icon:    React.FC<{ size?: number; className?: string }>
  label:   string
  value:   React.ReactNode
}

function DataRow({ icon: Icon, label, value }: DataRowProps) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <div
        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: '#eff6ff' }}
      >
        <Icon size={16} className="text-blue-500" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
        <p className="text-sm text-gray-900 break-words">{value}</p>
      </div>
    </div>
  )
}

// ── Card de área ──────────────────────────────────────────────────────────────

interface AreaCardProps {
  area: AreaCount
}

function AreaCard({ area }: AreaCardProps) {
  const config = AREA_CONFIG[area.area_name]
  if (!config) return null
  const Icon = config.icon

  return (
    <div
      className="rounded-2xl p-4 flex items-center gap-3"
      style={{ background: '#fff', border: '1px solid #e5e7eb' }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: '#eff6ff' }}
      >
        <Icon size={20} className="text-blue-500" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-900">{config.label}</p>
        <p className="text-xs text-gray-500">
          {area.volunteer_count} voluntário{area.volunteer_count !== 1 ? 's' : ''}
          {area.area_name === 'kids' && area.kids_count != null
            ? ` · ${area.kids_count} criança${area.kids_count !== 1 ? 's' : ''}`
            : ''}
        </p>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function CultoVerPage() {
  const { token } = useParams<{ token: string }>()

  const [loading,  setLoading]  = useState(true)
  const [report,   setReport]   = useState<Report | null>(null)
  const [areas,    setAreas]    = useState<AreaCount[]>([])
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return }
    void (async () => {
      try {
        const res = await fetch(`${EF_URL}?view_token=${token}`)
        if (res.status === 404) { setNotFound(true); return }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = await res.json() as { report: Report; areas: AreaCount[] }
        setReport(body.report)
        setAreas(body.areas ?? [])
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [token])

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#f9fafb' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-full border-4 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-sm text-gray-500">Carregando relatório...</p>
        </div>
      </div>
    )
  }

  // ── Não encontrado ─────────────────────────────────────────────────────────
  if (notFound || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" style={{ background: '#f9fafb' }}>
        <div className="text-center max-w-sm">
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ background: '#fee2e2' }}
          >
            <AlertCircle size={28} className="text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-2">Relatório não encontrado</h1>
          <p className="text-sm text-gray-500">
            Este link não existe ou o relatório ainda não foi finalizado.
          </p>
        </div>
      </div>
    )
  }

  // ── Relatório ──────────────────────────────────────────────────────────────
  const submittedStr = formatSubmittedAt(report.submitted_at)

  return (
    <div className="min-h-screen pb-10" style={{ background: '#f9fafb' }}>
      {/* Header */}
      <div
        className="sticky top-0 z-10 border-b border-gray-200 px-4 py-4"
        style={{ background: '#fff' }}
      >
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: '#eff6ff' }}
          >
            <Church size={20} className="text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-900 text-sm truncate">
              Relatório de Culto
            </p>
            <p className="text-xs text-gray-500">
              Sede {SEDE_LABELS[report.sede] ?? report.sede}
              {submittedStr ? ` · Enviado ${submittedStr}` : ''}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">

        {/* ── Card principal ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid #e5e7eb' }}
        >
          <div className="px-4 pt-4 pb-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              Informações do culto
            </p>
          </div>
          <div className="px-4 pb-2">
            <DataRow
              icon={Calendar}
              label="Data"
              value={formatDate(report.service_date)}
            />
            <DataRow
              icon={Church}
              label="Tipo"
              value={
                report.service_type === 'outro'
                  ? (report.service_type_other ?? 'Outro')
                  : (SERVICE_TYPE_LABELS[report.service_type] ?? report.service_type)
              }
            />
            <DataRow
              icon={Mic2}
              label="Pastor"
              value={
                report.is_guest_pastor && report.guest_pastor_name
                  ? <><span>{report.pastor_name ?? '—'}</span><span className="ml-2 text-xs rounded-full px-2 py-0.5 font-medium" style={{ background: '#fef9c3', color: '#854d0e' }}>Convidado: {report.guest_pastor_name}</span></>
                  : (report.pastor_name ?? '—')
              }
            />
            {report.worship_leader && (
              <DataRow
                icon={Music2}
                label="Louvor/Adoração"
                value={report.worship_leader}
              />
            )}
            {report.sermon_topic && (
              <DataRow
                icon={BookOpen}
                label="Tema/Palavra"
                value={report.sermon_topic}
              />
            )}
          </div>
        </div>

        {/* ── Presença ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: '#fff', border: '1px solid #e5e7eb' }}
        >
          <div className="px-4 pt-4 pb-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">
              Presença
            </p>
          </div>
          <div className="px-4 pb-4 grid grid-cols-2 gap-3 pt-2">
            <div
              className="rounded-2xl p-4 text-center"
              style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}
            >
              <p className="text-3xl font-bold text-blue-700">
                {report.total_people ?? '—'}
              </p>
              <p className="text-xs font-semibold text-blue-500 mt-1 flex items-center justify-center gap-1">
                <Users size={12} /> Total de pessoas
              </p>
            </div>
            <div
              className="rounded-2xl p-4 text-center"
              style={{ background: '#f0fdf4', border: '1px solid #bbf7d0' }}
            >
              <p className="text-3xl font-bold text-green-700">
                {report.total_visitors ?? '—'}
              </p>
              <p className="text-xs font-semibold text-green-500 mt-1 flex items-center justify-center gap-1">
                <Users size={12} /> Visitantes
              </p>
            </div>
          </div>
        </div>

        {/* ── Áreas ── */}
        {areas.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList size={14} className="text-gray-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Áreas de serviço
              </p>
            </div>
            <div className="space-y-2">
              {areas.map(a => <AreaCard key={a.area_name} area={a} />)}
            </div>
          </div>
        )}

        {/* ── Observações ── */}
        {report.notes && (
          <div
            className="rounded-2xl p-4"
            style={{ background: '#fff', border: '1px solid #e5e7eb' }}
          >
            <div className="flex items-center gap-2 mb-2">
              <StickyNote size={14} className="text-gray-400" />
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Observações
              </p>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
              {report.notes}
            </p>
          </div>
        )}

        {/* Rodapé */}
        <p className="text-center text-xs text-gray-400 pt-2">
          Registro de Culto · Ekthos Church
        </p>
      </div>
    </div>
  )
}
