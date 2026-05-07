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

## OPS-DEBT-001 — Deletar EF test-r23

**Registrado em:** 06/05/2026 (sessão H2 — Frente 2)
**Origem:** EF temporária `test-r23` criada para executar R23
(privilege escalation test) durante a closure da vulnerabilidade H2.
A EF foi tombstonada (retorna 404 para todas as chamadas sem header
especial) mas ainda existe no registro de Edge Functions do Supabase.

**Ação necessária:**
Deletar via Supabase Dashboard > Edge Functions > test-r23 > Delete.
Ou via CLI: `supabase functions delete test-r23 --project-ref mlqjywqnchilvgkbvicd`

**Risco:** Baixo (tombstonada, não executa nada útil). Não bloqueia nenhuma feature.

**Critério de pronto:** EF `test-r23` não aparece mais na lista de Edge Functions.

---

## OPS-DEBT-002 — Rotação de senha Playwright a cada 90 dias

**Registrado em:** 06/05/2026 (sessão H2 — Frente 2.5)
**Origem:** Usuário `playwright@ekthosai.net` criado com senha longa gerada via crypto.
Senha armazenada em Vercel (encrypted) + `web/.env.local` (gitignored).
Sem rotação automática configurada.

**Ação necessária a cada 90 dias:**
1. Fazer deploy de nova versão de `setup-playwright-user` (ou usar Admin API diretamente)
   com action `reset_password`
2. Capturar nova senha e atualizar:
   - Vercel env `PLAYWRIGHT_ADMIN_PASSWORD` (encrypted) via Dashboard ou API
   - `web/.env.local` localmente
3. Deletar `.auth.json` cacheado: `rm -f web/tests/e2e/.auth.json`
4. Confirmar que smoke test passa: `npx playwright test --config=playwright.prod.config.ts`

**Próxima rotação:** 05/06/2026 (30 dias — conta com `is_ekthos_admin=true` exige ciclo curto)

**Risco:** Médio-Alto (conta admin de teste sem rotação pode virar vetor de acesso persistente).
Senha é `is_ekthos_admin=true` — rotação a cada **30 dias** (não 90).

**Critério de pronto:** Senha atualizada nos dois destinos, smoke test verde.

---

## OPS-DEBT-003 — Deletar EF setup-playwright-user

**Registrado em:** 06/05/2026 (sessão H2 — Frente 2.5)
**Origem:** EF temporária `setup-playwright-user` criada para provisionar `playwright@ekthosai.net`.
Tombstonada (retorna 404 para todas as chamadas).

**Ação necessária:**
Deletar via Supabase Dashboard > Edge Functions > setup-playwright-user > Delete.
Ou via CLI: `supabase functions delete setup-playwright-user --project-ref mlqjywqnchilvgkbvicd`

**Risco:** Baixo (tombstonada, não executa nada útil). Não bloqueia nenhuma feature.

**Critério de pronto:** EF `setup-playwright-user` não aparece mais na lista de Edge Functions.

---

## OPS-DEBT-004 — Credenciais Playwright efêmeras por CI run

**Registrado em:** 06/05/2026 (sessão H2 — Frente 2.5 — code review Sonnet M1)
**Origem:** Conta estática `playwright@ekthosai.net` com senha de longa duração.
Code review identificou que o ideal para conta com `is_ekthos_admin=true` é
credencial efêmera por pipeline (TTL ~1h), não rotação manual periódica.

**Ação necessária:**
Criar Edge Function `mint-e2e-session` que:
1. Verifica IP allowlist (apenas IPs do GitHub Actions)
2. Autentica como playwright@ekthosai.net internamente via service_role
3. Retorna token de sessão com TTL de 1h
4. Cada CI run usa um token diferente — senha de longa duração deixa de existir

Quando implementado, OPS-DEBT-002 (rotação 30d) fica obsoleto.

**Bloqueia:** Nada (melhoria de segurança, não feature).
**Pré-requisito:** CI/CD com GitHub Actions configurado.

**Risco atual (até implementação):** Mitigado por OPS-DEBT-002 (rotação 30d).

**Critério de pronto:** CI run usa token efêmero; conta não tem senha estática.

---

## OPS-DEBT-005 — Deprecar churches.state (coluna legado)

**Registrado em:** 07/05/2026 (sessão H3 — Frente 3A)
**Origem:** Coluna `churches.state` tem valores inconsistentes em produção:
`''` (string vazia), `'Rio de Janeiro'` (nome completo), `'RJ'` (sigla).
A nova coluna `churches.uf` (M2 Frente 3A) é o source-of-truth para estado.

**Evidência:**
```sql
SELECT DISTINCT state FROM public.churches ORDER BY state;
-- '', 'Rio de Janeiro', 'RJ', ...
```

**Ação necessária:**
1. Migração de dados: popular `uf` com sigla normalizada a partir de `state`
   para igrejas existentes (backfill manual ou via script)
2. Deprecated: remover `state` do payload de criação (já feito em `admin-church-create` — campo ignorado a partir de R12)
3. Remover coluna: `ALTER TABLE churches DROP COLUMN state` — apenas após frontend não usar mais `state`
4. Adicionar CHECK em `uf`: `CHECK (uf ~ '^[A-Z]{2}$')` — garante sempre sigla

**Risco:** Baixo para novos registros (onboarding_step='pending' usa `uf`).
Médio para registros antigos com `state` inconsistente.

**Bloqueia:** Frontend que exibe estado da igreja pode mostrar valores errados
enquanto a normalização não for feita.

**Critério de pronto:**
- `uf` populado para todas as igrejas ativas em produção
- `state` removido do schema
- Frontend usa apenas `uf`

---

## OPS-DEBT-006 — Stripe self-service church creation (Caminho A)

**Registrado em:** 07/05/2026 (sessão H3 — Frente 3A)
**Origem:** O fluxo atual de criação de igrejas é 100% manual via cockpit
(Caminho B — trial manual 7 dias). Caminho A (self-service com Stripe Checkout)
foi descartado para o lançamento mas é a evolução natural pós-PMF.

**Descrição do Caminho A:**
1. Pastor acessa landing → escolhe plano → Stripe Checkout
2. Stripe Checkout cria sessão → webhook `checkout.session.completed`
3. Webhook cria church + subscription + access_grant + invite automaticamente
4. Pastor recebe e-mail com link para definir senha

**Itens necessários:**
1. Edge Function `stripe-checkout-create` (gera Payment Link ou Session)
2. Webhook handler para `checkout.session.completed`
3. Lógica de slug único sem colisão (retry automático)
4. Tela de "aguardando pagamento" no frontend
5. Testes E2E com Stripe test mode

**Pré-requisito:** F9 (Stripe live) estar funcionando.

**Risco:** Sem impacto no fluxo atual (Caminho B continua funcionando).
Caminho A é aditivo.

**Critério de pronto:**
- Igreja criada automaticamente após pagamento Stripe
- Zero intervenção manual da equipe Ekthos
- Webhook idempotente (retries seguros)

---

## TEST-DEBT-001 a TEST-DEBT-003

Conforme registrado no log de sessão 26/04/2026 — não duplicar aqui.
