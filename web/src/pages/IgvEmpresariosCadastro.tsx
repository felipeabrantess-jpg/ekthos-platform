import { useState, useRef }             from 'react'
import { Link }                          from 'react-router-dom'
import { ChevronLeft, Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { supabase }                      from '@/lib/supabase'
import { IGV }                           from '@/lib/igv-public-data'

// ── Constantes ────────────────────────────────────────────────────────────────

const CATEGORIAS = [
  'Alimentação',
  'Saúde e Bem-estar',
  'Beleza e Estética',
  'Construção e Reformas',
  'Tecnologia',
  'Moda e Vestuário',
  'Educação',
  'Serviços Gerais',
  'Consultoria',
  'Eventos e Fotografia',
  'Limpeza',
  'Outros',
] as const

const MAX_BYTES   = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

// ── Helpers ───────────────────────────────────────────────────────────────────

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ── Campo com label + erro ────────────────────────────────────────────────────

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
          <AlertCircle size={11} />
          {error}
        </p>
      )}
    </div>
  )
}

const baseCls =
  'w-full border rounded-xl px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition-shadow bg-white'

function borderColor(hasError: boolean): React.CSSProperties {
  return { borderColor: hasError ? '#ef4444' : '#e5e7eb' }
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function IgvEmpresariosCadastro() {
  const [step,        setStep]        = useState<'form' | 'success'>('form')
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [nome,        setNome]        = useState('')
  const [categoria,   setCategoria]   = useState('')
  const [descricao,   setDescricao]   = useState('')
  const [telefone,    setTelefone]    = useState('')
  const [email,       setEmail]       = useState('')
  const [instagram,   setInstagram]   = useState('')
  const [site,        setSite]        = useState('')
  const [nomeContato, setNomeContato] = useState('')
  const [lgpd,        setLgpd]        = useState(false)

  const [logoFile,    setLogoFile]    = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [logoError,   setLogoError]   = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [errors, setErrors] = useState<Record<string, string>>({})

  function clearError(key: string) {
    setErrors(prev => { const next = { ...prev }; delete next[key]; return next })
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      setLogoError('Somente JPEG, PNG ou WebP são aceitos.')
      setLogoFile(null); setLogoPreview(null)
      return
    }
    if (file.size > MAX_BYTES) {
      setLogoError('Imagem muito grande. Máximo 5 MB.')
      setLogoFile(null); setLogoPreview(null)
      return
    }
    setLogoError(null)
    setLogoFile(file)
    setLogoPreview(URL.createObjectURL(file))
    clearError('logo')
  }

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!nome.trim())        errs.nome        = 'Nome da empresa é obrigatório'
    if (!categoria)          errs.categoria   = 'Escolha uma categoria'
    if (!descricao.trim())   errs.descricao   = 'Descrição é obrigatória'
    if (!telefone.trim())    errs.telefone    = 'Telefone é obrigatório'
    if (!email.trim())       errs.email       = 'E-mail é obrigatório'
    if (!instagram.trim())   errs.instagram   = 'Instagram é obrigatório'
    if (!nomeContato.trim()) errs.nomeContato = 'Seu nome é obrigatório'
    // logo é opcional — sem validação
    if (!lgpd)               errs.lgpd        = 'Aceite o termo para enviar'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) {
      document.querySelector('[data-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    try {
      const logo_base64 = logoFile ? await toBase64(logoFile) : undefined
      const logo_mime   = logoFile?.type

      const { data, error } = await supabase.functions.invoke('igv-public-empresarios-create', {
        body: {
          nome:         nome.trim(),
          categoria,
          descricao:    descricao.trim(),
          telefone:     telefone.trim(),
          email:        email.trim(),
          instagram:    instagram.replace(/^@/, '').trim(),
          site:         site.trim() || undefined,
          nome_contato: nomeContato.trim(),
          lgpd_consent: true,
          logo_base64,
          logo_mime,
        },
      })

      if (error) throw new Error(error.message || 'Erro de rede')
      if (data?.error) throw new Error(data.error)

      setStep('success')
    } catch (err: any) {
      setSubmitError(
        err?.message ||
        'Não foi possível enviar. Tente novamente ou fale com a secretaria: (21) 99366-7239'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const pc = IGV.primaryColor

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#f9f9f9' }}>
      {/* Header sticky */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-black/[0.06]"
        style={{ backgroundColor: '#fff' }}
      >
        <Link
          to="/igv/empresarios"
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${pc}15`, color: pc }}
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </Link>
        <div>
          <p className="font-semibold text-gray-900 text-[0.9rem] leading-tight">Cadastre seu negócio</p>
          <p className="text-[0.7rem] text-gray-400">Rede de Negócios IGV</p>
        </div>
      </div>

      <div className="px-4 pt-5 pb-12 max-w-lg mx-auto">

        {/* ── Tela de confirmação ─────────────────────────────────────────── */}
        {step === 'success' ? (
          <div className="flex flex-col items-center text-center py-12 px-2">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mb-5"
              style={{ backgroundColor: `${pc}20` }}
            >
              <CheckCircle2 size={42} style={{ color: pc }} strokeWidth={1.5} />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-3">Cadastro enviado!</h2>
            <p className="text-sm text-gray-500 leading-relaxed mb-8 max-w-xs">
              Seu negócio já está na Rede de Negócios da IGV! Acesse agora para confirmar. 🙏
            </p>
            <Link
              to="/igv/empresarios"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-semibold text-white"
              style={{ backgroundColor: pc }}
            >
              Ver a Rede de Negócios
            </Link>
          </div>

        ) : (
        /* ── Formulário ─────────────────────────────────────────────────── */
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <p className="text-sm text-gray-500 leading-relaxed">
              Preencha os dados abaixo. Nossa equipe revisa antes de publicar — geralmente em até 24 h.
            </p>

            {/* Logo */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Logo do negócio <span className="text-gray-400 font-normal text-xs">(opcional)</span>
              </label>
              <div
                className="flex items-center gap-4 p-4 rounded-2xl border-2 border-dashed cursor-pointer transition-colors"
                style={{
                  borderColor:     errors.logo ? '#ef4444' : logoFile ? pc : '#d1d5db',
                  backgroundColor: logoFile ? `${pc}08` : '#fafafa',
                }}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
              >
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="preview"
                    className="w-14 h-14 rounded-xl object-cover shrink-0 border border-black/[0.06]"
                  />
                ) : (
                  <div
                    className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${pc}15` }}
                  >
                    <Upload size={22} style={{ color: pc }} strokeWidth={1.5} />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-gray-700">
                    {logoFile ? logoFile.name : 'Toque para selecionar'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">JPEG, PNG ou WebP · máx 5 MB</p>
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleLogoChange}
                />
              </div>
              {(logoError || errors.logo) && (
                <p className="text-xs text-red-500 mt-1 flex items-center gap-1" data-error>
                  <AlertCircle size={11} />
                  {logoError ?? errors.logo}
                </p>
              )}
            </div>

            {/* Dados do negócio */}
            <div className="bg-white rounded-2xl border border-black/[0.06] p-4 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Seu negócio</p>

              <Field label="Nome da empresa" required error={errors.nome}>
                <input
                  className={baseCls}
                  style={borderColor(!!errors.nome)}
                  value={nome}
                  onChange={e => { setNome(e.target.value); clearError('nome') }}
                  placeholder="Ex: Padaria do João"
                />
              </Field>

              <Field label="Categoria" required error={errors.categoria}>
                <select
                  className={baseCls}
                  style={borderColor(!!errors.categoria)}
                  value={categoria}
                  onChange={e => { setCategoria(e.target.value); clearError('categoria') }}
                >
                  <option value="">Selecione uma categoria</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              <Field label="Descrição" required error={errors.descricao}>
                <textarea
                  className={baseCls}
                  style={borderColor(!!errors.descricao)}
                  rows={3}
                  value={descricao}
                  onChange={e => { setDescricao(e.target.value); clearError('descricao') }}
                  placeholder="O que você oferece? Como pode ajudar a família IGV?"
                />
              </Field>
            </div>

            {/* Contato do negócio */}
            <div className="bg-white rounded-2xl border border-black/[0.06] p-4 space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Contato</p>

              <Field label="Telefone / WhatsApp" required error={errors.telefone}>
                <input
                  className={baseCls}
                  style={borderColor(!!errors.telefone)}
                  type="tel"
                  value={telefone}
                  onChange={e => { setTelefone(e.target.value); clearError('telefone') }}
                  placeholder="(21) 99999-9999"
                />
              </Field>

              <Field label="E-mail" required error={errors.email}>
                <input
                  className={baseCls}
                  style={borderColor(!!errors.email)}
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); clearError('email') }}
                  placeholder="contato@meunegocio.com.br"
                />
              </Field>

              <Field label="Instagram" required error={errors.instagram}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm select-none">@</span>
                  <input
                    className={`${baseCls} pl-7`}
                    style={borderColor(!!errors.instagram)}
                    value={instagram}
                    onChange={e => { setInstagram(e.target.value.replace(/^@/, '')); clearError('instagram') }}
                    placeholder="meuNegocio"
                  />
                </div>
              </Field>

              <Field label="Site (opcional)" error={undefined}>
                <input
                  className={baseCls}
                  style={{ borderColor: '#e5e7eb' }}
                  type="url"
                  value={site}
                  onChange={e => setSite(e.target.value)}
                  placeholder="https://meunegocio.com.br"
                />
              </Field>
            </div>

            {/* Quem está cadastrando */}
            <div className="bg-white rounded-2xl border border-black/[0.06] p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Quem está cadastrando</p>
              <Field label="Seu nome" required error={errors.nomeContato}>
                <input
                  className={baseCls}
                  style={borderColor(!!errors.nomeContato)}
                  value={nomeContato}
                  onChange={e => { setNomeContato(e.target.value); clearError('nomeContato') }}
                  placeholder="Seu nome completo"
                />
              </Field>
            </div>

            {/* LGPD */}
            <label
              className="flex items-start gap-3 bg-white rounded-2xl border p-4 cursor-pointer"
              style={{ borderColor: errors.lgpd ? '#ef4444' : '#e5e7eb' }}
            >
              <input
                type="checkbox"
                checked={lgpd}
                onChange={e => { setLgpd(e.target.checked); clearError('lgpd') }}
                className="mt-0.5 shrink-0 w-4 h-4 rounded cursor-pointer"
                style={{ accentColor: pc }}
              />
              <span className="text-sm text-gray-600 leading-relaxed">
                Autorizo que meus dados e os do meu negócio apareçam publicamente na{' '}
                <strong>Rede de Negócios da IGV</strong>, conforme a LGPD. Posso solicitar remoção a qualquer momento.
              </span>
            </label>
            {errors.lgpd && (
              <p className="text-xs text-red-500 -mt-3 flex items-center gap-1" data-error>
                <AlertCircle size={11} />
                {errors.lgpd}
              </p>
            )}

            {/* Erro de envio */}
            {submitError && (
              <div className="flex items-start gap-2 p-3.5 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Botão enviar */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-2xl font-semibold text-white text-sm flex items-center justify-center gap-2 transition-opacity active:scale-[0.99]"
              style={{ backgroundColor: pc, opacity: submitting ? 0.65 : 1 }}
            >
              {submitting ? (
                <><Loader2 size={16} className="animate-spin" /> Enviando…</>
              ) : (
                'Enviar cadastro'
              )}
            </button>

            <p className="text-center text-[0.7rem] text-gray-400 pb-2">
              Após o envio, a equipe IGV revisa antes de publicar.
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
