/**
 * IgvAboutPage — /igv/sobre  (Redesign v2)
 * Página pública "Sobre Nós" da IGV. DM Sans, lucide thin icons, visual clean.
 * Sem auth. Sem dados de membros. Conteúdo institucional hardcoded.
 * TODO Fase 1: migrar para church_pastoral_profile + colunas semânticas.
 */

import { type ReactNode }                          from 'react'
import { Link }                                    from 'react-router-dom'
import { ArrowLeft, MapPin, MessageCircle }        from 'lucide-react'
import { IGV }                                     from '@/lib/igv-public-data'

// ── Helpers ────────────────────────────────────────────────────────

function groupScheduleByLocal(horarios: typeof IGV.horarios) {
  const map: Record<string, { dia: string; hora: string }[]> = {}
  for (const h of horarios) {
    for (const local of h.local.split(' e ').map(s => s.trim())) {
      if (!map[local]) map[local] = []
      map[local].push({ dia: h.dia, hora: h.hora })
    }
  }
  return map
}

// ── Card auxiliar ──────────────────────────────────────────────────

function Card({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="bg-white rounded-2xl p-5 border border-black/[0.05] shadow-sm">
      <p
        className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] mb-3"
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
  const scheduleByLocal = groupScheduleByLocal(IGV.horarios)

  return (
    <div
      className="min-h-screen bg-[#F9F7F4] flex flex-col"
      style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
    >

      {/* Topbar */}
      <header className="sticky top-0 z-10 bg-white/92 backdrop-blur-sm border-b border-black/[0.06] px-4 h-14 flex items-center gap-3">
        <Link
          to="/igv"
          className="flex items-center gap-1.5 text-[0.875rem] font-medium transition-colors"
          style={{ color: IGV.primaryColor }}
        >
          <ArrowLeft size={18} strokeWidth={1.75} />
          Voltar
        </Link>
        <div className="w-px h-4 bg-black/10" />
        <span className="text-[0.875rem] font-semibold text-gray-800 truncate">Sobre Nós</span>
      </header>

      <main className="flex-1 px-4 py-5 max-w-[480px] mx-auto w-full space-y-4 pb-12">

        {/* Identidade */}
        <div className="text-center py-4">
          <h1
            className="text-[1.6rem] font-bold tracking-tight"
            style={{
              fontFamily: '"Playfair Display", Georgia, serif',
              color: IGV.secondaryColor,
            }}
          >
            {IGV.name}
          </h1>
          <p className="text-gray-500 text-[0.875rem] mt-1">{IGV.pastor}</p>
        </div>

        {/* Missão */}
        <Card label="Nossa Missão">
          <p className="text-[0.9rem] text-gray-700 leading-relaxed">{IGV.missao}</p>
        </Card>

        {/* Visão */}
        <Card label="Nossa Visão">
          <p className="text-[0.9rem] text-gray-700 leading-relaxed">{IGV.visao}</p>
        </Card>

        {/* Valores */}
        <Card label="Nossos Valores">
          <ul className="space-y-2.5 mb-4">
            {IGV.valores.map(v => (
              <li key={v} className="flex items-start gap-2.5 text-[0.875rem] text-gray-700">
                <span
                  className="mt-[0.4rem] w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: IGV.primaryColor }}
                />
                {v}
              </li>
            ))}
          </ul>
          <p className="text-[0.8rem] italic text-gray-500 border-t border-gray-100 pt-3 leading-relaxed">
            "{IGV.valoresFrase}"
          </p>
        </Card>

        {/* Horários */}
        <Card label="Horários de Culto">
          <div className="space-y-5">
            {Object.entries(scheduleByLocal).map(([local, cultos]) => (
              <div key={local}>
                <div className="flex items-center gap-1.5 mb-2">
                  <MapPin size={13} strokeWidth={1.75} className="text-gray-400" />
                  <p className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">
                    {local}
                  </p>
                </div>
                <div className="space-y-2 pl-0.5">
                  {cultos.map((c, i) => (
                    <div key={i} className="flex items-center gap-3 text-[0.875rem]">
                      <span className="w-28 text-gray-500 shrink-0">{c.dia}</span>
                      <span className="font-semibold" style={{ color: IGV.secondaryColor }}>
                        {c.hora}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Endereço e Contato */}
        <Card label="Endereço e Contato">
          <p className="text-[0.875rem] text-gray-700 mb-0.5">{IGV.address}</p>
          <p className="text-[0.875rem] text-gray-500 mb-4">{IGV.phone}</p>
          <a
            href={`https://wa.me/${IGV.whatsapp}?text=${encodeURIComponent('Olá! Gostaria de saber mais sobre a Igreja Gerando Vencedores.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-white text-[0.875rem] font-semibold transition-opacity hover:opacity-90 active:opacity-80"
            style={{ backgroundColor: '#25D366' }}
          >
            <MessageCircle size={16} strokeWidth={1.75} />
            Falar conosco
          </a>
        </Card>

        {/* CTA Seja Membro */}
        <Link
          to="/igv/seja-membro"
          className="flex items-center justify-center w-full h-12 rounded-2xl text-white text-[0.9rem] font-semibold transition-opacity hover:opacity-90 active:opacity-80"
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
