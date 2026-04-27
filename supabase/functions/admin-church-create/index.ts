// ============================================================
// Edge Function: admin-church-create v3
// Caminho B — Cria nova igreja sem Stripe (trial manual 7 dias)
//
// Fluxo:
//   1. Valida JWT do admin Ekthos
//   2. Cria church com status='onboarding'
//   3. Cria subscription status='trialing', billing_origin='cockpit_manual'
//   4. Cria access_grant tipo 'manual_trial' (7 dias) via grant_access()
//   5. Convida pastor via inviteUserByEmail (redirectTo=/auth/set-password)
//   6. Insere user_roles role='admin' para o pastor
//   7. Atualiza app_metadata do pastor com church_id e role
//   8. Registra evento em admin_events
//
// Rollback automático:
//   - Falha no grant  → deleta sub + church
//   - Falha no invite → deleta grant + sub + church
//   - Falha em user_roles → loga warning, não rollback (igreja já criada, invite já enviado)
//
// verify_jwt: false — valida manualmente (admin only)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

// DB client (service_role — bypassa RLS)
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Auth client separado — exclusivo para auth.getUser(token)
// Nunca misturar com o cliente DB (CLAUDE.md regra 6)
const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

function slugify(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// ── Rollback helpers ─────────────────────────────────────────

async function deleteGrant(churchId: string) {
  await supabase.from('access_grants').delete().eq('church_id', churchId)
}

async function deleteSub(churchId: string) {
  await supabase.from('subscriptions').delete().eq('church_id', churchId)
}

async function deleteChurch(churchId: string) {
  await supabase.from('churches').delete().eq('id', churchId)
}

// ── Handler principal ─────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method Not Allowed' }, 405)

  // ── 0. Auth: valida JWT e confirma admin Ekthos ────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabaseAuth.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // ── 1. Parse body ─────────────────────────────────────────
  let body: {
    name?:                    string
    admin_email?:             string
    city?:                    string
    state?:                   string
    timezone?:                string
    plan_slug?:               string
    custom_plan_price_cents?: number | null
    custom_user_price_cents?: number | null
    custom_agent_price_cents?: number | null
    price_notes?:             string | null
  }
  try { body = await req.json() }
  catch { return json({ error: 'Body inválido' }, 400) }

  const {
    name,
    admin_email,
    city,
    state,
    timezone,
    plan_slug,
    custom_plan_price_cents  = null,
    custom_user_price_cents  = null,
    custom_agent_price_cents = null,
    price_notes              = null,
  } = body

  if (!name?.trim())        return json({ error: 'name é obrigatório' }, 400)
  if (!admin_email?.trim()) return json({ error: 'admin_email é obrigatório' }, 400)

  const churchName  = name.trim()
  const pastorEmail = admin_email.trim()
  const tz          = timezone ?? 'America/Sao_Paulo'
  const planSlug    = plan_slug ?? 'chamado'

  // ── 2. Busca plano ────────────────────────────────────────
  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .select('slug, name, price_cents')
    .eq('slug', planSlug)
    .maybeSingle()

  if (planErr || !plan) return json({ error: `Plano "${planSlug}" não encontrado` }, 400)

  // ── 3. Cria church com status='onboarding' ────────────────
  // BUG FIX 1: era 'pending_payment' — correto para Caminho B é 'onboarding'
  // Slug gerado a partir do nome — onboarding-engineer step 1 sobrescreve com slug definitivo
  const baseSlug = slugify(churchName)
  const uniqueSlug = `${baseSlug}-${Date.now().toString(36)}`

  const { data: church, error: churchErr } = await supabase
    .from('churches')
    .insert({
      name:     churchName,
      slug:     uniqueSlug,
      city:     city?.trim()  ?? null,
      state:    state?.trim() ?? null,
      timezone: tz,
      status:   'onboarding',
    })
    .select('id, name, status, created_at')
    .single()

  if (churchErr || !church) {
    console.error('[admin-church-create] church insert:', churchErr)
    return json({ error: 'Erro ao criar igreja' }, 500)
  }

  // ── 4. Cria subscription (trial manual, sem Stripe) ───────
  const trialEnd = new Date()
  trialEnd.setDate(trialEnd.getDate() + 7)

  const effectivePrice = custom_plan_price_cents ?? plan.price_cents

  const { error: subErr } = await supabase
    .from('subscriptions')
    .insert({
      church_id:               church.id,
      plan_slug:               plan.slug,
      status:                  'trialing',
      billing_origin:          'cockpit_manual',
      trial_end:               trialEnd.toISOString(),
      effective_price_cents:   effectivePrice,
      discount_cents:          0,
      created_by:              user.id,
      internal_notes:          'Criada via cockpit — trial manual 7 dias. Cobrança offline.',
      custom_plan_price_cents,
      custom_user_price_cents,
      custom_agent_price_cents,
      price_notes,
      cancel_at_period_end:    false,
    } as any)

  if (subErr) {
    console.error('[admin-church-create] subscription insert:', subErr)
    await deleteChurch(church.id)
    return json({ error: 'Erro ao criar assinatura' }, 500)
  }

  // ── 5. Cria access_grant manual_trial 7 dias ──────────────
  // grant_type: 'manual_trial' (CHECK constraint válido)
  // source: 'cockpit' (CHECK constraint válido — 'cockpit_create' não existe)
  // p_granted_by: user.id (assinatura real da função — não 'p_created_by')
  const { error: grantErr } = await supabase
    .rpc('grant_access', {
      p_church_id:        church.id,
      p_plan_slug:        plan.slug,
      p_grant_type:       'manual_trial',
      p_source:           'cockpit',
      p_starts_at:        new Date().toISOString(),
      p_ends_at:          trialEnd.toISOString(),
      p_granted_by:       user.id,
      p_notes:            'Trial 7 dias gerado automaticamente ao criar igreja via cockpit',
      p_converts_to_paid: false,
    })

  if (grantErr) {
    console.error('[admin-church-create] grant_access:', grantErr)
    await deleteSub(church.id)
    await deleteChurch(church.id)
    return json({ error: 'Falha ao criar grant de trial: ' + grantErr.message }, 500)
  }

  // ── 6. Convida o pastor ───────────────────────────────────
  // BUG FIX 2: era redirectTo='/payment-pending' — correto para Caminho B é '/auth/set-password'
  const { data: inviteData, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    pastorEmail,
    {
      redirectTo: `${ALLOWED_ORIGIN}/auth/set-password`,
      data: {
        church_id:    church.id,
        invited_as:   'admin',
        church_name:  churchName,
      },
    },
  )

  if (inviteErr || !inviteData?.user) {
    console.error('[admin-church-create] invite failed:', inviteErr?.message)
    await deleteGrant(church.id)
    await deleteSub(church.id)
    await deleteChurch(church.id)
    return json({ error: 'Falha ao enviar invite: ' + (inviteErr?.message ?? 'sem retorno de user') }, 500)
  }

  const pastorId = inviteData.user.id

  // ── 7. Cria user_roles role='admin' para o pastor ─────────
  // BUG FIX 3: era ausente — onboarding-engineer precisa de user_roles para resolver churchId
  const { error: roleErr } = await supabase
    .from('user_roles')
    .insert({
      user_id:   pastorId,
      church_id: church.id,
      role:      'admin',
    } as any)

  if (roleErr) {
    // Não faz rollback: pastor já recebeu invite, igreja já existe
    // Logar warning — equipe pode corrigir manualmente
    console.warn('[admin-church-create] Falha ao criar user_role (não fatal):', roleErr.message)
  }

  // ── 8. Atualiza app_metadata do pastor ────────────────────
  // Coloca church_id em app_metadata para auth_church_id() ler corretamente (RLS)
  // CLAUDE.md armadilha 13: auth_church_id() lê APENAS app_metadata
  const { error: metaErr } = await supabase.auth.admin.updateUserById(pastorId, {
    app_metadata: {
      church_id: church.id,
      role:      'admin',
      provider:  'email',
      providers: ['email'],
    },
  })

  if (metaErr) {
    console.warn('[admin-church-create] Falha ao atualizar app_metadata (não fatal):', metaErr.message)
  }

  // ── 9. Registra evento ────────────────────────────────────
  await supabase.from('admin_events').insert({
    church_id:     church.id,
    admin_user_id: user.id,
    action:        'church_created',
    after: {
      name:                    churchName,
      plan_slug:               planSlug,
      admin_email:             pastorEmail,
      pastor_id:               pastorId,
      invite_sent:             true,
      billing_origin:          'cockpit_manual',
      trial_days:              7,
      custom_plan_price_cents,
    },
    reason: 'Criação manual via cockpit admin — trial manual 7 dias',
  })

  return json({
    success:     true,
    church_id:   church.id,
    user_id:     pastorId,
    invite_sent: true,
  }, 201)
})
