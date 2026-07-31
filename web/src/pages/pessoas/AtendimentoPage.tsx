import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, MapPin, Calendar, Heart, MessageCircle,
  ChevronDown, ChevronUp, CheckCircle2, AlertCircle, Clock,
  User, Sparkles, Loader2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  usePerson,
  usePersonJourney,
  usePersonJourneyEvents,
  usePersonCareContact,
  useSuggestStage,
  useRegisterAttendance,
} from '@/features/atendimento/hooks/useAtendimento'
import Button from '@/components/ui/Button'

// ── Utilitários ───────────────────────────────────────────────

function idade(birthDate: string | null): string {
  if (!birthDate) return ''
  const diff = Date.now() - new Date(birthDate).getTime()
  return `${Math.floor(diff / (365.25 * 24 * 3600 * 1000))} anos`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const COMO_CONHECEU_LABEL: Record<string, string> = {
  convite_membro:   'Convite de membro',
  redes_sociais:    'Redes sociais',
  passou_na_frente: 'Passou na frente',
  evento:           'Evento',
  familia:          'Família',
  outro:            'Outro',
}

const CHANNEL_LABELS: Record<string, string> = {
  presencial: 'Pessoalmente',
  whatsapp:   'WhatsApp',
  ligacao:    'Ligação',
  email:      'E-mail',
  visita:     'Visita domiciliar',
}

const RESULT_LABELS: Record<string, string> = {
  realizado:            'Contato realizado',
  sem_resposta:         'Sem resposta',
  reagendado:           'Reagendado',
  encaminhado:          'Encaminhado',
}

const EVENT_TYPE_LABEL: Record<string, string> = {
  journey_opened:  'Jornada iniciada',
  stage_advance:   'Avançou de etapa',
  pastoral_contact:'Contato pastoral',
  journey_assign:  'Responsável atribuído',
  touch:           'Registro de toque',
}

// ── Toast ─────────────────────────────────────────────────────

interface ToastState { msg: string; type: 'success' | 'error'; key: number }

function Toast({ msg, type, onClose }: { msg: string; type: ToastState['type']; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  const c = type === 'success'
    ? { bg: '#f0fdf4', border: '#bbf7d0', text: '#166534' }
    : { bg: '#fef2f2', border: '#fecaca', text: '#991b1b' }
  return (
    <div className="fixed bottom-6 inset-x-4 md:inset-x-auto md:right-6 md:left-auto z-50 flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg text-sm max-w-sm border"
      style={{ background: c.bg, borderColor: c.border, color: c.text }}>
      <span className="flex-1">{msg}</span>
      <button onClick={onClose} className="opacity-60 hover:opacity-100 text-xs font-medium shrink-0">fechar</button>
    </div>
  )
}

// ── Bloco 1: QUEM É ───────────────────────────────────────────

function BlocoQuemE({ person }: { person: NonNullable<ReturnType<typeof usePerson>['data']> }) {
  const displayName = [person.first_name, person.last_name].filter(Boolean).join(' ') || person.name
  const initials = displayName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  const whatsappUrl = person.phone
    ? `https://wa.me/${person.phone.replace(/\D/g, '')}`
    : null

  return (
    <div className="bg-white rounded-2xl border border-border-default shadow-sm overflow-hidden">
      {/* Avatar + nome */}
      <div className="flex items-start gap-4 p-5 pb-4">
        <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg shrink-0">
          {person.avatar_url
            ? <img src={person.avatar_url} alt={displayName} className="w-14 h-14 rounded-full object-cover" />
            : initials}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-lg font-bold text-ekthos-black leading-tight">{displayName}</h2>
          {person.person_stage && (
            <span className="inline-block mt-1 px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-semibold rounded-full">
              {person.person_stage}
            </span>
          )}
        </div>
        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 w-9 h-9 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
            aria-label="WhatsApp"
          >
            <MessageCircle size={18} strokeWidth={2} />
          </a>
        )}
      </div>

      <div className="px-5 pb-5 space-y-2 text-sm text-text-primary">
        {person.phone && (
          <div className="flex items-center gap-2">
            <Phone size={13} className="text-text-secondary shrink-0" />
            <span>{person.phone}</span>
          </div>
        )}
        {(person.neighborhood || person.city) && (
          <div className="flex items-center gap-2">
            <MapPin size={13} className="text-text-secondary shrink-0" />
            <span>{[person.neighborhood, person.city].filter(Boolean).join(', ')}</span>
          </div>
        )}
        {person.birth_date && (
          <div className="flex items-center gap-2">
            <Calendar size={13} className="text-text-secondary shrink-0" />
            <span>{formatDate(person.birth_date)} · {idade(person.birth_date)}</span>
          </div>
        )}
        {person.como_conheceu && (
          <div className="flex items-center gap-2">
            <Heart size={13} className="text-text-secondary shrink-0" />
            <span>{COMO_CONHECEU_LABEL[person.como_conheceu] ?? person.como_conheceu}</span>
          </div>
        )}
        {person.first_visit_date && (
          <div className="flex items-center gap-2 text-text-secondary">
            <span className="text-xs">Primeira visita: {formatDate(person.first_visit_date)}</span>
          </div>
        )}
        {person.conversion_date && (
          <div className="flex items-center gap-2 text-text-secondary">
            <span className="text-xs text-emerald-600 font-medium">Converteu em {formatDate(person.conversion_date)}</span>
          </div>
        )}
        {person.observacoes_pastorais && (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800">
            <p className="font-semibold mb-0.5">Observação pastoral</p>
            <p>{person.observacoes_pastorais}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bloco 2: O QUE JÁ ACONTECEU ──────────────────────────────

function BlocoHistorico({
  journeyId,
  personId,
  churchId,
}: {
  journeyId: string | undefined
  personId: string
  churchId: string
}) {
  const [expanded, setExpanded] = useState(false)
  const { data: events = [], isLoading: eventsLoading } = usePersonJourneyEvents(journeyId)
  const { data: careContact } = usePersonCareContact(personId, churchId)

  const hasHistory = events.length > 0 || !!careContact?.contacted_at

  return (
    <div className="bg-white rounded-2xl border border-border-default shadow-sm">
      <button
        className="w-full flex items-center justify-between p-5 text-left"
        onClick={() => setExpanded(e => !e)}
      >
        <div>
          <p className="font-semibold text-ekthos-black text-sm">O que já aconteceu</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {eventsLoading ? 'Carregando…' : hasHistory ? `${events.length} registro(s)` : 'Sem histórico ainda'}
          </p>
        </div>
        {expanded ? <ChevronUp size={16} className="text-text-secondary" /> : <ChevronDown size={16} className="text-text-secondary" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3 border-t border-border-default pt-4">
          {/* Histórico do care_contacts (legado, read-only) */}
          {careContact?.contacted_at && (
            <div className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                <Phone size={12} className="text-blue-500" />
              </div>
              <div className="text-xs">
                <p className="font-medium text-text-primary">Contato anterior registrado</p>
                {careContact.contacted_by_name && (
                  <p className="text-text-secondary">por {careContact.contacted_by_name}</p>
                )}
                <p className="text-text-secondary">{formatDateTime(careContact.contacted_at)}</p>
                {careContact.notes && <p className="text-text-secondary mt-1 italic">"{careContact.notes}"</p>}
              </div>
            </div>
          )}

          {/* journey_events */}
          {events.length === 0 && !careContact?.contacted_at && (
            <p className="text-xs text-text-secondary text-center py-4">Nenhuma interação registrada ainda.</p>
          )}
          {events.map(ev => (
            <div key={ev.id} className="flex gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                ev.event_type === 'stage_advance'    ? 'bg-emerald-50' :
                ev.event_type === 'pastoral_contact' ? 'bg-blue-50'    :
                ev.event_type === 'journey_opened'   ? 'bg-purple-50'  :
                'bg-gray-50'
              }`}>
                {ev.event_type === 'stage_advance'    && <CheckCircle2 size={12} className="text-emerald-500" />}
                {ev.event_type === 'pastoral_contact' && <Phone        size={12} className="text-blue-500" />}
                {ev.event_type === 'journey_opened'   && <Sparkles     size={12} className="text-purple-500" />}
                {!['stage_advance','pastoral_contact','journey_opened'].includes(ev.event_type) && <Clock size={12} className="text-gray-400" />}
              </div>
              <div className="text-xs flex-1">
                <p className="font-medium text-text-primary">
                  {EVENT_TYPE_LABEL[ev.event_type] ?? ev.event_type}
                </p>
                {ev.event_type === 'pastoral_contact' && ev.payload.channel && (
                  <p className="text-text-secondary">
                    {CHANNEL_LABELS[ev.payload.channel as string] ?? String(ev.payload.channel)}
                    {ev.payload.result && ` · ${RESULT_LABELS[ev.payload.result as string] ?? String(ev.payload.result)}`}
                  </p>
                )}
                {ev.event_type === 'pastoral_contact' && ev.payload.notes && (
                  <p className="text-text-secondary mt-0.5 italic">"{String(ev.payload.notes)}"</p>
                )}
                {ev.event_type === 'stage_advance' && ev.payload.to_stage_id && (
                  <p className="text-text-secondary">Nova etapa registrada</p>
                )}
                <p className="text-text-secondary mt-0.5">{formatDateTime(ev.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Bloco 3: O QUE FAZER AGORA ────────────────────────────────

interface BlocoAcoesProps {
  person: NonNullable<ReturnType<typeof usePerson>['data']>
  journey: ReturnType<typeof usePersonJourney>['data']
  stages: { id: string; name: string; order_index: number }[]
  onToast: (msg: string, type: 'success' | 'error') => void
}

function BlocoAcoes({ person, journey, stages, onToast }: BlocoAcoesProps) {
  const register = useRegisterAttendance()

  // Sinais de contexto
  const [acceptedJesus,    setAcceptedJesus]    = useState(false)
  const [querCelula,       setQuerCelula]        = useState(false)
  const [membroOutraIgreja, setMembroOutraIgreja] = useState(false)
  const [temBatismo,       setTemBatismo]        = useState(false)

  const context = {
    accepted_jesus:     acceptedJesus,
    quer_celula:        querCelula,
    membro_outra_igreja: membroOutraIgreja,
    tem_batismo:        temBatismo,
  }

  const { data: suggestion, isLoading: suggestLoading } = useSuggestStage(person.id, context)

  // Formulário de atendimento
  const [channel,    setChannel]    = useState('presencial')
  const [result,     setResult]     = useState('realizado')
  const [notes,      setNotes]      = useState('')
  const [stageId,    setStageId]    = useState<string>(journey?.stage_id ?? '')
  const [nextStep,   setNextStep]   = useState('')
  const [nextDue,    setNextDue]    = useState('')

  // Campos faltando da pessoa
  const [nbhd,       setNbhd]       = useState(person.neighborhood ?? '')
  const [city,       setCity]       = useState(person.city ?? '')
  const [phone,      setPhone]      = useState(person.phone ?? '')
  const [obs,        setObs]        = useState(person.observacoes_pastorais ?? '')

  // Pré-selecionar sugestão quando chega
  useEffect(() => {
    if (suggestion?.stage_id && !stageId) {
      setStageId(suggestion.stage_id)
    }
  }, [suggestion?.stage_id, stageId])

  async function handleSalvar() {
    const peopleUpdates: Record<string, string> = {}
    if (nbhd  !== (person.neighborhood ?? ''))          peopleUpdates.neighborhood          = nbhd
    if (city  !== (person.city ?? ''))                  peopleUpdates.city                  = city
    if (phone !== (person.phone ?? ''))                 peopleUpdates.phone                 = phone
    if (obs   !== (person.observacoes_pastorais ?? '')) peopleUpdates.observacoes_pastorais = obs

    try {
      await register.mutateAsync({
        person_id:        person.id,
        expected_version: journey?.version ?? null,
        people_updates:   Object.keys(peopleUpdates).length ? peopleUpdates : undefined,
        contact_channel:  channel,
        contact_result:   result,
        contact_notes:    notes || undefined,
        new_stage_id:     stageId || null,
        next_step:        nextStep || undefined,
        next_step_due_at: nextDue  || null,
      })
      onToast('Atendimento registrado com sucesso.', 'success')
      setNotes('')
      setNextStep('')
      setNextDue('')
    } catch (err) {
      const msg = String(err)
      if (msg.includes('JOURNEY_VERSION_CONFLICT')) {
        onToast('Conflito de versão — a jornada foi atualizada por outra pessoa. Recarregue a página.', 'error')
      } else {
        onToast('Erro ao registrar atendimento. Tente novamente.', 'error')
      }
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-border-default shadow-sm p-5 space-y-5">
      <h3 className="font-semibold text-ekthos-black text-sm">O que fazer agora</h3>

      {/* ── Campos faltando ── */}
      {(!person.neighborhood || !person.city || !person.phone) && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Completar dados</p>
          {!person.phone && (
            <label className="block">
              <span className="text-xs text-text-secondary">Telefone</span>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="+55 11 99999-9999"
                className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </label>
          )}
          {(!person.neighborhood || !person.city) && (
            <div className="grid grid-cols-2 gap-2">
              {!person.neighborhood && (
                <label className="block">
                  <span className="text-xs text-text-secondary">Bairro</span>
                  <input
                    value={nbhd}
                    onChange={e => setNbhd(e.target.value)}
                    placeholder="Vila Madalena"
                    className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </label>
              )}
              {!person.city && (
                <label className="block">
                  <span className="text-xs text-text-secondary">Cidade</span>
                  <input
                    value={city}
                    onChange={e => setCity(e.target.value)}
                    placeholder="São Paulo"
                    className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Sinais de contexto ── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Sinais desta conversa</p>
        <div className="grid grid-cols-2 gap-2">
          {([
            ['accepted_jesus',     acceptedJesus,     setAcceptedJesus,     'Aceitou Jesus'],
            ['quer_celula',        querCelula,        setQuerCelula,        'Quer célula'],
            ['membro_outra_igreja', membroOutraIgreja, setMembroOutraIgreja, 'Membro transferido'],
            ['tem_batismo',        temBatismo,        setTemBatismo,        'Já foi batizado'],
          ] as [string, boolean, (v: boolean) => void, string][]).map(([key, val, setter, label]) => (
            <button
              key={key}
              onClick={() => setter(!val)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                val
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'border-border-default text-text-secondary hover:border-primary/30 hover:text-text-primary'
              }`}
            >
              <CheckCircle2 size={13} className={val ? 'text-primary' : 'text-transparent'} strokeWidth={2.5} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Sugestão de etapa ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Etapa sugerida</p>
          {suggestLoading && <Loader2 size={12} className="animate-spin text-text-secondary" />}
        </div>
        {suggestion && (
          <div className="flex items-start gap-2 p-3 bg-primary/5 border border-primary/20 rounded-xl">
            <Sparkles size={14} className="text-primary mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-semibold text-primary">{suggestion.stage_name}</p>
              <p className="text-text-secondary mt-0.5">{suggestion.reason}</p>
            </div>
          </div>
        )}
        <select
          value={stageId}
          onChange={e => setStageId(e.target.value)}
          className="w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white"
        >
          <option value="">Manter etapa atual</option>
          {stages.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* ── Registro do contato ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Registrar contato</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-text-secondary">Canal</span>
            <select
              value={channel}
              onChange={e => setChannel(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white"
            >
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-text-secondary">Resultado</span>
            <select
              value={result}
              onChange={e => setResult(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white"
            >
              {Object.entries(RESULT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Anotações sobre esta conversa…"
          rows={3}
          className="w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
        />
        <label className="block">
          <span className="text-xs text-text-secondary">Observação pastoral</span>
          <input
            value={obs}
            onChange={e => setObs(e.target.value)}
            placeholder="Contexto pastoral relevante…"
            className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary"
          />
        </label>
      </div>

      {/* ── Próximo passo ── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Próximo passo</p>
        <input
          value={nextStep}
          onChange={e => setNextStep(e.target.value)}
          placeholder="Ex: Apresentar para a célula"
          className="w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
        <input
          type="date"
          value={nextDue}
          onChange={e => setNextDue(e.target.value)}
          className="w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary"
        />
      </div>

      <Button
        variant="primary"
        size="md"
        loading={register.isPending}
        onClick={handleSalvar}
        className="w-full"
      >
        Salvar atendimento
      </Button>
    </div>
  )
}

// ── Página principal ──────────────────────────────────────────

export default function AtendimentoPage() {
  const { id: personId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { churchId } = useAuth()
  const [toast, setToast] = useState<ToastState | null>(null)

  const { data: person, isLoading: personLoading, error: personError } = usePerson(personId)
  const { data: journey } = usePersonJourney(personId)

  const { data: stages = [] } = useQuery({
    queryKey: ['pipeline-stages', churchId],
    queryFn: async () => {
      if (!churchId) return []
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id, name, order_index')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('order_index', { ascending: true })
      if (error) throw error
      return data ?? []
    },
    enabled: !!churchId,
    staleTime: 120_000,
  })

  if (personLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={28} className="animate-spin text-text-secondary" />
      </div>
    )
  }

  if (personError || !person) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <AlertCircle size={36} className="text-red-400" />
        <p className="font-semibold text-text-primary">Pessoa não encontrada</p>
        <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>Voltar</Button>
      </div>
    )
  }

  const displayName = [person.first_name, person.last_name].filter(Boolean).join(' ') || person.name

  return (
    <div className="space-y-4 pb-10">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-bg-hover transition-colors text-text-secondary"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-lg md:text-xl font-bold text-ekthos-black truncate">
            Atendimento — {displayName}
          </h1>
          {journey && (
            <p className="text-xs text-text-secondary">
              Jornada ativa · v{journey.version}
            </p>
          )}
          {!journey && (
            <p className="text-xs text-amber-600 font-medium flex items-center gap-1">
              <Clock size={11} /> Sem jornada ativa
            </p>
          )}
        </div>
      </div>

      {/* 3 colunas em desktop, linear em mobile */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        <BlocoQuemE person={person} />
        <BlocoHistorico
          journeyId={journey?.id}
          personId={person.id}
          churchId={churchId ?? ''}
        />
        <BlocoAcoes
          person={person}
          journey={journey}
          stages={stages}
          onToast={(msg, type) => setToast({ msg, type, key: Date.now() })}
        />
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} key={toast.key} />}
    </div>
  )
}
