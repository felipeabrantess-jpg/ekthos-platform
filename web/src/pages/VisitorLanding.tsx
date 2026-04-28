/**
 * VisitorLanding.tsx — /visita/:slug
 *
 * Página pública de captura de visitantes via QR Code físico.
 * Frente B — mobile-first P0 (375px base).
 *
 * - Sem autenticação obrigatória
 * - Form: nome, telefone (máscara BR), email (opcional), quem convidou (opcional)
 * - POST /functions/v1/visitor-capture
 * - Tela de sucesso pós-submit
 */

import { useState, useEffect } from 'react'
import { useParams }           from 'react-router-dom'

// ── Tipos ────────────────────────────────────────────────────

interface ChurchPublicData {
  name:                   string
  logo_url:               string | null
  primary_color:          string | null
  whatsapp_number_display: string | null
}

interface FormState {
  name:           string
  phone:          string
  email:          string
  invited_by_name: string
}

// ── Constantes ───────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const EF_BASE      = `${SUPABASE_URL}/functions/v1`

const PHONE_REGEX     = /^\(\d{2}\)\s\d{4,5}-\d{4}$/  // (XX) XXXXX-XXXX
const EMAIL_REGEX     = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Máscara de telefone BR ───────────────────────────────────

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0)  return ''
  if (digits.length <= 2)   return `(${digits}`
  if (digits.length <= 6)   return `(${digits.slice(0,2)}) ${digits.slice(2)}`
  if (digits.length <= 10)  return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
}

// ── Componente principal ────────────────────────────────────

export default function VisitorLanding() {
  const { slug } = useParams<{ slug: string }>()

  const [church,    setChurch]    = useState<ChurchPublicData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [notFound,  setNotFound]  = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submitting,setSubmitting]= useState(false)
  const [errors,    setErrors]    = useState<Partial<FormState>>({})

  const [form, setForm] = useState<FormState>({
    name:            '',
    phone:           '',
    email:           '',
    invited_by_name: '',
  })

  // ── Buscar dados públicos da church ──────────────────────
  useEffect(() => {
    if (!slug) { setNotFound(true); setLoading(false); return }

    void (async () => {
      try {
        const res = await fetch(
          `${EF_BASE}/church-public?slug=${encodeURIComponent(slug)}`
        )
        const data = await res.json() as {
          found: boolean
          name?: string
          logo_url?: string | null
          primary_color?: string | null
          whatsapp_number_display?: string | null
        }

        if (!data.found) {
          setNotFound(true)
        } else {
          setChurch({
            name:                    data.name ?? '',
            logo_url:                data.logo_url ?? null,
            primary_color:           data.primary_color ?? null,
            whatsapp_number_display: data.whatsapp_number_display ?? null,
          })
        }
      } catch {
        setNotFound(true)
      } finally {
        setLoading(false)
      }
    })()
  }, [slug])

  // ── Handlers ─────────────────────────────────────────────

  function handleChange(field: keyof FormState, raw: string) {
    const value = field === 'phone' ? maskPhone(raw) : raw
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function validate(): boolean {
    const errs: Partial<FormState> = {}
    if (!form.name.trim() || form.name.trim().length < 3)
      errs.name = 'Informe seu nome completo (mínimo 3 caracteres)'
    if (!PHONE_REGEX.test(form.phone))
      errs.phone = 'Telefone inválido. Ex: (11) 98765-4321'
    if (form.email && !EMAIL_REGEX.test(form.email))
      errs.email = 'Email inválido'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate() || submitting) return

    setSubmitting(true)
    try {
      await fetch(`${EF_BASE}/visitor-capture`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          slug,
          name:            form.name.trim(),
          phone:           form.phone,
          email:           form.email.trim() || undefined,
          invited_by_name: form.invited_by_name.trim() || undefined,
        }),
      })
      // A EF sempre retorna 200, independente do resultado interno
      setSubmitted(true)
    } catch {
      // Mesmo em erro de rede, mostramos sucesso (melhor UX + segurança)
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Brand color ──────────────────────────────────────────
  const brandColor = church?.primary_color ?? '#4F46E5'

  // ── Estados de loading / not found ──────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#faf8f5]">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: `${brandColor}40`, borderTopColor: brandColor }}
        />
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#faf8f5] px-6 text-center">
        <p className="text-4xl mb-3">🙏</p>
        <h1 className="font-display text-xl font-bold text-gray-800 mb-2">
          Link não encontrado
        </h1>
        <p className="text-sm text-gray-500">
          Este QR Code não está ativo. Fale com um líder da sua igreja.
        </p>
      </div>
    )
  }

  // ── Tela de sucesso ──────────────────────────────────────

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#faf8f5] px-6">
        <div className="w-full max-w-[480px] mx-auto text-center">
          {/* Ícone de check */}
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: `${brandColor}15` }}
          >
            <svg
              className="w-8 h-8"
              style={{ color: brandColor }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1
            className="font-display text-2xl font-bold text-gray-900 mb-2"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Recebemos seu cadastro! 🙏
          </h1>

          <p className="text-sm text-gray-500 leading-relaxed">
            Em alguns minutos, alguém de{' '}
            <span className="font-medium text-gray-700">{church?.name}</span>{' '}
            vai entrar em contato com você.
          </p>

          {/* Botão wa.me — exibido apenas se a church configurou o número público */}
          {church?.whatsapp_number_display && (
            <a
              href={`https://wa.me/${church.whatsapp_number_display}?text=${encodeURIComponent(
                `Ol\u00e1! Acabei de visitar ${church.name ?? 'a igreja'}. Gostaria de saber mais!`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center justify-center gap-2 h-11 px-6 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80"
              style={{ backgroundColor: '#25D366' }}
            >
              {/* Ícone WhatsApp SVG inline — sem dependência de lucide */}
              <svg
                className="w-5 h-5 shrink-0"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Falar com a {church.name ?? 'Igreja'}
            </a>
          )}

          <p className="text-xs text-gray-400 mt-6">
            Seja muito bem-vindo(a)! Que a sua visita seja especial. ✨
          </p>
        </div>
      </div>
    )
  }

  // ── Formulário ───────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col items-center justify-start px-4 pt-8 pb-12">
      <div className="w-full max-w-[480px] mx-auto">

        {/* Header da church */}
        <div className="flex flex-col items-center mb-6 gap-3">
          {church?.logo_url ? (
            <img
              src={church.logo_url}
              alt={church.name}
              className="w-16 h-16 rounded-full object-cover"
            />
          ) : (
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center text-white text-2xl font-bold"
              style={{ backgroundColor: brandColor }}
            >
              {church?.name?.charAt(0).toUpperCase() ?? '✝'}
            </div>
          )}
          <h2
            className="text-base font-semibold text-gray-700 text-center"
            style={{ fontFamily: '"DM Sans", sans-serif' }}
          >
            {church?.name}
          </h2>
        </div>

        {/* Card do formulário */}
        <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-6">
          <h1
            className="text-xl font-bold text-gray-900 mb-1 text-center"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Olá! Que bom ter você aqui.
          </h1>
          <p className="text-sm text-gray-500 text-center mb-5">
            Preencha rapidinho pra gente te conhecer melhor.
          </p>

          <form onSubmit={e => void handleSubmit(e)} noValidate className="space-y-4">

            {/* Nome */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nome completo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                autoComplete="given-name"
                placeholder="Seu nome"
                value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                className={`w-full h-12 px-4 rounded-xl border text-base bg-white focus:outline-none focus:ring-2 transition-colors ${
                  errors.name
                    ? 'border-red-300 focus:ring-red-200'
                    : 'border-gray-200 focus:ring-indigo-100 focus:border-indigo-300'
                }`}
                style={{ fontSize: '16px' /* evita zoom no iOS */ }}
              />
              {errors.name && (
                <p className="text-xs text-red-500 mt-1">{errors.name}</p>
              )}
            </div>

            {/* Telefone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                WhatsApp / Telefone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="(11) 98765-4321"
                value={form.phone}
                onChange={e => handleChange('phone', e.target.value)}
                className={`w-full h-12 px-4 rounded-xl border text-base bg-white focus:outline-none focus:ring-2 transition-colors ${
                  errors.phone
                    ? 'border-red-300 focus:ring-red-200'
                    : 'border-gray-200 focus:ring-indigo-100 focus:border-indigo-300'
                }`}
                style={{ fontSize: '16px' }}
              />
              {errors.phone && (
                <p className="text-xs text-red-500 mt-1">{errors.phone}</p>
              )}
            </div>

            {/* Email (opcional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                value={form.email}
                onChange={e => handleChange('email', e.target.value)}
                className={`w-full h-12 px-4 rounded-xl border text-base bg-white focus:outline-none focus:ring-2 transition-colors ${
                  errors.email
                    ? 'border-red-300 focus:ring-red-200'
                    : 'border-gray-200 focus:ring-indigo-100 focus:border-indigo-300'
                }`}
                style={{ fontSize: '16px' }}
              />
              {errors.email && (
                <p className="text-xs text-red-500 mt-1">{errors.email}</p>
              )}
            </div>

            {/* Quem convidou (opcional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Quem te convidou? <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                autoComplete="off"
                placeholder="Nome de quem te trouxe"
                value={form.invited_by_name}
                onChange={e => handleChange('invited_by_name', e.target.value)}
                className="w-full h-12 px-4 rounded-xl border border-gray-200 text-base bg-white focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 transition-colors"
                style={{ fontSize: '16px' }}
              />
            </div>

            {/* Botão submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl text-white font-semibold text-base transition-opacity disabled:opacity-60 mt-2"
              style={{ backgroundColor: brandColor }}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin"
                  />
                  Enviando...
                </span>
              ) : (
                'Enviar'
              )}
            </button>

          </form>
        </div>

        {/* Footer LGPD */}
        <p className="text-xs text-gray-400 text-center mt-4 px-4">
          Seus dados são protegidos pela LGPD e usados apenas por{' '}
          {church?.name ?? 'esta igreja'}.
        </p>

      </div>
    </div>
  )
}
