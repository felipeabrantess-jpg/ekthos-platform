import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface BirthdayContact {
  id: string
  person_id: string
  contacted_by: string
  contacted_by_name: string
  contacted_at: string
}

// birthday_contacts ainda não está nos tipos gerados (database.types.ts).
// Usar (supabase as any) é o padrão do projeto para tabelas novas — ver usePeople.ts.

/** Carrega todos os contatos de aniversário de uma igreja em um mês ('YYYY-MM'). */
export function useBirthdayContacts(churchId: string, monthRef: string) {
  return useQuery({
    queryKey: ['birthday-contacts', churchId, monthRef],
    queryFn: async (): Promise<BirthdayContact[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('birthday_contacts')
        .select('id, person_id, contacted_by, contacted_by_name, contacted_at')
        .eq('church_id', churchId)
        .eq('month_ref', monthRef)
      if (error) throw new Error((error as { message: string }).message)
      return ((data as unknown[]) ?? []) as BirthdayContact[]
    },
    enabled: Boolean(churchId),
  })
}

interface ToggleInput {
  contactId: string | null  // null = marcar, string = desmarcar
  personId: string
  churchId: string
  monthRef: string
}

/**
 * Toggle de contato de aniversário.
 * contactId !== null → DELETE (desmarcar).
 * contactId === null → INSERT com contacted_by/name do usuário autenticado.
 */
export function useToggleBirthdayContact() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ contactId, personId, churchId, monthRef }: ToggleInput) => {
      if (contactId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('birthday_contacts')
          .delete()
          .eq('id', contactId)
        if (error) throw new Error((error as { message: string }).message)
      } else {
        const { data: { user } } = await supabase.auth.getUser()
        const name =
          (user?.user_metadata?.full_name as string | undefined) ||
          (user?.user_metadata?.name as string | undefined) ||
          user?.email?.split('@')[0] ||
          'operador'
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any)
          .from('birthday_contacts')
          .insert({
            person_id:         personId,
            church_id:         churchId,
            contacted_by:      user?.id,
            contacted_by_name: name,
            month_ref:         monthRef,
          })
        if (error) throw new Error((error as { message: string }).message)
      }
    },
    onSuccess: (_, { churchId, monthRef }) => {
      void queryClient.invalidateQueries({ queryKey: ['birthday-contacts', churchId, monthRef] })
    },
  })
}
