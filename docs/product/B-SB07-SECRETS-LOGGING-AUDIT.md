# Auditoria B-SB07 — Sanitização de Logs com Dados Sensíveis

> **Data:** 2026-05-30  
> **Escopo:** 68 Edge Functions + _shared  
> **Ocorrências auditadas:** 399 console.log/error/warn  
> **Fixes aplicados nesta sprint:** 5 críticos (zapi-send + chatpro-send)  
> **Fixes pendentes Sprint 1:** ~20 (erro.message em console de EFs admin)

---

## Fixes aplicados (Lane B)

### zapi-send/index.ts

| Linha | Antes | Depois |
|---|---|---|
| ~71 | `console.error(..., e)` | `console.error(..., e instanceof Error ? e.message : 'unknown')` |
| ~108 | `console.log(... ${phone} via ...)` | `console.log(... ***${phone.slice(-4)} via ...)` |
| ~133 | `console.log(... JSON.stringify(result))` | `console.log(... Z-API status=${status})` |

### chatpro-send/index.ts

| Linha | Antes | Depois |
|---|---|---|
| ~83 | `console.log(... ${cleanPhone} via ...)` | `console.log(... ***${cleanPhone.slice(-4)} via ...)` |
| ~109 | `console.log(... JSON.stringify(result))` | `console.log(... ChatPro status=${status})` |

**Razão:** Números de telefone completos + respostas de API de terceiros
com dados potencialmente sensíveis não devem aparecer em logs.

---

## Pendências para Sprint 1 (S-004)

Todas as EFs abaixo têm `console.error(..., error)` expondo objeto Supabase completo:

| EF | Linhas | Impacto |
|---|---|---|
| admin-notes-crud | 69, 92, 134, 142 | Admin-only, baixo risco |
| admin-tasks-crud | 75, 100, 143, 160, 202, 212 | Admin-only |
| affiliate-coupon-toggle | 112 | Admin-only |
| affiliate-coupon-create | 178 | Admin-only |
| affiliate-commissions-approve | 63 | Admin-only |
| affiliate-commissions-mark-paid | 68, 80 | Admin-only |
| affiliate-commissions-export-csv | 83, 130, 142 | Admin-only |
| affiliate-crud | 83, 145, 188 | Admin-only |
| admin-church-create | 208, 238 | Admin-only (261 corrigido) |
| admin-church-pricing | 104 | Admin-only |
| agents-catalog-update | 119 | Admin-only |
| plans-update | 167 | Admin-only |
| addon-prices-update | 157 | Admin-only |
| addon-request | 185 | Admin-only |

**Fix padrão:** `console.error('[ef-name] msg:', error)` → `console.error('[ef-name] msg:', error?.message ?? 'unknown')`

**Prioridade:** MÉDIO — todas são EFs admin-only. Risco é vazamento de
schema interno para logs da Supabase (acessível pelo time Ekthos),
não para usuários finais.
