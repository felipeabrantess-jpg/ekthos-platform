// ============================================================
// Edge Function: admin-church-create
// Cria uma nova igreja no cockpit admin, sem depender do Stripe.
// Campos stripe ficam NULL — serão preenchidos quando a igreja
// confirmar pagamento.
//
// POST /admin-church-create
// Body: { name, admin_email, city?, state?, timezone?, plan_slug }
// Headers: Authorization: Bearer <supabase-jwt> (is_ekthos_admin)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

interface CreateChurchBody {
  name:        string
  admin_email: string
  city?:       string
  state?:      string
  timezone?:   string
  plan_slug?:  string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return new Response('Method Not Allowed', { status: 405, headers: CORS })

  // ── Auth ──────────────────────────────────────────────────
  const token = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401)

  const isAdmin =
    user.app_metadata?.is_ekthos_admin === true ||
    user.user_metadata?.is_ekthos_admin === true
  if (!isAdmin) return json({ error: 'Forbidden' }, 403)

  // ── Parse body ────────────────────────────────────────────
  let body: CreateChurchBody
  try {
    body = await req.json() as CreateChurchBody
  } catch {
    return json({ error: 'Body inválido' }, 400)
  }

  const { name, admin_email, city, state, timezone, plan_slug } = body

  if (!name?.trim())        return json({ error: 'name é obrigatório' }, 400)
  if (!admin_email?.trim()) return json({ error: 'admin_email é obrigatório' }, 400)

  const tz        = timezone  ?? 'America/Sao_Paulo'
  const planSlug  = plan_slug ?? 'chamado'

  // ── 1. Busca o plan_id pelo slug ──────────────────────────
  const { data: plan, error: planErr } = await supabase
    .from('plans')
    .select('id, slug')
    .eq('slug', planSlug)
    .maybeSingle()

  if (planErr || !plan) {
    return json({ error: `Plano "${planSlug}" não encontrado` }, 400)
  }

  // ── 2. Cria a igreja ──────────────────────────────────────
  const { data: church, error: churchErr } = await supabase
    .from('churches')
    .insert({
      name:     name.trim(),
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

  // ── 3. Cria assinatura em trial (sem Stripe) ──────────────
  const trialEnd = new Date()
  trialEnd.setDate(trialEnd.getDate() + 7)

  const { error: subErr } = await supabase
    .from('subscriptions')
    .insert({
      church_id:              church.id,
      plan_id:                plan.id,
      plan_slug:              plan.slug,
      status:                 'trialing',
      trial_ends_at:          trialEnd.toISOString(),
      stripe_subscription_id: null,
      stripe_customer_id:     null,
      cancel_at_period_end:   false,
    })

  if (subErr) {
    console.error('[admin-church-create] subscription insert:', subErr)
    // Rollback: remove a igreja criada
    await supabase.from('churches').delete().eq('id', church.id)
    return json({ error: 'Erro ao criar assinatura' }, 500)
  }

  // ── 4. Convida o admin via invite (não cria conta — o pastor ativa) ──
  const { error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
    admin_email.trim(),
    {
      data: {
        church_id:     church.id,
        invited_as:    'admin',
        church_name:   church.name,
      },
      redirectTo: `${ALLOWED_ORIGIN}/onboarding`,
    }
  )

  if (inviteErr) {
    // Convite falhou: não é crítico, apenas loga
    console.warn('[admin-church-create] invite failed:', inviteErr.message)
  }

  // ── 5. Registra em admin_events ───────────────────────────
  await supabase.from('admin_events').insert({
    church_id:     church.id,
    admin_user_id: user.id,
    action:        'church_created',
    after: {
      name:        church.name,
      plan_slug:   planSlug,
      admin_email: admin_email.trim(),
      invite_sent: !inviteErr,
    },
    reason: 'Criação manual via cockpit admin',
  })

  return json({
    church_id:   church.id,
    name:        church.name,
    status:      church.status,
    created_at:  church.created_at,
    invite_sent: !inviteErr,
  }, 201)
})
