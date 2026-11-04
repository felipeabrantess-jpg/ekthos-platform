/**
 * IgvAboutPage — /igv/sobre  (Redesign v2)
 * Página pública "Sobre Nós" da IGV. DM Sans, ícones Phosphor, visual clean.
 * Sem auth. Sem dados de membros. Conteúdo institucional hardcoded.
 * TODO Fase 1: migrar para church_pastoral_profile + colunas semânticas.
 */

import { type ReactNode }                          from 'react'
import { Link }                                    from 'react-router-dom'
import { ArrowLeftIcon as ArrowLeft, ChatCircleIcon as MessageCircle } from '@phosphor-icons/react'
import { IGV }                                     from '@/lib/igv-public-data'

// ── Card auxiliar ──────────────────────────────────────────────────

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="bg-[#111] rounded-2xl p-5 border border-white/10">
      <p
        className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] mb-3"
        style={{ color: IGV.primaryColor }}
      >
        {label}
      </p>
      {children}
    </section>
  )
}

// ── Componente principal ───────────────────────────────────────────

export default function IgvAboutPage() {
  return (
    <div
      className="min-h-screen bg-black flex flex-col"
      style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
    >

      {/* Topbar */}
      <header className="sticky top-0 z-10 bg-black/90 backdrop-blur-sm border-b border-white/10 px-4 h-14 flex items-center gap-3">
        <Link
          to="/igv"
          className="flex items-center gap-1.5 text-[1rem] font-medium transition-colors"
          style={{ color: IGV.primaryColor }}
        >
          <ArrowLeft size={18} />
          Voltar
        </Link>
        <div className="w-px h-4 bg-white/20" />
        <span className="text-[1rem] font-semibold text-white truncate">Sobre Nós</span>
      </header>

      <main className="flex-1 px-4 py-5 max-w-[480px] mx-auto w-full space-y-4 pb-12">

        {/* Identidade */}
        <div className="text-center py-4">
          <h1
            className="text-[1.8rem] font-bold tracking-tight"
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              color: IGV.primaryColor,
            }}
          >
            {IGV.name}
          </h1>
          <p className="text-white/60 text-[1rem] mt-1">{IGV.pastor}</p>
        </div>

        {/* Missão */}
        <Card label="Nossa Missão">
          <p className="text-[1.02rem] text-white/90 leading-relaxed">{IGV.missao}</p>
        </Card>

        {/* Visão */}
        <Card label="Nossa Visão">
          <p className="text-[1.02rem] text-white/90 leading-relaxed">{IGV.visao}</p>
        </Card>

        {/* Valores */}
        <Card label="Nossos Valores">
          <ul className="space-y-2.5 mb-4">
            {IGV.valores.map(v => (
              <li key={v} className="flex items-start gap-2.5 text-[1rem] text-white/90">
                <span
                  className="mt-[0.4rem] w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: IGV.primaryColor }}
                />
                {v}
              </li>
            ))}
          </ul>
          <p className="text-[0.92rem] italic text-white/60 border-t border-white/10 pt-3 leading-relaxed">
            "{IGV.valoresFrase}"
          </p>
        </Card>

        {/* Endereço e Contato */}
        <Card label="Endereço e Contato">
          <p className="text-[1rem] text-white/90 mb-0.5"><span className="whitespace-pre-line">{IGV.address}</span></p>
          <p className="text-[1rem] text-white/70 mb-4">{IGV.phone}</p>
          <a
            href={`https://wa.me/${IGV.whatsapp}?text=${encodeURIComponent('Olá! Gostaria de saber mais sobre a Igreja Gerando Vencedores.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-white text-[1rem] font-semibold transition-opacity hover:opacity-90 active:opacity-80"
            style={{ backgroundColor: '#25D366' }}
          >
            <MessageCircle size={16} />
            Fale conosco
          </a>
        </Card>

        {/* CTA Seja Membro */}
        <Link
          to="/igv/seja-membro"
          className="flex items-center justify-center w-full h-12 rounded-2xl text-white text-[1.02rem] font-semibold transition-opacity hover:opacity-90 active:opacity-80"
          style={{
            background: `linear-gradient(135deg, ${IGV.primaryColor} 0%, ${IGV.secondaryColor} 100%)`,
          }}
        >
          Quero fazer parte — Seja Membro
        </Link>
      </main>
    </div>
  )
}
