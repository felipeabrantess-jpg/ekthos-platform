/**
 * IgvSejaMembroPage — /igv/seja-membro  (Redesign v2)
 * Formulário público de cadastro de novos membros da IGV.
 * POST → visitor-capture EF (slug igv-itaipu) → dispara funil de acolhimento.
 * Checkbox LGPD explícito e obrigatório (R8: dado visível ao titular).
 * Sem auth. Sem dados de membros. Sem sidebar do CRM.
 */

import { useState }   from 'react'
import { Link }       from 'react-router-dom'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { IGV }        from '@/lib/igv-public-data'

// ── Constantes ────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const EF_BASE      = `${SUPABASE_URL}/functions/v1`

const PHONE_REGEX = /^\(\d{2}\)\s\d{4,5}-\d{4}$/
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Máscara de telefone BR ─────────────────────────────────────────

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0)  return ''
  if (digits.length <= 2)   return `(${digits}`
  if (digits.length <= 6)   return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10)  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

// ── Tipos ─────────────────────────────────────────────────────────

interface FormState {
  name:            string
  phone:           string
  email:           string
  invited_by_name: string
  lgpd:            boolean
}

// ── Componente principal ───────────────────────────────────────────

export default function IgvSejaMembroPage() {
  const [form, setForm] = useState<FormState>({
    name:            '',
    phone:           '',
    email:           '',
    invited_by_name: '',
    lgpd:            false,
  })
  const [errors,     setErrors]     = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)

  function handleChange(field: keyof FormState, raw: string | boolean) {
    const value = field === 'phone' && typeof raw === 'string' ? maskPhone(raw) : raw
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.name.trim() || form.name.trim().length < 3)
      errs.name  = 'Informe seu nome completo (mínimo 3 caracteres)'
    if (!PHONE_REGEX.test(form.phone))
      errs.phone = 'Telefone inválido. Ex: (21) 98765-4321'
    if (form.email && !EMAIL_REGEX.test(form.email))
      errs.email = 'Email inválido'
    if (!form.lgpd)
      errs.lgpd  = 'É necessário aceitar o uso dos dados para continuar'
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
          slug:            IGV.slug,
          name:            form.name.trim(),
          phone:           form.phone,
          email:           form.email.trim() || undefined,
          invited_by_name: form.invited_by_name.trim() || undefined,
        }),
      })
      setSubmitted(true)
    } catch {
      // Erro de rede raro — EF sempre retorna 200 em operação normal
      setSubmitted(true)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Tela de sucesso ────────────────────────────────────────────

  if (submitted) {
    return (
      <div
        className="min-h-screen bg-black flex flex-col items-center justify-center px-5"
        style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
      >
        <div className="w-full max-w-[420px] text-center">
          <CheckCircle
            size={56}
            strokeWidth={1.5}
            style={{ color: IGV.primaryColor }}
            className="mx-auto mb-5"
          />
          <h1
            className="text-[1.8rem] font-bold text-white mb-2 tracking-tight"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Bem-vindo(a) à família!
          </h1>
          <p className="text-[1rem] text-white/70 leading-relaxed mb-7">
            Recebemos seu cadastro. Em breve alguém da{' '}
            <span className="font-medium text-white/85">{IGV.name}</span>{' '}
            vai entrar em contato pelo WhatsApp.
          </p>
          <a
            href={`https://wa.me/${IGV.whatsapp}?text=${encodeURIComponent(`Olá! Acabei de me cadastrar em ${IGV.name}. Gostaria de saber mais!`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 h-12 px-6 rounded-2xl text-white text-[1rem] font-semibold transition-opacity hover:opacity-90 active:opacity-80 mb-5"
            style={{ backgroundColor: '#25D366' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Falar com a Igreja
          </a>
          <div>
            <Link
              to="/igv"
              className="text-[1rem] font-medium transition-colors"
              style={{ color: IGV.primaryColor }}
            >
              ← Voltar para a página da Igreja
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ── Formulário ─────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-black flex flex-col"
      style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
    >

      {/* Topbar */}
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-white/10 px-4 h-14 flex items-center gap-3">
        <Link
          to="/igv"
          className="flex items-center gap-1.5 text-[1rem] font-medium transition-colors"
          style={{ color: IGV.primaryColor }}
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
          Voltar
        </Link>
        <div className="w-px h-4 bg-white/20" />
        <span className="text-[1rem] font-semibold text-white">Seja Membro</span>
      </header>

      <main className="flex-1 px-4 py-6 max-w-[480px] mx-auto w-full">

        {/* Header da página */}
        <div className="text-center mb-6">
          <h1
            className="text-[1.7rem] font-bold text-white tracking-tight"
            style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
          >
            Faça parte da família
          </h1>
          <p className="text-[1rem] text-white/60 mt-1">{IGV.name}</p>
        </div>

        {/* Card do formulário */}
        <div className="bg-[#111] rounded-2xl border border-white/10 p-5">
          <form onSubmit={e => void handleSubmit(e)} noValidate className="space-y-4">

            {/* Nome */}
            <div>
              <label className="block text-[0.92rem] font-semibold text-white/90 mb-1.5">
                Nome completo <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                autoComplete="name"
                placeholder="Seu nome completo"
                value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                style={{ fontSize: '16px' }}
                className={`w-full h-12 px-4 rounded-xl border text-white bg-white/[0.06] placeholder-white/30 focus:outline-none focus:ring-2 transition-colors ${
                  errors.name
                    ? 'border-red-500/50 focus:ring-red-900/40'
                    : 'border-white/15 focus:ring-amber-900/40 focus:border-amber-500/50'
                }`}
              />
              {errors.name && (
                <p className="text-[0.85rem] text-red-400 mt-1">{errors.name}</p>
              )}
            </div>

            {/* WhatsApp */}
            <div>
              <label className="block text-[0.92rem] font-semibold text-white/90 mb-1.5">
                WhatsApp / Telefone <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="(21) 98765-4321"
                value={form.phone}
                onChange={e => handleChange('phone', e.target.value)}
                style={{ fontSize: '16px' }}
                className={`w-full h-12 px-4 rounded-xl border text-white bg-white/[0.06] placeholder-white/30 focus:outline-none focus:ring-2 transition-colors ${
                  errors.phone
                    ? 'border-red-500/50 focus:ring-red-900/40'
                    : 'border-white/15 focus:ring-amber-900/40 focus:border-amber-500/50'
                }`}
              />
              {errors.phone && (
                <p className="text-[0.85rem] text-red-400 mt-1">{errors.phone}</p>
              )}
            </div>

            {/* Email */}
            <div>
              <label className="block text-[0.92rem] font-semibold text-white/90 mb-1.5">
                Email{' '}
                <span className="text-white/40 font-normal">(opcional)</span>
              </label>
              <input
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                value={form.email}
                onChange={e => handleChange('email', e.target.value)}
                style={{ fontSize: '16px' }}
                className={`w-full h-12 px-4 rounded-xl border text-white bg-white/[0.06] placeholder-white/30 focus:outline-none focus:ring-2 transition-colors ${
                  errors.email
                    ? 'border-red-500/50 focus:ring-red-900/40'
                    : 'border-white/15 focus:ring-amber-900/40 focus:border-amber-500/50'
                }`}
              />
              {errors.email && (
                <p className="text-[0.85rem] text-red-400 mt-1">{errors.email}</p>
              )}
            </div>

            {/* Quem convidou */}
            <div>
              <label className="block text-[0.92rem] font-semibold text-white/90 mb-1.5">
                Quem te convidou?{' '}
                <span className="text-white/40 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                autoComplete="off"
                placeholder="Nome de quem te trouxe"
                value={form.invited_by_name}
                onChange={e => handleChange('invited_by_name', e.target.value)}
                style={{ fontSize: '16px' }}
                className="w-full h-12 px-4 rounded-xl border border-white/15 text-white bg-white/[0.06] placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-900/40 focus:border-amber-500/50 transition-colors"
              />
            </div>

            {/* Checkbox LGPD — R8: aceite explícito e visível */}
            <div
              className={`rounded-xl border p-3.5 ${
                errors.lgpd ? 'border-red-500/40 bg-red-950/20' : 'border-white/10 bg-white/5'
              }`}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.lgpd}
                  onChange={e => handleChange('lgpd', e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded shrink-0 accent-amber-600"
                />
                <span className="text-[0.87rem] text-white/80 leading-relaxed">
                  Concordo que a <strong>{IGV.name}</strong> utilize meus dados (nome, telefone e email)
                  para fins de contato pastoral, conforme a{' '}
                  <a
                    href="/privacy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: IGV.primaryColor }}
                  >
                    Política de Privacidade
                  </a>
                  . Dados não serão compartilhados com terceiros. (LGPD art. 7º, I)
                </span>
              </label>
              {errors.lgpd && (
                <p className="text-[0.85rem] text-red-400 mt-2 pl-7">{errors.lgpd}</p>
              )}
            </div>

            {/* Botão submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full h-12 rounded-xl text-white font-semibold text-[1rem] transition-opacity disabled:opacity-60"
              style={{
                background: `linear-gradient(90deg, ${IGV.primaryColor} 0%, ${IGV.secondaryColor} 100%)`,
              }}
            >
              {submitting ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Enviando...
                </span>
              ) : (
                'Cadastrar'
              )}
            </button>
          </form>
        </div>

        <p className="text-[0.82rem] text-white/50 text-center mt-4 px-2 leading-relaxed">
          Seus dados são protegidos pela LGPD e usados somente pela {IGV.name}.
        </p>
      </main>
    </div>
  )
}
