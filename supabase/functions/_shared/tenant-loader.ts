// ============================================================
// Shared: tenant-loader.ts
// Carrega e valida o contexto do tenant para um church_id
// Chamado no início de toda Edge Function que processa mensagens
// ============================================================

import { supabase, ChurchSettings, PipelineStage } from './supabase-client.ts'

export interface TenantContext {
  churchId: string
  churchName: string
  settings: ChurchSettings
  visitorStageId: string
  isWithinSupportHours: boolean
}

// ============================================================
// Identifica o church_id a partir do phone_number_id do WhatsApp
// ============================================================
export async function getChurchIdByWhatsAppPhone(
  phoneNumberId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('integrations')
    .select('church_id, config')
    .eq('type', 'whatsapp')
    .eq('is_active', true)
    .filter('config->>phone_number_id', 'eq', phoneNumberId)
    .maybeSingle()

  if (error) {
    console.error('[tenant-loader] Erro ao buscar church por phone_number_id:', error.message)
    return null
  }

  return data?.church_id ?? null
}

// ============================================================
// Carrega o contexto completo do tenant
// Retorna null se tenant inválido, inativo ou onboarding incompleto
// ============================================================
export async function loadTenantContext(
  churchId: string
): Promise<TenantContext | null> {
  // Busca church e settings em paralelo
  const [churchResult, settingsResult, stagesResult] = await Promise.all([
    supabase
      .from('churches')
      .select('id, name, is_active')
      .eq('id', churchId)
      .is('deleted_at', null)
      .maybeSingle(),

    supabase
      .from('church_settings')
      .select('*')
      .eq('church_id', churchId)
      .maybeSingle(),

    supabase
      .from('pipeline_stages')
      .select('id, slug')
      .eq('church_id', churchId)
      .eq('slug', 'visitante')
      .maybeSingle(),
  ])

  // Valida existência e atividade do tenant
  if (churchResult.error || !churchResult.data) {
    console.error('[tenant-loader] Tenant não encontrado:', churchId)
    return null
  }

  if (!churchResult.data.is_active) {
    console.warn('[tenant-loader] Tenant inativo:', churchId)
    return null
  }

  if (settingsResult.error || !settingsResult.data) {
    console.error('[tenant-loader] church_settings não encontrado para:', churchId)
    return null
  }

  const settings = settingsResult.data as ChurchSettings

  // Verifica se módulo WhatsApp está habilitado
  if (!settings.modules_enabled.whatsapp) {
    console.warn('[tenant-loader] Módulo WhatsApp desabilitado para:', churchId)
    return null
  }

  // Verifica se onboarding foi concluído
  if (!settings.onboarding_completed) {
    console.warn('[tenant-loader] Onboarding incompleto para tenant:', churchId)
    return null
  }

  const visitorStageId = stagesResult.data?.id ?? ''

  return {
    churchId,
    churchName: churchResult.data.name,
    settings,
    visitorStageId,
    isWithinSupportHours: checkSupportHours(settings),
  }
}

// ============================================================
// Verifica se o horário atual está dentro da janela configurada
// ============================================================
function checkSupportHours(settings: ChurchSettings): boolean {
  const { timezone, weekday, weekend } = settings.support_hours

  // Obtém hora atual no fuso do tenant
  const now = new Date()
  const tenantTime = new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(now)

  const hourPart = tenantTime.find((p) => p.type === 'hour')?.value ?? '00'
  const minutePart = tenantTime.find((p) => p.type === 'minute')?.value ?? '00'
  const weekdayPart = tenantTime.find((p) => p.type === 'weekday')?.value ?? ''

  const currentMinutes = parseInt(hourPart) * 60 + parseInt(minutePart)

  const isWeekend = ['sáb', 'dom', 'sab'].includes(weekdayPart.toLowerCase())
  const hours = isWeekend ? weekend : weekday

  const [startH, startM] = hours.start.split(':').map(Number)
  const [endH, endM] = hours.end.split(':').map(Number)

  const startMinutes = startH * 60 + startM
  const endMinutes = endH * 60 + endM

  return currentMinutes >= startMinutes && currentMinutes <= endMinutes
}
