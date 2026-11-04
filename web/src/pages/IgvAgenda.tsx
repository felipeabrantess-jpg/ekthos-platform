/**
 * IgvAgenda — /igv/agenda  (pública, sem auth)
 * LGPD R8: zero SELECT em people. Lê horarios de igv-public-data.ts +
 * eventos da EF igv-public-agenda (service_role, hardcoded IGV, só is_public+active).
 */

import { useState, useEffect } from 'react'
import { CircleNotchIcon, ClockIcon, MapPinIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { GlassCard, IconTile, IgvContent, IgvNotice, IgvPageShell, PageHeader, SectionTitle, IGV_TEXT } from '@/components/igv'
import { CalendarCrossIcon, ChurchIcon } from '@/components/igv/icons'
import { ICON_SIZE } from '@/lib/icon-tokens'
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

// Agrupa horários por igreja
type HorarioItem = { dia: string; hora: string; local: string; nome: string | null }
function groupByLocal(horarios: readonly HorarioItem[]): [string, HorarioItem[]][] {
  const map = new Map<string, HorarioItem[]>()
  for (const h of horarios) {
    if (!map.has(h.local)) map.set(h.local, [])
    map.get(h.local)!.push(h)
  }
  return [...map.entries()]
}

// ── Sub-componentes ──────────────────────────────────────────────────

function Spinner() {
  return (
    <GlassCard className="flex justify-center py-10">
      <CircleNotchIcon size={ICON_SIZE.tile} className="animate-spin text-[var(--igv-accent)]" role="status" aria-label="Carregando" />
    </GlassCard>
  )
}

function EmptyEvents() {
  return (
    <IgvNotice Icon={CalendarCrossIcon} title="Nenhum evento agendado">
      Novos eventos serão anunciados em breve.
    </IgvNotice>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return <IgvNotice Icon={WarningCircleIcon} title={message} tone="error" />
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

  const horarioGroups = groupByLocal(IGV.horarios)

  return (
    <IgvPageShell>
      <PageHeader title="Agenda" />

      <IgvContent>

        {/* ── Cultos: um bloco por igreja ── */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Cultos</SectionTitle>
          {horarioGroups.map(([local, horarios]) => (
            <GlassCard key={local}>
              <div className="flex items-center gap-3 mb-2">
                <IconTile Icon={ChurchIcon} />
                <h2 className={IGV_TEXT.heading}>{local}</h2>
              </div>
              <div className="divide-y divide-[var(--igv-line)]">
                {horarios.map((h, i) => (
                  <div key={i} className="flex items-center gap-3 py-3 last:pb-0">
                    <ClockIcon size={ICON_SIZE.list} className="shrink-0 text-[var(--igv-accent)]" aria-hidden="true" />
                    <div className="flex-1 min-w-0">
                      <p className={IGV_TEXT.body}>{h.dia}</p>
                      {h.nome && <p className={IGV_TEXT.muted}>{h.nome}</p>}
                    </div>
                    <span className={IGV_TEXT.item}>{h.hora}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          ))}
        </section>

        {/* ── Próximos eventos ── */}
        <section className="flex flex-col gap-3">
          <SectionTitle>Próximos eventos</SectionTitle>

          {loading ? (
            <Spinner />
          ) : error ? (
            <ErrorBanner message={error} />
          ) : events.length === 0 ? (
            <EmptyEvents />
          ) : (
            <>
              {events.map(ev => {
                const [, evMonth, evDay] = ev.date.split('-')
                const monthLabel = new Date(
                  Number(ev.date.split('-')[0]),
                  Number(evMonth) - 1,
                  1,
                ).toLocaleString('pt-BR', { month: 'short' })

                return (
                  <GlassCard key={ev.id} className="flex items-start gap-4">
                    {/* Data */}
                    <div className="igv-glass igv-glass--tile w-14 py-2 rounded-2xl flex flex-col items-center shrink-0">
                      <span className={IGV_TEXT.muted}>{monthLabel}</span>
                      <span className={`igv-serif ${IGV_TEXT.heading}`}>{parseInt(evDay, 10)}</span>
                    </div>

                    {/* Detalhes */}
                    <div className="flex-1 min-w-0">
                      <p className={IGV_TEXT.item}>{ev.title}</p>
                      <p className={`mt-0.5 ${IGV_TEXT.muted}`}>{formatDate(ev.date)}</p>
                      {ev.startDatetime && (
                        <p className={`flex items-center gap-1.5 mt-1.5 ${IGV_TEXT.muted}`}>
                          <ClockIcon size={ICON_SIZE.button} className="shrink-0" aria-hidden="true" />
                          {formatTime(ev.startDatetime)}
                        </p>
                      )}
                      {ev.location && (
                        <p className={`flex items-start gap-1.5 mt-1 ${IGV_TEXT.muted}`}>
                          <MapPinIcon size={ICON_SIZE.button} className="shrink-0" aria-hidden="true" />
                          {ev.location}
                        </p>
                      )}
                    </div>
                  </GlassCard>
                )
              })}
            </>
          )}
        </section>

        <GlassCard className="mt-3"><p className={`whitespace-pre-line ${IGV_TEXT.muted}`}>{IGV.address}</p></GlassCard>
      </IgvContent>
    </IgvPageShell>
  )
}
