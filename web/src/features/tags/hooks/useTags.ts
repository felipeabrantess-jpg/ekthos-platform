/**
 * useTags.ts — React Query hooks para flags configuráveis por igreja
 *
 * Tabelas: tags (CRUD) ↔ person_tags (atribuição por pessoa)
 * RLS: church_id = auth_church_id() em ambas
 *
 * Convenção:
 *  - people.tags[]  = uso interno (agentes / importação)
 *  - person_tags    = UI / pastor (este arquivo)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Tag {
  id:         string
  church_id:  string
  name:       string
  color:      string
  sort_order: number
  icon:       string | null
  created_at: string
}

export interface PersonTag {
  id:          string
  person_id:   string
  tag_id:      string
  church_id:   string
  assigned_by: string | null
  created_at:  string
  tag:         Tag
}

// ── Tags (CRUD) ───────────────────────────────────────────────────────────────

/** Lista todas as flags da igreja, ordenadas por sort_order */
export function useTags() {
  const { churchId } = useAuth()
  return useQuery({
    queryKey: ['tags', churchId],
    enabled: !!churchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tags')
        .select('*')
        .eq('church_id', churchId!)
        .order('sort_order')
        .order('name')
      if (error) throw error
      return (data ?? []) as Tag[]
    },
  })
}

/** Cria uma nova flag */
export function useCreateTag() {
  const queryClient = useQueryClient()
  const { churchId } = useAuth()
  return useMutation({
    mutationFn: async (input: { name: string; color: string; sort_order?: number; icon?: string | null }) => {
      const { data, error } = await supabase
        .from('tags')
        .insert({ ...input, church_id: churchId! })
        .select()
        .single()
      if (error) throw error
      return data as Tag
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags', churchId] }),
  })
}

/** Atualiza uma flag existente */
export function useUpdateTag() {
  const queryClient = useQueryClient()
  const { churchId } = useAuth()
  return useMutation({
    mutationFn: async (input: Partial<Tag> & { id: string }) => {
      const { id, church_id: _skip, created_at: _skip2, ...rest } = input
      const { data, error } = await supabase
        .from('tags')
        .update(rest)
        .eq('id', id)
        .select()
        .single()
      if (error) throw error
      return data as Tag
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tags', churchId] }),
  })
}

/** Exclui uma flag (cascata remove person_tags) */
export function useDeleteTag() {
  const queryClient = useQueryClient()
  const { churchId } = useAuth()
  return useMutation({
    mutationFn: async (tagId: string) => {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tags', churchId] })
      // Invalida person_tags de todas as pessoas (cascata pode afetar vários)
      queryClient.invalidateQueries({ queryKey: ['person_tags'] })
    },
  })
}

// ── Person Tags (atribuição) ──────────────────────────────────────────────────

/** Lista flags atribuídas a uma pessoa (com JOIN em tags) */
export function usePersonTags(personId: string | undefined) {
  const { churchId } = useAuth()
  return useQuery({
    queryKey: ['person_tags', personId, churchId],
    enabled: !!personId && !!churchId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('person_tags')
        .select('*, tag:tags(*)')
        .eq('person_id', personId!)
        .eq('church_id', churchId!)
        .order('created_at')
      if (error) throw error
      return (data ?? []) as PersonTag[]
    },
  })
}

/** Atribui uma flag a uma pessoa (UPSERT — ignora se já existe) */
export function useAssignTag() {
  const queryClient = useQueryClient()
  const { churchId } = useAuth()
  return useMutation({
    mutationFn: async ({ personId, tagId, assignedBy }: {
      personId:   string
      tagId:      string
      assignedBy?: string | null
    }) => {
      const { error } = await supabase
        .from('person_tags')
        .upsert(
          { person_id: personId, tag_id: tagId, church_id: churchId!, assigned_by: assignedBy ?? null },
          { onConflict: 'person_id,tag_id' }
        )
      if (error) throw error
    },
    onSuccess: (_data, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['person_tags', personId, churchId] })
    },
  })
}

/** Remove uma flag de uma pessoa */
export function useUnassignTag() {
  const queryClient = useQueryClient()
  const { churchId } = useAuth()
  return useMutation({
    mutationFn: async ({ personId, tagId }: { personId: string; tagId: string }) => {
      const { error } = await supabase
        .from('person_tags')
        .delete()
        .eq('person_id', personId)
        .eq('tag_id', tagId)
        .eq('church_id', churchId!)
      if (error) throw error
    },
    onSuccess: (_data, { personId }) => {
      queryClient.invalidateQueries({ queryKey: ['person_tags', personId, churchId] })
    },
  })
}
