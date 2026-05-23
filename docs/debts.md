# Débitos técnicos registrados

---

## CLUSTER E — Bugs remanescentes (RESOLVIDO 2026-05-22)

### #24 — usePlan.ts: always_paid sem cobertura em hasAgent

**Problema:** `hasAgent(slug)` retornava `false` para agentes com `pricing_tier === 'always_paid'` antes do plano terminar de carregar, porque eles não existem em `subscription_agents` (são sempre incluídos). Causava tela de "Acesso restrito" transitória.

**Fix:** Adicionada linha `if (agent?.pricing_tier === 'always_paid') return true` antes do fallback `activeAgentSlugs.includes(slug)`. Agentes `always_paid` são liberados para qualquer assinatura ativa sem depender de slot.

**Arquivo:** `web/src/hooks/usePlan.ts`

---

### #25 — ADDON_PRICES: 7 slugs descontinuados no mapa

**Problema:** `addon-request/index.ts` tinha `ADDON_PRICES` com slugs descontinuados: `agent-conteudo`, `agent-metricas`, `agent-whatsapp`, `agent-agenda`, `agent-voluntarios`, `agent-kids-pastoral`, `agent-kids-comunicacao`. Qualquer chamada com esses slugs criava `pending_addon` com preço fantasma.

**Fix:** Removidos os 7 slugs. Mapa agora contém apenas ativos: `agent-cadastro`, `agent-financeiro`, `agent-reengajamento`, `agent-acolhimento`, `agent-operacao`, `volunteer-pro`, `kids-pro`, `financeiro-pro`.

**Arquivo:** `supabase/functions/addon-request/index.ts`

---

### #26 — AgentDetail.tsx: modal fechava antes do toast aparecer

**Problema:** Click em "Confirmar" chamava `setConfirmOpen(false)` imediatamente antes de `handleAdicionar()` resolver. Usuário ficava sem feedback durante o loading.

**Fix:** Removido `setConfirmOpen(false)` do onClick. Modal agora fecha dentro de `handleAdicionar()` após receber o resultado — toast fica visível antes do fechamento.

**Arquivo:** `web/src/pages/agents/AgentDetail.tsx`

**OPS-DEBT:** Os outros 12+ modais do sistema têm o mesmo padrão (fecham sem toast). Registrado como débito UX separado — frente própria.

---

### #28 — church-invite-user: sobrescrita de app_metadata + 409 cross-church

**Problema (crítico multi-tenant):** `updateUserById` era chamado com `{ app_metadata: { church_id, role } }` sem GET prévio, sobrescrevendo campos existentes. Sem verificação de cross-church: um admin podia (sem querer) trocar o church_id de um usuário já vinculado a outra organização.

**Fix:**
1. **Pre-check 409:** Antes do invite, consulta GoTrue admin REST `?filter=<email>` para detectar email já vinculado a church diferente. Retorna 409 com mensagem clara sem tocar o usuário.
2. **Merge seguro:** Após invite, faz `getUserById` + spread do `app_metadata` existente antes de `updateUserById` — preserva `ekthos_roles`, `is_ekthos_admin` e qualquer campo futuro.

**Arquivo:** `supabase/functions/church-invite-user/index.ts`

**Campos preservados no merge:** `church_id`, `role`, `ekthos_roles`, `is_ekthos_admin` (e quaisquer outros campos futuros via spread).

---

### #32 — volunteer-pro preço divergente (FALSO POSITIVO)

CP1 confirmou: preço de `volunteer-pro` é R$289,90 (28990 cents) em todos os arquivos. Sem divergência real. Vendas já são consultivas (decisão Z1, 27/04/2026) — EF `addon-request` ainda aceita o slug para o fluxo consultivo manual da equipe Ekthos.

**OPS-DEBT (não-fix):** Revisar se módulos consultivos devem ou não ser aceitos via `addon-request` (risco baixo: requer auth + a ativação é manual). Registrado para frente de revisão de catálogo.

---

### OPS-DEBT: 12+ modais fecham sem toast de sucesso

`PersonModal`, `Celulas`, `Escalas`, `Financeiro`, `Gabinete`, `Ministerios`, `Volunteers`, `Leaders`, `CellReportForm`, `EventDetailModal`, `EventForm` e outros — todos chamam `onClose()` sem feedback visual de sucesso. UX silenciosa. Frente UX dedicada — não coberta neste PR.

---

### OPS-DEBT: #19 e #33 deferidos

Investigação CP1 confirmou que #19 e #33 não pertencem ao Cluster E remanescente. Deferidos para frente própria.

**Branch:** fix/cluster-e-remanescente-multitenant

---

## CLUSTER B — is_leader explícito + filtro PersonSelect (RESOLVIDO 2026-05-21)

### Feature — is_leader + onlyLeaders no PersonSelect

**Problema:** Campo de seleção de líder (célula #13, ministério #17) listava TODAS as pessoas, sem distinção de papel. Não havia como promover uma pessoa nova a líder (critério circular: "líder = quem já aparece como leader_id").

**Solução:** Marcação explícita via `people.is_leader boolean NOT NULL DEFAULT false`.

**Implementado:**
- `supabase/migrations/20260521000005_people_is_leader.sql` — ADD COLUMN is_leader + índice parcial `WHERE is_leader=true` + backfill idempotente (marca quem já é leader_id/co_leader_id em groups/ministries)
- `web/src/features/people/components/PersonModal.tsx` — checkbox "É líder?" na aba Eclesiástico → seção Serviço. Permite promover pessoa a líder antes de ela assumir qualquer função.
- `web/src/features/people/hooks/usePeople.ts` — `PersonFields.is_leader?: boolean`
- `web/src/components/ui/PersonSelect.tsx` — prop `onlyLeaders?: boolean`: filtra `.eq('is_leader', true)`; backward-compat (fetch por ID se value atual não é líder — form nunca quebra); estado vazio orientativo: "Nenhum líder cadastrado. Marque uma pessoa como líder no cadastro dela para aparecer aqui." (não lista todos)
- `web/src/pages/Celulas.tsx` — #13 GroupModal líder: `onlyLeaders={true}`
- `web/src/pages/Ministerios.tsx` — #17 MinistryModal líder: `onlyLeaders={true}`
- `web/src/lib/database.types.ts` — regenerado (is_leader em Row/Insert/Update)

**Backfill empírico:** church 5156cc30 → 1 líder marcado (Vanessa Baltazar Abrantes). 3 igrejas reais com 0 líderes em groups → 0 marcados (correto).

**Campos não filtrados (conforme spec):** #14 Celulas membro, #10 Voluntários — onlyLeaders ausente/false.

**Branch:** fix/cluster-b-is-leader-filter

---

## CLUSTER B — RESOLVIDO 2026-05-21 (hotfix 2026-05-21)

### Bugs #6, #10, #13, #14, #17 — Seletor de Pessoa (PersonSelect)

**Hotfix pós-merge:** PersonSelect não listava pessoas — 3 bugs no componente:
(1) guard `query.length < 2` fechava dropdown antes de qualquer resultado;
(2) sem `onFocus` handler — clicar no input não disparava busca;
(3) `showDropdown` exigia `inputText.length >= 2` — dropdown nunca abria ao focar.
Fix: `search()` sem guard + query vazia retorna 8 pessoas + `onFocus` dispara busca imediata.
Branch: `fix/cluster-b-personselect-hotfix`

**Raiz:** Toda tela que precisava selecionar uma pessoa usava input de UUID bruto ou padrão ad-hoc. Solução: componente `PersonSelect` reusável + unificação de `ministries.leader_id → people.id` (eliminando indireção via tabela `leaders`).

**Implementado:**
- `web/src/components/ui/PersonSelect.tsx` — autocomplete reusável (Input + dropdown, debounce 600ms, RLS-safe)
- `supabase/migrations/20260521000004_unify_ministries_leader_to_people.sql` — DROP FK leaders, ADD FK people (ON DELETE SET NULL). Todos leader_id eram NULL → zero migração de dados.
- `web/src/features/ministerios/hooks/useMinisterios.ts` — select encadeado `leaders:leader_id(...)` → `people:leader_id(...)`, mutations sem INSERT em `leaders`
- `web/src/pages/people/Leaders.tsx` — remove lookup intermediário via tabela `leaders` (ministries.leader_id já é people.id direto)
- `web/src/pages/Ministerios.tsx` — `ministry.leaders?.people?.name` → `ministry.people?.name` + PersonSelect no modal
- `web/src/lib/types/joins.ts` — `MinistryWithLeader.leaders: { people: ... }` → `MinistryWithLeader.people: Pick<Person,...>`
- `web/src/pages/Celulas.tsx` — #14: membro por PersonSelect; #13: campo Líder no GroupModal via PersonSelect
- `web/src/pages/Voluntarios.tsx` — #10: PersonSelect em AddVolunteerModal (substituiu input UUID)

**Backward-compat:** Grupo Mulheres (Vanessa, leader_id=242d07b5) preservado. Tânia Maria (volunteer) preservada. co_leader_id não tocado.

**Branch:** fix/cluster-b-person-select-unificado

---

### OPS-DEBT-052 — Tabela `leaders` órfã pós-unificação (não-bloqueante)

**Data:** 2026-05-21  
**Severidade:** BAIXA — não-bloqueante  
**Contexto:** A tabela `leaders` foi mantida (não dropada) mas está vazia e sua única FK de produção (`ministries.leader_id`) agora aponta para `people`. As tabelas `cells` e `cell_reports` ainda têm FK para `leaders` (definidas na migration original), mas podem estar sem uso real em produção.

**Ação futura:** Verificar uso real de `cells.leader_id` e `cell_reports.leader_id`. Se zero uso, DROP TABLE leaders (após remover FKs órfãs). Alternativa: migrar essas 2 FKs para `people` também (coerência total). Janela sugerida: próximo sprint de limpeza de schema.

---

## ✅ CLUSTER A — Pipeline / Discipulado / visitor-capture (RESOLVIDO 2026-05-21)

**Branch:** `fix/cluster-a-pipeline-discipulado-visitor-capture`

### Bug #1 / #12 — Pipeline board vazio (is_entry_point=false)
**Causa:** 2 igrejas (Minha Fé `5156cc30` + Meu Avivamento `89c7d9de`) tinham
`is_entry_point=false` em todas as etapas. `capture_visitor_to_pipeline` retornava
NULL silenciosamente → `person_pipeline` vazia → Pipeline board zerado.
**Fix:** Migration `20260521000001` — A1 corrige as 2 igrejas; A2 preventiva global.
Migration `20260521000002` — backfill `person_pipeline` para 4 pessoas de Vanessa.

### Bug #2 — visitor-capture descarta `name` em pessoa existente
**Causa:** Bloco UPDATE (pessoa existente por phone) não incluía `name` nos updates.
**Fix:** `supabase/functions/visitor-capture/index.ts` — D1: `if (name) updates.name = name`.

### Bug #3 — CORS bloqueia preview deployments Vercel
**Causa:** `ALLOWED_ORIGINS.includes(origin)` era lista exata — URLs preview
(`ekthos-platform-abc123.vercel.app`) eram rejeitadas silenciosamente.
**Fix:** visitor-capture E1: `ALLOWED_ORIGIN_PREVIEW_RE` regex.

### Bug #11 — Consolidação vazia (filtro só por conversion_date)
**Causa:** `Consolidation.tsx` filtrava apenas por `conversion_date` — visitantes
QR Code (sem `conversion_date`) nunca apareciam.
**Fix:** C2 — query usa `.or(conversion_date, first_visit_date, created_at)`.

### Bug #29 — "Erro ao aplicar template" no DiscipleshipSettings
**Causa:** RPC `apply_discipleship_template` fazia INSERT em `pipeline_stages` sem
incluir `slug` (NOT NULL, sem DEFAULT) → violação de constraint.
**Fix:** Migration `20260521000003` — RPC patcheada com geração de slug via regexp
+ `ON CONFLICT (church_id, slug) DO UPDATE`.

---

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

## ✅ BUG #18 — Conversas "permission denied for table users" (RESOLVIDO 2026-05-22)

**Branch:** `fix/conversas-permission-denied`

**Root cause:** 4 RLS policies usavam `SELECT FROM auth.users WHERE id = auth.uid()` diretamente (SECURITY INVOKER). O role `authenticated` não tem permissão de SELECT em `auth.users`. A tela de Conversas faz JOIN com `church_whatsapp_channels` — ao avaliar todas as policies PERMISSIVE dessa tabela (incluindo `ekthos_admin_full_access`), o Postgres executava o subquery e lançava "permission denied for table users".

**Tabelas corrigidas:**
- `church_whatsapp_channels.ekthos_admin_full_access` → `is_ekthos_admin() = true`
- `church_channels.ekthos_admin_full_access` → `is_ekthos_admin() = true`
- `agent_prompt_templates.admin_ekthos_full_access_templates` → `is_ekthos_admin() = true`
- `pending_addons.church_members_read_own` → `auth_church_id()`
- `pending_addons.church_members_insert_own` → `auth_church_id() + auth.uid()`

**Fix adicional — conversation-handoff EF:**
`conversation_ownership_log` CHECK aceitava `('system','human_staff','agent')` mas a EF gravava `actor_type='human'` → violação de CHECK em produção. Corrigido para `'human_staff'` nessa tabela. (`conversation_events` mantém `'human'` que é válido no seu próprio CHECK.)

**Migration:** `supabase/migrations/20260522000001_fix_rls_policies_auth_users_subquery.sql`

---

## OPS-DEBT — `agents` vs `agents_catalog` nos logs

**Registrado em:** 2026-05-22 (diagnóstico #18 — SB9)
**Categoria:** Tech debt / naming consistency

**Contexto:** Nos logs do Supabase aparece erro `relation "agents" does not exist`. O catálogo de agentes está na tabela `agents_catalog` (confirmado). Algum código (provavelmente uma migration, EF ou query de diagnóstico) ainda referencia `agents` sem o sufixo `_catalog`.

**Ação necessária:**
1. Grep completo por `.from('agents')` / `FROM agents` no codebase
2. Identificar origem do erro nos logs (get_logs da EF que gera o erro)
3. Corrigir para `agents_catalog`

**Risco:** Baixo (query falha silenciosamente nos logs, não bloqueia feature). Médio se for uma EF de billing ou admissão.
**Critério de pronto:** Zero ocorrências de `relation "agents" does not exist` nos logs.

---

## TEST-DEBT-001 a TEST-DEBT-003

Conforme registrado no log de sessão 26/04/2026 — não duplicar aqui.

---

## OPS-DEBT-024 — Canal real de alerta para audit failures

**Registrado em:** 08/05/2026 (sessão H4 — Frente 4A)
**Categoria:** Observabilidade / SRE
**Trigger:** Pré-1ª igreja real

**Contexto:** `record_audit_event()` tem `EXCEPTION WHEN OTHERS` que engole falhas silenciosamente.
EFs logam `console.error` mas não há canal de alerta (Sentry / Slack / e-mail) configurado.
Uma falha de auditoria em operação administrativa sensível pode passar despercebida por dias.

**Tarefa:**
- Integrar Sentry (ou equivalente) nas Edge Functions admin críticas
- Configurar alerta Supabase para `console.error` com pattern `audit failed`
- Alternativa leve: webhook Slack via `N8N_AUDIT_ALERT_URL` chamado quando `auditErr` ocorre

**Estimativa:** ~3h
**Critério de pronto:** Falha de audit gera alerta em canal monitorado em <5 min.

---

## OPS-DEBT-025 — Remover `is_ekthos_admin: boolean` legado

**Registrado em:** 08/05/2026 (sessão H4 — Frente 4A)
**Categoria:** Tech debt / schema cleanup
**Trigger:** Pós-Frente 4B (gestão de roles via UI)

**Contexto:** `app_metadata.is_ekthos_admin = true` é o flag legado de admin.
Frente 4A introduziu `app_metadata.ekthos_roles: string[]` como sistema cumulativo.
As 22+ EFs admin ainda fazem dupla verificação (`is_ekthos_admin === true`).
Após Frente 4B ter UI de gestão de roles, o flag legado pode ser removido.

**Tarefa:**
1. Migrar todas as EFs para verificar apenas `ekthos_roles.includes('admin')`
2. Remover `is_ekthos_admin` do `app_metadata` dos usuários existentes
3. Remover função SQL `is_ekthos_admin()` (se existir como RLS helper)
4. Atualizar `admin-set-ekthos-roles` para não setar mais o flag legado

**Estimativa:** ~4h (depende de quantas EFs precisam de ajuste)
**Bloqueia:** Frente 4B deve estar completa antes
**Critério de pronto:** Zero referências a `is_ekthos_admin` no codebase. Todas as EFs usam `ekthos_roles`.

---

## OPS-DEBT-026 — Cron para fechar `impersonate_sessions` zumbis

**Registrado em:** 08/05/2026 (sessão H4 — Frente 4A)
**Categoria:** Integridade de dados / segurança
**Trigger:** Pré-1ª impersonação em produção real

**Contexto:** Se um admin fechar o browser sem clicar em "Sair da impersonação",
a sessão em `impersonate_sessions` fica com `ended_at = NULL` indefinidamente.
`last_action_at` pode ser usado para detectar sessões inativas >4h.

**Tarefa:**
```sql
-- pg_cron a cada hora:
SELECT cron.schedule(
  'close-zombie-impersonate-sessions',
  '0 * * * *',
  $$
  UPDATE public.impersonate_sessions
  SET ended_at = now(), ended_reason = 'auto_timeout'
  WHERE ended_at IS NULL
    AND last_action_at < now() - INTERVAL '4 hours';
  $$
);
```

**Estimativa:** ~1h
**Critério de pronto:** Cron ativo. Sessões sem atividade >4h têm `ended_at` preenchido automaticamente.

---

## OPS-DEBT-027 — Auditar EF `stripe-bootstrap` (one-shot legado)

**Registrado em:** 08/05/2026 (sessão H4 — Frente 4A)
**Categoria:** Tech debt / segurança
**Trigger:** Baixa prioridade — pós-F9 Stripe live

**Contexto:** `stripe-bootstrap` é uma EF one-shot criada para configuração inicial
do Stripe (products, prices). Ainda está ativa em produção. Não tem `record_audit_event`.
Se chamada acidentalmente pode criar duplicatas no Stripe.

**Tarefa:**
1. Auditar se a EF ainda é necessária (provavelmente não pós-bootstrap)
2. Se não: tombstonar (retornar 404) ou deletar
3. Se ainda necessária: adicionar guard `if (bootstrapAlreadyDone) return 409`
   verificando existência de prices no banco

**Estimativa:** ~1h
**Critério de pronto:** EF deletada ou protegida contra execução acidental.

---

## OPS-DEBT-028 — Rate-limiting de audit em READs sensíveis

**Registrado em:** 08/05/2026 (sessão H4 — Frente 4A)
**Categoria:** Segurança / performance
**Trigger:** Pré-escala (>10 admins ativos)

**Contexto:** EFs como `admin-churches-list`, `admin-cockpit-metrics` e `admin-events-list`
não têm rate-limiting. Um admin malicioso (ou bug em loop) pode fazer centenas de
chamadas por minuto, aumentando custo de Edge Function e expondo dados em bulk.

**Tarefa:**
- Implementar rate-limit por `adminUser.id` usando Supabase KV ou Redis (Upstash)
- Limiar sugerido: 60 req/min por admin para EFs de leitura bulk
- Retornar `429 Too Many Requests` com `Retry-After` header quando exceder

**Estimativa:** ~4h (depende da solução de KV escolhida)
**Critério de pronto:** Admin não consegue fazer >60 req/min nas EFs bulk. 429 retornado corretamente.

---

## OPS-DEBT-029 — `jsonError` duplicado em 4 Edge Functions

**Registrado em:** 08/05/2026 (sessão H4 — Frente 4A)
**Categoria:** Tech debt / DRY
**Trigger:** Manutenção futura

**Contexto:** Durante Frente 4A, helper `jsonError()` foi planejado como shared module
(`supabase/functions/_shared/errors.ts`). O deploy via Supabase MCP não suporta
imports relativos entre funções — cada EF é deployada como bundle isolado.
A função foi inlinada em 4 EFs como workaround.

**EFs afetadas:** `admin-start-impersonation`, `admin-end-impersonation`,
`admin-set-ekthos-roles`, `admin-events-list`

**Tarefa:**
- Investigar deploy via Supabase CLI com `--no-verify-jwt` e bundler step
- Alternativa: `supabase functions deploy` com `import_map.json` apontando para `_shared/`
- Se viável: extrair helpers comuns (`jsonError`, `getAdmin`, `CORS`) para `_shared/`
  e atualizar as 4 EFs

**Estimativa:** ~2h
**Critério de pronto:** `_shared/` funciona em deploy. Zero duplicação de helpers entre EFs.

---

## OPS-DEBT-030 — Schema mismatch em affiliate Edge Functions

**Registrado em:** 08/05/2026 (sessão H4 — Frente 4A — validação empírica G3)
**Categoria:** Bug / schema mismatch
**Trigger:** Pré-ativação do programa de afiliados

**Contexto:** Detectado durante validação empírica G3 (Frente 4A). As EFs de afiliados
fazem referência a colunas que não existem na tabela `affiliate_payment_batches`:

**EF `affiliate-commissions-export-csv`:**
- Seleciona coluna `amount_cents` — coluna real é `commission_amount_cents`
- Insere `row_count` e `created_by` em `affiliate_payment_batches` — colunas inexistentes

**EF `affiliate-commissions-mark-paid`:**
- Atualiza coluna `comprovante_url` — não existe na tabela `affiliate_payment_batches`
- Retorna 500 em qualquer chamada que tente marcar lote como pago

**Tarefa:**
1. Verificar schema atual de `affiliate_payment_batches` via `list_tables`
2. Decidir: adicionar colunas faltantes via migration OU corrigir as EFs
3. Opção A (recomendada): migration adicionando `row_count int`, `created_by uuid`,
   `comprovante_url text` e renomeando (ou adicionando alias) `commission_amount_cents`
4. Opção B: corrigir as EFs para usar os nomes de coluna existentes
5. Adicionar smoke test cobrindo `affiliate-commissions-mark-paid`

**Estimativa:** ~1h
**Critério de pronto:** `affiliate-commissions-mark-paid` retorna 200. `export-csv` gera CSV sem erro.

---

## ✅ CLUSTER FRONTEND — #4 + #5 (RESOLVIDO 2026-05-22)

**Branch:** `fix/cluster-frontend-modal-perfil`

### Bug #4 — PersonModal reseta campos ao trocar de aba

**Causa:** `useEffect` em `PersonModal.tsx` tinha dep `[person, open]`. O objeto `person`
vinha de `people.find(...)` inline no JSX — novo reference a cada render → efeito
disparava espuriamente → `setForm(personToForm(person))` e `setActiveTab('pessoal')`
apagavam o que o usuário estava preenchendo.

**Fix:** `web/src/features/people/components/PersonModal.tsx` linha 142:
```tsx
// ANTES:
}, [person, open])
// DEPOIS:
}, [person?.id, open])
```
`person?.id` é primitivo (`string | undefined`) — referência estável.

---

### Bug #5 — Crash "Maximum update depth exceeded" ao abrir perfil

**Causa raiz 1 (ErrorBoundary):** `PanelErrorBoundary.componentDidCatch` chamava
`this.setState({ hasError: false })` dentro do próprio handler de erro. Isso criava
loop infinito: erro → setState → re-render → erro → setState…

**Causa raiz 2 (tags null):** `person.tags.slice(0, 3)` em `People.tsx` lançava
`TypeError: Cannot read properties of null` quando `people.tags = null` no DB.
O crash caía no ErrorBoundary, amplificando o loop.

**Fixes:**
1. `web/src/pages/People.tsx` — `componentDidCatch`:
```tsx
// ANTES:
componentDidCatch() { this.setState({ hasError: false }) }
// DEPOIS:
componentDidCatch(error: Error) { console.error('[PanelErrorBoundary]', error) }
```
2. `web/src/pages/People.tsx` — tags guard:
```tsx
// ANTES:
{person.tags.slice(0, 3).map(...)}
{person.tags.length > 3 && ...}
// DEPOIS:
{(person.tags ?? []).slice(0, 3).map(...)}
{(person.tags ?? []).length > 3 && ...}
```

---

### OPS-DEBT — `people.tags` sem `DEFAULT '{}'` no schema

**Registrado em:** 2026-05-22 (fix/cluster-frontend-modal-perfil)
**Categoria:** Schema / integridade de dados
**Trigger:** Guard frontend aplicado; schema ainda sem default explícito.

**Contexto:** `people.tags` é `text[]`. Em produção todos os 25 registros têm
`tags = '{}'` (array vazio) — nenhum null atual. Porém a coluna provavelmente
não tem `DEFAULT '{}'` explícito no schema. Outras telas que leem `tags` diretamente
(sem o guard `?? []`) têm risco latente se uma person for inserida sem `tags`.

**Ação necessária:**
```sql
ALTER TABLE people ALTER COLUMN tags SET DEFAULT '{}';
UPDATE people SET tags = '{}' WHERE tags IS NULL;
```

**Impacto imediato:** Nenhum (zero nulls hoje). **Risco latente:** Médio (inserts
sem `tags` explícito em EFs futuras podem gerar nulls que crasham telas sem guard).

**Critério de pronto:** `DEFAULT '{}'` confirmado em `\d people`. Zero nulls garantidos
pelo schema, não só pelo guard frontend.

---

## OPS-DEBT-045 — stripe-webhook retornando HTTP 400 em produção

**Registrado em:** 20/05/2026 (sessão fix/agentes-config-real-inbox-operacional)
**Origem:** Logs de produção mostram 3 ocorrências nas últimas 24h de `stripe-webhook`
respondendo HTTP 400.

**Sintoma observado:**
- Edge Function `stripe-webhook` (v13) retorna 400 em ~3 chamadas/dia
- Não bloqueia o fluxo principal (Stripe retenta automaticamente)
- Causa raiz ainda não investigada (pode ser payload malformado, assinatura
  inválida de evento desconhecido, ou webhook de conta test vs live misturado)

**Impacto potencial:** Baixo no curto prazo (Stripe retenta). Médio prazo se
frequência aumentar: risco de eventos perdidos (pagamentos, cancelamentos,
upgrades) não processados.

**Investigação necessária:**
1. Ler logs detalhados de stripe-webhook nas 3 ocorrências via `get_logs`
2. Identificar qual tipo de evento Stripe está causando o 400
3. Verificar se é `webhook_secret` inválido, evento desconhecido ou parsing error
4. Corrigir o handler ou adicionar guard `if (!event) return 200` para eventos não tratados

**Resolução planejada:** Próxima sessão de manutenção (não bloqueia nenhuma frente ativa).

---

## ✅ CLUSTER D — #21 + #22 — Labels de navegação nos prompts (RESOLVIDO 2026-05-22)

**Branch:** `fix/cluster-d-prompts-navegacao`

**Root cause:** Os prompts hardcoded de `agent-suporte` e `agent-onboarding` usavam nomes técnicos/antigos dos módulos do CRM em vez dos labels reais da sidebar (definidos em `navigation.ts`).

**Correções aplicadas (11 substituições de texto):**

`agent-suporte/index.ts` (3 fixes):
- Linha 74: `**Dashboard**` → `**Painel**`
- Linha 76: `**Pipeline**` → `**Discipulado**`
- Linha 82: `**Agenda**` → `**Calendário**`

`agent-onboarding/index.ts` (8 fixes):
- Linha 64 (admin): `Dashboard:` → `Painel:`
- Linha 65 (admin): `Pipeline:` → `Discipulado:`
- Linha 72 (pastor): `Dashboard:` → `Painel:`
- Linha 73 (pastor): `Pipeline:` → `Discipulado:`
- Linha 83 (lider): `Pipeline:` → `Discipulado:`
- Linha 84 (lider): `Agenda:` → `Calendário:`
- Linha 102 (supervisor): `Pipeline:` → `Discipulado:`
- Linha 103 (supervisor): `Dashboard:` → `Painel:`

**Preservado:** "Gabinete" correto em ambos os agentes. Modelos Haiku inalterados.
**Deploy:** agent-suporte v24 ACTIVE · agent-onboarding v25 ACTIVE

---

## OPS-DEBT — agent-reengajamento: modelo no catálogo vs runtime

**Registrado em:** 2026-05-22 (Cluster D — validação cruzada SA-9)
**Categoria:** Consistência de catálogo

**Contexto:** `agents_catalog.model = 'sonnet'` para `agent-reengajamento`, mas a Edge
Function executa `claude-haiku-4-5-20251001`. O campo do catálogo é informativo/UI —
não afeta runtime.

**Decisão pendente:**
(a) Se reengajamento for pastoral/premium → mudar EF para Sonnet
(b) Se triagem/lembrete → atualizar catálogo para 'haiku'

**Fix quando decidido:**
```sql
UPDATE agents_catalog SET model = 'haiku' WHERE slug = 'agent-reengajamento';
```
ou redeploy da EF com `MODEL = 'claude-sonnet-4-6'`.

**Critério de pronto:** `agents_catalog.model` e `MODEL` na EF apontam para o mesmo modelo.

---

## ✅ CLUSTER F — Bug #27 Histórico de Faturas Vazio (Fix C1 RESOLVIDO 2026-05-22)

**Sintoma:** Tela `/settings/billing` mostrava "Nenhuma fatura ainda." para todas as igrejas — incluindo igrejas com assinatura paga ativa.

**Root cause:** `handleInvoicePaid` em `stripe-webhook/index.ts` (v12) tinha INSERT com 7 colunas erradas:
- Colunas inexistentes inseridas: `stripe_subscription_id`, `stripe_customer_id`, `currency`, `period_start`, `period_end`
- Mapeamentos errados: `amount_paid` (campo Stripe) → deveria ser `amount_cents` (coluna DB); `invoice_pdf` → deveria ser `pdf_url`
- Campo `paid_at` ausente; campo `description` ausente
- Erro silenciado com `.then(({ error }) => console.error(...))` → INSERT falhava silenciosamente, Stripe recebia HTTP 200, nunca retentava → tabela `invoices` vazia globalmente desde o início

**Fix C1 aplicado (stripe-webhook v13, deployed v37 ACTIVE):**
- INSERT reescrito com apenas colunas reais: `church_id`, `stripe_invoice_id`, `amount_cents`, `status`, `paid_at`, `hosted_invoice_url`, `pdf_url`, `description`
- Error handling: `throw` em erro genuíno (Stripe recebe 500 e retenta), log neutro em `23505` (UNIQUE = idempotente)
- Todos os outros handlers inalterados

**Branch/PR:** `fix/cluster-f-invoices` → https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...fix/cluster-f-invoices?expand=1

---

## ✅ CLUSTER F — Bug #27 TOTALMENTE RESOLVIDO (Fix C1 + Fix B + backfill — 2026-05-22)

**Diagnóstico raiz final (dupla causa):**

- **C2 (raiz primária):** Webhook endpoint `we_1TYqnNHfvCy1ruENSmWRo9Q9` assinava apenas `checkout.session.completed`. `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated/deleted` não estavam em `enabled_events` → Stripe nunca despachava esses eventos ao endpoint. Mesmo com C1 corrigido, faturas continuariam não chegando.
- **C1 (raiz secundária, corrigida primeiro em v37):** `handleInvoicePaid` INSERT com colunas erradas + erro silenciado. Corrigido na sessão anterior.

**Fix B aplicado (Stripe LIVE):**
- `PATCH /v1/webhook_endpoints/we_1TYqnNHfvCy1ruENSmWRo9Q9`
- `enabled_events` agora contém: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`
- Verificado via GET pós-PATCH: todos os 5 eventos confirmados ✅
- `invoice.created`, `invoice.finalized`, `invoice.payment_succeeded`: sem handler implementado → NÃO assinados (regra: zero entregas órfãs)

**Backfill Vanessa (Minha Fé — 5156cc30):**
- `in_1TYtMLHfvCy1ruENLXGmFgqq` inserida: `amount_cents=200`, `status=paid`, `paid_at=2026-05-19`, URLs presentes
- `current_period_start=2026-05-19`, `current_period_end=2026-06-19` (dado real Stripe)
- Idempotente: ON CONFLICT stripe_invoice_id DO NOTHING + teste replay confirmou 0 duplicatas

**Nossa Igreja (6743b72b) + Meu Avivamento (89c7d9de):**
- `stripe_customer_id`/`stripe_subscription_id` no banco não existem na conta Stripe atual (`acct_1TMgvuHfvCy1ruEN`) — IDs com padrão `QeRcEiX9L9` vs `HfvCy1ruEN` da conta ativa → foram criadas em outra conta Stripe
- NÃO tocadas (backfill impossível via API atual)
- Registrado como OPS-DEBT abaixo

**Estado final (R1–R18 todos verdes):**
- Stripe endpoint: 5 eventos, enabled, LIVE ✅
- Vanessa: 1 invoice no banco + period_end preenchido ✅
- Nossa Igreja / Meu Avivamento: 0 invoices (correto, sem inventar dados) ✅
- Zero cobrança criada, zero invoice nova no Stripe ✅
- Backfill idempotente ✅

---

## OPS-DEBT — igrejas de outra conta Stripe (Nossa Igreja + Meu Avivamento)

**Registrado em:** 2026-05-22 (Cluster F diagnóstico)
**Categoria:** Integridade de dados / migração Stripe
**Urgência:** Baixa (igrejas são teste interno, sem cliente real)

**Contexto:** `subscriptions.stripe_customer_id` e `stripe_subscription_id` das igrejas `6743b72b` (Nossa Igreja, `cus_UPlA4DoDtlPsY5`, `sub_1TQve1QeRcEiX9L9qmT3hzAe`) e `89c7d9de` (Meu Avivamento, `cus_USjZhfe4rAhKz4`, `sub_1TTo5xQeRcEiX9L99MgmHRcA`) retornam `resource_missing` na conta Stripe LIVE atual (`acct_1TMgvuHfvCy1ruEN`). Os IDs têm segmento `QeRcEiX9L9` que não pertence a esta conta.

**Hipótese:** Criadas manualmente em conta Stripe diferente (teste anterior, conta pessoal, ou conta antiga antes da migração para `acct_1TMgvuHfvCy1ruEN`).

**Impacto atual:** `current_period_end = NULL`, sem invoices no banco. Como são igrejas de teste, sem impacto em cliente real.

**Fix quando relevante:**
1. Identificar a conta Stripe original onde esses IDs existem
2. Ou limpar subscriptions do banco e recriar via Caminho A na conta correta
3. Ou marcar como `status = 'canceled'` se obsoletas

**Critério de pronto:** `stripe_customer_id` e `stripe_subscription_id` existem na conta Stripe ativa, ou subscriptions marcadas como obsoletas.
