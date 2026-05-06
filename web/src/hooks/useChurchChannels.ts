/**
 * useChurchChannels — Lista e upsert de church_channels
 *
 * Tabela genérica de canais de comunicação por igreja.
 * Polling 30s para refletir atualização de status pelo n8n callback.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface ChurchChannel {
  id:                    string
  provider:              string
  provider_instance_id:  string | null
  phone_number:          string | null
  display_name:          string | null
  status:                'pending' | 'provisioning' | 'connected' | 'error' | 'disabled'
  agent_slugs:           string[]
  error_message:         string | null
  last_provisioned_at:   string | null
  updated_at:            string
}

export interface UpsertChannelParams {
  church_id:             string
  provider:              string
  provider_instance_id:  string
  phone_number:          string
  display_name:          string
  agent_slugs:           string[]
  initial_status?:       'pending' | 'connected'
  channel_id?:           string  // para UPDATE explícito
}

// ── Query ─────────────────────────────────────────────────────────────────────

export function useChurchChannels(churchId: string | null | undefined) {
  return useQuery({
    queryKey: ['church-channels', churchId],
    queryFn: async (): Promise<ChurchChannel[]> => {
      if (!churchId) return []
      const { data, error } = await supabase.rpc('list_church_channels', {
        p_church_id: churchId,
      })
      if (error) throw new Error(error.message)
      return (data ?? []) as ChurchChannel[]
    },
    enabled: !!churchId,
    staleTime: 10_000,
    refetchInterval: 30_000,  // polling: captura updates de status do n8n callback
  })
}

// ── Mutation: upsert + provision ──────────────────────────────────────────────

export function useUpsertChannel() {
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (params: UpsertChannelParams) => {
      // 1. Upsert no banco via RPC
      const { data: upsertData, error: upsertError } = await supabase.rpc(
        'upsert_church_channel',
        {
          p_church_id:            params.church_id,
          p_provider:             params.provider,
          p_provider_instance_id: params.provider_instance_id,
          p_phone_number:         params.phone_number,
          p_display_name:         params.display_name,
          p_agent_slugs:          params.agent_slugs,
          p_initial_status:       params.initial_status ?? 'pending',
          p_channel_id:           params.channel_id ?? null,
        }
      )
      if (upsertError) throw new Error(upsertError.message)

      const channelId = (upsertData as { channel_id: string }[])?.[0]?.channel_id
      if (!channelId) throw new Error('upsert não retornou channel_id')

      // 2. Chamar Edge Function provision-channel
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) throw new Error('Sem sessão ativa')

      const efBaseUrl = import.meta.env.VITE_SUPABASE_URL as string
      const provRes = await fetch(`${efBaseUrl}/functions/v1/provision-channel`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ channel_id: channelId }),
      })

      // Falha de provisionamento não é erro fatal — canal salvo, provisioning pendente
      if (!provRes.ok) {
        const errBody = await provRes.json().catch(() => ({ error: 'parse_error' }))
        console.warn('[useUpsertChannel] provision warning', errBody)
      }

      return { channelId }
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['church-channels', vars.church_id] })
    },
  })
}
