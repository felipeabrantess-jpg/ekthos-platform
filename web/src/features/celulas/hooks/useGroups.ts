import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Group, CellMember, CellMeeting } from '@/lib/types/joins'

// ──────────────────────────────────────────────────────────────────────
// Grupos / Células
// ──────────────────────────────────────────────────────────────────────

export function useGroups(churchId: string) {
  return useQuery({
    queryKey: ['groups', churchId],
    queryFn: async (): Promise<Group[]> => {
      const { data, error } = await supabase
        .from('groups')
        .select('*')
        .eq('church_id', churchId)
        .order('name', { ascending: true })

      if (error) throw new Error(error.message)
      return (data ?? []) as Group[]
    },
    enabled: Boolean(churchId),
  })
}

interface CreateGroupInput {
  church_id: string
  name: string
  description?: string
  leader_id?: string
  co_leader_id?: string
  meeting_day?: string
  meeting_time?: string
  location?: string
  notes?: string
}

export function useCreateGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateGroupInput) => {
      const { data, error } = await supabase
        .from('groups')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ ...input, status: 'active' } as any)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['groups', church_id] })
    },
  })
}

interface UpdateGroupInput {
  id: string
  church_id: string
  name?: string
  description?: string
  leader_id?: string | null
  co_leader_id?: string | null
  meeting_day?: string
  meeting_time?: string
  location?: string
  notes?: string
  status?: string
}

export function useUpdateGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: UpdateGroupInput) => {
      const { data, error } = await supabase
        .from('groups')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('id', id)
        .eq('church_id', church_id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['groups', church_id] })
    },
  })
}

// ──────────────────────────────────────────────────────────────────────
// Membros da célula
// ──────────────────────────────────────────────────────────────────────

export function useCellMembers(groupId: string) {
  return useQuery({
    queryKey: ['cell_members', groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cell_members')
        .select('*, people ( id, name, phone, email )')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true })

      if (error) throw new Error(error.message)
      return data ?? []
    },
    enabled: Boolean(groupId),
  })
}

interface AddCellMemberInput {
  church_id: string
  group_id: string
  person_id: string
  role?: CellMember['role']
}

export function useAddCellMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: AddCellMemberInput) => {
      const { data, error } = await supabase
        .from('cell_members')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ ...input, role: input.role ?? 'participante' } as any)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { group_id, church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['cell_members', group_id] })
      void queryClient.invalidateQueries({ queryKey: ['groups', church_id] })
    },
  })
}

export function useRemoveCellMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, group_id }: { id: string; group_id: string }) => {
      const { error } = await supabase
        .from('cell_members')
        .delete()
        .eq('id', id)

      if (error) throw new Error(error.message)
      return group_id
    },
    onSuccess: (group_id) => {
      void queryClient.invalidateQueries({ queryKey: ['cell_members', group_id] })
    },
  })
}

// ──────────────────────────────────────────────────────────────────────
// Reuniões de célula
// ──────────────────────────────────────────────────────────────────────

export function useCellMeetings(groupId: string) {
  return useQuery({
    queryKey: ['cell_meetings', groupId],
    queryFn: async (): Promise<CellMeeting[]> => {
      const { data, error } = await supabase
        .from('cell_meetings')
        .select('*')
        .eq('group_id', groupId)
        .order('meeting_date', { ascending: false })

      if (error) throw new Error(error.message)
      return (data ?? []) as CellMeeting[]
    },
    enabled: Boolean(groupId),
  })
}

interface CreateCellMeetingInput {
  church_id: string
  group_id: string
  meeting_date: string
  theme?: string
  visitors_count?: number
  consolidated_count?: number
  offering_amount?: number
  notes?: string
}

export function useDeleteGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id }: { id: string; church_id: string }) => {
      const { error } = await supabase
        .from('groups')
        .delete()
        .eq('id', id)
        .eq('church_id', church_id)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['groups', church_id] })
    },
  })
}

export function useCreateCellMeeting() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateCellMeetingInput) => {
      const { data, error } = await supabase
        .from('cell_meetings')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(input as any)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { group_id, church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['cell_meetings', group_id] })
      void queryClient.invalidateQueries({ queryKey: ['groups', church_id] })
    },
  })
}
