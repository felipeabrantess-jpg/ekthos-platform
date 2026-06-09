// ─────────────────────────────────────────────────────────────────────────────
// usePipelineStagesCrud — CRUD de pipeline_stages
//
// Usado pelo <PipelineStagesModal> em /discipulado.
// Regras de segurança:
//   - Delete: bloqueado se houver pessoas na etapa (count > 0)
//   - Create: gera slug a partir do nome
//   - Update: só nome + cor (slug e order_index são imutáveis após criação)
// ─────────────────────────────────────────────────────────────────────────────

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PipelineStage } from '@/lib/types/joins'

// ── CREATE ────────────────────────────────────────────────────────────────────

interface CreateStageInput {
  churchId:   string
  name:       string
  color:      string
  orderIndex: number
}

export function useCreatePipelineStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ churchId, name, color, orderIndex }: CreateStageInput) => {
      // Slug: lowercase + hífens, apenas a-z0-9-
      const slug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-')
        .slice(0, 50)

      const { data, error } = await supabase
        .from('pipeline_stages')
        .insert({
          church_id:   churchId,
          name,
          slug,
          color,
          order_index: orderIndex,
          is_active:   true,
        })
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as unknown as PipelineStage
    },

    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-stages', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline-board',  churchId] })
    },
  })
}

// ── UPDATE ────────────────────────────────────────────────────────────────────

interface UpdateStageInput {
  id:       string
  churchId: string
  name:     string
  color:    string
}

export function useUpdatePipelineStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId, name, color }: UpdateStageInput) => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .update({ name, color })
        .eq('id', id)
        .eq('church_id', churchId)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data as unknown as PipelineStage
    },

    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-stages', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline-board',  churchId] })
      // Invalida /pessoas também — cores das etapas mudam no badge
      void queryClient.invalidateQueries({ queryKey: ['people',          churchId] })
    },
  })
}

// ── DELETE ────────────────────────────────────────────────────────────────────

interface DeleteStageInput {
  id:       string
  churchId: string
}

export function useDeletePipelineStage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: DeleteStageInput) => {
      // Bloqueia exclusão se houver pessoas nesta etapa
      const { count, error: countErr } = await supabase
        .from('person_pipeline')
        .select('id', { count: 'exact', head: true })
        .eq('stage_id', id)
        .eq('church_id', churchId)

      if (countErr) throw new Error(countErr.message)
      if ((count ?? 0) > 0) {
        throw new Error(
          `Não é possível excluir: ${count} pessoa${count === 1 ? '' : 's'} nesta etapa. Mova-${count === 1 ? 'a' : 'as'} antes de excluir.`
        )
      }

      const { error } = await supabase
        .from('pipeline_stages')
        .delete()
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },

    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['pipeline-stages', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['pipeline-board',  churchId] })
    },
  })
}
