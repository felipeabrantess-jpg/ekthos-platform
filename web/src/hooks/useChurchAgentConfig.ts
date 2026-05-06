/**
 * useChurchAgentConfig — Leitura e upsert de church_agent_config
 *
 * Sprint 2A Onda B — versão base (useQuery/useMutation)
 * Usada por: AtivacaoDetail, PromptCustomizadoSection
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

import { useState, useEffect, useCallback, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type {
  ChurchAgentFullConfig,
  AgentCockpitFormState,
  ChurchAgentConfigPayload,
  ChurchFollowupConfigPayload,
} from '@/types/churchAgentConfig'

// ── Tipos (Sprint 2A Onda B) ──────────────────────────────────────────────────

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

// ── useChurchAgentConfig (Sprint 2A Onda B — useQuery) ───────────────────────

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

// ── useUpsertChurchAgentConfig (Sprint 2A Onda B) ─────────────────────────────

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

// ── useResetChurchAgentConfig (Sprint 2A Onda B) ──────────────────────────────

export function useResetChurchAgentConfig() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (params: {
      church_id:  string
      agent_slug: string
    }) => {
      const { error } = await supabase.rpc('reset_church_agent_config', {
        p_church_id:  params.church_id,
        p_agent_slug: params.agent_slug,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['church_agent_config', vars.church_id, vars.agent_slug] })
    },
  })
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── useChurchAgentFullConfig (Sprint 3A.1 — AgentConfigCockpit) ───────────────
// ═══════════════════════════════════════════════════════════════════════════════

// Estado inicial vazio do formulário
const EMPTY_FORM: AgentCockpitFormState = {
  church_name: '', church_city: '', church_state: '', church_region: '',
  church_denomination: '', church_vision_statement: '', church_address_full: '',
  church_main_phone: '', church_website_url: '',
  church_pastor_titular_name: '', church_pastor_titular_phone: '',
  church_social_media_handles: {},
  agent_name: '', pastor_name: '', church_name_short: '',
  formality: '', emoji_usage: '', pastoral_depth: '', first_contact_delay: '',
  custom_instructions: '', preferred_verses: [], forbidden_topics: [],
  denomination_override: '',
  followup_enabled: true, enabled_touchpoints: [],
  duration_days: '', send_window_start: '', send_window_end: '',
  stop_on_response: true, stop_on_attendance: true,
  next_action_after_completion: '',
  escalation_enabled: false, escalation_on_no_response_days: '',
  escalation_notify_role: 'pastor', escalation_pause_followup: false,
  escalation_sensitive_case_flag: true, escalation_keywords: [],
}

function hydrateForm(
  fullConfig: ChurchAgentFullConfig,
  church: Record<string, unknown>
): AgentCockpitFormState {
  const c = fullConfig.config ?? null
  const f = fullConfig.followup ?? null
  const esc = (f?.escalation_conditions ?? {}) as Record<string, unknown>
  const agentEsc = c?.escalation_config ?? null
  return {
    church_name: (church.name as string) ?? '',
    church_city: (church.city as string) ?? '',
    church_state: (church.state as string) ?? '',
    church_region: (church.region as string) ?? '',
    church_denomination: (church.denomination as string) ?? '',
    church_vision_statement: (church.vision_statement as string) ?? '',
    church_address_full: (church.address_full as string) ?? '',
    church_main_phone: (church.main_phone as string) ?? '',
    church_website_url: (church.website_url as string) ?? '',
    church_pastor_titular_name: (church.pastor_titular_name as string) ?? '',
    church_pastor_titular_phone: (church.pastor_titular_phone as string) ?? '',
    church_social_media_handles: (church.social_media_handles as Record<string, string>) ?? {},
    agent_name: c?.agent_name ?? '',
    pastor_name: c?.pastor_name ?? '',
    church_name_short: c?.church_name_short ?? '',
    formality: c?.formality ?? '',
    emoji_usage: c?.emoji_usage ?? '',
    pastoral_depth: c?.pastoral_depth ?? '',
    first_contact_delay: c?.first_contact_delay ?? '',
    custom_instructions: c?.custom_instructions ?? '',
    preferred_verses: c?.preferred_verses ?? [],
    forbidden_topics: c?.forbidden_topics ?? [],
    denomination_override: c?.denomination ?? '',
    followup_enabled: f?.followup_enabled ?? true,
    enabled_touchpoints: f?.enabled_touchpoints ?? [],
    duration_days: f?.duration_days != null ? String(f.duration_days) : '',
    send_window_start: f?.send_window_start ?? '',
    send_window_end: f?.send_window_end ?? '',
    stop_on_response: f?.stop_conditions?.on_response ?? true,
    stop_on_attendance: f?.stop_conditions?.on_attendance ?? true,
    next_action_after_completion: f?.next_action_after_completion ?? '',
    escalation_enabled: agentEsc?.enabled ?? false,
    escalation_on_no_response_days: esc.on_no_response_days != null ? String(esc.on_no_response_days) : '',
    escalation_notify_role: esc.notify_role ?? 'pastor',
    escalation_pause_followup: esc.pause_followup ?? false,
    escalation_sensitive_case_flag: esc.sensitive_case_flag ?? true,
    escalation_keywords: agentEsc?.rules?.find(r => r.trigger === 'sensitive_keywords')?.keywords ?? [],
  }
}

export function useChurchAgentFullConfig(churchId: string, agentSlug: string) {
  const [fullConfig, setFullConfig] = useState<ChurchAgentFullConfig | null>(null)
  const [church, setChurch] = useState<Record<string, unknown> | null>(null)
  const [formData, setFormData] = useState<AgentCockpitFormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dirtyTabs, setDirtyTabs] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const showToast = useCallback((ok: boolean, msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast({ ok, msg })
    toastTimerRef.current = setTimeout(() => setToast(null), 5000)
  }, [])

  const markDirty = useCallback((tab: string) => {
    setDirtyTabs(prev => new Set(prev).add(tab))
  }, [])

  const clearDirty = useCallback((tab: string) => {
    setDirtyTabs(prev => { const s = new Set(prev); s.delete(tab); return s })
  }, [])

  useEffect(() => {
    if (!churchId || !agentSlug) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setError(null)
      try {
        const { data: configData, error: configErr } = await supabase
          .rpc('get_church_agent_full_config', {
            p_church_id: churchId,
            p_agent_slug: agentSlug,
          })
        if (configErr) throw configErr

        const { data: churchData, error: churchErr } = await supabase
          .from('churches')
          .select('id,name,city,state,region,denomination,vision_statement,address_full,main_phone,website_url,pastor_titular_name,pastor_titular_phone,social_media_handles,logo_url,timezone,status,slug')
          .eq('id', churchId)
          .single()
        if (churchErr) throw churchErr

        if (!cancelled) {
          setFullConfig(configData as ChurchAgentFullConfig)
          setChurch(churchData as Record<string, unknown>)
          setFormData(hydrateForm(configData as ChurchAgentFullConfig, churchData as Record<string, unknown>))
          setDirtyTabs(new Set())
        }
      } catch (e: unknown) {
        if (!cancelled) setError((e as Error).message ?? 'Erro ao carregar configuração')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [churchId, agentSlug])

  const saveIdentidade = useCallback(async () => {
    setSaving(true)
    try {
      const { error: churchErr } = await supabase
        .from('churches')
        .update({
          name:                  formData.church_name || undefined,
          city:                  formData.church_city || undefined,
          state:                 formData.church_state || undefined,
          region:                formData.church_region || undefined,
          denomination:          formData.church_denomination || undefined,
          vision_statement:      formData.church_vision_statement || undefined,
          address_full:          formData.church_address_full || undefined,
          main_phone:            formData.church_main_phone || undefined,
          website_url:           formData.church_website_url || undefined,
          pastor_titular_name:   formData.church_pastor_titular_name || undefined,
          pastor_titular_phone:  formData.church_pastor_titular_phone || undefined,
          social_media_handles:  Object.keys(formData.church_social_media_handles).length > 0
            ? formData.church_social_media_handles : undefined,
        })
        .eq('id', churchId)
      if (churchErr) throw churchErr

      const payload: ChurchAgentConfigPayload = {
        agent_name:       formData.agent_name || undefined,
        pastor_name:      formData.pastor_name || undefined,
        church_name_short: formData.church_name_short || undefined,
      }
      const { error: rpcErr } = await supabase
        .rpc('upsert_church_agent_config_admin', {
          p_church_id: churchId,
          p_agent_slug: agentSlug,
          p_data: payload,
        })
      if (rpcErr) throw rpcErr

      clearDirty('identidade')
      showToast(true, 'Identidade salva com sucesso.')
    } catch (e: unknown) {
      showToast(false, (e as Error).message ?? 'Erro ao salvar identidade')
    } finally {
      setSaving(false)
    }
  }, [churchId, agentSlug, formData, clearDirty, showToast])

  const savePromptTom = useCallback(async () => {
    setSaving(true)
    try {
      const payload: ChurchAgentConfigPayload = {
        formality:          formData.formality || undefined,
        emoji_usage:        formData.emoji_usage || undefined,
        pastoral_depth:     formData.pastoral_depth || undefined,
        first_contact_delay: formData.first_contact_delay || undefined,
        custom_instructions: formData.custom_instructions || undefined,
        preferred_verses:   formData.preferred_verses.length > 0 ? formData.preferred_verses : [],
        forbidden_topics:   formData.forbidden_topics.length > 0 ? formData.forbidden_topics : [],
        denomination:       formData.denomination_override || undefined,
      }
      const { error } = await supabase.rpc('upsert_church_agent_config_admin', {
        p_church_id: churchId, p_agent_slug: agentSlug, p_data: payload,
      })
      if (error) throw error
      clearDirty('prompt')
      showToast(true, 'Prompt e tom salvos com sucesso.')
    } catch (e: unknown) {
      showToast(false, (e as Error).message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }, [churchId, agentSlug, formData, clearDirty, showToast])

  const saveFollowup = useCallback(async () => {
    setSaving(true)
    try {
      const payload: ChurchFollowupConfigPayload = {
        followup_enabled:    formData.followup_enabled,
        enabled_touchpoints: formData.enabled_touchpoints,
        duration_days:       formData.duration_days ? parseInt(formData.duration_days, 10) : null,
        send_window_start:   formData.send_window_start || null,
        send_window_end:     formData.send_window_end || null,
        stop_conditions:     { on_response: formData.stop_on_response, on_attendance: formData.stop_on_attendance },
        next_action_after_completion: formData.next_action_after_completion || null,
      }
      const { error } = await supabase.rpc('upsert_church_followup_config_admin', {
        p_church_id: churchId, p_agent_slug: agentSlug, p_data: payload,
      })
      if (error) throw error
      clearDirty('followup')
      showToast(true, 'Follow-up salvo com sucesso.')
    } catch (e: unknown) {
      showToast(false, (e as Error).message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }, [churchId, agentSlug, formData, clearDirty, showToast])

  const saveEscalonamento = useCallback(async () => {
    setSaving(true)
    try {
      const agentPayload: ChurchAgentConfigPayload = {
        escalation_config: {
          enabled: formData.escalation_enabled,
          rules: formData.escalation_keywords.length > 0 ? [{
            trigger: 'sensitive_keywords',
            action: 'manual_review',
            keywords: formData.escalation_keywords,
            notify_to_role: formData.escalation_notify_role,
          }] : [],
        },
      }
      const { error: e1 } = await supabase.rpc('upsert_church_agent_config_admin', {
        p_church_id: churchId, p_agent_slug: agentSlug, p_data: agentPayload,
      })
      if (e1) throw e1

      const followupPayload: ChurchFollowupConfigPayload = {
        escalation_conditions: {
          on_no_response_days: formData.escalation_on_no_response_days
            ? parseInt(formData.escalation_on_no_response_days, 10) : undefined,
          notify_role: formData.escalation_notify_role || undefined,
          pause_followup: formData.escalation_pause_followup,
          sensitive_case_flag: formData.escalation_sensitive_case_flag,
        },
      }
      const { error: e2 } = await supabase.rpc('upsert_church_followup_config_admin', {
        p_church_id: churchId, p_agent_slug: agentSlug, p_data: followupPayload,
      })
      if (e2) throw e2

      clearDirty('escalamento')
      showToast(true, 'Escalonamento salvo com sucesso.')
    } catch (e: unknown) {
      showToast(false, (e as Error).message ?? 'Erro ao salvar')
    } finally {
      setSaving(false)
    }
  }, [churchId, agentSlug, formData, clearDirty, showToast])

  return {
    fullConfig, church, formData, setFormData,
    loading, error, saving, toast,
    dirtyTabs, markDirty, clearDirty,
    saveIdentidade, savePromptTom, saveFollowup, saveEscalonamento,
    showToast,
  }
}
