# Roadmap Comercial — Lane A MEGA-ONDA

> **Data:** 2026-05-30  
> **Contexto:** Consolidação dos achados da auditoria SA-A1 a SA-A7  
> **Público:** Felipe + time de produto

---

## Resumo dos Achados de Produto (SA-A1 a SA-A7)

| ID | Área | Severidade | Bug / Gap | Arquivo spec |
|---|---|---|---|---|
| SA-A1 | Créditos | ALTO | Sem notificação quando créditos acabam | SPEC_CREDIT_REFILL_NOTIFICATIONS.md |
| SA-A2 | Billing | CRÍTICO | Double billing no upgrade (create em vez de update) | SPEC_SUBSCRIPTION_UPGRADE_DOWNGRADE.md |
| SA-A3 | Marketplace | CRÍTICO | Tier mismatch DB (internal/premium) vs frontend (free/always_paid/eligible) → marketplace vazio | SPEC_AGENT_MARKETPLACE_UI.md |
| SA-A4 | Onboarding | ALTO | Sem wizard → churn silencioso no onboarding | SPEC_ONBOARDING_WIZARD.md |
| SA-A5 | Agentes | CRÍTICO | agent-operacao referenciado no router mas não existe (404 silencioso) | SPEC_MULTI_AGENT_ORCHESTRATION.md |
| SA-A6 | Analytics | MÉDIO | Dashboard sem métricas pastorais reais | SPEC_PASTORAL_ANALYTICS.md |
| SA-A7 | Churn | ALTO | health_scores nunca populado (todos null) | SPEC_CHURN_DETECTION.md |

---

## Priorização por impacto

### Tier 1 — Corrigir antes do próximo cliente pagar (CRÍTICO)

1. **SA-A2 — Double billing no upgrade**
   - Risco: clientes cobrados duas vezes
   - Fix: trocar `subscriptions.create()` por `subscriptions.update()`
   - Esforço: 1 dia

2. **SA-A3 — Marketplace vazio**
   - Risco: pastor não consegue contratar agentes adicionais
   - Fix: migrar campo `tier` de `internal/premium` para `free/always_paid/eligible` ou corrigir o filtro do frontend
   - Esforço: 2 dias (DB + frontend)

3. **SA-A5 — agent-operacao não existe**
   - Risco: conversas classificadas como `operacional` falham silenciosamente
   - Fix imediato: fallback em `conversation-router` para `acolhimento` (BLINDADO)
   - Fix definitivo: criar `agent-operacao/index.ts`
   - Esforço: 2 dias

### Tier 2 — Implementar para fechar contrato sem fricção (ALTO)

4. **SA-A4 — Onboarding wizard**
   - Impacto: reduz churn dos primeiros 7 dias
   - Esforço: 5 dias

5. **SA-A7 — Health scores**
   - Impacto: CS consegue identificar risco de churn proativamente
   - Esforço: 3 dias

6. **SA-A1 — Notificações de crédito**
   - Impacto: evita pastor descobrir crédito zerado pelo silêncio do agente
   - Esforço: 2 dias

### Tier 3 — Construir para retenção e upsell (MÉDIO)

7. **SA-A6 — Analytics pastoral**
   - Impacto: aumenta percepção de valor, reduz churn pós-30 dias
   - Esforço: 8 dias

---

## Sequência de sprints recomendada

### Sprint Segurança + Billing (2 semanas)
1. SA-A2: fix double billing
2. SA-A3: fix marketplace tier
3. SA-A5: criar agent-operacao + fallback no router (BLINDADO — aprovação primeiro)
4. Lane B security fixes (CORS, RLS with_check, RPC revoke) — já aplicadas em staging

### Sprint Onboarding + Retenção (2 semanas)
1. SA-A4: onboarding wizard
2. SA-A7: health scores + alertas CS
3. SA-A1: notificações de crédito

### Sprint Analytics (2 semanas)
1. SA-A6: dashboard pastoral completo
2. Relatório semanal automático WhatsApp
3. Relatório mensal PDF

---

## Receita em risco (estimativa)

| Bug | Risco de receita | Cenário |
|---|---|---|
| SA-A2 double billing | Chargeback + cancelamento | Qualquer upgrade cobrado duas vezes |
| SA-A3 marketplace vazio | Perda de upsell | R$279–R$479/mês por agente não vendido |
| SA-A5 router falho | Churn por mau atendimento | Conversa sem resposta = desconfiança |
| SA-A7 health null | CS cego para churn | Perda de cliente sem aviso |

---

## Debt técnico documentado

| Código | Descrição | Onde | Sprint |
|---|---|---|---|
| TEST-DEBT-001 | agent-operacao não testado (não existe) | functions/ | Sprint 1 |
| TEST-DEBT-002 | health_scores nunca populado em staging | DB | Sprint 2 |
| TEST-DEBT-003 | Upgrade Stripe não testado end-to-end | stripe-checkout | Sprint 1 |
| TEST-DEBT-004 | Marketplace: nenhum agente aparece em produção | frontend | Sprint 1 |
