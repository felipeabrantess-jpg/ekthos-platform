// ============================================================
// Página de cancelamento do checkout Stripe
// Exibida quando o pastor fecha o checkout sem pagar.
// ============================================================

import { Link } from 'react-router-dom'
import { ArrowLeft, MessageCircle } from 'lucide-react'

const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER as string || '5511999999999'

export default function CheckoutCancelado() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-16"
      style={{ background: '#f9eedc' }}>

      <div className="w-full max-w-md text-center">
        {/* Ícone */}
        <div className="text-5xl mb-6">🕊️</div>

        <h1 className="font-display text-3xl font-bold mb-3" style={{ color: '#161616' }}>
          Tudo bem, sem pressa.
        </h1>
        <p className="text-base leading-relaxed mb-8" style={{ color: '#5A5A5A' }}>
          Você fechou o pagamento. Se tiver alguma dúvida ou quiser conversar antes de decidir,
          nossa equipe está disponível para ajudar.
        </p>

        {/* Card de contorno de objeção */}
        <div className="bg-white rounded-2xl border p-6 mb-8 text-left" style={{ borderColor: '#f0e0c8' }}>
          <p className="font-semibold text-sm mb-4" style={{ color: '#161616' }}>Posso te ajudar com alguma dúvida?</p>
          <ul className="space-y-2.5">
            {[
              'Quer entender melhor qual plano faz sentido pra sua igreja?',
              'Tem dúvida sobre como funciona o pagamento ou a migração?',
              'Precisa ver uma demonstração antes de decidir?',
            ].map((q, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm" style={{ color: '#5A5A5A' }}>
                <span style={{ color: '#e13500', flexShrink: 0 }}>→</span>
                {q}
              </li>
            ))}
          </ul>
        </div>

        {/* CTAs */}
        <div className="space-y-3">
          <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=Olá! Estava tentando contratar o Ekthos mas fiquei com uma dúvida.`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl font-semibold text-white transition-all hover:opacity-90"
            style={{ background: '#25D366' }}>
            <MessageCircle size={18} strokeWidth={2} />
            Falar com consultor no WhatsApp
          </a>

          <Link to="/#pricing"
            className="flex items-center justify-center gap-2 w-full py-4 rounded-xl font-semibold border-2 transition-all hover:shadow-md"
            style={{ borderColor: '#e13500', color: '#e13500' }}>
            <ArrowLeft size={18} strokeWidth={2} />
            Voltar para os planos
          </Link>
        </div>

        <p className="text-xs mt-8" style={{ color: '#AAA' }}>
          Sem pressão. Quando estiver pronto, estaremos aqui. 🙏
        </p>
      </div>
    </div>
  )
}
