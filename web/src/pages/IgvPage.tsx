/**
 * IgvPage — /igv  (Redesign v2)
 * PWA público da Igreja Gerando Vencedores.
 * Hero com foto da fachada, DM Sans, logos oficiais de redes sociais, banner iOS PWA.
 * LGPD R8: zero SELECT em people. INSERT only via visitor-capture EF.
 */

import { useState, useEffect } from 'react'
import { Link }                from 'react-router-dom'
import { ChevronRight, Users, BookOpen } from 'lucide-react'
import { IGV } from '@/lib/igv-public-data'

// ── Logos oficiais de redes sociais ────────────────────────────────

function WhatsAppLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function InstagramLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="ig-grad-main" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#f09433" />
          <stop offset="25%"  stopColor="#e6683c" />
          <stop offset="50%"  stopColor="#dc2743" />
          <stop offset="75%"  stopColor="#cc2366" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <path fill="url(#ig-grad-main)" d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
    </svg>
  )
}

function YouTubeLogo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="#FF0000" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  )
}

// ── Logo placeholder elegante ───────────────────────────────────────

function LogoPlaceholder() {
  return (
    <div
      className="w-[76px] h-[76px] rounded-2xl border-2 border-white/50 bg-white/10 backdrop-blur-md flex items-center justify-center shadow-xl"
      title="Logo da igreja — em breve"
      aria-hidden="true"
    >
      <span
        className="text-white/90 text-[2rem] font-bold select-none leading-none"
        style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
      >
        G
      </span>
    </div>
  )
}

// ── Hook: detecta iOS Safari para banner de instalação ─────────────

function useIOSInstallBanner() {
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const isIOS = /iPad|iPhone|iPod/.test(ua)
    const isWebKit = /WebKit/.test(ua) && !/CriOS|FxiOS|OPiOS/.test(ua)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    if (isIOS && isWebKit && !isStandalone) setVisible(true)
  }, [])

  return { visible: visible && !dismissed, dismiss: () => setDismissed(true) }
}

// ── Componente principal ───────────────────────────────────────────

export default function IgvPage() {
  const { visible: showBanner, dismiss } = useIOSInstallBanner()

  return (
    <div
      className="min-h-screen bg-[#F9F7F4] flex flex-col"
      style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
    >

      {/* ── Hero: foto da fachada ── */}
      <section
        className="relative flex flex-col justify-end overflow-hidden"
        style={{
          minHeight: '68vh',
          backgroundImage: `url(${IGV.coverUrl})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 25%',
        }}
      >
        {/* Overlay gradiente — leve no topo, pesado na base para legibilidade */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.20) 50%, rgba(0,0,0,0.82) 100%)',
          }}
        />

        {/* Conteúdo sobreposto */}
        <div className="relative z-10 px-5 pb-8 max-w-[480px]">
          <LogoPlaceholder />
          <h1
            className="mt-4 text-[1.85rem] font-bold text-white leading-tight tracking-tight"
            style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
          >
            {IGV.name}
          </h1>
          <p className="mt-1 text-white/75 text-[0.875rem] font-medium">{IGV.pastor}</p>
          <p className="mt-0.5 text-white/50 text-[0.75rem]">{IGV.address}</p>
        </div>
      </section>

      {/* ── Body ── */}
      <main className="flex-1 px-4 py-5 max-w-[480px] mx-auto w-full">

        {/* CTA principal — Seja Membro */}
        <Link
          to="/igv/seja-membro"
          className="flex items-center justify-between w-full rounded-2xl p-4 mb-3 active:scale-[0.99] transition-all"
          style={{
            background: `linear-gradient(135deg, ${IGV.primaryColor} 0%, ${IGV.secondaryColor} 100%)`,
          }}
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

        {/* Sobre Nós */}
        <Link
          to="/igv/sobre"
          className="flex items-center justify-between w-full bg-white rounded-2xl p-4 mb-5 border border-black/[0.05] shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
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

        {/* Redes sociais */}
        <div className="bg-white rounded-2xl border border-black/[0.05] overflow-hidden shadow-sm">
          <div className="px-5 pt-4 pb-2">
            <p
              className="text-[0.65rem] font-semibold uppercase tracking-[0.14em]"
              style={{ color: IGV.primaryColor }}
            >
              Nos encontre
            </p>
          </div>
          <div className="divide-y divide-black/[0.04]">
            <a
              href={`https://wa.me/${IGV.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/80 active:bg-gray-100/60 transition-colors"
            >
              <WhatsAppLogo />
              <span className="text-[0.875rem] text-gray-700 font-medium">WhatsApp</span>
            </a>
            <a
              href={`https://instagram.com/${IGV.instagramHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/80 active:bg-gray-100/60 transition-colors"
            >
              <InstagramLogo />
              <span className="text-[0.875rem] text-gray-700 font-medium">@{IGV.instagramHandle}</span>
            </a>
            <a
              href={IGV.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50/80 active:bg-gray-100/60 transition-colors"
            >
              <YouTubeLogo />
              <span className="text-[0.875rem] text-gray-700 font-medium">YouTube</span>
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center px-4 py-5 text-[0.7rem] text-gray-400">
        {IGV.address}
      </footer>

      {/* ── Banner iOS: dica de instalação como PWA ── */}
      {showBanner && (
        <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-black/[0.07] px-4 pt-3 pb-7 flex items-start gap-3 shadow-2xl">
          <span className="text-xl mt-0.5 shrink-0" aria-hidden="true">📲</span>
          <p className="text-[0.8rem] text-gray-700 flex-1 leading-snug">
            Adicione à tela inicial: toque em{' '}
            <span className="font-semibold">Compartilhar</span>
            {' '}→{' '}
            <span className="font-semibold">Adicionar à Tela de Início</span>
          </p>
          <button
            onClick={dismiss}
            className="text-gray-400 text-[0.8rem] font-medium shrink-0 px-1 py-0.5"
            aria-label="Fechar dica de instalação"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}
