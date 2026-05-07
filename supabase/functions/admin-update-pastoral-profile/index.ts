// ============================================================
// admin-update-pastoral-profile
// POST — atualiza perfil pastoral de uma igreja via cockpit admin.
//
// Contexto: TabPastoral no /admin/churches/:id chama esta EF
// para editar o church_pastoral_profile. Diferente do wizard do pastor
// (upsert_church_onboarding_pastoral), esta EF:
//   - Valida is_ekthos_admin server-side
//   - NÃO altera churches.onboarding_step (efeito exclusivo do wizard)
//   - Grava admin_events de forma síncrona (não fire-and-forget)
//
// verify_jwt: false — valida JWT manualmente.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY         = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://ekthosai.com',
  'https://www.ekthosai.com',
]

const VALID_ESTILOS = ['formal', 'casual', 'intermediario'] as const
type EstiloComunicacao = typeof VALID_ESTILOS[number]

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}

function json(data: unknown, status = 200, origin: string | null = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin')

  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: corsHeaders(origin) })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405, origin)
  }

  // ── 1. Auth: admin only ──────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401, origin)

  // supabaseAuth: usa anon key para validar o JWT do usuário corretamente
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser()
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401, origin)

  const isAdmin = user.app_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403, origin)

  // supabaseAdmin: service_role para operações de dados
  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // ── 2. Parse body ────────────────────────────────────────────
  let body: {
    church_id?: string
    pastoral_data?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400, origin)
  }

  const { church_id, pastoral_data } = body
  if (!church_id || !pastoral_data) {
    return json({ error: 'validation_error: church_id e pastoral_data são obrigatórios' }, 400, origin)
  }

  // ── 3. Validar e normalizar campos ───────────────────────────
  const rawEstilo      = typeof pastoral_data.estilo_comunicacao === 'string'
    ? pastoral_data.estilo_comunicacao.trim() || null
    : null
  const horarios_culto              = typeof pastoral_data.horarios_culto === 'string'
    ? pastoral_data.horarios_culto.trim() || null : null
  const maior_desafio               = typeof pastoral_data.maior_desafio === 'string'
    ? pastoral_data.maior_desafio.trim() || null : null
  const foco_pastoral_30_dias       = typeof pastoral_data.foco_pastoral_30_dias === 'string'
    ? pastoral_data.foco_pastoral_30_dias.trim() || null : null
  const algo_importante_comunidade  = typeof pastoral_data.algo_importante_comunidade === 'string'
    ? pastoral_data.algo_importante_comunidade.trim() || null : null

  // Valida estilo_comunicacao se fornecido
  if (rawEstilo !== null && !(VALID_ESTILOS as readonly string[]).includes(rawEstilo)) {
    return json({
      error: `validation_error: estilo_comunicacao deve ser ${VALID_ESTILOS.join(', ')}`,
    }, 400, origin)
  }
  const estilo_comunicacao = rawEstilo as EstiloComunicacao | null

  // ── 4. Fetch estado anterior (before) ────────────────────────
  const { data: beforeData } = await supabaseAdmin
    .from('church_pastoral_profile')
    .select('estilo_comunicacao, horarios_culto, maior_desafio, foco_pastoral_30_dias, algo_importante_comunidade')
    .eq('church_id', church_id)
    .maybeSingle()

  // ── 5. UPSERT church_pastoral_profile (NÃO toca onboarding_step) ──
  const { data: upserted, error: upsertErr } = await supabaseAdmin
    .from('church_pastoral_profile')
    .upsert(
      {
        church_id,
        estilo_comunicacao,
        horarios_culto,
        maior_desafio,
        foco_pastoral_30_dias,
        algo_importante_comunidade,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'church_id' }
    )
    .select()
    .single()

  if (upsertErr) {
    console.error('[admin-update-pastoral-profile] upsert failed:', upsertErr.message)
    return json({ error: 'db_error: falha ao salvar perfil pastoral' }, 500, origin)
  }

  // ── 6. Registrar admin_events (síncrono, server-side) ───────
  const { error: auditErr } = await supabaseAdmin
    .from('admin_events')
    .insert({
      church_id,
      admin_user_id: user.id,
      action: 'admin_update_pastoral_profile',
      before: beforeData
        ? {
            estilo_comunicacao: (beforeData as Record<string, unknown>).estilo_comunicacao,
            horarios_culto:     (beforeData as Record<string, unknown>).horarios_culto,
          }
        : null,
      after: { estilo_comunicacao, horarios_culto },
    })

  if (auditErr) {
    console.error('[admin-update-pastoral-profile] audit insert failed:', auditErr.message)
  }

  return json({ success: true, pastoral_profile: upserted }, 200, origin)
})
