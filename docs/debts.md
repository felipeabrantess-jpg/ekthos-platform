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

## OPS-DEBT-007 — GRANT EXECUTE explícito para authenticated nas 3 RPCs Frente 3A

**Registrado em:** 07/05/2026 (sessão H3 — code review Sonnet, MIN-05)
**Origem:** `CREATE FUNCTION` faz GRANT para `PUBLIC` por padrão (inclui `anon` + `authenticated`).
M8 revoga de `anon`. Mas se um hardening futuro rodar `REVOKE ALL ON FUNCTION ... FROM PUBLIC`,
as 3 RPCs quebrariam silenciosamente para `authenticated`.

**Ação necessária:**
```sql
GRANT EXECUTE ON FUNCTION public.get_church_onboarding_state(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_church_cadastro_cristalino(uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_church_onboarding_pastoral(uuid, jsonb) TO authenticated;
```

**Risco:** Baixo (só quebra se houver hardening global de REVOKE, que não existe hoje).
**Bloqueia:** Nada. Adicionado como medida defensiva pré-hardening futuro.

**Critério de pronto:** GRANTs explícitos aplicados antes de qualquer migration de hardening global.

---

## OPS-DEBT-008 — `churches.uf` sem CHECK de formato

**Registrado em:** 07/05/2026 (sessão H3 — code review Sonnet, MIN-02)
**Origem:** Coluna `uf` aceita qualquer texto. `OPS-DEBT-005` documenta que a solução definitiva
inclui `CHECK (uf ~ '^[A-Z]{2}$')`, mas não tem prazo definido.

**Risco:** Frontend pode enviar `'São Paulo'` ou `'sp'` e passar sem erro.
**Bloqueia:** Frente 3B (frontend do wizard) deve tratar essa validação no formulário.
Antes do CHECK no banco, o frontend é a única barreira.

**Critério de pronto:** `ALTER TABLE churches ADD CONSTRAINT chk_uf_format CHECK (uf ~ '^[A-Z]{2}$')`
aplicado junto com backfill completo de `uf` (pré-requisito de OPS-DEBT-005).

---

## OPS-DEBT-009 — Smoke test Frente 3A com waitForTimeout hardcoded

**Registrado em:** 07/05/2026 (sessão H3 — code review Sonnet, MIN-03)
**Origem:** `frente-3a-smoke.prod.spec.ts` usa `page.waitForTimeout(2_000)` e `waitForTimeout(1_500)`.
Em CI com network lenta ou cold-start no Vercel, pode ser flaky.

**Ação necessária:**
Substituir por `page.waitForLoadState('networkidle')` ou `page.waitForSelector('tbody tr')`.

**Risco:** Baixo (2s cobre a maioria dos casos). Flakiness apenas em CI muito lento.
**Critério de pronto:** Smoke test passa 10/10 no CI sem timeout flakiness.

---

## OPS-DEBT-012 — Login.tsx `if (loading) return null` — DOM vazio durante auth init

**Registrado em:** 07/05/2026 (Frente 3B — Cadastro Cristalino)
**Origem:** `Login.tsx` retorna `null` enquanto o `AuthProvider` inicializa (estado
`loading=true`). Isso causa:

1. **UX degrado:** Usuário vê tela em branco por 1-3s no carregamento inicial
2. **Test flakiness:** Playwright (e outros e2e) não encontra `input[type="email"]`
   durante o período de loading, causando timeout em ambientes frios

**Evidência encontrada:** Smoke tests Frente 3B falhavam na primeira tentativa com
`TimeoutError: waiting for locator('input[type="email"]')` — passavam no retry
porque o dev server já estava quente.

**Fix recomendado:**
```tsx
// Login.tsx — substituir:
if (loading) return null

// Por:
if (loading) return (
  <div className="flex items-center justify-center h-screen bg-[#f9eedc]">
    <div className="w-8 h-8 border-4 border-[#e13500] border-t-transparent rounded-full animate-spin" />
  </div>
)
```

**Impacto:** Baixo-médio. Afeta apenas primeira carga cold-start.
**Critério de pronto:** Login.tsx nunca retorna `null`. Loading state visual ativo.
Smoke tests passam 10/10 na primeira tentativa sem retry.

---

## OPS-DEBT-013 — Edge Function temporária `set-test-pastor-password` em produção

**Registrado em:** 07/05/2026 (Frente 3B — debugging auth GoTrue)
**Origem:** Durante criação do usuário `pastor-test-3b@ekthosai.net` via SQL direto,
o GoTrue rejeitava o login por campos `NULL` e `instance_id=NULL`. Uma Edge Function
temporária foi deployada (`set-test-pastor-password`) para chamar o Admin API
`PUT /auth/v1/admin/users/{id}` e setar a senha via GoTrue.

**Estado atual:** Função está ATIVA em produção. Hardcoda userId e password de teste.
**Risco:** Baixo (não expõe dados sensíveis — apenas um usuário de teste). Mas deve
ser removida para manter ambiente limpo.

**Fix:** Deletar a Edge Function `set-test-pastor-password` do projeto Supabase.
```bash
supabase functions delete set-test-pastor-password --project-ref mlqjywqnchilvgkbvicd
```

**Armadilha documentada:** Ao criar usuários diretamente em `auth.users` via SQL
(sem Admin API), os seguintes campos DEVEM estar corretos:
1. `instance_id = '00000000-0000-0000-0000-000000000000'` (não NULL)
2. `confirmation_token`, `recovery_token`, `email_change_token_new`, `email_change`
   e demais campos de token como `''` (empty string, NÃO NULL)
3. Senha NUNCA via SQL `crypt()` — sempre via Admin API `PUT /admin/users/{id}`
4. O método correto é `PUT` (não `PATCH`)

**Critério de pronto:** EF `set-test-pastor-password` deletada. Armadilha adicionada
ao CLAUDE.md como item #28.

---

---

## OPS-DEBT-014 — Audit silencioso em `admin-update-contractor` / `admin-update-pastoral-profile`

**Data:** 2026-05-07  
**Categoria:** Observabilidade  
**Trigger:** Pré-1ª igreja real  

**Contexto:** As EFs admin de escrita (Frente 3B) inserem em `admin_events` e logam
erro se falhar (`console.error`), mas retornam `success: true` ao frontend sem
sinalizar o problema. Um admin pode salvar dados sem registro de auditoria sem saber.

**Tarefa:**
- Incluir `audit_warning: true` no response JSON quando `admin_events` INSERT falhar
- Logar em canal de monitoramento (Sentry ou alert Supabase) para detecção imediata
- Frontend deve exibir aviso não-bloqueante ("Salvo, mas auditoria pendente") quando
  `audit_warning: true` estiver presente

**Critério de pronto:** Frontend trata `audit_warning`; alerta monitoramento configurado.

---

## OPS-DEBT-015 — Validação aritmética CPF/CNPJ (dígito verificador)

**Data:** 2026-05-07  
**Categoria:** Validação de dados  
**Trigger:** Pré-1ª igreja real (Decisão 110 cravou validação algorítmica no MVP)  

**Contexto:** Atualmente `admin-update-contractor` valida apenas comprimento
(11 dígitos CPF, 14 dígitos CNPJ) via regex `^\d{N}$`. Números inválidos mas com
comprimento correto passam sem erro.

**Tarefa:**
- Criar `web/src/utils/cpfCnpj.ts` com funções `isValidCPF(s)` e `isValidCNPJ(s)`
  usando cálculo de dígito verificador (mod 11)
- Aplicar tanto no Wizard (frontend, step ContratantePendente) quanto na EF
  `admin-update-contractor` (Deno side — inline sem lib externa)
- Exibir erro claro: "CPF inválido — verifique os dígitos"

**Critério de pronto:** CPF/CNPJ com comprimento correto mas dígito errado é rejeitado
tanto no frontend quanto na EF.

---

## OPS-DEBT-016 — Setar `is_test_account=true` no `pastor-test-3b`

**Data:** 2026-05-07  
**Categoria:** Rastreabilidade de test fixtures  
**Trigger:** Próxima rotação de credentials  

**Contexto:** Usuário `pastor-test-3b@ekthosai.net` foi criado na sessão Frente 3B
para E2E smoke tests mas não tem `is_test_account: true` no `raw_user_meta_data`.
Sem essa flag, o usuário de teste é indistinguível de um usuário real em queries
de produção e dashboards.

**Tarefa:**
```sql
UPDATE auth.users
SET raw_user_meta_data = jsonb_set(
  COALESCE(raw_user_meta_data, '{}'::jsonb),
  '{is_test_account}',
  'true'
)
WHERE email = 'pastor-test-3b@ekthosai.net';
```

**Critério de pronto:** `raw_user_meta_data->>'is_test_account' = 'true'` confirmado
via SELECT.

---

## TEST-DEBT-001 a TEST-DEBT-003

Conforme registrado no log de sessão 26/04/2026 — não duplicar aqui.
