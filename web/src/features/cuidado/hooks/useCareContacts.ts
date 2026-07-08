import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface CareContact {
  id: string
  person_id: string
  contacted: boolean
  notes: string | null
  contacted_by: string | null
  contacted_by_name: string
  contacted_at: string
  next_followup_at:      string | null
  next_followup_note:    string | null
  next_followup_by:      string | null
  next_followup_by_name: string | null
}

export function useCareContacts(churchId: string) {
  return useQuery({
    queryKey: ['care-contacts', churchId],
    queryFn: async (): Promise<CareContact[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('care_contacts')
        .select('id, person_id, contacted, notes, contacted_by, contacted_by_name, contacted_at, next_followup_at, next_followup_note, next_followup_by, next_followup_by_name')
        .eq('church_id', churchId)
      if (error) throw new Error((error as { message: string }).message)
      return ((data as unknown[]) ?? []) as CareContact[]
    },
    enabled: Boolean(churchId),
  })
}

interface UpsertCareInput {
  personId:         string
  churchId:         string
  contacted:        boolean
  notes:            string
  nextFollowupAt:   string | null
  nextFollowupNote: string | null
}

export function useUpsertCareContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ personId, churchId, contacted, notes, nextFollowupAt, nextFollowupNote }: UpsertCareInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      const name =
        (user?.user_metadata?.full_name as string | undefined) ??
        (user?.user_metadata?.name as string | undefined) ??
        user?.email?.split('@')[0] ??
        'operador'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase as any)
        .from('care_contacts')
        .upsert(
          {
            person_id:             personId,
            church_id:             churchId,
            contacted,
            notes:                 notes || null,
            contacted_by:          user?.id ?? null,
            contacted_by_name:     name,
            contacted_at:          new Date().toISOString(),
            next_followup_at:      nextFollowupAt,
            next_followup_note:    nextFollowupNote,
            next_followup_by:      nextFollowupAt ? (user?.id ?? null) : null,
            next_followup_by_name: nextFollowupAt ? name : null,
          },
          { onConflict: 'person_id,church_id' },
        )
      if (error) throw new Error((error as { message: string }).message)
    },
    onSuccess: (_, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['care-contacts', churchId] })
    },
  })
}
