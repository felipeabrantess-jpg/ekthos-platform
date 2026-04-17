// ============================================================
// Edge Function: onboarding-engineer
// Agente 11 — Engenheiro SaaS da Ekthos
//
// POST /onboarding-engineer
// Headers: Authorization: Bearer <supabase-jwt>
// Body: { session_id: string }
// Returns: { success: boolean, steps_done: number, steps_failed: string[] }
//
// Executa 20 steps sequenciais de configuração do tenant.
// Atualiza onboarding_steps após cada step (Realtime no frontend).
// Tempo alvo: 25-30 segundos total.
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'npm:stripe'

// ── Env ────────────────────────────────────────────────────
const SUPABASE_URL             = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const STRIPE_SECRET_KEY        = Deno.env.get('STRIPE_SECRET_KEY')
const N8N_API_KEY              = Deno.env.get('N8N_API_KEY')
const N8N_BASE_URL             = 'https://ekthosai.app.n8n.cloud/api/v1'
const ALLOWED_ORIGIN           = Deno.env.get('ALLOWED_ORIGIN') || 'https://ekthos-platform.vercel.app'

if (!SUPABASE_URL) throw new Error('[onboarding-engineer] SUPABASE_URL not set')
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('[onboarding-engineer] SUPABASE_SERVICE_ROLE_KEY not set')

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2024-06-20', httpClient: Stripe.createFetchHttpClient() })
  : null

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

// ── Labels dos 20 steps ───────────────────────────────────
const STEP_LABELS: Record<number, string> = {
  1:  'Criando sua igreja...',
  2:  'Registrando sedes e congregações...',
  3:  'Configurando caminho de discipulado...',
  4:  'Criando campos personalizados...',
  5:  'Configurando categorias e segmentos...',
  6:  'Criando departamentos e ministérios...',
  7:  'Estruturando rede de células...',
  8:  'Cadastrando equipe e permissões...',
  9:  'Configurando alertas pastorais...',
  10: 'Ativando Agente Suporte (gratuito)...',
  11: 'Ativando agentes inclusos no plano...',
  12: 'Processando agentes adicionais...',
  13: 'Criando automações no n8n...',
  14: 'Montando dashboard personalizado...',
  15: 'Configurando calendário de cultos...',
  16: 'Criando templates de mensagem...',
  17: 'Configurando relatórios automáticos...',
  18: 'Preparando importação de dados...',
  19: 'Definindo metas pastorais...',
  20: 'Finalizando configuração...',
}

// ── Handler principal ──────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS_HEADERS })

  // Auth
  const token = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!token) return json({ error: 'Unauthorized' }, 401)

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  let body: { session_id: string }
  try { body = await req.json() } catch { return json({ error: 'Invalid JSON' }, 400) }

  const { session_id } = body
  if (!session_id) return json({ error: 'session_id é obrigatório' }, 400)

  // Carrega sessão + config_json
  const { data: session, error: sessionError } = await supabase
    .from('onboarding_sessions')
    .select('*')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .single()

  if (sessionError || !session) return json({ error: 'Sessão não encontrada' }, 404)

  const config = session.config_json as Record<string, unknown>
  if (!config) return json({ error: 'Configuração pendente — aguarde o consultor finalizar' }, 400)

  // Cria os 20 step records como pending
  const stepsToInsert = Array.from({ length: 20 }, (_, i) => ({
    session_id,
    step_number: i + 1,
    label:       STEP_LABELS[i + 1],
    status:      'pending',
  }))

  await supabase.from('onboarding_steps').insert(stepsToInsert)

  const stepsFailed: string[] = []
  let churchId: string | null = null

  // ── Executa steps sequencialmente ─────────────────────────
  for (let stepNum = 1; stepNum <= 20; stepNum++) {
    await setStep(session_id, stepNum, 'running')

    try {
      await runStep(stepNum, config, user.id, churchId, session_id)
      await setStep(session_id, stepNum, 'done')

      // Após step 1, churchId fica disponível
      if (stepNum === 1 && !churchId) {
        const { data } = await supabase
          .from('churches')
          .select('id')
          .eq('slug', slugify((config.tenant as { slug?: string })?.slug ?? (config.tenant as { name?: string })?.name ?? ''))
          .maybeSingle()
        churchId = data?.id ?? null

        // Atualiza session com church_id
        if (churchId) {
          await supabase.from('onboarding_sessions').update({ church_id: churchId }).eq('id', session_id)
          await supabase.from('onboarding_steps').update({ church_id: churchId }).eq('session_id', session_id)
        }
      }

      // Pausa natural entre steps (distribui 25-30s em 20 steps)
      await sleep(800 + Math.random() * 400)
    } catch (err) {
      console.error(`[engineer] Step ${stepNum} failed:`, err)
      // Retry 1x
      try {
        await sleep(500)
        await runStep(stepNum, config, user.id, churchId, session_id)
        await setStep(session_id, stepNum, 'done')
      } catch (err2) {
        console.error(`[engineer] Step ${stepNum} retry failed:`, err2)
        await setStep(session_id, stepNum, 'failed', String(err2))
        stepsFailed.push(`Step ${stepNum}: ${STEP_LABELS[stepNum]}`)
      }
    }
  }

  // Atualiza status do tenant
  if (churchId) {
    await supabase.from('churches').update({ status: 'configured' }).eq('id', churchId)
  }

  // Atualiza app_metadata com church_id (server-side only — seguro contra adulteração)
  if (churchId) {
    await supabase.auth.admin.updateUserById(user.id, {
      app_metadata: { church_id: churchId },
    })
  }

  return json({
    success:      stepsFailed.length === 0,
    steps_done:   20 - stepsFailed.length,
    steps_failed: stepsFailed,
    church_id:    churchId,
  })
})

// ── Executa step específico ────────────────────────────────
async function runStep(
  stepNum: number,
  config: Record<string, unknown>,
  userId: string,
  churchId: string | null,
  sessionId: string,
): Promise<void> {
  const tenant       = (config.tenant as Record<string, unknown>) ?? {}
  const subscription = (config.subscription as Record<string, unknown>) ?? {}
  const departments  = (config.departments as Array<Record<string, unknown>>) ?? []
  const cellNetwork  = (config.cell_network as Record<string, unknown>) ?? {}
  const pipeline     = (config.pipeline as Record<string, unknown>) ?? {}
  const customFields = (config.custom_fields as Array<Record<string, unknown>>) ?? []
  const categories   = (config.categories as Array<Record<string, unknown>>) ?? []
  const users        = (config.users as Array<Record<string, unknown>>) ?? []
  const teamGoals    = (config.team_goals as Array<Record<string, unknown>>) ?? []
  const agents       = (config.agents as Record<string, unknown>) ?? {}
  const automations  = (config.automations as Array<Record<string, unknown>>) ?? []
  const dashboard    = (config.dashboard as Record<string, unknown>) ?? {}
  const events       = (config.events_calendar as Record<string, unknown>) ?? {}
  const reports      = (config.reports as Record<string, unknown>) ?? {}
  const dataMig      = (config.data_migration as Record<string, unknown>) ?? {}
  const templates    = (config.message_templates as Record<string, string>) ?? {}

  switch (stepNum) {
    // ── 1. Cria tenant ─────────────────────────────────────
    case 1: {
      const branding = (tenant.branding as Record<string, string>) ?? {}
      const slug = slugify((tenant.slug as string) ?? (tenant.name as string) ?? 'igreja')
      const { error } = await supabase.from('churches').upsert({
        name:               tenant.name,
        slug,
        is_active:          true,
        status:             'onboarding',
        city:               tenant.city,
        state:              tenant.state,
        timezone:           (tenant.timezone as string) ?? 'America/Sao_Paulo',
        logo_url:           tenant.logo_url,
        branding:           { primary_color: branding.primary_color ?? '#e13500', secondary_color: branding.secondary_color ?? '#670000' },
        onboarding_config:  config,
      }, { onConflict: 'slug' })
      if (error) throw error
      break
    }

    // ── 2. Cria sedes ──────────────────────────────────────
    case 2: {
      if (!churchId) break
      const sites = (tenant.sites as Array<Record<string, unknown>>) ?? []
      if (sites.length === 0) {
        // Cria sede principal padrão
        await supabase.from('church_sites').insert({
          church_id: churchId,
          name:      `Sede Central — ${tenant.name as string}`,
          city:      tenant.city,
          state:     tenant.state,
          is_main:   true,
        })
      } else {
        for (const site of sites) {
          await supabase.from('church_sites').insert({
            church_id: churchId,
            name:      site.name,
            city:      site.city ?? tenant.city,
            is_main:   site.is_main ?? false,
          })
        }
      }
      break
    }

    // ── 3. Configura pipeline_stages ──────────────────────
    case 3: {
      if (!churchId) break
      const stages = (pipeline.stages as Array<Record<string, unknown>>) ?? DEFAULT_STAGES
      for (let i = 0; i < stages.length; i++) {
        const s = stages[i]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('pipeline_stages').upsert({
          church_id:   churchId,
          name:        s.name,
          order_index: i,
          sla_hours:   s.sla_hours ?? 72,
          type:        s.type ?? 'standard',
          description: s.description ?? '',
        }, { onConflict: 'church_id,name' })
      }
      break
    }

    // ── 4. Cria custom_fields ──────────────────────────────
    case 4: {
      if (!churchId || customFields.length === 0) break
      for (const field of customFields) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('custom_fields').insert({
          church_id:   churchId,
          name:        field.name,
          label:       field.label,
          type:        field.type ?? 'text',
          options:     field.options ?? [],
          required:    field.required ?? false,
          group_name:  field.group ?? 'Geral',
          show_when:   field.show_when ?? null,
          visibility:  field.visibility ?? 'all',
        }).onConflict('church_id, name').ignore()
      }
      break
    }

    // ── 5. Cria categorias ─────────────────────────────────
    case 5: {
      if (!churchId || categories.length === 0) break
      for (const cat of categories) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('categories').insert({
          church_id: churchId,
          name:      cat.name,
          options:   cat.options ?? [],
        }).onConflict('church_id, name').ignore()
      }
      break
    }

    // ── 6. Cria departamentos ──────────────────────────────
    case 6: {
      if (!churchId) break
      const depts = departments.length > 0 ? departments : DEFAULT_DEPARTMENTS
      for (const dept of depts) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('ministries').upsert({
          church_id:   churchId,
          name:        dept.name,
          description: '',
        }, { onConflict: 'church_id, name' })
      }
      break
    }

    // ── 7. Configura rede de células ───────────────────────
    case 7: {
      if (!churchId) break
      const totalCells = (cellNetwork.total_cells as number) ?? 0
      if (totalCells > 0) {
        // Cria células placeholder — pastor preencherá depois
        const cellsToInsert = Array.from({ length: Math.min(totalCells, 50) }, (_, i) => ({
          church_id: churchId,
          name:      `Célula ${i + 1}`,
          is_active: true,
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('cells').upsert(cellsToInsert, { onConflict: 'church_id, name' })
      }
      break
    }

    // ── 8. Cria usuários ───────────────────────────────────
    case 8: {
      if (!churchId || users.length === 0) break
      for (const u of users) {
        if (!u.email) continue
        try {
          // Convida usuário via Supabase Auth
          const { data: inviteData } = await supabase.auth.admin.inviteUserByEmail(
            u.email as string,
            { data: { church_id: churchId, full_name: u.name, role: u.role } }
          )
          if (inviteData?.user) {
            // Cria role
            await supabase.from('user_roles').upsert({
              user_id:   inviteData.user.id,
              church_id: churchId,
              role:      mapRole(u.role as string),
            }, { onConflict: 'user_id, church_id' })
          }
        } catch {
          // Usuário pode já existir — ok
        }
      }
      // Garante role admin para o owner
      await supabase.from('user_roles').upsert({
        user_id:   userId,
        church_id: churchId,
        role:      'admin',
      }, { onConflict: 'user_id, church_id' })
      break
    }

    // ── 9. Configura alertas ───────────────────────────────
    case 9: {
      if (!churchId) break
      // Alertas padrão — configuráveis depois
      const defaultAlerts = [
        { church_id: churchId, trigger: 'new_visitor',       label: 'Novo visitante',         target_role: 'supervisor' },
        { church_id: churchId, trigger: 'member_absent_14d', label: 'Membro ausente 14 dias', target_role: 'leader' },
        { church_id: churchId, trigger: 'freq_drop',         label: 'Queda de frequência',    target_role: 'admin' },
      ]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('alert_configs').upsert(defaultAlerts, { onConflict: 'church_id, trigger' }).then(() => null).catch(() => null)
      break
    }

    // ── 10. Ativa agent-suporte grátis ─────────────────────
    case 10: {
      if (!churchId) break
      const { data: sub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('church_id', churchId)
        .maybeSingle()
      if (sub) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('subscription_agents').upsert({
          subscription_id: sub.id,
          agent_slug:      'agent-suporte',
          source:          'free',
          is_active:       true,
          context_data: {
            church_name: tenant.name,
            schedule:    (config.events_calendar as Record<string, unknown>)?.recurring ?? [],
            channels:    config.channels,
          },
        }, { onConflict: 'subscription_id, agent_slug' })
      }
      break
    }

    // ── 11. Ativa agentes inclusos no plano ────────────────
    case 11: {
      if (!churchId) break
      const includedAgents = (agents.included_in_plan as string[]) ?? []
      if (includedAgents.length === 0) break
      const { data: sub } = await supabase
        .from('subscriptions').select('id').eq('church_id', churchId).maybeSingle()
      if (!sub) break
      for (const agentSlug of includedAgents) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('subscription_agents').upsert({
          subscription_id: sub.id,
          agent_slug:      agentSlug,
          source:          'included',
          is_active:       true,
        }, { onConflict: 'subscription_id, agent_slug' })
      }
      break
    }

    // ── 12. Processa agentes always_paid via Stripe ────────
    case 12: {
      if (!churchId || !stripe) break
      const purchased = (agents.purchased as string[]) ?? []
      if (purchased.length === 0) break
      const { data: sub } = await supabase
        .from('subscriptions').select('id, stripe_subscription_id').eq('church_id', churchId).maybeSingle()
      if (!sub?.stripe_subscription_id) break

      // Busca price_id do agente no catálogo
      const { data: agentDefs } = await supabase
        .from('agents_catalog')
        .select('slug, stripe_price_id')
        .in('slug', purchased)

      for (const agentDef of (agentDefs ?? [])) {
        if (!agentDef.stripe_price_id) continue
        try {
          await stripe.subscriptionItems.create({
            subscription: sub.stripe_subscription_id,
            price:        agentDef.stripe_price_id,
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from('subscription_agents').upsert({
            subscription_id: sub.id,
            agent_slug:      agentDef.slug,
            source:          'purchased',
            is_active:       true,
          }, { onConflict: 'subscription_id, agent_slug' })
        } catch {
          // Falha silenciosa — pode já existir no Stripe
        }
      }
      break
    }

    // ── 13. Cria workflows n8n ─────────────────────────────
    case 13: {
      if (!N8N_API_KEY || automations.length === 0) break
      for (const auto of automations.slice(0, 5)) {
        // Cria workflow n8n simplificado
        try {
          await fetch(`${N8N_BASE_URL}/workflows`, {
            method: 'POST',
            headers: {
              'X-N8N-API-KEY': N8N_API_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name:   `[${(tenant.name as string)?.slice(0, 20)}] ${auto.name}`,
              active: true,
              nodes:  buildN8nWorkflow(auto),
              connections: {},
              settings: { executionOrder: 'v1' },
            }),
            signal: AbortSignal.timeout(10_000),
          })
        } catch {
          // n8n não essencial — falha silenciosa
        }
      }
      break
    }

    // ── 14. Configura dashboard ────────────────────────────
    case 14: {
      if (!churchId) break
      const widgets = (dashboard.widgets as Array<Record<string, unknown>>) ?? DEFAULT_WIDGETS
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('dashboard_configs').upsert({
        church_id: churchId,
        widgets,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'church_id' }).then(() => null).catch(() => null)
      break
    }

    // ── 15. Configura calendário ───────────────────────────
    case 15: {
      if (!churchId) break
      const recurring = (events.recurring as Array<Record<string, unknown>>) ?? []
      for (const ev of recurring) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('events').upsert({
          church_id:   churchId,
          title:       ev.name,
          day_of_week: ev.day,
          start_time:  ev.time,
          frequency:   ev.frequency ?? 'weekly',
          is_recurring: true,
        }, { onConflict: 'church_id, title, day_of_week' }).then(() => null).catch(() => null)
      }
      break
    }

    // ── 16. Cria templates de mensagem ────────────────────
    case 16: {
      if (!churchId) break
      const defaultTemplates: Array<[string, string]> = [
        ['Boas-vindas visitante', `Olá {nome}! Que alegria ter você conosco! Queremos que se sinta em casa. Fique à vontade para nos chamar a qualquer momento.`],
        ['Acompanhamento consolidação', `Oi {nome}! Passando para saber como você está. Estamos aqui para apoiar sua caminhada!`],
        ['Convite célula', `{nome}, temos uma célula perto de você! Seria ótimo te ver lá. Posso te contar mais?`],
        ...Object.entries(templates),
      ]
      for (const [name, content] of defaultTemplates) {
        await supabase.from('message_templates').insert({ church_id: churchId, name, content }).then(() => null).catch(() => null)
      }
      break
    }

    // ── 17. Configura relatórios (n8n cron) ───────────────
    case 17: {
      if (!N8N_API_KEY || !churchId) break
      const weeklyEnabled  = ((reports.weekly as Record<string, unknown>)?.enabled as boolean) ?? true
      const monthlyEnabled = ((reports.monthly as Record<string, unknown>)?.enabled as boolean) ?? true

      if (weeklyEnabled) {
        try {
          await fetch(`${N8N_BASE_URL}/workflows`, {
            method: 'POST',
            headers: { 'X-N8N-API-KEY': N8N_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name:   `[${(tenant.name as string)?.slice(0, 20)}] Relatório Semanal`,
              active: true,
              nodes:  [{ id: 'cron', name: 'Cron', type: 'n8n-nodes-base.scheduleTrigger', parameters: { rule: { interval: [{ field: 'weeks', intervalValue: 1 }] } }, position: [0, 0] }],
              connections: {},
              settings: { executionOrder: 'v1' },
            }),
            signal: AbortSignal.timeout(8_000),
          })
        } catch { /* falha silenciosa */ }
      }
      void monthlyEnabled
      break
    }

    // ── 18. Importa dados existentes (async) ───────────────
    case 18: {
      const hasData = (dataMig.has_existing_data as boolean) ?? false
      const fileUrl = dataMig.file_url as string | null
      if (!hasData || !fileUrl || !churchId) break
      // Enfileira importação em background — não bloqueia o onboarding
      await supabase.from('import_jobs').insert({
        church_id: churchId,
        file_url:  fileUrl,
        format:    dataMig.format ?? 'xlsx',
        status:    'pending',
      }).then(() => null).catch(() => null)
      break
    }

    // ── 19. Configura metas pastorais ─────────────────────
    case 19: {
      if (!churchId) break
      const goals = teamGoals.length > 0 ? teamGoals : DEFAULT_GOALS
      for (const goal of goals) {
        await supabase.from('pastoral_goals').insert({
          church_id: churchId,
          metric:    goal.metric,
          target:    goal.target ?? 0,
          period:    goal.period ?? 'monthly',
        }).then(() => null).catch(() => null)
      }
      break
    }

    // ── 20. Finaliza ───────────────────────────────────────
    case 20: {
      if (!churchId) break

      // Determina agentes recomendados: eligible-tier não ativados ainda
      const configAgents = (config.agents as Record<string, unknown>) ?? {}
      const alreadyActivated = new Set<string>([
        ...((configAgents.free             as string[]) ?? []),
        ...((configAgents.included_in_plan as string[]) ?? []),
        ...((configAgents.purchased        as string[]) ?? []),
      ])

      const { data: eligibleAgents } = await supabase
        .from('agents_catalog')
        .select('slug')
        .eq('pricing_tier', 'eligible')
        .eq('active', true)

      const recommendedAgents = (eligibleAgents ?? [])
        .map(a => a.slug as string)
        .filter(slug => !alreadyActivated.has(slug))

      await supabase
        .from('onboarding_sessions')
        .update({
          status:              'completed',
          completed_at:        new Date().toISOString(),
          recommended_agents:  recommendedAgents,
        })
        .eq('id', sessionId)

      // church.status atualizado no loop principal após todos os steps
      break
    }

    default:
      break
  }
}

// ── Helpers ────────────────────────────────────────────────

async function setStep(sessionId: string, stepNum: number, status: string, error?: string) {
  const payload: Record<string, unknown> = { status }
  if (status === 'running') payload.started_at = new Date().toISOString()
  if (status === 'done' || status === 'failed') payload.completed_at = new Date().toISOString()
  if (error) payload.error_msg = error

  await supabase
    .from('onboarding_steps')
    .update(payload)
    .eq('session_id', sessionId)
    .eq('step_number', stepNum)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function slugify(text: string): string {
  return text.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

function mapRole(role: string): string {
  const map: Record<string, string> = {
    admin: 'admin', pastor: 'admin', supervisor: 'author',
    leader: 'author', treasurer: 'author', secretary: 'author',
  }
  return map[role] ?? 'author'
}

function buildN8nWorkflow(automation: Record<string, unknown>): unknown[] {
  return [
    {
      id:         'trigger',
      name:       'Trigger',
      type:       'n8n-nodes-base.scheduleTrigger',
      parameters: automation.trigger_config ?? {},
      position:   [0, 0],
    },
    {
      id:         'action',
      name:       String(automation.action ?? 'Ação'),
      type:       'n8n-nodes-base.httpRequest',
      parameters: automation.action_config ?? {},
      position:   [200, 0],
    },
  ]
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

// ── Defaults ───────────────────────────────────────────────

const DEFAULT_STAGES = [
  { name: 'Visitante',     sla_hours: 24,  type: 'initial' },
  { name: 'Contato',       sla_hours: 48,  type: 'contact' },
  { name: 'Consolidação',  sla_hours: 72,  type: 'nurturing' },
  { name: 'Frequentador',  sla_hours: 168, type: 'active' },
  { name: 'Membro',        sla_hours: 0,   type: 'member' },
  { name: 'Discípulo',     sla_hours: 0,   type: 'disciple' },
  { name: 'Líder',         sla_hours: 0,   type: 'leader' },
]

const DEFAULT_DEPARTMENTS = [
  { name: 'Louvor' }, { name: 'Mídia' }, { name: 'Recepção' },
  { name: 'Infantil' }, { name: 'Jovens' }, { name: 'Mulheres' },
  { name: 'Homens' }, { name: 'Ação Social' }, { name: 'EBD' },
]

const DEFAULT_GOALS = [
  { metric: 'taxa_consolidacao', target: 80,  period: 'monthly' },
  { metric: 'novos_membros',     target: 10,  period: 'monthly' },
  { metric: 'celulas_ativas',    target: 20,  period: 'quarterly' },
  { metric: 'batismos',          target: 15,  period: 'quarterly' },
]

const DEFAULT_WIDGETS = [
  { type: 'metric',  label: 'Taxa de Consolidação', query: 'taxa_consolidacao', position: 1 },
  { type: 'metric',  label: 'Membros Ativos',        query: 'membros_ativos',    position: 2 },
  { type: 'chart',   label: 'Evolução de Membros',   query: 'evolucao_membros',  position: 3 },
  { type: 'alert',   label: 'Membros Ausentes',      query: 'membros_ausentes',  position: 4 },
]
