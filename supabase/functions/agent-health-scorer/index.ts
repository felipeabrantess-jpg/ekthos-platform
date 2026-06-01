// ============================================================
// Edge Function: agent-health-scorer  v1
// Calcula health score por pessoa para uma ou todas as igrejas.
// POST { church_id?: uuid }  (sem church_id = processa todas)
// Chamado via cron: 0 5 * * *  (02h BRT / 05h UTC)
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const BATCH_SIZE = 100

// Peso: activity 70% + status bonus 30%
function calcScore(person: {
  last_contact_at: string | null
  last_attendance_at: string | null
  church_relationship: string | null
}): { score: number; components: Record<string, number> } {
  const now = Date.now()
  const lastActivity = Math.max(
    person.last_contact_at ? new Date(person.last_contact_at).getTime() : 0,
    person.last_attendance_at ? new Date(person.last_attendance_at).getTime() : 0,
  )

  // Activity score: 100 se ativo nos últimos 7d, decaindo até 0 em 90d
  const daysSince = lastActivity > 0 ? (now - lastActivity) / 86400000 : 90
  const activityScore = Math.max(0, Math.round(100 - (daysSince / 90) * 100))

  // Status bonus
  const statusBonus: Record<string, number> = {
    lider: 30,
    membro: 20,
    congregado: 10,
    visitante: 5,
  }
  const bonus = statusBonus[person.church_relationship ?? ''] ?? 0

  const score = Math.min(100, Math.round(activityScore * 0.7 + bonus))

  return {
    score,
    components: {
      activity: activityScore,
      status_bonus: bonus,
      days_since_contact: Math.round(daysSince),
    },
  }
}

async function processChurch(churchId: string): Promise<{ processed: number; errors: number }> {
  let offset = 0
  let processed = 0
  let errors = 0

  while (true) {
    const { data: people, error } = await supabase
      .from('people')
      .select('id, last_contact_at, last_attendance_at, church_relationship')
      .eq('church_id', churchId)
      .range(offset, offset + BATCH_SIZE - 1)

    if (error || !people || people.length === 0) break

    const upserts = people.map(p => {
      const { score, components } = calcScore(p)
      return {
        church_id: churchId,
        person_id: p.id,
        score,
        components,
        calculated_at: new Date().toISOString(),
      }
    })

    const { error: upsertErr } = await supabase
      .from('health_scores')
      .upsert(upserts, { onConflict: 'church_id,person_id', ignoreDuplicates: false })

    if (upsertErr) {
      console.error(`[agent-health-scorer] batch upsert error church=${churchId}:`, upsertErr)
      errors += people.length
    } else {
      processed += people.length
    }

    if (people.length < BATCH_SIZE) break
    offset += BATCH_SIZE
  }

  return { processed, errors }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204 })

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {}
    const { church_id } = body

    let totalProcessed = 0
    let totalErrors = 0
    const results: Record<string, { processed: number; errors: number }> = {}

    if (church_id) {
      const r = await processChurch(church_id)
      results[church_id] = r
      totalProcessed = r.processed
      totalErrors = r.errors
    } else {
      // Processar todas as igrejas ativas
      const { data: churches } = await supabase
        .from('churches')
        .select('id')
        .eq('status', 'active')

      for (const ch of churches ?? []) {
        const r = await processChurch(ch.id)
        results[ch.id] = r
        totalProcessed += r.processed
        totalErrors += r.errors
      }
    }

    console.log(`[agent-health-scorer v1] processed=${totalProcessed} errors=${totalErrors}`)

    return new Response(JSON.stringify({ ok: true, total_processed: totalProcessed, total_errors: totalErrors, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    console.error('[agent-health-scorer v1]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
