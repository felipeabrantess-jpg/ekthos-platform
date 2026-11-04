/**
 * IgvCelulas — /igv/celulas  (pública, sem auth)
 * LGPD: zero SELECT em people. Lê grupos via EF igv-public-groups
 * (service_role, hardcoded IGV, só status=active).
 */

import { useState, useEffect } from 'react'
import { CircleNotchIcon, MapPinIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { GlassButton, GlassCard, IconTile, IgvContent, IgvNotice, IgvPageShell, PageHeader, IGV_TEXT } from '@/components/igv'
import { CommunityIcon } from '@/components/igv/icons'
import { ICON_SIZE } from '@/lib/icon-tokens'
import { IGV }                 from '@/lib/igv-public-data'

const EF_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/igv-public-groups`

// ── Tipos ───────────────────────────────────────────────────────────────────────

interface Grupo {
  id:           string
  name:         string
  meeting_day:  string | null
  meeting_time: string | null
  regiao?:      string | null
  location?:    string | null
  status:       string
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

// Bairro → como a igreja identifica a região (definido pelo proprietário)
const BAIRRO_REGIAO: Record<string, string> = {
  'recanto':            'Recanto – Itaipuaçu',
  'argeu / fazendinha': 'Argeu / Fazendinha – Piratininga',
  'são francisco':      'São Francisco – Niterói',
  'barroco':            'Barroco – Itaipuaçu',
  'serra grande':       'Serra Grande – Itaipu',
  'engenho do mato':    'Engenho do Mato – Itaipu',
  'camboinhas':         'Camboinhas – Niterói',
}

// Mostra só o bairro: a rua e o número costumam ser a casa de um membro
function extractBairro(location: string | null): string | null {
  if (!location) return null
  if (/s[ãa]o f[áa]bio/i.test(location)) return 'Itaipu'
  const tail = location.match(/\s[-–]\s*([^-–]+)$/)?.[1] ?? location.match(/,\s*([A-ZÀ-Ú ]{3,})$/)?.[1]
  if (!tail) return null
  const bairro = tail.trim()
  const regiao = BAIRRO_REGIAO[bairro.toLowerCase()]
  if (regiao) return regiao
  if (bairro !== bairro.toUpperCase()) return bairro
  return bairro.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function buildWhatsAppUrl(groupName: string): string {
  const msg = `Olá! Vi a célula ${groupName} no app da IGV e gostaria de saber mais sobre como participar.`
  return `https://wa.me/${IGV.whatsapp}?text=${encodeURIComponent(msg)}`
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
  const bairro = grupo.regiao ?? extractBairro(grupo.location ?? null)
  const initial = grupo.name.charAt(0).toUpperCase()

  return (
    <GlassCard>
      <div className="flex items-center gap-4 mb-3">
        <span className={`igv-glass igv-glass--tile igv-serif w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${IGV_TEXT.heading}`} aria-hidden="true">
          {initial}
        </span>
        <div className="flex-1 min-w-0">
          <p className={IGV_TEXT.item}>{grupo.name}</p>
          <p className={`mt-0.5 ${IGV_TEXT.muted}`}>{grupo.meeting_day ?? 'Dia a confirmar'}</p>
        </div>
      </div>

      <p className={`flex items-start gap-2 mb-4 ${IGV_TEXT.muted}`}>
        <MapPinIcon size={ICON_SIZE.button} className="shrink-0" aria-hidden="true" />
        {bairro ?? 'Bairro a confirmar com a secretaria'}
      </p>

      <GlassButton href={buildWhatsAppUrl(grupo.name)} fullWidth>
        <WhatsAppIcon size={ICON_SIZE.button} />
        Falar com a secretaria
      </GlassButton>
    </GlassCard>
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
    <IgvPageShell>
      <PageHeader title="Nossas Células" subtitle="Igreja Gerando Vencedores" />

      <IgvContent>
        <GlassCard className="flex items-center gap-4">
          <IconTile Icon={CommunityIcon} />
          <p className={`min-w-0 ${IGV_TEXT.body}`}>
            Encontre a célula mais perto de você e conecte-se com a comunidade IGV na sua região.
          </p>
        </GlassCard>

        {/* Estados: loading / erro / vazio / lista */}
        {loading ? (
          <GlassCard className="flex justify-center py-10">
            <CircleNotchIcon size={ICON_SIZE.tile} className="animate-spin text-[var(--igv-accent)]" role="status" aria-label="Carregando" />
          </GlassCard>

        ) : error ? (
          <IgvNotice Icon={WarningCircleIcon} title="Não foi possível carregar" tone="error">
            Verifique sua conexão e tente novamente.
          </IgvNotice>

        ) : grupos.length === 0 ? (
          <IgvNotice Icon={CommunityIcon} title="Nenhuma célula encontrada">
            Em breve novas informações!
          </IgvNotice>

        ) : (
          <>
            <p className={`mt-2 px-1 ${IGV_TEXT.muted}`}>{grupos.length} células ativas</p>
            {grupos.map(g => <GrupoCard key={g.id} grupo={g} />)}
          </>
        )}
      </IgvContent>
    </IgvPageShell>
  )
}
