import { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  Send, Loader, Upload, ChevronDown, CheckCircle, Bot, User,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Tipos ──────────────────────────────────────────────────

interface Message {
  role:      'assistant' | 'user'
  content:   string
  timestamp: Date
}

interface InputWidget {
  type:        'select' | 'multiselect' | 'upload' | 'number' | 'text'
  label:       string
  options?:    string[]
  placeholder?: string
}

// ── Constantes ─────────────────────────────────────────────

const PLAN_LABEL: Record<string, string> = {
  chamado:    'Chamado — R$389/mês',
  missao:     'Missão — R$698/mês',
  avivamento: 'Avivamento — R$1.015,67/mês',
}

const BLOCK_LABELS = [
  'Identidade da Igreja',
  'Operação Pastoral',
  'Gestão de Dados',
  'Equipe e Permissões',
  'Agentes de Inteligência',
  'Canais e Integrações',
]

// ── Componente de mensagem ─────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isAssistant = msg.role === 'assistant'
  return (
    <div className={`flex gap-3 ${isAssistant ? '' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
          isAssistant ? 'bg-red-50' : 'bg-cream'
        }`}
        style={{ color: isAssistant ? '#e13500' : '#5A5A5A' }}
      >
        {isAssistant
          ? <Bot  size={16} strokeWidth={1.75} />
          : <User size={16} strokeWidth={1.75} />}
      </div>

      {/* Bolha */}
      <div className={`max-w-[80%] ${isAssistant ? '' : 'text-right'}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
            isAssistant
              ? 'bg-white border border-black/5 text-gray-800'
              : 'text-white'
          }`}
          style={isAssistant ? {} : { background: '#e13500' }}
        >
          {msg.content.split('\n').map((line, i) => (
            <span key={i}>
              {line}
              {i < msg.content.split('\n').length - 1 && <br />}
            </span>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-1 px-1">
          {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

// ── Barra de progresso ─────────────────────────────────────

function ProgressBar({ blockIndex }: { blockIndex: number }) {
  const pct = Math.round(((blockIndex - 1) / 6) * 100)
  return (
    <div className="px-6 py-3 border-b border-black/5 bg-white">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-medium text-gray-500">
          Bloco {blockIndex}/6 — {BLOCK_LABELS[blockIndex - 1] ?? ''}
        </span>
        <span className="text-xs font-mono-ekthos font-semibold" style={{ color: '#e13500' }}>
          {pct}%
        </span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: '#e13500' }}
        />
      </div>
    </div>
  )
}

// ── Preview lateral ────────────────────────────────────────

interface PreviewState {
  pipeline:   string[]
  departments: string[]
  agents:     string[]
  cells:      number
}

function OnboardingPreview({ preview }: { preview: PreviewState }) {
  return (
    <div className="hidden lg:flex flex-col gap-4 p-6 overflow-y-auto">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
        Em configuração
      </h3>

      {/* Pipeline */}
      {preview.pipeline.length > 0 && (
        <div className="bg-white rounded-xl border border-black/5 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">Caminho de discipulado</p>
          <div className="flex flex-wrap gap-1">
            {preview.pipeline.map((s, i) => (
              <span
                key={i}
                className="text-xs px-2 py-0.5 rounded-full text-white"
                style={{ background: `hsl(${14 + i * 20}, 80%, ${50 - i * 3}%)` }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Departamentos */}
      {preview.departments.length > 0 && (
        <div className="bg-white rounded-xl border border-black/5 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">Ministérios</p>
          <div className="flex flex-wrap gap-1">
            {preview.departments.map((d, i) => (
              <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-cream text-gray-700">{d}</span>
            ))}
          </div>
        </div>
      )}

      {/* Células */}
      {preview.cells > 0 && (
        <div className="bg-white rounded-xl border border-black/5 p-4">
          <p className="text-xs font-semibold text-gray-600">Células</p>
          <p className="font-mono-ekthos text-2xl font-bold mt-1" style={{ color: '#e13500' }}>
            {preview.cells}
          </p>
        </div>
      )}

      {/* Agentes */}
      {preview.agents.length > 0 && (
        <div className="bg-white rounded-xl border border-black/5 p-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">Agentes selecionados</p>
          {preview.agents.map((a, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 mt-1">
              <CheckCircle size={12} strokeWidth={2} style={{ color: '#2D7A4F' }} />
              {a}
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
  const navigate = useNavigate()
  const planSlug = searchParams.get('plan') ?? 'chamado'

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

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

  // Detecta widgets dinâmicos na última mensagem do assistente
  const lastAssistantMsg = [...messages].reverse().find(m => m.role === 'assistant')?.content ?? ''
  const currentWidget = detectWidget(lastAssistantMsg)

  // Saudação inicial
  useEffect(() => {
    const greeting: Message = {
      role:      'assistant',
      content:   `Olá! Seja muito bem-vindo à Ekthos!\n\nSou seu Consultor de Onboarding — estou aqui para personalizar o CRM da sua igreja, com carinho e atenção a cada detalhe da sua operação pastoral.\n\nVocê escolheu o plano ${PLAN_LABEL[planSlug] ?? planSlug}. Perfeito!\n\nVamos começar com o básico: **qual é o nome da sua igreja?** E me conta também em qual cidade e estado vocês estão.`,
      timestamp: new Date(),
    }
    setMessages([greeting])
  }, [planSlug])

  // Scroll automático
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return

    setInput('')
    const userMsg: Message = { role: 'user', content, timestamp: new Date() }
    setMessages(prev => [...prev, userMsg])
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
        body: JSON.stringify({
          message:    content,
          session_id: sessionId,
          plan_slug:  planSlug,
        }),
      })

      if (!res.ok || !res.body) throw new Error('Erro na comunicação com o consultor')

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
              type:         string
              content?:     string
              session_id?:  string
              block_index?: number
              is_complete?: boolean
              config?:      unknown
              message?:     string
            }

            if (evt.type === 'token' && evt.content) {
              finalText += evt.content
              setStreamingContent(prev => (prev ?? '') + evt.content!)
            } else if (evt.type === 'done') {
              if (evt.session_id)  setSessionId(evt.session_id)
              if (evt.block_index) setBlockIndex(evt.block_index)
              if (evt.is_complete && evt.config) {
                setIsComplete(true)
                setConfigJson(evt.config)
                updatePreviewFromConfig(evt.config)
              }
            } else if (evt.type === 'error') {
              throw new Error(evt.message ?? 'Erro desconhecido')
            }
          } catch { /* ignore JSON parse errors on individual lines */ }
        }
      }

      // Commita mensagem do assistente no histórico
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: finalText, timestamp: new Date() },
      ])
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role:      'assistant',
          content:   'Desculpe, tive uma dificuldade técnica. Por favor, tente novamente.',
          timestamp: new Date(),
        },
      ])
    } finally {
      setStreamingContent(null)
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  function updatePreviewFromConfig(config: unknown) {
    const c = config as Record<string, unknown>
    const pipeline    = ((c.pipeline as Record<string, unknown>)?.stages as Array<Record<string, unknown>>)?.map(s => String(s.name)) ?? []
    const departments = ((c.departments as Array<Record<string, unknown>>))?.map(d => String(d.name)) ?? []
    const cells       = ((c.cell_network as Record<string, unknown>)?.total_cells as number) ?? 0
    const agentSlugs  = [
      ...((c.agents as Record<string, unknown>)?.included_in_plan as string[] ?? []),
      ...((c.agents as Record<string, unknown>)?.purchased       as string[] ?? []),
    ]
    const agentLabels = agentSlugs.map(s => s.replace('agent-', '').replace(/-/g, ' '))
    setPreview({ pipeline, departments, cells, agents: agentLabels })
  }

  async function startConfiguration() {
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
    // Confirma o upload na conversa
    await sendMessage(`Fiz o upload do arquivo: ${file.name}`)
  }

  return (
    <div className="h-screen flex flex-col" style={{ background: '#f9eedc' }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-black/5">
        <div className="flex items-center gap-3">
          <span className="font-display text-xl font-bold" style={{ color: '#e13500' }}>Ekthos</span>
          <span className="text-xs text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">
            Configuração da sua igreja
          </span>
        </div>
        <span className="text-xs text-gray-400">
          Plano: <strong className="text-gray-600">{PLAN_LABEL[planSlug] ?? planSlug}</strong>
        </span>
      </div>

      {/* Progress bar */}
      <ProgressBar blockIndex={blockIndex} />

      {/* Layout principal */}
      <div className="flex-1 flex overflow-hidden">
        {/* Chat */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
            {messages.map((msg, i) => (
              <MessageBubble key={i} msg={msg} />
            ))}

            {/* Streaming ou loading dots */}
            {loading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={16} strokeWidth={1.75} style={{ color: '#e13500' }} />
                </div>
                {streamingContent !== null && streamingContent.length > 0 ? (
                  <div className="max-w-[80%]">
                    <div className="bg-white border border-black/5 rounded-2xl px-4 py-3 text-sm leading-relaxed text-gray-800">
                      {streamingContent.split('\n').map((line, i, arr) => (
                        <span key={i}>
                          {line}
                          {i < arr.length - 1 && <br />}
                        </span>
                      ))}
                      <span className="inline-block w-0.5 h-4 bg-red-400 animate-pulse ml-0.5 align-middle" />
                    </div>
                  </div>
                ) : (
                  <div className="bg-white border border-black/5 rounded-2xl px-4 py-3">
                    <div className="flex gap-1 items-center h-5">
                      {[0, 1, 2].map(i => (
                        <div
                          key={i}
                          className="w-1.5 h-1.5 rounded-full animate-bounce"
                          style={{ background: '#e13500', animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Widget dinâmico */}
          {currentWidget && !isComplete && (
            <DynamicWidget
              widget={currentWidget}
              onSelect={v => sendMessage(v)}
              onUpload={handleFileUpload}
              uploadLabel={uploadLabel}
            />
          )}

          {/* Botão de finalizar */}
          {isComplete && (
            <div className="px-6 py-4 bg-white border-t border-black/5">
              <button
                onClick={startConfiguration}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-white transition-all"
                style={{ background: '#e13500' }}
              >
                Configurar meu CRM agora
              </button>
              <p className="text-xs text-gray-400 text-center mt-2">
                Leva cerca de 30 segundos. Você vai acompanhar tudo em tempo real.
              </p>
            </div>
          )}

          {/* Input */}
          {!isComplete && (
            <div className="px-6 py-4 bg-white border-t border-black/5">
              <div className="flex gap-3 items-end">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escreva sua resposta... (Enter para enviar)"
                  rows={2}
                  disabled={loading}
                  className="flex-1 resize-none px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition-all disabled:opacity-60"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim()}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-white transition-all disabled:opacity-40 shrink-0"
                  style={{ background: '#e13500' }}
                >
                  {loading
                    ? <Loader size={18} strokeWidth={1.75} className="animate-spin" />
                    : <Send   size={18} strokeWidth={1.75} />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Preview lateral */}
        <div
          className="w-72 border-l border-black/5"
          style={{ background: '#f9eedc' }}
        >
          <OnboardingPreview preview={preview} />
        </div>
      </div>
    </div>
  )
}

// ── Widget dinâmico ────────────────────────────────────────

interface DynamicWidgetProps {
  widget:     InputWidget
  onSelect:   (value: string) => void
  onUpload:   (e: React.ChangeEvent<HTMLInputElement>) => void
  uploadLabel: string | null
}

function DynamicWidget({ widget, onSelect, onUpload, uploadLabel }: DynamicWidgetProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [open,     setOpen]     = useState(false)

  if (widget.type === 'upload') {
    return (
      <div className="px-6 py-3 bg-cream border-t border-black/5">
        <label className="flex items-center gap-3 cursor-pointer bg-white rounded-xl border border-dashed border-gray-300 px-4 py-3 hover:border-red-300 transition-colors">
          <Upload size={18} strokeWidth={1.75} style={{ color: '#e13500' }} />
          <span className="text-sm text-gray-600">
            {uploadLabel ?? widget.label}
          </span>
          <input type="file" className="hidden" accept=".png,.jpg,.svg,.pdf,.xlsx,.csv" onChange={onUpload} />
        </label>
      </div>
    )
  }

  if (widget.type === 'select' && widget.options) {
    return (
      <div className="px-6 py-3 bg-cream border-t border-black/5">
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center justify-between w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-600"
          >
            {widget.label}
            <ChevronDown size={14} strokeWidth={1.75} />
          </button>
          {open && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-white border border-black/5 rounded-xl shadow-lg overflow-hidden z-10">
              {widget.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => { setOpen(false); onSelect(opt) }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-cream transition-colors"
                >
                  {opt}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  if (widget.type === 'multiselect' && widget.options) {
    return (
      <div className="px-6 py-3 bg-cream border-t border-black/5">
        <p className="text-xs text-gray-500 mb-2">{widget.label}</p>
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
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                selected.includes(opt)
                  ? 'text-white border-transparent'
                  : 'bg-white text-gray-600 border-gray-200'
              }`}
              style={selected.includes(opt) ? { background: '#e13500', borderColor: '#e13500' } : {}}
            >
              {opt}
            </button>
          ))}
          {selected.length > 0 && (
            <button
              onClick={() => { onSelect(selected.join(', ')); setSelected([]) }}
              className="text-xs px-3 py-1.5 rounded-full text-white"
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

// ── Detecta tipo de widget na mensagem ─────────────────────

function detectWidget(text: string): InputWidget | null {
  const lower = text.toLowerCase()

  if (lower.includes('logo') || lower.includes('logotipo') || lower.includes('upload')) {
    return { type: 'upload', label: 'Clique para enviar o logo da igreja' }
  }
  if (lower.includes('ministério') || lower.includes('departamento')) {
    return {
      type:    'multiselect',
      label:   'Selecione os departamentos (pode escolher vários)',
      options: ['Louvor', 'Mídia', 'Recepção', 'Infantil', 'Jovens', 'Mulheres', 'Homens', 'EBD', 'Ação Social', 'Missionário', 'Intercessão'],
    }
  }
  if (lower.includes('plano') && (lower.includes('chamado') || lower.includes('missão') || lower.includes('avivamento'))) {
    return {
      type:    'select',
      label:   'Escolha seu plano',
      options: ['Chamado — R$389/mês', 'Missão — R$698/mês', 'Avivamento — R$1.015,67/mês'],
    }
  }
  if ((lower.includes('relat') || lower.includes('frequência')) && lower.includes('canal')) {
    return {
      type:    'select',
      label:   'Canal de preferência',
      options: ['WhatsApp', 'Email', 'PDF por email', 'Todos os canais'],
    }
  }
  return null
}
