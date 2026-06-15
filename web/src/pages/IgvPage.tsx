/**
 * IgvPage — /igv
 * Landing pública da Igreja Gerando Vencedores. Fase 0 PWA path-based.
 * Sem auth. Sem dados de membros. Sem sidebar do CRM.
 */

import { Link } from 'react-router-dom'
import { IGV }  from '@/lib/igv-public-data'

// ── Ícones SVG inline (sem dependência de lucide no bundle público) ──

function IconUsers() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconInfo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

function IconChevronRight() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 shrink-0" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function IconWhatsApp() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function IconInstagram() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="url(#ig-grad)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <defs>
        <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f09433" />
          <stop offset="50%" stopColor="#e6683c" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  )
}

function IconYouTube() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#FF0000" aria-hidden="true">
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  )
}

// ── Componente principal ───────────────────────────────────────────

export default function IgvPage() {
  const primary = IGV.primaryColor

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col">

      {/* Header com brand IGV */}
      <header
        className="px-4 pt-12 pb-10 text-white text-center"
        style={{ background: `linear-gradient(160deg, ${primary} 0%, ${IGV.secondaryColor} 100%)` }}
      >
        <div
          className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4 text-3xl font-bold border-2 border-white/30"
          aria-hidden="true"
        >
          IGV
        </div>
        <h1
          className="text-2xl font-bold text-white"
          style={{ fontFamily: '"Playfair Display", Georgia, serif' }}
        >
          {IGV.name}
        </h1>
        <p className="text-amber-100 text-sm mt-1">{IGV.pastor}</p>
        <p className="text-white/60 text-xs mt-1">{IGV.address}</p>
      </header>

      {/* Conteúdo */}
      <main className="flex-1 px-4 py-6 max-w-[480px] mx-auto w-full">

        {/* CTAs principais */}
        <div className="space-y-3 mb-5">
          <Link
            to="/igv/seja-membro"
            className="flex items-center justify-between w-full bg-white rounded-2xl p-4 shadow-sm border border-black/5 hover:shadow-md active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${primary}18`, color: primary }}
              >
                <IconUsers />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Seja Membro</p>
                <p className="text-xs text-gray-500 mt-0.5">Faça parte da família IGV</p>
              </div>
            </div>
            <IconChevronRight />
          </Link>

          <Link
            to="/igv/sobre"
            className="flex items-center justify-between w-full bg-white rounded-2xl p-4 shadow-sm border border-black/5 hover:shadow-md active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${primary}18`, color: primary }}
              >
                <IconInfo />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">Sobre Nós</p>
                <p className="text-xs text-gray-500 mt-0.5">Missão, visão e horários</p>
              </div>
            </div>
            <IconChevronRight />
          </Link>
        </div>

        {/* Redes sociais */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-black/5">
          <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-3">
            Nos siga
          </p>
          <div className="flex flex-col gap-1">
            <a
              href={`https://wa.me/${IGV.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 h-11 px-2 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <IconWhatsApp />
              <span className="text-sm text-gray-700 font-medium">WhatsApp</span>
            </a>
            <a
              href={`https://instagram.com/${IGV.instagramHandle}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 h-11 px-2 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <IconInstagram />
              <span className="text-sm text-gray-700 font-medium">@{IGV.instagramHandle}</span>
            </a>
            <a
              href={IGV.youtubeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 h-11 px-2 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors"
            >
              <IconYouTube />
              <span className="text-sm text-gray-700 font-medium">YouTube</span>
            </a>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center px-4 py-5 text-xs text-gray-400 border-t border-gray-100">
        {IGV.address} · {IGV.phone}
      </footer>
    </div>
  )
}
