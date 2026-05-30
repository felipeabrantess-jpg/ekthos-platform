# SPEC — Detecção de Churn de Igrejas (SA-A7)

> **Sprint:** MEGA-ONDA SEGURANÇA AMPLA  
> **Data:** 2026-05-30  
> **Status:** CRÍTICO — health_scores nunca populado (todos null)  
> **Prioridade:** ALTO

---

## Bug Identificado

### health_scores nunca populado

A tabela `health_scores` existe no banco mas **nenhum processo a popula**. O cockpit admin mostra health score nulo para todas as igrejas — tornando o indicador inutilizável para identificar risco de churn.

**Causa raiz:** O worker/cron que deveria calcular e inserir health scores nunca foi implementado.

---

## O que é o Health Score

O health score é uma nota de 0 a 100 que indica o quanto uma igreja está "viva" na plataforma. Igrejas com score baixo têm alto risco de churn. O time de CS usa esse score para priorizar ações proativas.

---

## Fórmula de cálculo

### Dimensões e pesos

| Dimensão | Peso | Indicador |
|---|---|---|
| Atividade de agentes | 30% | Mensagens processadas nos últimos 14 dias |
| Logins de usuários | 25% | Sessões únicas nos últimos 14 dias |
| Dados atualizados | 20% | Alterações em `people` nos últimos 30 dias |
| Pipeline ativo | 15% | Movimentações em `acolhimento_journey` últimos 14 dias |
| WhatsApp conectado | 10% | `integrations.whatsapp_connected = true` |

### Cálculo por dimensão

```sql
-- Exemplo: Atividade de agentes (0-100)
CASE
  WHEN msgs_14d >= 50 THEN 100
  WHEN msgs_14d >= 20 THEN 75
  WHEN msgs_14d >= 5  THEN 50
  WHEN msgs_14d >= 1  THEN 25
  ELSE 0
END AS agent_score
```

### Score final

```
health_score = (agent_score * 0.30) +
               (login_score  * 0.25) +
               (data_score   * 0.20) +
               (pipeline_score * 0.15) +
               (whatsapp_score * 0.10)
```

---

## Classificação do score

| Score | Label | Ação recomendada do CS |
|---|---|---|
| 80–100 | 🟢 Saudável | Nurture, oferecer upsell |
| 60–79 | 🟡 Atenção | Check-in proativo em 7 dias |
| 40–59 | 🟠 Em risco | Ligação de CS em 48h |
| 0–39 | 🔴 Crítico | Intervenção urgente + desconto de retenção |

---

## Implementação

### Worker de cálculo

**Opção A — Supabase pg_cron (recomendado):**

```sql
SELECT cron.schedule(
  'health-score-calculator',
  '0 6 * * *',  -- toda madrugada às 6h
  $$
    SELECT calculate_health_scores();
  $$
);
```

**Opção B — Edge Function via Supabase Scheduled Functions:**

`supabase/functions/health-score-calculator/index.ts` — invocada via cron externo

### RPC de cálculo

```sql
CREATE OR REPLACE FUNCTION calculate_health_scores()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  church record;
BEGIN
  FOR church IN SELECT id FROM churches WHERE deleted_at IS NULL LOOP
    INSERT INTO health_scores (church_id, score, dimensions, calculated_at)
    VALUES (
      church.id,
      (
        -- cálculo das 5 dimensões
        calculate_agent_score(church.id)   * 0.30 +
        calculate_login_score(church.id)   * 0.25 +
        calculate_data_score(church.id)    * 0.20 +
        calculate_pipeline_score(church.id)* 0.15 +
        calculate_whatsapp_score(church.id)* 0.10
      ),
      jsonb_build_object(
        'agent',    calculate_agent_score(church.id),
        'login',    calculate_login_score(church.id),
        'data',     calculate_data_score(church.id),
        'pipeline', calculate_pipeline_score(church.id),
        'whatsapp', calculate_whatsapp_score(church.id)
      ),
      now()
    )
    ON CONFLICT (church_id) DO UPDATE
      SET score = EXCLUDED.score,
          dimensions = EXCLUDED.dimensions,
          calculated_at = EXCLUDED.calculated_at;
  END LOOP;
END;
$$;
```

### Schema (confirmar existente + ajustar se necessário)

```sql
-- Verificar se health_scores tem o schema esperado
-- Adicionar colunas se necessário:
ALTER TABLE health_scores ADD COLUMN IF NOT EXISTS dimensions jsonb;
ALTER TABLE health_scores ADD COLUMN IF NOT EXISTS calculated_at timestamptz;
```

---

## Alertas de churn para o CS

Quando uma igreja cai para score < 40, acionar automaticamente:

1. **Email para CS Lead** com lista de igrejas críticas
2. **Task em `admin_tasks`** para o CS responsável fazer contato
3. **Badge vermelho** no cockpit admin ao lado do nome da igreja

---

## Critérios de aceite

- [ ] `health_scores` populado diariamente para todas as igrejas ativas
- [ ] Score nunca null para igrejas com mais de 7 dias de conta
- [ ] Cockpit admin mostra score com label de cor (verde/amarelo/laranja/vermelho)
- [ ] Email automático para CS quando score cai abaixo de 40
- [ ] `admin_tasks` criada para cada score crítico sem task aberta
- [ ] Cálculo não afeta tabelas de clientes (service_role only, sem passar por RLS de cliente)
