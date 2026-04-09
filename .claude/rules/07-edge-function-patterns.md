# Regra: Padrões de Edge Functions

## Runtime
- Deno — nunca Node.js
- Imports via path relativo (.ts) ou URL — nunca npm install
- Variáveis de ambiente: Deno.env.get('NOME') — nunca process.env

## Utilitários compartilhados (nunca duplicar)
supabase/functions/_shared/supabase-client.ts → cliente service_role
supabase/functions/_shared/tenant-loader.ts   → resolução de tenant
supabase/functions/_shared/whatsapp-api.ts    → WhatsApp Business API

## Padrão obrigatório para webhooks
1. Validar assinatura HMAC antes de ler qualquer dado do payload
2. Responder 200 imediatamente — processamento ocorre de forma assíncrona
3. Resolver churchId a partir do identificador externo antes de qualquer
   operação no banco
4. Usar service_role para todas as operações (bypass intencional de RLS)

## Deduplicação
Capturar código de erro 23505 (unique constraint) na tabela interactions.
Mensagem duplicada → log e return sem erro.

## Fetch interno
Todo fetch para outra Edge Function usa:
  AbortSignal.timeout(30_000)
Nunca fazer fetch interno sem timeout.

## Proibido
- Nunca expor service_role key em logs
- Nunca processar payload antes de validar HMAC
- Nunca fazer operação de banco sem ter resolvido o churchId
