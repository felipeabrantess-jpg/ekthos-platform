// ─────────────────────────────────────────────────────────────────────────────
// PersonDetailPanel — Slide-over premium de ficha da pessoa
//
// Abre pela direita ao clicar numa linha da tabela de Pessoas.
// Mostra todos os dados da pessoa organizados em seções.
// Botão "Editar" delega para o PersonModal existente.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react'
import { X, Pencil, Phone, Mail, Link, MapPin, Calendar, Church, HandHeart, Plus, Trash2 } from 'lucide-react'
import type { PersonWithStage } from '@/lib/types/joins'
import { useAuth } from '@/hooks/useAuth'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  usePersonVolunteers,
  useSetPersonVolunteer,
  useRemovePersonFromMinistry,
  useCreateVolunteer,
  type PersonVolunteer,
} from '@/features/voluntarios/hooks/useVoluntarios'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
  if (!d) return '—'
  return new Intl.DateTimeFormat('pt-BR').format(new Date(d + 'T00:00:00'))
}

function formatPhone(p: string | null | undefined): string {
  if (!p) return '—'
  return p.replace(/^\+55/, '').replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
}

function daysAgo(iso: string | null | undefined): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
}

// ── Stage progression ─────────────────────────────────────────────────────────

const STAGES: { key: string; label: string }[] = [
  { key: 'visitante',    label: 'Visitante' },
  { key: 'contato',      label: 'Contato' },
  { key: 'frequentador', label: 'Frequentador' },
  { key: 'consolidado',  label: 'Consolidado' },
  { key: 'discipulo',    label: 'Discípulo' },
  { key: 'lider',        label: 'Líder' },
]

// ── Sub-components ────────────────────────────────────────────────────────────

function InfoCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-cream-dark/50 overflow-hidden">
      <div className="px-5 py-3 border-b border-cream-dark/40 bg-cream-dark/20">
        <h3 className="font-display text-sm font-semibold text-ekthos-black">{title}</h3>
      </div>
      <div className="px-5 py-3 divide-y divide-cream-dark/30">
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  icon,
}: {
  label: string
  value: React.ReactNode
  icon?: React.ReactNode
}) {
  const isEmpty = value === null || value === undefined || value === '' || value === '—'
  return (
    <div className="flex items-start justify-between gap-3 py-2 first:pt-1 last:pb-1">
      <span className="text-xs text-ekthos-black/40 shrink-0 w-32 flex items-center gap-1.5 mt-0.5">
        {icon && <span className="opacity-60">{icon}</span>}
        {label}
      </span>
      <span className={`text-xs font-medium text-right flex-1 ${isEmpty ? 'text-ekthos-black/25 italic' : 'text-ekthos-black'}`}>
        {isEmpty ? '—' : value}
      </span>
    </div>
  )
}

function BoolField({ label, value }: { label: string; value: boolean | null | undefined }) {
  return (
    <Field
      label={label}
      value={
        value === true
          ? <span className="text-success font-semibold">Sim</span>
          : value === false
          ? <span className="text-ekthos-black/40">Não</span>
          : null
      }
    />
  )
}

function PresenceBadge({ lastAt }: { lastAt: string | null | undefined }) {
  const days = daysAgo(lastAt)
  if (days === null) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-cream-dark text-ekthos-black/40 font-medium">
        Sem registro
      </span>
    )
  }
  if (days === 0) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-success-bg text-success font-semibold">Hoje</span>
  }
  if (days <= 7) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-success-bg text-success font-medium">há {days}d</span>
  }
  if (days <= 14) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-warning-bg text-warning font-semibold">há {days}d — Atenção</span>
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 font-semibold">
      há {days}d — Em risco
    </span>
  )
}

// ── Voluntariado section ──────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  volunteer:  'Voluntário',
  leader:     'Líder',
  'co-leader': 'Co-líder',
}

interface AddMinistryModalProps {
  personId: string
  churchId: string
  onClose: () => void
}

function AddMinistryModal({ personId, churchId, onClose }: AddMinistryModalProps) {
  const create = useCreateVolunteer()
  const [ministryId, setMinistryId] = useState('')
  const [role, setRole] = useState('volunteer')
  const [error, setError] = useState<string | null>(null)

  const { data: ministries = [] } = useQuery({
    queryKey: ['ministries_list', churchId],
    queryFn: async () => {
      const { data } = await supabase
        .from('ministries')
        .select('id, name')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('name')
      return data ?? []
    },
  })

  async function handleAdd() {
    if (!ministryId) return
    setError(null)
    try {
      await create.mutateAsync({ church_id: churchId, person_id: personId, ministry_id: ministryId, role })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-ekthos-black">Adicionar ao ministério</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-cream transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-ekthos-black mb-1.5">Ministério *</label>
            <select
              value={ministryId}
              onChange={e => setMinistryId(e.target.value)}
              className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="">Selecionar...</option>
              {ministries.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-ekthos-black mb-1.5">Função</label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              className="block w-full rounded-xl border border-black/10 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-600"
            >
              <option value="volunteer">Voluntário</option>
              <option value="leader">Líder</option>
              <option value="co-leader">Co-líder</option>
            </select>
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-xl border border-black/10 text-sm font-medium text-gray-600 hover:bg-cream transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => { void handleAdd() }}
            disabled={!ministryId || create.isPending}
            className="flex-1 px-4 py-2 rounded-xl bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {create.isPending ? 'Adicionando...' : 'Adicionar'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface VoluntariadoSectionProps {
  personId: string
  churchId: string
  isVolunteer: boolean
}

function VoluntariadoSection({ personId, churchId, isVolunteer }: VoluntariadoSectionProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [confirmRemoveAll, setConfirmRemoveAll] = useState(false)
  const setVolunteer = useSetPersonVolunteer()
  const removeFromMinistry = useRemovePersonFromMinistry()

  const { data: volunteers = [], isLoading } = usePersonVolunteers(personId, churchId)

  async function handleToggle(checked: boolean) {
    if (!checked && volunteers.length > 0) {
      setConfirmRemoveAll(true)
      return
    }
    await setVolunteer.mutateAsync({ personId, churchId, isVolunteer: checked })
  }

  async function handleRemoveAll() {
    // Deactivate all ministries
    for (const v of volunteers) {
      await removeFromMinistry.mutateAsync({ volunteerId: v.id, churchId })
    }
    await setVolunteer.mutateAsync({ personId, churchId, isVolunteer: false })
    setConfirmRemoveAll(false)
  }

  async function handleRemoveOne(v: PersonVolunteer) {
    await removeFromMinistry.mutateAsync({ volunteerId: v.id, churchId })
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-cream-dark/50 overflow-hidden">
        <div className="px-5 py-3 border-b border-cream-dark/40 bg-cream-dark/20 flex items-center gap-2">
          <HandHeart size={14} className="text-brand-600" />
          <h3 className="font-display text-sm font-semibold text-ekthos-black">Voluntariado</h3>
        </div>

        <div className="px-5 py-3 space-y-3">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-ekthos-black/60">É voluntário(a) na igreja</span>
            <button
              onClick={() => { void handleToggle(!isVolunteer) }}
              disabled={setVolunteer.isPending}
              className={`relative w-10 h-5 rounded-full transition-colors ${
                isVolunteer ? 'bg-brand-600' : 'bg-gray-200'
              }`}
            >
              <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                isVolunteer ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* Ministry list */}
          {isLoading ? (
            <p className="text-xs text-gray-400">Carregando...</p>
          ) : volunteers.length === 0 ? (
            <p className="text-xs text-ekthos-black/30 italic">Nenhum ministério vinculado</p>
          ) : (
            <div className="space-y-1.5">
              {volunteers.map(v => (
                <div key={v.id} className="flex items-center justify-between gap-2 bg-cream rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-full bg-brand-600 shrink-0" />
                    <span className="text-xs font-medium text-ekthos-black truncate">
                      {v.ministries?.name ?? '—'}
                    </span>
                    <span className="text-xs text-gray-400 shrink-0">
                      {ROLE_LABELS[v.role ?? 'volunteer'] ?? v.role}
                    </span>
                  </div>
                  <button
                    onClick={() => { void handleRemoveOne(v) }}
                    disabled={removeFromMinistry.isPending}
                    className="p-1 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors shrink-0"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add button */}
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 text-xs font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            <Plus size={12} />
            Adicionar ministério
          </button>
        </div>
      </div>

      {/* Confirm remove all */}
      {confirmRemoveAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmRemoveAll(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm space-y-4">
            <h3 className="font-semibold text-ekthos-black">Remover de todos os ministérios?</h3>
            <p className="text-sm text-gray-500">
              Esta pessoa será removida de {volunteers.length} ministério(s) e deixará de ser voluntária.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmRemoveAll(false)}
                className="flex-1 px-4 py-2 rounded-xl border border-black/10 text-sm font-medium text-gray-600 hover:bg-cream"
              >
                Cancelar
              </button>
              <button
                onClick={() => { void handleRemoveAll() }}
                className="flex-1 px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-medium hover:bg-red-700"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <AddMinistryModal
          personId={personId}
          churchId={churchId}
          onClose={() => setAddOpen(false)}
        />
      )}
    </>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface PersonDetailPanelProps {
  person: PersonWithStage | null
  onClose: () => void
  onEdit: (person: PersonWithStage) => void
}

export default function PersonDetailPanel({ person, onClose, onEdit }: PersonDetailPanelProps) {
  const { churchId } = useAuth()

  if (!person) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = person as any  // acesso aos campos extras (wedding_date, baptism_type, church_role)

  const initials = (person.name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('')

  const currentStageKey = person.person_stage ?? 'visitante'
  const currentStageIndex = STAGES.findIndex((s) => s.key === currentStageKey)

  const RELATIONSHIP_LABELS: Record<string, string> = {
    visitante:    'Visitante',
    frequentador: 'Frequentador',
    membro:       'Membro',
    transferido:  'Transferido',
  }

  const CHURCH_ROLE_LABELS: Record<string, string> = {
    membro:     'Membro',
    diacono:    'Diácono',
    presbitero: 'Presbítero',
    pastor:     'Pastor',
  }

  const MARITAL_LABELS: Record<string, string> = {
    solteiro:   'Solteiro(a)',
    casado:     'Casado(a)',
    divorciado: 'Divorciado(a)',
    viuvo:      'Viúvo(a)',
  }

  const BATISMO_LABELS: Record<string, string> = {
    sim:      'Batizado',
    nao:      'Não batizado',
    agendado: 'Agendado',
  }

  const BAPTISM_TYPE_LABELS: Record<string, string> = {
    imersao:  'Imersão',
    aspersao: 'Aspersão',
  }

  const COMO_CONHECEU_LABELS: Record<string, string> = {
    convite_membro:  'Convite de membro',
    redes_sociais:   'Redes sociais',
    passou_na_frente:'Passou na frente',
    evento:          'Evento',
    familia:         'Família',
    outro:           'Outro',
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-full max-w-[520px] bg-cream-light h-full flex flex-col shadow-2xl animate-fade-in-up">

        {/* ── HEADER ─────────────────────────────────────────────────────── */}
        <div className="px-6 pt-5 pb-4 border-b border-cream-dark/50" style={{ background: 'rgba(22,22,22,0.04)' }}>
          {/* Top bar: close */}
          <div className="flex justify-end mb-4">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-ekthos-black/30 hover:text-ekthos-black/70 hover:bg-cream-dark/60 transition-all"
            >
              <X size={16} strokeWidth={1.75} />
            </button>
          </div>

          {/* Avatar + nome */}
          <div className="flex items-start gap-4">
            <div
              className="h-14 w-14 rounded-full flex items-center justify-center shrink-0 font-display text-xl font-bold text-white shadow-sm"
              style={{ background: 'var(--church-primary, var(--color-primary))' }}
            >
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-xl font-bold text-ekthos-black leading-tight truncate">
                {person.name ?? '—'}
              </h2>
              {p.church_role && (
                <p className="text-xs text-ekthos-black/50 mt-0.5">
                  {CHURCH_ROLE_LABELS[p.church_role] ?? p.church_role}
                </p>
              )}
              {/* Stage pills */}
              <div className="flex flex-wrap gap-1 mt-2">
                {STAGES.map((stage, idx) => {
                  const isActive = idx === currentStageIndex
                  const isPast   = idx < currentStageIndex
                  return (
                    <span
                      key={stage.key}
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-all ${
                        isActive
                          ? 'bg-brand-600 text-white'
                          : isPast
                          ? 'bg-brand-50 text-brand-600'
                          : 'bg-cream-dark text-ekthos-black/30'
                      }`}
                    >
                      {stage.label}
                    </span>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Frequência + edit */}
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-ekthos-black/40">Última presença:</span>
              <PresenceBadge lastAt={person.last_attendance_at} />
            </div>
            <button
              onClick={() => onEdit(person)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand-600 text-white hover:bg-brand-700 transition-colors"
            >
              <Pencil size={12} strokeWidth={2} />
              Editar
            </button>
          </div>
        </div>

        {/* ── BODY ───────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto sidebar-scroll px-6 py-5 space-y-3">

          {/* 1. Dados Pessoais */}
          <InfoCard title="Dados Pessoais">
            <Field label="Nome" value={person.name} />
            <Field label="CPF" value={person.cpf} />
            <Field label="Nascimento" value={formatDate(person.birth_date)} icon={<Calendar size={11} />} />
            <Field label="Estado Civil" value={MARITAL_LABELS[person.marital_status ?? ''] ?? person.marital_status} />
            {(person.marital_status === 'casado' || person.spouse_name) && (
              <Field label="Cônjuge" value={person.spouse_name} />
            )}
            {(person.marital_status === 'casado' || p.wedding_date) && (
              <Field label="Casamento" value={formatDate(p.wedding_date)} icon={<Calendar size={11} />} />
            )}
            <Field
              label="Filhos"
              value={
                person.children_count != null && person.children_count > 0
                  ? `${person.children_count}${person.children_info ? ` — ${person.children_info}` : ''}`
                  : person.children_info || null
              }
            />
          </InfoCard>

          {/* 2. Contato */}
          <InfoCard title="Contato">
            <Field label="Telefone"  value={formatPhone(person.phone)}  icon={<Phone size={11} />} />
            <Field label="Telefone 2" value={formatPhone(p.phone_secondary)} icon={<Phone size={11} />} />
            <Field label="E-mail"    value={person.email}               icon={<Mail size={11} />} />
            <Field
              label="Instagram"
              value={person.instagram_handle ? `@${person.instagram_handle.replace(/^@/, '')}` : null}
              icon={<Link size={11} />}
            />
            {(person.street || person.neighborhood || person.city) && (
              <Field
                label="Endereço"
                icon={<MapPin size={11} />}
                value={[
                  person.street && `${person.street}${person.street_number ? `, ${person.street_number}` : ''}`,
                  person.address_complement,
                  person.neighborhood,
                  person.city && `${person.city}${person.state ? '/' + person.state : ''}`,
                  person.zip_code,
                ].filter(Boolean).join(' — ')}
              />
            )}
            {!person.street && person.neighborhood && (
              <Field label="Bairro" value={person.neighborhood} icon={<MapPin size={11} />} />
            )}
          </InfoCard>

          {/* 3. Dados Eclesiásticos */}
          <InfoCard title="Dados Eclesiásticos">
            <Field
              label="Vínculo"
              value={RELATIONSHIP_LABELS[person.church_relationship ?? ''] ?? person.church_relationship}
              icon={<Church size={11} />}
            />
            <Field
              label="Cargo"
              value={p.church_role ? (CHURCH_ROLE_LABELS[p.church_role] ?? p.church_role) : null}
            />
            <Field label="Como conheceu" value={COMO_CONHECEU_LABELS[p.como_conheceu ?? ''] ?? p.como_conheceu} />
            <Field label="Primeira visita" value={formatDate(person.first_visit_date)} icon={<Calendar size={11} />} />
            <Field label="Conversão" value={formatDate(person.conversion_date)} icon={<Calendar size={11} />} />
            <Field label="Membresia desde" value={formatDate(person.membership_date)} icon={<Calendar size={11} />} />
            <Field label="Igreja anterior" value={person.previous_church ?? p.origin_church_name} />
            <Field label="Pastor anterior" value={p.origin_pastor_name} />
          </InfoCard>

          {/* 4. Batismo */}
          {(p.batismo_status || person.baptism_date || p.baptism_type) && (
            <InfoCard title="Batismo">
              <Field label="Status" value={BATISMO_LABELS[p.batismo_status ?? ''] ?? p.batismo_status} />
              {p.batismo_status === 'sim' && (
                <>
                  <Field label="Data" value={formatDate(person.baptism_date)} icon={<Calendar size={11} />} />
                  <Field label="Tipo" value={p.baptism_type ? (BAPTISM_TYPE_LABELS[p.baptism_type] ?? p.baptism_type) : null} />
                </>
              )}
            </InfoCard>
          )}

          {/* 5. Vida Espiritual */}
          <InfoCard title="Vida Espiritual">
            <BoolField label="Em discipulado" value={person.in_discipleship} />
            <BoolField label="Tem célula" value={person.has_cell} />
            <BoolField label="Serve em ministério" value={person.serves_ministry} />
            <BoolField label="Escola de consolidação" value={person.consolidation_school} />
            <BoolField label="Encontro com Deus" value={person.encounter_with_god} />
            {person.calling && (
              <Field label="Dons e talentos" value={person.calling} />
            )}
            {person.ministry_interest && person.ministry_interest.length > 0 && (
              <Field
                label="Interesse ministério"
                value={
                  <div className="flex flex-wrap gap-1 justify-end">
                    {person.ministry_interest.map((m: string) => (
                      <span key={m} className="text-[10px] bg-brand-50 text-brand-700 rounded-full px-1.5 py-0.5 font-medium">
                        {m}
                      </span>
                    ))}
                  </div>
                }
              />
            )}
            {p.experiencia_lideranca && (
              <Field
                label="Exp. liderança"
                value={
                  { sim_esta: 'Sim — nesta igreja', sim_outra: 'Sim — outra igreja', nao: 'Não' }[p.experiencia_lideranca as string]
                  ?? p.experiencia_lideranca
                }
              />
            )}
          </InfoCard>

          {/* 6. Pastoral (admin only — mostrado se houver dados) */}
          {(p.observacoes_pastorais || p.is_dizimista != null || person.invited_by || person.responsible_id) && (
            <InfoCard title="Pastoral">
              <BoolField label="Dizimista" value={p.is_dizimista} />
              {person.invited_by && <Field label="Convidado por" value={person.invited_by} />}
              {p.observacoes_pastorais && (
                <div className="py-2">
                  <p className="text-xs text-ekthos-black/40 mb-1.5">Observações pastorais</p>
                  <p className="text-xs text-ekthos-black/80 bg-cream-dark/30 rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap">
                    {p.observacoes_pastorais}
                  </p>
                </div>
              )}
            </InfoCard>
          )}

          {/* 7. Widget Frequência */}
          <InfoCard title="Frequência e Contato">
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-ekthos-black/40">Última presença</span>
              <PresenceBadge lastAt={person.last_attendance_at} />
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-ekthos-black/40">Último contato</span>
              <PresenceBadge lastAt={person.last_contact_at} />
            </div>
            <Field label="Cadastrado em" value={formatDate(person.created_at)} icon={<Calendar size={11} />} />
            <Field label="Fonte" value={person.source} />
            {person.optout && (
              <div className="py-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700">
                  Optout — {formatDate(person.optout_at)}
                </span>
              </div>
            )}
          </InfoCard>

          {/* 8. Voluntariado */}
          {churchId && (
            <VoluntariadoSection
              personId={person.id}
              churchId={churchId}
              isVolunteer={!!(p.is_volunteer)}
            />
          )}

          {/* Espaço no fundo */}
          <div className="h-4" />
        </div>
      </div>
    </div>
  )
}
