import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Send, Loader, Upload, Check, User } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Tipos ──────────────────────────────────────────────────

interface Message {
  role:      'assistant' | 'user'
  content:   string
  timestamp: Date
}

interface InputWidget {
  type:     'select' | 'multiselect' | 'upload'
  label:    string
  options?: string[]
}

// ── Constantes ─────────────────────────────────────────────

const PLAN_LABEL: Record<string, string> = {
  chamado:    'Chamado — R$689,90/mês',
  missao:     'Missão — R$1.639,90/mês',
  avivamento: 'Avivamento — R$2.469,90/mês',
}

const PLAN_SHORT: Record<string, string> = {
  chamado:    'R$689,90/mês',
  missao:     'R$1.639,90/mês',
  avivamento: 'R$2.469,90/mês',
}

const TOTAL_QUESTIONS = 20

// ── Avatares ───────────────────────────────────────────────

function EkthosAvatar() {
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-base select-none shadow-sm"
      style={{ background: '#E13500', color: 'white' }}
    >
      E
    </div>
  )
}

function UserAvatar({ initial }: { initial: string }) {
  return (
    <div
      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm select-none"
      style={{ background: '#161616', color: 'white' }}
    >
      {initial ? initial : <User size={16} />}
    </div>
  )
}

// ── Mensagem ───────────────────────────────────────────────

function MessageBubble({ msg, userInitial }: { msg: Message; userInitial: string }) {
  const isBot = msg.role === 'assistant'
  return (
    <div className={`flex items-start gap-3 ${isBot ? '' : 'flex-row-reverse'}`}>
      {isBot ? <EkthosAvatar /> : <UserAvatar initial={userInitial} />}

      <div className={`flex flex-col ${isBot ? '' : 'items-end'} max-w-[78%]`}>
        {isBot && (
          <p className="text-[11px] font-bold text-gray-400 mb-1.5 ml-1 tracking-widest uppercase">
            Consultor Ekthos
          </p>
        )}
        <div
          className={`px-5 py-4 text-[15px] leading-relaxed ${
            isBot
              ? 'bg-white border border-black/[0.07] rounded-3xl rounded-tl-xl text-gray-800'
              : 'rounded-3xl rounded-tr-xl text-white'
          }`}
          style={isBot ? {} : { background: '#E13500' }}
        >
          {msg.content.split('\n').map((line, i, arr) => (
            <span key={i}>
              {line || '\u00A0'}
              {i < arr.length - 1 && <br />}
            </span>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5 px-1">
          {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

// ── Streaming bubble ───────────────────────────────────────

function StreamingBubble({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-3">
      <EkthosAvatar />
      <div className="flex flex-col max-w-[78%]">
        <p className="text-[11px] font-bold text-gray-400 mb-1.5 ml-1 tracking-widest uppercase">
          Consultor Ekthos
        </p>
        <div className="px-5 py-4 text-[15px] leading-relaxed bg-white border border-black/[0.07] rounded-3xl rounded-tl-xl text-gray-800">
          {content.split('\n').map((line, i, arr) => (
            <span key={i}>
              {line || '\u00A0'}
              {i < arr.length - 1 && <br />}
            </span>
          ))}
          <span
            className="inline-block w-0.5 h-[1em] ml-0.5 align-middle animate-pulse"
            style={{ background: '#E13500' }}
          />
        </div>
      </div>
    </div>
  )
}

// ── Loading dots ───────────────────────────────────────────

function LoadingDots() {
  return (
    <div className="flex items-start gap-3">
      <EkthosAvatar />
      <div className="bg-white border border-black/[0.07] rounded-3xl rounded-tl-xl px-5 py-4">
        <div className="flex gap-1.5 items-center h-5">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full animate-bounce"
              style={{ background: '#E13500', animationDelay: `${i * 140}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Barra de progresso linear ──────────────────────────────

function ProgressBar({ questionNumber }: { questionNumber: number }) {
  const pct = Math.round(((questionNumber - 1) / TOTAL_QUESTIONS) * 100)
  return (
    <div className="px-6 py-4 border-b border-black/[0.06] bg-white shrink-0">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-gray-700">
          Pergunta {questionNumber} de {TOTAL_QUESTIONS}
        </span>
        <span className="text-xs font-bold tabular-nums" style={{ color: '#E13500' }}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#EBEBEB' }}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: '#E13500' }}
        />
      </div>
    </div>
  )
}

// ── Preview lateral ────────────────────────────────────────

interface PreviewState {
  pipeline:    string[]
  departments: string[]
  agents:      string[]
  cells:       number
}

function OnboardingPreview({ preview }: { preview: PreviewState }) {
  const hasContent =
    preview.pipeline.length > 0 ||
    preview.departments.length > 0 ||
    preview.cells > 0 ||
    preview.agents.length > 0

  if (!hasContent) {
    return (
      <div className="hidden lg:flex flex-col items-center justify-center h-full p-8 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-2xl"
          style={{ background: 'rgba(225,53,0,0.08)' }}
        >
          ✦
        </div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Em configuração</p>
        <p className="text-xs text-gray-400 leading-relaxed max-w-[160px]">
          À medida que conversamos, vou montando o perfil da sua igreja aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="hidden lg:flex flex-col gap-3 p-5 overflow-y-auto">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">
        Em configuração
      </p>

      {preview.pipeline.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">
            Caminho de discipulado
          </p>
          <div className="flex flex-wrap gap-1.5">
            {preview.pipeline.map((s, i) => (
              <span
                key={i}
                className="text-[11px] px-2.5 py-1 rounded-full text-white font-medium"
                style={{ background: `hsl(${14 + i * 22}, 72%, ${47 - i * 2}%)` }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {preview.departments.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">
            Ministérios
          </p>
          <div className="flex flex-wrap gap-1.5">
            {preview.departments.map((d, i) => (
              <span
                key={i}
                className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                style={{ background: '#F9EEDC', color: '#5A5A5A' }}
              >
                {d}
              </span>
            ))}
          </div>
        </div>
      )}

      {preview.cells > 0 && (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">
            Células
          </p>
          <p className="text-3xl font-bold mt-1" style={{ color: '#E13500' }}>
            {preview.cells}
          </p>
        </div>
      )}

      {preview.agents.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">
            Agentes selecionados
          </p>
          {preview.agents.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 mt-1.5">
              <Check size={12} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0 }} />
              <span className="capitalize">{a}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Página principal ───────────────────────────────────────

export default function Onboarding() {
  const [searchParams] = useSearchParams()
  const navigate       = useNavigate()
  const planSlug       = searchParams.get('plan') ?? 'chamado'

  const [messages,         setMessages]         = useState<Message[]>([])
  const [input,            setInput]            = useState('')
  const [loading,          setLoading]          = useState(false)
  const [sessionId,        setSessionId]        = useState<string | null>(null)
  const [blockIndex,       setBlockIndex]       = useState(1)
  const [isComplete,       setIsComplete]       = useState(false)
  const [configJson,       setConfigJson]       = useState<unknown>(null)
  const [preview,          setPreview]          = useState<PreviewState>({ pipeline: [], departments: [], agents: [], cells: 0 })
  const [uploadLabel,      setUploadLabel]      = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState<string | null>(null)
  const [userInitial,      setUserInitial]      = useState('')
  // Widget vem do evento 'done' — não é mais parseado do texto da IA
  const [currentWidget,    setCurrentWidget]    = useState<InputWidget | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

  // Saudação inicial — só pergunta P1
  useEffect(() => {
    setMessages([{
      role:      'assistant',
      content:   `Olá! Seja muito bem-vindo à Ekthos! 🙏\n\nSou seu Consultor de Onboarding — estou aqui para personalizar o CRM da sua igreja com atenção a cada detalhe da sua operação pastoral.\n\nVocê escolheu o plano ${PLAN_LABEL[planSlug] ?? planSlug}. Ótima escolha!\n\nVamos começar: qual é o nome completo da sua igreja?`,
      timestamp: new Date(),
    }])
  }, [planSlug])

  // Initial do email para avatar
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setUserInitial(session.user.email[0].toUpperCase())
    })
  }, [])

  // Scroll automático
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, streamingContent])

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return

    setInput('')
    setCurrentWidget(null)
    setMessages(prev => [...prev, { role: 'user', content, timestamp: new Date() }])
    setLoading(true)
    setStreamingContent('')

    let finalText = ''

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/login'); return }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

      const res = await fetch(`${SUPABASE_URL}/functions/v1/onboarding-consultant`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: content, session_id: sessionId, plan_slug: planSlug }),
      })

      if (!res.ok || !res.body) {
        let errMsg = 'Erro na comunicação com o consultor'
        try { const b = await res.json() as { error?: string }; if (b.error) errMsg = b.error } catch { /* ignore */ }
        throw new Error(errMsg)
      }

      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer    = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const evt = JSON.parse(line.slice(6)) as {
              type:             string
              content?:         string
              session_id?:      string
              question_number?: number
              total_questions?: number
              answered_count?:  number
              is_complete?:     boolean
              config?:          unknown
              message?:         string
              widget?:          { type: 'select_one' | 'select_many'; options: string[] } | null
              question_id?:     string
            }

            if (evt.type === 'token' && evt.content) {
              finalText += evt.content
              setStreamingContent(prev => (prev ?? '') + evt.content!)

            } else if (evt.type === 'done') {
              if (evt.session_id)       setSessionId(evt.session_id)
              if (evt.question_number)  setBlockIndex(evt.question_number)

              // Widget vem hardcoded do backend — zero parsing de texto
              if (evt.widget !== undefined) {
                if (!evt.widget) {
                  setCurrentWidget(null)
                } else {
                  setCurrentWidget({
                    type:    evt.widget.type === 'select_one' ? 'select' : 'multiselect',
                    label:   '',
                    options: evt.widget.options,
                  })
                }
              }

              if (evt.is_complete && evt.config) {
                setIsComplete(true)
                setConfigJson(evt.config)
                updatePreviewFromConfig(evt.config)
              }

            } else if (evt.type === 'error') {
              throw new Error(evt.message ?? 'Erro desconhecido')
            }
          } catch (parseErr) {
            // Só ignora erros de parse de JSON — outros erros (ex: tipo 'error' do backend) devem propagar
            if (!(parseErr instanceof SyntaxError)) throw parseErr
          }
        }
      }

      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: finalText, timestamp: new Date() },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Desculpe, tive uma dificuldade técnica. Por favor, tente novamente.', timestamp: new Date() },
      ])
    } finally {
      setStreamingContent(null)
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function updatePreviewFromConfig(config: unknown) {
    const c           = config as Record<string, unknown>
    const pipeline    = ((c.pipeline as Record<string, unknown>)?.stages as Array<Record<string, unknown>>)?.map(s => String(s.name)) ?? []
    const departments = (c.departments as Array<Record<string, unknown>>)?.map(d => String(d.name)) ?? []
    const cells       = ((c.cell_network as Record<string, unknown>)?.total_cells as number) ?? 0
    const agentSlugs  = [
      ...((c.agents as Record<string, unknown>)?.included_in_plan as string[] ?? []),
      ...((c.agents as Record<string, unknown>)?.purchased         as string[] ?? []),
    ]
    setPreview({
      pipeline,
      departments,
      cells,
      agents: agentSlugs.map(s => s.replace('agent-', '').replace(/-/g, ' ')),
    })
  }

  function startConfiguration() {
    if (!sessionId || !configJson) return
    navigate(`/onboarding/configuring?session_id=${sessionId}`)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void sendMessage()
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadLabel(file.name)
    await sendMessage(`Fiz o upload do arquivo: ${file.name}`)
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: '#F9EEDC' }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-black/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-sm"
            style={{ background: '#E13500' }}
          >
            E
          </div>
          <div className="leading-none">
            <span className="font-semibold text-gray-900 text-sm">Ekthos</span>
            <span className="text-gray-300 text-sm"> · </span>
            <span className="text-gray-500 text-sm">Configuração da sua igreja</span>
          </div>
        </div>
        <span
          className="text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(225,53,0,0.08)', color: '#E13500' }}
        >
          {PLAN_SHORT[planSlug] ?? planSlug}
        </span>
      </div>

      {/* ── Progress bar ── */}
      <ProgressBar questionNumber={blockIndex} />

      {/* ── Layout principal ── */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* Chat */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} userInitial={userInitial} />
            ))}

            {loading && (
              streamingContent !== null && streamingContent.length > 0
                ? <StreamingBubble content={streamingContent} />
                : <LoadingDots />
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Widget hardcoded do backend */}
          {currentWidget && !isComplete && !loading && (
            <DynamicWidget
              widget={currentWidget}
              onSelect={v => sendMessage(v)}
              onUpload={handleFileUpload}
              uploadLabel={uploadLabel}
            />
          )}

          {/* Botão de finalizar */}
          {isComplete && (
            <div className="px-6 py-4 bg-white border-t border-black/[0.06] shrink-0">
              <button
                onClick={startConfiguration}
                className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-white text-base transition-all hover:opacity-90 active:scale-[0.99]"
                style={{ background: '#E13500' }}
              >
                <span>✦</span>
                Configurar meu CRM agora
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">
                Leva cerca de 30 segundos · Você vai acompanhar tudo em tempo real
              </p>
            </div>
          )}

          {/* Input de texto */}
          {!isComplete && (
            <div className="px-5 py-4 bg-white border-t border-black/[0.06] shrink-0">
              <div className="flex gap-3 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escreva sua resposta... (Enter para enviar)"
                  rows={2}
                  disabled={loading}
                  className="flex-1 resize-none px-4 py-3 rounded-2xl border text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-transparent transition-all disabled:opacity-50"
                  style={{ borderColor: '#E8E8E8', background: '#FAFAFA' }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim()}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-white transition-all hover:opacity-90 disabled:opacity-40 shrink-0"
                  style={{ background: '#E13500' }}
                >
                  {loading
                    ? <Loader size={18} strokeWidth={1.75} className="animate-spin" />
                    : <Send   size={18} strokeWidth={1.75} />
                  }
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Preview lateral */}
        <div
          className="w-72 border-l border-black/[0.06] hidden lg:block overflow-y-auto"
          style={{ background: '#F9EEDC' }}
        >
          <OnboardingPreview preview={preview} />
        </div>
      </div>
    </div>
  )
}

// ── Widget dinâmico ────────────────────────────────────────

interface DynamicWidgetProps {
  widget:      InputWidget
  onSelect:    (value: string) => void
  onUpload:    (e: React.ChangeEvent<HTMLInputElement>) => void
  uploadLabel: string | null
}

function DynamicWidget({ widget, onSelect, onUpload, uploadLabel }: DynamicWidgetProps) {
  const [selected, setSelected] = useState<string[]>([])

  if (widget.type === 'upload') {
    return (
      <div className="px-5 py-3 bg-white border-t border-black/[0.06]">
        <label
          className="flex items-center gap-3 cursor-pointer rounded-2xl border border-dashed px-4 py-3 transition-colors hover:border-[#E13500]"
          style={{ borderColor: '#DDD', background: '#FAFAFA' }}
        >
          <Upload size={18} strokeWidth={1.75} style={{ color: '#E13500' }} />
          <span className="text-sm text-gray-600">{uploadLabel ?? widget.label}</span>
          <input type="file" className="hidden" accept=".png,.jpg,.svg,.pdf" onChange={onUpload} />
        </label>
      </div>
    )
  }

  if (widget.type === 'select' && widget.options) {
    return (
      <div className="px-5 py-3 bg-white border-t border-black/[0.06]">
        <div className="flex flex-wrap gap-2">
          {widget.options.map(opt => (
            <button
              key={opt}
              onClick={() => onSelect(opt)}
              className="text-sm px-4 py-2 rounded-xl border font-medium transition-all hover:border-[#E13500] hover:text-[#E13500]"
              style={{ borderColor: '#E8E8E8', color: '#5A5A5A', background: '#FAFAFA' }}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (widget.type === 'multiselect' && widget.options) {
    return (
      <div className="px-5 py-3 bg-white border-t border-black/[0.06]">
        <div className="flex flex-wrap gap-2">
          {widget.options.map(opt => (
            <button
              key={opt}
              onClick={() => {
                const next = selected.includes(opt)
                  ? selected.filter(s => s !== opt)
                  : [...selected, opt]
                setSelected(next)
              }}
              className="text-sm px-3.5 py-1.5 rounded-full border font-medium transition-all"
              style={{
                background:  selected.includes(opt) ? '#E13500' : '#FAFAFA',
                color:       selected.includes(opt) ? 'white'   : '#5A5A5A',
                borderColor: selected.includes(opt) ? '#E13500' : '#E8E8E8',
              }}
            >
              {opt}
            </button>
          ))}
          {selected.length > 0 && (
            <button
              onClick={() => { onSelect(selected.join(', ')); setSelected([]) }}
              className="text-sm px-4 py-1.5 rounded-full font-semibold text-white"
              style={{ background: '#2D7A4F' }}
            >
              Confirmar ({selected.length})
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}
