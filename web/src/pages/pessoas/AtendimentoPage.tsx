import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, Phone, Calendar, MessageCircle,
  CheckCircle2, AlertCircle, Clock,
  Sparkles, Loader2, Bot, User, ChevronRight, Building2,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  usePerson,
  usePersonJourney,
  useSuggestStage,
  useRegisterAttendance,
  usePersonTimeline,
  useMinistries,
  type TimelineItem,
} from '@/features/atendimento/hooks/useAtendimento'
import Button from '@/components/ui/Button'

// ── Utilitários ───────────────────────────────────────────────


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

const MARITAL_STATUS_LABEL: Record<string, string> = {
  solteiro:       'Solteiro(a)',
  casado:         'Casado(a)',
  divorciado:     'Divorciado(a)',
  viuvo:          'Viúvo(a)',
  uniao_estavel:  'União estável',
}

const CHANNEL_LABELS: Record<string, string> = {
  presencial: 'Pessoalmente',
  whatsapp:   'WhatsApp',
  ligacao:    'Ligação',
  email:      'E-mail',
  visita:     'Visita domiciliar',
}

const RESULT_LABELS: Record<string, string> = {
  realizado:        'Contato realizado',
  sem_resposta:     'Sem resposta',
  reagendado:       'Reagendado',
  encaminhado:      'Encaminhado',
  nao_atendeu:      'Não atendeu',
  numero_errado:    'Número errado',
  pediu_retorno:    'Pediu retorno',
  nao_quer_contato: 'Não quer contato (encerra jornada)',
  mudou_de_igreja:  'Mudou de Igreja (encerra jornada)',
}

const OUTCOME_CLOSES_JOURNEY = new Set(['nao_quer_contato', 'mudou_de_igreja'])

const EVENT_KIND_LABEL: Record<string, string> = {
  journey_opened:        'Jornada iniciada',
  stage_advance:         'Avançou de etapa',
  pastoral_contact:      'Contato pastoral',
  journey_assign:        'Responsável atribuído',
  touch:                 'Toque registrado',
  touch_sent:            'Toque enviado',
  conversation_message:  'Mensagem',
  ministry_referral:     'Encaminhado para ministério',
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

// ── Bloco 1: QUEM É — faixa horizontal (E2) ──────────────────

function BlocoQuemE({ person }: { person: NonNullable<ReturnType<typeof usePerson>['data']> }) {
  const displayName = [person.first_name, person.last_name].filter(Boolean).join(' ') || person.name
  const initials = displayName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()
  const whatsappUrl = person.phone ? `https://wa.me/${person.phone.replace(/\D/g, '')}` : null

  return (
    <div className="flex items-center gap-3 md:gap-4 px-4 md:px-5 py-3 md:py-3.5 bg-white rounded-2xl border border-border-default shadow-sm flex-wrap">
      {/* Avatar */}
      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
        {person.avatar_url
          ? <img src={person.avatar_url} alt={displayName} className="w-10 h-10 rounded-full object-cover" />
          : initials}
      </div>

      {/* Nome + etapa */}
      <div className="min-w-0">
        <h2 className="font-display font-bold text-ekthos-black text-sm leading-tight">{displayName}</h2>
        {person.person_stage && (
          <span className="inline-block mt-0.5 px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-semibold rounded-full">
            {person.person_stage}
          </span>
        )}
      </div>

      {/* Telefone */}
      {person.phone && (
        <>
          <div className="hidden md:block w-px h-5 bg-border-default shrink-0" />
          <div className="hidden md:flex items-center gap-1.5 text-xs text-text-secondary">
            <Phone size={12} className="shrink-0" />
            <span>{person.phone}</span>
          </div>
        </>
      )}

      {/* Primeira visita */}
      {person.first_visit_date && (
        <>
          <div className="hidden md:block w-px h-5 bg-border-default shrink-0" />
          <div className="hidden md:flex items-center gap-1.5 text-xs text-text-secondary">
            <Calendar size={12} className="shrink-0" />
            <span>Primeira visita {formatDate(person.first_visit_date)}</span>
          </div>
        </>
      )}

      {/* Observação pastoral (truncada) */}
      {person.observacoes_pastorais && (
        <>
          <div className="hidden md:block w-px h-5 bg-border-default shrink-0" />
          <div className="hidden md:flex items-center gap-1.5 text-xs text-amber-700 min-w-0 max-w-xs">
            <span className="truncate">{person.observacoes_pastorais}</span>
          </div>
        </>
      )}

      {/* WA — empurrado para a direita */}
      {whatsappUrl && (
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
          className="ml-auto shrink-0 w-9 h-9 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors"
          aria-label="WhatsApp">
          <MessageCircle size={18} strokeWidth={2} />
        </a>
      )}
    </div>
  )
}

// ── Bloco 2: HISTÓRICO REAL ───────────────────────────────────

function TimelineIcon({ item }: { item: TimelineItem }) {
  const base = 'w-7 h-7 rounded-full flex items-center justify-center shrink-0'
  if (item.source === 'message') {
    return item.actor_type === 'human'
      ? <div className={`${base} bg-gray-100`}><User size={12} className="text-gray-500" /></div>
      : <div className={`${base} bg-blue-50`}><Bot size={12} className="text-blue-500" /></div>
  }
  if (item.source === 'acolhimento') {
    return <div className={`${base} bg-purple-50`}><Sparkles size={12} className="text-purple-500" /></div>
  }
  const kindMap: Record<string, { bg: string; icon: React.ReactNode }> = {
    pastoral_contact:  { bg: 'bg-blue-50',   icon: <Phone size={12} className="text-blue-500" /> },
    stage_advance:     { bg: 'bg-emerald-50', icon: <CheckCircle2 size={12} className="text-emerald-500" /> },
    journey_opened:    { bg: 'bg-purple-50',  icon: <Sparkles size={12} className="text-purple-500" /> },
    journey_assign:    { bg: 'bg-amber-50',   icon: <User size={12} className="text-amber-500" /> },
    ministry_referral: { bg: 'bg-indigo-50',  icon: <Building2 size={12} className="text-indigo-500" /> },
  }
  const style = kindMap[item.event_kind] ?? { bg: 'bg-gray-50', icon: <Clock size={12} className="text-gray-400" /> }
  return <div className={`${base} ${style.bg}`}>{style.icon}</div>
}

function TimelineRow({ item }: { item: TimelineItem }) {
  const isAgent = item.actor_type === 'agent'
  const isMessage = item.source === 'message'

  return (
    <div className="flex gap-3">
      <TimelineIcon item={item} />
      <div className="flex-1 min-w-0 text-xs">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className={`font-medium ${isAgent ? 'text-blue-600' : 'text-text-primary'}`}>
            {item.actor_name}
          </span>
          {isAgent && (
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 font-medium">agente</span>
          )}
          <span className="text-text-secondary ml-auto shrink-0 tabular-nums">
            {formatDateTime(item.event_at)}
          </span>
        </div>
        <p className="font-medium text-text-secondary mt-0.5">
          {EVENT_KIND_LABEL[item.event_kind] ?? item.event_kind}
        </p>
        {item.summary && (
          <p className={`mt-0.5 leading-relaxed ${isMessage ? 'italic' : ''} text-text-primary`}>
            {isMessage ? `"${item.summary}"` : item.summary}
          </p>
        )}
      </div>
    </div>
  )
}

function BlocoHistorico({ personId }: { personId: string }) {
  const [showAll, setShowAll] = useState(false)
  const limit = showAll ? 50 : 10

  const { data: items = [], isLoading, isError, refetch } = usePersonTimeline(personId, { limit })

  const hasHistory    = items.length > 0
  const mightHaveMore = items.length === limit && !showAll

  return (
    <div className="bg-white rounded-2xl border border-border-default shadow-sm">
      {/* Cabeçalho — sempre visível (E3: sem toggle no desktop) */}
      <div className="flex items-center justify-between p-5 pb-4">
        <div>
          <p className="font-semibold text-ekthos-black text-sm">O que já aconteceu</p>
          <p className="text-xs text-text-secondary mt-0.5">
            {isLoading
              ? 'Carregando…'
              : hasHistory
                ? `${items.length} registro${items.length === 1 ? '' : 's'}${mightHaveMore ? '+' : ''}`
                : 'Nenhuma interação registrada'}
          </p>
        </div>
      </div>

      {/* Conteúdo sempre expandido */}
      <div className="border-t border-border-default">
        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-text-secondary" />
          </div>
        )}

        {isError && (
          <div className="px-5 py-4 text-xs text-red-600 flex items-center gap-2">
            <AlertCircle size={13} />
            <span>Não foi possível carregar o histórico.</span>
            <button onClick={() => void refetch()} className="underline">Tentar novamente</button>
          </div>
        )}

        {!isLoading && !isError && !hasHistory && (
          <p className="text-xs text-text-secondary text-center py-8 px-5">
            Nenhuma interação registrada ainda com esta pessoa.
          </p>
        )}

        {!isLoading && !isError && hasHistory && (
          <div className="px-5 pb-5 pt-4 space-y-4">
            {items.map((item, i) => (
              <TimelineRow key={`${item.event_at}-${item.source}-${item.event_kind}-${i}`} item={item} />
            ))}

            {mightHaveMore && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-primary font-medium py-2 rounded-xl hover:bg-primary/5 transition-colors"
              >
                Ver tudo
                <ChevronRight size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Bloco 3: O QUE FAZER AGORA ────────────────────────────────

interface BlocoAcoesProps {
  person:   NonNullable<ReturnType<typeof usePerson>['data']>
  journey:  ReturnType<typeof usePersonJourney>['data']
  stages:   { id: string; name: string; order_index: number }[]
  onToast:  (msg: string, type: 'success' | 'error') => void
}

function BlocoAcoes({ person, journey, stages, onToast }: BlocoAcoesProps) {
  const { churchId } = useAuth()
  const register = useRegisterAttendance()
  const { data: ministries = [] } = useMinistries(churchId)

  // ── E3: Sinais de contexto (8 sinais alinhados ao funil IGV) ──
  const [acceptedJesus,     setAcceptedJesus]     = useState(false)
  const [querCelula,        setQuerCelula]         = useState(false)
  const [membroOutraIgreja, setMembroOutraIgreja]  = useState(false)
  const [temBatismo,        setTemBatismo]         = useState(false)
  const [voltouAoCulto,     setVoltouAoCulto]      = useState(false)
  const [fezConnect,        setFezConnect]         = useState(false)
  const [querSerMembro,     setQuerSerMembro]      = useState(false)
  const [querServir,        setQuerServir]         = useState(false)

  const context = {
    accepted_jesus:      acceptedJesus,
    quer_celula:         querCelula,
    membro_outra_igreja: membroOutraIgreja,
    tem_batismo:         temBatismo,
    voltou_ao_culto:     voltouAoCulto,
    fez_connect:         fezConnect,
    quer_ser_membro:     querSerMembro,
    quer_servir:         querServir,
  }

  const { data: suggestion, isLoading: suggestLoading } = useSuggestStage(person.id, context)

  // ── Formulário ─────────────────────────────────────────────
  const [channel,    setChannel]    = useState('presencial')
  const [result,     setResult]     = useState('realizado')
  const [notes,      setNotes]      = useState('')
  const [stageId,    setStageId]    = useState<string>(journey?.stage_id ?? '')
  const [nextStep,   setNextStep]   = useState('')
  const [nextDue,    setNextDue]    = useState('')
  const [ministryId, setMinistryId] = useState<string>('')

  // ── E6: Completar dados ────────────────────────────────────
  const [nbhd,          setNbhd]          = useState(person.neighborhood     ?? '')
  const [city,          setCity]          = useState(person.city             ?? '')
  const [phone,         setPhone]         = useState(person.phone            ?? '')
  const [obs,           setObs]           = useState(person.observacoes_pastorais ?? '')
  const [comoConheceu,  setComoConheceu]  = useState(person.como_conheceu    ?? '')
  const [maritalStatus, setMaritalStatus] = useState(person.marital_status   ?? '')

  // Pré-selecionar sugestão quando chega
  useEffect(() => {
    if (suggestion?.stage_id && !stageId) {
      setStageId(suggestion.stage_id)
    }
  }, [suggestion?.stage_id, stageId])

  const closingOutcome = OUTCOME_CLOSES_JOURNEY.has(result)

  // ── E2: sem jornada → etapa obrigatória ───────────────────
  const missingStageForNewJourney = !journey && !stageId

  const anySignal = Object.values(context).some(Boolean)

  const hasChanges =
    notes.trim()    !== '' ||
    nextStep.trim() !== '' ||
    nextDue         !== '' ||
    ministryId      !== '' ||
    (stageId !== '' && stageId !== (journey?.stage_id ?? '')) ||
    nbhd.trim()          !== (person.neighborhood          ?? '').trim() ||
    city.trim()          !== (person.city                  ?? '').trim() ||
    phone.replace(/\D/g, '') !== (person.phone             ?? '').replace(/\D/g, '') ||
    obs.trim()           !== (person.observacoes_pastorais  ?? '').trim() ||
    comoConheceu         !== (person.como_conheceu          ?? '') ||
    maritalStatus        !== (person.marital_status         ?? '') ||
    anySignal

  async function handleSalvar() {
    const peopleUpdates: Record<string, string> = {}
    if (nbhd         !== (person.neighborhood          ?? '')) peopleUpdates.neighborhood          = nbhd
    if (city         !== (person.city                  ?? '')) peopleUpdates.city                  = city
    if (phone        !== (person.phone                 ?? '')) peopleUpdates.phone                 = phone
    if (obs          !== (person.observacoes_pastorais ?? '')) peopleUpdates.observacoes_pastorais = obs
    if (comoConheceu !== (person.como_conheceu         ?? '')) peopleUpdates.como_conheceu         = comoConheceu
    if (maritalStatus !== (person.marital_status       ?? '')) peopleUpdates.marital_status        = maritalStatus

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
        ministry_id:      ministryId || null,
        close_journey:    closingOutcome || undefined,
      })
      const closedMsg = closingOutcome ? ' Jornada encerrada.' : ''
      onToast(`Atendimento registrado com sucesso.${closedMsg}`, 'success')
      setNotes('')
      setNextStep('')
      setNextDue('')
      setMinistryId('')
      setAcceptedJesus(false)
      setQuerCelula(false)
      setMembroOutraIgreja(false)
      setTemBatismo(false)
      setVoltouAoCulto(false)
      setFezConnect(false)
      setQuerSerMembro(false)
      setQuerServir(false)
    } catch (err) {
      const msg = String(err)
      if (msg.includes('JOURNEY_VERSION_CONFLICT')) {
        onToast('Conflito de versão — jornada atualizada por outra pessoa. Recarregue a página.', 'error')
      } else {
        onToast('Erro ao registrar atendimento. Dados preservados — tente novamente.', 'error')
      }
    }
  }

  const canSave = hasChanges && !missingStageForNewJourney && !register.isPending

  const saveBar = (
    <div className="p-4 bg-white border-t border-border-default rounded-b-2xl">
      <Button
        variant="primary"
        size="md"
        loading={register.isPending}
        disabled={!canSave}
        onClick={handleSalvar}
        className="w-full"
      >
        {register.isPending ? 'Salvando…' : 'Salvar atendimento'}
      </Button>
      {missingStageForNewJourney && (
        <p className="text-center text-xs text-amber-600 font-medium mt-2">
          Selecione uma etapa para iniciar a jornada
        </p>
      )}
      {!missingStageForNewJourney && !hasChanges && !register.isPending && (
        <p className="text-center text-xs text-text-secondary mt-2">
          Preencha ao menos um campo para salvar
        </p>
      )}
    </div>
  )

  // ── Seções que mostram "Completar dados" ──────────────────
  const needsPhone         = !person.phone
  const needsLocation      = !person.neighborhood || !person.city
  const needsComoConheceu  = !person.como_conheceu
  const needsMarital       = !person.marital_status
  const showCompletarDados = needsPhone || needsLocation || needsComoConheceu || needsMarital

  const formContent = (
    <div className="p-4 space-y-4">

      {/* ── E2: alerta sem jornada ── */}
      {!journey && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-700">
            Esta pessoa não tem jornada ativa. Selecione uma etapa abaixo para iniciá-la.
          </p>
        </div>
      )}

      {/* ── E6: Completar dados ── */}
      {showCompletarDados && (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Completar dados</p>
          {needsPhone && (
            <label className="block">
              <span className="text-xs text-text-secondary">Telefone</span>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="+55 11 99999-9999"
                className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            </label>
          )}
          {needsLocation && (
            <div className="grid grid-cols-2 gap-2">
              {!person.neighborhood && (
                <label className="block">
                  <span className="text-xs text-text-secondary">Bairro</span>
                  <input value={nbhd} onChange={e => setNbhd(e.target.value)}
                    placeholder="Vila Madalena"
                    className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                </label>
              )}
              {!person.city && (
                <label className="block">
                  <span className="text-xs text-text-secondary">Cidade</span>
                  <input value={city} onChange={e => setCity(e.target.value)}
                    placeholder="São Paulo"
                    className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary" />
                </label>
              )}
            </div>
          )}
          {/* Como conheceu + estado civil lado a lado quando os dois faltam (E4) */}
          {(needsComoConheceu || needsMarital) && (
            <div className={needsComoConheceu && needsMarital ? 'grid grid-cols-2 gap-2' : ''}>
              {needsComoConheceu && (
                <label className="block">
                  <span className="text-xs text-text-secondary">Como conheceu a igreja</span>
                  <select value={comoConheceu} onChange={e => setComoConheceu(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white">
                    <option value="">Selecionar…</option>
                    {Object.entries(COMO_CONHECEU_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              )}
              {needsMarital && (
                <label className="block">
                  <span className="text-xs text-text-secondary">Estado civil</span>
                  <select value={maritalStatus} onChange={e => setMaritalStatus(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white">
                    <option value="">Selecionar…</option>
                    {Object.entries(MARITAL_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── E3: Sinais de contexto (8 sinais) ── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Sinais desta conversa</p>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {([
            ['accepted_jesus',      acceptedJesus,      setAcceptedJesus,      'Aceitou Jesus'],
            ['quer_celula',         querCelula,         setQuerCelula,         'Quer célula'],
            ['membro_outra_igreja', membroOutraIgreja,  setMembroOutraIgreja,  'Membro transferido'],
            ['tem_batismo',         temBatismo,         setTemBatismo,         'Já foi batizado'],
            ['voltou_ao_culto',     voltouAoCulto,      setVoltouAoCulto,      'Voltou ao culto'],
            ['fez_connect',         fezConnect,         setFezConnect,         'Fez o Connect'],
            ['quer_ser_membro',     querSerMembro,      setQuerSerMembro,      'Quer ser membro'],
            ['quer_servir',         querServir,         setQuerServir,         'Quer servir'],
          ] as [string, boolean, (v: boolean) => void, string][]).map(([key, val, setter, label]) => (
            <button key={key} onClick={() => setter(!val)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                val
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'border-border-default text-text-secondary hover:border-primary/30 hover:text-text-primary'
              }`}>
              <CheckCircle2 size={13} className={val ? 'text-primary' : 'text-transparent'} strokeWidth={2.5} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── E4: Sugestão de etapa (reason já visível) ── */}
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
        <select value={stageId} onChange={e => setStageId(e.target.value)}
          className={`w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white ${
            missingStageForNewJourney ? 'border-amber-400' : 'border-border-default'
          }`}>
          <option value="">{journey ? 'Manter etapa atual' : 'Selecionar etapa (obrigatório)…'}</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* ── Registro do contato ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Registrar contato</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="text-xs text-text-secondary">Canal</span>
            <select value={channel} onChange={e => setChannel(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white">
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-text-secondary">Resultado</span>
            <select value={result} onChange={e => setResult(e.target.value)}
              className={`mt-1 w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white ${
                closingOutcome ? 'border-red-300 bg-red-50' : 'border-border-default'
              }`}>
              {Object.entries(RESULT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>

        {/* E5: aviso de encerramento */}
        {closingOutcome && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <AlertCircle size={13} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-700">
              Este resultado vai <strong>encerrar a jornada</strong> desta pessoa.
            </p>
          </div>
        )}

        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Anotações sobre esta conversa…"
          rows={3}
          className="w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none" />
        <label className="block">
          <span className="text-xs text-text-secondary">Observação pastoral</span>
          <input value={obs} onChange={e => setObs(e.target.value)}
            placeholder="Contexto pastoral relevante…"
            className="mt-1 w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary" />
        </label>
      </div>

      {/* ── E7: Encaminhar para ministério ── */}
      {ministries.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide flex items-center gap-1.5">
            <Building2 size={12} />
            Encaminhar para ministério
          </p>
          <select value={ministryId} onChange={e => setMinistryId(e.target.value)}
            className="w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary bg-white">
            <option value="">Não encaminhar</option>
            {ministries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          {ministryId && (() => {
            const sel = ministries.find(m => m.id === ministryId)
            let msg: string
            if (!sel?.leader_id) {
              msg = 'Encaminhamento será registrado. Este ministério ainda não tem líder cadastrado.'
            } else if (!sel.leader_email) {
              msg = `Encaminhamento será registrado. ${sel.leader_name ?? 'O líder'} ainda não tem acesso ao sistema.`
            } else {
              msg = `${sel.leader_name ?? 'O líder'} será notificado ao salvar.`
            }
            return <p className="text-xs text-text-secondary">{msg}</p>
          })()}
        </div>
      )}

      {/* ── Próximo passo (lado a lado) ── */}
      {!closingOutcome && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Próximo passo</p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input value={nextStep} onChange={e => setNextStep(e.target.value)}
              placeholder="Ex: Apresentar para a célula"
              className="w-full rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary" />
            <input type="date" value={nextDue} onChange={e => setNextDue(e.target.value)}
              className="rounded-xl border border-border-default px-3 py-2 text-sm focus:outline-none focus:border-primary" />
          </div>
        </div>
      )}

    </div>
  )

  return (
    <>
      {/* ── Mobile: barra fixa no fundo da viewport ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-border-default px-4 py-3 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
        <Button
          variant="primary"
          size="md"
          loading={register.isPending}
          disabled={!canSave}
          onClick={handleSalvar}
          className="w-full"
        >
          {register.isPending ? 'Salvando…' : 'Salvar atendimento'}
        </Button>
        {missingStageForNewJourney && (
          <p className="text-center text-xs text-amber-600 font-medium mt-1">
            Selecione uma etapa para iniciar a jornada
          </p>
        )}
      </div>

      {/* ── Card (desktop: sticky + save no rodapé; E3/E5) ── */}
      <div className="bg-white rounded-2xl border border-border-default shadow-sm lg:sticky lg:top-4 flex flex-col">
        <div className="lg:overflow-y-auto lg:max-h-[calc(100vh-9rem)]">
          <h3 className="font-semibold text-ekthos-black text-sm px-4 pt-4">O que fazer agora</h3>
          {formContent}
        </div>
        <div className="hidden md:block">
          {saveBar}
        </div>
      </div>
    </>
  )
}

// ── Página principal ──────────────────────────────────────────

export default function AtendimentoPage() {
  const { id: personId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { churchId } = useAuth()
  const [toast, setToast] = useState<ToastState | null>(null)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const el = document.querySelector('main')
    if (!el) return
    const handler = () => setScrolled(el.scrollTop > 100)
    el.addEventListener('scroll', handler, { passive: true })
    return () => el.removeEventListener('scroll', handler)
  }, [])

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
  const whatsappUrl = person.phone ? `https://wa.me/${person.phone.replace(/\D/g, '')}` : null

  return (
    /*
     * E1 — Sair do max-w-7xl sem tocar Layout.tsx
     * Mobile  (<md) : width=100vw, ml=50%-50vw → cancela px-4 (16px) do container
     * Desktop (≥md) : width=100vw-64px (sidebar), ml=(50%-50vw+32px) → cancela
     *                 px-6 (24px) + mx-auto (~288px a 1920px) do max-w-7xl
     * Tolerância scrollbar Windows: ±8px; aceitável.
     */
    <div
      className="pb-24 md:pb-8 w-[100vw] [margin-left:calc(50%-50vw)] md:w-[calc(100vw-64px)] md:[margin-left:calc(50%-50vw+32px)]"
    >

      {/* E6: Mini-header mobile — aparece após 100px de scroll */}
      <div
        className={`md:hidden fixed top-0 inset-x-0 z-50 bg-white border-b border-border-default px-4 py-2 shadow-sm flex items-center gap-3 transition-transform duration-200 ${
          scrolled ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <button onClick={() => navigate(-1)} className="w-7 h-7 flex items-center justify-center text-text-secondary shrink-0">
          <ArrowLeft size={16} />
        </button>
        <span className="font-semibold text-sm text-ekthos-black truncate flex-1">{displayName}</span>
        {whatsappUrl && (
          <a href={whatsappUrl} target="_blank" rel="noopener noreferrer"
            className="shrink-0 w-8 h-8 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg">
            <MessageCircle size={15} strokeWidth={2} />
          </a>
        )}
      </div>

      {/* Header row */}
      <div className="flex items-center gap-3 px-4 md:px-6 pt-0 pb-3">
        <button onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-bg-hover transition-colors text-text-secondary"
          aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-lg md:text-xl font-bold text-ekthos-black truncate">
            Atendimento — {displayName}
          </h1>
          {journey
            ? <p className="text-xs text-text-secondary">Jornada ativa · v{journey.version}</p>
            : <p className="text-xs text-amber-600 font-medium flex items-center gap-1"><Clock size={11} /> Sem jornada ativa</p>}
        </div>
      </div>

      {/* E2: Quem é — faixa horizontal full-width */}
      <div className="px-4 md:px-6 pb-3">
        <BlocoQuemE person={person} />
      </div>

      {/* E3: Duas colunas — formulário (esq, maior) + histórico (dir, sempre visível) */}
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 px-4 md:px-6 items-start">
        <BlocoAcoes
          person={person}
          journey={journey}
          stages={stages}
          onToast={(msg, type) => setToast({ msg, type, key: Date.now() })}
        />
        <BlocoHistorico personId={person.id} />
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} key={toast.key} />}
    </div>
  )
}
