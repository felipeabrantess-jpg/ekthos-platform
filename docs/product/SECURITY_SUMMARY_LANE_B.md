# Resumo Executivo de Segurança — Lane B MEGA-ONDA
**Data:** 2026-05-30 | **Sprint:** MEGA-ONDA SEGURANÇA AMPLA

## O Que Foi Aplicado

### DB (SA-B1, SA-B2):
- **39 RPCs** revogadas de `anon`/`PUBLIC` → 21 funções legítimas mantidas
- **47 políticas RLS** atualizadas com `WITH CHECK` explícito

### Código (SA-B3, SA-B7):
- **agent-acolhimento v22**: `send_window` lido de `church_agent_config` antes de `checkAntiSpam`
- **_shared/agent-tools.ts**: `delay_until` calculado em horas relativas ao timezone local (fix bug UTC→BRT)
- **admin-agent-grant**: CORS origin validation
- **admin-church-detail**: CORS origin validation
- **lead-capture**: CORS whitelist expandida (ekthosai.net)
- **test-whatsapp-message**: OPTIONS retorna 204 correto

### Migrations (repo local):
- `20260530040000_rename_avulso_slugs_to_agent_canon.sql`
- `20260530050000_backfill_church_agent_credits_canon.sql`
- `20260530060000_fix_agent_credit_usage_operation_type.sql`
- `20260530070000_security_revoke_anon_rpcs_bulk.sql`
- `20260530080000_security_with_check_remaining_policies.sql`

## Métricas Finais

| Métrica | Antes | Depois |
|---|---|---|
| RPCs acessíveis por anon | ~60 | 21 (apenas legítimas) |
| Políticas sem WITH CHECK | 47 | 0 |
| Tabelas sem RLS | 0 | 0 |
| CORS sem whitelist (EFs admin) | 2 | 0 |
| delay_until bug UTC→BRT | SIM | CORRIGIDO |
| send_window ignorado | SIM | CORRIGIDO |

## Riscos Abertos (Requerem Humano)

| Severidade | Risco | Bloqueio |
|---|---|---|
| CRÍTICO | webhook-receiver sem auth | BLINDADO — criar Issue |
| CRÍTICO | provider_message_id='' bypassa dedup | BLINDADO — criar Issue |
| CRÍTICO | stripe-webhook SKIP_SIG em prod? | Verificar secrets |
| ALTO | 9 EFs vazam err.message | Issue + Sprint |
| MÉDIO | agent_executions/church_notes sem políticas | Próxima sprint |
| MÉDIO | coupon-validate sem rate limit | Próxima sprint |
| BAIXO | remaining_credits pode ficar negativo | Próxima sprint |
