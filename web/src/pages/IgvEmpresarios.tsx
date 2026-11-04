import { useState, useEffect }   from 'react'
import { CircleNotchIcon, EnvelopeSimpleIcon, GlobeIcon, PlusIcon } from '@phosphor-icons/react'
import { GlassButton, GlassCard, GlassChip, IconTile, IgvContent, IgvNotice, IgvPageShell, PageHeader, IGV_TEXT } from '@/components/igv'
import { BusinessCrossIcon } from '@/components/igv/icons'
import { ICON_SIZE } from '@/lib/icon-tokens'
import { supabase }               from '@/lib/supabase'
import { IGV }                    from '@/lib/igv-public-data'

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface Empresario {
  id:        string
  nome:      string
  categoria: string
  descricao: string | null
  telefone:  string | null
  instagram: string | null
  site:      string | null
  email:     string | null
  foto_url:  string | null
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

function buildWhatsAppUrl(phone: string): string {
  const digits = sanitizePhone(phone)
  const withCountry = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${withCountry}?text=${encodeURIComponent('Olá! Vi sua empresa na Rede de Negócios da IGV e gostaria de saber mais.')}`
}

// ── Logos sociais ──────────────────────────────────────────────────────────────

function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#25D366" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

function InstagramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <linearGradient id="igGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%"   stopColor="#f09433" />
          <stop offset="25%"  stopColor="#e6683c" />
          <stop offset="50%"  stopColor="#dc2743" />
          <stop offset="75%"  stopColor="#cc2366" />
          <stop offset="100%" stopColor="#bc1888" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill="url(#igGrad)" />
      <circle cx="12" cy="12" r="4.5" fill="none" stroke="#fff" strokeWidth="1.6" />
      <circle cx="17.5" cy="6.5" r="1.2" fill="#fff" />
    </svg>
  )
}

// ── Placeholder inicial ───────────────────────────────────────────────────────

function InitialAvatar({ name }: { name: string }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <span className={`igv-glass igv-glass--tile igv-serif w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${IGV_TEXT.heading}`} aria-hidden="true">
      {initial}
    </span>
  )
}

// ── Card de empresário ────────────────────────────────────────────────────────

function EmpresarioCard({ item }: { item: Empresario }) {
  return (
    <GlassCard>
      <div className="flex items-center gap-4 mb-3">
        {item.foto_url ? (
          <img
            src={item.foto_url}
            alt={item.nome}
            className="w-14 h-14 rounded-2xl object-cover shrink-0"
          />
        ) : (
          <InitialAvatar name={item.nome} />
        )}

        <div className="flex-1 min-w-0">
          <p className={IGV_TEXT.item}>{item.nome}</p>
          <p className={`mt-0.5 ${IGV_TEXT.muted}`}>{item.categoria}</p>
        </div>
      </div>

      {item.descricao && (
        <p className={`mb-4 ${IGV_TEXT.body}`}>{item.descricao}</p>
      )}

      {/* Botões de contato */}
      <div className="flex flex-wrap gap-2">
        {item.telefone && (
          <GlassButton href={buildWhatsAppUrl(item.telefone)} className="!px-4">
            <WhatsAppIcon size={ICON_SIZE.button} />
            WhatsApp
          </GlassButton>
        )}

        {item.instagram && (
          <GlassButton href={`https://instagram.com/${item.instagram}`} className="!px-4 max-w-full break-all">
            <InstagramIcon size={ICON_SIZE.button} />
            @{item.instagram}
          </GlassButton>
        )}

        {item.site && (
          <GlassButton href={item.site.startsWith('http') ? item.site : `https://${item.site}`} Icon={GlobeIcon} className="!px-4">
            Site
          </GlassButton>
        )}

        {item.email && (
          <GlassButton href={`mailto:${item.email}`} Icon={EnvelopeSimpleIcon} className="!px-4">
            E-mail
          </GlassButton>
        )}
      </div>
    </GlassCard>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function IgvEmpresarios() {
  const [empresarios, setEmpresarios] = useState<Empresario[]>([])
  const [loading,     setLoading]     = useState(true)
  const [categoria,   setCategoria]   = useState<string>('Todos')

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { data } = await supabase
        .from('church_empresarios')
        .select('id, nome, categoria, descricao, telefone, instagram, site, email, foto_url')
        .eq('church_id', IGV.churchId)
        .eq('authorized_public', true)
        .eq('active', true)
        .order('nome')
      setEmpresarios((data as Empresario[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  const categorias = ['Todos', ...Array.from(new Set(empresarios.map(e => e.categoria))).sort()]

  const filtered = categoria === 'Todos'
    ? empresarios
    : empresarios.filter(e => e.categoria === categoria)

  return (
    <IgvPageShell>
      <PageHeader title="Rede de Negócios" subtitle="Igreja Gerando Vencedores" />

      <IgvContent>
        <GlassCard className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <IconTile Icon={BusinessCrossIcon} />
            <p className={`min-w-0 ${IGV_TEXT.body}`}>
              Conheça os empreendedores da nossa comunidade e apoie quem faz parte da família IGV.
            </p>
          </div>

          {/* CTA cadastro — sempre visível */}
          <GlassButton to="/igv/empresarios/cadastrar" variant="accent" Icon={PlusIcon} fullWidth>
            Cadastrar meu negócio
          </GlassButton>
        </GlassCard>

        {loading ? (
          <GlassCard className="flex justify-center py-10">
            <CircleNotchIcon size={ICON_SIZE.tile} className="animate-spin text-[var(--igv-accent)]" role="status" aria-label="Carregando" />
          </GlassCard>
        ) : empresarios.length === 0 ? (
          <IgvNotice Icon={BusinessCrossIcon} title="Em breve por aqui!">
            Os empresários da IGV serão listados aqui.
          </IgvNotice>
        ) : (
          <>
            {/* Filtro de categoria */}
            {categorias.length > 2 && (
              <GlassCard className="flex flex-wrap gap-2">
                {categorias.map(cat => (
                  <GlassChip key={cat} selected={categoria === cat} onClick={() => setCategoria(cat)}>
                    {cat}
                  </GlassChip>
                ))}
              </GlassCard>
            )}

            {/* Cards */}
            {filtered.map(e => <EmpresarioCard key={e.id} item={e} />)}

            {filtered.length === 0 && (
              <IgvNotice title="Nenhum empresário nesta categoria ainda." />
            )}

            <p className={`mt-3 px-1 text-center ${IGV_TEXT.muted}`}>
              {filtered.length} de {empresarios.length} empresário{empresarios.length !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </IgvContent>
    </IgvPageShell>
  )
}
