# Auditoria: Rate Limiting — SA-B8 MEGA-ONDA SEGURANÇA
**Data:** 2026-05-30 | **Analista:** SA-B8 (subagente)

## Achados

### webhook-receiver — CRÍTICO (BLINDADO)
- Sem autenticação. Qualquer IP conhecendo a URL pode enviar mensagens.
- Dedup bug: `provider_message_id = ''` aceito como válido → mesma mensagem pode ser processada N vezes.
- Sem rate limit: sujeito a flood de mensagens.
- **Status:** BLINDADO — requer aprovação.

### lead-capture — BOM ✅
- Rate limit: 5 POSTs/IP/hora
- Dedup 24h por (email + plano)
- Silent block para bots (retorna 200 sem revelar motivo)

### stripe-checkout — BOM ✅
- Rate limiting via Stripe
- JWT validation obrigatória

### agent-acolhimento (inbound) — BOM ✅
- Rate limit: 5 respostas automáticas/conversa em 5 minutos
- Implementado antes da chamada ao Claude (economiza tokens)

### coupon-validate — MÉDIO
- Sem rate limit → possível brute force de códigos
- Mitigação parcial: `redemptions_limit` na tabela coupons

## Ações Pendentes

| Prioridade | Ação | Arquivo |
|---|---|---|
| CRÍTICO | Auth + rate limit no webhook-receiver | BLINDADO |
| CRÍTICO | Fix dedup: rejeitar provider_message_id='' | BLINDADO |
| MÉDIO | Rate limit em coupon-validate | coupon-validate/index.ts |
