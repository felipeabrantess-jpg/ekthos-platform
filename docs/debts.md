# Débitos técnicos registrados

## TEST-DEBT-004 — Worker para coupon_sync_jobs

**Registrado em:** 27/04/2026 (sessão F4)
**Origem:** Trigger `queue_coupon_sync` enfileira jobs pendentes em
`public.coupon_sync_jobs`, mas não há processador rodando. EF
`coupons-stripe-sync` precisa ser chamada manualmente ou via UI do Cockpit.

**Impacto:** Cupons criados em `public.coupons` NÃO são automaticamente
mirrorados no Stripe. Mirror requer chamada manual à EF (admin) ou UI
dedicada (F11). Enquanto o worker não existir, o fluxo é:
1. Admin insere cupom via Cockpit → trigger enfileira job `create`
2. Admin clica "Sincronizar" na UI → Cockpit chama `coupons-stripe-sync`
3. EF processa e popula `stripe_coupon_id` + `stripe_promotion_code_id`

**Resolução planejada (F11):**
1. UI no Cockpit `/admin/coupons` com botão "Sincronizar com Stripe"
   por cupom + ação em massa "Sincronizar pendentes"
2. Worker via Supabase Cron ou pg_cron rodando a cada ~1 min:
   - Busca jobs com `status = 'pending'` OR (`status = 'failed'` AND
     `next_retry_at <= now()`)
   - Para cada job: chama `coupons-stripe-sync` via HTTP interno
   - Respeita `max_attempts` e abandona após esgotar (status `abandoned`)

**Bloqueia:** F9 (Stripe live) não deve ser ativado para cupons sem
o worker funcionando. Sequência obrigatória: **F11 → F9** nessa ordem.
Ou: F9 sem permitir uso de cupons até F11 estar pronta.

**Critério de pronto:**
- Worker rodando em produção (Supabase Cron ou pg_cron)
- Métricas: `jobs pending count` + `jobs abandoned count` visíveis no Cockpit
- Alerta automático se `abandoned > 0` (Slack ou e-mail para admin)

---

## TEST-DEBT-001 a TEST-DEBT-003

Conforme registrado no log de sessão 26/04/2026 — não duplicar aqui.
