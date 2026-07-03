import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlan } from '@/hooks/usePlan'
import { useInviteUser } from '@/hooks/useInviteUser'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'

const ROLE_LABELS: Record<string, string> = {
  admin:             'Administrador',
  admin_departments: 'Gestor de Departamentos',
  pastor_celulas:    'Pastor de Células',
  supervisor:        'Supervisor',
  cell_leader:       'Líder de Célula',
  secretary:         'Secretária',
  treasurer:         'Tesoureiro',
  volunteer:         'Voluntário',
  member:            'Membro',
}

const INVITE_ROLE_OPTIONS = [
  { value: 'admin',             label: 'Administrador' },
  { value: 'admin_departments', label: 'Gestor de Departamentos' },
  { value: 'secretary',         label: 'Secretária' },
  { value: 'treasurer',         label: 'Tesoureiro' },
  { value: 'cell_leader',       label: 'Líder de Célula' },
  { value: 'volunteer',         label: 'Voluntário' },
]

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
      <div
        className="bg-brand-600 h-1.5 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

interface UserRoleRow {
  user_id: string
  role: string
  created_at: string
}

interface ProfileRow {
  user_id: string
  name: string | null
  display_name: string | null
  avatar_url: string | null
}

export function Users() {
  const { maxUsers } = usePlan()
  const queryClient = useQueryClient()
  const { inviteUser, isLoading: inviting } = useInviteUser()

  // Current user session
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isCurrentUserAdmin, setIsCurrentUserAdmin] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUserId(session?.user.id ?? null)
      setIsCurrentUserAdmin(session?.user.app_metadata?.role === 'admin')
    })
  }, [])

  // Invite modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('admin')
  const [inviteName, setInviteName] = useState('')
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  // Change role modal state
  const [changeRoleOpen, setChangeRoleOpen] = useState(false)
  const [actionUser, setActionUser] = useState<UserRoleRow | null>(null)
  const [newRole, setNewRole] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; message: string } | null>(null)

  // Remove modal state
  const [removeOpen, setRemoveOpen] = useState(false)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['church_users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role, created_at')
        .order('created_at')
      if (error) throw error
      return (data ?? []) as UserRoleRow[]
    },
  })

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles_for_users', users.map(u => u.user_id)],
    enabled: users.length > 0,
    queryFn: async () => {
      const userIds = users.map(u => u.user_id)
      const { data, error } = await supabase
        .from('profiles')
        .select('user_id, name, display_name, avatar_url')
        .in('user_id', userIds)
      if (error) throw error
      return (data ?? []) as ProfileRow[]
    },
  })

  const profileMap = Object.fromEntries(profiles.map(p => [p.user_id, p]))
  const usedSeats = users.length

  function handleCloseModal() {
    setModalOpen(false)
    setInviteEmail('')
    setInviteRole('admin')
    setInviteName('')
    setFeedback(null)
  }

  function handleCloseChangeRole() {
    setChangeRoleOpen(false)
    setActionUser(null)
    setNewRole('')
    setActionFeedback(null)
  }

  function handleCloseRemove() {
    setRemoveOpen(false)
    setActionUser(null)
    setActionFeedback(null)
  }

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setFeedback(null)
    const result = await inviteUser({
      email: inviteEmail.trim(),
      role: inviteRole,
      name: inviteName.trim() || undefined,
    })
    setFeedback(result)
    if (result.ok) {
      void queryClient.invalidateQueries({ queryKey: ['church_users'] })
      setTimeout(handleCloseModal, 1800)
    }
  }

  async function handleChangeRole() {
    if (!actionUser || !newRole) return
    setActionFeedback(null)
    setActionLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/church-invite-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({ action: 'change_role', user_id: actionUser.user_id, role: newRole }),
        },
      )
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setActionFeedback({ ok: false, message: data.error ?? 'Erro ao trocar papel' })
      } else {
        void queryClient.invalidateQueries({ queryKey: ['church_users'] })
        setTimeout(handleCloseChangeRole, 800)
      }
    } catch {
      setActionFeedback({ ok: false, message: 'Erro de conexão. Tente novamente.' })
    } finally {
      setActionLoading(false)
    }
  }

  async function handleRemoveUser() {
    if (!actionUser) return
    setActionFeedback(null)
    setActionLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/church-invite-user`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({ action: 'remove', user_id: actionUser.user_id }),
        },
      )
      const data = (await res.json()) as { error?: string }
      if (!res.ok) {
        setActionFeedback({ ok: false, message: data.error ?? 'Erro ao remover acesso' })
      } else {
        void queryClient.invalidateQueries({ queryKey: ['church_users'] })
        setTimeout(handleCloseRemove, 800)
      }
    } catch {
      setActionFeedback({ ok: false, message: 'Erro de conexão. Tente novamente.' })
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Usuários</h1>
          <p className="text-sm text-gray-500 mt-1">
            Membros da equipe com acesso ao sistema
          </p>
        </div>
        {isCurrentUserAdmin && (
          <Button
            variant="primary"
            size="sm"
            onClick={() => setModalOpen(true)}
            disabled={usedSeats >= maxUsers}
          >
            + Convidar usuário
          </Button>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Assentos usados
        </p>
        <p className="text-2xl font-bold text-gray-900">
          {usedSeats}
          <span className="text-lg font-normal text-gray-400">/{maxUsers}</span>
        </p>
        <ProgressBar value={(usedSeats / maxUsers) * 100} />
        {usedSeats >= maxUsers && (
          <p className="text-xs text-amber-600 mt-2">
            Limite atingido. Faça upgrade do plano para adicionar mais usuários.
          </p>
        )}
      </div>

      <div className="space-y-2">
        {isLoading && (
          <p className="text-sm text-gray-400">Carregando...</p>
        )}
        {users.map(u => {
          const profile = profileMap[u.user_id]
          const displayName = profile?.display_name ?? profile?.name ?? 'Usuário'
          const isSelf = u.user_id === currentUserId
          return (
            <div
              key={u.user_id}
              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 bg-white"
            >
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-brand-100 flex items-center justify-center shrink-0">
                  <span className="text-xs font-semibold text-brand-700">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {displayName}
                    {isSelf && <span className="ml-1.5 text-xs text-gray-400">(você)</span>}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(u.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Badge
                  label={ROLE_LABELS[u.role] ?? u.role}
                  variant="gray"
                />
                {isCurrentUserAdmin && !isSelf && (
                  <div className="flex items-center gap-1">
                    <button
                      className="text-xs text-gray-400 hover:text-brand-600 transition-colors px-1 py-0.5 rounded"
                      onClick={() => {
                        setActionUser(u)
                        setNewRole(u.role)
                        setChangeRoleOpen(true)
                      }}
                    >
                      Trocar papel
                    </button>
                    <span className="text-gray-200 select-none">|</span>
                    <button
                      className="text-xs text-red-400 hover:text-red-600 transition-colors px-1 py-0.5 rounded"
                      onClick={() => {
                        setActionUser(u)
                        setRemoveOpen(true)
                      }}
                    >
                      Remover
                    </button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal de convite */}
      <Modal open={modalOpen} onClose={handleCloseModal} title="Convidar usuário" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">E-mail *</label>
            <Input
              type="email"
              placeholder="pastor@minhigreja.com"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nome (opcional)</label>
            <Input
              type="text"
              placeholder="Nome completo"
              value={inviteName}
              onChange={e => setInviteName(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Perfil de acesso *</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              value={inviteRole}
              onChange={e => setInviteRole(e.target.value)}
            >
              {INVITE_ROLE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {feedback && (
            <p className={`text-sm rounded-lg px-3 py-2 ${
              feedback.ok
                ? 'text-green-700 bg-green-50 border border-green-200'
                : 'text-red-600 bg-red-50 border border-red-200'
            }`}>
              {feedback.message}
            </p>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="secondary" className="flex-1" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              disabled={!inviteEmail.trim() || inviting || feedback?.ok}
              loading={inviting}
              onClick={() => void handleInvite()}
            >
              Enviar convite
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de trocar papel */}
      <Modal
        open={changeRoleOpen}
        onClose={handleCloseChangeRole}
        title="Trocar papel"
        size="sm"
      >
        {actionUser && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Alterar o papel de <strong>{profileMap[actionUser.user_id]?.display_name ?? profileMap[actionUser.user_id]?.name ?? 'Usuário'}</strong>:
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Novo perfil de acesso</label>
              <select
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                value={newRole}
                onChange={e => setNewRole(e.target.value)}
              >
                {INVITE_ROLE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {actionFeedback && (
              <p className={`text-sm rounded-lg px-3 py-2 ${
                actionFeedback.ok
                  ? 'text-green-700 bg-green-50 border border-green-200'
                  : 'text-red-600 bg-red-50 border border-red-200'
              }`}>
                {actionFeedback.message}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={handleCloseChangeRole}>
                Cancelar
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                disabled={newRole === actionUser.role || actionLoading}
                loading={actionLoading}
                onClick={() => void handleChangeRole()}
              >
                Confirmar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Modal de remover acesso */}
      <Modal
        open={removeOpen}
        onClose={handleCloseRemove}
        title="Remover acesso"
        size="sm"
      >
        {actionUser && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Tem certeza que deseja remover o acesso de{' '}
              <strong>{profileMap[actionUser.user_id]?.display_name ?? profileMap[actionUser.user_id]?.name ?? 'Usuário'}</strong>?
              <br />
              <span className="text-gray-400 text-xs mt-1 block">
                O usuário perderá acesso imediatamente e precisará ser convidado novamente para retornar.
              </span>
            </p>

            {actionFeedback && (
              <p className="text-sm rounded-lg px-3 py-2 text-red-600 bg-red-50 border border-red-200">
                {actionFeedback.message}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={handleCloseRemove}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={actionLoading}
                loading={actionLoading}
                onClick={() => void handleRemoveUser()}
              >
                Remover acesso
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
