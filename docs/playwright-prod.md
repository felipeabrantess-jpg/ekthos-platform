# Playwright E2E — Testes contra Produção

## Visão Geral

Este projeto possui duas configurações Playwright distintas:

| Config | Target | Arquivo |
|---|---|---|
| `playwright.config.ts` | `http://localhost:5173` | Testes locais (CI/dev) |
| `playwright.prod.config.ts` | `https://ekthos-platform.vercel.app` | Smoke tests de produção |

---

## Setup inicial (já executado em 06/05/2026)

O usuário de teste `playwright@ekthosai.net` foi criado via EF temporária com:
- `app_metadata.is_ekthos_admin = true`
- Email confirmado
- Senha armazenada como `PLAYWRIGHT_ADMIN_PASSWORD` no Vercel (encrypted)

---

## Como rodar os smoke tests de produção

### 1. Pré-requisito: variáveis de ambiente

As variáveis não estão no repositório. Você precisa ter `web/.env.local` com:

```env
PLAYWRIGHT_ADMIN_EMAIL=playwright@ekthosai.net
PLAYWRIGHT_ADMIN_PASSWORD=<valor no Vercel Dashboard — Projects > ekthos-platform > Settings > Environment Variables>
PLAYWRIGHT_BASE_URL=https://ekthos-platform.vercel.app
```

O arquivo `web/.env.local` está coberto pelo `.gitignore` (`*.env.*`).
**NUNCA commitar este arquivo.**

### 2. Executar

```bash
cd web
npx playwright test --config=playwright.prod.config.ts
```

Saída esperada:
```
[global-setup-prod] Login como playwright@ekthosai.net em https://ekthos-platform.vercel.app
[global-setup-prod] Login OK: https://ekthos-platform.vercel.app/admin/cockpit
Running 1 test using 1 worker
  ok 1 [chromium] › admin-smoke.spec.ts › ativações → churches → logout
  1 passed
```

### 3. Ver relatório HTML

```bash
cd web
npx playwright show-report
```

---

## Estrutura de arquivos

```
web/
├── playwright.prod.config.ts          # Config de produção (baseURL = vercel.app)
├── .env.local                         # Gitignored — credenciais locais
└── tests/
    └── e2e/
        ├── .gitignore                 # Ignora .auth.json (tokens de sessão)
        ├── global-setup.ts            # Login + salva storageState
        ├── admin-smoke.spec.ts        # Smoke test: ativações → churches → logout
        └── helpers/
            └── auth.ts                # Fail-loud helper para credenciais
```

---

## Smoke test: o que é verificado

**Arquivo:** `web/tests/e2e/admin-smoke.spec.ts`

1. **Autenticação** — global-setup faz login como `playwright@ekthosai.net` e salva storageState
2. **`/admin/cockpit/ativacoes`** — carrega sem redirecionar para `/login`; tem conteúdo visível
3. **`/admin/churches`** — carrega; mostra ≥1 entrada de igreja
4. **Logout** — sessão encerrada; redireciona para `/login`

---

## Segurança

- Senha **nunca** aparece em código, commits, logs ou respostas ao usuário
- Armazenada exclusivamente em:
  - Vercel Environment Variables (encrypted, tipo `encrypted`)
  - `web/.env.local` (gitignored)
- `web/tests/e2e/.auth.json` (tokens de sessão) está no `.gitignore`
- Dívida de rotação registrada em `docs/debts.md` como **OPS-DEBT-002**

---

## Rotação de senha (a cada 90 dias)

Ver `docs/debts.md` → OPS-DEBT-002 para procedimento detalhado.
**Próxima rotação:** 05/08/2026

---

## Troubleshooting

### "Variáveis de ambiente ausentes"
Configure `web/.env.local` com as 3 variáveis listadas acima.

### "Auth existente reutilizada" mas testes falham com 401/redirect
O token de sessão expirou. Delete o cache e rode novamente:
```bash
rm -f web/tests/e2e/.auth.json
cd web && npx playwright test --config=playwright.prod.config.ts
```

### Testes locais pararam de funcionar
O `playwright.prod.config.ts` é separado do `playwright.config.ts`.
Testes locais continuam usando `npx playwright test` (sem `--config`).
