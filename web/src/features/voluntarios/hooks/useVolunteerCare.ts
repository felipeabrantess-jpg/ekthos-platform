import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type CareStatus = 'servindo' | 'afastado' | 'precisa_cuidado'
export type Satisfaction = 'satisfeito' | 'neutro' | 'insatisfeito'
export type CareType = 'reuniao' | 'conversa' | 'visita' | 'ligacao' | 'outro'

export interface CareLog {
  id: string
  volunteer_id: string
  church_id: string
  care_date: string
  care_type: CareType
  notes: string | null
  created_by: string | null
  created_by_name: string | null
  created_at: string
}

export const CARE_STATUS_LABEL: Record<CareStatus, string> = {
  servindo:       'Servindo',
  afastado:       'Afastado',
  precisa_cuidado: 'Precisa Cuidado',
}

export const SATISFACTION_LABEL: Record<Satisfaction, string> = {
  satisfeito:  'Satisfeito',
  neutro:      'Neutro',
  insatisfeito: 'Insatisfeito',
}

export const CARE_TYPE_LABEL: Record<CareType, string> = {
  reuniao:  'Reunião',
  conversa: 'Conversa',
  visita:   'Visita',
  ligacao:  'Ligação',
  outro:    'Outro',
}

// ── Hook: contagens por status (Painel) ───────────────────────────────────────

export interface CareStats {
  total: number
  servindo: number
  afastado: number
  precisa_cuidado: number
}

export function useVolunteerCareStats(churchId: string) {
  return useQuery({
    queryKey: ['volunteer-care-stats', churchId],
    queryFn: async (): Promise<CareStats> => {
      const { data, error } = await (supabase as any)
        .from('volunteers')
        .select('care_status')
        .eq('church_id', churchId)
        .eq('is_active', true)

      if (error) throw new Error((error as { message: string }).message)

      const rows = (data as { care_status: string }[]) ?? []
      return {
        total:           rows.length,
        servindo:        rows.filter(r => r.care_status === 'servindo').length,
        afastado:        rows.filter(r => r.care_status === 'afastado').length,
        precisa_cuidado: rows.filter(r => r.care_status === 'precisa_cuidado').length,
      }
    },
    enabled: Boolean(churchId),
  })
}

// ── Hook: histórico de cuidado de um voluntário ───────────────────────────────

export function useCareLogs(volunteerId: string | null) {
  return useQuery({
    queryKey: ['volunteer-care-logs', volunteerId],
    queryFn: async (): Promise<CareLog[]> => {
      const { data, error } = await (supabase as any)
        .from('volunteer_care_logs')
        .select('*')
        .eq('volunteer_id', volunteerId!)
        .order('care_date', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw new Error((error as { message: string }).message)
      return ((data as unknown[]) ?? []) as CareLog[]
    },
    enabled: Boolean(volunteerId),
  })
}

// ── Hook: registrar novo cuidado ──────────────────────────────────────────────

interface AddCareLogInput {
  volunteer_id: string
  church_id: string
  care_date: string
  care_type: CareType
  notes: string
}

export function useAddCareLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AddCareLogInput) => {
      const { data: { user } } = await supabase.auth.getUser()
      const name =
        (user?.user_metadata?.full_name as string | undefined) ||
        (user?.user_metadata?.name as string | undefined) ||
        user?.email?.split('@')[0] ||
        'operador'

      const { error } = await (supabase as any)
        .from('volunteer_care_logs')
        .insert({
          volunteer_id:    input.volunteer_id,
          church_id:       input.church_id,
          care_date:       input.care_date,
          care_type:       input.care_type,
          notes:           input.notes || null,
          created_by:      user?.id,
          created_by_name: name,
        })

      if (error) throw new Error((error as { message: string }).message)
    },
    onSuccess: (_, { volunteer_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['volunteer-care-logs', volunteer_id] })
    },
  })
}

// ── Hook: atualizar campos de cuidado no voluntário ───────────────────────────

interface UpdateCareFieldsInput {
  id: string
  church_id: string
  care_status?: CareStatus
  satisfaction?: Satisfaction | null
  care_notes?: string | null
  care_responsible_id?: string | null
}

export function useUpdateCareFields() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id, ...fields }: UpdateCareFieldsInput) => {
      const { error } = await (supabase as any)
        .from('volunteers')
        .update(fields)
        .eq('id', id)
        .eq('church_id', church_id)

      if (error) throw new Error((error as { message: string }).message)
    },
    onSuccess: (_, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['voluntarios', church_id] })
      void queryClient.invalidateQueries({ queryKey: ['volunteer-care-stats', church_id] })
    },
  })
}
