# Acolhimento Automático Multicanal

> ~~Feature futura de alto impacto. Atualmente não existe nenhuma base técnica para isso.~~
>
> **⚠️ NOTA DE STATUS (2026-05-28):** Este documento foi originalmente escrito descrevendo
> o acolhimento automático como "feature futura". Esse cenário mudou completamente.
>
> **O ACOLHIMENTO AUTOMÁTICO ESTÁ IMPLEMENTADO E PROVADO EM PRODUÇÃO (staging).**
>
> Felipe confirmou recebimento de WhatsApp e email de boas-vindas no teste E2E de 2026-05-28.
> Ver `docs/debts.md` → seção "ACOLHIMENTO AUTOMÁTICO — PR-1/PR-2/PR-3/PR-4 + send-welcome-email".

---

## Status de implementação

| Componente | Status | Detalhe |
|---|---|---|
| `dispatch-person-event` EF | ✅ ATIVO (v29) | Cria journey + dispara email fire-and-forget |
| `agent-acolhimento` EF | ✅ ATIVO (v28) | Claude Haiku — gera mensagem pastoral personalizada |
| `send-welcome-email` EF | ✅ ATIVO (v1) | Google SMTP, HTML pastoral, denomailer@1.6.0 |
| `channel-dispatcher` EF | ✅ ATIVO (v31) | Z-API / WhatsApp delivery, 1 min cron |
| Jornada D+0 (2h delay) | ✅ ATIVO | Cria registro, espera 2h, dispara mensagem |
| Jornada D+3 | ✅ ATIVO | Agendado automaticamente após D+0 |
| Path A — QR Code (`visitor-capture`) | ✅ COBERTO | dispatch-person-event chamado ao criar pessoa |
| Path C1 — WhatsApp inbound (`whatsapp-webhook`) | ✅ COBERTO | Nova pessoa detectada via created_at <30s |
| Path C2 — ChatPro webhook (`webhook-receiver`) | ✅ COBERTO | INSERT nova pessoa dispara dispatch fire-and-forget |
| Multi-tenant isolation | ✅ PROVADO | church_id sempre derivado do DB, nunca do request |

---

## Prova E2E (2026-05-28)

**Número WhatsApp:** `+55 21 96648-7878` (Felipe Abrantes)  
**Email:** `felipeabrantess@gmail.com`  
**Church:** Mock `62e473b8-cd39-4da2-aa5d-c296b03d6873`

**Resultado:**
- WhatsApp entregue: `message_id: 3EB08341FDF8BA2EA06035` (Z-API) às 17:31 UTC
- Email entregue: SMTP 250 OK (5.4s execução) — Google SMTP TLS
- CRM atualizado: `conversations.last_message_at: 2026-05-28 17:30:06`
- Jornada avançou: D+0 → D+3 agendado para 2026-05-31 17:30 UTC
- Felipe confirmou recebimento dos 2 canais

---

## Arquitetura implementada

```
Novo visitante (qualquer path)
    ↓
dispatch-person-event (EF)
    ├─ Cria acolhimento_journey (D+0, next_touchpoint_at = NOW()+2h)
    ├─ Dispara send-welcome-email fire-and-forget (se person.email)
    └─ Verifica elegibilidade n8n (source, bulk_import, settings)

pg_cron (1 min) → agent-acolhimento (EF)
    └─ Busca journeys com next_touchpoint_at <= NOW() e status=pending
       ├─ Chama Claude Haiku (claude-haiku-4-5-20251001)
       ├─ Gera mensagem pastoral personalizada
       ├─ Insere em channel_dispatch_queue
       └─ Avança touchpoint (D+0 → D+3 → D+7 → ... → D+90)

pg_cron (1 min) → channel-dispatcher (EF)
    └─ Processa channel_dispatch_queue pendentes
       └─ Envia via Z-API → WhatsApp entregue
```

---

## Débitos remanescentes

- **BATCH_SIZE=10 sem fairness:** Starvation risk em >10 igrejas simultâneas. Fix: `ORDER BY RANDOM()` ou fila por church_id.
- **`source` ausente em `conversations`:** Pastor não distingue proativo vs inbound. Coluna `source text` sugerida.
- **trigger_n8n_pipeline drift:** Correção feita diretamente no DB sem migration git. Criar migration de captura.
- **EVE — 6 EFs ainda com `inviteUserByEmail`:** Migrar para `_shared/email/` + generateLink + SMTP (PR-B pendente).

---

## O que esta feature NÃO é

Este documento descreve o **acolhimento automático de visitantes** (journey D+0→D+90 via WhatsApp + email).

O conceito original de "onboarding automatizado" descrevia um fluxo diferente:
- Pastor responde 25 perguntas numa conversa natural
- Agente executa 23 steps para configurar o CRM do zero em 28 segundos

Esse fluxo (onboarding de pastor novo, não de visitante) permanece como feature futura.
Depende de: runtime de agente conversacional multi-step, JSON builder de configuração,
executor SSE com progresso em tempo real.
