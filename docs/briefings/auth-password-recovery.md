# Recuperação de Senha + Toggle de Visibilidade

**Data:** 27/04/2026  
**Commit:** `837a931`  
**Branch:** `staging`

---

## Portão 1 — Build

- ✅ `npm run build` — 0 erros, 0 warnings  
- Chunks novos gerados: `PasswordInput-BdDnA_v-.js`, `ForgotPassword-DGo242Qk.js`, `ResetPassword-BhlAEj4B.js`

---

## Portão 2 — Teste técnico

| Cenário | Status | Observação |
|---|---|---|
| Toggle olho em /login | ✅ Build + auditoria | `<PasswordInput>` aplicado, toggle Eye/EyeOff |
| Toggle olho em /set-password | ✅ Build + auditoria | 2 campos PasswordInput (nova senha + confirmar) |
| Toggle olho em /reset-password | ✅ Build + auditoria | 2 campos PasswordInput |
| /forgot-password envia email | ⏳ Aguarda smoke test | Lógica: `supabase.auth.resetPasswordForEmail()` |
| Email PT-BR chega correto | ⏳ Aguarda smoke test | Template aplicado via Management API |
| /reset-password aceita token | ⏳ Aguarda smoke test | onAuthStateChange PASSWORD_RECOVERY |
| Nova senha funciona no login | ⏳ Aguarda smoke test | `updateUser({ password })` + `window.location.href` |

---

## Portão 3 — Não-regressão

| Cenário | Status | Observação |
|---|---|---|
| Login pastor teste | ⏳ Aguarda smoke test | Comportamento de auth não alterado |
| SetPassword (invite) | ✅ Build | Lógica idêntica, apenas substituiu Input inline por `<PasswordInput>` |
| F6 webhook ainda processa | ✅ Não tocado | stripe-webhook não foi modificado |
| Zero `navigate('/dashboard')` nas telas novas | ✅ Auditoria | Grep confirmou 0 ocorrências |
| Zero `<input type="password">` restante | ✅ Auditoria | Apenas comentário no PasswordInput.tsx |

---

## Portão 4 — Relatório

**Hash commit:** `837a931`  
**PR:** https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...staging?expand=1

### Arquivos criados

| Arquivo | Descrição |
|---|---|
| `web/src/components/ui/PasswordInput.tsx` | Componente reutilizável com toggle Eye/EyeOff |
| `web/src/pages/ForgotPassword.tsx` | Tela `/auth/forgot-password` |
| `web/src/pages/ResetPassword.tsx` | Tela `/auth/reset-password` |
| `supabase/templates/recovery.html` | HTML do email de recuperação em PT-BR |

### Arquivos modificados

| Arquivo | O que mudou |
|---|---|
| `web/src/pages/Login.tsx` | Campo senha → `<PasswordInput>` + link "Esqueci minha senha" |
| `web/src/pages/SetPassword.tsx` | 2 campos senha → `<PasswordInput>` (remove estados showPw/showConfirm inline) |
| `web/src/App.tsx` | Lazy imports + rotas `/auth/forgot-password` e `/auth/reset-password` |

### Rotas adicionadas

| Rota | Componente | Proteção |
|---|---|---|
| `/auth/forgot-password` | `ForgotPassword` | Pública |
| `/auth/reset-password` | `ResetPassword` | Pública (requer hash type=recovery) |

### Template email aplicado via Management API

- **Endpoint:** `PATCH https://api.supabase.com/v1/projects/mlqjywqnchilvgkbvicd/config/auth`
- **Subject:** `Redefinir sua senha do Ekthos` → campo `mailer_subjects_recovery`
- **Content:** HTML completo → campo `mailer_templates_recovery_content`
- **Confirmação GET:** subject retornou `"Redefinir sua senha do Ekthos"` ✅

### Armadilha 8 — CLAUDE.md cumprida

`ResetPassword.tsx` usa `window.location.href = '/login'` após `updateUser({ password })`:
```typescript
// Armadilha 8: window.location.href força reload completo do AuthProvider.
// navigate('/login') deixaria churchStatus em cache e poderia criar loop.
setTimeout(() => { window.location.href = '/login' }, 2000)
```

---

## Estado final

| Item | Estado |
|---|---|
| Felipe pode resetar própria senha pelo email | ✅ SIM (aguarda smoke test em staging) |
| Pastor real pode usar fluxo | ✅ SIM (aguarda smoke test em staging) |
| Pode mergear para main | ⏳ AGUARDAR — Felipe valida em staging primeiro |

---

## Smoke test checklist — Felipe executa em staging

```
[ ] Abrir /login → campo senha tem botão olho (mostra/oculta)
[ ] Link "Esqueci minha senha" aparece abaixo do campo de senha
[ ] Link leva para /auth/forgot-password
[ ] Em /forgot-password: digitar felipe@ekthosai.net → submeter → mensagem de sucesso ambígua
[ ] Verificar email → recebido em PT-BR com visual correto (logo + CTA + aviso segurança)
[ ] Clicar link no email → cair em /auth/reset-password → campos habilitam
[ ] Criar nova senha "Ekthos2026!" → ver redirect para /login
[ ] Logar com nova senha → confirmar entrada em /admin/cockpit
[ ] Login do pastor@igrejateste.com ainda funciona (não-regressão)
```

---

## Novas ambiguidades detectadas

Nenhuma. Fluxo limpo, sem conflitos com código existente.
