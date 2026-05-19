// ============================================================
// Landing Page — Ekthos Church
// feat/landing-identidade-azul-pricing-hierarquia — 2026-05-19
// Design: azul dominante, hierarquia comercial correta
// CSS animations only — zero bundle delta
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import {
  Check, ChevronDown, Menu, X, Star, Zap, Crown,
  Users, BarChart2, Bot, MessageCircle, Bell, Shield,
  TrendingUp, UserPlus, ShieldCheck, Smartphone, DollarSign,
  ArrowRight,
} from 'lucide-react'
import EkthosIcon, { type EkthosIconName } from '@/components/EkthosIcon'
import LogoEkthos from '@/components/LogoEkthos'

// ── Payment Links & WhatsApp ───────────────────────────────
const CHAMADO_PAYMENT_LINK     = 'https://buy.stripe.com/7sY9AT69n4Gw7EZ4AT5os00'
const ACOLHIMENTO_PAYMENT_LINK = 'https://buy.stripe.com/cNibJ1fJX5KA1gB6J15os01'
const WA_BASE = 'https://wa.me/5521966487878'
function waLink(t: string) { return `${WA_BASE}?text=${encodeURIComponent(t)}` }
const WA = {
  hero:          waLink('Olá! Vim da Landing do Ekthos Church.'),
  missao:        waLink('Olá! Vim da Landing do Ekthos. Tenho interesse no Plano Missão.'),
  avivamento:    waLink('Olá! Vim da Landing do Ekthos. Tenho interesse no Plano Avivamento.'),
  enterprise:    waLink('Olá! Vim da Landing do Ekthos. Tenho interesse no Plano Enterprise.'),
  volunteer:     waLink('Olá! Vim da Landing do Ekthos. Tenho interesse no módulo Volunteer Pro.'),
  kids:          waLink('Olá! Vim da Landing do Ekthos. Tenho interesse no módulo Kids Pro.'),
  financeiro:    waLink('Olá! Vim da Landing do Ekthos. Tenho interesse no módulo Financeiro Pro.'),
  acolhimento:   waLink('Olá! Vim da Landing do Ekthos. Tenho interesse no Agente de Acolhimento Pastoral.'),
  reengajamento: waLink('Olá! Vim da Landing do Ekthos. Tenho interesse no Agente de Reengajamento Pastoral.'),
  operacao:      waLink('Olá! Vim da Landing do Ekthos. Quero ser avisado quando o Agente de Operação Pastoral estiver disponível.'),
  cta:           waLink('Olá! Vim da Landing do Ekthos Church.'),
}

// ── WA SVG Icon ───────────────────────────────────────────
const WA_ICON = (
  <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" aria-hidden>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
)

// ── Intersection Observer ──────────────────────────────────
function useInView(threshold = 0.12) {
  const ref = useRef<HTMLElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect() } },
      { threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [threshold])
  return { ref, visible }
}

// ── CSS Animations (injected once) ────────────────────────
const CSS_KEYFRAMES = `
@keyframes fadeInUp{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:translateY(0)}}
@keyframes orbPulse{0%,100%{box-shadow:0 0 0 12px rgba(59,130,246,0.08),0 0 0 28px rgba(59,130,246,0.04),0 0 60px rgba(59,130,246,0.35)}50%{box-shadow:0 0 0 18px rgba(59,130,246,0.12),0 0 0 40px rgba(59,130,246,0.06),0 0 90px rgba(59,130,246,0.5)}}
@keyframes orbitRing{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes floatCard{0%,100%{transform:translate(-50%,-50%) translateY(0)}50%{transform:translate(-50%,-50%) translateY(-8px)}}
@keyframes floatBubble{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes waveBar{0%,100%{transform:scaleY(0.3);opacity:0.4}50%{transform:scaleY(1);opacity:0.9}}
@keyframes travelLine{0%{background-position:-30% 0}100%{background-position:130% 0}}
@keyframes waPulse{0%,100%{box-shadow:0 0 0 0 rgba(37,211,102,0.4)}50%{box-shadow:0 0 0 8px rgba(37,211,102,0)}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
@keyframes shimmerBlue{0%{background-position:-200% 0}100%{background-position:200% 0}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:0.01ms!important;animation-iteration-count:1!important}}
`

// ═══════════════════════════════════════════════════════════
// HERO ORB — identidade azul
// ═══════════════════════════════════════════════════════════
function HeroOrbVisual() {
  const orbCards = [
    { label: 'Acolhimento',  sub: 'Visitante acolhido',   icon: <MessageCircle size={14}/>, deg: -60,  status: 'ativo', delay: '0s' },
    { label: 'Reengajamento',sub: 'Membro reconectado',   icon: <TrendingUp    size={14}/>, deg: 60,   status: 'ativo', delay: '0.15s' },
    { label: 'Operação',     sub: 'Em breve',             icon: <Zap           size={14}/>, deg: 180,  status: 'breve', delay: '0.3s' },
    { label: 'CRM Ativo',    sub: '247 membros',          icon: <Users         size={14}/>, deg: -180, status: 'dado',  delay: '0.45s' },
  ]
  return (
    <div className="relative flex items-center justify-center" style={{ width: '100%', height: 480 }}>
      {/* Grid bg */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.05]" aria-hidden>
        <defs>
          <pattern id="bgrid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#3b82f6" strokeWidth="0.5"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#bgrid)"/>
      </svg>
      {/* Rings */}
      <div className="absolute rounded-full border" style={{ width: 420, height: 420, borderColor: 'rgba(59,130,246,0.1)', animation: 'orbitRing 14s linear infinite' }}/>
      <div className="absolute rounded-full border" style={{ width: 340, height: 340, borderColor: 'rgba(59,130,246,0.14)', animation: 'orbitRing 10s linear infinite reverse' }}/>
      <div className="absolute rounded-full border" style={{ width: 260, height: 260, borderColor: 'rgba(59,130,246,0.18)', animation: 'orbitRing 7s linear infinite' }}/>
      {/* Central orb */}
      <div className="relative z-10 rounded-full flex items-center justify-center"
        style={{
          width: 120, height: 120,
          background: 'radial-gradient(circle at 35% 35%, rgba(96,165,250,0.95) 0%, rgba(59,130,246,0.85) 40%, rgba(15,36,64,0.95) 100%)',
          boxShadow: '0 0 0 12px rgba(59,130,246,0.08), 0 0 0 28px rgba(59,130,246,0.04), 0 0 60px rgba(59,130,246,0.4)',
          animation: 'orbPulse 3s ease-in-out infinite',
        }}>
        <svg width="44" height="44" viewBox="0 0 40 40" fill="none" aria-hidden>
          <path d="M14 1 H26 V14 H39 V26 H26 V39 H14 V26 H1 V14 H14 Z" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" strokeLinejoin="round"/>
          <path d="M16.5 3.5 H23.5 V16.5 H36.5 V23.5 H23.5 V36.5 H16.5 V23.5 H3.5 V16.5 H16.5 Z" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" strokeLinejoin="round"/>
        </svg>
      </div>
      {/* Orbital agent cards */}
      {orbCards.map(({ label, sub, icon, deg, status, delay }) => {
        const rad = (deg * Math.PI) / 180
        const r = 172
        const x = Math.cos(rad) * r
        const y = Math.sin(rad) * r
        return (
          <div key={label}
            className="absolute z-20 rounded-xl px-3.5 py-2.5 flex items-center gap-2.5"
            style={{
              left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`,
              transform: 'translate(-50%, -50%)',
              background: 'rgba(15,36,64,0.7)',
              border: `1px solid ${status === 'ativo' ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.08)'}`,
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: status === 'ativo' ? '0 0 20px rgba(59,130,246,0.2)' : 'none',
              animation: `floatCard 4s ease-in-out infinite`,
              animationDelay: delay,
              minWidth: 148,
              whiteSpace: 'nowrap',
            }}>
            <span style={{ color: status === 'ativo' ? '#60a5fa' : status === 'dado' ? '#34d399' : 'rgba(255,255,255,0.3)' }}>{icon}</span>
            <div>
              <p className="text-white text-xs font-semibold leading-none mb-0.5">{label}</p>
              <p className="text-[10px] leading-none" style={{ color: 'rgba(255,255,255,0.4)' }}>{sub}</p>
            </div>
            {status === 'ativo' && (
              <span className="w-1.5 h-1.5 rounded-full ml-auto shrink-0" style={{ background: '#34d399', animation: 'pulse 2s ease-in-out infinite', boxShadow: '0 0 6px #34d399' }}/>
            )}
          </div>
        )
      })}
      {/* Connector lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden style={{ opacity: 0.18 }}>
        <line x1="50%" y1="50%" x2="50%" y2="10%"  stroke="#3b82f6" strokeWidth="0.8" strokeDasharray="4 6"/>
        <line x1="50%" y1="50%" x2="85%" y2="65%"  stroke="#3b82f6" strokeWidth="0.8" strokeDasharray="4 6"/>
      </svg>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// AVATAR IA — esfera neural azul
// ═══════════════════════════════════════════════════════════
function AvatarIASection() {
  const { ref, visible } = useInView()
  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="py-20 lg:py-28 px-5 lg:px-8 w-full" style={{ background: '#071525' }}>
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-16 lg:gap-24">
          {/* Sphere */}
          <div className="shrink-0 flex items-center justify-center" style={{ width: 320, height: 320, position: 'relative' }}>
            {[280, 230, 180].map((s, i) => (
              <div key={s} className="absolute rounded-full border"
                style={{ width: s, height: s, borderColor: `rgba(59,130,246,${0.07 + i * 0.05})`, animation: `orbitRing ${10 + i * 3}s linear infinite ${i % 2 === 0 ? '' : 'reverse'}` }}/>
            ))}
            <div className="relative z-10 rounded-full flex flex-col items-center justify-center gap-3"
              style={{
                width: 140, height: 140,
                background: 'radial-gradient(circle at 40% 35%, rgba(96,165,250,0.85) 0%, rgba(59,130,246,0.7) 50%, rgba(12,35,64,0.95) 100%)',
                boxShadow: '0 0 0 16px rgba(59,130,246,0.07), 0 0 80px rgba(59,130,246,0.3)',
                animation: 'orbPulse 4s ease-in-out infinite',
              }}>
              <svg width="60" height="24" viewBox="0 0 60 24" aria-hidden>
                {[0,1,2,3,4,5,6,7].map(i => (
                  <rect key={i} x={i * 8} y={0} width={4} height={24} rx={2} fill="rgba(255,255,255,0.75)"
                    style={{ transformOrigin: `${i * 8 + 2}px 12px`, animation: `waveBar 1.2s ease-in-out infinite`, animationDelay: `${i * 0.1}s` }}/>
                ))}
              </svg>
            </div>
            <div className="absolute top-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold"
              style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.35)', color: '#93c5fd' }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#60a5fa', animation: 'pulse 2s infinite' }}/>
              IA Pastoral Operando
            </div>
            <div className="absolute bottom-10 -right-4 z-20 px-3 py-2 rounded-xl text-xs text-white max-w-[148px]"
              style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', animation: 'floatBubble 5s ease-in-out infinite', animationDelay: '1s' }}>
              "Visitante João acolhido — D+3 agendado"
            </div>
          </div>
          {/* Copy */}
          <div style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateX(32px)', transition: 'all 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s' }}>
            <p className="text-xs font-bold tracking-[0.18em] uppercase mb-4" style={{ color: '#60a5fa' }}>
              Inteligência Operacional
            </p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold mb-6 text-white leading-tight">
              Os agentes trabalham.<br/>O pastor cuida de pessoas.
            </h2>
            <p className="text-lg leading-relaxed mb-8" style={{ color: 'rgba(226,232,240,0.65)' }}>
              Os agentes do Ekthos operam 24 horas por dia. Enquanto sua liderança cuida das pessoas, nossos agentes acompanham visitantes, enviam lembretes, identificam pendências e transformam interações em visão pastoral real.
            </p>
            <ul className="space-y-4">
              {[
                ['Acolhimento automático no WhatsApp', 'Visitante novo → agente responde em segundos'],
                ['Reengajamento de quem esfriou', 'CRM identifica + agente reconecta com mensagem personalizada'],
                ['Alertas de afastamento em tempo real', 'Liderança notificada antes que o membro se perca'],
                ['Visão pastoral consolidada', 'Dashboard com dados reais — não planilha morta'],
              ].map(([title, sub]) => (
                <li key={title} className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.15)', border: '1px solid rgba(59,130,246,0.3)' }}>
                    <Check size={11} strokeWidth={2.5} style={{ color: '#60a5fa' }}/>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(226,232,240,0.45)' }}>{sub}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════
// COMPARATIVO CRM
// ═══════════════════════════════════════════════════════════
function CrmComparisonSection() {
  const { ref, visible } = useInView()
  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="py-20 lg:py-28 px-5 lg:px-8 w-full" style={{ background: '#f0f6ff' }}>
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-12" style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(20px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)' }}>
          <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: '#2563eb' }}>Diferença fundamental</p>
          <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4" style={{ color: '#0f172a' }}>
            Não é um CRM comum.
          </h2>
          <p className="text-lg max-w-2xl mx-auto" style={{ color: '#475569' }}>
            Um CRM guarda dados. O Ekthos Church age sobre eles — 24 horas por dia, sete dias por semana.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {/* CRM Comum */}
          <div className="rounded-2xl p-7 border"
            style={{ background: '#f1f5f9', borderColor: '#cbd5e1', opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateX(-24px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s' }}>
            <div className="flex items-center gap-2.5 mb-6">
              <X size={16} style={{ color: '#94a3b8' }}/>
              <h3 className="font-semibold text-base" style={{ color: '#64748b' }}>CRM Comum</h3>
            </div>
            <ul className="space-y-3.5">
              {[
                'Cadastra pessoas — e espera você consultar',
                'Guarda dados — mas não age sobre eles',
                'Depende de voluntários para contatar visitantes',
                'Exige busca manual para identificar quem afastou',
                'Relatórios estáticos que ninguém lê',
                'Pastor recebe planilha morta',
                'Silêncio quando um membro some',
              ].map(item => (
                <li key={item} className="flex items-start gap-3 text-sm" style={{ color: '#94a3b8' }}>
                  <X size={14} strokeWidth={2.5} style={{ color: '#cbd5e1', flexShrink: 0, marginTop: 2 }}/>
                  {item}
                </li>
              ))}
            </ul>
          </div>
          {/* Ekthos */}
          <div className="rounded-2xl p-7 border relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #071525 0%, #0c2340 100%)',
              borderColor: 'rgba(59,130,246,0.35)',
              boxShadow: '0 0 40px rgba(59,130,246,0.12)',
              opacity: visible ? 1 : 0,
              transform: visible ? 'none' : 'translateX(24px)',
              transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1) 0.2s',
            }}>
            <div className="absolute top-0 right-0 w-48 h-48 pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(59,130,246,0.14) 0%, transparent 70%)' }}/>
            <div className="flex items-center gap-2.5 mb-6 relative">
              <Check size={16} style={{ color: '#60a5fa' }}/>
              <h3 className="font-semibold text-base text-white">Ekthos Church</h3>
              <span className="ml-auto px-2.5 py-0.5 rounded-full text-[10px] font-bold" style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.3)' }}>Agentes ativos 24h</span>
            </div>
            <ul className="space-y-3.5 relative">
              {[
                'Agentes operam 24h usando dados do CRM',
                'Acolhe visitantes automaticamente no WhatsApp',
                'Reengaja pessoas que esfriaram — sem ação manual',
                'Alerta liderança sobre casos sensíveis em tempo real',
                'Organiza rotinas pastorais e escalas automaticamente',
                'Transforma dados em visão acionável para o pastor',
                'Follow-up D+3, D+7 disparado sem intervenção',
              ].map(item => (
                <li key={item} className="flex items-start gap-3 text-sm text-white">
                  <Check size={14} strokeWidth={2.5} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 2 }}/>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════
// FLUXO OPERACIONAL
// ═══════════════════════════════════════════════════════════
function FluxoOperacionalSection() {
  const { ref, visible } = useInView()
  const steps = [
    { n: '01', icon: <MessageCircle size={20}/>, title: 'Pessoa chega',         body: 'Visitante envia mensagem no WhatsApp da igreja' },
    { n: '02', icon: <Bot           size={20}/>, title: 'Agente acolhe',        body: 'Agente responde em segundos, coleta dados e registra no CRM' },
    { n: '03', icon: <Bell          size={20}/>, title: 'Follow-up automático', body: 'D+3 e D+7: agente envia mensagens personalizadas por perfil' },
    { n: '04', icon: <Shield        size={20}/>, title: 'Liderança acionada',   body: 'Apenas casos que exigem cuidado humano chegam ao pastor' },
    { n: '05', icon: <BarChart2     size={20}/>, title: 'Visão consolidada',    body: 'Dashboard com novos contatos, conversões e saúde pastoral' },
  ]
  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="py-20 lg:py-28 px-5 lg:px-8 w-full" style={{ background: '#071525' }}>
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-14" style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(20px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)' }}>
          <p className="text-xs font-bold tracking-[0.18em] uppercase mb-3" style={{ color: '#60a5fa' }}>Como funciona</p>
          <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4 text-white">
            Do primeiro contato à visão pastoral
          </h2>
          <p className="text-base max-w-2xl mx-auto" style={{ color: 'rgba(226,232,240,0.5)' }}>
            Tudo acontece automaticamente. O pastor entra apenas onde faz diferença ser humano.
          </p>
        </div>
        <div className="relative">
          <div className="hidden lg:block absolute top-10 left-[10%] right-[10%] h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(59,130,246,0.3) 20%, rgba(59,130,246,0.3) 80%, transparent)' }}>
            <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, #3b82f6, transparent)', animation: 'travelLine 3s linear infinite', backgroundSize: '30% 100%' }}/>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-4">
            {steps.map(({ n, icon, title, body }, i) => (
              <div key={n}
                className="flex flex-col items-center text-center lg:px-2"
                style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(24px)', transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.1}s, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${0.1 + i * 0.1}s` }}>
                <div className="relative z-10 w-20 h-20 rounded-2xl flex flex-col items-center justify-center mb-4 shrink-0"
                  style={{
                    background: 'rgba(59,130,246,0.1)',
                    border: '1px solid rgba(59,130,246,0.25)',
                    boxShadow: '0 0 20px rgba(59,130,246,0.08)',
                  }}>
                  <span style={{ color: '#60a5fa' }}>{icon}</span>
                  <span className="font-mono text-[10px] font-bold mt-1" style={{ color: 'rgba(96,165,250,0.5)' }}>{n}</span>
                </div>
                <h3 className="font-semibold text-sm text-white mb-1.5">{title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'rgba(226,232,240,0.45)' }}>{body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════
// ECOSSISTEMA
// ═══════════════════════════════════════════════════════════
const ECOSSISTEMA_ITEMS: { icon: EkthosIconName; label: string; desc: string }[] = [
  { icon: 'pessoas',       label: 'Pessoas',          desc: 'Cadastro pastoral completo com histórico de cada membro' },
  { icon: 'discipulado',   label: 'Discipulado',       desc: 'Pipeline editável do visitante ao líder em 11 etapas' },
  { icon: 'eventos',       label: 'Eventos',           desc: 'Calendário recorrente com checklist e presença automática' },
  { icon: 'celulas',       label: 'Células',           desc: 'Gestão de grupos, líderes, relatórios e frequência' },
  { icon: 'voluntarios',   label: 'Voluntários',       desc: 'Escalas inteligentes com confirmação por WhatsApp' },
  { icon: 'notificacoes',  label: 'Notificações',      desc: 'Alertas pastorais em tempo real — ausências, aniversários' },
  { icon: 'qr-entrada',    label: 'QR de Entrada',     desc: 'Check-in por QR code e presença em cultos sem fricção' },
  { icon: 'mensageria-ia', label: 'Mensageria IA',     desc: 'Agentes pastorais que se comunicam automaticamente' },
  { icon: 'cockpit',       label: 'Cockpit Pastoral',  desc: 'Visão 360° da saúde espiritual e operacional da igreja' },
]
function EcossistemaSection() {
  const { ref, visible } = useInView()
  return (
    <section ref={ref as React.RefObject<HTMLElement>} className="py-20 lg:py-28 px-5 lg:px-8 w-full" style={{ background: '#071525' }}>
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14" style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(24px)', transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)' }}>
          <p className="text-xs font-bold tracking-[0.18em] uppercase mb-3" style={{ color: '#60a5fa' }}>Ecossistema completo</p>
          <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4 text-white leading-tight">
            Tudo que sua igreja precisa,<br className="hidden lg:block"/> em um só lugar
          </h2>
          <p className="text-base max-w-xl mx-auto leading-relaxed" style={{ color: 'rgba(226,232,240,0.5)' }}>
            Cada módulo foi pensado para o cotidiano pastoral — não para o relatório corporativo.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ECOSSISTEMA_ITEMS.map(({ icon, label, desc }, i) => (
            <div key={icon}
              className="group relative rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: 'rgba(59,130,246,0.04)',
                border: '1px solid rgba(59,130,246,0.1)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                opacity: visible ? 1 : 0,
                transform: visible ? 'none' : 'translateY(20px)',
                transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 0.05}s, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 0.05}s, box-shadow 0.3s, border-color 0.3s`,
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(59,130,246,0.08)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(59,130,246,0.25)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(59,130,246,0.04)'; (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(59,130,246,0.1)' }}
            >
              <div className="flex items-start gap-4">
                <div className="shrink-0 flex items-center justify-center rounded-xl" style={{ width: 44, height: 44, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                  <EkthosIcon name={icon} size={22} strokeWidth={1.5}/>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm text-white mb-1">{label}</p>
                  <p className="text-xs leading-relaxed" style={{ color: 'rgba(226,232,240,0.45)' }}>{desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ═══════════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════════
const FAQ_ITEMS = [
  { q: 'O que exatamente fazem os agentes de IA do Ekthos Church?', a: 'Os agentes operam 24 horas por dia usando os dados do CRM da sua igreja. O Agente de Acolhimento aborda novos visitantes no WhatsApp automaticamente; o Agente de Reengajamento identifica pessoas que esfriaram e as reconecta. Tudo sem intervenção manual.' },
  { q: 'Preciso ter conhecimento técnico para usar o Ekthos Church?', a: 'Não. O Ekthos Church foi projetado para pastores e líderes. A interface é intuitiva e o onboarding é guiado por um assistente que configura tudo por você em menos de 30 minutos.' },
  { q: 'Os agentes Acolhimento e Reengajamento já estão disponíveis?', a: 'Sim. Ambos estão operacionais e em produção. O Agente de Acolhimento foi validado em ambiente real e o Agente de Reengajamento roda com cron autônomo. O Agente de Operação estará disponível em breve.' },
  { q: 'Meus dados ficam seguros?', a: 'Sim. Utilizamos infraestrutura de nível bancário (Supabase + PostgreSQL com criptografia em repouso e em trânsito). Seus membros e dados pastorais ficam 100% privados e você pode exportar tudo a qualquer momento.' },
  { q: 'Como funciona o onboarding?', a: 'Após contratar, você recebe acesso imediato. Nosso Agente de Onboarding guia você em 20 perguntas simples e configura todo o CRM em menos de 30 minutos.' },
  { q: 'Qual a diferença do Ekthos Church para um CRM comum?', a: 'Um CRM comum guarda dados e espera você consultar. O Ekthos Church tem agentes que agem sobre esses dados 24h: acolhem visitantes, reengajam pessoas, alertam liderança. É uma operação de igreja com IA, não uma planilha sofisticada.' },
  { q: 'Como funciona o plano Chamado?', a: 'É o plano de entrada com acesso imediato, sem consultoria. Inclui CRM completo, 5 usuários, Agente Suporte, Onboarding e Cadastro. Você pode adicionar os agentes premium Acolhimento e Reengajamento separadamente.' },
  { q: 'Posso adicionar agentes premium em qualquer plano?', a: 'Sim. Os agentes Acolhimento (R$290/mês) e Reengajamento (R$290/mês) são add-ons que funcionam em qualquer plano. Você contrata o plano base e adiciona agentes conforme a necessidade da sua igreja.' },
]

// ═══════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════
export default function Landing() {
  const [menuOpen, setMenuOpen]   = useState(false)
  const [showWa,   setShowWa]     = useState(false)
  const [faqOpen,  setFaqOpen]    = useState<number | null>(null)
  const [scrolled, setScrolled]   = useState(false)
  const pricingRef  = useRef<HTMLElement>(null)
  const agentesRef  = useRef<HTMLElement>(null)

  useEffect(() => {
    // Inject CSS keyframes once
    const id = 'ekthos-landing-kf'
    if (!document.getElementById(id)) {
      const s = document.createElement('style')
      s.id = id; s.textContent = CSS_KEYFRAMES
      document.head.appendChild(s)
    }
    // SEO
    document.title = 'Ekthos Church — Agentes de IA para sua Igreja'
    const setMeta = (n: string, c: string) => {
      let el = document.querySelector(`meta[name="${n}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('name', n); document.head.appendChild(el) }
      el.setAttribute('content', c)
    }
    const setOg = (p: string, c: string) => {
      let el = document.querySelector(`meta[property="${p}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', p); document.head.appendChild(el) }
      el.setAttribute('content', c)
    }
    setMeta('description', 'Agentes de IA trabalhando pela sua igreja todos os dias. CRM pastoral com automação de acolhimento, reengajamento e gestão. Setup em 30 minutos.')
    setOg('og:title', 'Ekthos Church — Agentes de IA para sua Igreja')
    setOg('og:description', 'Agentes de IA trabalhando pela sua igreja todos os dias. Acolhimento automático, reengajamento e visão pastoral real.')
    setOg('og:url', 'https://ekthosai.net')
    setOg('og:type', 'website')
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setShowWa(true), 3500)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  function scrollTo(ref: React.RefObject<HTMLElement | null>) {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setMenuOpen(false)
  }

  // ── Blue tokens (inline style vars) ──────────────────────
  const C = {
    accent:      '#3b82f6',
    accentHover: '#2563eb',
    accentLight: '#60a5fa',
    accentSoft:  '#93c5fd',
    deepBg:      '#071525',
    cardBg:      '#0c2340',
    cardBg2:     'rgba(12,35,64,0.7)',
    border:      'rgba(59,130,246,0.18)',
    borderAct:   'rgba(59,130,246,0.35)',
    txt:         '#e2e8f0',
    txtMuted:    '#94a3b8',
    txtDisabled: '#64748b',
    lightBg:     '#f0f6ff',
    lightBg2:    '#e8f0fe',
    txtDark:     '#0f172a',
  }

  return (
    <div className="min-h-screen font-body antialiased overflow-x-hidden" style={{ background: '#f8fafc', color: C.txtDark }}>

      {/* ── NAVBAR ─────────────────────────────────────────── */}
      <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 backdrop-blur-md border-b ${scrolled ? 'shadow-lg shadow-blue-950/30' : ''}`}
        style={{ background: 'rgba(7,21,37,0.94)', borderColor: 'rgba(59,130,246,0.12)' }}>
        <div className="max-w-7xl mx-auto px-5 lg:px-8 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center shrink-0">
            <LogoEkthos height={28} variant="light" showChurch={true}/>
          </a>
          <nav className="hidden md:flex items-center gap-7">
            {[
              { label: 'Como funciona', href: '#fluxo' },
              { label: 'Planos',        href: '#pricing' },
              { label: 'Agentes',       href: '#agentes' },
              { label: 'FAQ',           href: '#faq' },
            ].map(l => (
              <a key={l.href} href={l.href} className="text-sm font-medium transition-colors" style={{ color: 'rgba(226,232,240,0.5)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.9)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.5)')}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="hidden md:flex items-center gap-3">
            <Link to="/login" className="text-sm font-medium px-4 py-2 rounded-xl transition-colors" style={{ color: 'rgba(226,232,240,0.5)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.9)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.5)')}>
              Entrar
            </Link>
            <a href={CHAMADO_PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
              className="text-sm font-semibold px-5 py-2.5 rounded-xl text-white transition-all hover:opacity-90"
              style={{ background: C.accent, boxShadow: '0 2px 12px rgba(59,130,246,0.35)' }}>
              Começar agora
            </a>
          </div>
          <button onClick={() => setMenuOpen(o => !o)} className="md:hidden p-2" style={{ color: 'rgba(226,232,240,0.7)' }}>
            {menuOpen ? <X size={22}/> : <Menu size={22}/>}
          </button>
        </div>
        {menuOpen && (
          <div className="md:hidden px-5 pb-6 pt-2 flex flex-col gap-4 border-t" style={{ background: 'rgba(7,21,37,0.98)', borderColor: C.border }}>
            {[
              { h: '#fluxo',   l: 'Como funciona' },
              { h: '#pricing', l: 'Planos' },
              { h: '#agentes', l: 'Agentes' },
              { h: '#faq',     l: 'FAQ' },
            ].map(({ h, l }) => (
              <a key={h} href={h} onClick={() => setMenuOpen(false)} className="text-sm font-medium py-1" style={{ color: 'rgba(226,232,240,0.6)' }}>{l}</a>
            ))}
            <div className="flex gap-3 pt-2">
              <Link to="/login" onClick={() => setMenuOpen(false)} className="flex-1 text-center text-sm font-medium py-2.5 rounded-xl border" style={{ borderColor: C.border, color: C.txt }}>
                Entrar
              </Link>
              <a href={CHAMADO_PAYMENT_LINK} target="_blank" rel="noopener noreferrer" className="flex-1 text-sm font-semibold py-2.5 rounded-xl text-white text-center" style={{ background: C.accent }}>
                Começar
              </a>
            </div>
          </div>
        )}
      </header>

      {/* ── HERO ───────────────────────────────────────────── */}
      <section className="min-h-screen flex flex-col lg:flex-row items-center px-5 lg:px-8 max-w-7xl mx-auto gap-8 lg:gap-12"
        style={{ background: '#f8fafc', paddingTop: 'calc(4rem + 48px)', paddingBottom: '4rem' }}>
        {/* Copy */}
        <div className="flex-1 text-center lg:text-left" style={{ animation: 'fadeInUp 0.8s cubic-bezier(0.16,1,0.3,1) both' }}>
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold mb-6"
            style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', color: C.accent }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#34d399', animation: 'pulse 2s infinite' }}/>
            2 agentes operacionais em produção
          </div>
          <h1 className="font-display text-4xl lg:text-5xl xl:text-[3.5rem] font-bold leading-tight mb-6" style={{ color: C.txtDark, letterSpacing: '-0.02em' }}>
            Agentes de IA trabalhando pela sua igreja{' '}
            <span style={{ color: C.accent }}>todos os dias.</span>
          </h1>
          <p className="text-lg lg:text-xl leading-relaxed mb-6 max-w-xl mx-auto lg:mx-0" style={{ color: '#475569' }}>
            O Ekthos Church une CRM, automação e agentes de IA para acolher visitantes, reengajar pessoas, organizar rotinas e entregar visão real para a liderança.
          </p>
          <p className="text-sm italic mb-8" style={{ color: C.accent }}>
            "Conheces o estado do teu rebanho e põe o coração nos teus gados." — Pv 27:23
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
            <a href={CHAMADO_PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl text-white font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: C.accent, minHeight: 56, boxShadow: '0 4px 20px rgba(59,130,246,0.35)' }}>
              Começar com Plano Chamado — R$&nbsp;689,90/mês
            </a>
            <button onClick={() => scrollTo(agentesRef)}
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all hover:opacity-80 active:scale-[0.98]"
              style={{ background: 'transparent', color: C.txtDark, border: `1.5px solid rgba(59,130,246,0.25)`, minHeight: 56 }}>
              Ver como funciona <ArrowRight size={16}/>
            </button>
          </div>
          <p className="mt-6 text-sm text-center lg:text-left" style={{ color: C.txtMuted }}>
            Setup em 30 minutos · Suporte em português · Sem contrato de fidelidade
          </p>
        </div>
        {/* Orb visual */}
        <div className="flex-1 w-full max-w-lg lg:max-w-none" style={{ animation: 'fadeInUp 0.9s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}>
          <div className="rounded-3xl overflow-hidden relative" style={{ background: C.deepBg, padding: '16px 0' }}>
            <HeroOrbVisual/>
          </div>
        </div>
      </section>

      {/* ── STATS BAR ──────────────────────────────────────── */}
      <section className="py-14 border-y w-full" style={{ background: '#e8f0fe', borderColor: '#c7d9fc' }}>
        <div className="max-w-5xl mx-auto px-5 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { label: 'Setup completo',       sub: 'menos de 30 minutos' },
              { label: '2 Agentes ativos',     sub: 'operacionais em produção' },
              { label: 'Dados 100% seus',      sub: 'exportação a qualquer hora' },
              { label: 'Suporte em português', sub: 'time pastoral dedicado' },
            ].map(s => (
              <div key={s.label} className="py-2">
                <p className="font-display text-base font-bold mb-1" style={{ color: C.txtDark }}>{s.label}</p>
                <p className="text-sm" style={{ color: '#475569' }}>{s.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FLUXO OPERACIONAL ──────────────────────────────── */}
      <span id="fluxo"/>
      <FluxoOperacionalSection/>

      {/* ── AVATAR IA ──────────────────────────────────────── */}
      <AvatarIASection/>

      {/* ── COMPARATIVO CRM ────────────────────────────────── */}
      <CrmComparisonSection/>

      {/* ── ECOSSISTEMA ────────────────────────────────────── */}
      <EcossistemaSection/>

      {/* ══════════════════════════════════════════════════════
          BLOCO COMERCIAL 1 — PLANOS (VEM PRIMEIRO)
      ══════════════════════════════════════════════════════ */}
      <section id="pricing" ref={pricingRef} className="py-20 lg:py-32 px-5 lg:px-8 scroll-mt-20 w-full" style={{ background: C.lightBg }}>
        <div className="max-w-7xl mx-auto">

          {/* Quote tese */}
          <div className="text-center mb-4">
            <p className="text-sm italic max-w-2xl mx-auto px-4 py-3 rounded-xl inline-block" style={{ color: '#2563eb', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.12)' }}>
              "Comece com um plano mensal. Depois adicione agentes e módulos conforme a necessidade da sua igreja."
            </p>
          </div>

          <div className="text-center mb-14 mt-8">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: C.accent }}>Planos mensais</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold mb-4" style={{ color: C.txtDark }}>
              Escolha o plano da sua igreja
            </h2>
            <p className="text-lg max-w-xl mx-auto" style={{ color: '#475569' }}>
              Do self-service ao consultivo — escolha o que faz sentido para a sua realidade.
            </p>
          </div>

          {/* 4 cards de plano — tamanho maior, mais detalhe */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-start mb-6">

            {/* CHAMADO */}
            <div className="relative rounded-2xl border flex flex-col transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-0.5"
              style={{ background: '#fff', borderColor: '#dbeafe', boxShadow: '0 1px 4px rgba(59,130,246,0.06)' }}>
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                <span className="px-4 py-1.5 rounded-full text-xs font-bold text-white" style={{ background: C.accent }}>Recomendado para começar</span>
              </div>
              <div className="p-7 pt-9 flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)', border: `1px solid ${C.border}` }}>
                    <Star size={16} strokeWidth={1.75} style={{ color: C.accent }}/>
                  </div>
                  <div>
                    <p className="font-bold text-base" style={{ color: C.txtDark }}>Chamado</p>
                    <p className="text-xs" style={{ color: C.txtMuted }}>Igreja em crescimento</p>
                  </div>
                </div>
                <div className="mb-1">
                  <span className="font-mono font-bold text-4xl" style={{ color: C.txtDark }}>R$689,90</span>
                  <span className="text-sm ml-1" style={{ color: C.txtMuted }}>/mês</span>
                </div>
                <p className="text-xs mb-6" style={{ color: C.txtMuted }}>Até 500 membros · 5 usuários</p>
                <ul className="space-y-2.5 mb-4">
                  {['CRM pastoral completo', 'Caminho de discipulado 11 etapas', 'Células e ministérios', '4 agentes internos inclusos', 'Suporte por email', 'Acesso imediato — sem consultoria'].map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={14} strokeWidth={2.5} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }}/>
                      <span style={{ color: C.txtDark }}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-7 pb-7">
                <a href={CHAMADO_PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
                  className="w-full py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 flex items-center justify-center"
                  style={{ background: C.accent, color: '#fff', minHeight: 52, boxShadow: '0 4px 16px rgba(59,130,246,0.3)' }}>
                  Começar agora →
                </a>
                <p className="text-center text-xs mt-2" style={{ color: C.txtMuted }}>Acesso imediato · sem burocracia</p>
              </div>
            </div>

            {/* MISSÃO */}
            <div className="relative rounded-2xl border-2 flex flex-col transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/20 hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, #071525 0%, #0c2340 100%)', borderColor: C.accent, boxShadow: `0 4px 24px rgba(59,130,246,0.15)` }}>
              <div className="p-7 flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.2)', border: `1px solid rgba(59,130,246,0.35)` }}>
                    <Zap size={16} strokeWidth={1.75} style={{ color: C.accentLight }}/>
                  </div>
                  <div>
                    <p className="font-bold text-base text-white">Missão</p>
                    <p className="text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>Igreja consolidada</p>
                  </div>
                </div>
                <div className="mb-1">
                  <span className="font-mono font-bold text-4xl text-white">R$1.639,90</span>
                  <span className="text-sm ml-1" style={{ color: 'rgba(226,232,240,0.5)' }}>/mês</span>
                </div>
                <p className="text-xs mb-6" style={{ color: 'rgba(226,232,240,0.4)' }}>Até 1.000 membros · 8 usuários</p>
                <ul className="space-y-2.5 mb-4">
                  {['Tudo do plano Chamado', 'Financeiro Pro incluso', 'Relatórios automáticos', 'Automações pastorais avançadas', 'Suporte prioritário', 'Onboarding consultivo'].map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={14} strokeWidth={2.5} style={{ color: '#60a5fa', flexShrink: 0, marginTop: 1 }}/>
                      <span style={{ color: 'rgba(226,232,240,0.85)' }}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-7 pb-7">
                <a href={WA.missao} target="_blank" rel="noopener noreferrer"
                  className="w-full py-4 rounded-xl font-semibold text-base text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
                  style={{ background: '#25D366', minHeight: 52 }}>
                  {WA_ICON} Falar com vendas
                </a>
                <p className="text-center text-xs mt-2" style={{ color: 'rgba(226,232,240,0.35)' }}>Proposta em 24h</p>
              </div>
            </div>

            {/* AVIVAMENTO */}
            <div className="relative rounded-2xl border flex flex-col transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-0.5"
              style={{ background: '#fff', borderColor: '#dbeafe', boxShadow: '0 1px 4px rgba(59,130,246,0.06)' }}>
              <div className="p-7 flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)', border: `1px solid ${C.border}` }}>
                    <Crown size={16} strokeWidth={1.75} style={{ color: C.accent }}/>
                  </div>
                  <div>
                    <p className="font-bold text-base" style={{ color: C.txtDark }}>Avivamento</p>
                    <p className="text-xs" style={{ color: C.txtMuted }}>Igreja em escala</p>
                  </div>
                </div>
                <div className="mb-1">
                  <span className="font-mono font-bold text-4xl" style={{ color: C.txtDark }}>R$2.469,90</span>
                  <span className="text-sm ml-1" style={{ color: C.txtMuted }}>/mês</span>
                </div>
                <p className="text-xs mb-4" style={{ color: C.txtMuted }}>Até 10.000 membros · 10 usuários</p>
                <div className="rounded-xl p-3.5 mb-4 border" style={{ background: 'rgba(59,130,246,0.04)', borderColor: C.border }}>
                  <p className="text-xs font-bold mb-2" style={{ color: C.accent }}>Inclusos:</p>
                  {['Financeiro Pro', 'Volunteer Pro'].map(d => (
                    <div key={d} className="flex items-center gap-2 text-xs font-medium mt-1.5" style={{ color: C.txtDark }}>
                      <Check size={12} strokeWidth={2.5} style={{ color: '#22c55e' }}/>{d}
                    </div>
                  ))}
                </div>
                <ul className="space-y-2.5 mb-4">
                  {['Tudo do plano Missão', '10 usuários administrativos', '6 agentes IA completos', 'Multi-site básico'].map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={14} strokeWidth={2.5} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }}/>
                      <span style={{ color: C.txtDark }}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-7 pb-7">
                <a href={WA.avivamento} target="_blank" rel="noopener noreferrer"
                  className="w-full py-4 rounded-xl font-semibold text-base text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
                  style={{ background: '#25D366', minHeight: 52 }}>
                  {WA_ICON} Falar com vendas
                </a>
                <p className="text-center text-xs mt-2" style={{ color: C.txtMuted }}>Consultoria dedicada</p>
              </div>
            </div>

            {/* ENTERPRISE */}
            <div className="relative rounded-2xl border flex flex-col transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/10 hover:-translate-y-0.5"
              style={{ background: '#fff', borderColor: '#dbeafe', boxShadow: '0 1px 4px rgba(59,130,246,0.06)' }}>
              <div className="p-7 flex-1">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.08)', border: `1px solid ${C.border}` }}>
                    <Smartphone size={16} strokeWidth={1.75} style={{ color: C.accent }}/>
                  </div>
                  <div>
                    <p className="font-bold text-base" style={{ color: C.txtDark }}>Enterprise</p>
                    <p className="text-xs" style={{ color: C.txtMuted }}>Rede de igrejas · 10.000+</p>
                  </div>
                </div>
                <div className="mb-1">
                  <span className="font-display font-bold text-3xl" style={{ color: C.txtDark }}>Sob proposta</span>
                </div>
                <p className="text-xs mb-6" style={{ color: C.txtMuted }}>Preço por sedes e volume de membros</p>
                <ul className="space-y-2.5 mb-6">
                  {['Múltiplas sedes em um painel', 'Gestão centralizada de líderes', 'Relatórios por rede e sede', 'Agentes configurados por sede', 'SLA e suporte enterprise', 'Onboarding presencial'].map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <Check size={14} strokeWidth={2.5} style={{ color: '#22c55e', flexShrink: 0, marginTop: 1 }}/>
                      <span style={{ color: C.txtDark }}>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="px-7 pb-7">
                <a href={WA.enterprise} target="_blank" rel="noopener noreferrer"
                  className="w-full py-4 rounded-xl font-semibold text-base text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
                  style={{ background: '#25D366', minHeight: 52 }}>
                  {WA_ICON} Falar com vendas
                </a>
                <p className="text-center text-xs mt-2" style={{ color: C.txtMuted }}>Proposta em até 24h</p>
              </div>
            </div>
          </div>

          {/* Addons linha */}
          <div className="mt-8 rounded-2xl border p-6 lg:p-8" style={{ background: '#fff', borderColor: '#dbeafe' }}>
            <p className="font-semibold text-center mb-6" style={{ color: C.txtDark }}>Usuários extras — disponíveis em qualquer plano</p>
            <div className="flex justify-center">
              <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: C.lightBg }}>
                <Users size={16} style={{ color: C.accent, marginTop: 2 }}/>
                <div>
                  <p className="font-semibold text-sm" style={{ color: C.txtDark }}>Usuário adicional</p>
                  <p className="text-xs font-medium mt-0.5" style={{ color: C.accent }}>R$ 59,90/mês</p>
                  <p className="text-xs mt-0.5" style={{ color: C.txtMuted }}>Mais líderes com acesso administrativo.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SEPARADOR VISUAL ────────────────────────────────── */}
      <div className="w-full py-10 px-5 lg:px-8" style={{ background: '#071525' }}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px" style={{ background: 'rgba(59,130,246,0.15)' }}/>
            <p className="text-sm font-semibold px-4 py-2 rounded-full" style={{ color: '#93c5fd', background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)' }}>
              Complementos ao seu plano
            </p>
            <div className="flex-1 h-px" style={{ background: 'rgba(59,130,246,0.15)' }}/>
          </div>
          <p className="mt-4 text-sm" style={{ color: 'rgba(226,232,240,0.45)' }}>
            Os agentes premium e módulos Pro são add-ons. Você escolhe quando ativar e qual usar.
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          BLOCO COMERCIAL 2A — AGENTES PREMIUM (VEM DEPOIS)
      ══════════════════════════════════════════════════════ */}
      <section id="agentes" ref={agentesRef as React.RefObject<HTMLElement>} className="py-16 lg:py-24 px-5 lg:px-8 w-full scroll-mt-16" style={{ background: '#071525' }}>
        <div className="max-w-7xl mx-auto">
          <div className="mb-10 text-center">
            <p className="text-xs font-bold tracking-[0.18em] uppercase mb-3" style={{ color: '#60a5fa' }}>Agentes premium pastorais</p>
            <h2 className="font-display text-2xl lg:text-3xl font-bold mb-3 text-white">
              Agentes que trabalham enquanto você cuida de pessoas
            </h2>
            <p className="text-sm max-w-2xl mx-auto" style={{ color: 'rgba(226,232,240,0.5)' }}>
              Adicione ao seu plano conforme a necessidade. Acolhimento e Reengajamento estão operacionais hoje.
            </p>
          </div>

          {/* 3 agent cards — menor que cards de plano */}
          <div className="grid md:grid-cols-3 gap-5 mb-12">
            {[
              {
                slug: 'Acolhimento',
                price: 'R$ 290/mês',
                status: 'ativo',
                tagline: 'Pessoa que CHEGA — Acolhe automaticamente 24h',
                icon: <MessageCircle size={18}/>,
                paymentLink: ACOLHIMENTO_PAYMENT_LINK,
                waLink: WA.acolhimento,
                desc: 'Aborda novos visitantes automaticamente via WhatsApp após o culto, usando dados do CRM para personalizar cada conversa.',
                items: ['Boas-vindas em segundos', 'Coleta de dados e perfil pastoral', 'Follow-up D+3 e D+7 automático', 'Relatório semanal de novos contatos'],
              },
              {
                slug: 'Reengajamento',
                price: 'R$ 290/mês',
                status: 'ativo',
                tagline: 'Pessoa que ESFRIA — Detecta e reativa',
                icon: <TrendingUp size={18}/>,
                paymentLink: null,
                waLink: WA.reengajamento,
                desc: 'Identifica membros afastados no CRM e os aborda com mensagens personalizadas, devolvendo-os à comunidade.',
                items: ['Detecção automática por afastamento', 'Mensagens contextualizadas por perfil', 'Fluxo de reconexão em etapas', 'Cron autônomo — zero intervenção manual'],
              },
              {
                slug: 'Operação',
                price: 'R$ 390/mês',
                status: 'breve',
                tagline: 'Culto/evento ACONTECE — Escalas, agenda, rotinas',
                icon: <Zap size={18}/>,
                paymentLink: null,
                waLink: WA.operacao,
                desc: 'Coordena a operação pastoral diária: confirma escalas, lembra líderes, sincroniza eventos e gera relatórios automáticos.',
                items: ['Confirmação de escalas por WhatsApp', 'Lembretes automáticos de células', 'Sincronização de agenda pastoral', 'Relatório executivo semanal'],
              },
            ].map(agent => (
              <div key={agent.slug}
                className="rounded-2xl p-5 flex flex-col relative overflow-hidden group transition-all duration-300"
                style={{
                  background: agent.status === 'ativo' ? 'rgba(59,130,246,0.05)' : 'rgba(255,255,255,0.02)',
                  border: `1px solid ${agent.status === 'ativo' ? C.borderAct : 'rgba(255,255,255,0.07)'}`,
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                  boxShadow: agent.status === 'ativo' ? '0 0 28px rgba(59,130,246,0.1)' : 'none',
                }}>
                {agent.status === 'ativo' && (
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at 30% 20%, rgba(59,130,246,0.08) 0%, transparent 70%)' }}/>
                )}
                <div className="flex items-start justify-between mb-3 relative">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: agent.status === 'ativo' ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.05)', color: agent.status === 'ativo' ? '#60a5fa' : 'rgba(255,255,255,0.25)' }}>
                      {agent.icon}
                    </div>
                    <div>
                      <p className="font-semibold text-white text-sm">Agente {agent.slug}</p>
                      <p className="font-mono text-xs mt-0.5" style={{ color: agent.status === 'ativo' ? '#60a5fa' : 'rgba(255,255,255,0.25)' }}>{agent.price}</p>
                    </div>
                  </div>
                  {agent.status === 'ativo' ? (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.25)', color: '#4ade80' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400" style={{ animation: 'pulse 2s infinite' }}/>🟢 Operacional
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0" style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', color: '#fbbf24' }}>
                      🟡 Em breve
                    </span>
                  )}
                </div>
                <p className="text-xs italic mb-3 relative" style={{ color: agent.status === 'ativo' ? '#93c5fd' : 'rgba(226,232,240,0.35)' }}>{agent.tagline}</p>
                <p className="text-xs leading-relaxed mb-4 relative" style={{ color: 'rgba(226,232,240,0.5)' }}>{agent.desc}</p>
                <ul className="space-y-1.5 flex-1 relative mb-4">
                  {agent.items.map(item => (
                    <li key={item} className="flex items-start gap-2 text-xs" style={{ color: 'rgba(226,232,240,0.6)' }}>
                      <Check size={11} strokeWidth={2.5} style={{ color: agent.status === 'ativo' ? '#60a5fa' : 'rgba(255,255,255,0.25)', flexShrink: 0, marginTop: 1 }}/>
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="relative">
                  {agent.paymentLink ? (
                    <a href={agent.paymentLink} target="_blank" rel="noopener noreferrer"
                      className="w-full py-2.5 rounded-xl font-semibold text-sm text-white text-center transition-all hover:opacity-90 block"
                      style={{ background: C.accent, boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}>
                      Adicionar ao plano →
                    </a>
                  ) : agent.status === 'ativo' ? (
                    <a href={agent.waLink} target="_blank" rel="noopener noreferrer"
                      className="w-full py-2.5 rounded-xl font-semibold text-sm text-white text-center transition-all hover:opacity-90 flex items-center justify-center gap-2"
                      style={{ background: '#25D366' }}>
                      {WA_ICON} Falar com nosso time
                    </a>
                  ) : (
                    <a href={agent.waLink} target="_blank" rel="noopener noreferrer"
                      className="w-full py-2.5 rounded-xl font-semibold text-sm text-center transition-all hover:opacity-90 flex items-center justify-center gap-2"
                      style={{ background: 'rgba(255,255,255,0.04)', color: 'rgba(226,232,240,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
                      {WA_ICON} Avise-me quando disponível
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Agentes inclusos */}
          <div className="rounded-2xl p-5" style={{ background: 'rgba(59,130,246,0.04)', border: `1px solid ${C.border}` }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(226,232,240,0.3)' }}>Inclusos em todos os planos</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { icon: <Bot size={15}/>, name: 'Suporte', desc: 'Responde dúvidas 24h' },
                { icon: <Users size={15}/>, name: 'Onboarding', desc: 'Configura CRM em 30min' },
                { icon: <MessageCircle size={15}/>, name: 'Cadastro', desc: 'Registra membros e visitantes' },
                { icon: <Bell size={15}/>, name: 'Notificação', desc: 'Alertas pastorais automáticos' },
              ].map(a => (
                <div key={a.name} className="flex items-start gap-2.5">
                  <span style={{ color: 'rgba(226,232,240,0.35)', marginTop: 1 }}>{a.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-white">{a.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'rgba(226,232,240,0.3)' }}>{a.desc}</p>
                  </div>
                  <span className="ml-auto shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: 'rgba(59,130,246,0.08)', color: '#60a5fa', border: `1px solid ${C.border}` }}>Incluso</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          BLOCO COMERCIAL 2B — MÓDULOS PRO (menor, complementar)
      ══════════════════════════════════════════════════════ */}
      <section className="py-14 lg:py-20 px-5 lg:px-8 w-full" style={{ background: '#0a1929' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-bold tracking-[0.18em] uppercase mb-3" style={{ color: '#60a5fa' }}>Módulos Pro</p>
            <h3 className="font-display text-2xl font-bold mb-3 text-white">
              Módulos especializados — adicione quando precisar
            </h3>
            <p className="text-sm max-w-xl mx-auto" style={{ color: 'rgba(226,232,240,0.45)' }}>Cada módulo Pro é um complemento ao seu plano. Todos disponíveis em breve — entre na lista de espera.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: <UserPlus size={16}/>, title: 'Volunteer Pro', price: 'R$ 890/mês', desc: 'Escalas, check-in, confirmação WhatsApp e métricas de voluntários.', items: ['Escalas automáticas com IA', 'Confirmação via WhatsApp', 'Check-in/check-out', 'Trocas entre voluntários'], wa: WA.volunteer },
              { icon: <ShieldCheck size={16}/>, title: 'Kids Pro', price: 'R$ 590/mês', desc: 'Check-in QR Code, validação de responsáveis e alertas aos pais.', items: ['Check-in com QR Code', 'Check-out seguro com validação', 'Alertas via WhatsApp aos pais', 'Controle de alergias'], wa: WA.kids },
              { icon: <DollarSign size={16}/>, title: 'Financeiro Pro', price: 'R$ 1.290/mês', desc: 'Folha, DRE, NF, conciliação e agente financeiro com IA.', items: ['Folha de pagamento', 'Notas fiscais (entrada/saída)', 'DRE e centro de custos', 'Conciliação bancária'], wa: WA.financeiro },
            ].map(mod => (
              <div key={mod.title} className="rounded-xl p-5 border flex flex-col" style={{ background: 'rgba(59,130,246,0.04)', borderColor: 'rgba(59,130,246,0.12)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span style={{ color: '#60a5fa' }}>{mod.icon}</span>
                    <h3 className="font-semibold text-sm text-white">{mod.title}</h3>
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold shrink-0 ml-2" style={{ background: 'rgba(245,158,11,0.1)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.15)' }}>Em breve · {mod.price}</span>
                </div>
                <p className="text-xs leading-relaxed mb-4" style={{ color: 'rgba(226,232,240,0.45)' }}>{mod.desc}</p>
                <ul className="space-y-1.5 flex-1 mb-4">
                  {mod.items.map(f => (
                    <li key={f} className="flex items-center gap-2 text-xs" style={{ color: 'rgba(226,232,240,0.5)' }}>
                      <Check size={11} strokeWidth={2.5} style={{ color: '#60a5fa', flexShrink: 0 }}/>{f}
                    </li>
                  ))}
                </ul>
                <a href={mod.wa} target="_blank" rel="noopener noreferrer"
                  className="w-full py-2.5 rounded-xl font-semibold text-sm text-white transition-all hover:opacity-90 flex items-center justify-center gap-2"
                  style={{ background: '#25D366' }}>
                  {WA_ICON} Entrar na lista de espera
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DEPOIMENTOS ────────────────────────────────────── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 w-full" style={{ background: '#071525' }}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-xs font-bold tracking-[0.18em] uppercase mb-3" style={{ color: '#60a5fa' }}>O que os pastores dizem</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold text-white">Pastores que transformaram sua gestão</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {[
              { name: 'Pr. Carlos Mendes',    church: 'Igreja Vida Nova — SP',            text: 'Em 3 meses, reduzi em 60% o tempo que gastava com planilhas. Agora consigo focar no que realmente importa: as pessoas.' },
              { name: 'Pr. Roberto Alves',    church: 'Comunidade Ágape — RJ',            text: 'O sistema identificou membros afastados que eu nem sabia. Recuperamos dezenas deles em 60 dias.' },
              { name: 'Pastora Lúcia Santos', church: 'Assembleia do Rei — BH',           text: 'O onboarding com IA foi surpreendente. Em 25 minutos o sistema estava configurado do jeito que nossa igreja funciona.' },
              { name: 'Pr. André Costa',      church: 'Igreja Renascer — Curitiba',       text: 'As escalas de voluntários pararam de gerar conflitos. A equipe recebe confirmação automática pelo WhatsApp.' },
              { name: 'Pr. José Ferreira',    church: 'Comunidade Shalom — Fortaleza',   text: 'Finalmente tenho números reais. Sei quantos visitantes voltaram e qual ministério precisa de atenção.' },
              { name: 'Pastora Ana Lima',     church: 'IBatista Central — Recife',       text: 'O módulo infantil trouxe mais segurança pro nosso ministério kids. Os pais ficaram muito mais tranquilos.' },
            ].map((t, i) => (
              <div key={i} className="rounded-2xl p-6 border" style={{ background: 'rgba(59,130,246,0.04)', borderColor: 'rgba(59,130,246,0.1)' }}>
                <div className="flex gap-0.5 mb-4">
                  {Array(5).fill(0).map((_, j) => <Star key={j} size={13} fill={C.accentLight} style={{ color: C.accentLight }}/>)}
                </div>
                <p className="text-sm leading-relaxed mb-5" style={{ color: 'rgba(226,232,240,0.7)' }}>"{t.text}"</p>
                <div>
                  <p className="font-semibold text-sm text-white">{t.name}</p>
                  <p className="text-xs mt-0.5" style={{ color: 'rgba(226,232,240,0.35)' }}>{t.church}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────── */}
      <section id="faq" className="py-20 lg:py-28 px-5 lg:px-8 w-full" style={{ background: C.lightBg }}>
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold uppercase tracking-widest mb-3" style={{ color: C.accent }}>Dúvidas frequentes</p>
            <h2 className="font-display text-3xl lg:text-4xl font-bold" style={{ color: C.txtDark }}>Respondemos antes de você perguntar</h2>
          </div>
          <div className="space-y-3">
            {FAQ_ITEMS.map((item, i) => (
              <div key={i} className="rounded-2xl border shadow-sm overflow-hidden" style={{ background: '#fff', borderColor: '#dbeafe' }}>
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  className="w-full flex items-center justify-between px-6 py-5 text-left">
                  <span className="font-semibold text-base pr-4" style={{ color: C.txtDark }}>{item.q}</span>
                  <ChevronDown size={18} strokeWidth={2} style={{ color: C.accent, flexShrink: 0, transform: faqOpen === i ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s ease' }}/>
                </button>
                {faqOpen === i && (
                  <div className="px-6 pb-5">
                    <p className="text-sm leading-relaxed" style={{ color: '#475569' }}>{item.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ──────────────────────────────────────── */}
      <section className="py-20 lg:py-28 px-5 lg:px-8 w-full relative overflow-hidden" style={{ background: '#071525' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(59,130,246,0.14) 0%, transparent 60%)' }}/>
        <div className="max-w-3xl mx-auto text-center relative">
          <p className="text-xs font-bold tracking-[0.18em] uppercase mb-4" style={{ color: 'rgba(226,232,240,0.35)' }}>Comece hoje</p>
          <h2 className="font-display text-3xl lg:text-4xl font-bold text-white mb-5">
            Comece com agentes trabalhando pela sua igreja.
          </h2>
          <p className="text-lg mb-3 max-w-xl mx-auto" style={{ color: 'rgba(226,232,240,0.7)' }}>
            Setup em 30 minutos. Suporte em português. Agentes operacionais no mesmo dia.
          </p>
          <p className="text-sm italic mb-10" style={{ color: 'rgba(226,232,240,0.4)' }}>
            "O bom pastor dá a sua vida pelas ovelhas." — Jo 10:11
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href={CHAMADO_PAYMENT_LINK} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl font-semibold text-base transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: C.accent, color: '#fff', minHeight: 56, boxShadow: '0 4px 24px rgba(59,130,246,0.4)' }}>
              Assinar Plano Chamado
            </a>
            <a href={WA.cta} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-10 py-4 rounded-xl font-semibold text-base text-white transition-all hover:opacity-90 active:scale-[0.98]"
              style={{ background: '#25D366', minHeight: 56 }}>
              {WA_ICON} Falar com nosso time
            </a>
            <button onClick={() => scrollTo(pricingRef)}
              className="flex items-center justify-center gap-2 px-8 py-4 rounded-xl font-semibold text-base transition-all hover:opacity-80"
              style={{ background: 'rgba(59,130,246,0.08)', color: C.txt, border: `1px solid ${C.border}`, minHeight: 56 }}>
              Conhecer os planos
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ─────────────────────────────────────────── */}
      <footer className="w-full border-t" style={{ background: '#071525', borderColor: 'rgba(59,130,246,0.1)' }}>
        <div className="max-w-7xl mx-auto px-5 lg:px-8 py-16">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div>
              <div className="mb-4"><LogoEkthos variant="light" height={36} showChurch={true}/></div>
              <p className="text-sm leading-relaxed" style={{ color: 'rgba(226,232,240,0.4)' }}>
                Uma operação de igreja com agentes de IA, usando o CRM como base de dados.
              </p>
              <p className="text-xs mt-4" style={{ color: 'rgba(226,232,240,0.2)' }}>CNPJ 00.000.000/0001-00</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(226,232,240,0.3)' }}>Produto</p>
              <ul className="space-y-2.5">
                {[['#fluxo', 'Como funciona'], ['#pricing', 'Planos'], ['#agentes', 'Agentes IA'], ['#faq', 'FAQ']].map(([h, l]) => (
                  <li key={h}><a href={h} className="text-sm transition-colors" style={{ color: 'rgba(226,232,240,0.45)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#60a5fa')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.45)')}>{l}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(226,232,240,0.3)' }}>Planos</p>
              <ul className="space-y-2.5">
                {[
                  [CHAMADO_PAYMENT_LINK, 'Chamado — R$689,90'],
                  [WA.missao, 'Missão — R$1.639,90'],
                  [WA.avivamento, 'Avivamento — R$2.469,90'],
                  [WA.enterprise, 'Enterprise — Sob proposta'],
                ].map(([h, l]) => (
                  <li key={l}><a href={h} target="_blank" rel="noopener noreferrer" className="text-sm transition-colors" style={{ color: 'rgba(226,232,240,0.45)' }}
                    onMouseEnter={e => (e.currentTarget.style.color = '#60a5fa')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.45)')}>{l}</a></li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest mb-4" style={{ color: 'rgba(226,232,240,0.3)' }}>Contato</p>
              <a href={WA.hero} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                style={{ background: '#25D366' }}>
                {WA_ICON} WhatsApp
              </a>
              <p className="text-xs mt-5" style={{ color: 'rgba(226,232,240,0.3)' }}>
                Suporte em português<br/>Time pastoral dedicado
              </p>
            </div>
          </div>
          <div className="pt-8 border-t flex flex-col md:flex-row items-center justify-between gap-4" style={{ borderColor: 'rgba(59,130,246,0.08)' }}>
            <p className="text-xs" style={{ color: 'rgba(226,232,240,0.2)' }}>© 2026 Ekthos Church. Todos os direitos reservados.</p>
            <div className="flex gap-5">
              {[['#', 'Política de Privacidade'], ['#', 'Termos de Uso']].map(([h, l]) => (
                <a key={l} href={h} className="text-xs transition-colors" style={{ color: 'rgba(226,232,240,0.2)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#60a5fa')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'rgba(226,232,240,0.2)')}>{l}</a>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {/* ── WA FLUTUANTE ───────────────────────────────────── */}
      {showWa && (
        <a href={WA.cta} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"
          className="fixed bottom-6 right-6 z-50 flex items-center justify-center rounded-full text-white shadow-xl transition-all hover:scale-105 active:scale-95"
          style={{ width: 56, height: 56, background: '#25D366', boxShadow: '0 4px 20px rgba(37,211,102,0.4)', animation: 'waPulse 3s ease-in-out infinite', animationDelay: '1s' }}>
          {WA_ICON}
        </a>
      )}
    </div>
  )
}
