// ─────────────────────────────────────────────────────────────────────────────
// useTags — CRUD de flags configuráveis por igreja
//
// Tabela: tags (id, church_id, name, color, sort_order, icon)
// RLS: tags_church ALL — church_id = auth_church_id()
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Tag } from '@/lib/types/joins'

// ── READ ─────────────────────────────────────────────────────────────────────

export function useTags(churchId: string) {
  return useQuery({
    queryKey: ['tags', churchId],
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from('tags')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('id, church_id, name, color, sort_order, icon, created_at' as any)
        .eq('church_id', churchId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as Tag[]
    },
    enabled: Boolean(churchId),
    staleTime: 30_000,
  })
}

// ── CREATE ────────────────────────────────────────────────────────────────────

interface CreateTagInput {
  churchId: string
  name: string
  color: string
  sort_order?: number
}

export function useCreateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ churchId, name, color, sort_order = 0 }: CreateTagInput) => {
      const { data, error } = await supabase
        .from('tags')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ church_id: churchId, name: name.trim(), color, sort_order } as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('id, church_id, name, color, sort_order, icon, created_at' as any)
        .single()

      if (error) throw new Error(error.message)
      if (!data) throw new Error('Erro ao criar flag.')
      return data as unknown as Tag
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['tags', churchId] })
    },
  })
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

interface UpdateTagInput {
  id: string
  churchId: string
  name?: string
  color?: string
  sort_order?: number
}

export function useUpdateTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId, ...updates }: UpdateTagInput) => {
      const patch: Record<string, unknown> = {}
      if (updates.name !== undefined)       patch.name       = updates.name.trim()
      if (updates.color !== undefined)      patch.color      = updates.color
      if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order

      const { data, error } = await supabase
        .from('tags')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq('id', id)
        .eq('church_id', churchId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select('id, church_id, name, color, sort_order, icon, created_at' as any)
        .single()

      if (error) throw new Error(error.message)
      if (!data) throw new Error('Flag não encontrada ou sem permissão.')
      return data as unknown as Tag
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['tags', churchId] })
    },
  })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

interface DeleteTagInput {
  id: string
  churchId: string
}

export function useDeleteTag() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: DeleteTagInput) => {
      // Checa atribuições antes (garante 0 usos antes de deletar)
      const { count, error: countErr } = await supabase
        .from('person_tags')
        .select('*', { count: 'exact', head: true })
        .eq('tag_id', id)
        .eq('church_id', churchId)

      if (countErr) throw new Error(countErr.message)
      if ((count ?? 0) > 0)
        throw new Error(`Não é possível excluir: ${count} pessoa(s) com esta flag.`)

      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['tags', churchId] })
    },
  })
}

// ── Contagem de uso por tag ───────────────────────────────────────────────────

export function useTagUsageCounts(churchId: string) {
  return useQuery({
    queryKey: ['tag-usage', churchId],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('person_tags')
        .select('tag_id')
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
      const counts: Record<string, number> = {}
      for (const row of data ?? []) {
        counts[row.tag_id] = (counts[row.tag_id] ?? 0) + 1
      }
      return counts
    },
    enabled: Boolean(churchId),
    staleTime: 15_000,
  })
}
