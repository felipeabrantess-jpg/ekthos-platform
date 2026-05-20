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

## Histórico

| ID | Sprint | Data | Status |
|----|--------|------|--------|
| OPS-DEBT-039 | Vanessa Onda 1 | 2026-05-19 | Aberta |
| OPS-DEBT-040 | Vanessa Onda 1 | 2026-05-19 | Aberta |
