// ============================================================
// Landing Page — Ekthos Church
// Skills: ekthos-frontend + landing-page-ekthos
// Design: bg-white, cream sections, vermelho var(--color-primary)
// Rebuilt 2026-04-22: alternating layouts, no icon circles,
// no CSS mockups, no fake numbers, Preview MCP validated
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Check, ChevronDown, Menu, X, Star, Zap, Crown,
  Users, BarChart2,
  Bot, MessageCircle, Bell, Shield, TrendingUp,
  UserPlus, ShieldCheck, Smartphone,
} from 'lucide-react'
import EkthosIcon, { type EkthosIconName } from '@/components/EkthosIcon'
import LogoEkthos from '@/components/LogoEkthos'

// ── Env ────────────────────────────────────────────────────
const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL as string
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER as string || '5511999999999'

// ── Ekthos Cross — canal duplo, funciona em fundo claro ────
const EKTHOS_CROSS = (
  <svg width="38" height="38" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    {/* Linha externa da cruz */}
    <path d="M14 1 H26 V14 H39 V26 H26 V39 H14 V26 H1 V14 H14 Z"
      stroke="var(--color-primary)" strokeWidth="2.5" strokeLinejoin="round"/>
    {/* Linha interna — cria o canal duplo característico */}
    <path d="M16.5 3.5 H23.5 V16.5 H36.5 V23.5 H23.5 V36.5 H16.5 V23.5 H3.5 V16.5 H16.5 Z"
      stroke="var(--color-primary-dark)" strokeWidth="1.5" strokeLinejoin="round" opacity="0.7"/>
  </svg>
)

const WA_ICON = (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

// ── UTMs ───────────────────────────────────────────────────
function getUtmParams() {
  const p = new URLSearchParams(window.location.search)
  return {
    source:   p.get('utm_source')   ?? '',
    medium:   p.get('utm_medium')   ?? '',
    campaign: p.get('utm_campaign') ?? '',
    content:  p.get('utm_content')  ?? '',
  }
}

// ── FAQ ────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    q: 'Preciso ter conhecimento técnico para usar o Ekthos Church?',
    a: 'Não. O Ekthos Church foi projetado para pastores e líderes, não para programadores. A interface é intuitiva e o onboarding é guiado por um assistente que configura tudo por você em menos de 30 minutos.',
  },
  {
    q: 'Meus dados ficam seguros?',
    a: 'Sim. Utilizamos infraestrutura de nível bancário (Supabase + PostgreSQL com criptografia em repouso e em trânsito). Seus membros e dados pastorais ficam 100% privados e você pode exportar tudo a qualquer momento.',
  },
  {
    q: 'Como funciona o onboarding?',
    a: 'Após contratar, você recebe acesso imediato. Nosso Agente de Onboarding — um assistente com IA — guia você em 20 perguntas simples e configura todo o CRM em menos de 30 minutos.',
  },
  {
    q: 'Os agentes de IA realmente funcionam para igrejas?',
    a: 'Sim. Os agentes foram treinados com conhecimento pastoral e entendem o contexto da liderança evangélica. Eles falam a língua do pastor, não do desenvolvedor.',
  },
  {
    q: 'Quantos membros posso cadastrar?',
    a: 'Não há limite de membros cadastrados em nenhum plano. O número de usuários refere-se à equipe com acesso administrativo ao sistema, não ao número de membros da igreja.',
  },
  {
    q: 'O que inclui o módulo de Voluntários?',
    a: 'O módulo Volunteer Pro inclui organização de equipes, escalas automáticas com IA, confirmação de presença via WhatsApp, check-in/check-out e métricas de engajamento. Está incluso no plano Avivamento.',
  },
  {
    q: 'Como funciona o aplicativo próprio da igreja?',
    a: 'No plano Avivamento, sua igreja recebe um aplicativo exclusivo com sua identidade visual — logo, cores e nome. Seus membros baixam e acessam eventos, células, pedidos de oração e comunicados diretamente pelo celular.',
  },
  {
    q: 'Como funciona a consultoria nos planos Missão e Avivamento?',
    a: 'Ao solicitar contato, um consultor pastoral entra em contato em até 24h para entender a realidade da sua igreja e apresentar uma proposta personalizada. O processo é guiado e sem pressão.',
  },
]

// ══════════════════════════════════════════════════════════
// VIDEO PREMIUM BLOCK
// ══════════════════════════════════════════════════════════

function VideoSection() {
  const [open, setOpen] = useState(false)
  const VIDEO_URL = 'https://www.youtube.com/embed/PLACEHOLDER_ID?autoplay=1'

  return (
    <section className="pb-16 lg:pb-24 px-5 lg:px-8 max-w-5xl mx-auto text-center">
      {/* Tag editorial */}
      <div className="flex items-center justify-center gap-2 mb-5">
        <div className="h-px w-10 bg-current opacity-20" style={{ color: 'var(--color-primary)' }} />
        <span className="text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: 'var(--color-primary)' }}>
          VEJA EM 90 SEGUNDOS
        </span>
        <div className="h-px w-10 bg-current opacity-20" style={{ color: 'var(--color-primary)' }} />
      </div>

      {/* Container premium */}
      <div
        className="relative rounded-3xl overflow-hidden cursor-pointer group"
        style={{
          background: 'linear-gradient(135deg, rgba(41,182,255,0.08) 0%, rgba(76,234,216,0.06) 50%, rgba(41,182,255,0.04) 100%)',
          border: '1px solid rgba(41,182,255,0.15)',
          boxShadow: '0 8px 40px rgba(41,182,255,0.12), 0 0 0 1px rgba(41,182,255,0.08)',
        }}
        onClick={() => setOpen(true)}
        role="button"
        aria-label="Assistir apresentação do Ekthos Church"
      >
        {/* Thumbnail placeholder */}
        <div className="aspect-video relative">
          <img
            src="/screenshots/painel.png"
            alt="Preview Ekthos Church"
            className="w-full h-full object-cover opacity-60 group-hover:opacity-75 transition-opacity duration-300"
          />
          {/* Aurora overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'linear-gradient(160deg, rgba(41,182,255,0.15) 0%, rgba(76,234,216,0.08) 60%, transparent 100%)' }}
          />

          {/* Play button */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="relative flex items-center justify-center rounded-full transition-transform duration-200 group-hover:scale-110"
              style={{
                width: 72, height: 72,
                background: 'var(--color-primary)',
                boxShadow: '0 0 0 12px rgba(41,182,255,0.18), 0 0 0 24px rgba(41,182,255,0.08)',
              }}
            >
              {/* Pulse ring */}
              <span
                className="absolute inset-0 rounded-full animate-ping"
                style={{ background: 'var(--color-primary)', opacity: 0.25 }}
              />
              <svg viewBox="0 0 24 24" className="w-8 h-8 fill-white ml-1" aria-hidden>
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Caption editorial */}
      <p className="mt-4 text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
        Veja como o Ekthos Church transforma a gestão pastoral —
        da presença ao discipulado, em menos de dois minutos.
      </p>

      {/* Modal de vídeo */}
      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8"
          style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}
          onClick={() => setOpen(false)}
        >
          <div
            className="relative w-full max-w-4xl rounded-2xl overflow-hidden"
            style={{ boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}
            onClick={e => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 z-10 rounded-full p-1.5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              onClick={() => setOpen(false)}
              aria-label="Fechar"
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round"/>
              </svg>
            </button>
            <div className="aspect-video">
              <iframe
                src={VIDEO_URL}
                className="w-full h-full"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                title="Ekthos Church — apresentação"
              />
            </div>
          </div>
        </div>
      )}
    </section>
  )
}

// ══════════════════════════════════════════════════════════
// ECOSSISTEMA — GLASS OUTLINE ICONS
// ══════════════════════════════════════════════════════════

const ECOSSISTEMA_ITEMS: { icon: EkthosIconName; label: string; desc: string }[] = [
  { icon: 'pessoas',       label: 'Pessoas',          desc: 'Cadastro pastoral completo com histórico de cada membro' },
  { icon: 'discipulado',   label: 'Discipulado',       desc: 'Pipeline editável do visitante ao líder em 11 etapas' },
  { icon: 'eventos',       label: 'Eventos',           desc: 'Calendário recorrente com checklist e presença automática' },
  { icon: 'celulas',       label: 'Células',           desc: 'Gestão de grupos, líderes, relatórios e frequência' },
  { icon: 'voluntarios',   label: 'Voluntários',       desc: 'Escalas inteligentes com confirmação por WhatsApp' },
  { icon: 'notificacoes',  label: 'Notificações',      desc: 'Alertas pastorais em tempo real — ausências, aniversários, crises' },
  { icon: 'qr-entrada',    label: 'QR de Entrada',     desc: 'Check-in por QR code e presença em cultos sem fricção' },
  { icon: 'mensageria-ia', label: 'Mensageria IA',     desc: 'Agentes pastorais que se comunicam automaticamente com os membros' },
  { icon: 'cockpit',       label: 'Cockpit Pastoral',  desc: 'Visão 360° da saúde espiritual e operacional da sua igreja' },
]

function EcossistemaSection() {
  return (
    <section className="py-20 lg:py-28 px-5 lg:px-8 w-full bg-[#161616]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-bold tracking-[0.18em] uppercase mb-3" style={{ color: 'var(--color-primary)' }}>
            Ecossistema completo
          </p>
          <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4 text-white leading-tight">
            Tudo que sua igreja precisa,<br className="hidden lg:block" /> em um só lugar
          </h2>
          <p className="text-base text-white/50 max-w-xl mx-auto leading-relaxed">
            Cada módulo foi pensado para o cotidiano pastoral —
            não para o relatório corporativo.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ECOSSISTEMA_ITEMS.map(({ icon, label, desc }) => (
            <div
              key={icon}
              className="group relative rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5"
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                backdropFilter: 'blur(8px)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(41,182,255,0.06)'
                ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(41,182,255,0.2)'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.03)'
                ;(e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.07)'
              }}
            >
              {/* Glow sutil no hover */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 30% 30%, rgba(41,182,255,0.08) 0%, transparent 70%)' }}
              />

              <div className="flex items-start gap-4 relative">
                <div
                  className="shrink-0 flex items-center justify-center rounded-xl"
                  style={{
                    width: 44, height: 44,
                    background: 'rgba(41,182,255,0.1)',
                    border: '1px solid rgba(41,182,255,0.18)',
                    color: 'var(--color-primary)',
                  }}
                >
                  <EkthosIcon name={icon} size={22} strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-white mb-1">{label}</p>
                  <p className="text-xs leading-relaxed text-white/45">{desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════

export default function Landing() {
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null)
  const [showWa,       setShowWa]       = useState(false)
  const [faqOpen,      setFaqOpen]      = useState<number | null>(null)
  const [scrolled,     setScrolled]     = useState(false)
  const [leadModal,    setLeadModal]    = useState<'missao' | 'avivamento' | null>(null)
  const pricingRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const t = setTimeout(() => setShowWa(true), 3000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = leadModal ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [leadModal])

  async function handleCheckout(planSlug: string) {
    if (checkoutPlan) return
    setCheckoutPlan(planSlug)
    const utm    = getUtmParams()
    const origin = window.location.origin
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/stripe-checkout-public`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          plan_slug:    planSlug,
          success_url:  `${origin}/checkout/sucesso`,
          cancel_url:   `${origin}/#pricing`,
          utm_source:   utm.source,
          utm_medium:   utm.medium,
          utm_campaign: utm.campaign,
          utm_content:  utm.content,
        }),
      })
      if (!res.ok) throw new Error('Erro ao criar sessão')
      const { url } = await res.json() as { url: string }
      window.location.href = url
    } catch {
      setCheckoutPlan(null)
      alert('Erro ao iniciar pagamento. Por favor, tente novamente.')
    }
  }

  function scrollToPricing() {
    pricingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMenuOpen(false)
  }

  const waHref = `https://wa.me/${WHATSAPP_NUMBER}?text=Ol%C3%A1%21+Quero+conhecer+o+Ekthos+Church`

  return (
    <div className="min-h-screen font-body antialiased text-[#161616] overflow-x-hidden" style={{ background: 'var(--bg-primary)' }}>

      {/* ── 1. NAVBAR ─────────────────────────────────────────── */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-white/95 backdrop-blur-md border-b border-gray-100 ${scrolled ? 'shadow-sm' : ''}`}>
        <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center shrink-0">
            <LogoEkthos height={28} color="#161616" showChurch={true} />
          </a>

          <nav className="hidden md:flex items-center gap-7">
            {[
              { label: 'Funcionalidades', href: '#funcionalidades' },
              { label: 'Agentes IA',      href: '#agentes' },
              { label: 'Planos',          href: '#pricing' },
              { label: 'FAQ',             href: '#faq' },
            ].map(l => (
              <a key={l.href} href={l.href}
                className="text-sm font-medium text-gray-500 hover:text-[#161616] transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link to="/login"
              className="text-sm font-medium px-4 py-2 rounded-xl text-gray-500 hover:text-[#161616] transition-colors">
              Entrar
            </Link>
            <button onClick={scrollToPricing}
              className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: 'var(--color-primary)' }}>
              Ver planos
            </button>
          </div>

          <button onClick={() => setMenuOpen(o => !o)} className="md:hidden p-2 text-gray-500">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden px-5 pb-6 pt-2 flex flex-col gap-4 bg-white border-t border-gray-100">
            {['#funcionalidades', '#agentes', '#pricing', '#faq'].map((href, i) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}
                className="text-sm font-medium py-1 text-gray-600">
                {['Funcionalidades', 'Agentes IA', 'Planos', 'FAQ'][i]}
              </a>
            ))}
            <div className="flex gap-3 pt-2">
              <Link to="/login" onClick={() => setMenuOpen(false)}
                className="flex-1 text-center text-sm font-medium py-2.5 rounded-xl border border-gray-200 text-[#161616]">
                Entrar
              </Link>
              <button onClick={scrollToPricing}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl text-white"
                style={{ background: 'var(--color-primary)' }}>
                Ver planos
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ── 2. HERO ───────────────────────────────────────────── */}
      <section className="pt-28 pb-16 lg:pt-36 lg:pb-24 px-5 lg:px-8 max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

          {/* Copy */}
          <div className="flex-1 text-center lg:text-left">
            <h1 className="font-display text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight mb-6 text-[#161616]"
              style={{ letterSpacing: '-0.02em' }}>
              Sua igreja merece uma gestão{' '}
              <span style={{ color: 'var(--color-primary)' }}>à altura do chamado</span>
            </h1>

            <p className="text-lg lg:text-xl leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0 text-gray-500">
              CRM pastoral com inteligência artificial. Acompanhe cada membro,
              automatize tarefas repetitivas e foque no que realmente importa:
              cuidar da sua comunidade.
            </p>

            <p className="text-sm italic mb-8" style={{ color: 'var(--color-primary-text)' }}>
              "Conhece o estado do teu rebanho e põe o coração nos teus gados." — Pv 27:23
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <button onClick={scrollToPricing}
                className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white font-semibold text-base transition-all hover:bg-[var(--color-primary-dark)] active:scale-[0.98] shadow-lg shadow-primary/20"
                style={{ background: 'var(--color-primary)', minHeight: 56 }}>
                Começar agora →
              </button>
              <a href={waHref} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-base text-white transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: '#25D366', minHeight: 56 }}>
                {WA_ICON} Falar no WhatsApp
              </a>
            </div>

            <p className="mt-8 text-sm text-gray-400 text-center lg:text-left">
              Setup completo em menos de 30 minutos · Suporte em português
            </p>
          </div>

          {/* Screenshot stage — hero asset com palco visual */}
          <div className="flex-1 w-full pt-8 lg:pt-0">
            {/* Stage container — tem identidade visual própria, não é só fundo branco */}
            <div className="relative rounded-3xl overflow-hidden"
              style={{
                background: 'linear-gradient(150deg, #EDE5D8 0%, #F4EDE4 45%, #E6DDD0 100%)',
                padding: '32px 20px 0',
              }}>

              {/* Acento brand — brilho sutil vindo do produto */}
              <div className="absolute inset-x-0 top-0 h-56 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(225,53,0,0.09), transparent 68%)' }} />

              {/* Screenshot de apoio — camada de profundidade, atrás do principal (só desktop) */}
              <div className="absolute hidden lg:block rounded-xl overflow-hidden"
                style={{
                  width: '62%', top: 28, right: 18, zIndex: 1,
                  opacity: 0.42,
                  transform: 'perspective(900px) rotateY(-10deg) rotateX(4deg) scale(0.85)',
                  boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
                  filter: 'brightness(0.78) blur(0.4px)',
                }}>
                <img src="/screenshots/pessoas.png" alt="" loading="lazy" className="w-full block" />
              </div>

              {/* Screenshot principal — o hero asset, dominante */}
              <div className="relative rounded-2xl overflow-hidden"
                style={{
                  zIndex: 2,
                  transform: 'perspective(1100px) rotateY(-2.5deg) rotateX(1.5deg)',
                  boxShadow: '0 2px 0 rgba(255,255,255,0.55), 0 20px 48px rgba(0,0,0,0.20), 0 52px 88px rgba(0,0,0,0.13)',
                }}>
                <img src="/screenshots/painel.png" alt="Dashboard Ekthos Church"
                  loading="eager" className="w-full block" />
              </div>

              {/* Plano de base — ancora a composição, cria profundidade embaixo */}
              <div className="absolute bottom-0 inset-x-0 h-2/5 pointer-events-none rounded-b-3xl"
                style={{ background: 'linear-gradient(to top, rgba(22,22,22,0.13) 0%, transparent 100%)' }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── 2.5. VÍDEO PREMIUM ───────────────────────────────────── */}
      <VideoSection />

      {/* ── 3. FATOS ──────────────────────────────────────────── */}
      <section className="py-14 border-y w-full" style={{ background: '#F6F2EC', borderColor: '#E8E0D4' }}>
        <div className="max-w-5xl mx-auto px-5 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { label: 'Setup completo',         sub: 'menos de 30 minutos' },
              { label: 'IA pastoral',             sub: 'treinada para igrejas' },
              { label: 'Dados 100% seus',         sub: 'exportação a qualquer hora' },
              { label: 'Suporte em português',    sub: 'time pastoral dedicado' },
            ].map(s => (
              <div key={s.label} className="py-2">
                <p className="font-display text-base font-bold mb-1 text-[#161616]">{s.label}</p>
                <p className="text-sm text-gray-500">{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. PROBLEMA ───────────────────────────────────────── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-primary)' }}>
            A realidade de muitas igrejas
          </p>
          <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4 text-[#161616]">
            Você não consegue cuidar de todos sozinho
          </h2>
          <p className="text-lg max-w-2xl mx-auto text-gray-500">
            Crescer sem ferramentas é como pastorear no escuro. Você sente, mas não vê.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: <Users size={20} strokeWidth={1.75} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />,
              title: 'Membros se afastando em silêncio',
              body: 'Você só percebe que alguém saiu quando já foi embora. Sem dados, sem alertas, sem acompanhamento sistemático.',
            },
            {
              icon: <BarChart2 size={20} strokeWidth={1.75} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />,
              title: 'Horas perdidas em tarefas manuais',
              body: 'Planilhas, WhatsApp, cadernos. O pastor gasta mais tempo organizando do que pastoreando.',
            },
            {
              icon: <TrendingUp size={20} strokeWidth={1.75} style={{ color: 'var(--color-primary)', flexShrink: 0 }} />,
              title: 'Decisões sem dados reais',
              body: 'Sem métricas, você navega por intuição. Quantos visitantes voltaram? Qual ministério está em queda?',
            },
          ].map((p, i) => (
            <div key={i} className="bg-white rounded-2xl p-7 border border-gray-200 hover:border-primary/30 transition-all duration-200">
              <div className="flex items-center gap-2.5 mb-4">
                {p.icon}
                <h3 className="font-semibold text-base text-[#161616]">{p.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-gray-500">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. AGENTES IA ─────────────────────────────────────── */}
      <section id="agentes" className="py-20 lg:py-28 px-5 lg:px-8 bg-[#161616] w-full">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3"
              style={{ color: 'rgba(225,53,0,0.8)' }}>Inteligência Artificial pastoral</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4" style={{ color: '#f9eedc' }}>
              Agentes que conhecem a linguagem da igreja
            </h2>
            <p className="text-lg max-w-2xl" style={{ color: 'rgba(249,238,220,0.6)' }}>
              Não são chatbots genéricos. São assistentes treinados com o vocabulário e a sensibilidade pastoral.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-x-20 gap-y-0">
            {[
              { icon: <Bot           size={16} />, slug: 'Suporte',    desc: 'Responde dúvidas da equipe 24h por dia, nunca te deixa sem resposta.' },
              { icon: <Users         size={16} />, slug: 'Onboarding', desc: 'Configura todo o CRM em 30 minutos guiando o pastor por perguntas simples.' },
              { icon: <MessageCircle size={16} />, slug: 'Cadastro',   desc: 'Registra visitantes e membros automaticamente via formulário inteligente.' },
              { icon: <Bell          size={16} />, slug: 'Conteúdo',   desc: 'Gera comunicados pastorais, roteiros de culto e materiais de célula com IA.' },
              { icon: <TrendingUp    size={16} />, slug: 'Métricas',   desc: 'Gera relatórios de crescimento, frequência e saúde da comunidade.' },
              { icon: <Shield        size={16} />, slug: 'WhatsApp',   desc: 'Envia comunicados pelo WhatsApp de forma automatizada e segmentada.' },
            ].map((a, i) => (
              <div key={i} className="flex items-start gap-5 py-8 border-b"
                style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
                <span className="font-mono text-4xl font-bold leading-none shrink-0 w-12 text-right"
                  style={{ color: 'rgba(225,53,0,0.18)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span style={{ color: '#f9eedc' }}>{a.icon}</span>
                    <h3 className="font-semibold" style={{ color: '#f9eedc' }}>Agente {a.slug}</h3>
                  </div>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(249,238,220,0.55)' }}>{a.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 5.5. ECOSSISTEMA ─────────────────────────────────────── */}
      <EcossistemaSection />

      {/* ── 6. FUNCIONALIDADES (ALTERNATING) ──────────────────── */}
      <section id="funcionalidades" className="py-20 lg:py-28 px-5 lg:px-8 w-full" style={{ background: 'var(--bg-primary)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-primary)' }}>
              Tudo que sua operação pastoral precisa
            </p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-[#161616]">
              Um CRM feito para igrejas
            </h2>
            <p className="text-lg max-w-xl mx-auto mt-4 text-gray-500">
              Cada módulo foi desenhado para a realidade do pastor brasileiro.
            </p>
          </div>

          {[
            {
              reverse: false,
              screenshot: '/screenshots/painel.png',
              alt: 'Dashboard Ekthos Church',
              label: 'Dashboard pastoral',
              title: 'Visão completa da sua comunidade',
              body: 'Métricas em tempo real de membros, visitantes, células e convertidos. Alertas de afastamento automáticos antes que você precise perguntar.',
              items: [
                'Membros ativos, em risco e afastados — em tempo real',
                'Alertas automáticos de afastamento',
                'Redes e células com visão hierárquica',
                'Relatório de novos convertidos e retenção',
              ],
            },
            {
              reverse: true,
              screenshot: '/screenshots/pessoas.png',
              alt: 'Gestão de pessoas',
              label: 'Gestão de pessoas',
              title: 'Cada membro, acompanhado de perto',
              body: 'Cadastro completo com histórico de visitas, batismo e discipulado. Registre visitantes em segundos com QR Code e acompanhe o caminho de cada pessoa.',
              items: [
                'Perfil pastoral completo de cada membro',
                'Registro de visitante por QR Code',
                'Filtros por Visitante, Membro ou Líder',
                'Histórico de presença e interações',
              ],
            },
            {
              reverse: false,
              screenshot: '/screenshots/ministerios.png',
              alt: 'Ministérios e células',
              label: 'Ministérios e células',
              title: 'Sua rede pastoral sob controle',
              body: 'Gerencie todos os ministérios, células e redes em um só lugar. Saúde de cada grupo em tempo real, com alertas quando uma célula para de se reunir.',
              items: [
                'Louvor, Diaconal, Missões e muito mais',
                'Líderes e responsáveis por célula',
                'Alertas de células sem reunião',
                'Funil de conversão por rede pastoral',
              ],
            },
            {
              reverse: true,
              screenshot: '/screenshots/agenda.png',
              alt: 'Agenda e relatórios',
              label: 'Agenda e relatórios',
              title: 'Nenhum evento, nenhum dado perdido',
              body: 'Calendário completo de cultos, encontros e eventos. Taxa de retenção mês a mês. Compare períodos e entenda o crescimento da sua comunidade.',
              items: [
                'Calendário mensal com eventos categorizados',
                'Taxa de retenção de convertidos',
                'Análise comparativa mensal e anual',
                'Exportação CSV para relatórios externos',
              ],
            },
          ].map((feat, i) => (
            <div
              key={i}
              className={`flex flex-col ${feat.reverse ? 'lg:flex-row-reverse' : 'lg:flex-row'} items-center gap-12 lg:gap-20 py-16 ${i < 3 ? 'border-b border-gray-100' : ''}`}
            >
              {/* Text */}
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-primary)' }}>
                  {feat.label}
                </p>
                <h3 className="font-display text-2xl lg:text-3xl font-bold mb-4 text-[#161616]">
                  {feat.title}
                </h3>
                <p className="text-gray-500 leading-relaxed mb-7">{feat.body}</p>
                <ul className="space-y-3">
                  {feat.items.map(item => (
                    <li key={item} className="flex items-start gap-3 text-sm text-[#161616]">
                      <Check size={16} strokeWidth={2.5} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 2 }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Screenshot */}
              <div className="flex-1 w-full rounded-2xl p-3 lg:p-4"
                style={{ background: '#f4f4f5' }}>
                <img
                  src={feat.screenshot}
                  alt={feat.alt}
                  loading="lazy"
                  className="w-full rounded-xl border border-black/[0.06]"
                  style={{ boxShadow: '0 16px 48px rgba(0,0,0,0.18)', display: 'block' }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 7. VOLUNTEER + KIDS ───────────────────────────────── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 w-full" style={{ background: '#F6F2EC' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-primary)' }}>
              Soluções especializadas
            </p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-[#161616]">
              Para sua operação pastoral completa
            </h2>
            <p className="text-lg max-w-xl mx-auto mt-4 text-gray-500">
              Módulos especializados para as áreas que mais demandam atenção nas igrejas em crescimento.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Volunteer Pro */}
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="flex items-start justify-between mb-5">
                <h3 className="font-display text-xl font-bold text-[#161616] flex items-center gap-2.5">
                  <UserPlus size={20} strokeWidth={1.75} style={{ color: 'var(--color-primary)' }} />
                  Gestão de Voluntários e Escalas
                </h3>
                <span className="shrink-0 px-3 py-1 rounded-full text-xs font-bold text-white ml-3"
                  style={{ background: '#670000' }}>Avivamento</span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Organize equipes, gere escalas inteligentes, confirme presença via WhatsApp
                e acompanhe o engajamento dos seus voluntários.
              </p>
              <ul className="space-y-2.5">
                {[
                  'Equipes e funções organizadas',
                  'Escalas automáticas com IA',
                  'Confirmação via WhatsApp',
                  'Check-in e check-out',
                  'Trocas entre voluntários',
                  'Métricas de engajamento',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-[#161616]">
                    <Check size={15} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Kids Pro */}
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200">
              <div className="flex items-start justify-between mb-5">
                <h3 className="font-display text-xl font-bold text-[#161616] flex items-center gap-2.5">
                  <ShieldCheck size={20} strokeWidth={1.75} style={{ color: '#2D7A4F' }} />
                  Ministério Infantil Seguro
                </h3>
                <span className="shrink-0 px-3 py-1 rounded-full text-xs font-bold text-white ml-3"
                  style={{ background: '#670000' }}>Avivamento</span>
              </div>
              <p className="text-gray-500 text-sm leading-relaxed mb-6">
                Segurança total para as crianças. Check-in com QR Code, validação de
                responsáveis e comunicação instantânea com os pais.
              </p>
              <ul className="space-y-2.5">
                {[
                  'Cadastro de crianças e responsáveis',
                  'Check-in com QR Code',
                  'Check-out seguro com validação',
                  'Alertas via WhatsApp aos pais',
                  'Controle de alergias e restrições',
                  'Relatórios de frequência',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-[#161616]">
                    <Check size={15} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0 }} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. APP PRÓPRIO DA IGREJA ──────────────────────────── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-[#161616] w-full">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-24">

            {/* Copy */}
            <div className="flex-1 text-center lg:text-left">
              <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-bold mb-6 border"
                style={{ background: 'rgba(225,53,0,0.15)', color: 'var(--color-primary)', borderColor: 'rgba(225,53,0,0.25)' }}>
                <Smartphone size={12} /> Exclusivo do plano Avivamento
              </span>
              <h2 className="font-display text-3xl lg:text-4xl font-bold mb-5" style={{ color: '#f9eedc' }}>
                Sua igreja com{' '}
                <span style={{ color: 'var(--color-primary)' }}>aplicativo próprio</span>
              </h2>
              <p className="text-lg leading-relaxed mb-8 max-w-lg" style={{ color: 'rgba(249,238,220,0.7)' }}>
                No plano Avivamento, sua igreja ganha um aplicativo exclusivo com a identidade,
                logo e cores da sua comunidade. Seus membros acessam tudo pelo celular.
              </p>
              <ul className="space-y-4 mb-10">
                {[
                  ['Identidade visual exclusiva da sua igreja',     'Logo, cores e nome — sem Ekthos na frente'],
                  ['Notificações para eventos e comunicados',       'Alcance seus membros onde eles estão'],
                  ['Mural de pedidos de oração',                    'Comunidade conectada em fé'],
                  ['Agenda de cultos e células acessível',          'Calendário sempre atualizado'],
                  ['Conteúdo devocional e materiais',               'Devocionais, estudos e avisos'],
                ].map(([main, sub]) => (
                  <li key={main} className="flex items-start gap-3">
                    <Check size={16} strokeWidth={2.5} style={{ color: 'var(--color-primary)', flexShrink: 0, marginTop: 3 }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'rgba(249,238,220,0.9)' }}>{main}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'rgba(249,238,220,0.45)' }}>{sub}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <button onClick={() => setLeadModal('avivamento')}
                className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-white text-base transition-all hover:opacity-90 active:scale-[0.98]"
                style={{ background: 'var(--color-primary)', minHeight: 52 }}>
                Solicitar contato sobre o Avivamento →
              </button>
            </div>

            {/* Screenshot do app / visual real */}
            <div className="flex-1 w-full">
              <div className="rounded-2xl overflow-hidden border border-white/10"
                style={{ boxShadow: '0 32px 64px rgba(0,0,0,0.5)' }}>
                <img
                  src="/screenshots/painel.png"
                  alt="Aplicativo Ekthos Church"
                  loading="lazy"
                  className="w-full block"
                />
              </div>
              <p className="text-center text-xs mt-4" style={{ color: 'rgba(249,238,220,0.3)' }}>
                Interface personalizada com a identidade da sua igreja
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. PRICING ────────────────────────────────────────── */}
      <section id="pricing" ref={pricingRef}
        className="py-20 lg:py-32 px-5 lg:px-8 scroll-mt-20 w-full" style={{ background: '#F0EAE0' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-primary)' }}>Planos</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4 text-[#161616]">
              Investimento que se paga com o primeiro membro retido
            </h2>
            <p className="text-lg max-w-xl mx-auto text-gray-500">
              Do self-service ao consultivo — escolha o que faz sentido para a sua igreja.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-start">

            {/* ── CHAMADO ── */}
            <div className="relative bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
              <div className="p-7 flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <Star size={18} strokeWidth={1.75} style={{ color: '#5A5A5A' }} />
                  <div>
                    <p className="font-semibold text-base text-[#161616]">Chamado</p>
                    <p className="text-xs text-gray-400">Igrejas de até 500 membros</p>
                  </div>
                </div>

                <div className="mb-1">
                  <span className="font-mono font-bold text-4xl text-[#161616]">R$689,90</span>
                  <span className="text-sm ml-1 text-gray-400">/mês</span>
                </div>
                <p className="text-xs text-gray-400 mb-6">Acesso imediato após contratação</p>

                <ul className="space-y-2.5 mb-4">
                  {[
                    '5 usuários administrativos',
                    'Dashboard pastoral completo',
                    'Cadastro e acompanhamento de membros',
                    'Caminho de discipulado (pipeline)',
                    'Rede de células e ministérios',
                    'Agente Suporte 24h',
                    'Agente Onboarding',
                    'Suporte por email',
                  ].map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={15} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0, marginTop: 1 }} />
                      <span className="text-[#161616]">{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-400 italic px-1">
                  Módulos Volunteer Pro e Ministério Infantil disponíveis como complemento.
                </p>
              </div>
              <div className="px-7 pb-7">
                <button
                  onClick={() => handleCheckout('chamado')}
                  disabled={checkoutPlan === 'chamado'}
                  className="w-full py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'transparent', color: 'var(--color-primary)', border: '2px solid var(--color-primary)', minHeight: 52 }}>
                  {checkoutPlan === 'chamado' ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Aguarde...
                    </span>
                  ) : 'Contratar agora →'}
                </button>
                <p className="text-center text-xs mt-2 text-gray-400">Acesso imediato</p>
              </div>
            </div>

            {/* ── MISSÃO (popular) ── */}
            <div className="relative bg-[#161616] rounded-2xl border-2 border-[var(--color-primary)] shadow-xl scale-[1.02] flex flex-col">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="px-4 py-1.5 rounded-full text-xs font-bold text-white"
                  style={{ background: 'var(--color-primary)' }}>Mais popular</span>
              </div>

              <div className="p-7 flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <Zap size={18} strokeWidth={1.75} style={{ color: 'var(--color-primary)' }} />
                  <div>
                    <p className="font-semibold text-base" style={{ color: '#f9eedc' }}>Missão</p>
                    <p className="text-xs" style={{ color: 'rgba(249,238,220,0.5)' }}>Igrejas de até 1.000 membros</p>
                  </div>
                </div>

                <div className="mb-1">
                  <span className="font-display font-bold text-2xl" style={{ color: '#f9eedc' }}>Plano personalizado</span>
                </div>
                <p className="text-xs mb-6" style={{ color: 'rgba(249,238,220,0.4)' }}>Proposta sob medida para a sua realidade</p>

                <ul className="space-y-2.5 mb-4">
                  {[
                    '8 usuários administrativos',
                    'Tudo do plano Chamado',
                    'Agente Cadastro incluso',
                    'Relatórios automáticos',
                    'Automações pastorais',
                    'Escalas básicas de voluntários',
                    'Suporte prioritário',
                  ].map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={15} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0, marginTop: 1 }} />
                      <span style={{ color: 'rgba(249,238,220,0.85)' }}>{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs italic px-1" style={{ color: 'rgba(249,238,220,0.35)' }}>
                  Módulos Volunteer Pro e Ministério Infantil disponíveis como complemento.
                </p>
              </div>
              <div className="px-7 pb-7">
                <button
                  onClick={() => setLeadModal('missao')}
                  className="w-full py-4 rounded-xl font-semibold text-base text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: 'var(--color-primary)', minHeight: 52 }}>
                  Solicitar contato →
                </button>
                <p className="text-center text-xs mt-2" style={{ color: 'rgba(249,238,220,0.35)' }}>
                  Consultoria personalizada
                </p>
              </div>
            </div>

            {/* ── AVIVAMENTO ── */}
            <div className="relative bg-white rounded-2xl border border-gray-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 flex flex-col">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="px-4 py-1.5 rounded-full text-xs font-bold text-white"
                  style={{ background: '#670000' }}>Enterprise</span>
              </div>

              <div className="p-7 flex-1 pt-10">
                <div className="flex items-center gap-3 mb-5">
                  <Crown size={18} strokeWidth={1.75} style={{ color: '#670000' }} />
                  <div>
                    <p className="font-semibold text-base text-[#161616]">Avivamento</p>
                    <p className="text-xs text-gray-400">Igrejas acima de 1.000 membros</p>
                  </div>
                </div>

                <div className="mb-1">
                  <span className="font-display font-bold text-2xl text-[#161616]">Plano sob medida</span>
                </div>
                <p className="text-xs text-gray-400 mb-4">Proposta dedicada para operações complexas</p>

                <div className="rounded-xl p-4 mb-5 border" style={{ background: 'rgba(103,0,0,0.04)', borderColor: 'rgba(103,0,0,0.08)' }}>
                  <p className="text-xs font-bold text-[#670000] mb-2">Inclui exclusivamente:</p>
                  <div className="space-y-1.5">
                    {[
                      'Volunteer Pro — escalas e equipes',
                      'Ministério Infantil (Kids)',
                      'Aplicativo próprio da igreja',
                    ].map(d => (
                      <div key={d} className="flex items-center gap-2 text-xs font-medium text-[#161616]">
                        <Check size={13} strokeWidth={2.5} style={{ color: '#670000' }} />
                        {d}
                      </div>
                    ))}
                  </div>
                </div>

                <ul className="space-y-2.5 mb-6">
                  {[
                    '10 usuários administrativos',
                    'Tudo do plano Missão',
                    '6 agentes IA completos',
                    'Multi-site (múltiplas sedes)',
                    'Suporte dedicado',
                  ].map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={15} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0, marginTop: 1 }} />
                      <span className="text-[#161616]">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-7 pb-7">
                <button
                  onClick={() => setLeadModal('avivamento')}
                  className="w-full py-4 rounded-xl font-semibold text-base text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: 'var(--color-primary)', minHeight: 52 }}>
                  Solicitar contato →
                </button>
                <p className="text-center text-xs mt-2 text-gray-400">Acompanhamento dedicado</p>
              </div>
            </div>
          </div>

          {/* Addons */}
          <div className="mt-10 bg-white rounded-2xl border border-gray-200 p-6 lg:p-8">
            <p className="font-semibold text-center mb-6 text-[#161616]">
              Complementos disponíveis nos planos Chamado e Missão
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: <UserPlus size={16} strokeWidth={1.75} />,   title: 'Volunteer Pro',       price: 'Sob consulta', desc: 'Escalas, check-in, confirmação WhatsApp e métricas de voluntários.' },
                { icon: <ShieldCheck size={16} strokeWidth={1.75} />, title: 'Ministério Infantil', price: 'Sob consulta', desc: 'Check-in QR Code, validação de responsáveis e alertas aos pais.' },
                { icon: <Users size={16} strokeWidth={1.75} />,       title: 'Usuário adicional',   price: 'Sob consulta', desc: 'Adicione mais líderes com acesso administrativo ao sistema.' },
              ].map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl" style={{ background: '#f9eedc' }}>
                  <span style={{ color: 'var(--color-primary)', marginTop: 2 }}>{a.icon}</span>
                  <div>
                    <p className="font-semibold text-sm text-[#161616]">{a.title}</p>
                    <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--color-primary)' }}>{a.price}</p>
                    <p className="text-xs mt-0.5 text-gray-400">{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 10. COMPARATIVO ───────────────────────────────────── */}
      <section className="py-16 px-5 lg:px-8 w-full" style={{ background: 'var(--bg-primary)' }}>
        <div className="max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="font-display text-2xl lg:text-3xl font-bold mb-3 text-[#161616]">
            Por que igrejas migram para o Ekthos Church?
          </h2>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#f9eedc' }}>
                <th className="text-left p-4 font-semibold text-[#161616]">Recurso</th>
                <th className="p-4 text-center font-semibold text-gray-400">Planilhas</th>
                <th className="p-4 text-center font-semibold text-gray-400">CRM Genérico</th>
                <th className="p-4 text-center font-semibold" style={{ color: 'var(--color-primary)', background: 'rgba(225,53,0,0.05)' }}>Ekthos Church</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Fala a linguagem da igreja',          false, false, true],
                ['Caminho de discipulado',               false, false, true],
                ['Agentes IA pastorais',                 false, false, true],
                ['Setup em 30 minutos',                  false, false, true],
                ['Alertas de membros afastados',         false, false, true],
                ['Controle de células e ministérios',    false, false, true],
                ['Relatórios automáticos',               false, true,  true],
                ['Aplicativo próprio da igreja',         false, false, true],
                ['Suporte em português',                 false, false, true],
              ].map(([label, col1, col2, col3]) => (
                <tr key={String(label)} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td className="p-4 text-[#161616]">{label}</td>
                  <td className="p-4 text-center">{col1 ? <Check size={16} style={{ color: '#2D7A4F', margin: '0 auto' }} /> : <X size={16} style={{ color: '#CCC', margin: '0 auto' }} />}</td>
                  <td className="p-4 text-center">{col2 ? <Check size={16} style={{ color: '#2D7A4F', margin: '0 auto' }} /> : <X size={16} style={{ color: '#CCC', margin: '0 auto' }} />}</td>
                  <td className="p-4 text-center" style={{ background: 'rgba(225,53,0,0.03)' }}>{col3 ? <Check size={16} style={{ color: 'var(--color-primary)', margin: '0 auto' }} /> : <X size={16} style={{ color: '#CCC', margin: '0 auto' }} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </section>

      {/* ── 11. DEPOIMENTOS ───────────────────────────────────── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 bg-[#161616] w-full">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(225,53,0,0.8)' }}>O que os pastores dizem</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold" style={{ color: '#f9eedc' }}>
              Pastores que transformaram sua gestão
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'Pr. Carlos Mendes',    church: 'Igreja Vida Nova — SP',         text: 'Em 3 meses, reduzi em 60% o tempo que gastava com planilhas. Agora consigo focar no que realmente importa: as pessoas.' },
              { name: 'Pr. Roberto Alves',    church: 'Comunidade Ágape — RJ',         text: 'O sistema identificou membros afastados que eu nem sabia. Recuperamos dezenas deles em 60 dias.' },
              { name: 'Pastora Lúcia Santos', church: 'Assembleia do Rei — BH',        text: 'O onboarding com IA foi surpreendente. Em 25 minutos o sistema estava configurado do jeito que nossa igreja funciona.' },
              { name: 'Pr. André Costa',      church: 'Igreja Renascer — Curitiba',    text: 'As escalas de voluntários pararam de gerar conflitos. A equipe recebe confirmação automática.' },
              { name: 'Pr. José Ferreira',    church: 'Comunidade Shalom — Fortaleza', text: 'Finalmente tenho números reais. Sei quantos visitantes voltaram e qual ministério precisa de atenção.' },
              { name: 'Pastora Ana Lima',     church: 'IBatista Central — Recife',     text: 'O módulo infantil trouxe mais segurança pro nosso ministério kids. Os pais ficaram muito mais tranquilos.' },
            ].map((t, i) => (
              <div key={i} className="rounded-2xl p-6 border" style={{ background: 'rgba(249,238,220,0.04)', borderColor: 'rgba(249,238,220,0.08)' }}>
                <div className="flex gap-0.5 mb-4">
                  {Array(5).fill(0).map((_, j) => <Star key={j} size={14} fill="var(--color-primary)" style={{ color: 'var(--color-primary)' }} />)}
                </div>
                <p className="text-sm leading-relaxed mb-5" style={{ color: 'rgba(249,238,220,0.75)' }}>"{t.text}"</p>
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#f9eedc' }}>{t.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(249,238,220,0.4)' }}>{t.church}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 12. FAQ ───────────────────────────────────────────── */}
      <section id="faq" className="py-20 lg:py-28 px-5 lg:px-8 w-full" style={{ background: '#F6F2EC' }}>
        <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--color-primary)' }}>Dúvidas frequentes</p>
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-[#161616]">
            Respondemos antes de você perguntar
          </h2>
        </div>
        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: '#FDFAF6', borderColor: '#E4DAD0' }}>
              <button
                onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left">
                <span className="font-semibold text-base pr-4 text-[#161616]">{item.q}</span>
                <ChevronDown size={18} strokeWidth={2}
                  style={{ color: 'var(--color-primary)', flexShrink: 0, transform: faqOpen === i ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }} />
              </button>
              {faqOpen === i && (
                <div className="px-6 pb-5">
                  <p className="text-sm leading-relaxed text-gray-500">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* ── 13. CTA FINAL ─────────────────────────────────────── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 w-full"
        style={{ background: 'linear-gradient(135deg, var(--color-primary) 0%, #670000 100%)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold uppercase tracking-widest mb-4 text-white/60">Comece hoje mesmo</p>
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-5">
            Sua congregação está esperando por um pastor mais presente
          </h2>
          <p className="text-lg mb-3 max-w-xl mx-auto text-white/80">
            Setup em 30 minutos. Suporte em português. Sem complicação.
          </p>
          <p className="text-sm italic mb-10 text-white/55">
            "O bom pastor dá a sua vida pelas ovelhas." — Jo 10:11
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={scrollToPricing}
              className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98] bg-white"
              style={{ color: 'var(--color-primary)', minHeight: 56 }}>
              Ver planos
            </button>
            <a href={waHref} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl font-semibold text-base text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: '#25D366', minHeight: 56 }}>
              {WA_ICON} Falar no WhatsApp
            </a>
          </div>
        </div>
      </section>

      {/* ── 14. FOOTER ────────────────────────────────────────── */}
      <footer className="bg-[#161616] w-full">
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-16">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="mb-4 flex items-center gap-3">
                {/* Cruz no footer — canal duplo em branco */}
                <svg width="38" height="38" viewBox="0 0 40 40" fill="none" aria-hidden>
                  <path d="M14 1 H26 V14 H39 V26 H26 V39 H14 V26 H1 V14 H14 Z"
                    stroke="rgba(249,238,220,0.9)" strokeWidth="2.5" strokeLinejoin="round"/>
                  <path d="M16.5 3.5 H23.5 V16.5 H36.5 V23.5 H23.5 V36.5 H16.5 V23.5 H3.5 V16.5 H16.5 Z"
                    stroke="rgba(249,238,220,0.5)" strokeWidth="1.5" strokeLinejoin="round"/>
                </svg>
                <span className="font-display text-2xl font-bold text-white tracking-tight">
                  Ekthos <span style={{ color: 'var(--color-primary)' }}>Church</span>
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(249,238,220,0.45)' }}>
                CRM pastoral com inteligência artificial para igrejas que querem cuidar melhor da sua comunidade.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(249,238,220,0.3)' }}>Produto</p>
              <ul className="space-y-2.5">
                {['Funcionalidades', 'Planos', 'Agentes IA', 'Changelog'].map(l => (
                  <li key={l}>
                    <a href="#" className="text-sm transition-colors"
                      style={{ color: 'rgba(249,238,220,0.5)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f9eedc')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(249,238,220,0.5)')}>{l}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(249,238,220,0.3)' }}>Empresa</p>
              <ul className="space-y-2.5">
                {['Sobre', 'Blog', 'Afiliados', 'Contato'].map(l => (
                  <li key={l}>
                    <a href="#" className="text-sm transition-colors"
                      style={{ color: 'rgba(249,238,220,0.5)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f9eedc')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(249,238,220,0.5)')}>{l}</a>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(249,238,220,0.3)' }}>Legal</p>
              <ul className="space-y-2.5">
                {['Termos de Uso', 'Política de Privacidade', 'LGPD'].map(l => (
                  <li key={l}>
                    <a href="#" className="text-sm transition-colors"
                      style={{ color: 'rgba(249,238,220,0.5)' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#f9eedc')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(249,238,220,0.5)')}>{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t pt-8 flex flex-col md:flex-row items-center justify-between gap-4"
            style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <p className="text-xs" style={{ color: 'rgba(249,238,220,0.3)' }}>
              © 2026 Ekthos Church. Feito com fé para a Igreja de Cristo.
            </p>
            <p className="text-xs" style={{ color: 'rgba(249,238,220,0.2)' }}>
              CNPJ 00.000.000/0001-00 · São Paulo, Brasil
            </p>
          </div>
        </div>
      </footer>

      {/* ── WHATSAPP FLUTUANTE ─────────────────────────────────── */}
      {showWa && (
        <a href={waHref} target="_blank" rel="noopener noreferrer"
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full shadow-2xl transition-all hover:scale-110 active:scale-95"
          style={{ width: 56, height: 56, background: '#25D366', animation: 'waPulse 2s ease-in-out infinite' }}
          aria-label="Falar no WhatsApp">
          <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white" aria-hidden>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
        </a>
      )}

      <style>{`
        @keyframes waPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37,211,102,0.4); }
          50%       { box-shadow: 0 0 0 12px rgba(37,211,102,0); }
        }
      `}</style>

      {/* ── MODAL DE LEAD ─────────────────────────────────────── */}
      {leadModal && (
        <LeadModal
          plan={leadModal}
          supabaseUrl={SUPABASE_URL}
          utmParams={getUtmParams()}
          onClose={() => setLeadModal(null)}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// MODAL DE CAPTAÇÃO DE LEAD
// ══════════════════════════════════════════════════════════

interface LeadModalProps {
  plan: 'missao' | 'avivamento'
  supabaseUrl: string
  utmParams: { source: string; medium: string; campaign: string; content: string }
  onClose: () => void
}

function LeadModal({ plan, supabaseUrl, utmParams, onClose }: LeadModalProps) {
  const planLabel = plan === 'missao' ? 'Missão' : 'Avivamento'
  const [form, setForm] = useState({ name: '', email: '', phone: '', church_name: '', estimated_members: '' })
  const [sending,  setSending]  = useState(false)
  const [success,  setSuccess]  = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    setSending(true)
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/lead-capture`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...form, plan_interest: planLabel, utm_source: utmParams.source, utm_medium: utmParams.medium, utm_campaign: utmParams.campaign, utm_content: utmParams.content }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Erro ao enviar')
      setSuccess(true)
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Erro inesperado')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-gray-100">
          <button onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
          <div className="flex items-center gap-3 mb-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white"
              style={{ background: 'var(--color-primary)' }}>
              <UserPlus size={12} /> Plano {planLabel}
            </span>
          </div>
          <h2 className="font-display text-xl font-bold text-[#161616]">Solicitar contato</h2>
          <p className="text-sm text-gray-500 mt-1">
            Preencha os dados e um consultor entrará em contato em até 24h.
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-6">
          {success ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(45,122,79,0.1)' }}>
                <Check size={32} strokeWidth={2.5} style={{ color: '#2D7A4F' }} />
              </div>
              <h3 className="font-display text-xl font-bold text-[#161616] mb-2">Solicitação enviada!</h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                Recebemos seu interesse no plano <strong>{planLabel}</strong>! Um consultor entrará em contato em até 24h.
              </p>
              <button onClick={onClose}
                className="mt-6 px-8 py-3 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90"
                style={{ background: 'var(--color-primary)' }}>
                Fechar
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {[
                { name: 'name',        label: 'Nome completo',       type: 'text',  placeholder: 'Ex: Pr. João Silva',       required: true },
                { name: 'email',       label: 'Email',               type: 'email', placeholder: 'pastor@suaigreja.com.br', required: true },
                { name: 'phone',       label: 'Telefone / WhatsApp', type: 'tel',   placeholder: '(11) 99999-9999',          required: true },
                { name: 'church_name', label: 'Nome da igreja',      type: 'text',  placeholder: 'Ex: Igreja Vida Nova',     required: true },
              ].map(f => (
                <div key={f.name}>
                  <label className="block text-xs font-semibold text-[#161616] mb-1.5">
                    {f.label} {f.required && <span style={{ color: 'var(--color-primary)' }}>*</span>}
                  </label>
                  <input name={f.name} type={f.type} value={form[f.name as keyof typeof form]}
                    onChange={handleChange} required={f.required} placeholder={f.placeholder}
                    className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                    style={{ background: '#fafafa' }} />
                </div>
              ))}

              <div>
                <label className="block text-xs font-semibold text-[#161616] mb-1.5">Quantidade de membros</label>
                <select name="estimated_members" value={form.estimated_members} onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                  style={{ background: '#fafafa' }}>
                  <option value="">Selecione</option>
                  <option value="Até 100">Até 100</option>
                  <option value="100-300">100 – 300</option>
                  <option value="300-500">300 – 500</option>
                  <option value="500-1000">500 – 1.000</option>
                  <option value="1000+">Acima de 1.000</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#161616] mb-1.5">Plano de interesse</label>
                <input value={planLabel} readOnly
                  className="w-full px-4 py-3 rounded-xl text-sm border border-gray-100 text-gray-400 cursor-default"
                  style={{ background: '#f3f3f3' }} />
              </div>

              {errorMsg && (
                <p className="text-xs text-red-600 bg-red-50 px-4 py-2 rounded-xl">{errorMsg}</p>
              )}

              <button type="submit" disabled={sending}
                className="w-full py-4 rounded-xl font-semibold text-white text-base transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 mt-2"
                style={{ background: 'var(--color-primary)', minHeight: 52 }}>
                {sending ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Enviando...
                  </span>
                ) : 'Enviar solicitação →'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
