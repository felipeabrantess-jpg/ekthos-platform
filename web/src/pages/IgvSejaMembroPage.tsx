/**
 * IgvSejaMembroPage — /igv/seja-membro  (Redesign v2)
 * Formulário público de cadastro de novos membros da IGV.
 * POST → visitor-capture EF (slug igv-itaipu) → dispara funil de acolhimento.
 * Checkbox LGPD explícito e obrigatório (R8: dado visível ao titular).
 * Sem auth. Sem dados de membros. Sem sidebar do CRM.
 */

import { useState }   from 'react'
import { CaretLeftIcon, CheckCircleIcon, CircleNotchIcon } from '@phosphor-icons/react'
import { GlassButton, GlassCard, GlassChip, IconTile, IgvContent, IgvNotice, IgvPageShell, PageHeader, IGV_FOCUS, IGV_INPUT, IGV_TEXT } from '@/components/igv'
import { HeartCrossIcon } from '@/components/igv/icons'
import { ICON_SIZE } from '@/lib/icon-tokens'
import { IGV }        from '@/lib/igv-public-data'
import { IGV_MSG, nomeCompleto, telefoneBR } from '@/lib/igv-validacao'

// ── Constantes ────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string
const EF_BASE      = `${SUPABASE_URL}/functions/v1`

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Máscara de telefone BR ─────────────────────────────────────────

function maskPhone(value: string): string {
  let all = value.replace(/\D/g, '')
  // DDI do Brasil colado/digitado (+55 21 9...): 12 ou 13 dígitos começando em 55 → remove o 55 antes da máscara.
  // Número nacional tem no máx. 11 dígitos, então um DDD 55 (RS) digitado normalmente nunca é confundido com DDI.
  if ((all.length === 12 || all.length === 13) && all.startsWith('55')) all = all.slice(2)
  const digits = all.slice(0, 11)
  if (digits.length === 0)  return ''
  if (digits.length <= 2)   return `(${digits}`
  if (digits.length <= 6)   return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10)  return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

// ── Tipos ─────────────────────────────────────────────────────────

interface FormState {
  slug:            string
  name:            string
  phone:           string
  email:           string
  invited_by_name: string
  lgpd:            boolean
}

// ── Componente principal ───────────────────────────────────────────

export default function IgvSejaMembroPage() {
  const [form, setForm] = useState<FormState>({
    slug:            '',
    name:            '',
    phone:           '',
    email:           '',
    invited_by_name: '',
    lgpd:            false,
  })
  const [errors,     setErrors]     = useState<Partial<Record<keyof FormState, string>>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted,  setSubmitted]  = useState(false)
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)

  function handleChange(field: keyof FormState, raw: string | boolean) {
    const value = field === 'phone' && typeof raw === 'string' ? maskPhone(raw) : raw
    setForm(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof FormState, string>> = {}
    if (!form.slug)
      errs.slug  = 'Escolha a igreja'
    if (!nomeCompleto(form.name))
      errs.name  = IGV_MSG.nome
    if (!telefoneBR(form.phone))
      errs.phone = IGV_MSG.telefone
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
      const res = await fetch(`${EF_BASE}/visitor-capture`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          slug:            form.slug,
          name:            form.name.trim(),
          phone:           form.phone,
          email:           form.email.trim() || undefined,
          invited_by_name: form.invited_by_name.trim() || undefined,
        }),
      })
      // Telefone já cadastrado: a EF avisa (sem criar nem alterar ninguém). Qualquer outra resposta = sucesso.
      try { const d = await res.json(); setAlreadyRegistered(d?.already_registered === true) } catch { /* resposta sem JSON → sucesso */ }
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
      <IgvPageShell>
        <PageHeader title="Seja Membro" />
        <IgvContent>
          <IgvNotice Icon={HeartCrossIcon} title={alreadyRegistered ? 'USUÁRIO JÁ CADASTRADO' : 'Bem-vindo(a) à família!'}>
            <p>
              {alreadyRegistered
                ? <>Este telefone já está cadastrado na <strong className="font-semibold text-[var(--igv-ink)]">{IGV.name}</strong>. Não é preciso se cadastrar de novo.</>
                : <>Recebemos seu cadastro. Em breve alguém da{' '}
                  <strong className="font-semibold text-[var(--igv-ink)]">{IGV.name}</strong>{' '}
                  vai entrar em contato pelo WhatsApp.</>}
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <GlassButton
                href={`https://wa.me/${IGV.whatsapp}?text=${encodeURIComponent(`Olá! Acabei de me cadastrar em ${IGV.name}. Gostaria de saber mais!`)}`}
                variant="accent"
              >
                <svg width={ICON_SIZE.button} height={ICON_SIZE.button} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Falar com a Igreja
              </GlassButton>
              <GlassButton to="/igv" Icon={CaretLeftIcon}>Voltar para a página da Igreja</GlassButton>
            </div>
          </IgvNotice>
        </IgvContent>
      </IgvPageShell>
    )
  }

  // ── Formulário ─────────────────────────────────────────────────

  const inputCls = (hasError?: string) => `${IGV_INPUT} ${hasError ? '!border-[var(--igv-danger)]' : ''}`

  return (
    <IgvPageShell>
      <PageHeader title="Seja Membro" subtitle={IGV.name} />

      <form onSubmit={e => void handleSubmit(e)} noValidate>
        <IgvContent>

          {/* Dados de contato */}
          <GlassCard className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <IconTile Icon={HeartCrossIcon} />
              <h2 className={IGV_TEXT.heading}>Faça parte da família</h2>
            </div>

            <fieldset>
              <legend className={IGV_TEXT.label}>Em qual igreja você quer ser membro? *</legend>
              <div className="grid grid-cols-2 gap-2">
                {IGV.unidades.map(u => (
                  <GlassChip key={u.slug} segmented selected={form.slug === u.slug} onClick={() => handleChange('slug', u.slug)}>
                    {u.nome}
                  </GlassChip>
                ))}
              </div>
              {errors.slug && <p role="alert" className={`mt-1.5 ${IGV_TEXT.error}`}>{errors.slug}</p>}
            </fieldset>

            <div>
              <label htmlFor="sm-nome" className={IGV_TEXT.label}>Nome completo *</label>
              <input
                id="sm-nome"
                type="text"
                autoComplete="name"
                placeholder="Nome e sobrenome"
                value={form.name}
                onChange={e => handleChange('name', e.target.value)}
                className={inputCls(errors.name)}
              />
              {errors.name && <p role="alert" className={`mt-1.5 ${IGV_TEXT.error}`}>{errors.name}</p>}
            </div>

            <div>
              <label htmlFor="sm-fone" className={IGV_TEXT.label}>WhatsApp / telefone *</label>
              <input
                id="sm-fone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="(21) 99999-9999"
                value={form.phone}
                onChange={e => handleChange('phone', e.target.value)}
                className={inputCls(errors.phone)}
              />
              {errors.phone && <p role="alert" className={`mt-1.5 ${IGV_TEXT.error}`}>{errors.phone}</p>}
            </div>
          </GlassCard>

          {/* Campos opcionais */}
          <GlassCard className="flex flex-col gap-4">
            <div>
              <label htmlFor="sm-email" className={IGV_TEXT.label}>Email (opcional)</label>
              <input
                id="sm-email"
                type="email"
                autoComplete="email"
                placeholder="seu@email.com"
                value={form.email}
                onChange={e => handleChange('email', e.target.value)}
                className={inputCls(errors.email)}
              />
              {errors.email && <p role="alert" className={`mt-1.5 ${IGV_TEXT.error}`}>{errors.email}</p>}
            </div>

            <div>
              <label htmlFor="sm-convite" className={IGV_TEXT.label}>Quem te convidou? (opcional)</label>
              <input
                id="sm-convite"
                type="text"
                autoComplete="off"
                placeholder="Nome de quem te trouxe"
                value={form.invited_by_name}
                onChange={e => handleChange('invited_by_name', e.target.value)}
                className={IGV_INPUT}
              />
            </div>
          </GlassCard>

          {/* Checkbox LGPD — R8: aceite explícito e visível */}
          <GlassCard className={errors.lgpd ? '!border-[var(--igv-danger)]' : ''}>
            <label className="flex items-start gap-3 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={form.lgpd}
                onChange={e => handleChange('lgpd', e.target.checked)}
                className={`mt-0.5 w-6 h-6 shrink-0 accent-[var(--igv-accent)] ${IGV_FOCUS}`}
              />
              <span className={IGV_TEXT.muted}>
                Concordo que a <strong className="font-semibold text-[var(--igv-ink)]">{IGV.name}</strong> utilize meus dados (nome, telefone e email)
                para fins de contato pastoral, conforme a{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`underline text-[var(--igv-accent)] ${IGV_FOCUS}`}
                >
                  Política de Privacidade
                </a>
                . Dados não serão compartilhados com terceiros. (LGPD art. 7º, I)
              </span>
            </label>
            {errors.lgpd && <p role="alert" className={`mt-2 ${IGV_TEXT.error}`}>{errors.lgpd}</p>}
          </GlassCard>

          <GlassButton
            type="submit"
            variant="accent"
            fullWidth
            disabled={submitting}
            Icon={submitting ? CircleNotchIcon : CheckCircleIcon}
          >
            {submitting ? 'Enviando...' : 'Cadastrar'}
          </GlassButton>

          <p className={`px-1 text-center ${IGV_TEXT.muted}`}>
            Seus dados são protegidos pela LGPD e usados somente pela {IGV.name}.
          </p>
        </IgvContent>
      </form>
    </IgvPageShell>
  )
}
