import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { usePlan } from '@/hooks/usePlan'
import Badge from '@/components/ui/Badge'

const ROLE_LABELS: Record<string, string> = {
  admin:      'Administrador',
  pastor:     'Pastor',
  supervisor: 'Supervisor',
  leader:     'Líder',
  secretary:  'Secretário',
  treasurer:  'Tesoureiro',
  member:     'Membro',
}

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

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Usuários</h1>
        <p className="text-sm text-gray-500 mt-1">
          Membros da equipe com acesso ao sistema
        </p>
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
      </div>

      <div className="space-y-2">
        {isLoading && (
          <p className="text-sm text-gray-400">Carregando...</p>
        )}
        {users.map(u => {
          const profile = profileMap[u.user_id]
          const displayName = profile?.display_name ?? profile?.name ?? 'Usuário'
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
                  <p className="text-sm font-medium text-gray-900">{displayName}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(u.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
              <Badge
                label={ROLE_LABELS[u.role] ?? u.role}
                variant="gray"
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
