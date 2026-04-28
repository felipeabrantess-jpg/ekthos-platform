import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FileText, Users, UserCheck, Heart, ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import CellReportForm, { type CellReport } from './CellReportForm'

interface CellReportsProps {
  groupId: string
}

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  draft:     { label: 'Rascunho',  className: 'bg-gray-100 text-gray-500' },
  submitted: { label: 'Enviado',   className: 'bg-brand-50 text-brand-700' },
  reviewed:  { label: 'Revisado',  className: 'bg-green-50 text-green-700' },
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function ReportCard({
  report,
  onEdit,
  onDelete,
}: {
  report: CellReport
  onEdit: (r: CellReport) => void
  onDelete: (id: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const s = STATUS_LABEL[report.status] ?? STATUS_LABEL.submitted

  const hasDetails =
    report.topic || report.notes || report.prayer_requests ||
    report.praise_reports || report.challenges

  return (
    <div className="bg-white rounded-2xl border border-black/10 overflow-hidden">
      {/* Summary row */}
      <div className="flex items-center gap-3 p-4">
        <div className="w-9 h-9 rounded-xl bg-cream flex items-center justify-center shrink-0">
          <FileText className="w-4 h-4 text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-ekthos-black">{formatDate(report.meeting_date)}</p>
            <span className={`text-xs px-2 py-0.5 rounded-lg font-medium ${s.className}`}>{s.label}</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Users className="w-3 h-3" />{report.total_present} presentes</span>
            {report.visitors_count > 0 && <span className="flex items-center gap-1"><UserCheck className="w-3 h-3" />{report.visitors_count} visitantes</span>}
            {report.new_converts > 0 && <span className="flex items-center gap-1 text-brand-600 font-medium"><Heart className="w-3 h-3" />{report.new_converts} decisões</span>}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(report)}
            className="p-2 rounded-lg hover:bg-cream transition-colors text-gray-400 hover:text-brand-600"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(report.id)}
            className="p-2 rounded-lg hover:bg-red-50 transition-colors text-gray-400 hover:text-red-500"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          {hasDetails && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="p-2 rounded-lg hover:bg-cream transition-colors text-gray-400"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && hasDetails && (
        <div className="border-t border-black/5 px-4 pb-4 space-y-3">
          {report.topic && (
            <DetailBlock label="Tema" value={report.topic} />
          )}
          {report.notes && (
            <DetailBlock label="Observações" value={report.notes} />
          )}
          {report.prayer_requests && (
            <DetailBlock label="Pedidos de oração" value={report.prayer_requests} />
          )}
          {report.praise_reports && (
            <DetailBlock label="Motivos de louvor" value={report.praise_reports} />
          )}
          {report.challenges && (
            <DetailBlock label="Desafios" value={report.challenges} />
          )}
        </div>
      )}
    </div>
  )
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{label}</p>
      <p className="text-sm text-ekthos-black whitespace-pre-line">{value}</p>
    </div>
  )
}

export default function CellReports({ groupId }: CellReportsProps) {
  const { churchId } = useAuth()
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editReport, setEditReport] = useState<CellReport | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['cell_reports', groupId],
    enabled: !!churchId && !!groupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cell_reports')
        .select('id, cell_id, meeting_date, total_present, visitors_count, new_converts, topic, notes, prayer_requests, praise_reports, challenges, status')
        .eq('church_id', churchId!)
        .eq('cell_id', groupId)
        .order('meeting_date', { ascending: false })
      if (error) throw error
      return (data ?? []) as CellReport[]
    },
  })

  const deleteReport = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cell_reports').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cell_reports', groupId] })
      setDeletingId(null)
    },
  })

  const openEdit = (r: CellReport) => {
    setEditReport(r)
    setShowForm(true)
  }

  const closeForm = () => {
    setShowForm(false)
    setEditReport(null)
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{reports.length} relatório{reports.length !== 1 ? 's' : ''}</p>
        <Button size="sm" onClick={() => { setEditReport(null); setShowForm(true) }}>
          <Plus className="w-3.5 h-3.5" />
          Novo relatório
        </Button>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Spinner size="lg" /></div>
      ) : reports.length === 0 ? (
        <div className="text-center py-10 text-gray-400">
          <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum relatório ainda.</p>
          <p className="text-xs mt-1">Registre a primeira reunião desta célula.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map(r => (
            <ReportCard
              key={r.id}
              report={r}
              onEdit={openEdit}
              onDelete={id => setDeletingId(id)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeletingId(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-ekthos-black mb-2">Excluir relatório?</h3>
            <p className="text-sm text-gray-500 mb-4">Esta ação não pode ser desfeita.</p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setDeletingId(null)} className="flex-1">
                Cancelar
              </Button>
              <Button
                variant="danger"
                onClick={() => deleteReport.mutate(deletingId)}
                loading={deleteReport.isPending}
                className="flex-1"
              >
                Excluir
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <CellReportForm groupId={groupId} onClose={closeForm} editReport={editReport} />
      )}
    </div>
  )
}
