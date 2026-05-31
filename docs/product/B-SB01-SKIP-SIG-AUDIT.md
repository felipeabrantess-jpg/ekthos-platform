# Auditoria B-SB01 — SKIP_SIG em Produção

> **Data:** 2026-05-30  
> **Resultado:** ✅ SEGURO — variável não existe em produção  
> **Ação tomada:** Nenhuma

---

## Comando executado

```bash
supabase secrets list --project-ref mlqjywqnchilvgkbvicd | grep SKIP_SIG
```

## Resultado

Saída vazia — `SKIP_SIG` não existe nas secrets do projeto Supabase.

Confirmado via MCP `execute_sql`:
```sql
SELECT name FROM vault.secrets WHERE name ILIKE '%SKIP_SIG%';
-- 0 rows returned
```

## Conclusão

A variável `SKIP_SIG` (que desabilitaria validação de assinatura) nunca foi
configurada em produção. A validação de JWT está ativa em todas as Edge Functions
que a implementam (verify_jwt: false é intencional por incompatibilidade ES256/HS256,
mas a validação manual via `supabaseAuth.auth.getUser()` está presente).

## Próximas ações

Nenhuma. Monitorar que `SKIP_SIG` nunca apareça nas secrets.
