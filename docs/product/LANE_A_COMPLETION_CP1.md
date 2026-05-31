# Lane A Completion CP1 — 5 Specs

> MEGA-ONDA TRIPARTITE CURTA — Lane A2  
> Data: 2026-05-30  
> Modo: Investigação pura (sem aplicar código)  
> Próxima MEGA-ONDA aplica estas specs.

---

## Schema Verificado (estado real em 2026-05-30)

### Tabelas CONFIRMADAS existentes
| Tabela | Observação |
|--------|-----------|
| `church_agent_credits(church_id, agent_scope, cycle_credits, topup_credits, expires_at)` | ✅ expires_at adicionado MEGA-ONDA B |
| `agent_credit_usage(id, church_id, agent_scope, operation_type, credits_consumed, consumed_at)` | ✅ |
| `subscription_agents(church_id, agent_slug, activation_status, created_at)` | ✅ |
| `church_agent_config(church_id, agent_slug, config jsonb, service_schedule jsonb)` | ✅ **service_schedule JÁ EXISTE** |
| `people(id, church_id, name, status, lgpd_consent, last_activity_at, ...)` | ✅ |
| `acolhimento_journey(id, church_id, person_id, status, created_at)` | ✅ singular |
| `reengagement_journey(id, church_id, person_id, status, risk_score, created_at)` | ✅ singular |
| `health_scores(id, church_id, score, calculated_at, ...)` | ✅ existe mas sem `person_id` — BLOQUEANTE para A11 |
| `agent_executions(id, church_id, agent_slug, ...)` | ✅ |
| `pipeline_stages(id, church_id, slug, sla_hours, ...)` | ✅ sla_hours presente |

### Itens que NÃO EXISTEM (precisam ser criados)
| Item | Frente |
|------|--------|
| `agent_message_pending_approval` (tabela nova) | A6 |
| `church_agent_config.approval_mode` (coluna) | A6 |
| `church_agent_config.health_score_threshold` (coluna) | A11 |
| `health_scores.person_id` (coluna — CRÍTICO) | A11 |
| RPC `get_agent_reengajamento_dashboard` | A3 |
| EF `agent-health-scorer` | A11 |
| EF `agent-approval-action` | A6 |

---

## Frente A3 — Dashboard agent-reengajamento

### Objetivo
Espelho do `get_agent_acolhimento_dashboard` para o agente de reengajamento. Página `/agentes/agent-reengajamento/dashboard`.

### RPC

```sql
CREATE OR REPLACE FUNCTION get_agent_reengajamento_dashboard(p_church_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
  v_scope  text := 'agent-reengajamento';
BEGIN
  SELECT jsonb_build_object(
    'pessoas_em_risco_semana',
      (SELECT count(*) FROM reengagement_journey
       WHERE church_id = p_church_id
         AND created_at >= now() - interval '7 days'),
    'acoes_tomadas',
      (SELECT count(*) FROM agent_credit_usage
       WHERE church_id = p_church_id
         AND agent_scope = v_scope
         AND consumed_at >= now() - interval '7 days'),
    'taxa_retorno',
      -- % de reengagement_journey com status='completed' / total
      CASE WHEN (SELECT count(*) FROM reengagement_journey WHERE church_id = p_church_id) = 0
           THEN 0
           ELSE ROUND(
             (SELECT count(*) FROM reengagement_journey
              WHERE church_id = p_church_id AND status = 'completed')::numeric /
             (SELECT count(*) FROM reengagement_journey WHERE church_id = p_church_id) * 100, 1)
      END,
    'creditos_restantes',
      COALESCE(
        (SELECT cycle_credits + COALESCE(topup_credits, 0)
         FROM church_agent_credits
         WHERE church_id = p_church_id AND agent_scope = v_scope
         LIMIT 1), 0),
    'creditos_consumidos_mes',
      COALESCE(
        (SELECT sum(credits_consumed) FROM agent_credit_usage
         WHERE church_id = p_church_id AND agent_scope = v_scope
           AND consumed_at >= date_trunc('month', now())), 0),
    'ultima_execucao',
      (SELECT max(consumed_at) FROM agent_credit_usage
       WHERE church_id = p_church_id AND agent_scope = v_scope),
    'subscription_status',
      (SELECT status FROM subscriptions
       WHERE church_id = p_church_id
       ORDER BY created_at DESC LIMIT 1),
    'activation_status',
      (SELECT activation_status FROM subscription_agents
       WHERE church_id = p_church_id AND agent_slug = 'agent-reengajamento'
       LIMIT 1)
  ) INTO v_result;
  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_agent_reengajamento_dashboard(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION get_agent_reengajamento_dashboard(uuid) TO authenticated;
```

### Frontend

Página `web/src/pages/agents/ReengajamentoDashboard/index.tsx`:
- Estrutura idêntica a `AcolhimentoDashboard/index.tsx`
- 5 MetricCards: pessoas_em_risco_semana, acoes_tomadas, taxa_retorno, creditos_restantes, ultima_execucao
- ThresholdBanner (70%/90%/100%) baseado em creditos_restantes vs. 600 (canon)
- 3 empty states: sem subscription, `pending_activation`, sem atividade (acoes_tomadas=0)
- Rota: `/agentes/agent-reengajamento/dashboard`

### Effort Estimate
- 1 migration SQL (~40 linhas)
- 0 EF nova
- 1 página frontend (~250 linhas — copiar AcolhimentoDashboard e adaptar)
- Risco: **BAIXO** — padrão idêntico ao A2 já funcionando

---

## Frente A6 — Fila de Aprovação de Mensagens

### Objetivo
Modo "aprovação manual" para agentes: antes de enviar mensagem ao membro, o agente insere um draft na fila e o pastor aprova/rejeita via interface.

### Migration — Nova tabela

```sql
-- Tabela de aprovação de drafts de mensagens
CREATE TABLE IF NOT EXISTS agent_message_pending_approval (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       uuid NOT NULL REFERENCES churches(id) ON DELETE CASCADE,
  agent_slug      text NOT NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  draft_content   text NOT NULL,
  draft_metadata  jsonb DEFAULT '{}',       -- variáveis interpoladas, contexto
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz,              -- se não aprovado em X horas → auto-expired
  approved_by     uuid REFERENCES auth.users(id),
  approved_at     timestamptz,
  rejected_reason text,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','expired','sent'))
);

-- RLS
ALTER TABLE agent_message_pending_approval ENABLE ROW LEVEL SECURITY;
CREATE POLICY "church_own" ON agent_message_pending_approval
  FOR ALL USING (church_id = auth_church_id());

-- Coluna approval_mode em church_agent_config
ALTER TABLE church_agent_config
  ADD COLUMN IF NOT EXISTS approval_mode text NOT NULL DEFAULT 'auto'
    CHECK (approval_mode IN ('auto','manual_first_30d','manual_always'));

-- Index para fila pendente
CREATE INDEX IF NOT EXISTS idx_approval_pending
  ON agent_message_pending_approval (church_id, status, created_at)
  WHERE status = 'pending';
```

### EF agent-approval-action

```typescript
// supabase/functions/agent-approval-action/index.ts
// POST { draft_id, action: 'approve' | 'reject', reason?: string }
// Requer JWT church → verifica church_id = draft.church_id
// Se approve: UPDATE status='approved' + dispara envio via channel-dispatcher
// Se reject: UPDATE status='rejected' + rejected_reason
```

### Hook nos agentes

Nos agentes `agent-acolhimento` e `agent-reengajamento`, antes do envio de mensagem:
```typescript
// Verificar modo de aprovação
const { data: config } = await supabase
  .from('church_agent_config')
  .select('approval_mode')
  .eq('church_id', churchId)
  .eq('agent_slug', agentSlug)
  .single()

if (config?.approval_mode !== 'auto') {
  // INSERT draft → não envia direto
  await supabase.from('agent_message_pending_approval').insert({
    church_id: churchId, agent_slug: agentSlug,
    conversation_id: conversationId, draft_content: messageContent,
    expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
  })
  return // não envia
}
// ... envio normal
```

### Frontend — Página /agentes/:slug/aprovacao

- Lista de drafts pendentes com preview da mensagem
- Botões "Aprovar" e "Rejeitar" por draft
- Badge contador na sidebar quando há pendentes
- Notificação WhatsApp pro pastor via channel-dispatcher quando `count(pending) > 0`

### Effort Estimate
- 2 migrations SQL (~60 linhas)
- 1 EF nova `agent-approval-action` (~100 linhas)
- 2 EFs modificadas (agent-acolhimento v22 + agent-reengajamento) — **RISCO ALTO**
- 1 página frontend nova (~200 linhas)
- Risco: **ALTO** — modifica agentes core em prod

### Strategy de Feature Flag (OBRIGATÓRIO)
- `approval_mode DEFAULT 'auto'` → zero impacto em prod atual
- Rollout: setar `approval_mode='manual_always'` só em igrejas piloto explícitas
- Jamais alterar default sem testes em Mock + Minha Fé primeiro

---

## Frente A7 — Bridge Horários Culto → Schedule do Agente

### Objetivo
O wizard de onboarding captura horários de culto (ex: "Domingo 9h e 19h, Quarta 20h"). Esses dados devem ser salvos estruturados em `church_agent_config.service_schedule` (já existente!) para que os agentes saibam quando NÃO incomodar membros.

### Descoberta importante
`church_agent_config.service_schedule` **JÁ EXISTE** como coluna jsonb. A frente é conectar o wizard ao schema existente.

### Schema service_schedule (padronizar)

```typescript
interface ServiceSchedule {
  timezone: string                           // ex: 'America/Sao_Paulo'
  weekday_slots: Array<{
    day: 0 | 1 | 2 | 3 | 4 | 5 | 6         // 0=Dom, 6=Sáb
    start_hour: number                       // 0-23
    end_hour: number                         // 0-23
    label?: string                           // ex: 'Culto Domingo Manhã'
  }>
  quiet_hours?: {                            // horário de silêncio (ex: 22h-8h)
    start_hour: number
    end_hour: number
  }
}
```

### Migration — onboarding-engineer

O `onboarding-engineer` EF deve, ao receber `wizard_step = 'horarios_culto'`, fazer:
```typescript
await supabase.from('church_agent_config').upsert({
  church_id: churchId,
  agent_slug: agentSlug,    // aplica a todos os agentes ativos
  service_schedule: parsedSchedule,
}, { onConflict: 'church_id,agent_slug' })
```

### Backfill igrejas existentes

```sql
-- Backfill: igrejas sem service_schedule recebem default São Paulo, sem slots específicos
UPDATE church_agent_config
SET service_schedule = jsonb_build_object(
  'timezone', 'America/Sao_Paulo',
  'weekday_slots', '[]'::jsonb,
  'quiet_hours', jsonb_build_object('start_hour', 22, 'end_hour', 8)
)
WHERE service_schedule IS NULL;
-- WHERE NOT EXISTS garante idempotência
```

### Effort Estimate
- 1 migration SQL (backfill, ~20 linhas)
- 1 EF modificada (`onboarding-engineer` — adicionar parsing de horários)
- 0 páginas frontend novas (wizard já existe)
- Risco: **MÉDIO** — backfill idempotente (WHERE IS NULL)

---

## Frente A11 — Health Scores Worker

### Objetivo
EF cron `agent-health-scorer` calcula score de saúde por pessoa (0-100) e dispara `reengagement_journey` quando score < threshold.

### BLOQUEANTE IDENTIFICADO

`health_scores` existe mas **SEM** coluna `person_id`. A frente não pode ser implementada sem:

```sql
ALTER TABLE health_scores ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES people(id) ON DELETE CASCADE;
ALTER TABLE health_scores ADD COLUMN IF NOT EXISTS factors jsonb DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_scores_church_person
  ON health_scores (church_id, person_id);
```

### Algoritmo de scoring

```typescript
function calculateScore(person: PersonData): number {
  let score = 100
  const daysSinceActivity = daysBetween(person.last_activity_at, new Date())
  
  if (daysSinceActivity > 30) score -= 30
  else if (daysSinceActivity > 14) score -= 20
  else if (daysSinceActivity > 7)  score -= 10
  
  if (!person.hasAcolhimentoJourney) score -= 10
  if (person.hasCompletedJourney)    score += 10
  
  // Declínio consecutivo
  if (person.previousScores?.length >= 3) {
    const declining = person.previousScores.every((s, i) =>
      i === 0 || s < person.previousScores[i - 1]
    )
    if (declining) score -= 20
  }
  
  return Math.max(0, Math.min(100, score))
}
```

### Migration completa

```sql
-- 1. Adicionar colunas ausentes em health_scores
ALTER TABLE health_scores ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES people(id) ON DELETE CASCADE;
ALTER TABLE health_scores ADD COLUMN IF NOT EXISTS factors jsonb DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS idx_health_scores_church_person ON health_scores(church_id, person_id);

-- 2. Coluna de threshold configurável em church_agent_config
ALTER TABLE church_agent_config
  ADD COLUMN IF NOT EXISTS health_score_threshold integer NOT NULL DEFAULT 40;

-- 3. Cron diário
SELECT cron.schedule(
  'agent-health-scorer',
  '0 2 * * *',  -- 02:00 UTC diário
  $$ SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/agent-health-scorer',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  ) $$
);
```

### EF agent-health-scorer (esqueleto)

```typescript
// supabase/functions/agent-health-scorer/index.ts
// Cron: roda sem JWT (verify_jwt: false, mas valida por header interno)
// 1. Busca todas as igrejas com agent-reengajamento ativo
// 2. Para cada igreja, busca pessoas com last_activity_at < 30d
// 3. Calcula score via algoritmo acima
// 4. UPSERT health_scores (church_id, person_id, score, factors, calculated_at)
// 5. Para score < threshold → INSERT reengagement_journey (se não existe ativo)
// 6. Respeita approval_mode (A6): se manual, vai pra fila
```

### Coordenação com A6

Se `approval_mode != 'auto'` → mensagem de reengajamento vai para `agent_message_pending_approval` em vez de ser enviada diretamente.

### Effort Estimate
- 2 migrations SQL (~50 linhas)
- 1 EF nova `agent-health-scorer` (~200 linhas)
- 0 páginas frontend (cron silencioso)
- Risco: **MÉDIO** — calibração do threshold; backfill pode disparar journeys inesperadas
- **OBRIGATÓRIO:** rodar primeiro em Mock, validar scores, só então em prod

---

## Frente A12 — UX Pipeline/Jornada

### Objetivo
Melhorias de UX nas páginas `/pessoas` e `/pipeline`. Zero migrations — apenas frontend.

### /pessoas — Melhorias

1. **Filtro por health_score** (requer A11)
   - Chip: 🟢 Saudável (>70) / 🟡 Em risco (40-70) / 🔴 Crítico (<40)
   - Badge no card da pessoa com o score numérico

2. **Link para /pessoas/:id/jornada**
   - Timeline de ações (mensagens recebidas, journeys, eventos)
   - Requer query em `agent_credit_usage` + `acolhimento_journey` + `reengagement_journey`

### /pipeline — Melhorias

1. **SLA visual por coluna**
   - `pipeline_stages.sla_hours` já existe ✅
   - Exibir "SLA: Xd" no cabeçalho da coluna
   - Card vermelho se `(now() - card.entered_at) > sla_hours`

2. **Drag-and-drop mais fluido**
   - Substituir implementação atual por `@hello-pangea/dnd` (substituto do react-beautiful-dnd)
   - Animação de drop com feedback visual

3. **Empty state pastoral**
   - SVG estilizado (não generic) com mensagem pastoral
   - CTA para adicionar primeira pessoa

### Effort Estimate
- 0 migrations SQL
- 0 EFs
- 2-3 componentes frontend modificados (~300 linhas)
- Risco: **BAIXO** — só UX, zero risco de dados

---

## Matriz de Dependências

| Frente | Depende de | Colide com |
|--------|-----------|------------|
| A3 (Dashboard reengajamento) | `reengagement_journey` (✅ existe) | Nenhuma |
| A6 (Approval queue) | `conversations` (deve existir), `church_agent_config` (✅ existe) | A11 (ambas modificam fluxo de envio) |
| A7 (Schedule bridge) | `church_agent_config.service_schedule` (✅ JÁ EXISTE) | Nenhuma |
| A11 (Health scores) | `health_scores.person_id` (❌ FALTA — bloqueante), A6 para approval_mode | A6 (coordenar threshold) |
| A12 (Pipeline UX) | A11 para filtro health_score (opcional) | Nenhuma |

**Colisão identificada:** A6 + A11 ambas podem disparar `reengagement_journey`. Solução: A11 deve verificar se já existe journey ativo antes de criar novo.

---

## Effort Estimate Consolidado

| Frente | Migrations | EFs novas | EFs modificadas | Páginas frontend | LOC est. | Semanas |
|--------|-----------|-----------|-----------------|------------------|----------|---------|
| A3 | 1 | 0 | 0 | 1 | ~300 | 0.5 |
| A6 | 2 | 1 | 2 | 1 | ~400 | 1.5 |
| A7 | 1 | 0 | 1 | 0 (wizard) | ~100 | 0.5 |
| A11 | 2 | 1 | 0 | 0 | ~250 | 1.0 |
| A12 | 0 | 0 | 0 | 2-3 | ~300 | 0.5 |
| **TOTAL** | **6** | **2** | **3** | **4-5** | **~1350** | **~4** |

---

## Riscos por Frente

| Frente | Risco | Nível | Mitigação |
|--------|-------|-------|-----------|
| A3 | Padrão idêntico ao A2 já testado | **BAIXO** | Reusar AcolhimentoDashboard como template |
| A6 | Modifica agentes core (v22) — preservar comportamento | **ALTO** | Feature flag `approval_mode='auto'` default; rollout gradual |
| A7 | Backfill igrejas pode sobrescrever schedules manuais | **MÉDIO** | `WHERE service_schedule IS NULL` — idempotente |
| A11 | Threshold mal calibrado dispara reengajamento errado | **MÉDIO** | Testar em Mock; `health_score_threshold` configurável por igreja |
| A12 | Drag-and-drop lib nova pode quebrar mobile | **BAIXO** | Testar em mobile antes de deploy |

---

## Ordem de Aplicação Recomendada

### Fase 1 — Paralela (zero colisão)
- **A3** — Dashboard reengajamento (independente, fácil)
- **A12** — UX Pipeline/Pessoas (só frontend, zero risco)

### Fase 2 — Paralela (dependências resolvidas)
- **A7** — Bridge schedule (depende de service_schedule que já existe)
- **A11** — Health scores worker (depende de migration person_id)

> ⚠️ A11 BLOQUEANTE: rodar migration `ADD COLUMN health_scores.person_id` antes de deployar EF

### Fase 3 — Isolada (mais complexa)
- **A6** — Approval queue (modifica agentes core, requer staging extenso)

> A6 deve ser a ÚLTIMA a ser aplicada. Requer:
> 1. Migration `agent_message_pending_approval` + `church_agent_config.approval_mode`
> 2. EF `agent-approval-action`
> 3. Modificar `agent-acolhimento` e `agent-reengajamento` com feature flag
> 4. Smoke completo em Mock (approval_mode='manual_always')
> 5. Smoke em Minha Fé (approval_mode='auto' — não deve mudar comportamento)
> 6. Deploy com `approval_mode='auto'` default → sem impacto em prod

---

## Ação Imediata Recomendada (pré-próxima MEGA-ONDA)

1. Confirmar se `health_scores` tem ou não `person_id` via:
   ```sql
   SELECT column_name FROM information_schema.columns WHERE table_name = 'health_scores';
   ```
2. Se não tem → migration `ADD COLUMN person_id` ANTES de qualquer trabalho em A11
3. Confirmar structure de `conversations` (para FK em A6)
