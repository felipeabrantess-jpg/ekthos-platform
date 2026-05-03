/**
 * useChurchAgentConfig — Leitura e upsert de church_agent_config
 *
 * INTEGRAÇÃO COM EDGE FUNCTION (futuro PASSO 6):
 *
 * No agent-acolhimento (e demais agentes premium), o prompt final será montado:
 *   prompt_final = agent_prompt_templates.system_prompt_template (global)
 *                + church_agent_config.custom_instructions (por igreja)
 *                + dados runtime (pessoa, igreja, contexto da mensagem)
 *
 * Este hook apenas cria a base. A Edge Function continuará usando prompt
 * estático até o PASSO 6 implementar a leitura.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ChurchAgentConfig {
  church_id:           string
  agent_slug:          string
  custom_instructions: string | null
  formality:           string | null
  denomination:        string | null
  updated_by:          string | null
  created_at:          string
  updated_at:          string
}

// ── Query ─────────────────────────────────────────────────────────────────────

export function useChurchAgentConfig(
  churchId: string | null | undefined,
  agentSlug: string | null | undefined
) {
  return useQuery({
    queryKey: ['church_agent_config', churchId, agentSlug],
    queryFn: async () => {
      if (!churchId || !agentSlug) return null
      const { data, error } = await supabase.rpc('get_church_agent_config', {
        p_church_id:  churchId,
        p_agent_slug: agentSlug,
      })
      if (error) throw new Error(error.message)
      return (data?.[0] as ChurchAgentConfig | undefined) ?? null
    },
    enabled: !!churchId && !!agentSlug,
    staleTime: 30_000,
  })
}

// ── Mutation ──────────────────────────────────────────────────────────────────

export function useUpsertChurchAgentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      church_id:           string
      agent_slug:          string
      custom_instructions: string
    }) => {
      const { data, error } = await supabase.rpc('upsert_church_agent_config', {
        p_church_id:           params.church_id,
        p_agent_slug:          params.agent_slug,
        p_custom_instructions: params.custom_instructions,
      })
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['church_agent_config', vars.church_id, vars.agent_slug] })
    },
  })
}
