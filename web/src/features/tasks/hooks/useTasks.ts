import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Task } from '@/lib/database.types'

export function useTasks(churchId: string, personId?: string) {
  return useQuery({
    queryKey: ['tasks', churchId, personId],
    queryFn: async (): Promise<Task[]> => {
      let query = supabase
        .from('tasks')
        .select('*')
        .eq('church_id', churchId)
        .order('due_date', { ascending: true })

      if (personId) {
        query = query.eq('person_id', personId)
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)
      return (data ?? []) as Task[]
    },
    enabled: Boolean(churchId),
  })
}

interface CreateTaskInput {
  church_id: string
  person_id: string
  assigned_to?: string
  title: string
  description?: string
  due_date?: string
}

export function useCreateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const { data, error } = await supabase
        .from('tasks')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ ...input, status: 'pending' } as any)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', church_id] })
    },
  })
}

interface UpdateTaskInput {
  id: string
  church_id: string
  title?: string
  description?: string
  due_date?: string | null
  status?: string
  assigned_to?: string | null
}

export function useUpdateTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: UpdateTaskInput) => {
      const { data, error } = await supabase
        .from('tasks')
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
      void queryClient.invalidateQueries({ queryKey: ['tasks', church_id] })
    },
  })
}

export function useDeleteTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id }: { id: string; church_id: string }) => {
      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)
        .eq('church_id', church_id)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', church_id] })
    },
  })
}
