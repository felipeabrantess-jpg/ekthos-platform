// ============================================================
// Página de sucesso pós-checkout Stripe
// Disparada após pagamento confirmado via landing page.
// Slots preparados para pixels de conversão (Meta, GA4, GTag).
// ============================================================

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Check, Mail, ArrowRight, MessageCircle } from 'lucide-react'

const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER as string || '5511999999999'

// ── Pixel de conversão (disparado uma única vez) ───────────
function fireConversionPixels(sessionId: string) {
  try {
    // Google Ads
    if (typeof (window as unknown as Record<string, unknown>).gtag === 'function') {
      const gtag = (window as unknown as Record<string, unknown>).gtag as CallableFunction
      const gadsId    = import.meta.env.VITE_GADS_ID as string | undefined
      const gadsLabel = import.meta.env.VITE_GADS_LABEL as string | undefined
      if (gadsId && gadsLabel) {
        gtag('event', 'conversion', {
          send_to:         `${gadsId}/${gadsLabel}`,
          transaction_id:  sessionId,
        })
      }
    }
    // Meta Pixel
    if (typeof (window as unknown as Record<string, unknown>).fbq === 'function') {
      const fbq = (window as unknown as Record<string, unknown>).fbq as CallableFunction
      fbq('track', 'Purchase', { value: 0, currency: 'BRL' })
    }
    // GA4 purchase event
    if (typeof (window as unknown as Record<string, unknown>).gtag === 'function') {
      const gtag = (window as unknown as Record<string, unknown>).gtag as CallableFunction
      const ga4Id = import.meta.env.VITE_GA4_ID as string | undefined
      if (ga4Id) {
        gtag('event', 'purchase', {
          send_to:        ga4Id,
          transaction_id: sessionId,
          currency:       'BRL',
        })
      }
    }
    console.log('[checkout/sucesso] pixels disparados — session:', sessionId)
  } catch (e) {
    console.warn('[checkout/sucesso] erro ao disparar pixels:', e)
  }
}

// ── Passos do que acontece agora ──────────────────────────
const NEXT_STEPS = [
  {
    icon:  <Mail size={20} strokeWidth={1.75} />,
    title: 'Verifique seu email',
    body:  'Enviamos um link para você criar sua senha e acessar a plataforma. Pode levar até 5 minutos.',
  },
  {
    icon:  <Check size={20} strokeWidth={1.75} />,
    title: 'Configure sua conta',
    body:  'Nosso Consultor de Onboarding com IA guia você em 20 perguntas simples. Leva menos de 30 minutos.',
  },
  {
    icon:  <ArrowRight size={20} strokeWidth={1.75} />,
    title: 'Comece a usar',
    body:  'Sua plataforma estará pronta com os módulos configurados, o caminho de discipulado definido e os agentes IA ativos.',
  },
]

export default function CheckoutSucesso() {
  const [params]   = useSearchParams()
  const sessionId  = params.get('session_id') ?? ''
  const [fired, setFired] = useState(false)

  useEffect(() => {
    if (sessionId && !fired) {
      setFired(true)
      fireConversionPixels(sessionId)
    }
  }, [sessionId, fired])

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-16"
      style={{ background: 'var(--bg-primary)' }}>

      {/* Card central */}
      <div className="w-full max-w-lg">
        {/* Ícone de sucesso */}
        <div className="flex justify-center mb-8">
          <div className="relative">
            <div className="w-20 h-20 rounded-full flex items-center justify-center shadow-xl"
              style={{ background: 'var(--color-success)' }}>
              <Check size={36} strokeWidth={2.5} className="text-white" />
            </div>
            <div className="absolute inset-0 rounded-full animate-ping opacity-20"
              style={{ background: 'var(--color-success)' }} />
          </div>
        </div>

        {/* Headline */}
        <div className="text-center mb-10">
          <h1 className="font-display text-3xl font-bold mb-3" style={{ color: 'var(--text-primary)' }}>
            Pagamento confirmado! 🙏
          </h1>
          <p className="text-base leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Bem-vindo à Ekthos. Sua jornada de gestão pastoral inteligente começa agora.
          </p>
        </div>

        {/* Próximos passos */}
        <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border-default)' }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-5" style={{ color: '#8A8A8A' }}>
            O que acontece agora
          </p>
          <div className="space-y-5">
            {NEXT_STEPS.map((step, i) => (
              <div key={i} className="flex gap-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: i === 0 ? 'var(--color-primary)' : 'rgba(225,53,0,0.08)', color: i === 0 ? '#fff' : 'var(--color-primary)' }}>
                  {step.icon}
                </div>
                <div>
                  <p className="font-semibold text-sm mb-0.5" style={{ color: 'var(--text-primary)' }}>{step.title}</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTAs */}
        <div className="space-y-3">
          <Link to="/login"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl font-semibold text-white transition-all hover:opacity-90"
            style={{ background: 'var(--color-primary)' }}>
            Acessar a plataforma
            <ArrowRight size={18} strokeWidth={2} />
          </Link>

          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=Olá! Acabei de contratar o Ekthos e preciso de ajuda para começar.`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl font-semibold border-2 transition-all hover:shadow-md"
            style={{ borderColor: '#25D366', color: '#25D366' }}>
            <MessageCircle size={18} strokeWidth={2} />
            Falar com suporte no WhatsApp
          </a>
        </div>

        {/* Versículo */}
        <p className="text-center text-sm italic mt-8" style={{ color: '#8A8A8A' }}>
          "O Senhor mesmo irá à tua frente e estará contigo; não te deixará, nem te desamparará." — Dt 31:8
        </p>
      </div>
    </div>
  )
}
