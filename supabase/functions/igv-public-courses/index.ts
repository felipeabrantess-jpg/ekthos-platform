// ============================================================
// Edge Function: igv-public-courses  (verify_jwt = false)
//
// GET /functions/v1/igv-public-courses
//
// Retorna cursos PÚBLICOS e ATIVOS da IGV.
// LGPD R8: zero dados de inscritos no payload.
// Hardcoded para IGV (church_id fixo) — sem parâmetro church_id.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const IGV_CHURCH_ID = '6c127559-874a-4748-8fce-55d4079613a5'

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://www.ekthosai.com', 'https://ekthosai.com',
  'https://ekthosai.net',     'https://www.ekthosai.net',
  'http://localhost:5173',    'http://localhost:5201',
]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
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

  const { data, error } = await supabase
    .from('church_courses')
    .select('id, title, description, instructor, schedule_text, location, start_date, end_date, image_url, price, prerequisites, max_capacity, enrolled_count')
    .eq('church_id', IGV_CHURCH_ID)
    .eq('is_public', true)
    .eq('active', true)
    .order('start_date', { ascending: true, nullsFirst: false })

  if (error) {
    console.error('igv-public-courses error:', error)
    return new Response(JSON.stringify({ error: 'Erro ao carregar cursos' }), { status: 500, headers: json })
  }

  const courses = (data ?? []).map(c => ({
    ...c,
    is_full: c.max_capacity !== null && c.enrolled_count >= c.max_capacity,
  }))

  return new Response(JSON.stringify({ courses }), { status: 200, headers: json })
})
