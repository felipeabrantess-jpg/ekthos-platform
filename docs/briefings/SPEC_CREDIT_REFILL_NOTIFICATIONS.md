# SPEC — Notificações de Recarga de Créditos (SA-A1)

> **Sprint:** MEGA-ONDA SEGURANÇA AMPLA  
> **Data:** 2026-05-30  
> **Status:** Spec pronto — aguardando sprint de implementação  
> **Prioridade:** ALTO

---

## Contexto

O sistema de créditos da Ekthos (`church_agent_credits`) controla quantas interações cada igreja pode fazer com agentes IA. Quando os créditos acabam, o agente para de responder — mas atualmente a igreja não recebe nenhum aviso antes de chegar a zero.

**Problema:** O pastor só descobre que os créditos acabaram quando um membro reclama que não foi respondido.

---

## Comportamento atual

- `church_agent_credits.remaining_credits` é debitado a cada uso via `debit_agent_credits` RPC
- Não existe nenhuma notificação quando créditos caem abaixo de um threshold
- Não existe reposição automática de créditos em nenhum cenário atual
- Auditoria de uso em `agent_credit_usage` com `operation_type` (`debit` / `refill` / `bonus`)

---

## Comportamento esperado (pós-implementação)

### Threshold de alerta

| Nível | Trigger | Ação |
|---|---|---|
| Aviso | remaining_credits ≤ 20% do limite do plano | Notificação in-app + email |
| Crítico | remaining_credits ≤ 10 créditos absolutos | Notificação in-app urgente + email + badge vermelho no dashboard |
| Esgotado | remaining_credits = 0 | Notificação + bloqueio suave (agente continua mas log alerta) |

### Canais de notificação

1. **In-app:** badge no sino + card de alerta no dashboard
2. **Email:** template de aviso com link para recarga/upgrade
3. **WhatsApp do pastor** (se configurado): mensagem de alerta (implementar via `dispatch-message`)

### Reposição automática

- Créditos repostos mensalmente no ciclo de billing (integrar com webhook do Stripe)
- Evento `invoice.payment_succeeded` → `INSERT/UPDATE church_agent_credits` com novo saldo
- Valor do saldo por plano definido em tabela `plan_credit_limits` (a criar)

---

## Schema de suporte

### Tabela `plan_credit_limits` (nova)

```sql
CREATE TABLE plan_credit_limits (
  plan_slug       text PRIMARY KEY REFERENCES plans(slug),
  monthly_credits integer NOT NULL,
  alert_threshold_pct numeric(5,2) DEFAULT 20.0,
  created_at      timestamptz DEFAULT now()
);
```

### Trigger ou cron de verificação

**Opção A (trigger):** after update em `church_agent_credits` quando `remaining_credits` cai
**Opção B (cron):** verificação periódica (ex: a cada hora via pg_cron ou Supabase Scheduled Functions)

Recomendação: **Opção A** — trigger imediato, sem polling.

---

## Edge Function necessária

`credit-alert-dispatcher` (nova):
- Input: `{ church_id, agent_scope, remaining, limit }`
- Lógica: determina nível de alerta, busca preferências da igreja, envia notificações
- Auth: chamada via trigger/webhook interno (service_role)

---

## Casos de borda

- Igreja com crédito zerado não deve crashar — agente responde mas registra `credit_exhausted=true` no log
- Alerta não deve ser enviado mais de 1x por dia para o mesmo threshold (deduplicação por `church_id + threshold + date`)
- Quando créditos são repostos, enviar confirmação: "Seus créditos foram renovados. Saldo: X."

---

## Arquivos a criar/modificar

| Arquivo | Ação |
|---|---|
| `supabase/migrations/YYYYMMDD_plan_credit_limits.sql` | Criar tabela + dados iniciais |
| `supabase/functions/credit-alert-dispatcher/index.ts` | Criar EF |
| `supabase/functions/_shared/notifications.ts` | Adicionar helper de notificação de crédito |
| `web/src/components/dashboard/CreditAlertBanner.tsx` | Criar banner de alerta no dashboard |

---

## Dependências

- `stripe-webhook` deve processar `invoice.payment_succeeded` e chamar `credit-alert-dispatcher` com `operation_type='refill'`
- `debit_agent_credits` RPC deve retornar `remaining_after` para o trigger comparar com threshold

---

## Critérios de aceite

- [ ] Igreja recebe notificação in-app quando créditos atingem 20% do limite
- [ ] Email enviado automaticamente no threshold crítico (10 créditos)
- [ ] Créditos repostos automaticamente no ciclo de billing Stripe
- [ ] Dashboard mostra saldo atual com barra de progresso
- [ ] Log de `agent_credit_usage` registra `refill` com `amount` correto após reposição
