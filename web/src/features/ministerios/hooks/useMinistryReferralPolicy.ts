// ============================================================
// Item 15 (ata IGV) — encaminhamento para ministérios
//   leitura : get_ministry_referral_policy() → { policy, can_refer } do usuário logado
//   escrita : set_ministry_referral_policy (só admin/admin_departments)
//   recusa  : ministry_referral_decline (líder/admin do ministério de destino, motivo obrigatório)
// Front publicado antes da migration: a leitura falha e cai no comportamento atual (pode encaminhar).
// ============================================================
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any

export type ReferralPolicy = 'equipe_atendimento' | 'lideres_e_admins' | 'somente_lideres'

export const REFERRAL_POLICY_OPTIONS: { value: ReferralPolicy; label: string; hint: string }[] = [
  { value: 'equipe_atendimento', label: 'Toda a equipe de atendimento', hint: 'Quem registra atendimento também pode encaminhar (como funciona hoje).' },
  { value: 'lideres_e_admins',   label: 'Líderes de ministério e administração', hint: 'Somente contas vinculadas como líder de um ministério e administradores.' },
  { value: 'somente_lideres',    label: 'Somente líderes de ministério', hint: 'Somente contas vinculadas como líder de um ministério.' },
]

export function useMinistryReferralPolicy(enabled = true) {
  return useQuery({
    queryKey: ['ministry-referral-policy'],
    queryFn: async (): Promise<{ policy: ReferralPolicy; can_refer: boolean }> => {
      const { data, error } = await sb.rpc('get_ministry_referral_policy')
      if (error || !data) return { policy: 'equipe_atendimento', can_refer: true }
      return data as { policy: ReferralPolicy; can_refer: boolean }
    },
    enabled,
    staleTime: 60_000,
  })
}

export function useSaveMinistryReferralPolicy() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (policy: ReferralPolicy) => {
      const { error } = await sb.rpc('set_ministry_referral_policy', { p_policy: policy })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['ministry-referral-policy'] }) },
  })
}

export function useDeclineMinistryReferral() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ journeyId, reason }: { journeyId: string; reason: string }) => {
      const { error } = await sb.rpc('ministry_referral_decline', { p_journey_id: journeyId, p_reason: reason })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, { journeyId }) => {
      qc.setQueriesData<{ journey_id: string }[]>({ queryKey: ['ministry-referrals'] }, (old) =>
        Array.isArray(old) ? old.filter((r) => r.journey_id !== journeyId) : old)
      void qc.invalidateQueries({ queryKey: ['ministry-referrals'] })
      void qc.invalidateQueries({ queryKey: ['person-journey-status'] })
    },
  })
}

export function declineErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('REASON_REQUIRED')) return 'Informe o motivo da recusa.'
  if (msg.includes('FORBIDDEN')) return 'Você não tem permissão para recusar encaminhamentos deste ministério.'
  if (msg.includes('NO_PENDING_REFERRAL')) return 'Este encaminhamento já foi tratado.'
  return 'Não foi possível recusar. Tente novamente.'
}
