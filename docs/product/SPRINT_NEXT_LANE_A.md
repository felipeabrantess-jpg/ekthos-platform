# Próxima Sprint — Plano de Execução Lane A + B

> **Data:** 2026-05-30  
> **Contexto:** Pós MEGA-ONDA SEGURANÇA AMPLA  
> **Para:** Felipe (decisão de prioridade e aprovação de blindados)

---

## O que está pronto para deploy (Lane B — staging)

Estes itens já estão em `staging` e aguardam PR + merge para `main`:

| Item | Arquivo modificado | Status |
|---|---|---|
| CORS fix admin-agent-grant | `supabase/functions/admin-agent-grant/index.ts` | ✅ Pronto |
| CORS fix admin-church-detail | `supabase/functions/admin-church-detail/index.ts` | ✅ Pronto |
| CORS fix lead-capture | `supabase/functions/lead-capture/index.ts` | ✅ Pronto |
| OPTIONS fix test-whatsapp-message | `supabase/functions/test-whatsapp-message/index.ts` | ✅ Pronto |
| agent-acolhimento v22 (send_window + timezone) | `supabase/functions/agent-acolhimento/index.ts` | ✅ Deployado |
| delay_until timezone fix | `supabase/functions/_shared/agent-tools.ts` | ✅ Pronto |
| Migration SA-B1: revoke 39 RPCs anon | `supabase/migrations/20260530070000_*.sql` | ✅ Aplicado DB |
| Migration SA-B2: 47 RLS WITH CHECK | `supabase/migrations/20260530080000_*.sql` | ✅ Aplicado DB |

**Ação de Felipe:** criar PR `staging → main` via GitHub e aprovar o merge.

---

## Itens que requerem ação humana ANTES de qualquer implementação

### CRÍTICOS

**S-001 — Verificar SKIP_SIG em produção (5 minutos)**
```bash
supabase secrets list --project-ref mlqjywqnchilvgkbvicd | grep SKIP_SIG
```
Esperado: variável NÃO deve existir. Se existir: remover imediatamente.

**S-002 — Criar Issue GitHub: webhook-receiver sem autenticação**
- Label: `security`, `priority:critical`
- Milestone: `Security Sprint`
- Body: "webhook-receiver não verifica `client-token` da Z-API. Qualquer IP conhecendo a URL pode injetar mensagens."
- Status: BLINDADO — não implementar sem aprovação

**S-003 — Criar Issue GitHub: dedup bypass com provider_message_id=''**
- Label: `security`, `priority:critical`
- Body: "Dedup check passa para provider_message_id vazio → mesma mensagem processada N vezes."
- Status: BLINDADO — não implementar sem aprovação

**SA-A5-HOTFIX — Aprovar fallback em conversation-router para agent-operacao ausente**
- Arquivo BLINDADO — requer aprovação explícita para qualquer modificação
- Enquanto não aprovado: conversas operacionais continuam falhando silenciosamente

---

## Sprint 1 recomendada (2 semanas pós-merge)

### Prioridade 1 — Bugs críticos de produto

| Task | Esforço | Spec |
|---|---|---|
| Fix SA-A2: double billing no upgrade Stripe | 1 dia | SPEC_SUBSCRIPTION_UPGRADE_DOWNGRADE.md |
| Fix SA-A3: marketplace vazio (tier mismatch) | 2 dias | SPEC_AGENT_MARKETPLACE_UI.md |
| Criar agent-operacao (SA-A5) | 2 dias | SPEC_MULTI_AGENT_ORCHESTRATION.md |
| Fallback conversation-router (SA-A5) | 0.5 dia | Requer aprovação BLINDADO |

### Prioridade 2 — Segurança residual (S-004)

| Task | Esforço |
|---|---|
| Substituir `{ error: error.message }` por `{ error: 'internal_error' }` em 9 EFs | 1 dia |
| EFs afetadas: admin-agent-grant, admin-church-detail, stripe-checkout, affiliate-crud, affiliate-commissions-*, church-invite-user, addon-request, admin-church-create, admin-church-pricing | — |

---

## Sprint 2 recomendada (2 semanas depois)

| Task | Esforço | Spec |
|---|---|---|
| Onboarding wizard (SA-A4) | 5 dias | SPEC_ONBOARDING_WIZARD.md |
| Health scores worker (SA-A7) | 3 dias | SPEC_CHURN_DETECTION.md |
| Notificações de crédito (SA-A1) | 2 dias | SPEC_CREDIT_REFILL_NOTIFICATIONS.md |

---

## Sprint 3 recomendada

| Task | Esforço | Spec |
|---|---|---|
| Dashboard analytics pastoral (SA-A6) | 5 dias | SPEC_PASTORAL_ANALYTICS.md |
| Relatório semanal automático | 3 dias | — |
| CHECK constraint remaining_credits >= 0 (S-007) | 0.5 dia | SQL em SECURITY_TODOS_HUMANS.md |
| RLS policies agent_executions + church_notes (S-005) | 1 dia | AUDIT_RLS_SA-B6.md |
| Rate limit coupon-validate (S-006) | 1 dia | — |

---

## Todos os SPECs disponíveis para o próximo engenheiro

| Spec | Localização |
|---|---|
| SPEC_CREDIT_REFILL_NOTIFICATIONS | docs/briefings/ |
| SPEC_SUBSCRIPTION_UPGRADE_DOWNGRADE | docs/briefings/ |
| SPEC_AGENT_MARKETPLACE_UI | docs/briefings/ |
| SPEC_ONBOARDING_WIZARD | docs/briefings/ |
| SPEC_MULTI_AGENT_ORCHESTRATION | docs/briefings/ |
| SPEC_PASTORAL_ANALYTICS | docs/briefings/ |
| SPEC_CHURN_DETECTION | docs/briefings/ |
| SPEC_ADMIN_CHURCH_DETAIL | docs/briefings/ |
| SPEC_PIPELINE_JOURNEY_UX | docs/briefings/ |

---

## Resumo para Felipe

**Agora (5 min):**
1. `supabase secrets list | grep SKIP_SIG`
2. PR staging → main no GitHub
3. Criar 2 issues GitHub (S-002, S-003)
4. Aprovar ou não o hotfix do conversation-router (SA-A5)

**Esta semana:**
- Sprint 1 começa com SA-A2 (double billing) e SA-A3 (marketplace)

**Este mês:**
- Sprints 1, 2 e 3 entregam a plataforma pronta para escalar clientes sem dívida técnica crítica
