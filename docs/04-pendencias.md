# OPS-DEBT — Pendências técnicas e débitos operacionais

> Registro de causas-raiz identificadas durante sprints de bug fix.
> Cada item é uma automação/prevenção para evitar que o mesmo bug
> afete igrejas futuras.

---

## OPS-DEBT-039 — admin-church-create: pastor_name como parâmetro explícito

**Identificada em:** Sprint Vanessa Onda 1 — Bug 1 (nome "Felipe" na sidebar)  
**Status:** ABERTA  
**Prioridade:** Alta — afeta toda nova igreja criada via cockpit

**Causa-raiz:** A Edge Function `admin-church-create` não recebe `pastor_name`
como parâmetro explícito. O nome do pastor na sidebar é lido de
`auth.users.raw_user_meta_data.full_name`, que foi populado com o nome do
admin Ekthos ("Felipe") em vez do nome da pastora (Vanessa Abrantes).

**Impacto:** Toda nova igreja onboardada via cockpit exibirá "Felipe" no lugar
do nome real do pastor na sidebar do CRM.

**Fix necessário:**
1. `admin-church-create` deve receber `{ pastor_name, pastor_email, ... }`
2. Ao criar o usuário pastor via Admin API, setar `raw_user_meta_data.full_name = pastor_name`
3. INSERT em `profiles` com `name = pastor_name`, `display_name = first_name`
4. Validação: após criação, SELECT `raw_user_meta_data->>'full_name'` e confirmar

**Workaround atual:** UPDATE manual em `auth.users` e `profiles` via SQL.

---

## OPS-DEBT-040 — Auto-seed de qr_codes ao criar church

**Identificada em:** Sprint Vanessa Onda 1 — Bugs 3+4 (QR Code + Configurações Avançadas com erro)  
**Status:** ABERTA  
**Prioridade:** Alta — afeta toda nova igreja; QrCodeModal e link de config quebram

**Causa-raiz:** `QrCodeModal.tsx` usa `.single()` na tabela `qr_codes` e lança
`PGRST116` quando não existe nenhuma row para a `church_id`. A tabela `qr_codes`
não é populada automaticamente no fluxo de criação de igreja.

**Impacto:** Toda nova igreja que clicar no botão "QR de Entrada" ou no link
"Configurações avançadas" do modal verá um erro em vez do QR Code.

**Fix necessário (escolher um):**
- **Opção A (preferida):** `admin-church-create` faz INSERT em `qr_codes` com slug
  gerado automaticamente: `{church-slug}-visitantes`
- **Opção B:** Migration que substitui `.single()` por `.maybeSingle()` no
  `QrCodeModal.tsx` e exibe um estado de "Nenhum QR configurado ainda" com botão
  para gerar via `configuracoes/qr-visitante`

**Workaround atual:** INSERT manual em `qr_codes` via SQL após criação da igreja.

---

## OPS-DEBT-041 — Gaps silenciosos em CASEs de get_agent_prompt_resolved + aliases curtos de modelo

**Identificada em:** PR-D (fix formality caloroso) — 2026-05-21  
**Status:** ABERTA  
**Prioridade:** Média — personalização das igrejas degradada silenciosamente, sem erro visível

**Causa-raiz:** Três valores salvos em `church_agent_config` não têm branch `WHEN` explícita
na RPC `get_agent_prompt_resolved`, fazendo-os cair silenciosamente no `ELSE` com
comportamento de enum diferente do configurado. Adicionalmente, duas EFs usam alias
curto de modelo Anthropic em vez do model ID canônico.

**Gaps de CASE identificados em produção:**

1. `formality = 'caloroso'` — **parcialmente resolvido pela migration 20260521000001** (este PR)
2. `emoji_usage = 'discrete'` (inglês) — não tem branch; cai no ELSE `moderate` (2-3 emojis).
   Igreja tem `discrete` salvo mas recebe instrução de moderação genérica.
3. `pastoral_depth = 'pastoral'` — não tem branch; cai no ELSE `moderate`.
   Igreja provavelmente quer `deep` mas recebe profundidade moderada.

**Gaps de alias de modelo:**
- `demand-router/index.ts` linha 245: usa `claude-haiku-3-5` (alias curto não canônico)
- `whatsapp-attendant/index.ts` linha 94: usa `claude-haiku-3-5` (idem)
- Correto: `claude-haiku-4-5-20251001` via `MODELS.haiku` do `_shared/anthropic-client.ts`

**Impacto:** 1 church em produção (Igreja Mock) recebe prompt com emoji e profundidade
incorretos. demand-router e whatsapp-attendant podem ter comportamento inesperado se
o alias `haiku-3-5` for resolvido de forma diferente pela API Anthropic.

**Fix necessário:**
- Opção A: adicionar `WHEN 'discrete'`, `WHEN 'pastoral'` na RPC com texto adequado
- Opção B: normalizar os valores em `church_agent_config` + adicionar CHECK constraint
- Para aliases: substituir `'claude-haiku-3-5'` por `MODELS.haiku` do shared client

**Workaround atual:** nenhum — igrejas recebem configuração silenciosamente degradada.

---

## OPS-DEBT-042 — Documentar exceção pastoral premium em CLAUDE.md do repo

**Identificada em:** PR-D (fix formality caloroso) — 2026-05-21  
**Status:** ABERTA  
**Prioridade:** Baixa — documentação; não bloqueia operação

**Causa-raiz:** O `CLAUDE.md` do repositório não documenta a distinção entre modelos
Anthropic para diferentes categorias de agentes. O `_shared/anthropic-client.ts` tem
a decisão técnica do Sprint 2 (01/05/2026), mas CLAUDE.md não reflete isso.

**O que falta documentar:**
- Agentes operacionais/internos: `claude-haiku-4-5-20251001`
- Agentes pastorais premium (ex: `agent-acolhimento`): `claude-sonnet-4-6` — decisão
  intencional do Sprint 2 por exigirem qualidade pastoral superior em conversas sensíveis
- Critério de classificação: agente é "pastoral premium" se resposta é direta ao membro,
  tem valência espiritual/emocional alta, e erro de geração tem impacto pastoral real
- Nunca usar: `claude-3-5-haiku-20241022` (descontinuado, retorna 404)

**Fix necessário:** Adicionar seção `[MODELOS DE IA — AGENTES PASTORAIS]` no CLAUDE.md
do repo documentando a bifurcação Haiku (operacional) vs Sonnet (pastoral premium).

**Workaround atual:** decisão está implícita em `_shared/anthropic-client.ts` e
no conhecimento da equipe, não em documentação formal.

---

## OPS-DEBT-043 — stripe-webhook: HTTP 400 silenciosos

**Identificada em:** Sprint PR billing — 2026-05-21  
**Status:** ABERTA  
**Prioridade:** Alta — eventos Stripe perdidos silenciosamente

**Causa-raiz:** A Edge Function `stripe-webhook` retorna HTTP 400 para eventos não
mapeados em vez de HTTP 200. O Stripe interpreta qualquer resposta não-2xx como falha e
tenta reenviar até esgotar retries — causando backlog de eventos e potencial
desabilitar do endpoint no dashboard Stripe.

**Fix necessário:**
- Ao receber `event.type` não mapeado: retornar `{ ok: true, skipped: true }` com HTTP 200
- Apenas erros reais (validação de assinatura, crash) devem retornar 4xx/5xx

**Workaround atual:** nenhum — eventos Stripe inesperados acumulam retries.

---

## OPS-DEBT-044 — church_channels (UI) ≠ church_whatsapp_channels (agentes)

**Identificada em:** Sprint F1 canais — 2026-05-21  
**Status:** ABERTA (parcialmente resolvida por F1 Opção C)  
**Prioridade:** Média — arquitetura dividida, UI não reflete estado real dos agentes

**Causa-raiz:** O frontend admin escreve em `church_channels` (tabela genérica de canal),
mas os agentes (`agent-acolhimento`, `demand-router`, etc.) leem de
`church_whatsapp_channels`. São tabelas distintas com schemas distintos. Após F1 Opção C,
`provision-channel` escreve diretamente em `church_whatsapp_channels`, mas a lista de canais
na UI continua lendo `church_channels` — portanto canais provisionados não aparecem na UI.

**Fix necessário (opções):**
- **Opção A:** Migrar a UI para ler de `church_whatsapp_channels` (renomear/adaptar campos)
- **Opção B:** Criar view `church_channels_unified` unindo as duas tabelas
- **Opção C:** Criar RPC `list_church_channels_v2` que lê `church_whatsapp_channels`

**Workaround atual:** Admin verifica canais diretamente via SQL/Supabase Dashboard.

---

## OPS-DEBT-045 — Aliases não-canônicos de modelo Haiku

**Identificada em:** PR-D (fix formality caloroso) — 2026-05-21 / BLOCO 3 SA-3  
**Status:** ✅ RESOLVIDA — 2026-05-21

**Causa-raiz:** `demand-router` e `whatsapp-attendant` usavam `'claude-haiku-3-5'`
(alias não-canônico, retorna 404 em produção). Modelo correto: `claude-haiku-4-5-20251001`.

**Fix aplicado (BLOCO 3 SA-3):**
- `demand-router/index.ts`: literal corrigido → `'claude-haiku-4-5-20251001'`
- `whatsapp-attendant/index.ts`: adicionado `import { MODELS }`, trocado para `MODELS.haiku`
- Ambas re-deployadas via MCP (demand-router v1, whatsapp-attendant v1)

---

## OPS-DEBT-046 — RPC resolve_notification ausente

**Identificada em:** Sprint F1-F5 canais/enums — 2026-05-21 / BLOCO 3 SA-6  
**Status:** ✅ RESOLVIDA — 2026-05-21

**Causa-raiz:** A tabela `internal_notifications` não possuía mecanismo de resolução
(`resolved_at`, `resolved_by`). Cockpit admin `/admin/notifications` precisava de RPC
para marcar alertas como resolvidos sem expor UPDATE direto via RLS.

**Fix aplicado (BLOCO 3 SA-6):**
- Migration `20260521160000_rpc_resolve_notification.sql` aplicada via MCP
- Função `SECURITY DEFINER` com guard de ownership (church_id via `auth_church_id()`)
- GRANT para `service_role` e `authenticated`
- Página `Notifications.tsx` criada + rota `/admin/notifications` + sidebar "Alertas"

---

## OPS-DEBT-047 — RLS ausente em stripe_payment_links

**Identificada em:** Auditoria de segurança — 2026-05-21  
**Status:** ✅ RESOLVIDA — 2026-05-21 (branch `fix/docs-canon-seguranca-rls-debug-efs`)

**Causa-raiz:** Tabela `stripe_payment_links` estava sem RLS habilitada, expondo URLs de
pagamento Stripe sem autenticação.

**Fix aplicado:** Migration `20260521150000_rls_stripe_payment_links.sql`
- `ENABLE ROW LEVEL SECURITY` na tabela
- Policy `stripe_payment_links_admin_all`: `FOR ALL TO authenticated USING (is_ekthos_admin()) WITH CHECK (is_ekthos_admin())`

---

## OPS-DEBT-048 — 6 Edge Functions de debug/teste em produção

**Identificada em:** Auditoria de segurança — 2026-05-21  
**Status:** ✅ RESOLVIDA — 2026-05-21

**Causa-raiz:** 6 EFs de debug/teste estavam deployadas em produção com vulnerabilidades
de segurança graves (3 críticas sem autenticação).

**Fix aplicado:**
- Tombstones HTTP 410 aplicados via branch `fix/docs-canon-seguranca-rls-debug-efs`
- Deleção física de 8 EFs via Management API `DELETE /v1/projects/{ref}/functions/{slug}`
  com PAT (BLOCO 3 — 2026-05-21): `n8n-diagnostic`, `test-r23`, `setup-playwright-user`,
  `set-test-pastor-password`, `debug-stripe-coupon-check`, `debug-backfill-promo-codes`,
  `admin-rotate-test-password`, `zapi-token-probe`

---

## OPS-DEBT-049 — Rotação de senha exposta em set-test-pastor-password

**Identificada em:** Auditoria de segurança — 2026-05-21  
**Status:** ✅ RESOLVIDA — 2026-05-21

**Causa-raiz:** A EF `set-test-pastor-password` (deletada em OPS-DEBT-048) continha a senha
`fX6tTpwnnft_slHoqDDTiiLD` em texto plano. Usuário afetado: UUID `830e12d4-d8ea-4cd4-9f9d-f50d125f09b6`.

**Fix aplicado (BLOCO 3 — 2026-05-21):**
- EF temporária `admin-rotate-test-password` deployada com nonce de autenticação
- Chamada com nonce correto → `{"ok":true,"rotated_at":"2026-05-21T22:45:33.366Z"}`
- EF tombstonada imediatamente e deletada fisicamente (ver OPS-DEBT-048)
- Senha rotacionada programaticamente via Admin API `PUT /auth/v1/admin/users/{id}`

---

## OPS-DEBT-050 — docs/commercial/ desatualizado

**Identificada em:** Auditoria de documentação — 2026-05-21  
**Status:** ABERTA  
**Prioridade:** Baixa — risco de confusão interna, não afeta produção

**Causa-raiz:** Os arquivos em `docs/commercial/` contêm pricing e catálogo de agentes
completamente divergentes da realidade atual do produto.

**Fix necessário:**
- Opção A: Deletar `docs/commercial/` inteiro e redirecionar para `docs/00-formacoes.md`
- Opção B: Atualizar cada arquivo de `docs/commercial/` para refletir realidade atual

**Fonte autoritativa:** `docs/00-formacoes.md`

**Workaround atual:** Ignorar `docs/commercial/` — usar `docs/00-formacoes.md` como referência.

---

## OPS-DEBT-051 — ZAPI_CLIENT_TOKEN não recebido

**Identificada em:** BLOCO 3 (2026-05-21)  
**Status:** ✅ RESOLVIDA — 2026-05-21

**Causa-raiz:** Confusão entre EF secret e vault pgsodium. O EF secret
`ZAPI_CLIENT_TOKEN` (prefixo `F2d0***`) estava configurado corretamente
desde 2026-05-02. O vault.secrets tinha um valor errado (sbp_... Supabase PAT).

**Fix aplicado (2026-05-21):**
- Probe EF `zapi-token-probe` deployada para validar o token sem expô-lo
- Resultado: `token_prefix: "F2d0***"`, `zapi_http_status: 200`, `connected: true`
- Vault entry errada (sbp_... Supabase PAT) deletada via `DELETE FROM vault.secrets`
- `zapi-send` v18 operacional com token correto via EF secret (prioridade sobre vault)
- Probe EF tombstonada e deletada fisicamente

---

## OPS-DEBT-052 — F2 incompleto em agent-haiku-triagem e agent-acolhimento

**Identificada em:** BLOCO 3 — SA-7 (2026-05-21)  
**Status:** ✅ RESOLVIDA — 2026-05-21

**Causa-raiz:**
- `agent-haiku-triagem`: sem ownership guard (F2) e sem `guardAgent()` grant check
- `agent-acolhimento`: SELECT em `conversations` sem filtro `.eq('church_id', churchId)`

**Fix aplicado:**
- `agent-haiku-triagem` v11: adicionado ownership guard F2 + `guardAgent(church_id, AGENT_SLUG)`
- `agent-acolhimento` v27: adicionado `.eq('church_id', churchId)` na query de conversations
- Sonnet preservado em agent-acolhimento (não alterado)
- Ambas re-deployadas via MCP

---

## Histórico

| ID | Sprint | Data | Status |
|----|--------|------|--------|
| OPS-DEBT-039 | Vanessa Onda 1 | 2026-05-19 | Aberta |
| OPS-DEBT-040 | Vanessa Onda 1 | 2026-05-19 | Aberta |
| OPS-DEBT-041 | PR-D formality caloroso | 2026-05-21 | Aberta |
| OPS-DEBT-042 | PR-D formality caloroso | 2026-05-21 | Aberta |
| OPS-DEBT-043 | PR billing stripe-webhook | 2026-05-21 | Aberta |
| OPS-DEBT-044 | Sprint F1 canais | 2026-05-21 | Aberta |
| OPS-DEBT-045 | BLOCO 3 SA-3 | 2026-05-21 | ✅ Resolvida |
| OPS-DEBT-046 | BLOCO 3 SA-6 | 2026-05-21 | ✅ Resolvida |
| OPS-DEBT-047 | Auditoria segurança | 2026-05-21 | ✅ Resolvida |
| OPS-DEBT-048 | Auditoria segurança + BLOCO 3 | 2026-05-21 | ✅ Resolvida |
| OPS-DEBT-049 | Auditoria segurança + BLOCO 3 | 2026-05-21 | ✅ Resolvida |
| OPS-DEBT-050 | Auditoria documentação | 2026-05-21 | Aberta |
| OPS-DEBT-051 | BLOCO 3 | 2026-05-21 | ✅ Resolvida |
| OPS-DEBT-052 | BLOCO 3 SA-7 | 2026-05-21 | ✅ Resolvida |
