import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Network, Building2, Users2, Phone, Mail, MessageSquarePlus, CalendarPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import Modal from '@/components/ui/Modal'

interface LeaderProfile {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
}

interface LedGroup { id: string; name: string; role: 'leader' | 'co_leader' }
interface LedMinistry { id: string; name: string }
interface Liderado { id: string; name: string | null; phone: string | null; celula: string | null }

function initials(name: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

// Modal stub — botões existem e abrem; ação real fica para frente futura.
function StubActionModal({ open, onClose, title, description }: { open: boolean; onClose: () => void; title: string; description: string }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">{description}</p>
        <p className="text-xs text-gray-400">
          Esta ação será conectada ao fluxo completo em breve. Por enquanto, registre manualmente.
        </p>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  )
}

export default function LeaderDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { churchId } = useAuth()
  const [contactOpen, setContactOpen] = useState(false)
  const [gabineteOpen, setGabineteOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['leader_detail', churchId, id],
    enabled: !!churchId && !!id,
    queryFn: async () => {
      // Perfil
      const { data: person } = await supabase
        .from('people')
        .select('id, name, email, phone, avatar_url')
        .eq('id', id!)
        .single()

      // Células lideradas (líder ou co-líder)
      const { data: groups } = await supabase
        .from('groups')
        .select('id, name, leader_id, co_leader_id')
        .eq('church_id', churchId!)
        .eq('status', 'active')

      const ledGroups: LedGroup[] = []
      groups?.forEach(g => {
        if (g.leader_id === id) ledGroups.push({ id: g.id, name: g.name, role: 'leader' })
        else if (g.co_leader_id === id) ledGroups.push({ id: g.id, name: g.name, role: 'co_leader' })
      })

      // Ministérios liderados
      const { data: ministries } = await supabase
        .from('ministries')
        .select('id, name, leader_id')
        .eq('church_id', churchId!)
        .eq('is_active', true)
        .eq('leader_id', id!)
      const ledMinistries: LedMinistry[] = (ministries ?? []).map(m => ({ id: m.id, name: m.name }))

      // Liderados — pessoas vinculadas às células lideradas (people.celula_id)
      const ledGroupIds = ledGroups.map(g => g.id)
      let liderados: Liderado[] = []
      if (ledGroupIds.length > 0) {
        const nameById = new Map(ledGroups.map(g => [g.id, g.name]))
        const { data: members } = await supabase
          .from('people')
          .select('id, name, phone, celula_id')
          .eq('church_id', churchId!)
          .is('deleted_at', null)
          .in('celula_id', ledGroupIds)
        liderados = (members ?? []).map(m => ({
          id: m.id, name: m.name, phone: m.phone, celula: nameById.get(m.celula_id as string) ?? null,
        }))
      }

      return {
        profile: (person ?? null) as LeaderProfile | null,
        ledGroups, ledMinistries, liderados,
      }
    },
  })

  if (isLoading) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  }

  if (!data?.profile) {
    return (
      <div className="space-y-4">
        <button onClick={() => navigate('/lideres')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-ekthos-black">
          <ArrowLeft className="w-4 h-4" /> Voltar
        </button>
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">Líder não encontrado.</p>
        </div>
      </div>
    )
  }

  const { profile, ledGroups, ledMinistries, liderados } = data

  return (
    <div className="space-y-6">
      {/* Voltar */}
      <button onClick={() => navigate('/lideres')} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-ekthos-black">
        <ArrowLeft className="w-4 h-4" /> Líderes
      </button>

      {/* Perfil */}
      <div className="bg-white rounded-2xl border border-black/10 p-5 flex flex-col sm:flex-row gap-4 sm:items-center">
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.name ?? ''} className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-cream flex items-center justify-center text-brand-600 font-bold text-xl">
            {initials(profile.name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-xl font-bold text-ekthos-black truncate">{profile.name ?? 'Sem nome'}</h1>
          <div className="mt-1 space-y-0.5">
            {profile.email && (
              <p className="text-sm text-gray-500 flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> {profile.email}</p>
            )}
            {profile.phone && (
              <p className="text-sm text-gray-500 flex items-center gap-1.5"><Phone className="w-3.5 h-3.5" /> {profile.phone}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setContactOpen(true)}>
            <MessageSquarePlus className="w-4 h-4 mr-1" /> Registrar Contato
          </Button>
          <Button variant="secondary" onClick={() => setGabineteOpen(true)}>
            <CalendarPlus className="w-4 h-4 mr-1" /> Agendar Gabinete
          </Button>
        </div>
      </div>

      {/* Sob liderança */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-white rounded-2xl border border-black/10 p-4">
          <h2 className="text-sm font-semibold text-ekthos-black mb-3 flex items-center gap-1.5">
            <Network className="w-4 h-4 text-brand-600" /> Células sob liderança
          </h2>
          {ledGroups.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma célula.</p>
          ) : (
            <ul className="space-y-2">
              {ledGroups.map(g => (
                <li key={`${g.id}-${g.role}`} className="flex items-center justify-between text-sm">
                  <span className="text-ekthos-black">{g.name}</span>
                  <span className="text-xs text-gray-400">{g.role === 'leader' ? 'Líder' : 'Co-líder'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-black/10 p-4">
          <h2 className="text-sm font-semibold text-ekthos-black mb-3 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-purple-600" /> Ministérios sob liderança
          </h2>
          {ledMinistries.length === 0 ? (
            <p className="text-sm text-gray-400">Nenhum ministério.</p>
          ) : (
            <ul className="space-y-2">
              {ledMinistries.map(m => (
                <li key={m.id} className="text-sm text-ekthos-black">{m.name}</li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Liderados */}
      <div className="bg-white rounded-2xl border border-black/10 p-4">
        <h2 className="text-sm font-semibold text-ekthos-black mb-3 flex items-center gap-1.5">
          <Users2 className="w-4 h-4 text-brand-600" /> Liderados ({liderados.length})
        </h2>
        {liderados.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma pessoa vinculada às células lideradas.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {liderados.map(p => (
              <li key={p.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <p className="text-ekthos-black">{p.name ?? 'Sem nome'}</p>
                  {p.celula && <p className="text-xs text-gray-400">{p.celula}</p>}
                </div>
                {p.phone && <span className="text-xs text-gray-400">{p.phone}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <StubActionModal
        open={contactOpen}
        onClose={() => setContactOpen(false)}
        title="Registrar Contato"
        description={`Registrar um contato pastoral com ${profile.name ?? 'este líder'}.`}
      />
      <StubActionModal
        open={gabineteOpen}
        onClose={() => setGabineteOpen(false)}
        title="Agendar Gabinete"
        description={`Agendar um atendimento de gabinete com ${profile.name ?? 'este líder'}.`}
      />
    </div>
  )
}
