# Auditoria: Row Level Security (RLS) — SA-B6 MEGA-ONDA SEGURANÇA
**Data:** 2026-05-30 | **Analista:** SA-B6 (subagente)

## Resultado Geral

| Métrica | Valor |
|---|---|
| Total de tabelas | 115 |
| RLS habilitado | 115 (100%) ✅ |
| Tabelas sem nenhuma política | 2 ⚠️ |
| Políticas sem WITH CHECK | 47 → corrigidas em SA-B2 ✅ |

## Achados Críticos

### Tabelas com RLS ON mas SEM políticas (lockout total)

1. **`agent_executions`** — logs de execução dos agentes
   - Impacto: queries de usuários autenticados são bloqueadas
   - Fix: política SELECT para `church_id = auth_church_id()`

2. **`church_notes`** — notas internas do cockpit admin
   - Impacto: cockpit admin não lê/cria notas via frontend (funciona via service_role nas EFs)
   - Fix: política ALL para `is_ekthos_admin() = true`

### auth_church_id() — Confirmado
- Lê APENAS de `app_metadata.church_id` ✅
- Sem fallback para `user_metadata` ✅

## Fix SQL

```sql
-- agent_executions — leitura para membros autenticados da igreja
CREATE POLICY "church members can read agent_executions"
  ON public.agent_executions FOR SELECT
  USING (church_id = auth_church_id());

-- church_notes — acesso total para admins Ekthos
CREATE POLICY "ekthos admins can all on church_notes"
  ON public.church_notes FOR ALL
  USING (is_ekthos_admin() = true)
  WITH CHECK (is_ekthos_admin() = true);
```

## Conclusão

100% RLS coverage é excelente. Os 2 lockouts são tabelas de uso interno que funcionam via service_role. Risco real: baixo — mas políticas devem ser criadas para consistência.
