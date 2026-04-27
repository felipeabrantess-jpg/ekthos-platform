# F6 Pós-Merge — Diagnóstico Arquitetural: Roteamento Pós-Login

**Data:** 27/04/2026  
**Status:** BUG CONFIRMADO — causa raiz identificada  
**Impacto:** Caminho A (landing/Stripe) bloqueado em onboarding loop. Caminho B/C não afetados.

---

## 1. SmartRoot — Mapa Completo de Roteamento

**Arquivo:** `web/src/App.tsx` (função `SmartRoot`, linha 283)

A `SmartRoot` é renderizada na rota raiz `/` e executa uma cadeia de 5 guards sequenciais:

```
SmartRoot (rota index "/")
│
├─ Guard 1: loading === true           → <FullScreenSpinner />
│
├─ Guard 2: !user                      → Navigate to="/landing"
│
├─ Guard 3: isEkthosAdmin              → Navigate to="/admin/cockpit"
│
├─ Guard 4: needsPasswordSetup(...)    → Navigate to="/auth/set-password"
│   └─ Condição exata:
│       · session.access_token existe E user não é null
│       · JWT decodificado tem amr[].method === 'otp'
│       · user.user_metadata.password_set !== true
│
├─ Guard 5: !churchId                  → Navigate to="/onboarding"
│   └─ churchId = app_metadata.church_id ?? user_metadata.church_id
│
└─ defaultRoute(role)                  → Navigate to="/dashboard" (ou "/financeiro" para treasurer)
```

### Rotas possíveis a partir do SmartRoot

| Saída | Condição |
|---|---|
| `/landing` | Não autenticado |
| `/admin/cockpit` | `isEkthosAdmin === true` |
| `/auth/set-password` | Invite recém-aceito (OTP auth, sem senha) |
| `/onboarding` | `churchId` é null no JWT |
| `/dashboard` | role ≠ treasurer (inclui admin, todos os outros roles) |
| `/financeiro` | role === treasurer |

### StatusGuard — intercepta CRM routes

Todas as rotas CRM (`/dashboard`, `/pessoas`, `/pipeline`, etc.) são filhas de um `<ProtectedRoute><StatusGuard><Layout>`. Após o SmartRoot enviar para `/dashboard`, o `StatusGuard` ainda pode redirecionar:

```
StatusGuard checks (web/src/App.tsx, linha 97):
  churchStatus === 'onboarding'       → Navigate to="/onboarding"
  churchStatus === 'pending_payment'  → Navigate to="/payment-pending"
  churchStatus === 'suspended'        → Navigate to="/blocked"
  churchStatus === 'cancelled'        → Navigate to="/cancelled"
  [else]                              → renderiza filhos (Layout → Dashboard)
```

> **Nota crítica:** A rota `/onboarding` é **pública** (sem ProtectedRoute, sem StatusGuard). Isso permite que um pastor não-autenticado acesse /onboarding, mas também significa que não há guard para quebrar o loop quando churchStatus fica stale.

---

## 2. AuthContext — O Que é Carregado no Login

**Arquivo:** `web/src/lib/auth-context.tsx`

### Fluxo de inicialização

```
AuthProvider monta
│
├─ refreshSession()                         [UMA VEZ, força JWT novo]
│   └─ resolveAuthFromUser(user, session)
│       ├─ isEkthosAdmin:
│       │   app_metadata.is_ekthos_admin === true
│       │   OR user_metadata.is_ekthos_admin === true
│       │
│       ├─ rawChurchId:
│       │   app_metadata.church_id           [FONTE PRIMÁRIA]
│       │   ?? user_metadata.church_id       [FALLBACK]
│       │
│       ├─ impersonatedChurchId:             [só para isEkthosAdmin]
│       │   localStorage.getItem('impersonating')?.church_id
│       │
│       ├─ churchId = impersonatedChurchId ?? rawChurchId
│       │
│       ├─ churchStatus:
│       │   SELECT status FROM churches WHERE id = churchId  [DB query]
│       │
│       └─ role:
│           SELECT role FROM user_roles WHERE user_id = userId AND church_id = churchId
│
└─ onAuthStateChange(subscription)          [UMA ÚNICA subscription]
    └─ re-executa resolveAuthFromUser() em cada mudança de sessão
```

### Campos do AuthState disponíveis nos componentes

| Campo | Fonte | Atualiza durante sessão? |
|---|---|---|
| `user` | Supabase Auth (JWT) | Sim (via onAuthStateChange) |
| `session` | Supabase Auth | Sim (via onAuthStateChange) |
| `churchId` | `app_metadata.church_id` (JWT) | **Apenas com refreshSession** |
| `churchStatus` | `SELECT status FROM churches` | **Apenas com refreshSession** |
| `role` | `SELECT role FROM user_roles` | **Apenas com refreshSession** |
| `isEkthosAdmin` | `app_metadata.is_ekthos_admin` | Apenas com refreshSession |

> **⚠️ Armadilha:** `churchStatus` é buscado do banco UMA VEZ na inicialização do provider. Se `churches.status` mudar durante a sessão (ex: onboarding-engineer atualiza para 'configured'), o `churchStatus` em memória **permanece o valor antigo** até que haja um reload completo da página.

### Resolução do church_id

```
JWT app_metadata.church_id       ← FONTE PRIMÁRIA (setada por updateUserById)
│
└─ se null → user_metadata.church_id   ← FALLBACK
│
└─ se null → churchId = null
    └─ SmartRoot Guard 5: !churchId → /onboarding
```

---

## 3. needsPasswordSetup e needsOnboarding — Lógica Exata

**Arquivo:** `web/src/App.tsx`, função `needsPasswordSetup` (linha 263)

### needsPasswordSetup

```typescript
function needsPasswordSetup(session, user): boolean {
  // Decodifica JWT access_token manualmente (user.amr NÃO existe no objeto User)
  const payload = JSON.parse(atob(session.access_token.split('.')[1]))
  const amr = payload.amr ?? []
  const hasOtpAuth = amr.some(m => m.method === 'otp')
  const passwordSet = user.user_metadata?.password_set === true
  return hasOtpAuth && !passwordSet
}
```

**Resultado `true` (→ /auth/set-password) quando:**
- Pastor clicou no link do invite (autenticou via OTP/magic link)
- E ainda não definiu uma senha (`user_metadata.password_set !== true`)

**Resultado `false` (passa adiante) quando:**
- Autenticou via email+senha → `amr.method === 'password'`, não OTP
- OU já definiu senha → `user_metadata.password_set === true`

### needsOnboarding (implícita no SmartRoot)

Não existe como função separada. É o Guard 5 do SmartRoot:
```typescript
if (!churchId) return <Navigate to="/onboarding" replace />
```

**→ /onboarding quando:** `app_metadata.church_id` é null (user convidado mas `updateUserById` ainda não rodou, ou user criado sem church_id).

**StatusGuard → /onboarding quando:** `churchStatus === 'onboarding'` (church existe, mas onboarding não concluído). Esta é a rota mais relevante para o bug F6.

---

## 4. Estado Real do Banco (27/04/2026)

### Caminho A — Igrejas criadas hoje via F6
```sql
-- Resultado: [] (vazio — dados de teste foram limpos no cleanup pós-testes F6)
SELECT name, slug, status, created_at FROM churches WHERE created_at >= '2026-04-27' LIMIT 5;
```
Nenhuma church de produção criada hoje — apenas testes (limpos).

### Caminho B/C — Igreja Teste Ekthos (pré-existente)

| Campo | Valor |
|---|---|
| `church_id` | `c6ae4259-4a42-4c2c-be5b-66afbd366d73` |
| `church.name` | Igreja Batista Nova Vida |
| **`church.status`** | **`configured`** ✅ |
| `sub.status` | `active` |
| `sub.plan_slug` | `chamado` |
| `sub.billing_origin` | `cockpit_manual` |
| `grant.grant_type` | `paid` |
| `grant.active` | `true` |
| `church_has_access()` | `true` |

### Pastor Teste

| Campo | Valor |
|---|---|
| `user_id` | `33e630d6-1c10-49bb-824b-cc1e6952a0ba` |
| `email` | `pastor@igrejateste.com` |
| `role` | `admin` |
| `raw_app_meta_data.church_id` | `c6ae4259-...` ✅ |
| `raw_app_meta_data.role` | `admin` ✅ |

### Distribuição de status de churches em produção

| status | total |
|---|---|
| `configured` | 2 |
| `onboarding` | 1 (Igreja Ekthos Demo — criada em 08/04, sem subscription) |

---

## 5. Gap Analysis

| Caminho | O que SmartRoot espera | O que está no banco pós-F6 | Status |
|---|---|---|---|
| **C — Pastor recorrente** | `app_metadata.church_id` preenchido + `church.status ≠ 'onboarding'` | `app_metadata.church_id = c6ae4259`, `church.status = 'configured'` | ✅ OK — sem regressão |
| **B — Cockpit Missão/Avivamento (manual)** | `app_metadata.church_id` preenchido + `church.status = 'configured'` (pós-cockpit) | Cockpit já cria com status correto (admin configura antes de convidar) | ✅ OK — sem regressão |
| **A — Self-service Chamado (Stripe)** | Após onboarding completo: `churchStatus = 'configured'` em memória | F6 cria church com `status='onboarding'` ✓ mas `auth-context.churchStatus` permanece `'onboarding'` em memória após `onboarding-engineer` atualizar para `'configured'` | ❌ **BUG** — stale context |

**Mismatch específico para Caminho A (pós-onboarding):**

```
Banco:                churches.status = 'configured'    ← onboarding-engineer atualizou
auth-context:         churchStatus    = 'onboarding'    ← valor do login, nunca refreshed
StatusGuard:          'onboarding' → redirect /onboarding
Resultado:            loop infinito /onboarding ↔ /onboarding/configuring
```

---

## 6. Causa Raiz

### F6 introduziu a regressão? SIM — em dois pontos:

**Ponto 1 (novo comportamento F6):** `process_stripe_checkout_completed` (migration F6) cria churches com `status='onboarding'`. Antes do F6, o webhook v7 criava diretamente ou usava um status diferente que não disparava o `StatusGuard`. Após F6, todo novo checkout da landing page passa pelo `StatusGuard → /onboarding`.

**Ponto 2 (bug pré-existente exposto pelo F6):** `auth-context.tsx` carrega `churchStatus` via SELECT uma vez na inicialização e **nunca atualiza durante a sessão**. Enquanto churches eram criadas direto como 'configured' (pré-F6), esse problema ficava latente. Com F6 introduzindo o ciclo `onboarding → configured`, o stale state se tornou bloqueante.

O fluxo quebrado é:

```
1. Pastor faz checkout via landing → F6 cria church status='onboarding'
2. Pastor recebe invite → clica → OTP auth → needsPasswordSetup=true → /set-password
3. Pastor define senha → user_metadata.password_set = true
4. SmartRoot: churchId existe, needsPasswordSetup=false → defaultRoute → /dashboard
5. StatusGuard: churchStatus='onboarding' (do login original) → redirect /onboarding   ✓ CORRETO
6. Pastor faz onboarding (chat com consultor)
7. Clica "Configurar meu CRM agora" → navigate('/onboarding/configuring')
8. onboarding-engineer EXECUTA → UPDATE churches SET status='configured' ✓ banco OK
9. Configuring.tsx usa navigate('/dashboard')  ← React Router, SEM page reload
10. auth-context.churchStatus ainda = 'onboarding' (nunca refreshed)
11. StatusGuard: 'onboarding' → redirect /onboarding  ← LOOP INFINITO
```

**A quebra está no passo 9:** `navigate('/dashboard')` do React Router não reinicializa o `AuthProvider`. O `useEffect` do `AuthProvider` não re-executa. `churchStatus` permanece 'onboarding' mesmo com o banco já em 'configured'.

A regra do `CLAUDE.md` é clara e se aplica exatamente aqui:
> **"NUNCA `navigate()` quando precisa recarregar contexto auth — usar `window.location.href`"**

---

## 7. Plano de Fix

### Arquivos a modificar

**1. `web/src/pages/onboarding/Configuring.tsx`** — Mudança cirúrgica, 1 linha

Localizar a navegação final (botão "Entrar no meu CRM" ou navigate após completion) e substituir:
```typescript
// ANTES (causa o bug)
navigate('/dashboard')

// DEPOIS (força reload do AuthProvider, churchStatus é re-fetched do banco)
window.location.href = '/dashboard'
```

**2. (Opcional, recomendado) `web/src/lib/auth-context.tsx`** — Adicionar método `refresh`

Expor um método `refreshChurchStatus()` no context para não depender exclusivamente de page reload:
```typescript
// Adicionar ao AuthState:
refreshChurchStatus: () => Promise<void>

// Implementação no Provider:
const refreshChurchStatus = useCallback(async () => {
  const { data: { session } } = await supabase.auth.refreshSession()
  if (session?.user) {
    const resolved = await resolveAuthFromUser(session.user, session)
    setState(resolved)
  }
}, [])
```

Isso permite que `Configuring.tsx` atualize o contexto sem um page reload:
```typescript
// Em Configuring.tsx, após onboarding-engineer completar:
await refreshChurchStatus()
navigate('/dashboard')
```

### Testes para validar

1. **Caminho A completo:** Novo pastor → landing → checkout → invite → set-password → onboarding wizard → "Configurar meu CRM" → progresso → botão "Entrar" → **deve chegar em /dashboard sem loop**
2. **Caminho C não-regressão:** Pastor existente (c6ae4259) faz login → deve ir direto para /dashboard
3. **StatusGuard após fix:** Navegar para `/dashboard` com church.status='onboarding' no banco → ainda deve redirecionar (para churches que não completaram onboarding)
4. **Loop eliminado:** Após onboarding completo, nenhum redirect para /onboarding

### Estimativa de tempo

| Item | Tempo |
|---|---|
| Fix cirúrgico (`window.location.href`) | 5 min |
| Fix estrutural (refreshChurchStatus) | 30 min |
| Testes manuais dos 3 caminhos | 20 min |
| Total recomendado | ~1h (fix cirúrgico + testes) |

### Riscos

| Risco | Nível | Mitigação |
|---|---|---|
| `window.location.href` causa UX de reload visível | Baixo | Aceitável: acontece UMA VEZ, no final do onboarding, transição natural |
| Fix estrutural (refreshChurchStatus) tem race condition | Médio | Testar com loading state para prevenir double-click durante refresh |
| Fix não cobre Caminho B (cockpit checkout via Stripe) | Baixo | `handleCockpitCheckout` também faz `pending_payment → onboarding`; o mesmo fix se aplica se o cockpit tiver um fluxo pós-checkout |

---

## 8. Checklist de Validação — 3 Caminhos Comerciais

### Caminho A — Self-service Chamado (Stripe direto)

```
[ ] landing page carrega corretamente
[ ] checkout Stripe dispara webhook
[ ] process_stripe_checkout_completed cria church com status='onboarding'
[ ] inviteUserByEmail envia email (check inbox)
[ ] updateUserById seta app_metadata.church_id no pastor
[ ] Pastor clica link → /auth/set-password (needsPasswordSetup=true)
[ ] Pastor define senha → user_metadata.password_set=true
[ ] Navigate → SmartRoot → StatusGuard → /onboarding (church ainda 'onboarding') ✓
[ ] Pastor conclui chat de onboarding → clica "Configurar meu CRM"
[ ] /onboarding/configuring → onboarding-engineer executa 20 steps
[ ] onboarding-engineer UPDATE churches SET status='configured'
[ ] Botão "Entrar no meu CRM" → window.location.href='/dashboard' [FIX]
[ ] auth-context re-inicializa → churchStatus='configured'
[ ] StatusGuard: 'configured' → passa → /dashboard renderiza ✓
[ ] Dashboard carrega dados da igreja ✓
```

### Caminho B — Venda consultiva (cockpit manual)

```
[ ] Admin Ekthos cria church via cockpit (admin-church-create)
[ ] church.status = 'configured' (cockpit cria direto — sem onboarding automático)
[ ] Admin convida pastor via cockpit (inviteUserByEmail manual)
[ ] updateUserById seta app_metadata.church_id
[ ] Pastor clica invite → /auth/set-password
[ ] Pastor define senha
[ ] SmartRoot: churchId existe → defaultRoute → /dashboard
[ ] StatusGuard: 'configured' → passa ✓
[ ] /dashboard renderiza ✓
[ ] (Se cockpit for criar com pending_payment e usar Stripe) mesmo fix do Caminho A se aplica
```

### Caminho C — Pastor recorrente (login direto)

```
[ ] Pastor acessa ekthosai.com → está na landing → clica Login
[ ] /login → autentica com email+senha
[ ] auth-context: refreshSession() → app_metadata.church_id presente
[ ] auth-context: SELECT churches.status WHERE id=church_id → 'configured'
[ ] SmartRoot: churchId existe → defaultRoute(role) = '/dashboard'
[ ] StatusGuard: 'configured' → passa ✓
[ ] /dashboard renderiza ✓
[ ] Sidebar carrega módulos do plano ✓
[ ] Agentes responden normalmente ✓
```

---

## 9. Arquivos Lidos Neste Diagnóstico

| Arquivo | Relevância |
|---|---|
| `web/src/App.tsx` | SmartRoot, StatusGuard, guards de rota (fonte primária) |
| `web/src/lib/auth-context.tsx` | AuthProvider, resolveAuthFromUser, churchStatus loading |
| `web/src/hooks/useRole.ts` | defaultRoute, AppRole, ROUTE_PERMISSIONS |
| `web/src/pages/Onboarding.tsx` | Fluxo do wizard (não atualiza church.status) |
| `web/src/pages/onboarding/Configuring.tsx` | Onde onboarding-engineer é chamado (status atualizado aqui) |
| `supabase/functions/onboarding-engineer/index.ts` | UPDATE churches SET status='configured' (linha 165) |
| `supabase/migrations/20260427150000_f6_atomic_checkout_processing.sql` | process_stripe_checkout_completed: INSERT churches status='onboarding' |

---

## Resumo Executivo

**Causa:** `Configuring.tsx` usa `navigate('/dashboard')` (React Router) após o `onboarding-engineer` concluir. React Router não reinicializa o `AuthProvider`. O `churchStatus` em memória permanece `'onboarding'` mesmo após o banco ter sido atualizado para `'configured'`. O `StatusGuard` lê o valor stale e redireciona de volta para `/onboarding` — loop infinito.

**F6 introduziu a regressão?** Sim. Antes do F6, o webhook criava churches com status diferente de 'onboarding' (direto para 'configured' ou sem StatusGuard interceptar). F6 passou a criar churches com `status='onboarding'`, expondo o stale context que era latente.

**Fix:** Substituir `navigate('/dashboard')` por `window.location.href = '/dashboard'` em `Configuring.tsx`. Uma linha. Sem risco arquitetural.

**Caminho C (pastores existentes) não é afetado.** O bug é exclusivo do fluxo pós-onboarding de novos pastores do Caminho A.

---

## 10. Resultado da Auditoria de `navigate()` — Pós-Aprovação do Diagnóstico

**Data:** 27/04/2026  
**Escopo:** Todos os callsites de `navigate()` para rotas de auth/onboarding em `web/src/`  
**Resultado:** ✅ 0 callsites BUG encontrados

### Tabela completa de classificação

| Arquivo | Linha | Chamada | Classificação | Motivo |
|---|---|---|---|---|
| `Configuring.tsx` | 564 | `window.location.href = '/dashboard'` | ✅ OK | **JÁ CORRETO** — hard reload explícito com comentário explicativo |
| `Configuring.tsx` | 489 | `navigate('/login')` | ✅ OK | Guard defensivo sem sessão — não altera churchStatus |
| `SetPassword.tsx` | 121 | `navigate('/', { replace: true })` | ✅ OK | `refreshSession()` chamado antes; SmartRoot reavalia estado |
| `PaymentPending.tsx` | 48 | `navigate('/onboarding', { replace: true })` | ✅ OK | `refreshSession()` chamado antes |
| `Church.tsx` | 726 | `navigate('/dashboard')` | ✅ OK | `window.location.reload()` imediato após — garante remount |
| `Churches.tsx` | 232 | `navigate('/dashboard')` | ✅ OK | `window.location.reload()` imediato após — garante remount |
| `Layout.tsx` | 66 | `navigate('/admin/churches')` | ✅ OK | `window.location.reload()` imediato após — saída de impersonação |
| `Church.tsx` | 745 | `navigate('/admin/churches')` | ✅ OK | Within-admin, sem troca de churchStatus |
| `AffiliateDetail.tsx` | 321, 410 | `navigate(...)` | ✅ OK | Rotas admin internas, sem troca de churchStatus |
| `AdminLayout.tsx` | 35 | `navigate('/dashboard')` | ⚠️ MINOR | Sem reload — edge case: admin impersonando igreja `onboarding`. Não é o bug reportado. |

### Achado crítico — Diagnóstico original estava incorreto em um ponto

O diagnóstico (Seção 6) identificou `Configuring.tsx navigate('/dashboard')` como causa raiz. A auditoria revelou que **`Configuring.tsx` já usa `window.location.href = '/dashboard'`** na função `goToDashboard()` (linha 564–570), com o comentário correto explicando o motivo:

```typescript
function goToDashboard() {
  // Hard reload — força o AuthProvider a remontar e buscar churchStatus
  // atualizado do banco (o engineer acabou de mudar para 'configured').
  // navigate() faria navegação client-side e o StatusGuard leria o
  // churchStatus em cache ('onboarding') e redirecionaria de volta.
  window.location.href = '/dashboard'
}
```

Esta função é chamada em dois pontos:
- `Configuring.tsx:663` — `<CompletionScreen onEnter={goToDashboard} />` (tela rica de conclusão)
- `Configuring.tsx:684` — botão fallback "Entrar no CRM" (quando `summary` é null)

**Nenhum fix de código foi aplicado** — o callsite presumido já estava correto.

### Causa raiz revisada — investigação necessária

Se o bug "roteamento pós-login quebrou" persiste mesmo com `Configuring.tsx` correto, as hipóteses mais prováveis são:

1. **`onboarding-engineer` não está terminando com sucesso** — se o agente não chega a executar `UPDATE churches SET status='configured'`, o banco permanece `status='onboarding'` e o reload do `goToDashboard()` simplesmente re-lê `'onboarding'` — redirect legítimo, não loop.

2. **`church_id` ausente no `app_metadata`** — se `updateUserById` (chamado pelo webhook F6) ainda não propagou o `church_id` para `app_metadata` quando o pastor faz login, `SmartRoot Guard 5` redireciona para `/onboarding` indefinidamente sem nunca chegar em `StatusGuard`.

3. **`AdminLayout.tsx:35`** — se o bug foi reportado por um admin navegando "Voltar ao CRM" enquanto impersonava uma igreja em `onboarding`, este callsite sem reload é o culpado. Edge case, mas reproduzível.

### Próximos passos recomendados

Para identificar a causa real, testar com o pastor `33e630d6-1c10-49bb-824b-cc1e6952a0ba` (ou criar novo via landing) e verificar:
1. `SELECT status FROM churches WHERE id = '<church_id>'` — está `'configured'` quando o bug ocorre?
2. `SELECT raw_app_meta_data->>'church_id' FROM auth.users WHERE id = '<user_id>'` — `church_id` está presente?
3. Se ambos OK, verificar `onboarding-engineer` logs no Supabase para falha silenciosa.
