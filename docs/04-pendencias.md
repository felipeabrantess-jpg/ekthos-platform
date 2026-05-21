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

## Histórico

| ID | Sprint | Data | Status |
|----|--------|------|--------|
| OPS-DEBT-039 | Vanessa Onda 1 | 2026-05-19 | Aberta |
| OPS-DEBT-040 | Vanessa Onda 1 | 2026-05-19 | Aberta |
| OPS-DEBT-041 | PR-D formality caloroso | 2026-05-21 | Aberta |
| OPS-DEBT-042 | PR-D formality caloroso | 2026-05-21 | Aberta |
