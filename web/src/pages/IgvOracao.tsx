/**
 * IgvOracao — /igv/oracao  (PWA público IGV)
 * Formulário de pedidos de oração. Mobile-first 375px.
 * Mesmo padrão de campos e validação do Seja Membro (igv-validacao). Zero auth, LGPD R8.
 */

import { useState }    from 'react'
import { CircleNotchIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react'
import { GlassButton, GlassCard, IconTile, IgvContent, IgvNotice, IgvPageShell, PageHeader, IGV_INPUT, IGV_TEXT } from '@/components/igv'
import { PrayerHandsIcon } from '@/components/igv/icons'
import { IGV_MSG, mascaraTelefoneBR, nomeCompleto, telefoneBR } from '@/lib/igv-validacao'

const EF_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/igv-prayer-request`
const MSG_PEDIDO = 'Por favor, detalhe um pouco mais a sua necessidade de oração.'

type FormState = 'idle' | 'submitting' | 'success' | 'error'
type Campo = 'name' | 'phone' | 'text'

export default function IgvOracao() {
  const [name, setName]       = useState('')
  const [phone, setPhone]     = useState('')
  const [text, setText]       = useState('')
  const [state, setState]     = useState<FormState>('idle')
  const [errMsg, setErrMsg]   = useState('')
  const [errors, setErrors]   = useState<Partial<Record<Campo, string>>>({})

  function limpar(campo: Campo) {
    if (errors[campo]) setErrors(prev => ({ ...prev, [campo]: undefined }))
  }

  function validate(): boolean {
    const errs: Partial<Record<Campo, string>> = {}
    if (!nomeCompleto(name))        errs.name  = IGV_MSG.nome
    if (!telefoneBR(phone))         errs.phone = IGV_MSG.telefone
    if (text.trim().length < 10)    errs.text  = MSG_PEDIDO
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state === 'submitting' || !validate()) return
    setState('submitting')
    setErrMsg('')

    try {
      const res = await fetch(EF_URL, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: name.trim(), phone: phone.trim(), request_text: text.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setState('error')
        setErrMsg(data.error ?? 'Erro ao enviar. Tente novamente.')
        return
      }
      setState('success')
    } catch {
      setState('error')
      setErrMsg('Sem conexão. Verifique sua internet e tente novamente.')
    }
  }

  const inputCls = (hasError?: string) => `${IGV_INPUT} ${hasError ? '!border-[var(--igv-danger)]' : ''}`

  return (
    <IgvPageShell>
      <PageHeader title="Pedidos de Oração" />

      <IgvContent>
        {state === 'success' ? (
          /* ── Confirmação ── */
          <IgvNotice Icon={PrayerHandsIcon} title="Pedido recebido!">
            <p>Estamos orando por você. Nossa equipe pastoral receberá seu pedido e levará ao Senhor.</p>
            <GlassButton to="/igv" variant="accent" className="mt-4">Voltar para o início</GlassButton>
          </IgvNotice>
        ) : (
          /* ── Formulário ── */
          <form onSubmit={e => void handleSubmit(e)} noValidate className="flex flex-col gap-3">

            <GlassCard className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <IconTile Icon={PrayerHandsIcon} />
                <h2 className={IGV_TEXT.heading}>Compartilhe seu pedido</h2>
              </div>
              <p className={IGV_TEXT.muted}>
                Nossa equipe pastoral orará por você com cuidado e discrição.
              </p>

              <div>
                <label htmlFor="or-nome" className={IGV_TEXT.label}>Nome completo *</label>
                <input
                  id="or-nome"
                  type="text"
                  value={name}
                  onChange={e => { setName(e.target.value); limpar('name') }}
                  placeholder="Nome e sobrenome"
                  autoComplete="name"
                  className={inputCls(errors.name)}
                />
                {errors.name && <p role="alert" className={`mt-1.5 ${IGV_TEXT.error}`}>{errors.name}</p>}
              </div>

              <div>
                <label htmlFor="or-fone" className={IGV_TEXT.label}>WhatsApp / telefone *</label>
                <input
                  id="or-fone"
                  type="tel"
                  inputMode="numeric"
                  value={phone}
                  onChange={e => { setPhone(mascaraTelefoneBR(e.target.value)); limpar('phone') }}
                  placeholder="(21) 99999-9999"
                  autoComplete="tel-national"
                  className={inputCls(errors.phone)}
                />
                {errors.phone && <p role="alert" className={`mt-1.5 ${IGV_TEXT.error}`}>{errors.phone}</p>}
              </div>
            </GlassCard>

            <GlassCard>
              <label htmlFor="or-pedido" className={IGV_TEXT.label}>Seu pedido de oração *</label>
              <textarea
                id="or-pedido"
                value={text}
                onChange={e => { setText(e.target.value); limpar('text') }}
                placeholder="Compartilhe o que está no seu coração..."
                rows={5}
                className={`${inputCls(errors.text)} resize-none`}
              />
              {errors.text && <p role="alert" className={`mt-1.5 ${IGV_TEXT.error}`}>{errors.text}</p>}
              <p className={`mt-3 ${IGV_TEXT.muted}`}>
                Seus dados são tratados com sigilo pastoral. Não compartilhamos com terceiros.
              </p>
            </GlassCard>

            {state === 'error' && <p role="alert" className={`px-1 ${IGV_TEXT.error}`}>{errMsg}</p>}

            <GlassButton
              type="submit"
              variant="accent"
              fullWidth
              disabled={state === 'submitting'}
              Icon={state === 'submitting' ? CircleNotchIcon : PaperPlaneTiltIcon}
            >
              {state === 'submitting' ? 'Enviando...' : 'Enviar pedido'}
            </GlassButton>

          </form>
        )}
      </IgvContent>
    </IgvPageShell>
  )
}
