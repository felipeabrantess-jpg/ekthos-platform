/**
 * IgvAboutPage — /igv/sobre
 * Página pública "Sobre Nós" da IGV. Fase 0 PWA path-based.
 * Sem auth. Sem dados de membros. Conteúdo institucional hardcoded.
 * TODO Fase 1: migrar conteúdo para church_pastoral_profile + colunas semânticas.
 */

import { Link } from 'react-router-dom'
import { IGV }  from '@/lib/igv-public-data'

function IconArrowLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function IconWhatsApp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

// Agrupa horários por local para exibir multi-site claramente
function groupScheduleByLocal(horarios: typeof IGV.horarios) {
  const map: Record<string, { dia: string; hora: string }[]> = {}
  for (const h of horarios) {
    const locais = h.local.split(' e ')
    for (const local of locais) {
      const key = local.trim()
      if (!map[key]) map[key] = []
      map[key].push({ dia: h.dia, hora: h.hora })
    }
  }
  return map
}

export default function IgvAboutPage() {
  const primary    = IGV.primaryColor
  const scheduleByLocal = groupScheduleByLocal(IGV.horarios)

  return (
    <div className="min-h-screen bg-[#faf8f5] flex flex-col">

      {/* Topbar */}
      <header
        className="sticky top-0 z-10 flex items-center gap-2 px-4 h-14 border-b border-black/8 bg-white/90 backdrop-blur-sm"
      >
        <Link
          to="/igv"
          className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          style={{ color: primary }}
        >
          <IconArrowLeft />
          Voltar
        </Link>
        <span className="text-gray-300 mx-1">|</span>
        <span className="text-sm font-semibold text-gray-800 truncate">Sobre Nós</span>
      </header>

      <main className="flex-1 px-4 py-6 max-w-[480px] mx-auto w-full space-y-5 pb-12">

        {/* Nome + pastor */}
        <div className="text-center pt-2 pb-1">
          <h1
            className="text-2xl font-bold text-gray-900"
            style={{ fontFamily: '"Playfair Display", Georgia, serif', color: IGV.secondaryColor }}
          >
            {IGV.name}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{IGV.pastor}</p>
        </div>

        {/* Missão */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-black/5">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: primary }}
          >
            Nossa Missão
          </p>
          <p className="text-sm text-gray-800 leading-relaxed">{IGV.missao}</p>
        </section>

        {/* Visão */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-black/5">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-2"
            style={{ color: primary }}
          >
            Nossa Visão
          </p>
          <p className="text-sm text-gray-800 leading-relaxed">{IGV.visao}</p>
        </section>

        {/* Valores */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-black/5">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: primary }}
          >
            Nossos Valores
          </p>
          <ul className="space-y-2 mb-4">
            {IGV.valores.map((v) => (
              <li key={v} className="flex items-start gap-2 text-sm text-gray-800">
                <span
                  className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: primary }}
                />
                {v}
              </li>
            ))}
          </ul>
          <p
            className="text-xs italic text-gray-600 border-t border-gray-100 pt-3 leading-relaxed"
          >
            "{IGV.valoresFrase}"
          </p>
        </section>

        {/* Horários de culto — multi-site IGV (Itaipu + Trindade) */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-black/5">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: primary }}
          >
            Horários de Culto
          </p>
          <div className="space-y-4">
            {Object.entries(scheduleByLocal).map(([local, cultos]) => (
              <div key={local}>
                <p
                  className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5"
                >
                  📍 {local}
                </p>
                <div className="space-y-1 pl-1">
                  {cultos.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-800">
                      <span className="w-24 shrink-0 text-gray-500">{c.dia}</span>
                      <span
                        className="font-semibold"
                        style={{ color: IGV.secondaryColor }}
                      >
                        {c.hora}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Contato + endereço */}
        <section className="bg-white rounded-2xl p-5 shadow-sm border border-black/5">
          <p
            className="text-[11px] font-semibold uppercase tracking-widest mb-3"
            style={{ color: primary }}
          >
            Endereço e Contato
          </p>
          <p className="text-sm text-gray-800 mb-1">{IGV.address}</p>
          <p className="text-sm text-gray-500">{IGV.phone}</p>

          {/* Botão WhatsApp */}
          <a
            href={`https://wa.me/${IGV.whatsapp}?text=${encodeURIComponent('Olá! Gostaria de saber mais sobre a Igreja Gerando Vencedores.')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 h-11 px-5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80"
            style={{ backgroundColor: '#25D366' }}
          >
            <IconWhatsApp />
            Falar conosco
          </a>
        </section>

        {/* CTA seja membro */}
        <Link
          to="/igv/seja-membro"
          className="block w-full text-center h-12 rounded-2xl text-white text-sm font-semibold transition-opacity hover:opacity-90 active:opacity-80 flex items-center justify-center"
          style={{ background: `linear-gradient(90deg, ${primary} 0%, ${IGV.secondaryColor} 100%)` }}
        >
          Quero fazer parte — Seja Membro
        </Link>
      </main>
    </div>
  )
}
