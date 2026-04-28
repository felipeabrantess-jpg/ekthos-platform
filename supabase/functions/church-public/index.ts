// ============================================================
// Edge Function: church-public
// Retorna dados públicos de uma church para a landing de visitantes.
//
// GET /functions/v1/church-public?slug=<slug>
// verify_jwt = false — chamado pela VisitorLanding sem auth
//
// Retorna APENAS: name, logo_url, primary_color, whatsapp_number_display
// NUNCA expõe: email, cnpj, admin_id, status, api_tokens, etc.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL     = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://www.ekthosai.com',
  'https://ekthosai.com',
  'https://ekthosai.net',
  'https://www.ekthosai.net',
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

  const url  = new URL(req.url)
  const slug = url.searchParams.get('slug')?.trim()

  if (!slug) {
    return new Response(JSON.stringify({ error: 'slug obrigatório' }), { status: 400, headers: json })
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Resolver church via qr_codes (slug ativo) → churches
  const { data } = await supabase
    .from('qr_codes')
    .select('churches(id, name, logo_url, primary_color)')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  // Slug inválido → 404 silencioso (não expõe se slug existe)
  if (!data || !data.churches) {
    return new Response(
      JSON.stringify({ found: false }),
      { status: 404, headers: json }
    )
  }

  const church = data.churches as {
    id: string
    name: string
    logo_url: string | null
    primary_color: string | null
  }

  // Buscar whatsapp_contact em church_settings (campo público opcional)
  let whatsappDisplay: string | null = null
  const { data: settings } = await supabase
    .from('church_settings')
    .select('whatsapp_contact')
    .eq('church_id', church.id)
    .maybeSingle()

  if (settings?.whatsapp_contact) {
    // Retorna apenas dígitos (E.164 sem +), ex: "5511999990000"
    // O cliente monta a URL: https://wa.me/<numero>?text=...
    const digits = String(settings.whatsapp_contact).replace(/\D/g, '')
    whatsappDisplay = digits.length >= 10 ? digits : null
  }

  return new Response(
    JSON.stringify({
      found:                    true,
      name:                     church.name,
      logo_url:                 church.logo_url,
      primary_color:            church.primary_color,
      whatsapp_number_display:  whatsappDisplay,
    }),
    { status: 200, headers: json }
  )
})
