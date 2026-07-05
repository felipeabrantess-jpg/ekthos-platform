/**
 * IgvAgenda — /igv/agenda  (pública, sem auth)
 * LGPD R8: zero SELECT em people. Lê horarios de igv-public-data.ts +
 * eventos da EF igv-public-agenda (service_role, hardcoded IGV, só is_public+active).
 */

import { useState, useEffect } from 'react'
import { Link }                from 'react-router-dom'
import { ChevronLeft, Clock, MapPin, Calendar } from 'lucide-react'
import { IGV } from '@/lib/igv-public-data'

const EF_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/igv-public-agenda`

interface AgendaEvent {
  id:            string
  title:         string
  date:          string        // "YYYY-MM-DD"
  startDatetime: string        // ISO
  endDatetime:   string | null
  location:      string | null
}

// "YYYY-MM-DD" → "Domingo, 7 de jun."  (local time — sem UTC offset issue)
function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  const weekdays = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
  const months   = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  return `${weekdays[dt.getDay()]}, ${d} de ${months[m - 1]}.`
}

// ISO datetime → "19h30"
function formatTime(iso: string): string {
  const dt = new Date(iso)
  const h  = dt.getHours()
  const m  = dt.getMinutes()
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`
}

// Agrupa horários por dia da semana
type HorarioItem = { dia: string; hora: string; local: string }
function groupByDay(horarios: readonly HorarioItem[]): [string, HorarioItem[]][] {
  const map = new Map<string, HorarioItem[]>()
  for (const h of horarios) {
    if (!map.has(h.dia)) map.set(h.dia, [])
    map.get(h.dia)!.push(h)
  }
  return [...map.entries()]
}

// ── Sub-componentes ──────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] mb-3"
      style={{ color: IGV.primaryColor }}
    >
      {children}
    </p>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-10">
      <div
        className="w-6 h-6 border-2 rounded-full animate-spin"
        style={{ borderColor: `${IGV.primaryColor}30`, borderTopColor: IGV.primaryColor }}
      />
    </div>
  )
}

function EmptyEvents() {
  return (
    <div className="rounded-2xl bg-white dark:bg-black border border-black/[0.05] dark:border-white/10 shadow-sm p-8 flex flex-col items-center gap-3 text-center">
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ backgroundColor: `${IGV.primaryColor}15` }}
      >
        <Calendar size={22} strokeWidth={1.5} style={{ color: IGV.primaryColor }} />
      </div>
      <p className="text-[0.9rem] font-medium text-gray-700 dark:text-white">Nenhum evento agendado</p>
      <p className="text-[0.8rem] text-gray-400 dark:text-white leading-snug">
        Novos eventos serão anunciados em breve.
      </p>
    </div>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-center">
      <p className="text-[0.85rem] text-amber-700">{message}</p>
    </div>
  )
}

// ── Componente principal ─────────────────────────────────────────────

export default function IgvAgenda() {
  const [events,  setEvents]  = useState<AgendaEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)

  useEffect(() => {
    fetch(EF_URL)
      .then(r => {
        if (!r.ok) throw new Error('status ' + r.status)
        return r.json()
      })
      .then((data: { events: AgendaEvent[] }) => {
        setEvents(data.events ?? [])
      })
      .catch(() => setError('Não foi possível carregar os eventos. Tente novamente.'))
      .finally(() => setLoading(false))
  }, [])

  const horarioGroups = groupByDay(IGV.horarios)

  return (
    <div
      className="min-h-screen bg-[#F9F7F4] dark:bg-black flex flex-col"
      style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
    >
      {/* ── Header ── */}
      <header className="bg-white dark:bg-black border-b border-black/[0.05] dark:border-white/10 sticky top-0 z-20">
        <div className="max-w-[480px] mx-auto flex items-center gap-3 px-4 py-3.5">
          <Link
            to="/igv"
            className="flex items-center justify-center w-9 h-9 rounded-xl bg-gray-50 dark:bg-white/10 border border-black/[0.05] dark:border-white/10 shrink-0 active:bg-gray-100 dark:active:bg-white/20 transition-colors"
            aria-label="Voltar para IGV"
          >
            <ChevronLeft size={18} strokeWidth={2} className="text-gray-600 dark:text-white" />
          </Link>
          <h1 className="text-[1.05rem] font-bold text-gray-900 dark:text-white">Agenda</h1>
        </div>
      </header>

      {/* ── Conteúdo ── */}
      <main className="flex-1 px-4 py-5 max-w-[480px] mx-auto w-full space-y-6">

        {/* ── Seção Cultos ── */}
        <section>
          <SectionLabel>Cultos</SectionLabel>
          <div className="space-y-2">
            {horarioGroups.map(([dia, horarios]) => (
              <div
                key={dia}
                className="bg-white dark:bg-black rounded-2xl border border-black/[0.05] dark:border-white/10 shadow-sm overflow-hidden"
              >
                {/* Cabeçalho do dia */}
                <div
                  className="px-4 py-2.5 border-b border-black/[0.04] dark:border-white/[0.04]"
                  style={{ backgroundColor: `${IGV.primaryColor}0d` }}
                >
                  <p className="text-[0.8rem] font-semibold" style={{ color: IGV.secondaryColor }}>
                    {dia}
                  </p>
                </div>

                {/* Horários do dia */}
                <div className="divide-y divide-black/[0.04] dark:divide-white/[0.04]">
                  {horarios.map((h, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-3">
                      <div
                        className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
                        style={{ backgroundColor: `${IGV.primaryColor}15` }}
                      >
                        <Clock size={15} strokeWidth={1.75} style={{ color: IGV.primaryColor }} />
                      </div>
                      <span className="text-[0.92rem] font-semibold text-gray-900 dark:text-white flex-1">
                        {h.hora}
                      </span>
                      <div className="flex items-center gap-1 text-gray-400 dark:text-white">
                        <MapPin size={12} strokeWidth={1.75} />
                        <span className="text-[0.75rem]">{h.local}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Seção Próximos Eventos ── */}
        <section>
          <SectionLabel>Próximos Eventos</SectionLabel>

          {loading ? (
            <Spinner />
          ) : error ? (
            <ErrorBanner message={error} />
          ) : events.length === 0 ? (
            <EmptyEvents />
          ) : (
            <div className="space-y-2">
              {events.map(ev => {
                const [, evMonth, evDay] = ev.date.split('-')
                const monthLabel = new Date(
                  Number(ev.date.split('-')[0]),
                  Number(evMonth) - 1,
                  1,
                ).toLocaleString('pt-BR', { month: 'short' })

                return (
                  <div
                    key={ev.id}
                    className="bg-white dark:bg-black rounded-2xl border border-black/[0.05] dark:border-white/10 shadow-sm p-4 flex items-start gap-3"
                  >
                    {/* Data pill */}
                    <div className="flex flex-col items-center justify-center w-12 shrink-0 bg-gray-50 dark:bg-white/10 rounded-xl py-2 border border-black/[0.05] dark:border-white/10">
                      <span className="text-[0.6rem] font-semibold uppercase text-gray-400 dark:text-white/60 leading-none">
                        {monthLabel}
                      </span>
                      <span
                        className="text-[1.5rem] font-bold leading-tight"
                        style={{ color: IGV.primaryColor }}
                      >
                        {parseInt(evDay, 10)}
                      </span>
                    </div>

                    {/* Detalhes */}
                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-[0.9rem] font-semibold text-gray-900 dark:text-white leading-tight">
                        {ev.title}
                      </p>
                      <p className="text-[0.78rem] text-gray-400 dark:text-white mt-0.5">
                        {formatDate(ev.date)}
                      </p>
                      {ev.startDatetime && (
                        <div className="flex items-center gap-1 mt-1">
                          <Clock size={12} strokeWidth={1.75} className="text-gray-300 dark:text-white/30" />
                          <span className="text-[0.75rem] text-gray-400 dark:text-white">
                            {formatTime(ev.startDatetime)}
                          </span>
                        </div>
                      )}
                      {ev.location && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <MapPin size={12} strokeWidth={1.75} className="text-gray-300 dark:text-white/30" />
                          <span className="text-[0.75rem] text-gray-400 dark:text-white truncate">
                            {ev.location}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>

      <footer className="text-center px-4 py-5 text-[0.7rem] text-gray-400 dark:text-white">
        {IGV.address}
      </footer>
    </div>
  )
}
