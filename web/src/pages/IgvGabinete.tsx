/**
 * IgvGabinete — /igv/gabinete  (PWA público, sem auth)
 * Solicitação de agendamento pastoral IGV.
 * LGPD máximo: dado mais sensível. Sem WhatsApp automático.
 * A equipe confirma o horário manualmente por contato.
 */

import { useState, useEffect } from 'react'
import { BuildingsIcon, CheckCircleIcon, ClockIcon, CircleNotchIcon } from '@phosphor-icons/react'
import {
  GlassButton, GlassCard, GlassChip, GlassOption, IgvContent, IgvNotice, IgvPageShell, PageHeader,
  IGV_INPUT, IGV_TEXT,
} from '@/components/igv'
import { ICON_SIZE } from '@/lib/icon-tokens'

const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL as string
const EF_URL          = `${SUPABASE_URL}/functions/v1/igv-cabinet-request`

const TEMAS = [
  'Aconselhamento',
  'Oração',
  'Família',
  'Questão Espiritual',
  'Outro',
] as const

const TIPOS = ['Individual', 'Casal', 'Família'] as const

interface Pastor {
  id:        string
  name:      string | null
  role:      string
  bio:       string | null
  photo_url: string | null
}

interface Slot {
  id:               string
  slot_datetime:    string
  duration_minutes: number
}

function getInitials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0][0].toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

function formatSlotShort(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function IgvGabinete() {
  const [pastors, setPastors]               = useState<Pastor[]>([])
  const [loadingPastors, setLoadingPastors] = useState(true)
  const [slots, setSlots]                   = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots]     = useState(false)
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)

  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [tema, setTema]         = useState('')
  const [tipo, setTipo]         = useState('Individual')
  const [preferred, setPreferred] = useState('')
  const [pastorId, setPastorId]   = useState<string | null>(null)

  const [state, setState]   = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [errMsg, setErrMsg] = useState('')

  useEffect(() => {
    fetch(`${EF_URL}?action=pastors`)
      .then(r => r.json())
      .then((d: { pastors?: Pastor[] }) => setPastors(d.pastors ?? []))
      .catch(() => setPastors([]))
      .finally(() => setLoadingPastors(false))
  }, [])

  // Busca slots quando pastor é selecionado
  useEffect(() => {
    setSlots([])
    setSelectedSlotId(null)
    if (!pastorId) return
    setLoadingSlots(true)
    fetch(`${EF_URL}?action=slots&pastor_id=${pastorId}`)
      .then(r => r.json())
      .then((d: { slots?: Slot[] }) => setSlots(d.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setLoadingSlots(false))
  }, [pastorId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!tema) { setErrMsg('Selecione o tema pastoral.'); return }
    setState('submitting')
    setErrMsg('')
    try {
      const res = await fetch(EF_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:                    name.trim(),
          phone:                   phone.trim(),
          theme:                   tema,
          appointment_type:        tipo,
          preferred_datetime_text: !selectedSlotId && preferred.trim() ? preferred.trim() : undefined,
          cabinet_pastor_id:       pastorId ?? undefined,
          slot_id:                 selectedSlotId ?? undefined,
        }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || !data.success) {
        setErrMsg(data.error ?? 'Erro ao enviar. Tente novamente.')
        setState('error')
        return
      }
      setState('success')
    } catch {
      setErrMsg('Sem conexão. Verifique sua internet e tente novamente.')
      setState('error')
    }
  }

  // ── Tela de sucesso ─────────────────────────────────────────────────────────
  if (state === 'success') {
    return (
      <IgvPageShell>
        <PageHeader title="Gabinete Pastoral" />
        <IgvContent>
          <IgvNotice Icon={BuildingsIcon} title="Pedido registrado!">
            <p>Nossa equipe pastoral entrará em contato para confirmar o dia e horário do seu atendimento.</p>
            <GlassButton to="/igv" variant="accent" className="mt-4">Voltar para o início</GlassButton>
          </IgvNotice>
        </IgvContent>
      </IgvPageShell>
    )
  }

  // ── Formulário ──────────────────────────────────────────────────────────────
  return (
    <IgvPageShell>
      <PageHeader title="Gabinete Pastoral" subtitle="Solicitação de atendimento" />

      <form onSubmit={(e) => { void handleSubmit(e) }}>
        <IgvContent>

          {/* Escolha do pastor */}
          {!loadingPastors && pastors.length > 0 && (
            <GlassCard>
              <p className={IGV_TEXT.label}>Pastor (opcional)</p>
              <div className="flex flex-col gap-2">
                {pastors.map(p => (
                  <GlassOption key={p.id} selected={pastorId === p.id} onClick={() => setPastorId(prev => prev === p.id ? null : p.id)}>
                    {p.photo_url ? (
                      <img src={p.photo_url} alt={p.name ?? ''} className="w-11 h-11 rounded-full object-cover shrink-0" />
                    ) : (
                      <span className="w-11 h-11 rounded-full flex items-center justify-center bg-[var(--igv-tint)] text-[var(--igv-ink)] text-[1rem] font-bold shrink-0">
                        {getInitials(p.name)}
                      </span>
                    )}
                    <span className="min-w-0">
                      <span className={`block truncate ${IGV_TEXT.item}`}>{p.name ?? '—'}</span>
                      <span className={`block truncate ${IGV_TEXT.muted}`}>{p.role}</span>
                    </span>
                  </GlassOption>
                ))}
              </div>
            </GlassCard>
          )}

          {/* Slots disponíveis (quando pastor selecionado) */}
          {pastorId && (
            <GlassCard>
              <p className={IGV_TEXT.label}>Horários disponíveis</p>
              {loadingSlots ? (
                <p className={IGV_TEXT.muted}>Buscando horários...</p>
              ) : slots.length === 0 ? (
                <p className={IGV_TEXT.muted}>Nenhum horário cadastrado. Informe sua preferência abaixo.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {slots.map(s => (
                    <GlassOption key={s.id} selected={selectedSlotId === s.id} onClick={() => setSelectedSlotId(prev => prev === s.id ? null : s.id)}>
                      <ClockIcon size={ICON_SIZE.list} className="shrink-0" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className={`block capitalize ${IGV_TEXT.item}`}>{formatSlotShort(s.slot_datetime)}</span>
                        <span className={`block ${IGV_TEXT.muted}`}>{s.duration_minutes} minutos</span>
                      </span>
                    </GlassOption>
                  ))}
                </div>
              )}
            </GlassCard>
          )}

          {/* O atendimento */}
          <GlassCard className="flex flex-col gap-5">
            <fieldset>
              <legend className={IGV_TEXT.label}>Tema *</legend>
              <div className="flex flex-wrap gap-2">
                {TEMAS.map(t => (
                  <GlassChip key={t} selected={tema === t} onClick={() => setTema(t)}>{t}</GlassChip>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className={IGV_TEXT.label}>Tipo de atendimento</legend>
              <div className="grid grid-cols-3 gap-2">
                {TIPOS.map(t => (
                  <GlassChip segmented key={t} selected={tipo === t} onClick={() => setTipo(t)}>{t}</GlassChip>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="gab-pref" className={IGV_TEXT.label}>Preferência de data/horário</label>
              <input
                id="gab-pref"
                type="text"
                value={preferred}
                onChange={e => setPreferred(e.target.value)}
                placeholder="Ex: Sábado após as 14h"
                maxLength={200}
                className={IGV_INPUT}
              />
            </div>
          </GlassCard>

          {/* Dados pessoais */}
          <GlassCard className="flex flex-col gap-4">
            <h2 className={IGV_TEXT.heading}>Seus dados</h2>
            <div>
              <label htmlFor="gab-nome" className={IGV_TEXT.label}>Nome completo *</label>
              <input id="gab-nome" type="text" value={name} onChange={e => setName(e.target.value)} required className={IGV_INPUT} />
            </div>
            <div>
              <label htmlFor="gab-fone" className={IGV_TEXT.label}>WhatsApp / telefone *</label>
              <input id="gab-fone" type="tel" value={phone} onChange={e => setPhone(e.target.value)} required className={IGV_INPUT} />
            </div>
            <p className={IGV_TEXT.muted}>
              Seus dados e o assunto do atendimento são tratados com{' '}
              <strong className="font-semibold text-[var(--igv-ink)]">sigilo pastoral absoluto</strong>. Nunca
              compartilhados com terceiros nem enviados automaticamente por WhatsApp.
              Nossa equipe entrará em contato para confirmar o horário.
            </p>
          </GlassCard>

          {errMsg && <p role="alert" className={`px-1 ${IGV_TEXT.error}`}>{errMsg}</p>}

          <GlassButton
            type="submit"
            variant="accent"
            fullWidth
            disabled={state === 'submitting'}
            Icon={state === 'submitting' ? CircleNotchIcon : CheckCircleIcon}
          >
            {state === 'submitting' ? 'Enviando...' : 'Solicitar atendimento'}
          </GlassButton>
        </IgvContent>
      </form>
    </IgvPageShell>
  )
}
