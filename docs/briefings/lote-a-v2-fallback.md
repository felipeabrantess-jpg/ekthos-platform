# Lote A v2 — Fallback Robusto contact-consultant
**Data:** 2026-04-27  
**Commit:** `95d65c6`  
**Branch:** `staging`

---

## Resumo

Hardening da Edge Function `contact-consultant` para garantir que o pastor
nunca receba erro 500, mesmo quando `RESEND_API_KEY` não está configurada
ou quando o Resend retorna falha.

---

## Problema

A versão anterior (v1) tentava enviar o email e, se a chave não estava
configurada, retornava 200 apenas com log no console — sem persistir nada
no banco. Se a chave estivesse configurada mas o Resend falhasse, a EF
poderia propagar um erro inesperado ao pastor.

---

## Solução

### Tabela `contact_requests`

```sql
CREATE TABLE IF NOT EXISTS contact_requests (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       uuid        NOT NULL REFERENCES churches(id),
  user_id         uuid        NOT NULL REFERENCES auth.users(id),
  pastor_name     text        NOT NULL,
  pastor_email    text        NOT NULL,
  church_name     text        NOT NULL,
  plan_at_request text        NOT NULL,
  context         text        NOT NULL CHECK (context IN ('module', 'plan', 'agent')),
  target_slug     text        NOT NULL,
  origin_page     text,
  email_sent      boolean     NOT NULL DEFAULT false,
  email_sent_at   timestamptz NULL,
  email_error     text        NULL,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'contacted', 'closed')),
  notes           text        NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  contacted_at    timestamptz NULL
);
```

- RLS: `contact_requests_church_read` — pastor lê apenas da sua igreja
- RLS: `contact_requests_admin_all` — admin Ekthos acessa tudo
- Admin pode filtrar por `email_sent=false` para contato manual quando email não saiu

### Edge Function `contact-consultant` v2

Fluxo em 3 etapas garantidas:

```
STEP 1: INSERT contact_requests (email_sent=false)  ← SEMPRE
STEP 2: sendEmailViaResend()                         ← best-effort
  ├── sucesso → UPDATE email_sent=true, email_sent_at
  └── falha   → UPDATE email_error (não bloqueia pastor)
STEP 3: return 200 { success: true, request_id }     ← SEMPRE
```

**Garantias:**
- Pedido NUNCA se perde — persiste antes do email
- Pastor NUNCA vê erro — sempre 200 com mensagem amigável
- Admin vê pedidos `email_sent=false` no banco para contato manual
- `email_error` registra causa da falha para diagnóstico

---

## Migration aplicada

`supabase/migrations/20260427200000_contact_requests.sql`

Aplicada via MCP `mcp__supabase__apply_migration` no projeto `mlqjywqnchilvgkbvicd`.

---

## Validação realizada

### curl (PowerShell)

```powershell
Invoke-RestMethod -Uri "https://mlqjywqnchilvgkbvicd.supabase.co/functions/v1/contact-consultant" `
  -Method POST `
  -Headers @{ Authorization = "Bearer <anon-key>"; "Content-Type" = "application/json" } `
  -Body '{"context":"agent","target_slug":"agent-reengajamento","origin_page":"/agentes/agent-reengajamento"}'
```

**Resposta:**
```json
{
  "success": true,
  "message": "Recebemos sua mensagem, entraremos em contato em breve.",
  "request_id": "f55f0187-0a27-4ba6-ba39-4b15ff771114"
}
```

### DB (SQL)

```sql
SELECT id, pastor_name, church_name, context, target_slug,
       email_sent, email_error, status, created_at
FROM contact_requests
ORDER BY created_at DESC
LIMIT 1;
```

**Resultado:** Row confirmada com `email_sent=false`, `email_error=null`, `status=pending`.

---

## Portões

| Portão | Status | Detalhe |
|--------|--------|---------|
| P1 — Build | ✅ | `npm run build` — 0 erros, 0 warnings |
| P2 — curl test | ✅ | 200 + request_id retornado + row no banco |
| P3 — Não-regressão | ✅ | addon-request intacto; frontend sem alteração |
| P4 — Relatório | ✅ | Este documento |

---

## TODOs pendentes

| ID | Detalhe |
|----|---------|
| TODO-RESEND | Configurar `RESEND_API_KEY` nos Supabase Secrets para emails reais |
| TODO-ADMIN-VIEW | Cockpit admin: tela para ver `contact_requests` com filtro `email_sent=false` |
| TODO-STATUS | Workflow manual: admin marca `status='contacted'` ou `'closed'` após atender |

---

## PR

https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...staging?expand=1
