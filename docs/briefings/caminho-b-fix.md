# Caminho B — Fix Report
**Data:** 2026-04-27  
**Sessão:** Fix Conservador — trial manual 7 dias sem Stripe

---

## Resumo

Caminho B é o fluxo de criação de nova igreja pelo cockpit admin (EF `admin-church-create`), sem envolver Stripe. Foram identificados e corrigidos **4 bugs bloqueantes** + **1 bug pré-existente no banco**.

---

## Bugs corrigidos

### B1 — `churches.status` errado (cosmético mas semântico)
- **Antes:** `status='pending_payment'`
- **Depois:** `status='onboarding'` (correto para Caminho B)

### B2 — `subscriptions` com campos inválidos/faltantes
- **Antes:** sem `billing_origin`, sem `trial_end`, sem `effective_price_cents`, sem `discount_cents`, sem `created_by`
- **Depois:** todos os campos presentes e válidos
  - `billing_origin='cockpit_manual'` ✅ (passa `chk_billing_origin`)
  - `status='trialing'` ✅
  - `trial_end = now() + 7 dias` ✅
  - `discount_cents=0` ✅

### B3 — `grant_access()` parâmetros errados
- **Antes:** `p_source='cockpit_create'` (inválido no CHECK) + `p_created_by` (nome errado)
- **Depois:** `p_source='cockpit'` + `p_granted_by` (nome correto da assinatura SQL)

### B4 — `churches.slug` NOT NULL sem default
- **Antes:** EF não gerava slug → `null value in column "slug" violates not-null constraint`
- **Depois:** `slugify(churchName) + '-' + Date.now().toString(36)` → slug único e URL-safe

### B5 — `grant_access()` actor_type='user' viola CHECK de audit_logs
- **Antes:** `CASE ... ELSE 'user' END` — 'user' não consta no CHECK (`agent|human|system|webhook`)
- **Depois:** `CASE ... ELSE 'human' END` ✅
- **Fix:** Migration `20260427160000_fix_grant_access_actor_type.sql`

---

## Outros itens entregues

### T2 — UI feedback no cockpit
- `Churches.tsx`: toast verde com mensagem de sucesso após criação (auto-dismiss 5s)

### T3 — Template de invite em PT-BR
- `supabase/templates/invite.html`: CTA alterado para "Criar minha senha"
- `redirectTo` corrigido: `/auth/set-password` (era `/payment-pending`)
- Enviado via Management API PATCH

---

## Validação — Portão 2 (SQL)

| Campo | Valor esperado | Resultado |
|---|---|---|
| `church_status` | `onboarding` | ✅ |
| `slug` | gerado automaticamente | ✅ |
| `sub_status` | `trialing` | ✅ |
| `billing_origin` | `cockpit_manual` | ✅ |
| `trial_end` | `now() + 7 dias` | ✅ |
| `grant_type` | `manual_trial` | ✅ |
| `grant_source` | `cockpit` | ✅ |
| `user_roles.role` | `admin` | ✅ |
| `app_metadata.church_id` | church_id correto | ✅ |

---

## Portão 3 — Não-regressão

| Verificação | Resultado |
|---|---|
| Login `felipe@ekthosai.net` | ✅ funcional |
| `grant_access()` source correto | ✅ |
| RLS ativa em todas as tabelas afetadas | ✅ |
| EF `stripe-webhook` (Caminho A) não tocada | ✅ |
| Nenhum dado real afetado | ✅ |

---

## Arquivos alterados

| Arquivo | Tipo | Descrição |
|---|---|---|
| `supabase/functions/admin-church-create/index.ts` | EF rewrite (v4) | Todos os 4 bugs B1-B4 |
| `supabase/migrations/20260427160000_fix_grant_access_actor_type.sql` | Migration | Bug B5: actor_type 'user'→'human' |
| `web/src/pages/admin/Churches.tsx` | Frontend | Toast de sucesso |
| `supabase/templates/invite.html` | Email template | CTA PT-BR + redirectTo correto |

---

## Rollback disponível

A EF tem rollback automático em 3 camadas:
1. Falha no `grant_access` → deleta sub + church
2. Falha no invite → deleta grant + sub + church
3. Falha em `user_roles` → loga warning, não reverte (não-fatal)

Para reverter a migration B5, basta recriar `grant_access()` com `'user'` no lugar de `'human'` (não recomendado — é um bug real).
