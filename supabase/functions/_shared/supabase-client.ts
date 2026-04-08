// ============================================================
// Shared: supabase-client.ts
// Cliente Supabase autenticado com service_role para Edge Functions
// NUNCA usar anon key em Edge Functions — sempre service_role
// ============================================================

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Variáveis de ambiente obrigatórias — validadas na inicialização
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('[supabase-client] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados')
}

// Cliente singleton com service_role — bypassa RLS intencionalmente
// Edge Functions operam no contexto do sistema, não do usuário
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

// ============================================================
// Tipos base do schema
// ============================================================

export interface Church {
  id: string
  name: string
  slug: string
  is_active: boolean
  created_at: string
}

export interface ChurchSettings {
  id: string
  church_id: string
  modules_enabled: {
    whatsapp: boolean
    instagram: boolean
    crm: boolean
    donations: boolean
    agenda: boolean
  }
  labels: {
    group: string
    member: string
    visitor: string
    leader: string
  }
  support_hours: {
    timezone: string
    weekday: { start: string; end: string }
    weekend: { start: string; end: string }
  }
  escalation_contacts: Array<{
    name: string
    whatsapp: string
    role: string
  }>
  out_of_hours_message: string
  onboarding_completed: boolean
  max_msg_per_hour: number
}

export interface Person {
  id: string
  church_id: string
  name: string | null
  phone: string | null
  tags: string[]
  last_contact_at: string | null
  optout: boolean
  source: string
}

export interface PipelineStage {
  id: string
  church_id: string
  name: string
  slug: string
  order_index: number
  days_until_followup: number
  auto_followup: boolean
}

export interface AuditLogEntry {
  church_id: string | null
  entity_type: string
  entity_id: string | null
  action: string
  actor_type: 'agent' | 'human' | 'system' | 'webhook'
  actor_id: string
  payload: Record<string, unknown>
  model_used: string | null
  tokens_used: number
}

// ============================================================
// Helper: registrar em audit_logs de forma segura
// Nunca lança erro — falha silenciosamente com log no console
// ============================================================
export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const { error } = await supabase.from('audit_logs').insert(entry)
  if (error) {
    console.error('[audit_log] Falha ao registrar:', error.message, entry)
  }
}

// ============================================================
// Helper: resposta padronizada de erro para Edge Functions
// ============================================================
export function errorResponse(
  message: string,
  status: number,
  details?: unknown
): Response {
  console.error(`[error] ${status} — ${message}`, details ?? '')
  return new Response(
    JSON.stringify({ error: message, details: details ?? null }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

// ============================================================
// Helper: resposta de sucesso padronizada
// ============================================================
export function successResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
