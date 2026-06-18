/**
 * IgvGabinete — /igv/gabinete  (PWA público, sem auth)
 * Solicitação de agendamento pastoral IGV.
 * LGPD máximo: dado mais sensível. Sem WhatsApp automático.
 * A equipe confirma o horário manualmente por contato.
 */

import { useState, useEffect } from 'react'
import { Link }                from 'react-router-dom'
import { Building2, ChevronLeft, Clock } from 'lucide-react'

const IGV_COLOR       = '#D97706'
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
      <div
        className="min-h-screen flex flex-col items-center justify-center px-5 text-center"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FAFAFA' }}
      >
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{ backgroundColor: `${IGV_COLOR}18` }}
        >
          <Building2 size={28} strokeWidth={1.5} style={{ color: IGV_COLOR }} />
        </div>
        <h2 className="text-[1.2rem] font-bold text-gray-900 mb-2">
          Pedido registrado!
        </h2>
        <p className="text-[0.88rem] text-gray-500 leading-relaxed max-w-xs mb-8">
          Nossa equipe pastoral entrará em contato para confirmar o dia e horário do seu atendimento.
        </p>
        <Link
          to="/igv"
          className="text-[0.85rem] font-semibold px-6 py-3 rounded-xl text-white"
          style={{ backgroundColor: IGV_COLOR }}
        >
          Voltar para o início
        </Link>
      </div>
    )
  }

  // ── Formulário ──────────────────────────────────────────────────────────────
  return (
    <div
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: '#FAFAFA', minHeight: '100svh' }}
      className="flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe-top pt-5 pb-4">
        <Link to="/igv" className="p-1 -ml-1 rounded-lg text-gray-500 hover:text-gray-700">
          <ChevronLeft size={22} strokeWidth={2} />
        </Link>
        <div>
          <h1 className="text-[1rem] font-bold text-gray-900">Gabinete Pastoral</h1>
          <p className="text-[0.72rem] text-gray-400">Solicitação de atendimento</p>
        </div>
      </div>

      <form onSubmit={(e) => { void handleSubmit(e) }} className="flex-1 px-4 pb-8 space-y-5">

        {/* Escolha do pastor */}
        {!loadingPastors && pastors.length > 0 && (
          <section>
            <p className="text-[0.78rem] font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
              Pastor (opcional)
            </p>
            <div className="flex flex-col gap-2">
              {pastors.map(p => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPastorId(prev => prev === p.id ? null : p.id)}
                  className="flex items-center gap-3 rounded-2xl p-3.5 border text-left transition-all"
                  style={{
                    borderColor: pastorId === p.id ? IGV_COLOR : 'rgba(0,0,0,0.07)',
                    backgroundColor: pastorId === p.id ? `${IGV_COLOR}0D` : '#fff',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                  }}
                >
                  {p.photo_url ? (
                    <img
                      src={p.photo_url}
                      alt={p.name ?? ''}
                      className="w-10 h-10 rounded-full object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                      style={{ backgroundColor: IGV_COLOR }}
                    >
                      {getInitials(p.name)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-[0.88rem] font-semibold text-gray-900 truncate">{p.name ?? '—'}</p>
                    <p className="text-[0.74rem] text-gray-400 truncate">{p.role}</p>
                  </div>
                  {pastorId === p.id && (
                    <div
                      className="ml-auto w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: IGV_COLOR }}
                    >
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Slots disponíveis (quando pastor selecionado) */}
        {pastorId && (
          <section>
            <p className="text-[0.78rem] font-semibold text-gray-500 uppercase tracking-wide mb-2.5">
              Horários disponíveis
            </p>
            {loadingSlots ? (
              <p className="text-[0.82rem] text-gray-400">Buscando horários...</p>
            ) : slots.length === 0 ? (
              <p className="text-[0.82rem] text-gray-400">
                Nenhum horário cadastrado. Informe sua preferência abaixo.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {slots.map(s => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelectedSlotId(prev => prev === s.id ? null : s.id)}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 border text-left transition-all"
                    style={{
                      borderColor: selectedSlotId === s.id ? IGV_COLOR : 'rgba(0,0,0,0.07)',
                      backgroundColor: selectedSlotId === s.id ? `${IGV_COLOR}0D` : '#fff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                    }}
                  >
                    <Clock size={16} strokeWidth={1.8} style={{ color: selectedSlotId === s.id ? IGV_COLOR : '#9CA3AF' }} className="shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[0.86rem] font-semibold text-gray-900 capitalize">
                        {formatSlotShort(s.slot_datetime)}
                      </p>
                      <p className="text-[0.74rem] text-gray-400">{s.duration_minutes} minutos</p>
                    </div>
                    {selectedSlotId === s.id && (
                      <div
                        className="ml-auto w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                        style={{ backgroundColor: IGV_COLOR }}
                      >
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Tema */}
        <section>
          <label className="block text-[0.78rem] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Tema *
          </label>
          <div className="flex flex-wrap gap-2">
            {TEMAS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTema(t)}
                className="px-3.5 py-1.5 rounded-full text-[0.82rem] font-medium transition-colors"
                style={{
                  backgroundColor: tema === t ? IGV_COLOR : 'rgba(0,0,0,0.05)',
                  color: tema === t ? '#fff' : '#374151',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* Tipo de atendimento */}
        <section>
          <label className="block text-[0.78rem] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Tipo de atendimento
          </label>
          <div className="flex gap-2">
            {TIPOS.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className="flex-1 py-2 rounded-xl text-[0.82rem] font-medium transition-colors"
                style={{
                  backgroundColor: tipo === t ? IGV_COLOR : 'rgba(0,0,0,0.05)',
                  color: tipo === t ? '#fff' : '#374151',
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </section>

        {/* Preferência de data/horário */}
        <section>
          <label className="block text-[0.78rem] font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Preferência de data/horário
          </label>
          <input
            type="text"
            value={preferred}
            onChange={e => setPreferred(e.target.value)}
            placeholder="Ex: Sábado após as 14h, Segunda às 19h..."
            maxLength={200}
            className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-[0.88rem] text-gray-900 placeholder-gray-400 focus:outline-none"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          />
        </section>

        {/* Dados pessoais */}
        <section className="space-y-3">
          <p className="text-[0.78rem] font-semibold text-gray-500 uppercase tracking-wide">
            Seus dados
          </p>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="Nome completo *"
            className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-[0.88rem] text-gray-900 placeholder-gray-400 focus:outline-none"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          />
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            required
            placeholder="WhatsApp / telefone *"
            className="w-full rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-[0.88rem] text-gray-900 placeholder-gray-400 focus:outline-none"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
          />
        </section>

        {/* LGPD */}
        <p className="text-[0.72rem] text-gray-400 leading-relaxed">
          Seus dados e o assunto do atendimento são tratados com{' '}
          <strong className="text-gray-600">sigilo pastoral absoluto</strong>. Nunca
          compartilhados com terceiros nem enviados automaticamente por WhatsApp.
          Nossa equipe entrará em contato para confirmar o horário.
        </p>

        {/* Erro */}
        {state === 'error' && (
          <p className="text-[0.82rem] text-red-500 bg-red-50 rounded-xl px-4 py-3">{errMsg}</p>
        )}
        {errMsg && state !== 'error' && (
          <p className="text-[0.82rem] text-red-500">{errMsg}</p>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={state === 'submitting'}
          className="w-full py-3.5 rounded-2xl text-[0.95rem] font-bold text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: IGV_COLOR }}
        >
          {state === 'submitting' ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              Enviando...
            </span>
          ) : (
            'Solicitar atendimento'
          )}
        </button>
      </form>
    </div>
  )
}
