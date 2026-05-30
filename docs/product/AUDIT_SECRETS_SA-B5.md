# Auditoria: Gestão de Secrets — SA-B5 MEGA-ONDA SEGURANÇA
**Data:** 2026-05-30 | **Analista:** SA-B5 (subagente)

## Resumo

Auditoria de secrets hardcoded, vazamento de mensagens de erro e padrões de segurança nas Edge Functions.

## Achados

### 1. Sem secrets hardcoded ✅
Varredura completa em todas as Edge Functions: nenhum secret, API key ou credencial hardcoded encontrado. Todos os valores sensíveis são lidos via `Deno.env.get()`.

### 2. Vazamento de err.message em 9 EFs — RISCO MÉDIO
As seguintes funções retornam `error.message` diretamente no response HTTP (vaza detalhes internos do schema):

| Edge Function | Padrão problemático |
|---|---|
| admin-agent-grant | `{ error: error.message }` nos catch blocks |
| admin-church-detail | idem |
| stripe-checkout | idem |
| affiliate-crud | idem |
| affiliate-commissions-approve | idem |
| affiliate-commissions-mark-paid | idem |
| church-invite-user | idem |
| addon-request | idem |
| admin-church-create | idem |

### 3. _shared/errors.ts existe mas não é usado
O arquivo `supabase/functions/_shared/errors.ts` define funções de erro padronizadas, mas nenhuma EF o importa.

## Fix Recomendado

Nas 9 EFs acima, substituir:
```typescript
// ANTES (vaza detalhes internos)
return jsonResponse({ error: error.message }, 400, cors)

// DEPOIS (seguro)
console.error('[ef-name] erro interno:', error.message)
return jsonResponse({ error: 'internal_error' }, 400, cors)
```

## Status

- Secrets hardcoded: ✅ LIMPO
- err.message leak: ⚠️ 9 funções afetadas (não-BLINDADAS)
- _shared/errors.ts adotado: ❌ 0 de N funções
