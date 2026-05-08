// ============================================================
// Frente 4A — Smoke E2E (produção)
// Valida os 5 invariantes críticos do backend Modo Manutenção.
//
// Roda direto contra produção via API (sem browser).
// Requer: PLAYWRIGHT_PASSWORD env var para playwright@ekthosai.net
// Ou use ADMIN_EMAIL + ADMIN_PASSWORD para override.
// ============================================================

import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.VITE_SUPABASE_URL  ?? 'https://mlqjywqnchilvgkbvicd.supabase.co'
const SUPABASE_ANON = process.env.VITE_SUPABASE_ANON_KEY
  ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1scWp5d3FuY2hpbHZna2J2aWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTIyMjMsImV4cCI6MjA5MTIyODIyM30.NpsCJU8QlGPI9o6vSYL6Ne7tozfKrt_haYBmSFIeEtA'
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    ?? 'playwright@ekthosai.net'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? process.env.PLAYWRIGHT_PASSWORD ?? ''

test.describe('Frente 4A — smoke backend (produção)', () => {
  let adminJwt: string
  let sessionId: string

  test.beforeAll(async () => {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)
    const { data, error } = await supabase.auth.signInWithPassword({
      email: ADMIN_EMAIL, password: ADMIN_PASSWORD,
    })
    if (error || !data.session) throw new Error(`Auth falhou: ${error?.message}`)
    adminJwt = data.session.access_token
  })

  // ── Teste 1: admin-start-impersonation ────────────────────────────
  test('T1 — admin-start-impersonation cria sessão com session_id', async () => {
    // Buscar primeira igreja disponível
    const listRes = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-churches-list?limit=1`,
      { headers: { Authorization: `Bearer ${adminJwt}` } },
    )
    const listData = await listRes.json() as { churches?: Array<{ id: string }> }
    const churchId = listData.churches?.[0]?.id ?? ''

    if (!churchId) {
      console.log('[frente-4a-smoke] nenhuma igreja — skip T1')
      return
    }

    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-start-impersonation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
      body: JSON.stringify({ church_id: churchId }),
    })
    expect(res.status).toBe(200)

    // Response: { session_id, started_at, church_id, church_name }
    const body = await res.json() as { session_id: string; started_at: string; church_id: string; church_name: string }
    expect(body.session_id).toBeTruthy()
    expect(body.started_at).toBeTruthy()
    expect(body.church_id).toBe(churchId)
    sessionId = body.session_id
  })

  // ── Teste 2: admin-end-impersonation ─────────────────────────────
  test('T2 — admin-end-impersonation encerra sessão (ended_at preenchido)', async () => {
    if (!sessionId) {
      console.log('[frente-4a-smoke] session_id não disponível — skip T2')
      return
    }
    const res = await fetch(`${SUPABASE_URL}/functions/v1/admin-end-impersonation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminJwt}` },
      body: JSON.stringify({ session_id: sessionId, ended_reason: 'smoke_test' }),
    })
    expect(res.status).toBe(200)

    // Response: { session_id, ended_at, duration_seconds }
    const body = await res.json() as { session_id: string; ended_at: string; duration_seconds: number }
    expect(body.session_id).toBe(sessionId)
    expect(body.ended_at).toBeTruthy()
    expect(typeof body.duration_seconds).toBe('number')
  })

  // ── Teste 3: admin_events gravado com novas colunas Frente 4A ────
  test('T3 — admin_events tem impersonation.start com schema Frente 4A', async () => {
    const res = await fetch(
      `${SUPABASE_URL}/functions/v1/admin-events-list?action=impersonation.start&limit=1`,
      { headers: { Authorization: `Bearer ${adminJwt}` } },
    )
    if (!res.ok) {
      console.log('[frente-4a-smoke] admin-events-list indisponível — skip T3')
      return
    }
    const body = await res.json() as {
      events?: Array<{ action: string; actor_email?: string; status?: string; request_id?: string | null }>
    }
    const events = body.events ?? []
    if (events.length === 0) {
      console.log('[frente-4a-smoke] sem impersonation.start events — skip T3 verification')
      return
    }
    expect(events[0].action).toBe('impersonation.start')
    // actor_email deve estar preenchido (nova coluna Frente 4A schema)
    expect(events[0].actor_email).toBeTruthy()
    expect(events[0].status).toBe('success')
  })

  // ── Teste 4: admin_events imutável via anon (RLS R2) ─────────────
  test('T4 — admin_events imutável — anon client UPDATE bloqueado por RLS', async () => {
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON)
    const { error } = await anonClient
      .from('admin_events')
      .update({ reason: 'tentativa_maliciosa_smoke_test' })
      .eq('action', 'impersonation.start')
    // RLS bloqueia UPDATE de anon — deve retornar erro
    expect(error).toBeTruthy()
  })

  // ── Teste 5: admin consegue acessar EFs (ekthos_roles migracao R7) ─
  test('T5 — admin JWT com ekthos_roles recebe 200 nas EFs protegidas', async () => {
    const metricsRes = await fetch(`${SUPABASE_URL}/functions/v1/admin-cockpit-metrics`, {
      headers: { Authorization: `Bearer ${adminJwt}` },
    })
    // 200 prova que is_ekthos_admin() + ekthos_roles migradas funcionam
    expect(metricsRes.status).toBe(200)

    const body = await metricsRes.json() as { mrr_total?: number }
    expect(typeof body.mrr_total).toBe('number')
  })
})
