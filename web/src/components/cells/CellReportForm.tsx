import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

interface CellReportFormProps {
  groupId: string
  onClose: () => void
  editReport?: CellReport | null
}

export interface CellReport {
  id: string
  cell_id: string
  meeting_date: string
  total_present: number
  visitors_count: number
  new_converts: number
  topic: string | null
  notes: string | null
  prayer_requests: string | null
  praise_reports: string | null
  challenges: string | null
  status: 'draft' | 'submitted' | 'reviewed'
}

function Textarea({ label, value, onChange, placeholder, rows = 3 }: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-ekthos-black mb-1.5">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm
          placeholder-gray-400 bg-white shadow-sm resize-none
          focus:outline-none focus:ring-2 focus:ring-brand-600 focus:border-brand-600"
      />
    </div>
  )
}

export default function CellReportForm({ groupId, onClose, editReport }: CellReportFormProps) {
  const { churchId, user } = useAuth()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    meeting_date:    editReport?.meeting_date ?? new Date().toISOString().split('T')[0],
    total_present:   editReport?.total_present ?? 0,
    visitors_count:  editReport?.visitors_count ?? 0,
    new_converts:    editReport?.new_converts ?? 0,
    topic:           editReport?.topic ?? '',
    notes:           editReport?.notes ?? '',
    prayer_requests: editReport?.prayer_requests ?? '',
    praise_reports:  editReport?.praise_reports ?? '',
    challenges:      editReport?.challenges ?? '',
  })

  const set = (k: string, v: string | number) => setForm(f => ({ ...f, [k]: v }))
  const num = (v: string) => Math.max(0, parseInt(v) || 0)

  const save = useMutation({
    mutationFn: async (status: 'draft' | 'submitted') => {
      const payload = {
        church_id:       churchId!,
        cell_id:         groupId,
        leader_id:       user?.id ?? null,
        reported_by:     user?.id ?? null,
        meeting_date:    form.meeting_date,
        total_present:   form.total_present,
        visitors_count:  form.visitors_count,
        new_converts:    form.new_converts,
        topic:           form.topic || null,
        notes:           form.notes || null,
        prayer_requests: form.prayer_requests || null,
        praise_reports:  form.praise_reports || null,
        challenges:      form.challenges || null,
        status,
      }
      if (editReport) {
        const { error } = await supabase
          .from('cell_reports')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editReport.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('cell_reports').insert(payload)
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cell_reports', groupId] })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-black/10 sticky top-0 bg-white z-10">
          <h2 className="font-semibold text-ekthos-black">
            {editReport ? 'Editar Relatório' : 'Novo Relatório de Reunião'}
          </h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-cream transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Date */}
          <Input
            label="Data da reunião"
            type="date"
            value={form.meeting_date}
            onChange={e => set('meeting_date', e.target.value)}
          />

          {/* Attendance numbers */}
          <div className="grid grid-cols-3 gap-3">
            <Input
              label="Presentes"
              type="number"
              min={0}
              value={form.total_present}
              onChange={e => set('total_present', num(e.target.value))}
            />
            <Input
              label="Visitantes"
              type="number"
              min={0}
              value={form.visitors_count}
              onChange={e => set('visitors_count', num(e.target.value))}
            />
            <Input
              label="Decisões"
              type="number"
              min={0}
              value={form.new_converts}
              onChange={e => set('new_converts', num(e.target.value))}
            />
          </div>

          {/* Topic */}
          <Input
            label="Tema / Estudo"
            placeholder="Ex: A fé que transforma"
            value={form.topic}
            onChange={e => set('topic', e.target.value)}
          />

          {/* Notes */}
          <Textarea
            label="Observações gerais"
            value={form.notes}
            onChange={v => set('notes', v)}
            placeholder="Como foi a reunião? Destaque algo especial..."
          />

          {/* Prayer requests */}
          <Textarea
            label="Pedidos de oração"
            value={form.prayer_requests}
            onChange={v => set('prayer_requests', v)}
            placeholder="Liste os pedidos compartilhados..."
          />

          {/* Praise reports */}
          <Textarea
            label="Motivos de louvor"
            value={form.praise_reports}
            onChange={v => set('praise_reports', v)}
            placeholder="Testemunhos e bênçãos reportadas..."
          />

          {/* Challenges */}
          <Textarea
            label="Desafios"
            value={form.challenges}
            onChange={v => set('challenges', v)}
            placeholder="Dificuldades ou pontos de atenção..."
          />
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 border-t border-black/10 sticky bottom-0 bg-white">
          <Button
            variant="secondary"
            onClick={() => save.mutate('draft')}
            loading={save.isPending}
            disabled={save.isPending}
          >
            Salvar rascunho
          </Button>
          <Button
            onClick={() => save.mutate('submitted')}
            loading={save.isPending}
            disabled={save.isPending}
            className="flex-1"
          >
            Enviar relatório
          </Button>
        </div>
      </div>
    </div>
  )
}
