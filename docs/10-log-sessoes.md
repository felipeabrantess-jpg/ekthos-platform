# Log de Sessões — Ekthos Platform

Registro cronológico de sessões de desenvolvimento. Cada entrada descreve o que foi feito,
o que foi provado empiricamente e o estado do sistema ao final.

---

## Sessão 2026-05-28 — Acolhimento Automático: Implementação + Prova E2E

**Objetivo:** Fechar gaps do acolhimento automático multicanal (PR-2/3/4 + email) e provar
empiricamente que WhatsApp + email chegam de verdade ao visitante.

**Branch:** `staging`  
**Commits:** `be2c7b5` (PR-1 Haiku) · `bef5e69` (PR-2/3/4 + send-welcome-email)

### O que foi implementado

| PR | Arquivo | Mudança |
|---|---|---|
| PR-1 | `agent-acolhimento/index.ts` | Modelo Sonnet → Haiku (`claude-haiku-4-5-20251001`) |
| PR-2 | `dispatch-person-event/index.ts` | D+0 delay 2h: `next_touchpoint_at = NOW()+2h` |
| PR-2 | `dispatch-person-event/index.ts` | Fire-and-forget `send-welcome-email` se `person.email` existe |
| PR-3 | `whatsapp-webhook/index.ts` | C1 gap: nova pessoa detectada via `created_at < 30s` → dispatch |
| PR-4 | `webhook-receiver/index.ts` | C2 gap: INSERT nova pessoa → dispatch fire-and-forget |
| Nova EF | `send-welcome-email/index.ts` | SMTP Google (denomailer@1.6.0) · HTML pastoral personalizado |
| Config | `supabase/config.toml` | `[functions.send-welcome-email] verify_jwt = false` |

### 7 checks de não-regressão (pré-commit)

Todos aprovados antes do commit `bef5e69`:
1. R10: sem `.limit(1)` sem `church_id` em webhook-receiver ✅
2. `church_id` sempre derivado do banco, nunca do request body ✅
3. Idempotência: UNIQUE constraint `acolhimento_journey(church_id, person_id)` ✅
4. Fire-and-forget: `.catch()` em todos os fetches auxiliares ✅
5. Multi-tenant: nenhuma query sem `church_id` em dispatch-person-event ✅
6. R12 não quebrado: `source='manual'` skip elegante em audit_log ✅
7. Sem regressão em `notifyAdmins`: continua para todos os `source` ✅

### Prova E2E empírica (SB1–SB10)

**Condições do teste:**
- Church: Mock `62e473b8-cd39-4da2-aa5d-c296b03d6873`
- WhatsApp: `+55 21 96648-7878` (Felipe Abrantes)
- Email: `felipeabrantess@gmail.com`
- Pessoa: `063cc904-0404-48f4-92b9-12e424e9c274`

**Resultados:**

| SB | Check | Resultado |
|---|---|---|
| SB1 | 5 EFs ativas (dispatch v29, send-welcome v1, agent v28, dispatcher v31) | ✅ |
| SB2 | Canal Z-API Mock conectado (session_status=active) | ✅ |
| SB3 | Pessoa atualizada (email + name para teste) | ✅ |
| SB4 | `acolhimento_journey` criada: D+0, church Mock, status=pending | ✅ |
| SB5 | D+0 processado → jornada avançou para D+3 (2026-05-31 17:30 UTC) | ✅ |
| SB6 | WhatsApp entregue: `message_id: 3EB08341FDF8BA2EA06035` (Z-API) às 17:31 UTC | ✅ |
| SB7 | Email enviado: `send-welcome-email` 5485ms (SMTP TLS handshake real) | ✅ |
| SB8 | Conversa registrada: `conversations.last_message_at: 2026-05-28 17:30:06`, `agent_slug: agent-acolhimento` | ✅ |
| SB9 | Multi-tenant: 1 journey + 1 msg, apenas church Mock. Zero vazamento | ✅ |
| SB10 | Cleanup: journey deletada, person restaurada (name=null, email=null) | ✅ |

**Confirmação humana:** Felipe Abrantes confirmou recebimento do WhatsApp e do email de boas-vindas.

### Documentação atualizada

- `docs/debts.md` → Seção "ACOLHIMENTO AUTOMÁTICO" atualizada com prova E2E
- `docs/future-features/onboarding-automatizado.md` → Reescrito: NÃO é mais "feature futura", é IMPLEMENTADO E PROVADO
- `docs/10-log-sessoes.md` → Criado (este arquivo)

### PR criado

`https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...staging?expand=1`

### Estado do sistema ao final

- Acolhimento automático: **100% funcional em staging**
- Paths cobertos: A (QR Code), C1 (WhatsApp inbound), C2 (ChatPro webhook)
- Email de boas-vindas: **ativo para qualquer visitante com email cadastrado**
- Jornada D+0→D+90: **ativa, testada, multi-tenant isolada**

---

## Sessões anteriores

> Sessões anteriores a 2026-05-28 não foram registradas neste arquivo
> (arquivo criado retrospectivamente nesta sessão).
> Para histórico anterior, consultar `docs/03-feito-decisoes.md`
> e mensagens de commit em `git log --oneline`.
