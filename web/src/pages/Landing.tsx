// ============================================================
// Landing Page — Ekthos Church
// Light mode: bg-white, navbar branca, screenshots reais do CRM
// Segue skills: ekthos-frontend + landing-page-ekthos
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Check, ChevronDown, Menu, X, Star, Zap, Crown,
  Users, BarChart2, Wallet, CalendarRange, Bell, Heart,
  Bot, MessageCircle, Shield, TrendingUp, Building2,
} from 'lucide-react'

// ── Env ────────────────────────────────────────────────────
const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL as string
const WHATSAPP_NUMBER = import.meta.env.VITE_WHATSAPP_NUMBER as string || '5511999999999'

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

// ── Planos ─────────────────────────────────────────────────
const PLANS = [
  {
    slug:        'chamado',
    name:        'Chamado',
    price:       'R$389',
    period:      '/mês',
    description: 'Para igrejas que estão começando a digitalizar a operação pastoral.',
    badge:       null,
    icon:        <Star size={22} strokeWidth={1.75} />,
    color:       '#5A5A5A',
    features: [
      'Até 2 usuários',
      'Dashboard pastoral completo',
      'Cadastro e acompanhamento de membros',
      'Caminho de discipulado (pipeline)',
      'Rede de células',
      'Agente Suporte 24h (incluído)',
      'Suporte por email',
    ],
    notIncluded: ['Agentes IA avançados', 'Automações', 'Multi-site'],
  },
  {
    slug:        'missao',
    name:        'Missão',
    price:       'R$698',
    period:      '/mês',
    description: 'Para igrejas em crescimento que querem automação inteligente.',
    badge:       'Mais popular',
    icon:        <Zap size={22} strokeWidth={1.75} />,
    color:       '#e13500',
    features: [
      'Até 3 usuários',
      'Tudo do plano Chamado',
      '3 agentes IA inclusos',
      'Relatórios automáticos',
      'Automações pastorais',
      'Escalas de voluntários',
      'Suporte prioritário',
    ],
    notIncluded: ['Multi-site', 'Agente WhatsApp'],
  },
  {
    slug:        'avivamento',
    name:        'Avivamento',
    price:       'R$1.015',
    period:      '/mês',
    description: 'Para igrejas grandes com operação pastoral complexa e multi-site.',
    badge:       null,
    icon:        <Crown size={22} strokeWidth={1.75} />,
    color:       '#670000',
    features: [
      'Até 4 usuários',
      'Tudo do plano Missão',
      '6 agentes IA inclusos',
      'Agente WhatsApp incluso',
      'Multi-site (múltiplas sedes)',
      'Importação de dados',
      'Suporte dedicado',
    ],
    notIncluded: [],
  },
]

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
    q: 'Posso cancelar quando quiser?',
    a: 'Sim, sem multa. Você pode cancelar a qualquer momento pelo painel de configurações. Você continua com acesso até o fim do período pago.',
  },
  {
    q: 'Como funciona o período de migração gratuito?',
    a: 'Nossa equipe importa seus dados de planilhas, sistemas anteriores ou qualquer formato. Para as próximas 50 igrejas, essa migração é feita sem custo adicional.',
  },
  {
    q: 'Os agentes de IA realmente funcionam para igrejas?',
    a: 'Sim. Os agentes foram treinados com conhecimento pastoral e entendem o contexto da liderança evangélica. Eles falam a língua do pastor, não do desenvolvedor.',
  },
  {
    q: 'Quantos membros posso cadastrar?',
    a: 'Não há limite de membros cadastrados em nenhum plano. O limite dos planos é sobre o número de usuários administrativos (líderes com acesso ao sistema), não sobre membros.',
  },
  {
    q: 'O que acontece depois que eu contratar?',
    a: 'Você receberá um email para criar sua senha e acesso. Logo em seguida, nosso Consultor de Onboarding — um assistente com IA — guia você em 20 perguntas simples e configura todo o CRM em menos de 30 minutos.',
  },
]

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════

export default function Landing() {
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [checkoutPlan, setCheckoutPlan] = useState<string | null>(null)
  const [showWa,       setShowWa]       = useState(false)
  const [faqOpen,      setFaqOpen]      = useState<number | null>(null)
  const [scrolled,     setScrolled]     = useState(false)
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
    <div className="min-h-screen font-body antialiased bg-white text-[#161616]">

      {/* ── 1. NAVBAR ─────────────────────────────────────────── */}
      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 bg-white/90 backdrop-blur-md border-b border-gray-100 ${
          scrolled ? 'shadow-sm' : ''
        }`}
      >
        <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="flex items-center gap-3 shrink-0">
            <img
              src="/logo/ekthos-church.svg"
              alt="Ekthos Church"
              className="h-12 w-auto object-contain"
              onError={e => { (e.currentTarget as HTMLElement).style.display = 'none' }}
            />
            <span className="font-display text-2xl font-bold tracking-tight text-[#161616]">
              Ekthos <span style={{ color: '#e13500' }}>Church</span>
            </span>
          </a>

          {/* Links desktop */}
          <nav className="hidden md:flex items-center gap-7">
            {[
              { label: 'Funcionalidades', href: '#funcionalidades' },
              { label: 'Agentes IA',      href: '#agentes' },
              { label: 'Preços',          href: '#pricing' },
              { label: 'FAQ',             href: '#faq' },
            ].map(l => (
              <a key={l.href} href={l.href}
                className="text-sm font-medium text-gray-500 hover:text-[#161616] transition-colors">
                {l.label}
              </a>
            ))}
          </nav>

          {/* CTAs desktop */}
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login"
              className="text-sm font-medium px-4 py-2 rounded-xl text-gray-500 hover:text-[#161616] transition-colors">
              Entrar
            </Link>
            <button onClick={scrollToPricing}
              className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: '#e13500' }}>
              Ver planos
            </button>
          </div>

          {/* Hamburger mobile */}
          <button onClick={() => setMenuOpen(o => !o)} className="md:hidden p-2 text-gray-500">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Menu mobile */}
        {menuOpen && (
          <div className="md:hidden px-5 pb-6 pt-2 flex flex-col gap-4 bg-white border-t border-gray-100">
            {['#funcionalidades', '#agentes', '#pricing', '#faq'].map((href, i) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}
                className="text-sm font-medium py-1 text-gray-600">
                {['Funcionalidades', 'Agentes IA', 'Preços', 'FAQ'][i]}
              </a>
            ))}
            <div className="flex gap-3 pt-2">
              <Link to="/login" onClick={() => setMenuOpen(false)}
                className="flex-1 text-center text-sm font-medium py-2.5 rounded-xl border border-gray-200 text-[#161616]">
                Entrar
              </Link>
              <button onClick={scrollToPricing}
                className="flex-1 text-sm font-semibold py-2.5 rounded-xl text-white"
                style={{ background: '#e13500' }}>
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
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold mb-6"
              style={{ background: 'rgba(225,53,0,0.08)', color: '#e13500', border: '1px solid rgba(225,53,0,0.15)' }}>
              ✦ Migração gratuita para as próximas 50 igrejas
            </div>

            <h1 className="font-display text-4xl lg:text-5xl xl:text-6xl font-bold leading-tight mb-6 text-[#161616]"
              style={{ letterSpacing: '-0.02em' }}>
              Nenhum visitante{' '}
              <span style={{ color: '#e13500' }}>se perde no caminho</span>
            </h1>

            <p className="text-lg lg:text-xl leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0 text-gray-500">
              Plataforma de acompanhamento pastoral com inteligência artificial.
              Acompanhe cada membro, automatize tarefas repetitivas e foque no
              que realmente importa: cuidar da sua comunidade.
            </p>

            <p className="text-sm italic mb-8 text-gray-400">
              "Conhece o estado do teu rebanho e põe o coração nos teus gados." — Pv 27:23
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <button onClick={scrollToPricing}
                className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98] shadow-lg shadow-[#e13500]/20"
                style={{ background: '#e13500', minHeight: 56 }}>
                Começar agora →
              </button>
              <a href={waHref} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all border-2 hover:bg-[#e13500]/5"
                style={{ borderColor: '#e13500', color: '#e13500', minHeight: 56 }}>
                {WA_ICON} Falar com consultor
              </a>
            </div>

            <div className="flex items-center gap-4 mt-8 justify-center lg:justify-start flex-wrap">
              <div className="flex -space-x-2">
                {['🙏','✝️','🕊️','👑','🔥'].map((e, i) => (
                  <div key={i} className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs"
                    style={{ background: i % 2 === 0 ? '#e13500' : '#670000' }}>{e}</div>
                ))}
              </div>
              <p className="text-sm text-gray-500">
                <strong className="text-[#161616]">+200 igrejas</strong> já usam o Ekthos Church
              </p>
            </div>
          </div>

          {/* Hero — collage 4 screenshots */}
          <div className="flex-1 w-full relative" style={{ minHeight: 420, paddingTop: 24, paddingRight: 40, paddingBottom: 60 }}>
            {/* Glow de fundo */}
            <div className="absolute inset-0 rounded-3xl blur-3xl opacity-[0.07] pointer-events-none"
              style={{ background: 'radial-gradient(circle at 60% 40%, #e13500 0%, transparent 70%)' }} />

            {/* Principal: painel (frente, centralizado) */}
            <img
              src="/screenshots/painel.png"
              alt="Dashboard Ekthos Church com 314 membros, 36 células e 62 líderes"
              loading="eager"
              className="relative z-30 w-full rounded-2xl border border-black/10"
              style={{ boxShadow: '0 24px 64px rgba(0,0,0,0.22)', display: 'block' }}
            />

            {/* Sobreposta esquerda-baixo: pessoas */}
            <img
              src="/screenshots/pessoas.png"
              alt="Relatório de novos convertidos"
              loading="lazy"
              className="absolute z-40 rounded-xl border border-black/10 transition-transform duration-500 hover:scale-[1.03]"
              style={{
                width: '54%', bottom: -24, left: -28,
                boxShadow: '0 16px 40px rgba(0,0,0,0.24)',
                transform: 'rotate(-2.5deg)',
              }}
            />

            {/* Sobreposta direita-baixo: agenda */}
            <img
              src="/screenshots/agenda.png"
              alt="Agenda da Igreja — Abril 2026"
              loading="lazy"
              className="absolute z-20 rounded-xl border border-black/10 transition-transform duration-500 hover:scale-[1.03]"
              style={{
                width: '50%', bottom: -32, right: -28,
                boxShadow: '0 16px 40px rgba(0,0,0,0.20)',
                transform: 'rotate(2deg)',
              }}
            />

            {/* Sobreposta topo-direita: ministerios */}
            <img
              src="/screenshots/ministerios.png"
              alt="Funil de conversão e saúde da igreja"
              loading="lazy"
              className="absolute z-10 rounded-xl border border-black/10 transition-transform duration-500 hover:scale-[1.03]"
              style={{
                width: '44%', top: -16, right: -32,
                boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
                transform: 'rotate(3deg)',
              }}
            />
          </div>
        </div>
      </section>

      {/* ── 3. PROVA SOCIAL ───────────────────────────────────── */}
      <section className="py-14 border-y border-gray-100 bg-[#f9eedc]/30">
        <div className="max-w-5xl mx-auto px-5 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { n: '+200',    l: 'Igrejas ativas' },
              { n: '+15.000', l: 'Membros gerenciados' },
              { n: '97%',     l: 'Satisfação dos pastores' },
              { n: '<30min',  l: 'Setup completo' },
            ].map(s => (
              <div key={s.n}>
                <p className="font-mono text-3xl font-bold mb-1" style={{ color: '#e13500' }}>{s.n}</p>
                <p className="text-sm text-gray-500">{s.l}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 4. PROBLEMA ───────────────────────────────────────── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#e13500' }}>
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
              icon: <Users size={28} strokeWidth={1.5} />,
              title: 'Membros se afastando em silêncio',
              body:  'Você só percebe que alguém saiu quando já foi embora. Sem dados, sem alertas, sem acompanhamento sistemático.',
            },
            {
              icon: <BarChart2 size={28} strokeWidth={1.5} />,
              title: 'Horas perdidas em tarefas manuais',
              body:  'Planilhas, WhatsApp, cadernos. O pastor gasta mais tempo organizando do que pastoreando.',
            },
            {
              icon: <TrendingUp size={28} strokeWidth={1.5} />,
              title: 'Decisões sem dados reais',
              body:  'Sem métricas, você navega por intuição. Quantos visitantes voltaram? Qual ministério está em queda?',
            },
          ].map((p, i) => (
            <div key={i} className="bg-white rounded-2xl p-7 border border-gray-200 shadow-lg hover:shadow-xl transition-all duration-200">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                style={{ background: 'rgba(225,53,0,0.08)', color: '#e13500' }}>
                {p.icon}
              </div>
              <h3 className="font-semibold text-lg mb-2 text-[#161616]">{p.title}</h3>
              <p className="text-sm leading-relaxed text-gray-500">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── 5. AGENTES IA ─────────────────────────────────────── */}
      <section id="agentes" className="py-20 lg:py-28 px-5 lg:px-8" style={{ background: '#161616' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3"
              style={{ color: 'rgba(225,53,0,0.8)' }}>Inteligência Artificial pastoral</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4" style={{ color: '#f9eedc' }}>
              Agentes que conhecem a linguagem da igreja
            </h2>
            <p className="text-lg max-w-2xl mx-auto" style={{ color: 'rgba(249,238,220,0.6)' }}>
              Não são chatbots genéricos. São assistentes treinados com o vocabulário e a sensibilidade pastoral.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { icon: <Bot size={20} />,           slug: 'Suporte',       desc: 'Responde dúvidas da equipe 24h por dia, nunca te deixa sem resposta.',          badge: 'Incluso em todos', free: true },
              { icon: <Users size={20} />,          slug: 'Onboarding',    desc: 'Configura todo o CRM em 30 minutos guiando o pastor por perguntas simples.',    badge: 'Incluso',          free: true },
              { icon: <MessageCircle size={20} />,  slug: 'Cadastro',      desc: 'Registra visitantes e membros automaticamente via formulário inteligente.',      badge: 'Plano Missão+' },
              { icon: <Bell size={20} />,           slug: 'Reengajamento', desc: 'Detecta membros afastados e sugere ações pastorais de acolhimento.',             badge: 'Plano Missão+' },
              { icon: <TrendingUp size={20} />,     slug: 'Métricas',      desc: 'Gera relatórios automáticos de crescimento, frequência e saúde da comunidade.', badge: 'Plano Avivamento' },
              { icon: <Shield size={20} />,         slug: 'WhatsApp',      desc: 'Envia comunicados pelo WhatsApp de forma automatizada e segmentada.',           badge: 'Plano Avivamento' },
            ].map((a, i) => (
              <div key={i} className="rounded-2xl p-6 border transition-all hover:border-[#e13500]/40"
                style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(225,53,0,0.15)', color: '#e13500' }}>{a.icon}</div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    a.free ? 'bg-green-900/40 text-green-400' : 'bg-[#e13500]/15 text-[#e13500]'
                  }`}>{a.badge}</span>
                </div>
                <h3 className="font-semibold mb-1.5" style={{ color: '#f9eedc' }}>Agente {a.slug}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(249,238,220,0.55)' }}>{a.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 6. FUNCIONALIDADES (ícones + texto) ──────────────── */}
      <section id="funcionalidades" className="py-20 lg:py-28 px-5 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#e13500' }}>
              Tudo que sua operação pastoral precisa
            </p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-[#161616]">
              Um CRM feito para igrejas
            </h2>
            <p className="text-lg max-w-xl mx-auto mt-4 text-gray-500">
              Cada módulo foi desenhado para a realidade do pastor brasileiro.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* Dashboard */}
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-lg hover:shadow-xl transition-all duration-200 group">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: 'rgba(225,53,0,0.08)', color: '#e13500' }}>
                <BarChart2 size={28} strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-xl font-bold mb-3 text-[#161616]">Painel de Controle</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-5">
                Métricas em tempo real de membros, visitantes, células e convertidos.
                Alertas de afastamento automáticos — você vê quem precisa de atenção antes de ser tarde.
              </p>
              <ul className="space-y-2">
                {['314 membros rastreados em tempo real','Alertas de afastamento automáticos','Redes e células com visão hierárquica','Relatório mensal de novos convertidos'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-[#161616]">
                    <Check size={14} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pessoas */}
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-lg hover:shadow-xl transition-all duration-200 group">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: 'rgba(103,0,0,0.07)', color: '#670000' }}>
                <Users size={28} strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-xl font-bold mb-3 text-[#161616]">Gestão de Pessoas</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-5">
                Cadastro completo com histórico de visitas, batismo e discipulado.
                Registre visitantes em segundos com QR Code — sem papel, sem planilha.
              </p>
              <ul className="space-y-2">
                {['Perfil pastoral completo de cada membro','Registro de visitante por QR Code','Filtros por Visitante, Membro ou Líder','Histórico de presença e interações'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-[#161616]">
                    <Check size={14} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Ministérios & Células */}
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-lg hover:shadow-xl transition-all duration-200 group">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: 'rgba(45,122,79,0.08)', color: '#2D7A4F' }}>
                <Building2 size={28} strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-xl font-bold mb-3 text-[#161616]">Ministérios e Células</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-5">
                Gerencie todos os ministérios, células e redes da sua igreja em um só lugar.
                Saúde de cada grupo em tempo real — sem perder nenhuma ovelha.
              </p>
              <ul className="space-y-2">
                {['Louvor, Diaconal, Missões e muito mais','Líderes e responsáveis definidos por célula','Alertas de células sem reunião há 14+ dias','Funil de conversão por rede pastoral'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-[#161616]">
                    <Check size={14} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Agenda & Relatórios */}
            <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-lg hover:shadow-xl transition-all duration-200 group">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5"
                style={{ background: 'rgba(196,132,29,0.08)', color: '#C4841D' }}>
                <CalendarRange size={28} strokeWidth={1.5} />
              </div>
              <h3 className="font-display text-xl font-bold mb-3 text-[#161616]">Agenda e Relatórios</h3>
              <p className="text-gray-500 text-sm leading-relaxed mb-5">
                Calendário completo de cultos, encontros e eventos. Taxa de retenção de convertidos,
                mês a mês — dados reais para decisões pastorais reais.
              </p>
              <ul className="space-y-2">
                {['Calendário mensal com eventos categorizados','Taxa de retenção de novos convertidos','Análise mensal e anual comparativa','Exportação CSV para relatórios externos'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-[#161616]">
                    <Check size={14} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. MÓDULOS EM BREVE ───────────────────────────────── */}
      <section className="py-16 px-5 lg:px-8" style={{ background: 'linear-gradient(135deg, #670000 0%, #161616 100%)' }}>
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(225,53,0,0.7)' }}>Em breve</p>
          <h2 className="font-display text-2xl lg:text-3xl font-bold mb-3" style={{ color: '#f9eedc' }}>
            Módulos em desenvolvimento
          </h2>
          <p className="text-base mb-10" style={{ color: 'rgba(249,238,220,0.55)' }}>
            Funcionalidades avançadas chegando nos próximos meses.
          </p>
          <div className="grid md:grid-cols-2 gap-5 text-left">
            {[
              { icon: <Heart size={20} />,   title: 'Voluntários Avançado', desc: 'Perfil de dons, histórico de serviço, reconhecimento automático e onboarding de novos voluntários.' },
              { icon: <Shield size={20} />,  title: 'EBD / Escola Bíblica', desc: 'Controle de turmas, frequência de alunos, materiais digitais e certificados automáticos.' },
            ].map((m, i) => (
              <div key={i} className="rounded-2xl p-6 border" style={{ background: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.1)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3"
                  style={{ background: 'rgba(225,53,0,0.2)', color: '#e13500' }}>{m.icon}</div>
                <h3 className="font-semibold mb-1.5" style={{ color: '#f9eedc' }}>{m.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(249,238,220,0.5)' }}>{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 8. PRICING ────────────────────────────────────────── */}
      <section id="pricing" ref={pricingRef}
        className="py-20 lg:py-32 px-5 lg:px-8 scroll-mt-20"
        style={{ background: 'rgba(249,238,220,0.40)' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#e13500' }}>Planos e preços</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4 text-[#161616]">
              Investimento que se paga com o primeiro membro retido
            </h2>
            <p className="text-lg max-w-xl mx-auto text-gray-500">
              Cancele quando quiser. Sem fidelidade. Sem pegadinhas.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mt-6"
              style={{ background: 'rgba(225,53,0,0.08)', color: '#e13500', border: '1px solid rgba(225,53,0,0.2)' }}>
              ⏳ Migração gratuita para as próximas 50 igrejas
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-start">
            {PLANS.map(plan => (
              <PlanCard
                key={plan.slug}
                plan={plan}
                loading={checkoutPlan === plan.slug}
                onCheckout={handleCheckout}
              />
            ))}
          </div>

          {/* Addons */}
          <div className="mt-10 bg-white rounded-2xl border border-gray-200 shadow-lg p-6 lg:p-8">
            <p className="font-semibold text-center mb-6 text-[#161616]">
              Complementos disponíveis em qualquer plano
            </p>
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: <Users size={18} />, title: 'Usuário extra',    price: 'R$69,90/mês',  desc: 'Adicione mais líderes com acesso ao sistema.' },
                { icon: <Bot size={18} />,   title: 'Agente de IA',     price: 'R$149,90/mês', desc: 'Ative agentes avançados individualmente.' },
                { icon: <Heart size={18} />, title: 'Suporte dedicado', price: 'R$149,90/mês', desc: 'Atendimento com consultor pastoral exclusivo.' },
              ].map((a, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl" style={{ background: '#f9eedc' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(225,53,0,0.1)', color: '#e13500' }}>{a.icon}</div>
                  <div>
                    <p className="font-semibold text-sm text-[#161616]">{a.title}</p>
                    <p className="font-mono text-sm font-medium mt-0.5" style={{ color: '#e13500' }}>{a.price}</p>
                    <p className="text-xs mt-0.5 text-gray-400">{a.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. COMPARATIVO ────────────────────────────────────── */}
      <section className="py-16 px-5 lg:px-8 max-w-5xl mx-auto bg-white">
        <div className="text-center mb-10">
          <h2 className="font-display text-2xl lg:text-3xl font-bold mb-3 text-[#161616]">
            Por que igrejas migram para o Ekthos Church?
          </h2>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: '#f9eedc' }}>
                <th className="text-left p-4 font-semibold text-[#161616]">Recurso</th>
                <th className="p-4 text-center font-semibold text-gray-400">Planilhas</th>
                <th className="p-4 text-center font-semibold text-gray-400">CRM Genérico</th>
                <th className="p-4 text-center font-semibold rounded-t-xl" style={{ color: '#e13500', background: 'rgba(225,53,0,0.06)' }}>Ekthos Church ✦</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Fala a linguagem da igreja',    false, false, true],
                ['Caminho de discipulado',         false, false, true],
                ['Agentes IA pastorais',           false, false, true],
                ['Setup em 30 minutos',            false, false, true],
                ['Alertas de membros afastados',   false, false, true],
                ['Controle de células',            false, false, true],
                ['Relatórios automáticos',         false, true,  true],
                ['Suporte em português',           false, false, true],
              ].map(([label, col1, col2, col3], i) => (
                <tr key={String(label)} style={{ borderTop: '1px solid #f0f0f0' }}>
                  <td className="p-4 text-[#161616]">{label}</td>
                  <td className="p-4 text-center">{col1 ? <Check size={16} style={{ color: '#2D7A4F', margin: '0 auto' }} /> : <X size={16} style={{ color: '#CCC', margin: '0 auto' }} />}</td>
                  <td className="p-4 text-center">{col2 ? <Check size={16} style={{ color: '#2D7A4F', margin: '0 auto' }} /> : <X size={16} style={{ color: '#CCC', margin: '0 auto' }} />}</td>
                  <td className="p-4 text-center" style={{ background: 'rgba(225,53,0,0.03)' }}>{col3 ? <Check size={16} style={{ color: '#e13500', margin: '0 auto' }} /> : <X size={16} style={{ color: '#CCC', margin: '0 auto' }} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 10. DEPOIMENTOS ───────────────────────────────────── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8" style={{ background: '#161616' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: 'rgba(225,53,0,0.8)' }}>O que os pastores dizem</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold" style={{ color: '#f9eedc' }}>
              Pastores que transformaram sua gestão
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'Pr. Carlos Mendes',    church: 'Igreja Vida Nova — SP',        text: 'Em 3 meses, reduzi em 60% o tempo que gastava com planilhas. Agora consigo focar no que realmente importa: as pessoas.' },
              { name: 'Pr. Roberto Alves',    church: 'Comunidade Ágape — RJ',        text: 'O sistema identificou 34 membros afastados que eu nem sabia. Recuperamos 18 deles em 60 dias.' },
              { name: 'Pastora Lúcia Santos', church: 'Assembleia do Rei — BH',       text: 'O onboarding com IA foi surpreendente. Em 25 minutos o sistema estava configurado do jeito que nossa igreja funciona.' },
              { name: 'Pr. André Costa',      church: 'Igreja Renascer — Curitiba',   text: 'As escalas de voluntários pararam de gerar conflitos. A equipe recebe confirmação automática.' },
              { name: 'Pr. José Ferreira',    church: 'Comunidade Shalom — Fortaleza',text: 'Finalmente tenho números reais. Sei quantos visitantes voltaram e qual ministério precisa de atenção.' },
              { name: 'Pastora Ana Lima',     church: 'IBatista Central — Recife',    text: 'Migrei de uma planilha gigante sem perder nenhum dado. A equipe do Ekthos Church cuidou de tudo.' },
            ].map((t, i) => (
              <div key={i} className="rounded-2xl p-6 border" style={{ background: 'rgba(249,238,220,0.04)', borderColor: 'rgba(249,238,220,0.08)' }}>
                <div className="flex gap-0.5 mb-4">
                  {Array(5).fill(0).map((_, j) => <Star key={j} size={14} fill="#e13500" style={{ color: '#e13500' }} />)}
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

      {/* ── 11. FAQ ───────────────────────────────────────────── */}
      <section id="faq" className="py-20 lg:py-28 px-5 lg:px-8 max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#e13500' }}>Dúvidas frequentes</p>
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-[#161616]">
            Respondemos antes de você perguntar
          </h2>
        </div>

        <div className="space-y-3">
          {FAQ_ITEMS.map((item, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <button
                onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-5 text-left"
              >
                <span className="font-semibold text-base pr-4 text-[#161616]">{item.q}</span>
                <ChevronDown
                  size={18} strokeWidth={2}
                  style={{
                    color: '#e13500', flexShrink: 0,
                    transform: faqOpen === i ? 'rotate(180deg)' : 'rotate(0)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>
              {faqOpen === i && (
                <div className="px-6 pb-5">
                  <p className="text-sm leading-relaxed text-gray-500">{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── 12. CTA FINAL ─────────────────────────────────────── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8"
        style={{ background: 'linear-gradient(135deg, #e13500 0%, #670000 100%)' }}>
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-sm font-semibold uppercase tracking-widest mb-4 text-white/60">Comece hoje mesmo</p>
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-5">
            Sua congregação está esperando por um pastor mais presente
          </h2>
          <p className="text-lg mb-3 max-w-xl mx-auto text-white/80">
            Setup em 30 minutos. Migração gratuita. Cancele quando quiser.
          </p>
          <p className="text-sm italic mb-10 text-white/55">
            "O bom pastor dá a sua vida pelas ovelhas." — Jo 10:11
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={scrollToPricing}
              className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98] bg-white"
              style={{ color: '#e13500', minHeight: 56 }}>
              Ver planos e preços
            </button>
            <a href={waHref} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl font-semibold text-base border-2 transition-all hover:bg-white/10 text-white"
              style={{ borderColor: 'rgba(255,255,255,0.5)', minHeight: 56 }}>
              {WA_ICON} Falar com consultor
            </a>
          </div>
        </div>
      </section>

      {/* ── 13. FOOTER ────────────────────────────────────────── */}
      <footer style={{ background: '#161616' }}>
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-16">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="mb-4 flex items-center gap-3">
                <img
                  src="/logo/ekthos-church.svg"
                  alt="Ekthos Church"
                  className="h-12 w-auto object-contain"
                  style={{ filter: 'brightness(0) invert(1)' }}
                  onError={e => { (e.currentTarget as HTMLElement).style.display = 'none' }}
                />
                <span className="font-display text-2xl font-bold text-white tracking-tight">
                  Ekthos <span style={{ color: '#e13500' }}>Church</span>
                </span>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(249,238,220,0.45)' }}>
                CRM pastoral com inteligência artificial para igrejas que querem cuidar melhor da sua comunidade.
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(249,238,220,0.3)' }}>Produto</p>
              <ul className="space-y-2.5">
                {['Funcionalidades','Preços','Agentes IA','Changelog'].map(l => (
                  <li key={l}><a href="#" className="text-sm transition-colors"
                    style={{ color: 'rgba(249,238,220,0.5)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f9eedc')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(249,238,220,0.5)')}>{l}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(249,238,220,0.3)' }}>Empresa</p>
              <ul className="space-y-2.5">
                {['Sobre','Blog','Afiliados','Contato'].map(l => (
                  <li key={l}><a href="#" className="text-sm transition-colors"
                    style={{ color: 'rgba(249,238,220,0.5)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f9eedc')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(249,238,220,0.5)')}>{l}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: 'rgba(249,238,220,0.3)' }}>Legal</p>
              <ul className="space-y-2.5">
                {['Termos de Uso','Política de Privacidade','LGPD'].map(l => (
                  <li key={l}><a href="#" className="text-sm transition-colors"
                    style={{ color: 'rgba(249,238,220,0.5)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#f9eedc')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(249,238,220,0.5)')}>{l}</a></li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t pt-8 flex flex-col md:flex-row items-center justify-between gap-4"
            style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
            <p className="text-xs" style={{ color: 'rgba(249,238,220,0.3)' }}>
              © 2026 Ekthos Church. Feito com ✝️ para a Igreja de Cristo.
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
          title="Falar no WhatsApp com Ekthos Church"
          aria-label="Abrir WhatsApp">
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
    </div>
  )
}

// ══════════════════════════════════════════════════════════
// SUBCOMPONENTES
// ══════════════════════════════════════════════════════════

// ── Screenshot com browser frame ───────────────────────────
function ScreenshotFrame({ src, alt, url }: { src: string; alt: string; url: string }) {
  const [failed, setFailed] = useState(false)

  return (
    <div className="relative group">
      {/* Glow sutil */}
      <div className="absolute inset-0 rounded-3xl blur-3xl opacity-10 pointer-events-none"
        style={{ background: '#e13500', transform: 'scale(0.9) translateY(8%)' }} />
      {/* Frame */}
      <div className="relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200 transition-all duration-300 group-hover:scale-[1.02] group-hover:shadow-[0_40px_80px_rgba(0,0,0,0.18)]">
        {/* Browser chrome */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50">
          <div className="flex gap-1.5">
            {['#FF5F57','#FEBC2E','#28C840'].map(c => (
              <div key={c} className="w-3 h-3 rounded-full" style={{ background: c }} />
            ))}
          </div>
          <div className="flex-1 mx-3">
            <div className="rounded-md px-3 py-1 text-xs bg-gray-100 text-gray-400">
              {url}
            </div>
          </div>
        </div>
        {/* Screenshot ou fallback */}
        {!failed ? (
          <img
            src={src}
            alt={alt}
            loading="lazy"
            className="w-full h-auto block"
            onError={() => setFailed(true)}
          />
        ) : (
          <ScreenshotPlaceholder />
        )}
      </div>
    </div>
  )
}

// ── Placeholder quando screenshot não carrega ───────────────
function ScreenshotPlaceholder() {
  return (
    <div className="p-5" style={{ background: '#f9eedc', minHeight: 280 }}>
      <div className="flex gap-3 h-full">
        <div className="w-8 flex flex-col gap-2 pt-1">
          {[0,1,2,3,4].map(i => (
            <div key={i} className="w-full h-5 rounded"
              style={{ background: i === 0 ? '#e13500' : '#d4c4ac', opacity: i === 0 ? 1 : 0.4 }} />
          ))}
        </div>
        <div className="flex-1 space-y-3">
          <div className="grid grid-cols-4 gap-2">
            {[
              { l: 'Membros',    n: '314', c: '#e13500' },
              { l: 'Convertidos',n: '146', c: '#670000' },
              { l: 'Células',    n: '36',  c: '#2D7A4F' },
              { l: 'Líderes',    n: '61',  c: '#C4841D' },
            ].map(m => (
              <div key={m.l} className="bg-white rounded-lg p-2 border border-[#f0e0c8]">
                <p className="font-mono font-bold text-sm" style={{ color: m.c }}>{m.n}</p>
                <p className="text-[9px] mt-0.5 text-gray-400">{m.l}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[0,1].map(i => (
              <div key={i} className="bg-white rounded-lg p-3 border border-[#f0e0c8]" style={{ height: 80 }}>
                <div className="text-[9px] font-semibold mb-2 text-gray-400">
                  {i === 0 ? 'Crescimento' : 'Retenção'}
                </div>
                <div className="flex items-end gap-1 h-10">
                  {[60,80,55,90,70,85,100].map((h, j) => (
                    <div key={j} className="flex-1 rounded-sm"
                      style={{ height: `${h * 0.4}px`, background: j === 6 ? '#e13500' : '#f0e0c8' }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Card de plano ──────────────────────────────────────────
function PlanCard({ plan, loading, onCheckout }: {
  plan: typeof PLANS[0]
  loading: boolean
  onCheckout: (slug: string) => void
}) {
  const isPopular = !!plan.badge
  return (
    <div className={`relative rounded-2xl flex flex-col transition-all duration-200 ${
      isPopular
        ? 'shadow-2xl scale-[1.02] border-2'
        : 'border border-gray-200 shadow-xl hover:shadow-2xl hover:-translate-y-1'
    }`}
      style={{
        background:  isPopular ? '#161616' : '#ffffff',
        borderColor: isPopular ? '#e13500' : undefined,
      }}>

      {isPopular && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1.5 rounded-full text-xs font-bold text-white"
            style={{ background: '#e13500' }}>⭐ {plan.badge}</span>
        </div>
      )}

      <div className="p-7 flex-1">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: isPopular ? 'rgba(225,53,0,0.15)' : 'rgba(225,53,0,0.08)', color: plan.color }}>
            {plan.icon}
          </div>
          <div>
            <p className="font-semibold text-base" style={{ color: isPopular ? '#f9eedc' : '#161616' }}>{plan.name}</p>
            <p className="text-xs" style={{ color: isPopular ? 'rgba(249,238,220,0.5)' : '#8A8A8A' }}>{plan.description}</p>
          </div>
        </div>

        <div className="mb-6">
          <span className="font-mono font-bold text-4xl" style={{ color: isPopular ? '#f9eedc' : '#161616' }}>
            {plan.price}
          </span>
          <span className="text-sm ml-1" style={{ color: isPopular ? 'rgba(249,238,220,0.45)' : '#8A8A8A' }}>
            {plan.period}
          </span>
        </div>

        <ul className="space-y-2.5 mb-6">
          {plan.features.map(f => (
            <li key={f} className="flex items-start gap-2.5 text-sm">
              <Check size={15} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: isPopular ? 'rgba(249,238,220,0.8)' : '#161616' }}>{f}</span>
            </li>
          ))}
          {plan.notIncluded.map(f => (
            <li key={f} className="flex items-start gap-2.5 text-sm opacity-40">
              <X size={15} strokeWidth={2} style={{ color: '#999', flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: isPopular ? 'rgba(249,238,220,0.5)' : '#8A8A8A' }}>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="px-7 pb-7">
        <button
          onClick={() => onCheckout(plan.slug)}
          disabled={loading}
          className="w-full py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
          style={{
            background: isPopular ? '#e13500' : 'transparent',
            color:      isPopular ? '#ffffff' : '#e13500',
            border:     isPopular ? 'none' : '2px solid #e13500',
            minHeight:  52,
          }}>
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Aguarde...
            </span>
          ) : `Contratar ${plan.name}`}
        </button>
        <p className="text-center text-xs mt-2" style={{ color: isPopular ? 'rgba(249,238,220,0.35)' : '#AAA' }}>
          Sem fidelidade · Cancele quando quiser
        </p>
      </div>
    </div>
  )
}
