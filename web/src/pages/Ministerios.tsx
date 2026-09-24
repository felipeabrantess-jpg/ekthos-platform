import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import {
  useMinisterios,
  useCreateMinistry,
  useUpdateMinistry,
  useDeleteMinistry,
} from '@/features/ministerios/hooks/useMinisterios'
import {
  useMinistryMembers,
  useMyManagedMinistries,
  useChurchAccounts,
  useAddMinistryMember,
  useRemoveMinistryMember,
} from '@/features/ministerios/hooks/useMinistryMembers'
import { useMinistryReferrals } from '@/features/ministerios/hooks/useMinistryReferrals'
import type { MinistryReferral } from '@/features/ministerios/hooks/useMinistryReferrals'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import PersonSelect from '@/components/ui/PersonSelect'
import { Skeleton } from '@/components/ui/Skeleton'
import type { MinistryWithLeader } from '@/lib/types/joins'
import ModalPortal from '@/components/ui/ModalPortal'

// ── Types ──────────────────────────────────────────────────────────────────────

type PageTab = 'ministerios' | 'fila'

interface MinistryFormData {
  name: string
  description: string
  /** PESSOA líder (people.id) */
  leaderPersonId: string
  /** CONTA DE ACESSO autorizada a gerir o ministério (auth.users.id) — vinculada pelo admin */
  leaderUserId: string
}

const emptyForm: MinistryFormData = {
  name: '',
  description: '',
  leaderPersonId: '',
  leaderUserId: '',
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

// ── MinistryCard ───────────────────────────────────────────────────────────────

interface MinistryCardProps {
  ministry: MinistryWithLeader
  onEdit: (m: MinistryWithLeader) => void
  onDelete: (m: MinistryWithLeader) => void
  onMembers: (m: MinistryWithLeader) => void
  /** admin/admin_departments: editar/excluir o ministério */
  canManage: boolean
  /** admin ou líder com conta vinculada a ESTE ministério: gerir pessoas */
  canManageMembers: boolean
}

function MinistryCard({ ministry, onEdit, onDelete, onMembers, canManage, canManageMembers }: MinistryCardProps) {
  const leaderName = ministry.people?.name ?? null

  return (
    <div className="bg-bg-surface rounded-2xl border border-border-default shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="font-display text-base font-semibold text-text-primary truncate">{ministry.name}</h3>
          {ministry.description && (
            <p className="text-sm text-text-secondary mt-0.5 line-clamp-2">{ministry.description}</p>
          )}
        </div>
        <Badge label="Ativo" variant="green" />
      </div>

      <div className="text-sm text-text-secondary space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-text-tertiary">Líder:</span>
          <span className="font-medium text-text-primary">{leaderName ?? 'Sem líder'}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-text-tertiary">Pessoas:</span>
          <span className="font-medium text-text-primary" data-testid="member-count">{ministry.member_count ?? 0}</span>
        </div>
      </div>

      <div className="flex gap-3 pt-1 border-t border-border-default">
        <button
          onClick={() => onMembers(ministry)}
          className="text-xs text-primary hover:text-primary font-medium"
          data-testid="btn-pessoas"
        >
          {canManageMembers ? 'Pessoas' : 'Ver pessoas'}
        </button>
        {canManage && (
          <>
            <button
              onClick={() => onEdit(ministry)}
              className="text-xs text-text-secondary hover:text-text-primary font-medium"
            >
              Editar
            </button>
            <button
              onClick={() => onDelete(ministry)}
              className="ml-auto text-xs text-red-400 hover:text-red-600 font-medium"
            >
              Excluir
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── MinistryModal ──────────────────────────────────────────────────────────────

interface MinistryModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  editing: MinistryWithLeader | null
}

function MinistryModal({ open, onClose, churchId, editing }: MinistryModalProps) {
  const createMinistry = useCreateMinistry()
  const updateMinistry = useUpdateMinistry()
  const [form, setForm] = useState<MinistryFormData>(
    editing
      ? {
          name: editing.name,
          description: editing.description ?? '',
          leaderPersonId: editing.people?.id ?? '',
          leaderUserId: editing.leader_user_id ?? '',
        }
      : emptyForm
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Contas da igreja para vincular a CONTA do líder (RPC só responde a admin)
  const { data: accounts = [] } = useChurchAccounts(open)

  function handleChange(field: keyof MinistryFormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      if (editing) {
        await updateMinistry.mutateAsync({
          id: editing.id,
          church_id: churchId,
          name: form.name.trim(),
          slug: slugify(form.name.trim()),
          description: form.description.trim() || undefined,
          leaderPersonId: form.leaderPersonId || null,
          leaderUserId: form.leaderUserId || null,
        })
      } else {
        await createMinistry.mutateAsync({
          church_id: churchId,
          name: form.name.trim(),
          slug: slugify(form.name.trim()),
          description: form.description.trim() || undefined,
          leaderPersonId: form.leaderPersonId || undefined,
          leaderUserId: form.leaderUserId || null,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Editar Ministério' : 'Novo Ministério'}>
      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Nome *</label>
          <Input
            value={form.name}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder="Ex: Louvor, Infantil..."
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">Descrição</label>
          <Input
            value={form.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Breve descrição do ministério"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">Líder (pessoa)</label>
          <PersonSelect
            value={form.leaderPersonId || null}
            onChange={(id) => handleChange('leaderPersonId', id ?? '')}
            placeholder="Buscar líder pelo nome..."
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-500 mb-1">Conta de acesso do líder</label>
          <select
            value={form.leaderUserId}
            onChange={(e) => handleChange('leaderUserId', e.target.value)}
            className="w-full rounded-xl border border-border-default px-3 py-2 text-sm bg-white focus:outline-none focus:border-primary"
            data-testid="leader-account-select"
          >
            <option value="">Sem conta vinculada</option>
            {accounts.map((a) => (
              <option key={a.user_id} value={a.user_id}>{a.name} — {a.email} ({a.role})</option>
            ))}
          </select>
          <p className="text-xs text-text-tertiary mt-1">
            A conta vinculada poderá incluir e remover pessoas somente deste ministério. Pessoa (líder) e conta (login) são coisas distintas.
          </p>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || !form.name.trim()}>
            {submitting ? 'Salvando...' : editing ? 'Salvar' : 'Criar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── MembersModal — PESSOAS DO MINISTÉRIO (people ⟷ ministry_members ⟷ ministries) ──
// Pesquisa pessoas JÁ cadastradas na igreja, inclui e remove o vínculo em
// ministry_members. Nunca cria/altera/remove `volunteers` (voluntariado é outra
// estrutura). Autorização real está no banco (can_manage_ministry nas RPCs).

interface MembersModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  ministry: MinistryWithLeader
  /** admin/admin_departments ou líder com conta vinculada a este ministério */
  canManageMembers: boolean
}

function MembersModal({ open, onClose, churchId, ministry, canManageMembers }: MembersModalProps) {
  const { data: members = [], isLoading, isError } = useMinistryMembers(ministry.id)
  const addMember    = useAddMinistryMember()
  const removeMember = useRemoveMinistryMember()
  const [personId, setPersonId] = useState<string | null>(null)
  const [selectKey, setSelectKey] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const memberIds = members.map((m) => m.person_id)
  const alreadyIn = personId ? memberIds.includes(personId) : false

  async function handleAdd() {
    if (!personId || alreadyIn) return
    setError(null)
    try {
      await addMember.mutateAsync({ churchId, ministryId: ministry.id, personId })
      setPersonId(null)
      setSelectKey((k) => k + 1)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao incluir'
      setError(msg.includes('FORBIDDEN') ? 'Você não tem permissão para gerir as pessoas deste ministério.' : msg)
    }
  }

  async function handleRemove(pid: string) {
    setError(null)
    try {
      await removeMember.mutateAsync({ churchId, ministryId: ministry.id, personId: pid })
      setRemoving(null)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro ao remover'
      setError(msg.includes('FORBIDDEN') ? 'Você não tem permissão para gerir as pessoas deste ministério.' : msg)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Pessoas do Ministério — ${ministry.name}`}>
      <div className="space-y-4" data-testid="pessoas-ministerio">
        {canManageMembers ? (
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <PersonSelect
                key={selectKey}
                label="Pesquisar pessoa"
                value={personId}
                onChange={(id) => setPersonId(id)}
                excludeIds={memberIds}
                placeholder="Nome (não diferencia acento, ç ou maiúsculas)"
              />
            </div>
            <Button
              type="button"
              onClick={() => void handleAdd()}
              disabled={!personId || alreadyIn || addMember.isPending}
              data-testid="btn-incluir"
            >
              {addMember.isPending ? 'Incluindo...' : 'Incluir'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-text-tertiary" data-testid="somente-leitura">
            Somente o líder com conta vinculada ou um administrador pode incluir/remover pessoas.
          </p>
        )}
        {alreadyIn && <p className="text-xs text-amber-600">Esta pessoa já faz parte do ministério.</p>}
        {error && <p className="text-sm text-red-500" data-testid="erro-pessoas">{error}</p>}

        <div className="border-t border-border-default pt-3">
          <p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2" data-testid="pessoas-total">
            {members.length} pessoa{members.length !== 1 ? 's' : ''} do ministério
          </p>
          {isLoading ? (
            <div className="flex justify-center py-6"><Spinner size="md" /></div>
          ) : isError ? (
            <p className="text-sm text-red-500 py-4 text-center">Não foi possível carregar as pessoas.</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-text-tertiary py-4 text-center">Nenhuma pessoa neste ministério ainda.</p>
          ) : (
            <ul className="divide-y divide-border-default max-h-80 overflow-y-auto">
              {members.map((m) => (
                <li key={m.person_id} className="flex items-center justify-between gap-3 py-2" data-testid="pessoa-item">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{m.name}</p>
                    {m.phone && <p className="text-xs text-text-tertiary">{m.phone}</p>}
                  </div>
                  {canManageMembers && (
                    removing === m.person_id ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-text-secondary">Remover?</span>
                        <button type="button" onClick={() => void handleRemove(m.person_id)} disabled={removeMember.isPending}
                          className="text-xs text-red-500 hover:text-red-700 font-semibold disabled:opacity-50" data-testid="btn-confirmar-remover">
                          {removeMember.isPending ? 'Removendo...' : 'Sim'}
                        </button>
                        <button type="button" onClick={() => setRemoving(null)} className="text-xs text-text-secondary hover:text-text-primary">Não</button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setRemoving(m.person_id)}
                        className="shrink-0 text-xs text-red-400 hover:text-red-600 font-medium"
                        data-testid="btn-remover"
                      >
                        Remover
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <Button type="button" onClick={onClose}>Fechar</Button>
        </div>
      </div>
    </Modal>
  )
}


// ── ReferralCard ───────────────────────────────────────────────────────────────

function ReferralCard({ referral }: { referral: MinistryReferral }) {
  const navigate = useNavigate()
  const isUrgent = referral.dias_esperando >= 7

  return (
    <div
      onClick={() => navigate(`/pessoas/${referral.person_id}/atendimento`)}
      className="bg-bg-surface rounded-2xl border border-border-default shadow-sm p-4 flex flex-col gap-2.5 hover:shadow-md transition-shadow cursor-pointer"
      style={isUrgent ? { borderLeftWidth: 3, borderLeftColor: 'var(--color-warning, #f59e0b)' } : {}}
    >
      {/* Nome + dias */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium text-text-primary truncate">{referral.person_name}</p>
          {referral.person_phone && (
            <p className="text-xs text-text-tertiary mt-0.5">{referral.person_phone}</p>
          )}
        </div>
        <span
          className={`shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full ${
            isUrgent
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : 'bg-bg-hover text-text-secondary'
          }`}
        >
          {referral.dias_esperando === 0 ? 'hoje' : `${referral.dias_esperando}d`}
        </span>
      </div>

      {/* Ministério + etapa */}
      <div className="flex flex-wrap gap-1.5">
        <span className="text-xs px-2 py-0.5 rounded-md bg-bg-hover text-text-secondary font-medium">
          {referral.ministry_name}
        </span>
        {referral.etapa_nome && (
          <span className="text-xs px-2 py-0.5 rounded-md bg-bg-hover text-text-secondary">
            {referral.etapa_nome}
          </span>
        )}
      </div>

      {/* Encaminhador */}
      <p className="text-xs text-text-tertiary">
        Encaminhado por <span className="text-text-secondary">{referral.encaminhado_por}</span>
      </p>

      {/* Anotação */}
      {referral.anotacao && (
        <p className="text-xs text-text-secondary bg-bg-hover rounded-lg px-3 py-2 line-clamp-2 italic">
          "{referral.anotacao}"
        </p>
      )}
    </div>
  )
}

// ── ReferralQueue ──────────────────────────────────────────────────────────────

interface ReferralQueueProps {
  isAdmin: boolean
  ministries: MinistryWithLeader[] | undefined
}

function ReferralQueue({ isAdmin, ministries }: ReferralQueueProps) {
  const [selectedMinistryId, setSelectedMinistryId] = useState<string | null>(null)

  const ministryIdParam = isAdmin ? selectedMinistryId : undefined
  const { data: referrals, isLoading, isError } = useMinistryReferrals(ministryIdParam)

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-bg-surface rounded-2xl border border-border-default p-4 space-y-3">
            <Skeleton height={16} width="70%" />
            <Skeleton height={12} width="40%" />
            <Skeleton height={12} width="55%" />
          </div>
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <ErrorState message="Não foi possível carregar os encaminhamentos." />
    )
  }

  return (
    <div className="space-y-4">
      {/* Seletor de ministério — apenas admin */}
      {isAdmin && ministries && ministries.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedMinistryId(null)}
            className={`text-sm px-3 py-1.5 rounded-xl font-medium transition-colors ${
              selectedMinistryId === null
                ? 'bg-text-primary text-white'
                : 'bg-bg-hover text-text-secondary hover:text-text-primary'
            }`}
          >
            Todos
          </button>
          {ministries.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMinistryId(m.id === selectedMinistryId ? null : m.id)}
              className={`text-sm px-3 py-1.5 rounded-xl font-medium transition-colors ${
                selectedMinistryId === m.id
                  ? 'bg-text-primary text-white'
                  : 'bg-bg-hover text-text-secondary hover:text-text-primary'
              }`}
            >
              {m.name}
            </button>
          ))}
        </div>
      )}

      {/* Lista */}
      {(referrals ?? []).length === 0 ? (
        <EmptyState
          title="Nenhum encaminhamento pendente"
          description="Quando alguém for encaminhado para um ministério, aparecerá aqui."
        />
      ) : (
        <>
          <p className="text-sm text-text-secondary">
            {(referrals ?? []).length} encaminhamento{(referrals ?? []).length !== 1 ? 's' : ''} pendente{(referrals ?? []).length !== 1 ? 's' : ''}
            {(referrals ?? []).some(r => r.dias_esperando >= 7) && (
              <span className="ml-2 text-amber-600 font-medium">
                · {(referrals ?? []).filter(r => r.dias_esperando >= 7).length} com mais de 7 dias
              </span>
            )}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(referrals ?? []).map((r) => (
              <ReferralCard key={r.journey_id} referral={r} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Ministerios (página principal) ────────────────────────────────────────────

export default function Ministerios() {
  const { churchId, role } = useAuth()
  const isAdmin = role === 'admin' || role === 'admin_departments'

  // Líder de ministério também vê os cards (para gerir membros); admin gerencia tudo
  const [activeTab, setActiveTab] = useState<PageTab>('ministerios')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<MinistryWithLeader | null>(null)
  const [deletingMinistry, setDeletingMinistry] = useState<MinistryWithLeader | null>(null)
  const [membersMinistry, setMembersMinistry] = useState<MinistryWithLeader | null>(null)
  const deleteMinistry = useDeleteMinistry()

  const { data: ministries, isLoading, isError, refetch } = useMinisterios(churchId ?? '')
  // Escopo real vem do banco (can_manage_ministry): admin → todos; líder com conta vinculada → os seus.
  const { data: managed } = useMyManagedMinistries(!!churchId)
  const canManageMembersOf = (ministryId: string) => isAdmin || (managed?.has(ministryId) ?? false)

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  function handleEdit(m: MinistryWithLeader) {
    setEditing(m)
    setModalOpen(true)
  }

  function handleNew() {
    setEditing(null)
    setModalOpen(true)
  }

  async function handleConfirmDelete() {
    if (!deletingMinistry || !churchId) return
    await deleteMinistry.mutateAsync({ id: deletingMinistry.id, churchId })
    setDeletingMinistry(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-text-primary">Ministérios</h1>
          <p className="text-sm text-text-secondary mt-1">
            {ministries ? `${ministries.length} ministério${ministries.length !== 1 ? 's' : ''}` : 'Carregando...'}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={handleNew}>+ Novo Ministério</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-hover)' }}>
        {(
          <button
            onClick={() => setActiveTab('ministerios')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
              activeTab === 'ministerios'
                ? 'bg-bg-surface shadow-sm text-text-primary'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Ministérios
          </button>
        )}
        <button
          onClick={() => setActiveTab('fila')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
            activeTab === 'fila'
              ? 'bg-bg-surface shadow-sm text-text-primary'
              : 'text-text-secondary hover:text-text-primary'
          }`}
        >
          Fila de Encaminhamentos
        </button>
      </div>

      {/* Conteúdo — aba Ministérios */}
      {activeTab === 'ministerios' && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Spinner size="lg" />
            </div>
          ) : isError ? (
            <ErrorState message="Não foi possível carregar os ministérios." onRetry={() => void refetch()} />
          ) : (ministries ?? []).length === 0 ? (
            <EmptyState
              title="Nenhum ministério cadastrado"
              description="Crie o primeiro ministério clicando em 'Novo Ministério'."
              action={<Button onClick={handleNew}>+ Novo Ministério</Button>}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {(ministries ?? []).map((ministry) => (
                <MinistryCard
                  key={ministry.id}
                  ministry={ministry}
                  onEdit={handleEdit}
                  onDelete={setDeletingMinistry}
                  onMembers={setMembersMinistry}
                  canManage={isAdmin}
                  canManageMembers={canManageMembersOf(ministry.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal de pessoas do ministério (ministry_members) */}
      {membersMinistry && (
        <MembersModal
          open
          onClose={() => setMembersMinistry(null)}
          churchId={churchId}
          ministry={membersMinistry}
          canManageMembers={canManageMembersOf(membersMinistry.id)}
        />
      )}

      {/* Conteúdo — aba Fila */}
      {activeTab === 'fila' && (
        <ReferralQueue isAdmin={isAdmin} ministries={ministries} />
      )}

      {/* Modal de criação/edição */}
      {modalOpen && (
        <MinistryModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setEditing(null) }}
          churchId={churchId}
          editing={editing}
        />
      )}

      {/* Modal de exclusão */}
      {deletingMinistry && (
        <ModalPortal>
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeletingMinistry(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h3 className="font-semibold text-text-primary mb-1">Excluir ministério?</h3>
            <p className="text-sm text-gray-500 mb-1">
              Você está prestes a excluir <span className="font-semibold text-text-primary">{deletingMinistry.name}</span>.
            </p>
            <p className="text-xs text-red-500 mb-4">Esta ação é irreversível e removerá o ministério permanentemente.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeletingMinistry(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-black/10 text-sm font-medium hover:bg-bg-hover"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleConfirmDelete()}
                disabled={deleteMinistry.isPending}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-50"
              >
                {deleteMinistry.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </div>
  )
}
