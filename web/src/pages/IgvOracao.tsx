/**
 * IgvOracao — /igv/oracao  (PWA público IGV)
 * Formulário de pedidos de oração. Mobile-first 375px.
 * DM Sans, paleta âmbar IGV. Zero auth, LGPD R8.
 */

import { useState }    from 'react'
import { Link }        from 'react-router-dom'
import { ChevronLeft, Heart, Send, CheckCircle2, AlertCircle } from 'lucide-react'
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
    <div className="min-h-screen bg-black flex flex-col" style={{ fontFamily: "'DM Sans', sans-serif" }}>

      {/* Header */}
      <header className="bg-black border-b border-white/10 px-4 pt-safe-top">
        <div className="flex items-center gap-3 h-14">
          <Link to="/igv" className="p-1.5 -ml-1.5 rounded-lg text-white/70 hover:bg-white/10 transition-colors">
            <ChevronLeft size={20} strokeWidth={2} />
          </Link>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${IGV.primaryColor}18`, color: IGV.primaryColor }}
            >
              <Heart size={14} strokeWidth={1.75} />
            </div>
            <span className="font-semibold text-white text-[1.02rem]">Pedidos de Oração</span>
          </div>
        </div>
      </header>

      <main className="flex-1 px-4 py-6 max-w-lg mx-auto w-full">

        {state === 'success' ? (
          /* ── Confirmação ── */
          <div className="flex flex-col items-center text-center py-12 gap-5">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: `${IGV.primaryColor}18` }}
            >
              <CheckCircle2 size={32} strokeWidth={1.5} style={{ color: IGV.primaryColor }} />
            </div>
            <div>
              <h2 className="text-[1.25rem] font-bold text-white mb-1.5">Pedido recebido!</h2>
              <p className="text-white/70 text-[0.97rem] leading-relaxed max-w-xs mx-auto">
                Estamos orando por você. Nossa equipe pastoral receberá seu pedido e levará ao Senhor.
              </p>
            </div>
            <Link
              to="/igv"
              className="mt-2 px-6 py-2.5 rounded-xl font-semibold text-[0.97rem] text-white transition-opacity active:opacity-80"
              style={{ backgroundColor: IGV.primaryColor }}
            >
              Voltar para o início
            </Link>
          </div>
        ) : (
          /* ── Formulário ── */
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">

            <div className="mb-1">
              <h1 className="text-[1.3rem] font-bold text-white">Compartilhe seu pedido</h1>
              <p className="text-white/60 text-[0.92rem] mt-1 leading-relaxed">
                Nossa equipe pastoral orará por você com cuidado e discrição.
              </p>
            </div>

            {/* Nome */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[0.92rem] font-semibold text-white/80">Seu nome</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Como podemos te chamar?"
                required
                minLength={2}
                autoComplete="given-name"
                className="w-full px-4 py-3 rounded-xl border border-white/15 bg-white/[0.06] text-[1.02rem] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 transition-shadow"
                style={{ '--tw-ring-color': `${IGV.primaryColor}40` } as React.CSSProperties}
              />
            </div>

            {/* Telefone */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[0.92rem] font-semibold text-white/80">WhatsApp</label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                required
                autoComplete="tel"
                className="w-full px-4 py-3 rounded-xl border border-white/15 bg-white/[0.06] text-[1.02rem] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 transition-shadow"
                style={{ '--tw-ring-color': `${IGV.primaryColor}40` } as React.CSSProperties}
              />
            </div>

            {/* Pedido */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[0.92rem] font-semibold text-white/80">Seu pedido de oração</label>
              <textarea
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Compartilhe o que está no seu coração..."
                required
                minLength={10}
                rows={5}
                className="w-full px-4 py-3 rounded-xl border border-white/15 bg-white/[0.06] text-[1.02rem] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 transition-shadow resize-none"
                style={{ '--tw-ring-color': `${IGV.primaryColor}40` } as React.CSSProperties}
              />
              <p className="text-[0.82rem] text-white/50 leading-relaxed">
                Seus dados são tratados com sigilo pastoral. Não compartilhamos com terceiros.
              </p>
            </div>

            {/* Erro */}
            {state === 'error' && (
              <div className="flex items-start gap-2.5 bg-red-900/20 border border-red-600/30 rounded-xl px-4 py-3">
                <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" strokeWidth={2} />
                <p className="text-[0.92rem] text-red-300">{errMsg}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={state === 'submitting'}
              className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl font-semibold text-[1.02rem] text-white transition-opacity active:opacity-80 disabled:opacity-60 mt-1"
              style={{ backgroundColor: IGV.primaryColor }}
            >
              {state === 'submitting' ? (
                <span className="inline-block w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={16} strokeWidth={2} />
                  Enviar pedido
                </>
              )}
            </button>

          </form>
        )}

      </main>

      <footer className="text-center px-4 py-5 text-[0.82rem] text-white/50">
        {IGV.address}
      </footer>

    </div>
  )
}
