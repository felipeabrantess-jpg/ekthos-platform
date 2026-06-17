// ============================================================
// Edge Function: igv-public-agenda  (verify_jwt = false)
//
// Expõe dados PÚBLICOS da agenda da IGV para o PWA /igv/agenda.
//
// GET /functions/v1/igv-public-agenda
//
// Retorna SOMENTE:
//   - horarios_culto (string pública de church_pastoral_profile)
//   - eventos públicos futuros (título, data, local — sem campos pastorais)
//
// LGPD R8: zero SELECT em people. Zero exposição de dados pessoais.
// Hardcoded para a IGV (church_id fixo) — não aceita parâmetro de church_id.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const IGV_CHURCH_ID = '6c127559-874a-4748-8fce-55d4079613a5'

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://www.ekthosai.com',
  'https://ekthosai.com',
  'https://ekthosai.net',
  'https://www.ekthosai.net',
  'http://localhost:5173',
  'http://localhost:5201',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age':       '86400',
  }
}

Deno.serve(async (req: Request) => {
  const origin  = req.headers.get('origin')
  const headers = corsHeaders(origin)
  const json    = { ...headers, 'Content-Type': 'application/json' }

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: json })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // 1. Busca horários de culto (apenas o campo público)
  const { data: profile } = await supabase
    .from('church_pastoral_profile')
    .select('horarios_culto')
    .eq('church_id', IGV_CHURCH_ID)
    .maybeSingle()

  // 2. Busca eventos públicos futuros (occurrence >= hoje, não cancelados)
  const today = new Date().toISOString().split('T')[0]

  const { data: occurrences } = await supabase
    .from('event_occurrences')
    .select(`
      id,
      occurrence_date,
      start_datetime,
      end_datetime,
      is_cancelled,
      override_title,
      override_location,
      church_events!inner (
        title,
        location,
        is_public,
        active
      )
    `)
    .eq('church_id', IGV_CHURCH_ID)
    .eq('is_cancelled', false)
    .gte('occurrence_date', today)
    .order('occurrence_date', { ascending: true })
    .limit(20)

  // Filtra no JS: somente públicos + ativos (double-check safety)
  type OccurrenceRow = {
    id: string
    occurrence_date: string
    start_datetime: string
    end_datetime: string | null
    is_cancelled: boolean
    override_title: string | null
    override_location: string | null
    church_events: {
      title: string
      location: string | null
      is_public: boolean
      active: boolean
    }
  }

  const events = ((occurrences ?? []) as OccurrenceRow[])
    .filter(eo => eo.church_events?.is_public && eo.church_events?.active)
    .map(eo => ({
      id:            eo.id,
      title:         eo.override_title   ?? eo.church_events.title,
      date:          eo.occurrence_date,
      startDatetime: eo.start_datetime,
      endDatetime:   eo.end_datetime,
      location:      eo.override_location ?? eo.church_events.location ?? null,
    }))

  return new Response(
    JSON.stringify({
      horariosCulto: profile?.horarios_culto ?? null,
      events,
    }),
    { status: 200, headers: json }
  )
})
