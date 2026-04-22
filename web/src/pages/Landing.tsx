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
  Bot, MessageCircle, Shield, TrendingUp, Building2, UserPlus,
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
    q: 'Como funciona a migração gratuita?',
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
  {
    q: 'Como funciona a consultoria nos planos Missão e Avivamento?',
    a: 'Ao solicitar contato, um consultor pastoral entra em contato em até 24h para entender a realidade da sua igreja e apresentar uma proposta personalizada. O processo é guiado e sem pressão.',
  },
]

// ══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ══════════════════════════════════════════════════════════

export default function Landing() {
  const [menuOpen,      setMenuOpen]      = useState(false)
  const [checkoutPlan,  setCheckoutPlan]  = useState<string | null>(null)
  const [showWa,        setShowWa]        = useState(false)
  const [faqOpen,       setFaqOpen]       = useState<number | null>(null)
  const [scrolled,      setScrolled]      = useState(false)
  const [leadModal,     setLeadModal]     = useState<'missao' | 'avivamento' | null>(null)
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

  // Bloqueia scroll do body quando modal está aberto
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
              { label: 'Planos',          href: '#pricing' },
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
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#e13500' }}>Planos</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4 text-[#161616]">
              Investimento que se paga com o primeiro membro retido
            </h2>
            <p className="text-lg max-w-xl mx-auto text-gray-500">
              Do self-service ao consultivo — escolha o que faz sentido para a sua igreja.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mt-6"
              style={{ background: 'rgba(225,53,0,0.08)', color: '#e13500', border: '1px solid rgba(225,53,0,0.2)' }}>
              ⏳ Migração gratuita para as próximas 50 igrejas
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-6 items-start">
            {/* ── CHAMADO (self-service) ── */}
            <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-200 flex flex-col">
              <div className="p-7 flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(90,90,90,0.08)', color: '#5A5A5A' }}>
                    <Star size={22} strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="font-semibold text-base text-[#161616]">Chamado</p>
                    <p className="text-xs text-[#8A8A8A]">Para igrejas que estão começando a digitalizar a operação pastoral.</p>
                  </div>
                </div>

                <div className="mb-6">
                  <span className="font-mono font-bold text-4xl text-[#161616]">R$689,90</span>
                  <span className="text-sm ml-1 text-[#8A8A8A]">/mês</span>
                </div>

                <ul className="space-y-2.5 mb-6">
                  {[
                    'Até 5 usuários',
                    'Dashboard pastoral completo',
                    'Cadastro e acompanhamento de membros',
                    'Caminho de discipulado (pipeline)',
                    'Rede de células',
                    'Agente Suporte 24h (incluído)',
                    'Suporte por email',
                  ].map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={15} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0, marginTop: 1 }} />
                      <span className="text-[#161616]">{f}</span>
                    </li>
                  ))}
                  {['Agentes IA avançados', 'Automações', 'Multi-site'].map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm opacity-40">
                      <X size={15} strokeWidth={2} style={{ color: '#999', flexShrink: 0, marginTop: 1 }} />
                      <span className="text-[#8A8A8A]">{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="px-7 pb-7">
                <button
                  onClick={() => handleCheckout('chamado')}
                  disabled={checkoutPlan === 'chamado'}
                  className="w-full py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
                  style={{ background: 'transparent', color: '#e13500', border: '2px solid #e13500', minHeight: 52 }}>
                  {checkoutPlan === 'chamado' ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      Aguarde...
                    </span>
                  ) : 'Contratar agora →'}
                </button>
                <p className="text-center text-xs mt-2 text-[#AAA]">Acesso imediato</p>
              </div>
            </div>

            {/* ── MISSÃO (consultivo) ── */}
            <div className="relative bg-[#161616] rounded-2xl border-2 border-[#e13500] shadow-2xl scale-[1.02] flex flex-col">
              {/* Badge */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="px-4 py-1.5 rounded-full text-xs font-bold text-white"
                  style={{ background: '#e13500' }}>⭐ Mais popular</span>
              </div>

              <div className="p-7 flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(225,53,0,0.15)', color: '#e13500' }}>
                    <Zap size={22} strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="font-semibold text-base" style={{ color: '#f9eedc' }}>Missão</p>
                    <p className="text-xs" style={{ color: 'rgba(249,238,220,0.5)' }}>Para igrejas em crescimento que querem automação inteligente.</p>
                  </div>
                </div>

                {/* Sem preço — venda consultiva */}
                <div className="mb-6">
                  <span className="font-display font-bold text-2xl" style={{ color: '#f9eedc' }}>Plano personalizado</span>
                  <p className="text-xs mt-1" style={{ color: 'rgba(249,238,220,0.4)' }}>Proposta sob medida para a sua realidade</p>
                </div>

                <ul className="space-y-2.5 mb-6">
                  {[
                    'Até 8 usuários',
                    'Tudo do plano Chamado',
                    '3 agentes IA inclusos',
                    'Relatórios automáticos',
                    'Automações pastorais',
                    'Escalas de voluntários',
                    'Suporte prioritário',
                  ].map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={15} strokeWidth={2.5} style={{ color: '#2D7A4F', flexShrink: 0, marginTop: 1 }} />
                      <span style={{ color: 'rgba(249,238,220,0.8)' }}>{f}</span>
                    </li>
                  ))}
                  {['Multi-site', 'Agente WhatsApp'].map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm opacity-40">
                      <X size={15} strokeWidth={2} style={{ color: '#999', flexShrink: 0, marginTop: 1 }} />
                      <span style={{ color: 'rgba(249,238,220,0.5)' }}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="px-7 pb-7">
                <button
                  onClick={() => setLeadModal('missao')}
                  className="w-full py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: '#e13500', color: '#ffffff', minHeight: 52 }}>
                  Solicitar contato →
                </button>
                <p className="text-center text-xs mt-2" style={{ color: 'rgba(249,238,220,0.35)' }}>
                  Consultoria personalizada
                </p>
              </div>
            </div>

            {/* ── AVIVAMENTO (consultivo) ── */}
            <div className="relative bg-white rounded-2xl border border-gray-200 shadow-xl hover:shadow-2xl hover:-translate-y-1 transition-all duration-200 flex flex-col">
              {/* Badge */}
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="px-4 py-1.5 rounded-full text-xs font-bold text-white"
                  style={{ background: '#670000' }}>👑 Completo</span>
              </div>

              <div className="p-7 flex-1 pt-10">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(103,0,0,0.08)', color: '#670000' }}>
                    <Crown size={22} strokeWidth={1.75} />
                  </div>
                  <div>
                    <p className="font-semibold text-base text-[#161616]">Avivamento</p>
                    <p className="text-xs text-[#8A8A8A]">Para igrejas grandes com operação pastoral complexa e multi-site.</p>
                  </div>
                </div>

                {/* Sem preço — venda consultiva */}
                <div className="mb-6">
                  <span className="font-display font-bold text-2xl text-[#161616]">Plano sob medida</span>
                  <p className="text-xs mt-1 text-[#8A8A8A]">Proposta dedicada para operações complexas</p>
                </div>

                <ul className="space-y-2.5 mb-6">
                  {[
                    'Até 10 usuários',
                    'Tudo do plano Missão',
                    '6 agentes IA inclusos',
                    'Agente WhatsApp incluso',
                    'Multi-site (múltiplas sedes)',
                    'Importação de dados',
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
                  className="w-full py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: '#e13500', color: '#ffffff', minHeight: 52 }}>
                  Solicitar contato →
                </button>
                <p className="text-center text-xs mt-2 text-[#AAA]">Acompanhamento dedicado</p>
              </div>
            </div>
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
            Setup em 30 minutos. Migração gratuita.
          </p>
          <p className="text-sm italic mb-10 text-white/55">
            "O bom pastor dá a sua vida pelas ovelhas." — Jo 10:11
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button onClick={scrollToPricing}
              className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98] bg-white"
              style={{ color: '#e13500', minHeight: 56 }}>
              Ver planos
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
                {['Funcionalidades','Planos','Agentes IA','Changelog'].map(l => (
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

  const [form, setForm] = useState({
    name:              '',
    email:             '',
    phone:             '',
    church_name:       '',
    estimated_members: '',
  })
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
        body:    JSON.stringify({
          ...form,
          plan_interest: planLabel,
          utm_source:    utmParams.source,
          utm_medium:    utmParams.medium,
          utm_campaign:  utmParams.campaign,
        }),
      })
      const data = await res.json() as { success?: boolean; error?: string }
      if (!res.ok || !data.success) throw new Error(data.error ?? 'Erro ao enviar')
      setSuccess(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro inesperado'
      setErrorMsg(msg)
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg relative overflow-hidden">
        {/* Header */}
        <div className="px-8 pt-8 pb-5 border-b border-gray-100">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
          <div className="flex items-center gap-3 mb-1">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold text-white"
              style={{ background: '#e13500' }}>
              <UserPlus size={12} /> Plano {planLabel}
            </span>
          </div>
          <h2 className="font-display text-xl font-bold text-[#161616]">
            Solicitar contato
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Preencha os dados abaixo e um consultor entrará em contato em até 24h.
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
              <h3 className="font-display text-xl font-bold text-[#161616] mb-2">
                Solicitação enviada!
              </h3>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                Recebemos seu interesse no plano <strong>{planLabel}</strong>. Um consultor entrará em contato em até 24h.
              </p>
              <button
                onClick={onClose}
                className="mt-6 px-8 py-3 rounded-xl font-semibold text-white text-sm transition-all hover:opacity-90"
                style={{ background: '#e13500' }}>
                Fechar
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Nome */}
              <div>
                <label className="block text-xs font-semibold text-[#161616] mb-1.5">
                  Nome completo <span style={{ color: '#e13500' }}>*</span>
                </label>
                <input
                  name="name" value={form.name} onChange={handleChange} required
                  placeholder="Ex: Pr. João Silva"
                  className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-[#e13500] transition-colors"
                  style={{ background: '#fafafa' }}
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-semibold text-[#161616] mb-1.5">
                  Email <span style={{ color: '#e13500' }}>*</span>
                </label>
                <input
                  name="email" type="email" value={form.email} onChange={handleChange} required
                  placeholder="pastor@suaigreja.com.br"
                  className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-[#e13500] transition-colors"
                  style={{ background: '#fafafa' }}
                />
              </div>

              {/* Telefone */}
              <div>
                <label className="block text-xs font-semibold text-[#161616] mb-1.5">
                  Telefone / WhatsApp <span style={{ color: '#e13500' }}>*</span>
                </label>
                <input
                  name="phone" type="tel" value={form.phone} onChange={handleChange} required
                  placeholder="(11) 99999-9999"
                  className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-[#e13500] transition-colors"
                  style={{ background: '#fafafa' }}
                />
              </div>

              {/* Igreja */}
              <div>
                <label className="block text-xs font-semibold text-[#161616] mb-1.5">
                  Nome da igreja <span style={{ color: '#e13500' }}>*</span>
                </label>
                <input
                  name="church_name" value={form.church_name} onChange={handleChange} required
                  placeholder="Ex: Igreja Vida Nova"
                  className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-[#e13500] transition-colors"
                  style={{ background: '#fafafa' }}
                />
              </div>

              {/* Membros */}
              <div>
                <label className="block text-xs font-semibold text-[#161616] mb-1.5">
                  Quantidade de membros
                </label>
                <select
                  name="estimated_members" value={form.estimated_members} onChange={handleChange}
                  className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-[#e13500] transition-colors"
                  style={{ background: '#fafafa' }}
                >
                  <option value="">Selecione</option>
                  <option value="Até 100">Até 100</option>
                  <option value="100-300">100 – 300</option>
                  <option value="300-500">300 – 500</option>
                  <option value="500+">Acima de 500</option>
                </select>
              </div>

              {/* Plano (readonly) */}
              <div>
                <label className="block text-xs font-semibold text-[#161616] mb-1.5">
                  Plano de interesse
                </label>
                <input
                  value={planLabel} readOnly
                  className="w-full px-4 py-3 rounded-xl text-sm border border-gray-100 text-gray-400 cursor-default"
                  style={{ background: '#f3f3f3' }}
                />
              </div>

              {errorMsg && (
                <p className="text-xs text-red-600 bg-red-50 px-4 py-2 rounded-xl">{errorMsg}</p>
              )}

              <button
                type="submit" disabled={sending}
                className="w-full py-4 rounded-xl font-semibold text-white text-base transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-60 mt-2"
                style={{ background: '#e13500', minHeight: 52 }}>
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
