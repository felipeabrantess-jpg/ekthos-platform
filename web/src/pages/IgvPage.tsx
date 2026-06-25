/**
 * IgvPage — /igv  (v4 iOS UX)
 * v3: foto inteira, 11 botões, install Android.
 * v4: logo oficial hero, meta tags Apple, modal iOS visual (SVG Compartilhar +
 *     seta + detecção in-app browser), fix apple-touch-icon.
 * LGPD R8: zero SELECT em people. INSERT only via visitor-capture EF.
 */

import { useState, useEffect, useRef }          from 'react'
import { Link }                                  from 'react-router-dom'
import {
  ChevronRight, Users, BookOpen,
  Share2, Calendar, Book, Building2,
  CalendarCheck, Heart, Smartphone, Copy, GraduationCap, Briefcase, Home,
} from 'lucide-react'
import { IGV } from '@/lib/igv-public-data'

// ── Tipo PWA (não existe no lib.dom padrão) ────────────────────────

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

// ── Logos oficiais de redes sociais ────────────────────────────────

function WhatsAppLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function InstagramLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ig-grad-v4" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#f09433" />
          <stop offset="25%"  stopColor="#e6683c" />
          <stop offset="50%"  stopColor="#dc2743" />
          <stop offset="75%"  stopColor="#cc2366" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <path fill="url(#ig-grad-v4)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

function YouTubeLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#FF0000" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  )
}

// ── SVG do ícone Compartilhar nativo do Safari ─────────────────────
// Réplica fiel: caixa com seta para cima, igual ao botão no Safari iOS

function SafariShareIcon({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

// ── Hooks de instalação PWA ─────────────────────────────────────────

function useInstallPrompt() {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null)
  const [canInstall, setCanInstall] = useState(false)
  const [isInstalled, setIsInstalled] = useState(false)

  useEffect(() => {
    setIsInstalled(window.matchMedia('(display-mode: standalone)').matches)
    const handler = (e: Event) => {
      e.preventDefault()
      promptRef.current = e as BeforeInstallPromptEvent
      setCanInstall(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    window.addEventListener('appinstalled', () => {
      setCanInstall(false)
      setIsInstalled(true)
    })
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const install = async () => {
    if (!promptRef.current) return
    await promptRef.current.prompt()
    const { outcome } = await promptRef.current.userChoice
    if (outcome === 'accepted') {
      setCanInstall(false)
      setIsInstalled(true)
    }
    promptRef.current = null
  }

  return { canInstall, isInstalled, install }
}

function useIsIOSSafari() {
  const [isIOS, setIsIOS] = useState(false)
  useEffect(() => {
    const ua         = navigator.userAgent
    const ios        = /iPad|iPhone|iPod/.test(ua)
    const webkit     = /WebKit/.test(ua) && !/CriOS|FxiOS|OPiOS/.test(ua)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    setIsIOS(ios && webkit && !standalone)
  }, [])
  return isIOS
}

// Detecta in-app browsers que bloqueiam "Adicionar à Tela de Início":
// Instagram, Facebook, WhatsApp, Chrome iOS, TikTok, etc.
function useIsInAppBrowser() {
  const [isInApp, setIsInApp] = useState(false)
  useEffect(() => {
    const ua = navigator.userAgent
    const inApp =
      /Instagram|FBAV|FBAN|WhatsApp|Musical\.ly|Snapchat|TikTok|Twitter\//.test(ua) ||
      (/CriOS/.test(ua) && /iPhone|iPad/.test(ua)) // Chrome iOS
    setIsInApp(inApp)
  }, [])
  return isInApp
}

// ── Card de ação compacto (grid 2x2) ──────────────────────────────

function ActionCard({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center justify-center bg-white rounded-2xl border border-black/[0.05] shadow-sm p-3 h-[76px] gap-1.5 active:bg-gray-50/80 transition-colors"
    >
      {children}
      <span className="text-[0.72rem] font-medium text-gray-700 leading-tight">{label}</span>
    </button>
  )
}

// ── Card "Em breve" ─────────────────────────────────────────────────

function ComingSoonCard({
  label,
  icon: Icon,
  onClick,
  wide = false,
}: {
  label: string
  icon: React.ElementType
  onClick: () => void
  wide?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex ${wide ? 'flex-row gap-2.5 px-4 justify-center h-[52px]' : 'flex-col items-center justify-center h-[76px] gap-1.5'} bg-white rounded-2xl border border-black/[0.05] shadow-sm p-3 active:bg-gray-50/60 transition-colors`}
    >
      <span className="absolute top-1.5 right-2 text-[0.55rem] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100 leading-tight">
        Em breve
      </span>
      <Icon size={wide ? 18 : 20} strokeWidth={1.75} className="text-gray-300 shrink-0" />
      <span className={`${wide ? 'text-[0.8rem]' : 'text-[0.72rem]'} font-medium text-gray-400 leading-tight`}>{label}</span>
    </button>
  )
}

// ── Componente principal ───────────────────────────────────────────

export default function IgvPage() {
  const { canInstall, isInstalled, install } = useInstallPrompt()
  const isIOS      = useIsIOSSafari()
  const isInApp    = useIsInAppBrowser()

  const [toast,           setToast]           = useState<string | null>(null)
  const [showIOSModal,    setShowIOSModal]     = useState(false)
  const [showBanner,      setShowBanner]       = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [linkCopied,      setLinkCopied]      = useState(false)

  useEffect(() => {
    if (isIOS && !isInstalled) setShowBanner(true)
  }, [isIOS, isInstalled])

  // Apple touch icon específico IGV (sobrescreve fallback global do app)
  useEffect(() => {
    const link  = document.createElement('link')
    link.rel    = 'apple-touch-icon'
    link.href   = '/icons/igv-apple-touch-icon.png'
    document.head.appendChild(link)
    return () => { document.head.removeChild(link) }
  }, [])

  // Meta tags Apple obrigatórias para PWA standalone no iOS
  useEffect(() => {
    const metas: HTMLMetaElement[] = []
    const add = (name: string, content: string) => {
      const m     = document.createElement('meta')
      m.name      = name
      m.content   = content
      document.head.appendChild(m)
      metas.push(m)
    }
    add('apple-mobile-web-app-capable',          'yes')
    add('apple-mobile-web-app-status-bar-style', 'black-translucent')
    add('apple-mobile-web-app-title',            'IGV')
    return () => metas.forEach(m => document.head.removeChild(m))
  }, [])

  // ── Helpers ──────────────────────────────────────────────────────

  function triggerToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 2500)
  }

  function showComingSoon() {
    triggerToast('Essa funcionalidade chega em breve! 🙌')
  }

  function openLink(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: IGV.name,
          text:  'Conheça a Igreja Gerando Vencedores em Niterói!',
          url:   window.location.href,
        })
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(window.location.href)
        triggerToast('Link copiado! 📋')
      }
    } catch {
      // usuário cancelou
    }
  }

  async function copyCurrentUrl() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {
      triggerToast('Link copiado! 📋')
    }
  }

  function handleInstallClick() {
    if (canInstall) {
      install()
    } else if (isIOS) {
      setShowIOSModal(true)
    }
  }

  const showInstallButton = !isInstalled && (canInstall || isIOS)

  return (
    <div
      className="min-h-screen bg-[#F9F7F4] flex flex-col"
      style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
    >

      {/* ── Hero: foto da fachada INTEIRA ── */}
      <section className="bg-[#1C0A04] w-full">
        <div className="relative max-w-[480px] mx-auto">

          <img
            src={IGV.coverUrl}
            alt="Fachada da Igreja Gerando Vencedores"
            className="w-full h-auto block"
            loading="eager"
          />

          <div
            aria-hidden="true"
            className="absolute bottom-0 left-0 right-0"
            style={{
              height: '55%',
              background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.55) 40%, transparent 100%)',
            }}
          />

          <div className="absolute bottom-0 left-0 right-0 px-5 pb-7 z-10">
            <img
              src={IGV.logoUrl}
              alt="Logo Igreja Gerando Vencedores"
              className="w-[76px] h-[76px] rounded-2xl shadow-xl object-cover"
            />
            <h1
              className="mt-3 text-[1.85rem] font-bold text-white leading-tight tracking-tight"
              style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
            >
              {IGV.name}
            </h1>
            <p className="mt-0.5 text-white/75 text-[0.875rem] font-medium">{IGV.pastor}</p>
            <p className="mt-0.5 text-white/50 text-[0.75rem]">{IGV.address}</p>

            {showInstallButton && (
              <button
                onClick={handleInstallClick}
                className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-white/15 border border-white/30 backdrop-blur-sm text-white text-[0.8rem] font-medium active:bg-white/25 transition-colors"
                aria-label={canInstall ? 'Instalar app no dispositivo' : 'Ver instruções para instalar no iOS'}
              >
                <Smartphone size={15} strokeWidth={1.75} />
                Instalar App
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <main className="flex-1 px-4 py-5 max-w-[480px] mx-auto w-full">

        <Link
          to="/igv/seja-membro"
          className="flex items-center justify-between w-full rounded-2xl p-4 mb-2.5 active:scale-[0.99] transition-all"
          style={{ background: `linear-gradient(135deg, ${IGV.primaryColor} 0%, ${IGV.secondaryColor} 100%)` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <Users size={18} strokeWidth={1.75} className="text-white" />
            </div>
            <div>
              <p className="font-semibold text-white text-[0.9rem]">Seja Membro</p>
              <p className="text-white/65 text-[0.75rem] mt-0.5">Faça parte da família IGV</p>
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2.5} className="text-white/50 shrink-0" />
        </Link>

        <Link
          to="/igv/sobre"
          className="flex items-center justify-between w-full bg-white rounded-2xl p-4 mb-2.5 border border-black/[0.05] shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${IGV.primaryColor}18`, color: IGV.primaryColor }}
            >
              <BookOpen size={18} strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-[0.9rem]">Sobre Nós</p>
              <p className="text-gray-400 text-[0.75rem] mt-0.5">Missão, visão e horários</p>
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-gray-300 shrink-0" />
        </Link>

        <Link
          to="/igv/biblia"
          className="flex items-center justify-between w-full bg-white rounded-2xl p-4 mb-2.5 border border-black/[0.05] shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${IGV.primaryColor}18`, color: IGV.primaryColor }}
            >
              <Book size={18} strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-[0.9rem]">Bíblia Sagrada</p>
              <p className="text-gray-400 text-[0.75rem] mt-0.5">66 livros — Almeida</p>
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-gray-300 shrink-0" />
        </Link>

        <Link
          to="/igv/agenda"
          className="flex items-center justify-between w-full bg-white rounded-2xl p-4 mb-2.5 border border-black/[0.05] shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${IGV.primaryColor}18`, color: IGV.primaryColor }}
            >
              <Calendar size={18} strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-[0.9rem]">Agenda</p>
              <p className="text-gray-400 text-[0.75rem] mt-0.5">Cultos e próximos eventos</p>
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-gray-300 shrink-0" />
        </Link>

        <Link
          to="/igv/cursos"
          className="flex items-center justify-between w-full bg-white rounded-2xl p-4 mb-2.5 border border-black/[0.05] shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${IGV.primaryColor}18`, color: IGV.primaryColor }}
            >
              <GraduationCap size={18} strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-[0.9rem]">Cursos</p>
              <p className="text-gray-400 text-[0.75rem] mt-0.5">Formações com inscrição</p>
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-gray-300 shrink-0" />
        </Link>

        <Link
          to="/igv/celulas"
          className="flex items-center justify-between w-full bg-white rounded-2xl p-4 mb-2.5 border border-black/[0.05] shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${IGV.primaryColor}18`, color: IGV.primaryColor }}
            >
              <Home size={18} strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-[0.9rem]">Nossas Células</p>
              <p className="text-gray-400 text-[0.75rem] mt-0.5">12 GGVs — encontre a mais perto</p>
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-gray-300 shrink-0" />
        </Link>

        <Link
          to="/igv/empresarios"
          className="flex items-center justify-between w-full bg-white rounded-2xl p-4 mb-4 border border-black/[0.05] shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${IGV.primaryColor}18`, color: IGV.primaryColor }}
            >
              <Briefcase size={18} strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-[0.9rem]">Rede de Negócios</p>
              <p className="text-gray-400 text-[0.75rem] mt-0.5">Empresários da congregação</p>
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-gray-300 shrink-0" />
        </Link>

        <p
          className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] mb-2.5"
          style={{ color: IGV.primaryColor }}
        >
          Conecte-se
        </p>

        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <ActionCard label="WhatsApp" onClick={() => openLink(`https://wa.me/${IGV.whatsapp}`)}>
            <WhatsAppLogo size={24} />
          </ActionCard>
          <ActionCard label={`@${IGV.instagramHandle}`} onClick={() => openLink(`https://instagram.com/${IGV.instagramHandle}`)}>
            <InstagramLogo size={24} />
          </ActionCard>
          <ActionCard label="YouTube" onClick={() => openLink(IGV.youtubeUrl)}>
            <YouTubeLogo size={24} />
          </ActionCard>
          <ActionCard label="Compartilhar" onClick={handleShare}>
            <Share2 size={22} strokeWidth={1.75} style={{ color: IGV.primaryColor }} />
          </ActionCard>
        </div>

        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-gray-400 mb-2.5">
          Em breve
        </p>

        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          <Link
            to="/igv/gabinete"
            className="flex flex-col items-center justify-center h-[76px] gap-1.5 bg-white rounded-2xl border border-black/[0.05] shadow-sm p-3 hover:shadow-md active:scale-[0.99] transition-all"
          >
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${IGV.primaryColor}18`, color: IGV.primaryColor }}
            >
              <Building2 size={18} strokeWidth={1.75} />
            </div>
            <p className="font-semibold text-gray-800 text-[0.75rem] leading-tight">Gabinetes</p>
          </Link>
          <ComingSoonCard label="Eventos"   icon={CalendarCheck} onClick={showComingSoon} />
        </div>

        <Link
          to="/igv/oracao"
          className="flex items-center justify-between w-full bg-white rounded-2xl p-4 border border-black/[0.05] shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ backgroundColor: `${IGV.primaryColor}18`, color: IGV.primaryColor }}
            >
              <Heart size={18} strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-[0.9rem]">Pedidos de Oração</p>
              <p className="text-gray-400 text-[0.75rem] mt-0.5">Compartilhe com nossa equipe pastoral</p>
            </div>
          </div>
          <ChevronRight size={16} strokeWidth={2} className="text-gray-300 shrink-0" />
        </Link>
      </main>

      <footer className="text-center px-4 py-5 text-[0.7rem] text-gray-400">
        {IGV.address}
      </footer>

      {/* ── Banner iOS fixo ── */}
      {showBanner && !bannerDismissed && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-black/[0.07] px-4 pt-3 pb-7 shadow-2xl">
          <div className="flex items-start gap-3">
            <div
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center mt-0.5"
              style={{ backgroundColor: `${IGV.primaryColor}18`, color: IGV.primaryColor }}
            >
              <SafariShareIcon size={18} />
            </div>
            <p className="text-[0.8rem] text-gray-700 flex-1 leading-snug">
              {isInApp
                ? 'Abra no Safari para instalar: toque em ··· → Abrir no Safari'
                : <>Instalar app: <strong>Compartilhar</strong> {' '}→{' '} <strong>Adicionar à Tela de Início</strong></>
              }
            </p>
            <button
              onClick={() => setBannerDismissed(true)}
              className="text-gray-400 text-[0.8rem] shrink-0 px-1"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-8 left-4 right-4 z-50 flex justify-center pointer-events-none">
          <div className="bg-gray-900/95 text-white text-[0.875rem] font-medium px-5 py-3 rounded-2xl shadow-2xl">
            {toast}
          </div>
        </div>
      )}

      {/* ── Modal iOS install — visual melhorado ── */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="bg-white w-full rounded-t-3xl px-6 pt-5 pb-10"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />

            {isInApp ? (
              /* ── Versão in-app browser ── */
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden="true">⚠️</span>
                  <p className="text-[1.05rem] font-bold text-gray-900">Navegador embutido</p>
                </div>
                <p className="text-[0.85rem] text-gray-600 leading-relaxed">
                  Você está no navegador do WhatsApp, Instagram ou similar.
                  Esses apps <strong>não têm</strong> a opção de instalar.
                </p>
                <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 space-y-2">
                  <p className="text-[0.8rem] font-semibold text-amber-800">Para instalar:</p>
                  <div className="flex items-start gap-2 text-[0.8rem] text-amber-700">
                    <span className="font-bold shrink-0">1.</span>
                    <span>Copie o link abaixo</span>
                  </div>
                  <div className="flex items-start gap-2 text-[0.8rem] text-amber-700">
                    <span className="font-bold shrink-0">2.</span>
                    <span>Abra o <strong>Safari</strong> e cole na barra de endereço</span>
                  </div>
                  <div className="flex items-start gap-2 text-[0.8rem] text-amber-700">
                    <span className="font-bold shrink-0">3.</span>
                    <span>Siga a instrução de instalação</span>
                  </div>
                </div>
                <button
                  onClick={() => void copyCurrentUrl()}
                  className="w-full h-12 rounded-2xl border-2 border-dashed flex items-center justify-center gap-2 text-[0.875rem] font-semibold transition-colors"
                  style={{
                    borderColor: linkCopied ? '#22c55e' : IGV.primaryColor,
                    color:       linkCopied ? '#22c55e' : IGV.primaryColor,
                  }}
                >
                  <Copy size={16} strokeWidth={2} />
                  {linkCopied ? 'Link copiado! ✓' : 'Copiar link'}
                </button>
                <button
                  onClick={() => setShowIOSModal(false)}
                  className="w-full h-11 rounded-2xl text-gray-500 text-[0.875rem] font-medium"
                >
                  Fechar
                </button>
              </div>
            ) : (
              /* ── Versão Safari normal ── */
              <div className="space-y-4">
                <p
                  className="text-[1.1rem] font-bold text-gray-900"
                  style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
                >
                  Adicionar à Tela Inicial
                </p>

                {/* Visual: ícone Compartilhar destacado + seta */}
                <div className="flex flex-col items-center py-3 gap-2">
                  <div
                    className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-md"
                    style={{ backgroundColor: IGV.primaryColor, color: '#fff' }}
                  >
                    <SafariShareIcon size={30} />
                  </div>
                  <p className="text-[0.72rem] text-gray-500 font-medium">
                    Botão <strong>Compartilhar</strong> na barra do Safari
                  </p>
                  {/* Seta bounce apontando para baixo (onde a barra do Safari fica) */}
                  <div className="text-2xl animate-bounce" style={{ color: IGV.primaryColor }} aria-hidden="true">
                    ↓
                  </div>
                  <p className="text-[0.68rem] text-gray-400">
                    (barra inferior do Safari)
                  </p>
                </div>

                {/* Passos */}
                <div className="space-y-3">
                  {[
                    'Toque em Compartilhar na barra inferior do Safari',
                    'Role a lista e toque em "Adicionar à Tela de Início"',
                    'Toque em "Adicionar" no canto superior direito',
                  ].map((txt, i) => (
                    <div key={i} className="flex items-start gap-3 text-[0.875rem] text-gray-700">
                      <span
                        className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[0.7rem] font-bold text-white"
                        style={{ backgroundColor: IGV.primaryColor }}
                      >
                        {i + 1}
                      </span>
                      <span className="leading-snug pt-0.5">{txt}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setShowIOSModal(false)}
                  className="w-full h-12 rounded-2xl text-white font-semibold text-[0.9rem] mt-2"
                  style={{ background: `linear-gradient(135deg, ${IGV.primaryColor}, ${IGV.secondaryColor})` }}
                >
                  Entendi!
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
