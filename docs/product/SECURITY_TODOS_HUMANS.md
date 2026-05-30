# TODOs de Segurança — Para o Humano (Felipe)
**Data:** 2026-05-30 | **Sprint:** MEGA-ONDA SEGURANÇA AMPLA

## CRÍTICOS — Fazer ASAP

### S-001: Verificar SKIP_SIG em produção
**Ação:** `supabase secrets list --project-ref mlqjywqnchilvgkbvicd | grep SKIP_SIG`
**Esperado:** variável NÃO deve existir em produção.

### S-002: Assinatura Z-API no webhook-receiver (BLINDADO)
**Descrição:** `webhook-receiver` não verifica `client-token` da Z-API. Qualquer IP conhecendo a URL pode injetar mensagens.
**Ação:** Abrir Issue GitHub com label `security`. Implementar na próxima sprint.

### S-003: Fix dedup provider_message_id='' (BLINDADO)
**Descrição:** Dedup check passa para provider_message_id vazio → mesma mensagem processada N vezes.
**Fix:** `if (!provider_message_id?.trim()) return early;` antes do dedup.

## ALTOS — Próxima Sprint

### S-004: Eliminar err.message em responses HTTP
**Arquivos:** admin-agent-grant, admin-church-detail, stripe-checkout, affiliate-crud, affiliate-commissions-*, church-invite-user, addon-request, admin-church-create, admin-church-pricing.
**Fix:** Substituir `{ error: error.message }` por `{ error: 'internal_error' }` + `console.error` interno.

## MÉDIOS — Backlog

### S-005: Políticas RLS para agent_executions e church_notes
**SQL:** Ver `docs/product/AUDIT_RLS_SA-B6.md`.

### S-006: Rate limit em coupon-validate
**Risco:** Brute force de códigos de cupom.

### S-007: CHECK constraint remaining_credits >= 0
```sql
ALTER TABLE church_agent_credits
  ADD CONSTRAINT chk_remaining_non_negative CHECK (remaining_credits >= 0);
```

## Formato Issues GitHub

Labels: `security`, `priority:critical|high|medium`
Milestone: `Security Sprint`
