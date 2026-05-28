// ============================================================
// admin-update-contractor
// POST — atualiza dados do contratante de uma igreja via cockpit admin.
//
// Contexto: TabContratante no /admin/churches/:id chama esta EF
// para editar o contratante ativo. Diferente do wizard do pastor
// (upsert_church_cadastro_cristalino), esta EF:
//   - Valida is_ekthos_admin server-side
//   - NÃO muda onboarding_step
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
    contractor_data?: Record<string, unknown>
  }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_json' }, 400, origin)
  }

  const { church_id, contractor_data } = body
  if (!church_id || !contractor_data) {
    return json({ error: 'validation_error: church_id e contractor_data são obrigatórios' }, 400, origin)
  }

  // ── 3. Validar campos ────────────────────────────────────────
  const name            = typeof contractor_data.name === 'string'            ? contractor_data.name.trim()            : ''
  const document_type   = typeof contractor_data.document_type === 'string'   ? contractor_data.document_type          : ''
  const document_number = typeof contractor_data.document_number === 'string' ? contractor_data.document_number.replace(/\D/g, '') : ''
  const person_type     = typeof contractor_data.person_type === 'string'     ? contractor_data.person_type            : ''
  const role_label      = typeof contractor_data.role_label === 'string'      ? contractor_data.role_label.trim()      : ''
  const email           = typeof contractor_data.email === 'string'           ? contractor_data.email.trim()  || null  : null
  const phone           = typeof contractor_data.phone === 'string'           ? contractor_data.phone.trim()  || null  : null
  const notes           = typeof contractor_data.notes === 'string'           ? contractor_data.notes.trim()  || null  : null

  if (!name)        return json({ error: 'validation_error: name é obrigatório' }, 400, origin)
  if (!role_label)  return json({ error: 'validation_error: role_label é obrigatório' }, 400, origin)
  if (!['cpf', 'cnpj'].includes(document_type))
    return json({ error: 'validation_error: document_type deve ser cpf ou cnpj' }, 400, origin)
  if (!['pf', 'pj'].includes(person_type))
    return json({ error: 'validation_error: person_type deve ser pf ou pj' }, 400, origin)
  if (document_type === 'cpf'  && !/^\d{11}$/.test(document_number))
    return json({ error: 'validation_error: CPF deve ter 11 dígitos' }, 400, origin)
  if (document_type === 'cnpj' && !/^\d{14}$/.test(document_number))
    return json({ error: 'validation_error: CNPJ deve ter 14 dígitos' }, 400, origin)

  // ── 4. Fetch estado anterior (before) ────────────────────────
  const { data: beforeData } = await supabaseAdmin
    .from('contractors')
    .select('id, name, document_type, document_number, person_type, role_label, email, phone')
    .eq('church_id', church_id)
    .eq('is_active', true)
    .maybeSingle()

  // ── 5. Upsert contratante via service_role ──────────────────
  let updatedContractor: Record<string, unknown>

  if (beforeData) {
    // UPDATE do contratante ativo existente (sem mudar onboarding_step)
    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('contractors')
      .update({
        name,
        document_type,
        document_number,
        person_type,
        role_label,
        email,
        phone,
        notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', (beforeData as { id: string }).id)
      .select()
      .single()

    if (updateErr) {
      console.error('[admin-update-contractor] update failed:', updateErr.message)
      return json({ error: 'db_error: falha ao atualizar contratante' }, 500, origin)
    }
    updatedContractor = updated as Record<string, unknown>
  } else {
    // INSERT novo contratante (caso church nunca teve contratante)
    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('contractors')
      .insert({
        church_id,
        name,
        document_type,
        document_number,
        person_type,
        role_label,
        email,
        phone,
        notes,
        is_active: true,
        created_by: user.id,
      })
      .select()
      .single()

    if (insertErr) {
      console.error('[admin-update-contractor] insert failed:', insertErr.message)
      return json({ error: 'db_error: falha ao inserir contratante' }, 500, origin)
    }
    updatedContractor = inserted as Record<string, unknown>
  }

  // ── 6. Audit: record_audit_event RPC ────────────────────────────
  const impersonationSessionId = req.headers.get('x-impersonation-session-id') ?? null
  const requestId = req.headers.get('x-request-id') ?? null
  const beforePayload = beforeData
    ? {
        name:            (beforeData as Record<string, unknown>).name,
        document_type:   (beforeData as Record<string, unknown>).document_type,
        document_number: (beforeData as Record<string, unknown>).document_number,
        role_label:      (beforeData as Record<string, unknown>).role_label,
      }
    : null
  const afterPayload = { name, document_type, document_number, role_label }
  const { error: auditErr } = await supabaseAdmin.rpc('record_audit_event', {
    p_church_id:                church_id,
    p_admin_user_id:            user.id,
    p_action:                   'contractor.update',
    p_before:                   beforePayload,
    p_after:                    afterPayload,
    p_reason:                   null,
    p_actor_email:              user.email ?? null,
    p_actor_roles:              (user.app_metadata?.ekthos_roles as string[] | undefined) ?? null,
    p_resource:                 'contractors',
    p_resource_id:              (updatedContractor.id as string) ?? null,
    p_status:                   'success',
    p_error_msg:                null,
    p_impersonation_session_id: impersonationSessionId,
    p_impersonated_church_id:   church_id,
    p_source:                   'cockpit',
    p_request_id:               requestId,
  })
  if (auditErr) console.error('[admin-update-contractor] audit failed:', auditErr.message)

  return json({ success: true, contractor: updatedContractor }, 200, origin)
})
