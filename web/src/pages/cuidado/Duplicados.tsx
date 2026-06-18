/**
 * Duplicados — /cuidado/duplicados
 * Lista de duplicatas identificadas para revisão da Vanessa.
 * SOMENTE LEITURA — nenhuma ação automática.
 * Duplicata Clara = mesmo nome + mesmo telefone (2+ registros).
 * Duplicata Incerta = mesmo nome, telefones diferentes.
 */

import { useState }  from 'react'
import { useQuery }  from '@tanstack/react-query'
import { AlertTriangle, HeartHandshake } from 'lucide-react'
import { useAuth }   from '@/hooks/useAuth'
import { supabase }  from '@/lib/supabase'
import Spinner       from '@/components/ui/Spinner'
import CuidadoTabBar from './CuidadoTabBar'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PersonRow {
  id:    string
  name:  string | null
  phone: string | null
  email: string | null
  created_at: string
}

interface DuplicateGroup {
  type:  'clara' | 'incerta'
  name:  string
  items: PersonRow[]
}

function formatPhone(phone: string | null) {
  if (!phone) return '—'
  return phone.replace(/^\+55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' }).format(new Date(iso))
}

// ── Lógica de detecção de duplicatas ─────────────────────────────────────────

function detectDuplicates(pessoas: PersonRow[]): DuplicateGroup[] {
  // Agrupa por nome normalizado
  const byName = new Map<string, PersonRow[]>()
  for (const p of pessoas) {
    const key = (p.name ?? '').toLowerCase().trim()
    if (!key) continue
    if (!byName.has(key)) byName.set(key, [])
    byName.get(key)!.push(p)
  }

  const groups: DuplicateGroup[] = []
  for (const [name, items] of byName) {
    if (items.length < 2) continue

    // Verifica se algum par tem o mesmo telefone (normalizado)
    const phones = items.map(p => (p.phone ?? '').replace(/\D/g, ''))
    const hasPhoneDup = phones.some((ph, i) =>
      ph && phones.indexOf(ph) !== i
    )

    groups.push({
      type:  hasPhoneDup ? 'clara' : 'incerta',
      name:  items[0].name ?? name,
      items: items.sort((a, b) => a.created_at.localeCompare(b.created_at)),
    })
  }

  // Ordenar: claras primeiro
  return groups.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'clara' ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default function Duplicados() {
  const { churchId } = useAuth()
  const [filter, setFilter] = useState<'todos' | 'clara' | 'incerta'>('todos')

  const { data: pessoas, isLoading, error } = useQuery({
    queryKey: ['people_duplicados', churchId],
    queryFn: async () => {
      // Busca apenas pessoas com nomes que aparecem 2+ vezes
      // Estratégia: busca todas e filtra em JS (evita query complexa)
      const { data, error } = await (supabase as any)
        .from('people')
        .select('id, name, phone, email, created_at')
        .eq('church_id', churchId)
        .not('name', 'is', null)
        .order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return data as PersonRow[]
    },
    enabled: !!churchId,
  })

  const groups = detectDuplicates(pessoas ?? [])
  const filtered = groups.filter(g => filter === 'todos' || g.type === filter)
  const claras   = groups.filter(g => g.type === 'clara').length
  const incertas = groups.filter(g => g.type === 'incerta').length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <HeartHandshake size={22} strokeWidth={1.75} style={{ color: 'var(--color-primary)' }} />
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Duplicatas
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Revisão de registros duplicados — somente leitura
          </p>
        </div>
      </div>

      <CuidadoTabBar />

      {/* Legenda */}
      <div
        className="rounded-xl p-4 mb-5 flex flex-wrap gap-4"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: '#ef4444' }} />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <strong>Clara</strong> — mesmo nome + mesmo telefone ({claras} grupo{claras !== 1 ? 's' : ''})
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ background: '#f59e0b' }} />
          <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            <strong>Incerta</strong> — mesmo nome, telefones diferentes ({incertas} grupo{incertas !== 1 ? 's' : ''})
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5" style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
          <AlertTriangle size={12} strokeWidth={2} />
          Decisão sobre cada duplicata é da Vanessa — nenhuma ação automática.
        </div>
      </div>

      {/* Filtro de tipo */}
      <div className="flex gap-2 mb-4">
        {([['todos', 'Todos'], ['clara', 'Claras'], ['incerta', 'Incertas']] as const).map(([val, label]) => (
          <button
            key={val}
            onClick={() => setFilter(val)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all"
            style={{
              background: filter === val ? 'var(--color-primary)' : 'var(--bg-hover)',
              color:      filter === val ? '#fff'                  : 'var(--text-secondary)',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      )}

      {error && (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--color-danger)' }}>
          Erro ao carregar pessoas.
        </p>
      )}

      {!isLoading && !error && (
        <>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <AlertTriangle size={40} strokeWidth={1.25} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                {groups.length === 0
                  ? 'Nenhuma duplicata encontrada.'
                  : 'Nenhuma duplicata nessa categoria.'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map(group => {
                const isClear = group.type === 'clara'
                return (
                  <div
                    key={group.name}
                    className="rounded-xl overflow-hidden"
                    style={{
                      border: `1px solid ${isClear ? '#fca5a5' : '#fcd34d'}`,
                      background: 'var(--bg-surface)',
                    }}
                  >
                    {/* Header do grupo */}
                    <div
                      className="flex items-center gap-3 px-4 py-3"
                      style={{
                        background: isClear ? '#fef2f2' : '#fffbeb',
                        borderBottom: `1px solid ${isClear ? '#fca5a5' : '#fcd34d'}`,
                      }}
                    >
                      <div
                        className="rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide"
                        style={{
                          background: isClear ? '#ef4444' : '#f59e0b',
                          color: '#fff',
                        }}
                      >
                        {isClear ? 'Clara' : 'Incerta'}
                      </div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                        {group.name}
                      </p>
                      <span className="ml-auto text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {group.items.length} registros
                      </span>
                    </div>

                    {/* Linhas */}
                    <table className="w-full">
                      <thead>
                        <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                          {['ID (início)', 'Telefone', 'Email', 'Cadastrado em'].map(h => (
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
                        {group.items.map((p, idx) => (
                          <tr
                            key={p.id}
                            style={{ borderBottom: idx < group.items.length - 1 ? '1px solid var(--border-default)' : 'none' }}
                          >
                            <td className="px-4 py-2.5 text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>
                              {p.id.slice(0, 8)}…
                            </td>
                            <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {formatPhone(p.phone)}
                            </td>
                            <td className="px-4 py-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                              {p.email ?? '—'}
                            </td>
                            <td className="px-4 py-2.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                              {formatDate(p.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
