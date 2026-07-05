/**
 * IgvCelulas — /igv/celulas  (pública, sem auth)
 * LGPD: zero SELECT em people. Lê grupos via EF igv-public-groups
 * (service_role, hardcoded IGV, só status=active).
 */

import { useState, useEffect } from 'react'
import { Link }                from 'react-router-dom'
import { ChevronLeft, Home }   from 'lucide-react'
import { IGV }                 from '@/lib/igv-public-data'

const EF_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/igv-public-groups`

// ── Tipos ───────────────────────────────────────────────────────────────────────

interface Grupo {
  id:           string
  name:         string
  meeting_day:  string | null
  meeting_time: string | null
  location:     string | null
  notes:        string | null
  status:       string
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

// Extrai o primeiro número de telefone brasileiro do campo notes (texto livre)
// Aceita: (21) 99985-0307 · (21) 96991-3688 · 21 96454-6449
function extractPhone(notes: string | null): string | null {
  if (!notes) return null
  const match = notes.match(/\(\d{2}\)\s*\d{4,5}[-\s]?\d{4}/)
  if (!match) return null
  return match[0].replace(/\D/g, '')
}

function buildWhatsAppUrl(rawPhone: string, groupName: string): string {
  const digits = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`
  const msg = `Olá! Vi a célula ${groupName} no app da IGV e gostaria de saber mais sobre como participar.`
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`
}

// ── Ícone WhatsApp ───────────────────────────────────────────────────────────────

function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

// ── Card de grupo ────────────────────────────────────────────────────────────────

function GrupoCard({ grupo }: { grupo: Grupo }) {
  const phone   = extractPhone(grupo.notes)
  const initial = grupo.name.charAt(0).toUpperCase()

  return (
    <div className="bg-[#111] rounded-2xl border border-white/10 p-4">
      {/* Cabeçalho: avatar inicial + nome + badge dia */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-bold text-lg"
          style={{
            backgroundColor: `${IGV.primaryColor}18`,
            color:           IGV.primaryColor,
            border:          `1.5px solid ${IGV.primaryColor}30`,
          }}
        >
          {initial}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-[1.02rem] leading-tight">{grupo.name}</p>
          <span
            className="inline-block text-[0.82rem] font-medium px-2 py-0.5 rounded-full mt-1"
            style={{ backgroundColor: `${IGV.primaryColor}15`, color: IGV.primaryColor }}
          >
            {grupo.meeting_day ?? 'A confirmar com o líder'}
          </span>
        </div>
      </div>

      {/* Endereço */}
      {grupo.location && (
        <p className="text-[0.92rem] text-white/70 mb-2 leading-snug flex gap-1.5 items-start">
          <span className="text-white/40 shrink-0 mt-0.5">📍</span>
          {grupo.location}
        </p>
      )}

      {/* Contato em texto livre (notes) */}
      {grupo.notes && (
        <p className="text-[0.88rem] text-white/60 mb-3 leading-snug">{grupo.notes}</p>
      )}

      {/* Botão WhatsApp (só aparece se extração de telefone tiver sucesso) */}
      {phone && (
        <a
          href={buildWhatsAppUrl(phone, grupo.name)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl text-[0.88rem] font-semibold border"
          style={{
            borderColor:     'rgba(34,197,94,0.25)',
            color:           '#4ade80',
            backgroundColor: 'rgba(34,197,94,0.1)',
          }}
        >
          <WhatsAppIcon size={15} />
          Entrar em contato
        </a>
      )}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────────

export default function IgvCelulas() {
  const [grupos,  setGrupos]  = useState<Grupo[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      setError(false)
      try {
        const res = await fetch(EF_URL)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const { groups } = await res.json() as { groups: Grupo[] }
        setGrupos(groups ?? [])
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  return (
    <div className="min-h-screen bg-black" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>

      {/* Header fixo */}
      <div
        className="sticky top-0 z-10 flex items-center gap-3 px-4 pt-safe-top pb-3 pt-3 border-b border-white/[0.06]"
        style={{ backgroundColor: '#000' }}
      >
        <Link
          to="/igv"
          className="w-8 h-8 rounded-xl flex items-center justify-center"
          style={{ backgroundColor: `${IGV.primaryColor}15`, color: IGV.primaryColor }}
        >
          <ChevronLeft size={18} strokeWidth={2} />
        </Link>
        <div>
          <p className="font-semibold text-white text-[1.02rem] leading-tight">Nossas Células</p>
          <p className="text-[0.82rem] text-white/50">Igreja Gerando Vencedores</p>
        </div>
      </div>

      <div className="px-4 pt-5 pb-8">

        {/* Intro */}
        <div className="mb-5">
          <p className="text-[1rem] text-white/70 leading-relaxed">
            Encontre a célula mais perto de você e conecte-se com a comunidade IGV na sua região.
          </p>
        </div>

        {/* Estados: loading / erro / vazio / lista */}
        {loading ? (
          <div className="flex justify-center py-16">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: `${IGV.primaryColor}40`, borderTopColor: IGV.primaryColor }}
            />
          </div>

        ) : error ? (
          <div className="text-center py-16 text-white/50">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: `${IGV.primaryColor}15` }}
            >
              <Home size={26} style={{ color: IGV.primaryColor }} strokeWidth={1.5} />
            </div>
            <p className="font-semibold text-white/70 mb-1">Não foi possível carregar</p>
            <p className="text-[1rem]">Verifique sua conexão e tente novamente.</p>
          </div>

        ) : grupos.length === 0 ? (
          <div className="text-center py-16 text-white/50">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: `${IGV.primaryColor}15` }}
            >
              <Home size={26} style={{ color: IGV.primaryColor }} strokeWidth={1.5} />
            </div>
            <p className="font-semibold text-white/70 mb-1">Nenhuma célula encontrada</p>
            <p className="text-[1rem]">Em breve novas informações!</p>
          </div>

        ) : (
          <>
            <p className="text-[0.82rem] text-white/50 mb-4">{grupos.length} células ativas</p>
            <div className="flex flex-col gap-2.5">
              {grupos.map(g => <GrupoCard key={g.id} grupo={g} />)}
            </div>
          </>
        )}

      </div>
    </div>
  )
}
