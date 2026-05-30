# SPEC — Upgrade e Downgrade de Assinatura (SA-A2)

> **Sprint:** MEGA-ONDA SEGURANÇA AMPLA  
> **Data:** 2026-05-30  
> **Status:** CRÍTICO — bug de double billing identificado  
> **Prioridade:** CRÍTICO

---

## Bug Identificado (SA-A2)

### Problema: Double Billing no Upgrade

A implementação atual de upgrade de plano usa `stripe.subscriptions.create()` para o novo plano — o que cria uma **segunda assinatura** em paralelo com a existente, resultando em cobrança dupla.

**Comportamento correto:** usar `stripe.subscriptions.update()` na assinatura existente para trocar os items.

**Arquivo afetado:** `supabase/functions/stripe-checkout/index.ts` (ou EF equivalente de upgrade)

### Fix obrigatório antes de qualquer upgrade de cliente

```typescript
// ❌ ERRADO — cria segunda assinatura
const newSub = await stripe.subscriptions.create({
  customer: customerId,
  items: [{ price: newPriceId }],
})

// ✅ CORRETO — modifica assinatura existente
const updatedSub = await stripe.subscriptions.update(existingSubId, {
  items: [{
    id: existingSubItemId,  // ID do item atual dentro da subscription
    price: newPriceId,
  }],
  proration_behavior: 'create_prorations',  // cobra proporcional ao dia
})
```

---

## Contexto do Sistema de Assinatura

### Tabelas relevantes

```sql
-- subscriptions: estado local das assinaturas
subscriptions (
  id, church_id, plan_slug, stripe_subscription_id,
  stripe_customer_id, status, current_period_start,
  current_period_end, cancel_at_period_end
)

-- addons: itens adicionais vinculados à assinatura
subscription_addons (
  id, subscription_id, addon_type, stripe_subscription_item_id,
  quantity, unit_price_cents
)
```

### Fluxo de upgrade

1. Pastor clica em "Fazer upgrade" no painel
2. Frontend chama EF `stripe-checkout` ou `subscription-change` com `{ action: 'upgrade', new_plan_slug }`
3. EF busca `stripe_subscription_id` da assinatura ativa da igreja
4. EF chama `stripe.subscriptions.update()` com novo `price_id`
5. Stripe processa proration e emite invoice imediata (se due_now > 0)
6. Webhook `invoice.payment_succeeded` confirma → atualizar `subscriptions.plan_slug`

---

## Fluxo de downgrade

O downgrade segue o mesmo padrão, mas com `proration_behavior: 'none'` e `billing_cycle_anchor: 'unchanged'` — a mudança só aplica no próximo ciclo:

```typescript
const updatedSub = await stripe.subscriptions.update(existingSubId, {
  items: [{
    id: existingSubItemId,
    price: newLowerPriceId,
  }],
  proration_behavior: 'none',
  billing_cycle_anchor: 'unchanged',
})
```

No downgrade, marcar `subscriptions.pending_plan_slug = newPlanSlug` até o webhook confirmar.

---

## Fluxo de cancelamento

```typescript
// Cancelar ao fim do período atual (não imediato)
const canceledSub = await stripe.subscriptions.update(existingSubId, {
  cancel_at_period_end: true,
})
// Atualizar: subscriptions.cancel_at_period_end = true
```

---

## Add-ons (usuários extras, agentes extras)

Add-ons são itens separados na mesma subscription do Stripe:

```typescript
// Adicionar add-on
await stripe.subscriptionItems.create({
  subscription: existingSubId,
  price: addonPriceId,
  quantity: 1,
  proration_behavior: 'create_prorations',
})

// Remover add-on
await stripe.subscriptionItems.del(addonItemId, {
  proration_behavior: 'create_prorations',
})
```

---

## Edge Function necessária: `subscription-change`

**Path:** `supabase/functions/subscription-change/index.ts`

**Input:**
```typescript
{
  action: 'upgrade' | 'downgrade' | 'cancel' | 'add_addon' | 'remove_addon',
  new_plan_slug?: string,       // para upgrade/downgrade
  addon_type?: string,          // para add_addon/remove_addon
  addon_quantity?: number,      // para add_addon
}
```

**Auth:** JWT obrigatório — `auth_church_id()` determina a igreja

**Saídas esperadas:**
- `{ success: true, proration_amount_cents: number, effective_date: string }`
- `{ error: 'no_active_subscription' | 'plan_not_found' | 'stripe_error' }`

---

## Proteções obrigatórias

1. **Nunca criar nova subscription se já existe uma ativa** — verificar `subscriptions` antes de chamar Stripe
2. **Validar que `new_plan_slug` existe em `plans`** antes de buscar o `price_id` correspondente
3. **Idempotência:** se receber mesmo request duas vezes (retry), não duplicar
4. **Log em `admin_events`** de toda mudança de plano com `{ before, after, amount_prorated }`
5. **Notificar o admin da igreja** por email após mudança confirmada

---

## Mapeamento plan_slug → Stripe price_id

```sql
-- Tabela necessária (pode já existir como plans.stripe_price_id)
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_price_id_monthly text;
ALTER TABLE plans ADD COLUMN IF NOT EXISTS stripe_price_id_annual  text;
```

---

## Critérios de aceite

- [ ] Upgrade não cria segunda subscription no Stripe
- [ ] Proration cobrada corretamente ao upgrade
- [ ] Downgrade aplica no próximo ciclo (não imediato)
- [ ] Cancelamento seta `cancel_at_period_end=true` (não cancela imediato)
- [ ] Add-on adicionado como item na subscription existente
- [ ] `admin_events` registra toda mudança de plano
- [ ] Sem `error.message` retornado ao cliente (usar `internal_error`)
