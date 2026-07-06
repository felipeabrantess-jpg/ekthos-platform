import { useState }             from 'react'
import { useNavigate }          from 'react-router-dom'
import { Check, Search, ChevronDown, ChevronUp, MessageSquare } from 'lucide-react'
import { useQuery }             from '@tanstack/react-query'
import { useAuth }              from '@/hooks/useAuth'
import { supabase }             from '@/lib/supabase'
import Spinner                  from '@/components/ui/Spinner'
import CuidadoTabBar            from './CuidadoTabBar'
import {
  useCareContacts,
  useUpsertCareContact,
  type CareContact,
} from '@/features/cuidado/hooks/useCareContacts'
import { usePessoasConversas }  from '@/features/cuidado/hooks/usePessoasConversas'

// ── People query ──────────────────────────────────────────────────────────────

interface PersonRow {
  id:        string
  name:      string | null
  phone:     string | null
  name_sort: string | null
}

function usePeopleWithPhone(churchId: string) {
  return useQuery({
    queryKey: ['people-with-phone', churchId],
    queryFn: async (): Promise<PersonRow[]> => {
      const { data, error } = await supabase
        .from('people')
        .select('id, name, phone, name_sort')
        .eq('church_id', churchId)
        .is('deleted_at', null)
        .not('phone', 'is', null)
        .order('name_sort', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as PersonRow[]
    },
    enabled: Boolean(churchId),
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return raw
}

function waHref(phone: string): string {
  return `https://wa.me/55${phone.replace(/\D/g, '').replace(/^55/, '')}`
}

// ── PersonCareRow ─────────────────────────────────────────────────────────────

interface PersonCareRowProps {
  person:     PersonRow
  contact:    CareContact | null
  churchId:   string
  conversaId: string | null
}

function PersonCareRow({ person, contact, churchId, conversaId }: PersonCareRowProps) {
  const navigate = useNavigate()
  const [expanded,  setExpanded]  = useState(false)
  const [notes,     setNotes]     = useState(contact?.notes ?? '')
  const [contacted, setContacted] = useState(contact?.contacted ?? false)
  const upsert = useUpsertCareContact()

  const isContacted  = contact?.contacted ?? false
  const contactedAt  = contact?.contacted_at ? new Date(contact.contacted_at) : null
  const byLabel      = isContacted && contact?.contacted_by_name && contactedAt
    ? `✓ Cuidado por ${contact.contacted_by_name} · ${contactedAt.toLocaleDateString('pt-BR')}`
    : null

  function handleToggleExpand() {
    if (!expanded) {
      setNotes(contact?.notes ?? '')
      setContacted(contact?.contacted ?? false)
    }
    setExpanded(v => !v)
  }

  async function handleSave() {
    await upsert.mutateAsync({ personId: person.id, churchId, contacted, notes })
    setExpanded(false)
  }

  return (
    <div
      className="rounded-xl border transition-colors"
      style={
        isContacted
          ? { backgroundColor: '#F0FBF7', borderColor: '#A8DEC9' }
          : { borderColor: 'var(--border-default)' }
      }
    >
      {/* ── Linha compacta ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Avatar */}
        <div
          className="flex items-center justify-center rounded-full shrink-0 font-semibold text-white select-none"
          style={{ width: 36, height: 36, fontSize: 14, backgroundColor: isContacted ? '#1D9E75' : '#BA7517' }}
        >
          {(person.name ?? '?').charAt(0).toUpperCase()}
        </div>

        {/* Nome + telefone — clicável */}
        <div className="flex-1 min-w-0 cursor-pointer" onClick={handleToggleExpand}>
          <p className="font-medium text-text-primary truncate" style={{ fontSize: 15 }}>
            {person.name ?? '—'}
          </p>
          {byLabel ? (
            <p className="truncate" style={{ fontSize: 11, color: '#0F6E56' }}>{byLabel}</p>
          ) : (
            <p className="truncate text-text-tertiary" style={{ fontSize: 13 }}>
              {person.phone ? formatPhone(person.phone) : '—'}
            </p>
          )}
        </div>

        {/* Ação primária: Ver conversa (número da igreja) ou Sem conversa */}
        {conversaId ? (
          <button
            onClick={e => { e.stopPropagation(); navigate(`/conversas/${conversaId}`) }}
            className="flex items-center gap-1.5 rounded-xl shrink-0 text-white font-medium hover:opacity-80 active:opacity-60 transition-opacity"
            style={{ padding: '0 12px', height: 34, fontSize: 12, backgroundColor: '#e13500' }}
            title="Ver conversa no WhatsApp da igreja"
          >
            <MessageSquare size={13} />
            Ver conversa
          </button>
        ) : (
          <div
            className="flex items-center gap-1.5 rounded-xl shrink-0 select-none opacity-40"
            style={{ padding: '0 12px', height: 34, fontSize: 12, fontWeight: 500, backgroundColor: '#E5E7EB', color: '#6B7280' }}
            title="Esta pessoa ainda não tem conversa iniciada no WhatsApp da igreja"
          >
            <MessageSquare size={13} />
            Sem conversa
          </div>
        )}

        {/* Fallback: WhatsApp pessoal (sempre disponível como secundário) */}
        {person.phone && (
          <a
            href={waHref(person.phone)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            className="flex items-center justify-center rounded-lg shrink-0 hover:opacity-80 active:opacity-60 transition-opacity"
            style={{ width: 28, height: 28, backgroundColor: '#25D366' }}
            title="WhatsApp pessoal (número do usuário)"
          >
            <svg width="15" height="15" viewBox="0 0 32 32" fill="white" xmlns="http://www.w3.org/2000/svg">
              <path d="M16 3C8.832 3 3 8.832 3 16c0 2.41.661 4.664 1.813 6.594L3 29l6.563-1.781A12.935 12.935 0 0016 29c7.168 0 13-5.832 13-13S23.168 3 16 3zm0 2c6.086 0 11 4.914 11 11s-4.914 11-11 11a10.94 10.94 0 01-5.594-1.531l-.375-.22-3.937 1.063 1.094-3.813-.25-.406A10.94 10.94 0 015 16C5 9.914 9.914 5 16 5zm-3.094 5.438c-.2 0-.527.074-.8.374-.274.3-1.044 1.02-1.044 2.485 0 1.465 1.067 2.883 1.215 3.083.149.2 2.067 3.227 5.075 4.398.71.277 1.261.44 1.692.567.71.21 1.356.18 1.867.11.57-.079 1.75-.716 2-1.4.248-.686.248-1.28.173-1.404-.074-.124-.273-.198-.57-.347-.298-.148-1.754-.867-2.027-.965-.273-.099-.473-.149-.672.149-.2.298-.77.966-.942 1.165-.173.2-.348.224-.645.075-.298-.15-1.254-.46-2.39-1.474-.882-.788-1.478-1.762-1.65-2.059-.173-.299-.018-.46.129-.606.133-.133.298-.347.446-.521.148-.174.198-.3.297-.499.1-.2.05-.372-.024-.52-.074-.15-.67-1.614-.918-2.21-.24-.578-.485-.499-.667-.509-.175-.008-.374-.01-.573-.01z" />
            </svg>
          </a>
        )}

        {/* Expand toggle */}
        <button
          onClick={handleToggleExpand}
          className="shrink-0 text-text-tertiary hover:text-text-secondary transition-colors"
          style={{ padding: 4 }}
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* ── Ficha expandida ──────────────────────────────────────────── */}
      {expanded && (
        <div
          className="px-3 pb-3 pt-2.5 space-y-3"
          style={{ borderTop: `1px solid ${isContacted ? '#A8DEC9' : 'var(--border-default)'}` }}
        >
          {/* Toggle contatado */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <div
              role="switch"
              aria-checked={contacted}
              onClick={() => setContacted(v => !v)}
              className="relative rounded-full shrink-0 transition-colors"
              style={{ width: 40, height: 22, backgroundColor: contacted ? '#1D9E75' : '#D1D5DB' }}
            >
              <div
                className="absolute top-[3px] rounded-full bg-white shadow transition-all"
                style={{ width: 16, height: 16, left: contacted ? 21 : 3 }}
              />
            </div>
            <span className="font-medium" style={{ fontSize: 14, color: contacted ? '#0F6E56' : 'var(--text-secondary)' }}>
              {contacted ? 'Foi contatada' : 'Marcar como contatada'}
            </span>
          </label>

          {/* Anotação */}
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Anotação</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Registro do cuidado, oração, necessidade..."
              className="w-full rounded-lg border border-border-default bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder-text-tertiary resize-none focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
            />
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setExpanded(false)}
              className="rounded-lg text-text-secondary hover:text-text-primary transition-colors"
              style={{ fontSize: 13, padding: '6px 12px' }}
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={upsert.isPending}
              className="flex items-center gap-1.5 rounded-lg font-medium text-white transition-opacity disabled:opacity-60"
              style={{ fontSize: 13, padding: '6px 16px', backgroundColor: '#1D9E75' }}
            >
              {upsert.isPending ? '...' : <><Check size={13} />Salvar</>}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function CuidadoPessoas() {
  const { churchId }  = useAuth()
  const [search, setSearch] = useState('')

  const { data: people      = [], isLoading } = usePeopleWithPhone(churchId ?? '')
  const { data: contacts    = [] }            = useCareContacts(churchId ?? '')
  const { data: conversaMap = new Map() }     = usePessoasConversas(churchId ?? '')

  const contactMap     = new Map(contacts.map(c => [c.person_id, c]))
  const contactedCount = contacts.filter(c => c.contacted).length

  const filtered = people.filter(p =>
    !search || (p.name ?? '').toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-4 max-w-3xl">
      <CuidadoTabBar />

      {/* Progresso */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="font-medium text-text-secondary" style={{ fontSize: 14 }}>
            Membros com WhatsApp
          </p>
          <span className="font-semibold text-text-secondary" style={{ fontSize: 13 }}>
            {contactedCount} de {people.length} contatados
          </span>
        </div>
        <div className="rounded-full overflow-hidden bg-bg-hover" style={{ height: 6 }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width:           people.length > 0 ? `${(contactedCount / people.length) * 100}%` : '0%',
              backgroundColor: '#1D9E75',
            }}
          />
        </div>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nome..."
          className="w-full rounded-xl border border-border-default bg-bg-primary pl-9 pr-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-[#1D9E75]"
        />
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-text-tertiary py-10" style={{ fontSize: 14 }}>
          {search ? 'Nenhuma pessoa encontrada.' : 'Nenhum membro com telefone cadastrado.'}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map(p => (
            <PersonCareRow
              key={p.id}
              person={p}
              contact={contactMap.get(p.id) ?? null}
              churchId={churchId ?? ''}
              conversaId={conversaMap.get(p.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  )
}
