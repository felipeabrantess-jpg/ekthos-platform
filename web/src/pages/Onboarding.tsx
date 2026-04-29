import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Loader, Upload, Check, User, ArrowLeft } from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ── Tipos ──────────────────────────────────────────────────

interface Message {
  role:      'assistant' | 'user'
  content:   string
  timestamp: Date
}

interface ColorPaletteOption {
  label:     string
  primary:   string
  secondary: string
  emoji:     string
}

interface InputWidget {
  type:        'select' | 'multiselect' | 'upload' | 'color_palette'
  label:       string
  options?:    string[]
  palettes?:   ColorPaletteOption[]
  accept?:     string
  optional?:   boolean
  skip_label?: string
}

// Estado intermediário após upload: aguardando confirmação de cores
interface LogoConfirmState {
  logoUrl:       string
  primaryColor:  string
  secondaryColor: string
}

// ── Constantes ─────────────────────────────────────────────

const COLOR_PALETTES: ColorPaletteOption[] = [
  { label: 'Fogo e Paixão',          primary: '#E13500', secondary: '#670000', emoji: '🔥' },
  { label: 'Céu e Mar',              primary: '#2563EB', secondary: '#1E3A5F', emoji: '🌊' },
  { label: 'Vida e Esperança',        primary: '#059669', secondary: '#064E3B', emoji: '🌿' },
  { label: 'Realeza e Unção',        primary: '#7C3AED', secondary: '#4C1D95', emoji: '👑' },
  { label: 'Glória e Terra',         primary: '#D97706', secondary: '#78350F', emoji: '✨' },
  { label: 'Águas Tranquilas',       primary: '#0891B2', secondary: '#155E75', emoji: '💧' },
  { label: 'Amor e Graça',           primary: '#DB2777', secondary: '#831843', emoji: '🌸' },
  { label: 'Elegância e Sobriedade', primary: '#374151', secondary: '#111827', emoji: '🖤' },
]

// ── Canvas: extrai cor dominante de uma imagem ─────────────
async function extractDominantColors(file: File): Promise<{ primary: string; secondary: string }> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        const SIZE   = 64
        canvas.width  = SIZE
        canvas.height = SIZE
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(img, 0, 0, SIZE, SIZE)
        const data = ctx.getImageData(0, 0, SIZE, SIZE).data

        const buckets: { r: number; g: number; b: number; count: number }[] = []
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3]
          if (a < 128) continue
          const max = Math.max(r, g, b), min = Math.min(r, g, b)
          const saturation = max === 0 ? 0 : (max - min) / max
          const brightness = max / 255
          if (saturation < 0.2 || brightness < 0.1 || brightness > 0.95) continue
          const qr = Math.round(r / 32) * 32
          const qg = Math.round(g / 32) * 32
          const qb = Math.round(b / 32) * 32
          const existing = buckets.find(bk => bk.r === qr && bk.g === qg && bk.b === qb)
          if (existing) existing.count++
          else buckets.push({ r: qr, g: qg, b: qb, count: 1 })
        }
        buckets.sort((a, b) => b.count - a.count)

        const toHex = (r: number, g: number, b: number) =>
          '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
        const darken = (r: number, g: number, b: number, factor = 0.55) =>
          toHex(Math.round(r * factor), Math.round(g * factor), Math.round(b * factor))

        if (buckets.length === 0) {
          resolve({ primary: '#E13500', secondary: '#670000' })
        } else {
          const top = buckets[0]
          resolve({
            primary:   toHex(top.r, top.g, top.b),
            secondary: darken(top.r, top.g, top.b),
          })
        }
      } catch {
        resolve({ primary: '#E13500', secondary: '#670000' })
      } finally {
        URL.revokeObjectURL(url)
      }
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ primary: '#E13500', secondary: '#670000' }) }
    img.src = url
  })
}

// ── Avatares ───────────────────────────────────────────────

function EkthosAvatar() {
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold text-base select-none shadow-sm"
      style={{ background: 'var(--color-primary)', color: 'white' }}>
      E
    </div>
  )
}
function UserAvatar({ initial }: { initial: string }) {
  return (
    <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-semibold text-sm select-none"
      style={{ background: '#161616', color: 'white' }}>
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
          style={isBot ? {} : { background: 'var(--color-primary)' }}
        >
          {msg.content.split('\n').map((line, i, arr) => {
            const contextMatch = line.match(/^_(.+)_$/)
            if (contextMatch) {
              return (
                <span key={i}>
                  <em className="not-italic text-[13px] text-gray-400">{contextMatch[1]}</em>
                  {i < arr.length - 1 && <br />}
                </span>
              )
            }
            return (
              <span key={i}>
                {line || '\u00A0'}
                {i < arr.length - 1 && <br />}
              </span>
            )
          })}
        </div>
        <p className="text-[11px] text-gray-400 mt-1.5 px-1">
          {msg.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>
    </div>
  )
}

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
            <span key={i}>{line || '\u00A0'}{i < arr.length - 1 && <br />}</span>
          ))}
          <span className="inline-block w-0.5 h-[1em] ml-0.5 align-middle animate-pulse" style={{ background: 'var(--color-primary)' }} />
        </div>
      </div>
    </div>
  )
}

function LoadingDots() {
  return (
    <div className="flex items-start gap-3">
      <EkthosAvatar />
      <div className="bg-white border border-black/[0.07] rounded-3xl rounded-tl-xl px-5 py-4">
        <div className="flex gap-1.5 items-center h-5">
          {[0, 1, 2].map(i => (
            <div key={i} className="w-2 h-2 rounded-full animate-bounce"
              style={{ background: 'var(--color-primary)', animationDelay: `${i * 140}ms` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Barra de progresso ─────────────────────────────────────

function ProgressBar({ questionNumber, totalQuestions }: { questionNumber: number; totalQuestions: number }) {
  const pct = Math.round(((questionNumber - 1) / totalQuestions) * 100)
  return (
    <div className="px-6 py-4 border-b border-black/[0.06] bg-white shrink-0">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-xs font-semibold text-gray-700">Pergunta {questionNumber} de {totalQuestions}</span>
        <span className="text-xs font-bold tabular-nums" style={{ color: 'var(--color-primary)' }}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border-default)' }}>
        <div className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: 'var(--color-primary)' }} />
      </div>
    </div>
  )
}

// ── Preview lateral ────────────────────────────────────────

interface PreviewState {
  pipeline:       string[]
  departments:    string[]
  agents:         string[]
  cells:          number
  logoUrl:        string | null
  primaryColor:   string | null
  secondaryColor: string | null
}

function OnboardingPreview({ preview }: { preview: PreviewState }) {
  const hasContent =
    preview.pipeline.length > 0 || preview.departments.length > 0 ||
    preview.cells > 0 || preview.agents.length > 0 ||
    preview.logoUrl !== null || preview.primaryColor !== null

  if (!hasContent) {
    return (
      <div className="hidden lg:flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 text-2xl"
          style={{ background: 'rgba(225,53,0,0.08)' }}>✦</div>
        <p className="text-sm font-semibold text-gray-700 mb-1">Em configuração</p>
        <p className="text-xs text-gray-400 leading-relaxed max-w-[160px]">
          À medida que conversamos, vou montando o perfil da sua igreja aqui.
        </p>
      </div>
    )
  }

  return (
    <div className="hidden lg:flex flex-col gap-3 p-5 overflow-y-auto">
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Em configuração</p>

      {(preview.logoUrl || preview.primaryColor) && (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">Identidade Visual</p>
          {preview.logoUrl && (
            <img src={preview.logoUrl} alt="Logo" className="h-10 w-auto object-contain mb-2 rounded" />
          )}
          {preview.primaryColor && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full border border-black/10 shrink-0" style={{ background: preview.primaryColor }} />
              {preview.secondaryColor && (
                <div className="w-6 h-6 rounded-full border border-black/10 shrink-0" style={{ background: preview.secondaryColor }} />
              )}
              <span className="text-[11px] text-gray-500">{preview.primaryColor}</span>
            </div>
          )}
        </div>
      )}

      {preview.pipeline.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">Caminho de discipulado</p>
          <div className="flex flex-wrap gap-1.5">
            {preview.pipeline.map((s, i) => (
              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full text-white font-medium"
                style={{ background: `hsl(${14 + i * 22}, 72%, ${47 - i * 2}%)` }}>{s}</span>
            ))}
          </div>
        </div>
      )}

      {preview.departments.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">Ministérios</p>
          <div className="flex flex-wrap gap-1.5">
            {preview.departments.map((d, i) => (
              <span key={i} className="text-[11px] px-2.5 py-1 rounded-full font-medium"
                style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}>{d}</span>
            ))}
          </div>
        </div>
      )}

      {preview.cells > 0 && (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Células</p>
          <p className="text-3xl font-bold mt-1" style={{ color: 'var(--color-primary)' }}>{preview.cells}</p>
        </div>
      )}

      {preview.agents.length > 0 && (
        <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2.5">Agentes selecionados</p>
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

// ── Widget: confirmação de cores extraídas do logo ─────────
// Aparece APÓS o upload, ANTES de enviar ao consultant.
// O pastor confirma as cores detectadas ou escolhe outra paleta.

function ColorConfirmWidget({
  logoUrl,
  primaryColor,
  secondaryColor,
  onConfirm,
  onChooseOther,
}: {
  logoUrl:       string
  primaryColor:  string
  secondaryColor: string
  onConfirm:     () => void
  onChooseOther: () => void
}) {
  return (
    <div className="px-5 py-4 bg-white border-t border-black/[0.06] space-y-3">
      <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: '#F9EEDC' }}>
        <img src={logoUrl} alt="Logo enviado" className="h-10 w-auto object-contain rounded shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-gray-700 mb-1">Cores extraídas do logo</p>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full border border-black/10" style={{ background: primaryColor }} title={primaryColor} />
            <div className="w-5 h-5 rounded-full border border-black/10" style={{ background: secondaryColor }} title={secondaryColor} />
            <span className="text-[11px] text-gray-500">{primaryColor}</span>
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
          style={{ background: 'var(--color-primary)' }}
        >
          <Check size={14} strokeWidth={2.5} />
          Usar estas cores
        </button>
        <button
          onClick={onChooseOther}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all hover:border-gray-400"
          style={{ borderColor: '#E8E8E8', color: '#5A5A5A', background: '#FAFAFA' }}
        >
          Escolher outra paleta
        </button>
      </div>
    </div>
  )
}

// ── Widget: paleta de override (logo já enviado, mas quer mudar cor) ──

function ColorOverrideWidget({
  logoUrl,
  onSelect,
}: {
  logoUrl:   string
  onSelect:  (primary: string, secondary: string) => void
}) {
  return (
    <div className="px-5 py-4 bg-white border-t border-black/[0.06]">
      <p className="text-xs font-semibold text-gray-500 mb-3">Escolha a paleta para usar com o logo:</p>
      <div className="grid grid-cols-2 gap-2">
        {COLOR_PALETTES.map(p => (
          <button
            key={p.label}
            onClick={() => onSelect(p.primary, p.secondary)}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all hover:border-gray-400 active:scale-[0.98]"
            style={{ borderColor: '#E8E8E8', background: '#FAFAFA' }}
          >
            <div className="flex gap-1 shrink-0">
              <div className="w-5 h-5 rounded-full border border-black/10" style={{ background: p.primary }} />
              <div className="w-5 h-5 rounded-full border border-black/10" style={{ background: p.secondary }} />
            </div>
            <p className="text-[12px] font-semibold text-gray-700 truncate">{p.emoji} {p.label}</p>
          </button>
        ))}
      </div>
      {/* Mostrar logo escolhido */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-black/[0.06]">
        <img src={logoUrl} alt="Logo" className="h-6 w-auto object-contain rounded opacity-70" />
        <p className="text-[11px] text-gray-400">A logo enviada será mantida com as novas cores.</p>
      </div>
    </div>
  )
}

// ── Widget dinâmico ────────────────────────────────────────

interface DynamicWidgetProps {
  widget:       InputWidget
  onSelect:     (value: string) => void
  onUpload:     (e: React.ChangeEvent<HTMLInputElement>) => void
  uploadLabel:  string | null
  uploading:    boolean
}

function DynamicWidget({ widget, onSelect, onUpload, uploadLabel, uploading }: DynamicWidgetProps) {
  const [selected, setSelected] = useState<string[]>([])

  if (widget.type === 'upload') {
    return (
      <div className="px-5 py-3 bg-white border-t border-black/[0.06] space-y-2">
        <label
          className={`flex items-center gap-3 cursor-pointer rounded-2xl border border-dashed px-4 py-3 transition-colors ${uploading ? 'opacity-50 pointer-events-none' : 'hover:border-[#E13500]'}`}
          style={{ borderColor: '#DDD', background: '#FAFAFA' }}
        >
          {uploading
            ? <Loader size={18} strokeWidth={1.75} style={{ color: 'var(--color-primary)' }} className="animate-spin" />
            : <Upload size={18} strokeWidth={1.75} style={{ color: 'var(--color-primary)' }} />
          }
          <span className="text-sm text-gray-600 flex-1">
            {uploading ? 'Enviando logo...' : (uploadLabel ?? 'Clique para enviar a logo da sua igreja')}
          </span>
          <input type="file" className="hidden"
            accept={widget.accept ?? '.png,.jpg,.jpeg,.svg,.webp'}
            onChange={onUpload} disabled={uploading} />
        </label>
        {widget.optional && !uploading && (
          <button
            onClick={() => onSelect('sem_logo')}
            className="w-full text-xs text-gray-400 hover:text-gray-600 transition-colors py-1"
          >
            {widget.skip_label ?? 'Pular esta etapa'}
          </button>
        )}
      </div>
    )
  }

  if (widget.type === 'color_palette' && widget.palettes) {
    return (
      <div className="px-5 py-4 bg-white border-t border-black/[0.06]">
        <div className="grid grid-cols-2 gap-2">
          {widget.palettes.map(p => (
            <button
              key={p.label}
              onClick={() => onSelect(`${p.primary}|${p.secondary}`)}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all hover:border-gray-400 active:scale-[0.98]"
              style={{ borderColor: '#E8E8E8', background: '#FAFAFA' }}
            >
              <div className="flex gap-1 shrink-0">
                <div className="w-5 h-5 rounded-full border border-black/10" style={{ background: p.primary }} />
                <div className="w-5 h-5 rounded-full border border-black/10" style={{ background: p.secondary }} />
              </div>
              <p className="text-[12px] font-semibold text-gray-700 truncate">{p.emoji} {p.label}</p>
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (widget.type === 'select' && widget.options) {
    return (
      <div className="px-5 py-3 bg-white border-t border-black/[0.06]">
        <div className="flex flex-wrap gap-2">
          {widget.options.map(opt => (
            <button key={opt} onClick={() => onSelect(opt)}
              className="text-sm px-4 py-2 rounded-xl border font-medium transition-all hover:border-[#E13500] hover:text-[#E13500]"
              style={{ borderColor: '#E8E8E8', color: '#5A5A5A', background: '#FAFAFA' }}>
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
            <button key={opt}
              onClick={() => {
                const next = selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]
                setSelected(next)
              }}
              className="text-sm px-3.5 py-1.5 rounded-full border font-medium transition-all"
              style={{
                background:  selected.includes(opt) ? '#E13500' : '#FAFAFA',
                color:       selected.includes(opt) ? 'white' : '#5A5A5A',
                borderColor: selected.includes(opt) ? '#E13500' : '#E8E8E8',
              }}>
              {opt}
            </button>
          ))}
          {selected.length > 0 && (
            <button
              onClick={() => { onSelect(selected.join(', ')); setSelected([]) }}
              className="text-sm px-4 py-1.5 rounded-full font-semibold text-white"
              style={{ background: '#2D7A4F' }}>
              Confirmar ({selected.length})
            </button>
          )}
        </div>
      </div>
    )
  }

  return null
}

// ── Página principal ───────────────────────────────────────

export default function Onboarding() {
  const navigate = useNavigate()
  // planSlug é carregado da subscription da igreja no banco
  const [planSlug, setPlanSlug] = useState('')

  const [messages,          setMessages]          = useState<Message[]>([])
  const [input,             setInput]             = useState('')
  const [loading,           setLoading]           = useState(false)
  const [uploading,         setUploading]         = useState(false)
  const [sessionId,         setSessionId]         = useState<string | null>(null)
  const [blockIndex,        setBlockIndex]        = useState(1)
  const [totalQuestions,    setTotalQuestions]    = useState(22)
  const [isComplete,        setIsComplete]        = useState(false)
  const [configJson,        setConfigJson]        = useState<unknown>(null)
  const [preview,           setPreview]           = useState<PreviewState>({
    pipeline: [], departments: [], agents: [], cells: 0,
    logoUrl: null, primaryColor: null, secondaryColor: null,
  })
  const [uploadLabel,       setUploadLabel]       = useState<string | null>(null)
  const [streamingContent,  setStreamingContent]  = useState<string | null>(null)
  const [userInitial,       setUserInitial]       = useState('')
  const [currentWidget,     setCurrentWidget]     = useState<InputWidget | null>(null)
  const [, setCurrentQuestionId] = useState<string | null>(null)

  // Estado intermediário de confirmação de cores do logo
  const [logoConfirm,      setLogoConfirm]      = useState<LogoConfirmState | null>(null)
  const [showColorOverride, setShowColorOverride] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef       = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setMessages([{
      role:      'assistant',
      content:   `Olá! Seja muito bem-vindo à Ekthos! 🙏\n\nSou seu Consultor de Onboarding — estou aqui para personalizar o CRM da sua igreja com atenção a cada detalhe da sua operação pastoral.\n\nVamos começar: qual é o nome completo da sua igreja?`,
      timestamp: new Date(),
    }])
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email) setUserInitial(session.user.email[0].toUpperCase())
    })
  }, [])

  // Carrega planSlug da subscription da igreja (definido via Stripe webhook em produção)
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate('/login'); return }
      const churchId = session.user.app_metadata?.church_id as string | undefined
      if (!churchId) { setPlanSlug('chamado'); return }
      const { data } = await supabase
        .from('subscriptions')
        .select('plan_slug')
        .eq('church_id', churchId)
        .maybeSingle()
      setPlanSlug((data?.plan_slug as string | null) ?? 'chamado')
    })
  }, [navigate])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, streamingContent, logoConfirm])

  async function sendMessage(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return

    const isUndo = content === '__UNDO__'
    setInput('')
    setCurrentWidget(null)
    setCurrentQuestionId(null)
    setLogoConfirm(null)
    setShowColorOverride(false)
    if (!isUndo) {
      setMessages(prev => [...prev, { role: 'user', content, timestamp: new Date() }])
    }
    setLoading(true)
    setStreamingContent('')

    let finalText = ''

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/login'); return }

      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

      const res = await fetch(`${SUPABASE_URL}/functions/v1/onboarding-consultant`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, session_id: sessionId, plan_slug: planSlug }),
      })

      if (!res.ok || !res.body) {
        let errMsg = 'Erro na comunicação com o consultor'
        try { const b = await res.json() as { error?: string }; if (b.error) errMsg = b.error } catch { /**/ }
        throw new Error(errMsg)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

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
              widget?:          {
                type:        'select_one' | 'select_many' | 'upload' | 'color_palette'
                options?:    string[]
                palettes?:   ColorPaletteOption[]
                accept?:     string
                optional?:   boolean
                skip_label?: string
              } | null
              question_id?: string
            }

            if (evt.type === 'token' && evt.content) {
              finalText += evt.content
              setStreamingContent(prev => (prev ?? '') + evt.content!)

            } else if (evt.type === 'done') {
              if (evt.session_id)      setSessionId(evt.session_id)
              if (evt.question_number) setBlockIndex(evt.question_number)
              if (evt.total_questions) setTotalQuestions(evt.total_questions)
              if (evt.question_id)     setCurrentQuestionId(evt.question_id)

              if (evt.widget !== undefined) {
                if (!evt.widget) {
                  setCurrentWidget(null)
                } else {
                  const wType = evt.widget.type === 'select_one'   ? 'select'
                              : evt.widget.type === 'select_many'  ? 'multiselect'
                              : evt.widget.type
                  setCurrentWidget({
                    type:       wType as InputWidget['type'],
                    label:      '',
                    options:    evt.widget.options,
                    palettes:   evt.widget.palettes,
                    accept:     evt.widget.accept,
                    optional:   evt.widget.optional,
                    skip_label: evt.widget.skip_label,
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
            if (!(parseErr instanceof SyntaxError)) throw parseErr
          }
        }
      }

      setMessages(prev => [...prev, { role: 'assistant', content: finalText, timestamp: new Date() }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Desculpe, tive uma dificuldade técnica. Por favor, tente novamente.',
        timestamp: new Date(),
      }])
    } finally {
      setStreamingContent(null)
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  // Envia logo + cores confirmadas ao consultant
  function confirmLogoColors(primary: string, secondary: string) {
    if (!logoConfirm) return
    // Atualiza preview
    setPreview(prev => ({ ...prev, primaryColor: primary, secondaryColor: secondary }))
    // Formato: url|||primary|||secondary
    void sendMessage(`${logoConfirm.logoUrl}|||${primary}|||${secondary}`)
  }

  function updatePreviewFromConfig(config: unknown) {
    const c           = config as Record<string, unknown>
    const pipeline    = ((c.pipeline as Record<string, unknown>)?.stages as Array<Record<string, unknown>>)?.map(s => String(s.name)) ?? []
    const departments = (c.departments as Array<Record<string, unknown>>)?.map(d => String(d.name)) ?? []
    const cells       = ((c.cell_network as Record<string, unknown>)?.total_cells as number) ?? 0
    const tenant      = (c.tenant as Record<string, unknown>) ?? {}
    const agentSlugs  = [
      ...((c.agents as Record<string, unknown>)?.included_in_plan as string[] ?? []),
      ...((c.agents as Record<string, unknown>)?.purchased         as string[] ?? []),
    ]
    setPreview(prev => ({
      ...prev,
      pipeline,
      departments,
      cells,
      agents:        agentSlugs.map(s => s.replace('agent-', '').replace(/-/g, ' ')),
      logoUrl:       (tenant.logo_url as string | null) ?? prev.logoUrl,
      primaryColor:  (tenant.primary_color as string | null) ?? prev.primaryColor,
      secondaryColor:(tenant.secondary_color as string | null) ?? prev.secondaryColor,
    }))
  }

  function startConfiguration() {
    if (!sessionId || !configJson) return
    navigate(`/onboarding/configuring?session_id=${sessionId}`)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage() }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadLabel(file.name)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { navigate('/login'); return }

      // 1. Upload para Supabase Storage (bucket church-logos, público)
      const ext  = file.name.split('.').pop() ?? 'png'
      const path = `${session.user.id}/${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage
        .from('church-logos')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) throw new Error(`Erro no upload: ${uploadError.message}`)

      const { data: { publicUrl } } = supabase.storage.from('church-logos').getPublicUrl(path)

      // 2. Extrai cores via Canvas API
      const colors = await extractDominantColors(file)

      // 3. Atualiza preview do logo no painel lateral
      setPreview(prev => ({
        ...prev,
        logoUrl:       publicUrl,
        primaryColor:  colors.primary,
        secondaryColor: colors.secondary,
      }))

      // 4. Guarda estado intermediário — exibe confirmação de cores antes de enviar ao consultant
      setLogoConfirm({ logoUrl: publicUrl, primaryColor: colors.primary, secondaryColor: colors.secondary })
      setCurrentWidget(null) // esconde widget de upload enquanto confirma cores

    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? 'Erro no upload'
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Não consegui enviar a logo: ${msg}. Você pode tentar novamente ou pular esta etapa.`,
        timestamp: new Date(),
      }])
      setUploadLabel(null)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  // ── Qual widget exibir ─────────────────────────────────────
  //  Prioridade: logoConfirm > showColorOverride > currentWidget
  const showingLogoConfirm   = !!logoConfirm && !showColorOverride
  const showingColorOverride = !!logoConfirm && showColorOverride
  const showingNormalWidget  = !logoConfirm && !!currentWidget

  return (
    <div className="h-screen flex flex-col" style={{ background: '#F9EEDC' }}>

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-black/[0.06] shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-sm"
            style={{ background: 'var(--color-primary)' }}>E</div>
          <div className="leading-none">
            <span className="font-semibold text-gray-900 text-sm">Ekthos</span>
            <span className="text-gray-300 text-sm"> · </span>
            <span className="text-gray-500 text-sm">Configuração da sua igreja</span>
          </div>
        </div>
        <span className="text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{ background: 'rgba(225,53,0,0.08)', color: 'var(--color-primary)' }}>
          Configuração
        </span>
      </div>

      <ProgressBar questionNumber={blockIndex} totalQuestions={totalQuestions} />

      <div className="flex-1 flex overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col min-w-0">

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto px-6 py-8 space-y-6">
            {messages.map((msg, i) => <MessageBubble key={i} msg={msg} userInitial={userInitial} />)}
            {loading && (
              streamingContent !== null && streamingContent.length > 0
                ? <StreamingBubble content={streamingContent} />
                : <LoadingDots />
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* ── Widget de confirmação de cores do logo ── */}
          {!isComplete && !loading && showingLogoConfirm && logoConfirm && (
            <ColorConfirmWidget
              logoUrl={logoConfirm.logoUrl}
              primaryColor={logoConfirm.primaryColor}
              secondaryColor={logoConfirm.secondaryColor}
              onConfirm={() => confirmLogoColors(logoConfirm.primaryColor, logoConfirm.secondaryColor)}
              onChooseOther={() => setShowColorOverride(true)}
            />
          )}

          {/* ── Widget de paleta alternativa (logo já enviado) ── */}
          {!isComplete && !loading && showingColorOverride && logoConfirm && (
            <ColorOverrideWidget
              logoUrl={logoConfirm.logoUrl}
              onSelect={(primary, secondary) => confirmLogoColors(primary, secondary)}
            />
          )}

          {/* ── Widget normal do consultant ── */}
          {!isComplete && !loading && showingNormalWidget && currentWidget && (
            <DynamicWidget
              widget={currentWidget}
              onSelect={v => sendMessage(v)}
              onUpload={handleFileUpload}
              uploadLabel={uploadLabel}
              uploading={uploading}
            />
          )}

          {/* Botão de finalizar */}
          {isComplete && (
            <div className="px-6 py-4 bg-white border-t border-black/[0.06] shrink-0">
              <button
                onClick={startConfiguration}
                className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-white text-base transition-all hover:opacity-90 active:scale-[0.99]"
                style={{ background: 'var(--color-primary)' }}
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
          {!isComplete && !showingLogoConfirm && !showingColorOverride && (
            <div className="px-5 py-4 bg-white border-t border-black/[0.06] shrink-0">
              <div className="flex gap-3 items-end">
                {/* BUG 1: botão voltar */}
                <button
                  onClick={() => sendMessage('__UNDO__')}
                  disabled={loading || uploading || blockIndex <= 1}
                  title="Voltar à pergunta anterior"
                  className="w-11 h-11 flex items-center justify-center rounded-xl border transition-all hover:border-[#E13500] hover:text-[#E13500] disabled:opacity-30 shrink-0"
                  style={{ borderColor: '#E8E8E8', color: '#5A5A5A', background: '#FAFAFA' }}
                >
                  <ArrowLeft size={18} strokeWidth={1.75} />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escreva sua resposta... (Enter para enviar)"
                  rows={2}
                  disabled={loading || uploading}
                  className="flex-1 resize-none px-4 py-3 rounded-2xl border text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-transparent transition-all disabled:opacity-50"
                  style={{ borderColor: '#E8E8E8', background: '#FAFAFA' }}
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={loading || uploading || !input.trim()}
                  className="w-11 h-11 flex items-center justify-center rounded-xl text-white transition-all hover:opacity-90 disabled:opacity-40 shrink-0"
                  style={{ background: 'var(--color-primary)' }}
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
        <div className="w-72 border-l border-black/[0.06] hidden lg:block overflow-y-auto"
          style={{ background: '#F9EEDC' }}>
          <OnboardingPreview preview={preview} />
        </div>
      </div>
    </div>
  )
}
