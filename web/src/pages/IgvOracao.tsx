/**
 * IgvOracao — /igv/oracao  (PWA público IGV)
 * Formulário de pedidos de oração. Mobile-first 375px.
 * Zero auth, LGPD R8.
 */

import { useState }    from 'react'
import { CircleNotchIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react'
import { GlassButton, GlassCard, IconTile, IgvContent, IgvNotice, IgvPageShell, PageHeader, IGV_INPUT, IGV_TEXT } from '@/components/igv'
import { PrayerHandsIcon } from '@/components/igv/icons'
import { IGV } from '@/lib/igv-public-data'

const EF_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/igv-prayer-request`

type FormState = 'idle' | 'submitting' | 'success' | 'error'

export default function IgvOracao() {
  const [name, setName]       = useState('')
  const [phone, setPhone]     = useState('')
  const [text, setText]       = useState('')
  const [state, setState]     = useState<FormState>('idle')
  const [errMsg, setErrMsg]   = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (state === 'submitting') return
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
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">

            <GlassCard className="flex items-start gap-4">
              <IconTile Icon={PrayerHandsIcon} />
              <div className="min-w-0">
                <h2 className={IGV_TEXT.heading}>Compartilhe seu pedido</h2>
                <p className={`mt-1 ${IGV_TEXT.muted}`}>
                  Nossa equipe pastoral orará por você com cuidado e discrição.
                </p>
              </div>
            </GlassCard>

            <GlassCard className="flex flex-col gap-4">
              <div>
                <label htmlFor="or-nome" className={IGV_TEXT.label}>Seu nome</label>
                <input
                  id="or-nome"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Como podemos te chamar?"
                  required
                  minLength={2}
                  autoComplete="given-name"
                  className={IGV_INPUT}
                />
              </div>

              <div>
                <label htmlFor="or-fone" className={IGV_TEXT.label}>WhatsApp</label>
                <input
                  id="or-fone"
                  type="tel"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="(11) 99999-9999"
                  required
                  autoComplete="tel"
                  className={IGV_INPUT}
                />
              </div>
            </GlassCard>

            <GlassCard>
              <label htmlFor="or-pedido" className={IGV_TEXT.label}>Seu pedido de oração</label>
              <textarea
                id="or-pedido"
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Compartilhe o que está no seu coração..."
                required
                minLength={10}
                rows={5}
                className={`${IGV_INPUT} resize-none`}
              />
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

        <GlassCard className="mt-3">
          <p className={`whitespace-pre-line ${IGV_TEXT.muted}`}>{IGV.address}</p>
        </GlassCard>
      </IgvContent>
    </IgvPageShell>
  )
}
