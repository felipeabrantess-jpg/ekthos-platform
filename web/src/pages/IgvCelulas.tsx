/**
 * IgvCelulas — /igv/celulas  (pública, sem auth)
 * LGPD: zero SELECT em people. Lê grupos via EF igv-public-groups
 * (service_role, hardcoded IGV, só status=active).
 */

import { useState, useEffect } from 'react'
import { CircleNotchIcon, MapPinIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { GlassButton, GlassCard, IconTile, type AnyIcon, IgvContent, IgvNotice, IgvPageShell, PageHeader, IGV_TEXT } from '@/components/igv'
import { CellGgvIcon, CommunityIcon } from '@/components/igv/icons'
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
  'argeu / fazendinha': 'Argeu / Fazendinha – Niterói',
  'argeu':              'Argeu / Fazendinha – Niterói',
  'fazendinha':         'Argeu / Fazendinha – Niterói',
  'são francisco':      'São Francisco – Niterói',
  'barroco':            'Barroco – Itaipuaçu',
  'serra grande':       'Serra Grande – Niterói',
  'engenho do mato':    'Engenho do Mato – Niterói',
  'camboinhas':         'Camboinhas – Niterói',
  'boa vista itaipu':   'Boa Vista – Niterói',
  'itaipu':             'Itaipu – Niterói',
}

// Mostra só o bairro: a rua e o número costumam ser a casa de um membro
function extractBairro(location: string | null): string | null {
  if (!location) return null
  if (/s[ãa]o f[áa]bio/i.test(location)) return BAIRRO_REGIAO['itaipu']
  const tail = location.match(/\s[-–]\s*([^-–]+)$/)?.[1] ?? location.match(/,\s*([A-ZÀ-Ú ]{3,})$/)?.[1]
  if (!tail) return null
  const bairro = tail.trim()
  const regiao = BAIRRO_REGIAO[bairro.toLowerCase()]
  if (regiao) return regiao
  if (bairro !== bairro.toUpperCase()) return bairro
  return bairro.toLowerCase().split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** Normaliza a região vinda da API (que pode estar numa versão anterior) para "bairro – município". */
function normalizarRegiao(regiao: string): string {
  const bairro = regiao.split(/\s[–-]\s/)[0].trim().toLowerCase()
  return BAIRRO_REGIAO[bairro] ?? regiao
}

const WHATSAPP_CELULAS = `https://wa.me/${IGV.whatsapp}?text=${encodeURIComponent('Olá! Vi as células no app da IGV e gostaria de saber mais sobre como participar.')}`

/** Ícone de cada célula: hoje todas usam o GGV; no futuro pode vir da própria célula. */
function iconeDaCelula(_grupo: Grupo): AnyIcon {
  return CellGgvIcon
}

// ── Card de grupo ────────────────────────────────────────────────────────────────

function GrupoCard({ grupo }: { grupo: Grupo }) {
  const bruto = grupo.regiao ?? extractBairro(grupo.location ?? null)
  const bairro = bruto ? normalizarRegiao(bruto) : null

  return (
    <GlassCard>
      <div className="flex items-center gap-4 mb-3">
        <IconTile Icon={iconeDaCelula(grupo)} />
        <div className="flex-1 min-w-0">
          <p className={IGV_TEXT.item}>{grupo.name}</p>
          <p className={`mt-0.5 ${IGV_TEXT.muted}`}>{grupo.meeting_day ?? 'Dia a confirmar'}</p>
        </div>
      </div>

      <p className={`flex items-start gap-2 ${IGV_TEXT.muted}`}>
        <MapPinIcon size={ICON_SIZE.button} className="shrink-0" aria-hidden="true" />
        {bairro ?? 'Bairro a confirmar com a secretaria'}
      </p>

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
        setGrupos([...(groups ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })))
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
      <PageHeader title="Nossas Células GGV" subtitle="Grupo Gerando Vencedores" />

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
            {/* Espaço para a barra "Mais informações" não cobrir o último cartão */}
            <div aria-hidden="true" className="h-24 shrink-0" />
          </>
        )}
      </IgvContent>

      {/* Barra fixa acima da navegação */}
      <div
        className="igv-glass fixed z-30 inset-x-3 max-w-[456px] mx-auto rounded-[20px] p-3 pl-5 flex items-center gap-3"
        style={{ bottom: 'calc(var(--igv-nav-space) - 24px)' }}
      >
        <p className={`flex-1 min-w-0 ${IGV_TEXT.item}`}>Quer participar de uma célula?</p>
        <GlassButton href={WHATSAPP_CELULAS} variant="accent">Mais informações</GlassButton>
      </div>
    </IgvPageShell>
  )
}
