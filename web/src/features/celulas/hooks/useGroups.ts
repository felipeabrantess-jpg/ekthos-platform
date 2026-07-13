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
  unit_id?: string
  neighborhood_id?: string
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
  unit_id?: string | null
  neighborhood_id?: string | null
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
        .select('*, people ( id, name, phone, email, name_sort )')
        .eq('group_id', groupId)
        .order('name_sort', { ascending: true, referencedTable: 'people' })

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

// ──────────────────────────────────────────────────────────────────────
// Célula de uma pessoa (para a ficha — leitura única, sem polling)
// ──────────────────────────────────────────────────────────────────────

interface PersonCellData {
  id: string
  name: string
  meeting_day: string | null
  meeting_time: string | null
  leader_id: string | null
  leader_name: string | null
}

export function usePersonCell(celulaId: string | null) {
  return useQuery({
    queryKey: ['person_cell', celulaId],
    queryFn: async (): Promise<PersonCellData | null> => {
      if (!celulaId) return null

      const { data: group, error: groupErr } = await supabase
        .from('groups')
        .select('id, name, meeting_day, meeting_time, leader_id')
        .eq('id', celulaId)
        .maybeSingle()

      if (groupErr) throw new Error(groupErr.message)
      if (!group) return null

      let leaderName: string | null = null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const leaderId = (group as any).leader_id as string | null
      if (leaderId) {
        const { data: leader } = await supabase
          .from('people')
          .select('name')
          .eq('id', leaderId)
          .maybeSingle()
        leaderName = leader?.name ?? null
      }

      return {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        id: (group as any).id as string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        name: (group as any).name as string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        meeting_day: (group as any).meeting_day as string | null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        meeting_time: (group as any).meeting_time as string | null,
        leader_id: leaderId,
        leader_name: leaderName,
      }
    },
    enabled: Boolean(celulaId),
    staleTime: 60_000,
  })
}

// ──────────────────────────────────────────────────────────────────────
// Histórico de células de uma pessoa (linha do tempo completa)
// ──────────────────────────────────────────────────────────────────────

interface CellHistoryEntry {
  id: string
  group_id: string
  group_name: string | null  // null if group was deleted
  joined_at: string
  left_at: string | null
}

export function usePersonCellHistory(personId: string | null) {
  return useQuery({
    queryKey: ['person_cell_history', personId],
    queryFn: async (): Promise<CellHistoryEntry[]> => {
      if (!personId) return []

      const { data, error } = await supabase
        .from('cell_members')
        .select('id, group_id, joined_at, left_at, groups!left(name)')
        .eq('person_id', personId)
        .order('joined_at', { ascending: false })

      if (error) throw new Error(error.message)

      return (data ?? []).map((row) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        id: (row as any).id as string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        group_id: (row as any).group_id as string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        group_name: ((row as any).groups as { name: string } | null)?.name ?? null,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        joined_at: (row as any).joined_at as string,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        left_at: (row as any).left_at as string | null,
      }))
    },
    enabled: Boolean(personId),
    staleTime: 60_000,
  })
}

// ──────────────────────────────────────────────────────────────────────
// Bairros / Regiões de células (cell_neighborhoods)
// ──────────────────────────────────────────────────────────────────────

export interface CellNeighborhood {
  id: string
  church_id: string
  unit_id: string
  name: string
  is_active: boolean
  created_at: string
}

export function useCellNeighborhoods(churchId: string) {
  return useQuery({
    queryKey: ['cell_neighborhoods', churchId, 'active'],
    queryFn: async (): Promise<CellNeighborhood[]> => {
      if (!churchId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cell_neighborhoods')
        .select('*')
        .eq('church_id', churchId)
        .eq('is_active', true)
        .order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as CellNeighborhood[]
    },
    enabled: Boolean(churchId),
  })
}

// Retorna TODOS os bairros (ativos e inativos) — usado na tela de gestão (F3-C)
export function useAllCellNeighborhoods(churchId: string) {
  return useQuery({
    queryKey: ['cell_neighborhoods', churchId, 'all'],
    queryFn: async (): Promise<CellNeighborhood[]> => {
      if (!churchId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cell_neighborhoods')
        .select('*')
        .eq('church_id', churchId)
        .order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as CellNeighborhood[]
    },
    enabled: Boolean(churchId),
  })
}

interface CreateNeighborhoodInput {
  church_id: string
  unit_id: string
  name: string
}

export function useCreateCellNeighborhood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateNeighborhoodInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cell_neighborhoods')
        .insert({ ...input, is_active: true })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as CellNeighborhood
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['cell_neighborhoods', church_id] })
    },
  })
}

interface UpdateNeighborhoodInput {
  id: string
  church_id: string
  name?: string
  unit_id?: string
  is_active?: boolean
}

export function useUpdateCellNeighborhood() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: UpdateNeighborhoodInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cell_neighborhoods')
        .update(updates)
        .eq('id', id)
        .eq('church_id', church_id)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data as CellNeighborhood
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['cell_neighborhoods', church_id] })
    },
  })
}

// ──────────────────────────────────────────────────────────────────────
// Troca de célula — encerra vínculo anterior, cria novo, sincroniza
// people.celula_id e registra auditoria, tudo em uma transação (RPC).
// ──────────────────────────────────────────────────────────────────────

interface ChangeCellResult {
  ok: boolean
  old_group_id: string | null
  new_group_id: string
}

export function useChangeCellMember() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      personId,
      newGroupId,
    }: {
      personId: string
      newGroupId: string
    }): Promise<ChangeCellResult> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc('change_person_cell', {
        p_person_id:    personId,
        p_new_group_id: newGroupId,
      })
      if (error) throw new Error(error.message)
      return data as ChangeCellResult
    },
    onSuccess: (result, { personId }) => {
      if (result?.old_group_id) {
        void queryClient.invalidateQueries({ queryKey: ['cell_members', result.old_group_id] })
        void queryClient.invalidateQueries({ queryKey: ['person_cell', result.old_group_id] })
      }
      void queryClient.invalidateQueries({ queryKey: ['cell_members', result?.new_group_id] })
      void queryClient.invalidateQueries({ queryKey: ['person_cell', result?.new_group_id] })
      void queryClient.invalidateQueries({ queryKey: ['person_cell_history', personId] })
      void queryClient.invalidateQueries({ queryKey: ['people'] })
    },
  })
}

// ──────────────────────────────────────────────────────────────────────
// F4-B: Chamada nominal — presença por reunião
// ──────────────────────────────────────────────────────────────────────

// Get-or-create: retorna o id da cell_meeting para (group, date).
// SELECT-first para evitar duplicatas (cell_meetings não tem UNIQUE em group+date).
export async function getOrCreateMeetingId(
  churchId: string,
  groupId: string,
  meetingDate: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from('cell_meetings')
    .select('id')
    .eq('group_id', groupId)
    .eq('meeting_date', meetingDate)
    .maybeSingle()

  if (existing?.id) return existing.id as string

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: created, error } = await (supabase as any)
    .from('cell_meetings')
    .insert({ church_id: churchId, group_id: groupId, meeting_date: meetingDate })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (created as any).id as string
}

export interface AttendanceRecord {
  id: string
  meeting_id: string
  person_id: string
  status: 'present' | 'absent'
  church_id: string | null
  marked_by: string | null
  created_at: string
}

export function useCellAttendance(meetingId: string | null) {
  return useQuery({
    queryKey: ['cell_attendance', meetingId],
    queryFn: async (): Promise<AttendanceRecord[]> => {
      if (!meetingId) return []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cell_attendance')
        .select('*')
        .eq('meeting_id', meetingId)
      if (error) throw new Error(error.message)
      return (data ?? []) as AttendanceRecord[]
    },
    enabled: Boolean(meetingId),
  })
}

interface UpsertAttendanceInput {
  meeting_id: string
  person_id: string
  church_id: string
  status: 'present' | 'absent'
  marked_by: string | null
}

export function useUpsertAttendance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: UpsertAttendanceInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from('cell_attendance')
        .upsert(input, { onConflict: 'meeting_id,person_id' })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { meeting_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['cell_attendance', meeting_id] })
    },
  })
}
