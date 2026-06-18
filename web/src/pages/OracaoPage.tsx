/**
 * OracaoPage — /oracao  (CRM interno)
 * Lista e gerencia pedidos de oração da IGV.
 * Status: novo → orado → atendido.
 */

import { useState }                from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Heart, CheckCircle2, BookOpen } from 'lucide-react'
import { useAuth }                 from '@/hooks/useAuth'
import { supabase }                from '@/lib/supabase'
import Spinner                     from '@/components/ui/Spinner'

// ── Tipos ────────────────────────────────────────────────────────────────────

type PrayerStatus = 'novo' | 'orado' | 'atendido'

interface PrayerRequest {
  id:           string
  name:         string
  phone:        string
  request_text: string
  status:       PrayerStatus
  is_test:      boolean
  created_at:   string
  person_id:    string | null
}

const STATUS_LABEL: Record<PrayerStatus, string> = {
  novo:     'Novo',
  orado:    'Orado',
  atendido: 'Atendido',
}

const STATUS_NEXT: Record<PrayerStatus, PrayerStatus | null> = {
  novo:     'orado',
  orado:    'atendido',
  atendido: null,
}

const STATUS_COLORS: Record<PrayerStatus, string> = {
  novo:     'bg-amber-100 text-amber-800',
  orado:    'bg-blue-100 text-blue-800',
  atendido: 'bg-emerald-100 text-emerald-800',
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

// ── Componente item ───────────────────────────────────────────────────────────

function PrayerCard({
  item,
  onAdvance,
  advancing,
}: {
  item:      PrayerRequest
  onAdvance: (id: string, next: PrayerStatus) => void
  advancing: boolean
}) {
  const next = STATUS_NEXT[item.status]

  return (
    <div className="bg-white rounded-2xl border border-black/[0.06] p-4 shadow-sm flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-[0.9rem] truncate">{item.name}</p>
          <p className="text-[0.75rem] text-gray-400 mt-0.5">{item.phone}</p>
        </div>
        <span className={`shrink-0 text-[0.7rem] font-semibold px-2.5 py-1 rounded-full ${STATUS_COLORS[item.status]}`}>
          {STATUS_LABEL[item.status]}
        </span>
      </div>

      <p className="text-[0.85rem] text-gray-700 leading-relaxed border-l-2 border-amber-200 pl-3 italic">
        {item.request_text}
      </p>

      <div className="flex items-center justify-between pt-1">
        <p className="text-[0.72rem] text-gray-400">{formatDate(item.created_at)}</p>
        {next && (
          <button
            onClick={() => onAdvance(item.id, next)}
            disabled={advancing}
            className="flex items-center gap-1.5 text-[0.78rem] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {advancing ? (
              <span className="w-3.5 h-3.5 border-2 border-amber-400/40 border-t-amber-600 rounded-full animate-spin inline-block" />
            ) : (
              next === 'orado' ? <BookOpen size={13} strokeWidth={2} /> : <CheckCircle2 size={13} strokeWidth={2} />
            )}
            {next === 'orado' ? 'Marcar como orado' : 'Marcar atendido'}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function OracaoPage() {
  const { churchId }        = useAuth()
  const qc                  = useQueryClient()
  const [filter, setFilter] = useState<PrayerStatus | 'todos'>('todos')
  const [advancing, setAdvancing] = useState<string | null>(null)

  const { data: items = [], isLoading, error } = useQuery({
    queryKey: ['prayer_requests', churchId, filter],
    enabled:  !!churchId,
    queryFn: async () => {
      let q = (supabase as any)
        .from('prayer_requests')
        .select('id, name, phone, request_text, status, is_test, created_at, person_id')
        .order('created_at', { ascending: false })

      if (filter !== 'todos') q = q.eq('status', filter)

      const { data, error: qErr } = await q
      if (qErr) throw qErr
      return (data ?? []) as PrayerRequest[]
    },
  })

  const advanceMutation = useMutation({
    mutationFn: async ({ id, next }: { id: string; next: PrayerStatus }) => {
      const { error: upErr } = await (supabase as any)
        .from('prayer_requests')
        .update({ status: next })
        .eq('id', id)
      if (upErr) throw upErr
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['prayer_requests', churchId] })
    },
    onSettled: () => setAdvancing(null),
  })

  function handleAdvance(id: string, next: PrayerStatus) {
    setAdvancing(id)
    advanceMutation.mutate({ id, next })
  }

  const counts = {
    todos:    items.length,
    novo:     items.filter(i => i.status === 'novo').length,
    orado:    items.filter(i => i.status === 'orado').length,
    atendido: items.filter(i => i.status === 'atendido').length,
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <Heart size={18} strokeWidth={1.75} className="text-amber-700" />
        </div>
        <div>
          <h1 className="text-[1.05rem] font-bold text-gray-900">Pedidos de Oração</h1>
          <p className="text-[0.78rem] text-gray-400 mt-0.5">{counts.todos} pedidos recebidos</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 no-scrollbar">
        {(['todos', 'novo', 'orado', 'atendido'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-[0.78rem] font-semibold transition-colors ${
              filter === f
                ? 'bg-amber-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'todos' ? 'Todos' : STATUS_LABEL[f]}
            {counts[f] > 0 && (
              <span className="ml-1.5 text-[0.7rem] opacity-70">({counts[f]})</span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="md" />
        </div>
      ) : error ? (
        <div className="text-center py-16 text-red-500 text-[0.85rem]">
          Erro ao carregar pedidos. Recarregue a página.
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center">
            <Heart size={22} strokeWidth={1.5} className="text-amber-400" />
          </div>
          <p className="text-gray-400 text-[0.85rem]">
            {filter === 'todos'
              ? 'Nenhum pedido recebido ainda.'
              : `Nenhum pedido com status "${STATUS_LABEL[filter as PrayerStatus]}".`}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(item => (
            <PrayerCard
              key={item.id}
              item={item}
              onAdvance={handleAdvance}
              advancing={advancing === item.id}
            />
          ))}
        </div>
      )}

    </div>
  )
}
