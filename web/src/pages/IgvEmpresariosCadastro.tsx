import { useState, useRef }             from 'react'
import { CheckCircleIcon, CircleNotchIcon, UploadSimpleIcon } from '@phosphor-icons/react'
import { GlassButton, GlassCard, IconTile, IgvContent, IgvNotice, IgvPageShell, PageHeader, IGV_FOCUS, IGV_INPUT, IGV_TEXT } from '@/components/igv'
import { BusinessCrossIcon } from '@/components/igv/icons'
import { supabase }                      from '@/lib/supabase'
import { IGV_MSG, mascaraTelefoneBR, nomeCompleto, telefoneBR } from '@/lib/igv-validacao'

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
      <label className="block">
        <span className={IGV_TEXT.label}>
          {label}
          {required && ' *'}
        </span>
        {children}
      </label>
      {error && (
        <p role="alert" className={`mt-1.5 ${IGV_TEXT.error}`} data-error>{error}</p>
      )}
    </div>
  )
}

function inputCls(hasError: boolean): string {
  return `${IGV_INPUT} ${hasError ? '!border-[var(--igv-danger)]' : ''}`
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function IgvEmpresariosCadastro() {
  const [step,        setStep]        = useState<'form' | 'success'>('form')
  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [nome,        setNome]        = useState('')
  const [categoria,   setCategoria]   = useState('')
  const [categoriaOutra, setCategoriaOutra] = useState('')
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
    else if (categoria === 'Outros' && !categoriaOutra.trim()) errs.categoriaOutra = 'Informe a categoria do seu negócio'
    if (!descricao.trim())   errs.descricao   = 'Descrição é obrigatória'
    if (!telefoneBR(telefone)) errs.telefone  = IGV_MSG.telefone
    if (!email.trim())       errs.email       = 'E-mail é obrigatório'
    if (!instagram.trim())   errs.instagram   = 'Instagram é obrigatório'
    if (!nomeCompleto(nomeContato)) errs.nomeContato = IGV_MSG.nome
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
          // A EF aceita categoria em texto livre (só exige não vazia)
          categoria:    categoria === 'Outros' ? `Outros: ${categoriaOutra.trim()}` : categoria,
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

  return (
    <IgvPageShell>
      <PageHeader title="Cadastre seu negócio" subtitle="Rede de Negócios IGV" backTo="/igv/empresarios" />

      {/* ── Tela de confirmação ─────────────────────────────────────────── */}
      {step === 'success' ? (
        <IgvContent>
          <IgvNotice Icon={BusinessCrossIcon} title="Cadastro enviado!">
            <p>Seu negócio já está na Rede de Negócios da IGV! Acesse agora para confirmar.</p>
            <GlassButton to="/igv/empresarios" variant="accent" className="mt-4">Ver a Rede de Negócios</GlassButton>
          </IgvNotice>
        </IgvContent>

      ) : (
      /* ── Formulário ─────────────────────────────────────────────────── */
        <form onSubmit={handleSubmit} noValidate>
          <IgvContent>
            <p className={`px-1 ${IGV_TEXT.muted}`}>
              Preencha os dados abaixo e seu negócio aparece na lista imediatamente.
            </p>

            {/* Logo */}
            <GlassCard>
              <p className={IGV_TEXT.label}>Logo do negócio (opcional)</p>
              <div
                className={`igv-glass igv-glass--inset ${IGV_FOCUS} flex items-center gap-4 p-3 rounded-2xl cursor-pointer ${errors.logo ? '!border-[var(--igv-danger)]' : logoFile ? 'outline outline-2 outline-[var(--igv-accent)]' : ''}`}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
              >
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="preview"
                    className="w-14 h-14 rounded-2xl object-cover shrink-0"
                  />
                ) : (
                  <IconTile Icon={UploadSimpleIcon} />
                )}
                <div className="min-w-0">
                  <p className={`break-words ${IGV_TEXT.item}`}>
                    {logoFile ? logoFile.name : 'Toque para selecionar'}
                  </p>
                  <p className={`mt-0.5 ${IGV_TEXT.muted}`}>JPEG, PNG ou WebP · máx 5 MB</p>
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
                <p className={`mt-1.5 ${IGV_TEXT.error}`} data-error>{logoError ?? errors.logo}</p>
              )}
            </GlassCard>

            {/* Dados do negócio */}
            <GlassCard className="flex flex-col gap-4">
              <h2 className={IGV_TEXT.heading}>Seu negócio</h2>

              <Field label="Nome da empresa" required error={errors.nome}>
                <input
                  className={inputCls(!!errors.nome)}
                  value={nome}
                  onChange={e => { setNome(e.target.value); clearError('nome') }}
                  placeholder="Ex: Padaria do João"
                />
              </Field>

              <Field label="Categoria" required error={errors.categoria}>
                <select
                  className={inputCls(!!errors.categoria)}
                  value={categoria}
                  onChange={e => { setCategoria(e.target.value); clearError('categoria') }}
                >
                  <option value="">Selecione uma categoria</option>
                  {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>

              {categoria === 'Outros' && (
                <Field label="Qual categoria?" required error={errors.categoriaOutra}>
                  <input
                    className={inputCls(!!errors.categoriaOutra)}
                    value={categoriaOutra}
                    maxLength={60}
                    onChange={e => { setCategoriaOutra(e.target.value); clearError('categoriaOutra') }}
                    placeholder="Ex.: Pet shop"
                  />
                </Field>
              )}

              <Field label="Descrição" required error={errors.descricao}>
                <textarea
                  className={`${inputCls(!!errors.descricao)} resize-none`}
                  rows={3}
                  value={descricao}
                  onChange={e => { setDescricao(e.target.value); clearError('descricao') }}
                  placeholder="O que você oferece? Como pode ajudar a família IGV?"
                />
              </Field>
            </GlassCard>

            {/* Contato do negócio */}
            <GlassCard className="flex flex-col gap-4">
              <h2 className={IGV_TEXT.heading}>Contato</h2>

              <Field label="Telefone / WhatsApp" required error={errors.telefone}>
                <input
                  className={inputCls(!!errors.telefone)}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  value={telefone}
                  onChange={e => { setTelefone(mascaraTelefoneBR(e.target.value)); clearError('telefone') }}
                  placeholder="(21) 99999-9999"
                />
              </Field>

              <Field label="E-mail" required error={errors.email}>
                <input
                  className={inputCls(!!errors.email)}
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); clearError('email') }}
                  placeholder="contato@meunegocio.com.br"
                />
              </Field>

              <Field label="Instagram" required error={errors.instagram}>
                <div className="relative">
                  <span className={`absolute left-4 top-1/2 -translate-y-1/2 select-none ${IGV_TEXT.muted}`} aria-hidden="true">@</span>
                  <input
                    className={`${inputCls(!!errors.instagram)} !pl-9`}
                    value={instagram}
                    onChange={e => { setInstagram(e.target.value.replace(/^@/, '')); clearError('instagram') }}
                    placeholder="meuNegocio"
                  />
                </div>
              </Field>

              <Field label="Site (opcional)" error={undefined}>
                <input
                  className={IGV_INPUT}
                  type="url"
                  value={site}
                  onChange={e => setSite(e.target.value)}
                  placeholder="https://meunegocio.com.br"
                />
              </Field>
            </GlassCard>

            {/* Quem está cadastrando */}
            <GlassCard className="flex flex-col gap-4">
              <h2 className={IGV_TEXT.heading}>Quem está cadastrando</h2>
              <Field label="Seu nome" required error={errors.nomeContato}>
                <input
                  className={inputCls(!!errors.nomeContato)}
                  value={nomeContato}
                  onChange={e => { setNomeContato(e.target.value); clearError('nomeContato') }}
                  autoComplete="name"
                  placeholder="Nome e sobrenome"
                />
              </Field>
            </GlassCard>

            {/* LGPD */}
            <GlassCard className={errors.lgpd ? '!border-[var(--igv-danger)]' : ''}>
              <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={lgpd}
                  onChange={e => { setLgpd(e.target.checked); clearError('lgpd') }}
                  className={`mt-0.5 shrink-0 w-6 h-6 cursor-pointer accent-[var(--igv-accent)] ${IGV_FOCUS}`}
                />
                <span className={IGV_TEXT.muted}>
                  Autorizo que meus dados e os do meu negócio apareçam publicamente na{' '}
                  <strong className="font-semibold text-[var(--igv-ink)]">Rede de Negócios da IGV</strong>, conforme a LGPD. Posso solicitar remoção a qualquer momento.
                </span>
              </label>
              {errors.lgpd && (
                <p className={`mt-2 ${IGV_TEXT.error}`} data-error>{errors.lgpd}</p>
              )}
            </GlassCard>

            {/* Erro de envio */}
            {submitError && <p role="alert" className={`px-1 ${IGV_TEXT.error}`}>{submitError}</p>}

            {/* Botão enviar */}
            <GlassButton
              type="submit"
              variant="accent"
              fullWidth
              disabled={submitting}
              Icon={submitting ? CircleNotchIcon : CheckCircleIcon}
            >
              {submitting ? 'Enviando…' : 'Enviar cadastro'}
            </GlassButton>

            <p className={`px-1 text-center ${IGV_TEXT.muted}`}>
              Seu negócio aparece na lista imediatamente após o envio.
            </p>
          </IgvContent>
        </form>
      )}
    </IgvPageShell>
  )
}
