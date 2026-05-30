# Auditoria: CORS nas Edge Functions — SA-B7 MEGA-ONDA SEGURANÇA
**Data:** 2026-05-30 | **Analista:** SA-B7 (subagente)

## Status Final

| EF | Problema | Fix Aplicado | Status |
|---|---|---|---|
| admin-agent-grant | Refletia qualquer origin | Whitelist 4 origens | ✅ CORRIGIDO |
| admin-church-detail | Refletia qualquer origin | Whitelist 4 origens | ✅ CORRIGIDO |
| lead-capture | Faltava ekthosai.net/.net | Adicionado ekthosai.net | ✅ CORRIGIDO |
| test-whatsapp-message | OPTIONS retornava 200+JSON | OPTIONS retorna 204 vazio | ✅ CORRIGIDO |
| stripe-checkout | — | BLINDADO | 🔒 |
| webhook-receiver | — | BLINDADO | 🔒 |
| conversation-handoff | — | BLINDADO | 🔒 |

## Whitelist Aplicada (admin-agent-grant, admin-church-detail)

```typescript
const ALLOWED_ORIGINS = [
  'https://ekthos-platform.vercel.app',
  'https://ekthosai.com',
  'https://www.ekthosai.com',
  'https://app.ekthosai.com',
]

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  }
}
```

## EFs Internas (sem CORS necessário)
agent-acolhimento, agent-reengajamento, conversation-router, channel-dispatcher, webhook-receiver, stripe-webhook, whatsapp-webhook, dispatch-message, batch-resolve.
