// ============================================================
// Edge Function: export-financeiro  v1
// GET ?start=YYYY-MM-DD&end=YYYY-MM-DD
// Retorna CSV com BOM UTF-8 das doações do período.
// Auth: Bearer JWT do usuário (church_id via app_metadata)
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
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  }
}

function fmtBRL(amount: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)
}

function escapeCSV(val: unknown): string {
  const s = val == null ? '' : String(val)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin') || ''
  const headers = corsHeaders(origin)

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })

  try {
    // Auth
    const token = (req.headers.get('authorization') ?? '').replace('Bearer ', '')
    if (!token) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const { data: { user } } = await supabase.auth.getUser(token)
    if (!user) return new Response(JSON.stringify({ error: 'invalid token' }), { status: 401, headers: { ...headers, 'Content-Type': 'application/json' } })

    const churchId = user.app_metadata?.church_id
    if (!churchId) return new Response(JSON.stringify({ error: 'no church_id' }), { status: 403, headers: { ...headers, 'Content-Type': 'application/json' } })

    const url = new URL(req.url)
    const start = url.searchParams.get('start')
    const end = url.searchParams.get('end')

    let query = supabase
      .from('donations')
      .select('id, created_at, amount, currency, type, payment_method, status, confirmed_at, notes, people(name)')
      .eq('church_id', churchId)
      .order('created_at', { ascending: false })
      .limit(5000)

    if (start) query = query.gte('created_at', start)
    if (end) query = query.lte('created_at', end + 'T23:59:59')

    const { data: donations, error } = await query
    if (error) throw error

    // Build CSV
    const cols = ['Data', 'Membro', 'Valor', 'Tipo', 'Forma de pagamento', 'Status', 'Confirmado em', 'Notas']
    const rows = (donations ?? []).map(d => {
      const person = (d.people as unknown as { name: string } | null)
      // Detect if amount is in centavos or decimal (auto-detect: >10000 presumed centavos)
      const amountNum = typeof d.amount === 'number' ? d.amount : parseFloat(d.amount)
      const displayAmount = amountNum > 10000 ? amountNum / 100 : amountNum

      return [
        new Date(d.created_at).toLocaleDateString('pt-BR'),
        person?.name ?? '—',
        fmtBRL(displayAmount),
        d.type ?? '—',
        d.payment_method ?? '—',
        d.status ?? '—',
        d.confirmed_at ? new Date(d.confirmed_at).toLocaleDateString('pt-BR') : '—',
        d.notes ?? '',
      ].map(escapeCSV).join(',')
    })

    const csvContent = [cols.join(','), ...rows].join('\n')
    const BOM = '﻿'
    const filename = `financeiro-${start ?? 'all'}-${end ?? 'all'}.csv`

    return new Response(BOM + csvContent, {
      status: 200,
      headers: {
        ...headers,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    })

  } catch (err: unknown) {
    console.error('[export-financeiro v1]', err)
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    })
  }
})
