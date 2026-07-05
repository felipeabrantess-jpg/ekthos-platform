import { useState, useEffect }   from 'react'
import { Link }                   from 'react-router-dom'
import { ChevronLeft, Briefcase } from 'lucide-react'
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

function InitialAvatar({ name, size = 56 }: { name: string; size?: number }) {
  const initial = name.charAt(0).toUpperCase()
  return (
    <div
      className="rounded-2xl flex items-center justify-center shrink-0 font-bold text-xl"
      style={{
        width:           size,
        height:          size,
        backgroundColor: `${IGV.primaryColor}18`,
        color:           IGV.primaryColor,
        border:          `1.5px solid ${IGV.primaryColor}30`,
      }}
    >
      {initial}
    </div>
  )
}

// ── Card de empresário ────────────────────────────────────────────────────────

function EmpresarioCard({ item }: { item: Empresario }) {
  return (
    <div className="bg-[#111] rounded-2xl border border-white/10 p-4">
      <div className="flex items-start gap-3 mb-3">
        {item.foto_url ? (
          <img
            src={item.foto_url}
            alt={item.nome}
            className="w-14 h-14 rounded-2xl object-cover shrink-0 border border-white/10"
          />
        ) : (
          <InitialAvatar name={item.nome} />
        )}

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-[1.02rem] leading-tight">{item.nome}</p>
          <span
            className="inline-block text-[0.82rem] font-medium px-2 py-0.5 rounded-full mt-1"
            style={{ backgroundColor: `${IGV.primaryColor}15`, color: IGV.primaryColor }}
          >
            {item.categoria}
          </span>
        </div>
      </div>

      {item.descricao && (
        <p className="text-[1rem] text-white/70 mb-3 leading-snug">{item.descricao}</p>
      )}

      {/* Botões de contato */}
      <div className="flex flex-wrap gap-2">
        {item.telefone && (
          <a
            href={buildWhatsAppUrl(item.telefone)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[0.88rem] font-medium px-3 py-1.5 rounded-xl border active:scale-[0.98] transition-all"
            style={{ backgroundColor: 'rgba(34,197,94,0.12)', color: '#4ade80', borderColor: 'rgba(34,197,94,0.25)' }}
          >
            <WhatsAppIcon size={15} />
            WhatsApp
          </a>
        )}

        {item.instagram && (
          <a
            href={`https://instagram.com/${item.instagram}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[0.88rem] font-medium px-3 py-1.5 rounded-xl border active:scale-[0.98] transition-all"
            style={{ backgroundColor: 'rgba(236,72,153,0.12)', color: '#f472b6', borderColor: 'rgba(236,72,153,0.25)' }}
          >
            <InstagramIcon size={15} />
            @{item.instagram}
          </a>
        )}

        {item.site && (
          <a
            href={item.site.startsWith('http') ? item.site : `https://${item.site}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[0.88rem] font-medium px-3 py-1.5 rounded-xl border active:scale-[0.98] transition-all"
            style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#60a5fa', borderColor: 'rgba(59,130,246,0.25)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            Site
          </a>
        )}

        {item.email && (
          <a
            href={`mailto:${item.email}`}
            className="flex items-center gap-1.5 text-[0.88rem] font-medium px-3 py-1.5 rounded-xl border active:scale-[0.98] transition-all"
            style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.7)', borderColor: 'rgba(255,255,255,0.12)' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
            </svg>
            E-mail
          </a>
        )}
      </div>
    </div>
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
    <div className="min-h-screen bg-black" style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}>
      {/* Header */}
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
          <p className="font-semibold text-white text-[1.02rem] leading-tight">Rede de Negócios</p>
          <p className="text-[0.82rem] text-white/50">Igreja Gerando Vencedores</p>
        </div>
      </div>

      <div className="px-4 pt-5 pb-8">
        {/* Intro */}
        <div className="mb-5">
          <p className="text-[1rem] text-white/70 leading-relaxed">
            Conheça os empreendedores da nossa comunidade e apoie quem faz parte da família IGV.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <div
              className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
              style={{ borderColor: `${IGV.primaryColor}40`, borderTopColor: IGV.primaryColor }}
            />
          </div>
        ) : empresarios.length === 0 ? (
          <div className="text-center py-16 text-white/50">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: `${IGV.primaryColor}15` }}
            >
              <Briefcase size={26} style={{ color: IGV.primaryColor }} strokeWidth={1.5} />
            </div>
            <p className="font-medium text-white/70">Em breve por aqui!</p>
            <p className="text-[1rem] mt-1">Os empresários da IGV serão listados aqui.</p>
          </div>
        ) : (
          <>
            {/* Filtro de categoria */}
            {categorias.length > 2 && (
              <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide -mx-4 px-4">
                {categorias.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setCategoria(cat)}
                    className="shrink-0 text-[0.88rem] font-medium px-3 py-1.5 rounded-full border transition-all"
                    style={
                      categoria === cat
                        ? { backgroundColor: IGV.primaryColor, color: '#fff', borderColor: IGV.primaryColor }
                        : { backgroundColor: '#111', color: '#aaa', borderColor: '#444' }
                    }
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Cards */}
            <div className="space-y-3">
              {filtered.map(e => <EmpresarioCard key={e.id} item={e} />)}
            </div>

            {filtered.length === 0 && (
              <p className="text-center text-[1rem] text-white/50 py-8">
                Nenhum empresário nesta categoria ainda.
              </p>
            )}

            <p className="text-center text-[0.75rem] text-white/40 mt-8">
              {filtered.length} de {empresarios.length} empresário{empresarios.length !== 1 ? 's' : ''}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
