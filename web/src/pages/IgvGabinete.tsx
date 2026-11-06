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
import { IGV_MSG, mascaraTelefoneBR, nomeCompleto, telefoneBR } from '@/lib/igv-validacao'

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

const SEM_PREFERENCIA = 'Sem preferência'
const DIAS     = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo', SEM_PREFERENCIA] as const
const PERIODOS = ['Manhã', 'Tarde', 'Noite', SEM_PREFERENCIA] as const

/** "<Dia>, <período>" sem os "Sem preferência"; com assunto (tema Outro) na frente. Vazio → undefined. */
function montarPreferencia(dia: string, periodo: string, assunto: string, comSlot: boolean): string | undefined {
  const pref = comSlot ? '' : [dia, periodo].filter(v => v && v !== SEM_PREFERENCIA).join(', ')
  const txt = `${assunto ? `Assunto: ${assunto}. ` : ''}${pref}`.trim()
  return txt || undefined
}

type Campo = 'name' | 'phone' | 'assunto'

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
  const [dia, setDia]           = useState<string>(SEM_PREFERENCIA)
  const [periodo, setPeriodo]   = useState<string>(SEM_PREFERENCIA)
  const [assunto, setAssunto]   = useState('')
  const [errors, setErrors]     = useState<Partial<Record<Campo, string>>>({})
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
    const errs: Partial<Record<Campo, string>> = {}
    if (!nomeCompleto(name)) errs.name  = IGV_MSG.nome
    if (!telefoneBR(phone))  errs.phone = IGV_MSG.telefone
    if (tema === 'Outro' && !assunto.trim()) errs.assunto = 'Informe qual é o assunto.'
    setErrors(errs)
    if (!tema) { setErrMsg('Selecione o tema pastoral.'); return }
    if (Object.keys(errs).length > 0) { setErrMsg(''); return }
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
          preferred_datetime_text: montarPreferencia(dia, periodo, tema === 'Outro' ? assunto.trim() : '', !!selectedSlotId),
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
  const inputCls = (hasError?: string) => `${IGV_INPUT} ${hasError ? '!border-[var(--igv-danger)]' : ''}`

  return (
    <IgvPageShell>
      <PageHeader title="Gabinete Pastoral" subtitle="Solicitação de atendimento" />

      <form onSubmit={(e) => { void handleSubmit(e) }} noValidate>
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
              {tema === 'Outro' && (
                <div className="mt-4">
                  <label htmlFor="gab-assunto" className={IGV_TEXT.label}>Qual assunto? *</label>
                  <input
                    id="gab-assunto"
                    type="text"
                    value={assunto}
                    onChange={e => { setAssunto(e.target.value); if (errors.assunto) setErrors(p => ({ ...p, assunto: undefined })) }}
                    maxLength={140}
                    className={inputCls(errors.assunto)}
                  />
                  {errors.assunto && <p role="alert" className={`mt-1.5 ${IGV_TEXT.error}`}>{errors.assunto}</p>}
                </div>
              )}
            </fieldset>

            <fieldset>
              <legend className={IGV_TEXT.label}>Tipo de atendimento</legend>
              <div className="grid grid-cols-3 gap-2">
                {TIPOS.map(t => (
                  <GlassChip segmented key={t} selected={tipo === t} onClick={() => setTipo(t)}>{t}</GlassChip>
                ))}
              </div>
            </fieldset>

            {!selectedSlotId && (
              <fieldset>
                <legend className={IGV_TEXT.label}>Preferência de dia e período</legend>
                <div className="grid grid-cols-2 gap-2">
                  <label htmlFor="gab-dia" className="sr-only">Dia da semana</label>
                  <select id="gab-dia" value={dia} onChange={e => setDia(e.target.value)} className={IGV_INPUT}>
                    {DIAS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <label htmlFor="gab-periodo" className="sr-only">Período</label>
                  <select id="gab-periodo" value={periodo} onChange={e => setPeriodo(e.target.value)} className={IGV_INPUT}>
                    {PERIODOS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </fieldset>
            )}
          </GlassCard>

          {/* Dados pessoais */}
          <GlassCard className="flex flex-col gap-4">
            <h2 className={IGV_TEXT.heading}>Seus dados</h2>
            <div>
              <label htmlFor="gab-nome" className={IGV_TEXT.label}>Nome completo *</label>
              <input id="gab-nome" type="text" autoComplete="name" placeholder="Nome e sobrenome" value={name}
                onChange={e => { setName(e.target.value); if (errors.name) setErrors(p => ({ ...p, name: undefined })) }} className={inputCls(errors.name)} />
              {errors.name && <p role="alert" className={`mt-1.5 ${IGV_TEXT.error}`}>{errors.name}</p>}
            </div>
            <div>
              <label htmlFor="gab-fone" className={IGV_TEXT.label}>WhatsApp / telefone *</label>
              <input id="gab-fone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="(21) 99999-9999" value={phone}
                onChange={e => { setPhone(mascaraTelefoneBR(e.target.value)); if (errors.phone) setErrors(p => ({ ...p, phone: undefined })) }} className={inputCls(errors.phone)} />
              {errors.phone && <p role="alert" className={`mt-1.5 ${IGV_TEXT.error}`}>{errors.phone}</p>}
            </div>
            <p className={IGV_TEXT.muted}>
              Seus dados e assunto do atendimento são tratados com sigilo pastoral absoluto. A igreja fará contato para agendar uma data.
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
