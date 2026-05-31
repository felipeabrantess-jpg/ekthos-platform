# Auditoria B-SB05 — RPCs Anon-Accessible (Case-by-Case)

> **Data:** 2026-05-30  
> **Total auditado:** 21 RPCs com EXECUTE concedido a anon ou PUBLIC  
> **Resultado:** 3 completamente revogadas, 14 tiveram anon revogado mantendo PUBLIC, 4 mantidas intactas

---

## Categorias

### ✅ Legítimas — mantidas intactas (4)

| RPC | Motivo |
|---|---|
| `auth_church_id` | Identidade multi-tenant — requerida em todo o sistema |
| `auth_user_role` | Verifica role do usuário autenticado |
| `auth_can_all_people` | Permissão pastoral (precisa PUBLIC para RLS) |
| `auth_can_financial` | Permissão financeira (idem) |

### ⚠️ Trigger-only — anon revogado, PUBLIC retido (14)

Essas RPCs são chamadas por triggers internos do Postgres, não por PostgREST.
O anon grant não gerava exposição real mas foi revogado por higiene.
O PUBLIC grant foi mantido para não quebrar os triggers.

Funções: `handle_new_conversation`, `handle_new_message`, `update_conversation_updated_at`,
`handle_pipeline_stage_change`, `generate_slug`, `update_updated_at_column`,
`calculate_days_in_stage`, e outras funções de trigger interno.

### 🔴 Completamente revogadas (3) — migration 20260530090000

| RPC | Motivo | Aplicação atual |
|---|---|---|
| `capture_visitor_to_pipeline` | INSERT em `person_pipeline` sem auth guard — dead weight | Via service_role na EF `visitor-capture` |
| `increment_qr_scanned_count` | UPDATE em `qr_codes.scanned_count` sem auth guard | Via service_role na EF `qr-visitor` |
| `validate_session_token` | Usa `auth.uid()` — no-op para anon | Via auth na EF `session-validator` |

---

## Smoke test pós-revogação

```sql
-- Deve retornar 0 para as 3 funções revogadas
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('capture_visitor_to_pipeline','increment_qr_scanned_count','validate_session_token')
  AND grantee IN ('anon', 'PUBLIC');
-- Expected: 0 rows
```
