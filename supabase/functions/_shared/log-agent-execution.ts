// ============================================================
// _shared/log-agent-execution.ts  v1 — Fase 6.3
//
// Helper best-effort para registrar execuções de agentes
// pastorais em agent_executions.
//
// NUNCA lança exceção — falha silenciosa para não bloquear
// o fluxo principal dos agentes operacionais.
//
// Colunas gravadas (nomes reais de agent_executions):
//   church_id, agent_slug, model, trigger_type, status,
//   success (bool legado — compat com agent-reengajamento),
//   duration_ms, input_tokens, output_tokens,
//   cache_read_tokens, cache_creation_tokens, error, user_id
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface AgentExecutionLog {
  church_id:              string
  agent_slug:             string
  model:                  string
  trigger_type?:          string  // 'cron' | 'inbound_message' | 'journey' | 'reengagement_scan'
  status:                 string  // 'success' | 'error' | 'rate_limited' | 'skipped'
  duration_ms?:           number
  input_tokens?:          number
  output_tokens?:         number
  cache_read_tokens?:     number
  cache_creation_tokens?: number
  error?:                 string
  user_id?:               string
}

export async function logAgentExecution(
  supabaseAdmin: ReturnType<typeof createClient>,
  log: AgentExecutionLog,
): Promise<void> {
  try {
    await supabaseAdmin.from('agent_executions').insert({
      church_id:             log.church_id,
      agent_slug:            log.agent_slug,
      model:                 log.model,
      trigger_type:          log.trigger_type ?? null,
      status:                log.status,
      // success bool legado — derivado de status para compat com agent-reengajamento v14
      success:               log.status === 'success',
      duration_ms:           log.duration_ms ?? null,
      input_tokens:          log.input_tokens ?? 0,
      output_tokens:         log.output_tokens ?? 0,
      cache_read_tokens:     log.cache_read_tokens ?? 0,
      cache_creation_tokens: log.cache_creation_tokens ?? 0,
      error:                 log.error ?? null,
      user_id:               log.user_id ?? null,
    })
  } catch (err) {
    // Best-effort: nunca bloqueia o fluxo principal
    console.warn(
      '[logAgentExecution] falhou (non-critical):',
      err instanceof Error ? err.message : String(err),
    )
  }
}
