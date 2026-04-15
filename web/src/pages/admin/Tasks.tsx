import { useEffect, useState } from 'react'
import {
  CheckSquare, Plus, RefreshCw, Circle,
  AlertCircle, Clock, Loader,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

interface Task {
  id:          string
  church_id:   string | null
  title:       string
  description: string | null
  status:      'open' | 'in_progress' | 'done' | 'cancelled'
  priority:    'low' | 'medium' | 'high' | 'urgent'
  due_date:    string | null
  created_at:  string
  completed_at: string | null
}

const PRIORITY_CONFIG = {
  urgent: { label: 'Urgente', color: '#e13500', bg: '#e1350018' },
  high:   { label: 'Alta',    color: '#C4841D', bg: '#C4841D18' },
  medium: { label: 'Média',   color: '#4F6EE1', bg: '#4F6EE118' },
  low:    { label: 'Baixa',   color: '#8A8A8A', bg: '#8A8A8A18' },
}

const STATUS_CONFIG = {
  open:        { label: 'Aberta',       color: '#5A5A5A' },
  in_progress: { label: 'Em andamento', color: '#4F6EE1' },
  done:        { label: 'Concluída',    color: '#2D7A4F' },
  cancelled:   { label: 'Cancelada',    color: '#8A8A8A' },
}

function relDate(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(new Date(iso))
}

export default function AdminTasks() {
  const [tasks,       setTasks]      = useState<Task[]>([])
  const [loading,     setLoading]    = useState(true)
  const [filter,      setFilter]     = useState<'open' | 'in_progress' | 'all'>('open')
  const [showForm,    setShowForm]   = useState(false)
  const [submitting,  setSubmitting] = useState(false)
  const [newTitle,    setNewTitle]   = useState('')
  const [newPriority, setNewPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium')
  const [newDesc,     setNewDesc]    = useState('')
  const [newDue,      setNewDue]     = useState('')

  async function getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  }

  async function load() {
    setLoading(true)
    try {
      const session = await getSession()
      if (!session) return

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const statusParam  = filter === 'all' ? 'all' : filter
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/admin-tasks-crud?status=${statusParam}&limit=100`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      )
      if (!res.ok) throw new Error()
      const json = await res.json() as { data: Task[] }
      setTasks(json.data ?? [])
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [filter])

  async function createTask() {
    if (!newTitle.trim()) return
    setSubmitting(true)
    try {
      const session = await getSession()
      if (!session) return

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
      const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-tasks-crud`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:       newTitle.trim(),
          priority:    newPriority,
          description: newDesc.trim() || null,
          due_date:    newDue || null,
        }),
      })
      if (!res.ok) throw new Error()
      setNewTitle(''); setNewDesc(''); setNewDue(''); setNewPriority('medium')
      setShowForm(false)
      void load()
    } catch {
      // ignore
    } finally {
      setSubmitting(false)
    }
  }

  async function updateStatus(id: string, status: Task['status']) {
    const session = await getSession()
    if (!session) return

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
    await fetch(`${SUPABASE_URL}/functions/v1/admin-tasks-crud`, {
      method:  'PATCH',
      headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, status }),
    })
    void load()
  }

  const urgent = tasks.filter(t => t.priority === 'urgent')
  const rest   = tasks.filter(t => t.priority !== 'urgent')

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-gray-900">Tarefas</h1>
          <p className="text-sm text-gray-400 mt-1">Gestão interna do time Ekthos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-gray-600 bg-white border border-black/5 hover:bg-gray-50 transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} strokeWidth={1.75} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setShowForm(s => !s)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
            style={{ background: '#e13500' }}
          >
            <Plus size={15} strokeWidth={2} />
            Nova tarefa
          </button>
        </div>
      </div>

      {/* Formulário de nova tarefa */}
      {showForm && (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-800">Nova tarefa</h3>
          <input
            type="text"
            placeholder="Título da tarefa..."
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
            style={{ '--tw-ring-color': '#e13500' } as React.CSSProperties}
          />
          <textarea
            placeholder="Descrição (opcional)..."
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
            rows={2}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none"
            style={{ '--tw-ring-color': '#e13500' } as React.CSSProperties}
          />
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Prioridade</label>
              <select
                value={newPriority}
                onChange={e => setNewPriority(e.target.value as typeof newPriority)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none"
              >
                <option value="low">Baixa</option>
                <option value="medium">Média</option>
                <option value="high">Alta</option>
                <option value="urgent">Urgente</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Prazo</label>
              <input
                type="date"
                value={newDue}
                onChange={e => setNewDue(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-xl text-sm text-gray-500 hover:bg-gray-100 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => void createTask()}
              disabled={submitting || !newTitle.trim()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
              style={{ background: '#e13500' }}
            >
              {submitting && <Loader size={13} strokeWidth={2} className="animate-spin" />}
              Criar tarefa
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex items-center gap-1 p-1 bg-white rounded-xl border border-black/5 shadow-sm w-fit">
        {(['open', 'in_progress', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === f ? 'text-white' : 'text-gray-500 hover:text-gray-800'
            }`}
            style={filter === f ? { background: '#e13500' } : undefined}
          >
            {f === 'open' ? 'Abertas' : f === 'in_progress' ? 'Em andamento' : 'Todas'}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64">
          <Spinner size="lg" />
        </div>
      )}

      {!loading && tasks.length === 0 && (
        <div className="bg-white rounded-2xl border border-black/5 shadow-sm p-12 text-center">
          <CheckSquare size={40} strokeWidth={1.5} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Nenhuma tarefa encontrada</p>
        </div>
      )}

      {!loading && tasks.length > 0 && (
        <div className="space-y-4">
          {urgent.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#e13500' }}>
                Urgentes
              </h2>
              <TaskList tasks={urgent} onUpdateStatus={updateStatus} />
            </section>
          )}
          {rest.length > 0 && (
            <TaskList tasks={rest} onUpdateStatus={updateStatus} />
          )}
        </div>
      )}
    </div>
  )
}

function TaskList({ tasks, onUpdateStatus }: {
  tasks: Task[]
  onUpdateStatus: (id: string, status: Task['status']) => void
}) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 shadow-sm divide-y divide-black/[0.04]">
      {tasks.map(task => {
        const p = PRIORITY_CONFIG[task.priority]
        const s = STATUS_CONFIG[task.status]
        const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'done'

        return (
          <div key={task.id} className="px-5 py-4 flex items-start gap-4">
            {/* Status toggle */}
            <button
              onClick={() => onUpdateStatus(task.id, task.status === 'done' ? 'open' : 'done')}
              className="mt-0.5 shrink-0 transition-colors"
              title={task.status === 'done' ? 'Reabrir' : 'Concluir'}
            >
              {task.status === 'done'
                ? <CheckSquare size={18} strokeWidth={1.75} style={{ color: '#2D7A4F' }} />
                : task.status === 'in_progress'
                  ? <AlertCircle size={18} strokeWidth={1.75} style={{ color: '#4F6EE1' }} />
                  : <Circle size={18} strokeWidth={1.75} className="text-gray-300 hover:text-gray-500" />
              }
            </button>

            {/* Conteúdo */}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>
                {task.title}
              </p>
              {task.description && (
                <p className="text-xs text-gray-400 mt-0.5 truncate">{task.description}</p>
              )}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: p.bg, color: p.color }}
                >
                  {p.label}
                </span>
                <span className="text-[10px] text-gray-400" style={{ color: s.color }}>
                  {s.label}
                </span>
                {task.due_date && (
                  <span
                    className="flex items-center gap-1 text-[10px]"
                    style={{ color: isOverdue ? '#e13500' : '#8A8A8A' }}
                  >
                    <Clock size={10} strokeWidth={2} />
                    {relDate(task.due_date)}
                    {isOverdue && ' (atrasada)'}
                  </span>
                )}
              </div>
            </div>

            {/* In progress toggle */}
            {task.status === 'open' && (
              <button
                onClick={() => onUpdateStatus(task.id, 'in_progress')}
                className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors shrink-0 mt-1"
              >
                Iniciar
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
