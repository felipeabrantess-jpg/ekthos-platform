// ============================================================
// Edge Function: admin-cockpit-sell  v1
// Ativa agentes e/ou módulos para uma igreja via cockpit admin.
// POST {
//   church_id: uuid,
//   agents?: Array<{ slug: string, grant_type: 'courtesy'|'trial', trial_days?: number }>,
//   modules?: string[]
// }
// Auth: Bearer JWT de ekthos_admin
// Registra em admin_events. NÃO mexe em dados CRM da igreja.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGIN            = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function corsHeaders(origin: string) {
  const allowed = [ALLOWED_ORIGIN, 'http://localhost:5173', 'http://localhost:3000']
  const o = allowed.includes(origin) ? origin : ALLOWED_ORIGIN
  return {
    'Access-Control-Allow-Origin': o,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || ''
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })

  try {
    // Auth: apenas ekthos_admin
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
    if (!token) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const isAdmin = user.app_metadata?.is_ekthos_admin === true
    if (!isAdmin) return new Response(JSON.stringify({ error: 'forbidden: ekthos_admin only' }), { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } })

    const { church_id, agents = [], modules = [] } = await req.json()

    if (!church_id) return new Response(JSON.stringify({ error: 'missing church_id' }), { status: 400, headers: { ...headers, 'Content-Type': 'application/json' } })

    // Verificar que igreja existe
    const { data: church } = await supabase.from('churches').select('id, name').eq('id', church_id).maybeSingle()
    if (!church) return new Response(JSON.stringify({ error: 'church not found' }), { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } })

    const activated: string[] = []
    const errors: string[] = []

    // Ativar agentes
    for (const agent of agents) {
      const { slug, grant_type, trial_days } = agent
      if (!slug || !grant_type) { errors.push(`invalid agent entry: ${JSON.stringify(agent)}`); continue }

      try {
        // Usar activate_agent_internal (SECURITY DEFINER sem guard)
        const { error: rpcErr } = await supabase.rpc('activate_agent_internal', {
          p_church_id: church_id,
          p_agent_slug: slug,
          p_source: `cockpit_sell:${user.id}`,
        })

        if (rpcErr) throw rpcErr

        // Criar agent_grant se courtesy ou trial
        const endsAt = grant_type === 'trial' && trial_days
          ? new Date(Date.now() + trial_days * 86400000).toISOString()
          : null

        await supabase.from('agent_grants').insert({
          church_id,
          agent_slug: slug,
          grant_type,
          granted_by: user.id,
          starts_at: new Date().toISOString(),
          ends_at: endsAt,
        }).catch(() => null) // non-fatal se já existir

        activated.push(`agent:${slug}`)
      } catch (e: unknown) {
        errors.push(`agent:${slug}: ${String(e)}`)
      }
    }

    // Ativar módulos
    if (modules.length > 0) {
      try {
        // Merge jsonb em enabled_modules
        const modulesObj = Object.fromEntries(modules.map((m: string) => [m, true]))
        const { data: churchData } = await supabase.from('churches').select('enabled_modules').eq('id', church_id).maybeSingle()
        const currentModules = (churchData?.enabled_modules as Record<string, unknown>) ?? {}
        const merged = { ...currentModules, ...modulesObj }

        await supabase.from('churches').update({ enabled_modules: merged }).eq('id', church_id)
        activated.push(...modules.map((m: string) => `module:${m}`))
      } catch (e: unknown) {
        errors.push(`modules: ${String(e)}`)
      }
    }

    // Audit log
    await supabase.from('admin_events').insert({
      church_id,
      admin_user_id: user.id,
      action: 'cockpit_sell',
      before: {},
      after: { activated },
      reason: `Cockpit sell: ${activated.join(', ')}`,
      actor_email: user.email,
    }).catch(() => null)

    return new Response(JSON.stringify({ ok: true, activated, errors, church: church.name }), {
      status: 200,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })

  } catch (err: unknown) {
    console.error('[admin-cockpit-sell v1]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
})
