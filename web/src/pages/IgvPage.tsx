/**
 * IgvPage — /igv  (v4 iOS UX)
 * v3: foto inteira, 11 botões, install Android.
 * v4: logo oficial hero, meta tags Apple, modal iOS visual (SVG Compartilhar +
 *     seta + detecção in-app browser), fix apple-touch-icon.
 * LGPD R8: zero SELECT em people. INSERT only via visitor-capture EF.
 */

import { useState, useEffect, useRef }          from 'react'
import { Link }                                  from 'react-router-dom'
import { GlobeIcon, ShareNetworkIcon as Share2, DeviceMobileIcon as Smartphone, CopyIcon as Copy } from '@phosphor-icons/react'
import { IGV } from '@/lib/igv-public-data'
import { CalendarCrossIcon, CommunityIcon, OpenBookIcon, OpenHandsIcon, PastorIcon, PrayerHandsIcon } from '@/components/igv/icons'
import { GlassButton, GlassCard, GlassIconButton, GlassLinkCard, IconTile, IgvContent, IgvPageShell, SectionTitle, IGV_FOCUS, IGV_TEXT } from '@/components/igv'
import { XIcon as X, WarningCircleIcon as AlertCircle, CheckIcon as Check, ArrowDownIcon as ArrowDown } from '@phosphor-icons/react'
import { ICON_SIZE } from '@/lib/icon-tokens'

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

function SpotifyLogo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#1DB954" aria-hidden="true">
      <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
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

// ── Estilo da tela inicial (cores derivadas da logo IGV) ─────────────


function saudacao(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  return h < 18 ? 'Boa tarde' : 'Boa noite'
}

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
      className={`igv-glass ${IGV_FOCUS} flex items-center gap-3 w-full min-h-[64px] px-4 rounded-[20px] active:scale-[0.99] transition-transform`}
    >
      <span className="w-7 h-7 flex items-center justify-center shrink-0">{children}</span>
      <span className={`${IGV_TEXT.item} text-left min-w-0 break-words`}>{label}</span>
    </button>
  )
}

const ITENS = [
  { to: '/igv/agenda',      titulo: 'Agenda',            sub: 'Cultos e próximos eventos',             Icone: CalendarCrossIcon },
  { to: '/igv/oracao',      titulo: 'Pedidos de Oração', sub: 'Compartilhe com nossa equipe pastoral', Icone: PrayerHandsIcon },
  { to: '/igv/gabinete',    titulo: 'Gabinete Pastoral', sub: 'Contato com os líderes da IGV',         Icone: PastorIcon },
  { to: '/igv/celulas',     titulo: 'Nossas Células',    sub: 'Encontre a mais perto de você',         Icone: CommunityIcon },
  { to: '/igv/cursos',      titulo: 'Cursos',            sub: 'Formações com inscrição',               Icone: OpenBookIcon },
  { to: '/igv/empresarios', titulo: 'Rede de Negócios',  sub: 'Empresários da congregação',            Icone: OpenHandsIcon },
]

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

  function openLink(url: string) {
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  async function handleShare() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: IGV.name,
          text:  'Conheça a Igreja Gerando Vencedores: Itaipu (Niterói) e Trindade (São Gonçalo).',
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
    <IgvPageShell>

      {/* ── Topo: fachada suave, desbotando até o fundo ── */}
      <header className="relative w-full overflow-hidden">
        <img
          src={IGV.coverUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-x-0 top-0 w-full h-[300px] object-cover object-[center_72%] opacity-40"
          loading="eager"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[300px] bg-gradient-to-b from-transparent via-[var(--igv-bg)] via-80% to-[var(--igv-bg)]"
        />
        <div className="relative px-5 pt-14 pb-6">
          <img
            src={IGV.logoUrl}
            alt="Logo Igreja Gerando Vencedores"
            className="w-[72px] h-[72px] rounded-2xl object-cover shadow-md"
          />
          <h1 className={`mt-5 ${IGV_TEXT.display}`}>{saudacao()}</h1>
          <p className={`mt-2 ${IGV_TEXT.item}`}>{IGV.name}</p>
          <p className={`mt-0.5 ${IGV_TEXT.muted}`}>{IGV.pastor}</p>

          {showInstallButton && (
            <GlassButton
              onClick={handleInstallClick}
              Icon={Smartphone}
              className="mt-4"
              ariaLabel={canInstall ? 'Instalar app no dispositivo' : 'Ver instruções para instalar no iOS'}
            >
              Instalar App
            </GlassButton>
          )}
        </div>
      </header>

      <IgvContent>

        {/* Versículo em destaque */}
        <Link to="/igv/biblia" className={`${IGV_FOCUS} igv-rise block rounded-[20px] bg-[var(--igv-dark)] text-white p-5`}>
          <p className={IGV_TEXT.onDarkLabel}>Palavra para hoje</p>
          <p className={`igv-rise igv-rise--1 mt-1 ${IGV_TEXT.onDarkItem}`}>Salmos 23:1</p>
          <p className={`igv-rise igv-rise--2 mt-4 igv-serif ${IGV_TEXT.onDarkHeading}`}>
            O Senhor é o meu pastor; nada me faltará.
          </p>
          <span className="igv-glass igv-glass--on-dark igv-rise igv-rise--3 mt-5 inline-flex items-center min-h-[48px] px-5 rounded-full text-[1rem] font-medium">
            Abrir a Bíblia
          </span>
        </Link>

        {/* Seja Membro: único botão principal na cor da IGV */}
        <GlassCard className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h2 className={IGV_TEXT.heading}>Seja Membro</h2>
            <p className={`mt-1 ${IGV_TEXT.muted}`}>Faça parte da família IGV</p>
            <GlassButton to="/igv/seja-membro" variant="accent" className="mt-3">
              Quero fazer parte
            </GlassButton>
          </div>
          <img src={IGV.logoUrl} alt="" aria-hidden="true" className="w-[88px] h-[88px] rounded-2xl object-cover shrink-0" />
        </GlassCard>

        <GlassLinkCard to="/igv/sobre" title="Sobre Nós" subtitle="Missão, visão e valores" image={IGV.coverUrl} />

        <SectionTitle>Mais para você</SectionTitle>

        {ITENS.map(({ to, titulo, sub, Icone }) => (
          <GlassLinkCard key={to} to={to} title={titulo} subtitle={sub} Icon={Icone} />
        ))}

        <SectionTitle>Conecte-se com a IGV</SectionTitle>

        <div className="grid grid-cols-2 gap-3">
          <ActionCard label="WhatsApp" onClick={() => openLink(`https://wa.me/${IGV.whatsapp}`)}>
            <WhatsAppLogo size={ICON_SIZE.list} />
          </ActionCard>
          <ActionCard label="Instagram" onClick={() => openLink(`https://instagram.com/${IGV.instagramHandle}`)}>
            <InstagramLogo size={ICON_SIZE.list} />
          </ActionCard>
          <ActionCard label="YouTube" onClick={() => openLink(IGV.youtubeUrl)}>
            <YouTubeLogo size={ICON_SIZE.list} />
          </ActionCard>
          <ActionCard label="Spotify" onClick={() => openLink(IGV.spotifyUrl)}>
            <SpotifyLogo size={ICON_SIZE.list} />
          </ActionCard>
          <ActionCard label="Site da igreja" onClick={() => openLink('https://gerandovencedores.org/')}>
            <GlobeIcon size={ICON_SIZE.list} className="text-[var(--igv-ink)]" aria-hidden="true" />
          </ActionCard>
          <div className="grid">
            <ActionCard label="Compartilhar" onClick={handleShare}>
              <Share2 size={ICON_SIZE.list} className="text-[var(--igv-ink)]" aria-hidden="true" />
            </ActionCard>
          </div>
        </div>

        <footer className={`mt-5 px-1 ${IGV_TEXT.muted}`}>
          <span className="whitespace-pre-line">{IGV.address}</span>
        </footer>
      </IgvContent>

      {/* ── Banner iOS, acima da barra de navegação ── */}
      {showBanner && !bannerDismissed && (
        <GlassCard className="fixed z-50 inset-x-3 max-w-[456px] mx-auto bottom-[calc(92px+env(safe-area-inset-bottom))] flex items-start gap-3">
          <span className="w-12 h-12 rounded-2xl bg-[var(--igv-tint)] text-[var(--igv-ink)] flex items-center justify-center shrink-0">
            <SafariShareIcon size={ICON_SIZE.list} />
          </span>
          <p className={`flex-1 min-w-0 ${IGV_TEXT.body}`}>
            {isInApp
              ? 'Abra no Safari para instalar: toque em ··· → Abrir no Safari'
              : <>Instalar app: <strong>Compartilhar</strong> {' '}→{' '} <strong>Adicionar à Tela de Início</strong></>
            }
          </p>
          <GlassIconButton Icon={X} label="Fechar" onClick={() => setBannerDismissed(true)} />
        </GlassCard>
      )}

      {/* ── Toast ── */}
      {toast && (
        <div className="fixed bottom-28 left-4 right-4 z-50 flex justify-center pointer-events-none">
          <GlassCard className={`py-3 font-medium ${IGV_TEXT.body}`}>
            {toast}
          </GlassCard>
        </div>
      )}

      {/* ── Modal de instalação no iOS ── */}
      {showIOSModal && (
        <div
          className="fixed inset-0 z-50 bg-[color:color-mix(in_srgb,var(--igv-ink)_50%,transparent)] flex items-end"
          onClick={() => setShowIOSModal(false)}
        >
          <div
            className="bg-[var(--igv-bg)] w-full max-w-[480px] mx-auto rounded-t-3xl px-5 pt-4 pb-[calc(24px+env(safe-area-inset-bottom))]"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 bg-[var(--igv-line)] rounded-full mx-auto mb-4" />

            {isInApp ? (
              /* ── Versão in-app browser ── */
              <div className="flex flex-col gap-4">
                <div className="flex items-center gap-3">
                  <IconTile Icon={AlertCircle} />
                  <p className={IGV_TEXT.heading}>Navegador embutido</p>
                </div>
                <p className={IGV_TEXT.body}>
                  Você está no navegador do WhatsApp, Instagram ou similar.
                  Esses apps <strong>não têm</strong> a opção de instalar.
                </p>
                <GlassCard className="flex flex-col gap-2">
                  <p className={`font-semibold ${IGV_TEXT.body}`}>Para instalar:</p>
                  <div className={`flex items-start gap-2 ${IGV_TEXT.body}`}>
                    <span className="font-bold shrink-0">1.</span>
                    <span>Copie o link abaixo</span>
                  </div>
                  <div className={`flex items-start gap-2 ${IGV_TEXT.body}`}>
                    <span className="font-bold shrink-0">2.</span>
                    <span>Abra o <strong>Safari</strong> e cole na barra de endereço</span>
                  </div>
                  <div className={`flex items-start gap-2 ${IGV_TEXT.body}`}>
                    <span className="font-bold shrink-0">3.</span>
                    <span>Siga a instrução de instalação</span>
                  </div>
                </GlassCard>
                <GlassButton onClick={() => void copyCurrentUrl()} Icon={linkCopied ? Check : Copy} fullWidth>
                  {linkCopied ? 'Link copiado!' : 'Copiar link'}
                </GlassButton>
                <GlassButton onClick={() => setShowIOSModal(false)} fullWidth>
                  Fechar
                </GlassButton>
              </div>
            ) : (
              /* ── Versão Safari normal ── */
              <div className="flex flex-col gap-4">
                <p className={IGV_TEXT.heading}>
                  Adicionar à Tela Inicial
                </p>

                {/* Visual: ícone Compartilhar destacado + seta */}
                <div className="flex flex-col items-center py-3 gap-2 text-center">
                  <span className="w-14 h-14 rounded-2xl bg-[var(--igv-tint)] text-[var(--igv-ink)] flex items-center justify-center">
                    <SafariShareIcon size={ICON_SIZE.list} />
                  </span>
                  <p className={IGV_TEXT.muted}>
                    Botão <strong>Compartilhar</strong> na barra do Safari
                  </p>
                  {/* Seta bounce apontando para baixo (onde a barra do Safari fica) */}
                  <ArrowDown size={ICON_SIZE.list} className="animate-bounce text-[var(--igv-accent)]" aria-hidden="true" />
                  <p className={IGV_TEXT.muted}>
                    (barra inferior do Safari)
                  </p>
                </div>

                {/* Passos */}
                <div className="flex flex-col gap-3">
                  {[
                    'Toque em Compartilhar na barra inferior do Safari',
                    'Role a lista e toque em "Adicionar à Tela de Início"',
                    'Toque em "Adicionar" no canto superior direito',
                  ].map((txt, i) => (
                    <div key={i} className={`flex items-start gap-3 ${IGV_TEXT.body}`}>
                      <span className="shrink-0 w-8 h-8 rounded-full bg-[var(--igv-tint)] flex items-center justify-center font-bold">
                        {i + 1}
                      </span>
                      <span className="pt-0.5">{txt}</span>
                    </div>
                  ))}
                </div>

                <GlassButton onClick={() => setShowIOSModal(false)} fullWidth className="mt-2">
                  Entendi!
                </GlassButton>
              </div>
            )}
          </div>
        </div>
      )}
    </IgvPageShell>
  )
}
