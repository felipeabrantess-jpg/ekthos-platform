/**
 * Painel — /cuidado/painel
 * Painel de cobrança por responsável: total, pendente, contatado, cuidando, sem sucesso.
 * Permite clicar num responsável para ver detalhes da sua lista.
 */

import { useState }  from 'react'
import { useQuery }  from '@tanstack/react-query'
import { HeartHandshake, ChevronDown, ChevronRight } from 'lucide-react'
import { useAuth }   from '@/hooks/useAuth'
import { supabase }  from '@/lib/supabase'
import Spinner       from '@/components/ui/Spinner'
import CuidadoTabBar from './CuidadoTabBar'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PersonCare {
  id:             string
  name:           string | null
  phone:          string | null
  neighborhood:   string | null
  care_status:    string | null
  care_updated_at: string | null
}

interface CareResponsible {
  id:      string
  name:    string
  type:    string
  region:  string | null
  people:  PersonCare[]
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  pendente:    { label: 'Pendente',    color: '#92400e', bg: '#fef3c7' },
  contatado:   { label: 'Contatado',   color: '#1e40af', bg: '#dbeafe' },
  visitado:    { label: 'Visitado',    color: '#5b21b6', bg: '#ede9fe' },
  cuidando:    { label: 'Cuidando',    color: '#065f46', bg: '#d1fae5' },
  sem_sucesso: { label: 'Sem sucesso', color: '#991b1b', bg: '#fee2e2' },
}

const TYPE_LABELS: Record<string, string> = {
  pastor:     'Pastor(a)',
  lider:      'Líder',
  voluntario: 'Voluntário(a)',
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(iso))
}

function formatPhone(phone: string | null) {
  if (!phone) return '—'
  return phone.replace(/^\+55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}

// ── Linha de responsável no painel ────────────────────────────────────────────

function ResponsavelPainelCard({ resp }: { resp: CareResponsible }) {
  const [expanded, setExpanded] = useState(false)

  const counts = resp.people.reduce(
    (acc, p) => {
      const s = p.care_status ?? 'pendente'
      acc[s] = (acc[s] ?? 0) + 1
      return acc
    },
    {} as Record<string, number>,
  )

  const total = resp.people.length

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)', marginBottom: 12 }}
    >
      {/* Header do card */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-4 px-5 py-4 transition-all text-left"
        style={{ background: 'transparent' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0"
          style={{ background: 'var(--bg-hover)', color: 'var(--color-primary)' }}
        >
          {resp.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{resp.name}</p>
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            {TYPE_LABELS[resp.type]} {resp.region ? `· ${resp.region}` : ''}
          </p>
        </div>
        {/* Mini resumo de status */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span
            className="text-xs font-bold px-2 py-0.5 rounded-full"
            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
          >
            {total} {total === 1 ? 'pessoa' : 'pessoas'}
          </span>
          {Object.entries(STATUS_CONFIG).map(([key, cfg]) => {
            const n = counts[key] ?? 0
            if (n === 0) return null
            return (
              <span
                key={key}
                className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: cfg.bg, color: cfg.color }}
              >
                {cfg.label}: {n}
              </span>
            )
          })}
        </div>
        {expanded
          ? <ChevronDown size={16} strokeWidth={2} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          : <ChevronRight size={16} strokeWidth={2} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        }
      </button>

      {/* Lista expandida */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-default)' }}>
          {resp.people.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>
              Nenhuma pessoa atribuída.
            </p>
          ) : (
            <table className="w-full">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                  {['Nome', 'Telefone', 'Bairro', 'Status', 'Última atualização'].map(h => (
                    <th
                      key={h}
                      className="px-5 py-2 text-left text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resp.people.map(p => {
                  const s  = p.care_status ?? 'pendente'
                  const cfg = STATUS_CONFIG[s] ?? STATUS_CONFIG.pendente
                  return (
                    <tr
                      key={p.id}
                      style={{ borderBottom: '1px solid var(--border-default)' }}
                    >
                      <td className="px-5 py-2.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {p.name ?? '—'}
                      </td>
                      <td className="px-5 py-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {formatPhone(p.phone)}
                      </td>
                      <td className="px-5 py-2.5 text-sm" style={{ color: 'var(--text-secondary)' }}>
                        {p.neighborhood ?? '—'}
                      </td>
                      <td className="px-5 py-2.5">
                        <span
                          className="inline-flex rounded-full px-2 py-0.5 text-xs font-semibold"
                          style={{ background: cfg.bg, color: cfg.color }}
                        >
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-xs" style={{ color: 'var(--text-tertiary)' }}>
                        {formatDate(p.care_updated_at)}
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

// ── Página ─────────────────────────────────────────────────────────────────────

export default function Painel() {
  const { churchId } = useAuth()

  const { data: responsaveis, isLoading, error } = useQuery({
    queryKey: ['care_painel', churchId],
    queryFn: async () => {
      // Busca responsáveis com suas pessoas atribuídas
      const { data: resps, error: rErr } = await (supabase as any)
        .from('care_responsibles')
        .select('id, name, type, region')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (rErr) throw new Error(rErr.message)

      if (!resps || resps.length === 0) return []

      const ids = (resps as { id: string }[]).map(r => r.id)

      const { data: pessoas, error: pErr } = await (supabase as any)
        .from('people')
        .select('id, name, phone, neighborhood, responsible_id, care_status, care_updated_at')
        .eq('church_id', churchId)
        .in('responsible_id', ids)
        .order('name', { ascending: true })
      if (pErr) throw new Error(pErr.message)

      const byResp = ((pessoas ?? []) as (PersonCare & { responsible_id: string })[]).reduce(
        (acc, p) => {
          const rid = p.responsible_id
          if (!acc[rid]) acc[rid] = []
          acc[rid].push(p)
          return acc
        },
        {} as Record<string, PersonCare[]>,
      )

      return (resps as Omit<CareResponsible, 'people'>[]).map(r => ({
        ...r,
        people: byResp[r.id] ?? [],
      })) as CareResponsible[]
    },
    enabled: !!churchId,
  })

  const totalGeral = (responsaveis ?? []).reduce((s, r) => s + r.people.length, 0)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <HeartHandshake size={22} strokeWidth={1.75} style={{ color: 'var(--color-primary)' }} />
        <div>
          <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
            Painel de Cuidado
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
            Acompanhamento por responsável
          </p>
        </div>
      </div>

      <CuidadoTabBar />

      {/* Resumo geral */}
      {!isLoading && responsaveis && (
        <div className="flex gap-4 flex-wrap mb-6">
          <div
            className="rounded-xl px-5 py-3 flex flex-col gap-1"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              Responsáveis ativos
            </p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {responsaveis.length}
            </p>
          </div>
          <div
            className="rounded-xl px-5 py-3 flex flex-col gap-1"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
              Pessoas atribuídas
            </p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {totalGeral}
            </p>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      )}

      {error && (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--color-danger)' }}>
          Erro ao carregar painel.
        </p>
      )}

      {!isLoading && !error && responsaveis && (
        <>
          {responsaveis.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <HeartHandshake size={40} strokeWidth={1.25} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Nenhum responsável ativo ainda. Cadastre em{' '}
                <a href="/cuidado/responsaveis" style={{ color: 'var(--color-primary)' }}>Responsáveis</a>.
              </p>
            </div>
          ) : (
            responsaveis.map(r => <ResponsavelPainelCard key={r.id} resp={r} />)
          )}
        </>
      )}
    </div>
  )
}
