/**
 * Distribuir — /cuidado/distribuir
 * Distribuição em lote: filtra pessoas sem responsável (ou por bairro),
 * seleciona em massa e atribui a um responsável. Permite remanejamento.
 */

import { useState }          from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Users, HeartHandshake } from 'lucide-react'
import { useAuth }  from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import Spinner      from '@/components/ui/Spinner'
import Input        from '@/components/ui/Input'
import CuidadoTabBar from './CuidadoTabBar'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PersonRow {
  id:             string
  name:           string | null
  phone:          string | null
  neighborhood:   string | null
  responsible_id: string | null
  care_status:    string | null
}

interface CareResponsible {
  id:   string
  name: string
  type: string
}

const STATUS_LABELS: Record<string, string> = {
  pendente:    'Pendente',
  contatado:   'Contatado',
  visitado:    'Visitado',
  cuidando:    'Cuidando',
  sem_sucesso: 'Sem sucesso',
}

function formatPhone(phone: string | null) {
  if (!phone) return '—'
  return phone.replace(/^\+55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default function Distribuir() {
  const { churchId } = useAuth()
  const qc           = useQueryClient()

  const [search,         setSearch]         = useState('')
  const [filterBairro,   setFilterBairro]   = useState('')
  const [filterResp,     setFilterResp]     = useState<'todos' | 'sem' | 'com'>('sem')
  const [selected,       setSelected]       = useState<Set<string>>(new Set())
  const [assignTo,       setAssignTo]       = useState('')
  const [assigning,      setAssigning]      = useState(false)
  const [assignError,    setAssignError]    = useState<string | null>(null)

  // Responsáveis ativos
  const { data: responsaveis } = useQuery({
    queryKey: ['care_responsibles', churchId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('care_responsibles')
        .select('id, name, type')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return data as CareResponsible[]
    },
    enabled: !!churchId,
  })

  // Pessoas sem join (FK não declarada — lookup client-side via respMap)
  const { data: pessoas, isLoading } = useQuery({
    queryKey: ['people_for_care', churchId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('people')
        .select('id, name, phone, neighborhood, responsible_id, care_status')
        .eq('church_id', churchId)
        .order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return data as PersonRow[]
    },
    enabled: !!churchId,
  })

  const respMap = new Map((responsaveis ?? []).map(r => [r.id, r.name]))

  // Filtros
  const filtered = (pessoas ?? []).filter(p => {
    const matchSearch = !search || (p.name ?? '').toLowerCase().includes(search.toLowerCase())
    const matchBairro = !filterBairro || (p.neighborhood ?? '').toLowerCase().includes(filterBairro.toLowerCase())
    const matchResp =
      filterResp === 'todos' ? true :
      filterResp === 'sem'   ? !p.responsible_id :
      /* 'com' */               !!p.responsible_id
    return matchSearch && matchBairro && matchResp
  })

  // Bairros únicos para sugestão
  const bairros = [...new Set((pessoas ?? []).map(p => p.neighborhood).filter(Boolean))].sort() as string[]

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(filtered.map(p => p.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function handleAssign() {
    if (!assignTo || selected.size === 0 || !churchId) return
    setAssigning(true)
    setAssignError(null)
    try {
      const ids = [...selected]
      const { error } = await (supabase as any)
        .from('people')
        .update({ responsible_id: assignTo, care_status: 'pendente' })
        .in('id', ids)
        .eq('church_id', churchId)
      if (error) throw new Error(error.message)
      await qc.invalidateQueries({ queryKey: ['people_for_care', churchId] })
      await qc.invalidateQueries({ queryKey: ['care_painel', churchId] })
      setSelected(new Set())
      setAssignTo('')
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Erro ao atribuir')
    } finally {
      setAssigning(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <HeartHandshake size={22} strokeWidth={1.75} style={{ color: 'var(--color-primary)' }} />
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Distribuição de Cuidado
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Selecione pessoas e atribua a um responsável
          </p>
        </div>
      </div>

      <CuidadoTabBar />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex-1 min-w-[180px]">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por nome..."
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <Input
            value={filterBairro}
            onChange={e => setFilterBairro(e.target.value)}
            placeholder="Filtrar por bairro..."
            list="bairros-list"
          />
          <datalist id="bairros-list">
            {bairros.map(b => <option key={b} value={b} />)}
          </datalist>
        </div>
        <select
          value={filterResp}
          onChange={e => setFilterResp(e.target.value as any)}
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-primary)',
          }}
        >
          <option value="sem">Sem responsável</option>
          <option value="com">Com responsável</option>
          <option value="todos">Todos</option>
        </select>
      </div>

      {/* Barra de ação em lote */}
      {selected.size > 0 && (
        <div
          className="flex items-center gap-3 flex-wrap rounded-xl px-4 py-3 mb-4"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          <Users size={16} strokeWidth={2} />
          <span className="text-sm font-medium">{selected.size} selecionada{selected.size > 1 ? 's' : ''}</span>
          <select
            value={assignTo}
            onChange={e => setAssignTo(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ background: 'rgba(255,255,255,0.2)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)' }}
          >
            <option value="">Escolher responsável...</option>
            {(responsaveis ?? []).map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <button
            onClick={() => void handleAssign()}
            disabled={!assignTo || assigning}
            className="rounded-lg px-3 py-1.5 text-sm font-semibold transition-all disabled:opacity-50"
            style={{ background: '#fff', color: 'var(--color-primary)' }}
          >
            {assigning ? 'Atribuindo...' : 'Atribuir'}
          </button>
          <button
            onClick={clearSelection}
            className="ml-auto text-sm opacity-80 hover:opacity-100"
          >
            Limpar seleção
          </button>
          {assignError && (
            <p className="w-full text-xs text-white/80">{assignError}</p>
          )}
        </div>
      )}

      {/* Tabela */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}
        >
          {/* Cabeçalho com selectAll */}
          <div
            className="flex items-center gap-3 px-4 py-3"
            style={{ borderBottom: '1px solid var(--border-default)' }}
          >
            <input
              type="checkbox"
              checked={filtered.length > 0 && selected.size === filtered.length}
              onChange={() => selected.size === filtered.length ? clearSelection() : selectAll()}
              className="rounded"
            />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              {filtered.length} pessoa{filtered.length !== 1 ? 's' : ''}
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-center py-12" style={{ color: 'var(--text-tertiary)' }}>
              Nenhuma pessoa encontrada com esses filtros.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  <th className="w-10 px-4 py-2" />
                  {['Nome', 'Telefone', 'Bairro', 'Responsável', 'Status'].map(h => (
                    <th
                      key={h}
                      className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const isSelected = selected.has(p.id)
                  return (
                    <tr
                      key={p.id}
                      onClick={() => toggleSelect(p.id)}
                      className="cursor-pointer transition-all"
                      style={{
                        borderBottom: '1px solid var(--border-default)',
                        background: isSelected ? 'var(--bg-hover)' : 'transparent',
                      }}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                          onClick={e => e.stopPropagation()}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {p.name ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {formatPhone(p.phone)}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {p.neighborhood ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {p.responsible_id && respMap.get(p.responsible_id)
                          ? respMap.get(p.responsible_id)
                          : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {p.care_status ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                          >
                            {STATUS_LABELS[p.care_status] ?? p.care_status}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
