// ============================================================
// Edge Function: igv-public-groups  (verify_jwt = false)
//
// Expõe dados PÚBLICOS dos grupos/células da IGV para o PWA /igv/celulas.
//
// GET /functions/v1/igv-public-groups
//
// Retorna SOMENTE campos públicos dos grupos ativos da IGV:
//   id, name, meeting_day, meeting_time, location, notes, status
//
// LGPD: zero SELECT em people. Zero exposição de dados pessoais de membros.
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
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: json }
    )
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data, error } = await supabase
    .from('groups')
    .select('id, name, meeting_day, meeting_time, location, notes, status')
    .eq('church_id', IGV_CHURCH_ID)
    .eq('status', 'active')
    .order('name', { ascending: true })

  if (error) {
    console.error('[igv-public-groups] DB error:', error.message)
    return new Response(
      JSON.stringify({ error: 'Falha ao carregar grupos' }),
      { status: 500, headers: json }
    )
  }

  return new Response(
    JSON.stringify({ groups: data ?? [] }),
    { status: 200, headers: json }
  )
})
