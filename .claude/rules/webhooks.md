# Rule: Padrão de Webhooks

> **Versão:** 1.0.0 | **Status:** Ativo — produção | **Revisão:** 2026-04-07

---

## 1. Princípio

Webhooks são contratos entre sistemas. Não são chamadas de conveniência.

Todo webhook tem dois lados: quem envia (produtor) e quem recebe (consumidor). O Ekthos opera nos dois papéis e cada papel tem regras distintas e invioláveis.

**Violações comuns que este documento previne:**
- Processar payload sem validar assinatura (risco de SSRF e injeção)
- Responder lentamente causando timeout no produtor (e reenvio duplicado)
- Não garantir idempotência (o mesmo evento processado múltiplas vezes)
- Expor webhooks sem autenticação

---

## 2. Webhooks de Entrada (o Ekthos recebe)

### 2.1 Validação de Assinatura HMAC

Todo webhook recebido DEVE ter assinatura validada antes de qualquer processamento.
Payload não validado = payload descartado. Sem exceção.

```
Sistema envia webhook → Edge Function recebe
  ↓
Valida assinatura HMAC-SHA256 (ou método específico do sistema)
  ↓ inválida → retorna 401, registra tentativa suspeita, não processa
  ↓ válida
Retorna 200 OK IMEDIATAMENTE (antes de qualquer processamento)
  ↓
Insere evento em fila (webhook_queue ou direto no n8n)
  ↓
Processamento assíncrono com idempotência via event_id
```

### 2.2 Resposta 200 Imediata

O produtor do webhook aguarda resposta por no máximo 5-30 segundos (varia por sistema).
Se o Ekthos não responder dentro do timeout, o produtor considera falha e reesenta.

**Regra absoluta:** a Edge Function retorna 200 OK imediatamente após validar a assinatura. O processamento acontece de forma assíncrona.

```typescript
// CORRETO — responde imediatamente, processa depois
serve(async (req: Request) => {
  // 1. Valida assinatura (rápido)
  const isValid = await validateHmac(req)
  if (!isValid) return new Response('Unauthorized', { status: 401 })

  // 2. Lê body e insere na fila (rápido)
  const body = await req.json()
  await supabase.from('webhook_queue').insert({
    event_id: body.id ?? crypto.randomUUID(),
    system: 'whatsapp',
    payload: body,
    received_at: new Date().toISOString(),
    status: 'pending'
  })

  // 3. Retorna 200 imediatamente
  return new Response('OK', { status: 200 })
  // processamento assíncrono acontece via n8n trigger na tabela webhook_queue
})
```

### 2.3 Processamento Assíncrono

Após o 200 OK, o processamento real ocorre:
- Via n8n (trigger na tabela `webhook_queue` via Supabase Realtime)
- Via Supabase Function invocada pelo n8n
- Com retry automático em caso de falha no processamento

### 2.4 Idempotência via event_id

Todo webhook recebido tem um identificador único fornecido pelo produtor (ex: `entry[0].id` no WhatsApp, `id` no Stripe). Este ID é a chave de idempotência.

```sql
-- Antes de processar, verifica se já foi processado
SELECT id FROM webhook_processed_events
WHERE event_id = $1 AND system = $2
LIMIT 1;

-- Se encontrou → descarta silenciosamente (já processado)
-- Se não encontrou → processa e insere o registro
INSERT INTO webhook_processed_events (event_id, system, processed_at)
VALUES ($1, $2, NOW())
ON CONFLICT (event_id, system) DO NOTHING;
```

---

## 3. Webhooks de Saída (o Ekthos envia)

### 3.1 Quando emitir

O Ekthos emite webhooks de saída em situações específicas:
- Notificação de evento para sistema externo (ex: doação confirmada → HubSpot)
- Trigger para n8n (sistema interno de automação)
- Callback para sistema do cliente após operação concluída

### 3.2 Payload padrão de saída

```typescript
interface EkthosOutboundWebhook {
  event_id: string         // UUID único — idempotência do receptor
  event_type: string       // ex: 'donation.confirmed', 'person.created'
  church_id: string        // sempre presente
  timestamp: string        // ISO 8601
  version: '1.0'           // versão do contrato
  data: Record<string, unknown>  // payload do evento
  // NUNCA inclui: tokens, senhas, chaves de API, dados sensíveis não relacionados
}
```

### 3.3 Retry com backoff

```typescript
async function sendOutboundWebhook(
  url: string,
  payload: EkthosOutboundWebhook,
  secret: string
): Promise<boolean> {
  const body = JSON.stringify(payload)
  const signature = await computeHmac(body, secret)

  const attempts = [0, 5000, 30000, 300000] // 0s, 5s, 30s, 5min

  for (const delay of attempts) {
    if (delay > 0) await new Promise(r => setTimeout(r, delay))

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Ekthos-Signature': `sha256=${signature}`,
          'X-Ekthos-Event': payload.event_type,
          'X-Request-ID': payload.event_id
        },
        body,
        signal: AbortSignal.timeout(10000)
      })

      if (response.ok) return true

      // 4xx = erro permanente, não retenta
      if (response.status >= 400 && response.status < 500) {
        await logWebhookFailure(payload, url, response.status, 'erro_fatal')
        return false
      }

    } catch {
      // continua tentando nos 5xx e timeouts
    }
  }

  // Todas as tentativas falharam
  await logWebhookFailure(payload, url, 0, 'max_tentativas_atingido')
  return false
}
```

---

## 4. Dead Letter Queue

Eventos que falham em todas as tentativas de processamento vão para a fila de dead letter.

### 4.1 Quando usar

- Webhook recebido mas processamento falhou 3x
- Webhook de saída não entregue após 4 tentativas
- Payload inválido que não pode ser parseado (mas assinatura era válida)
- Rate limit do receptor atingido (429 repetido)

### 4.2 Estrutura SQL da tabela webhook_failures

```sql
CREATE TABLE webhook_failures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID NOT NULL REFERENCES churches(id),
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  system          TEXT NOT NULL,          -- ex: 'whatsapp', 'stripe', 'hubspot'
  event_id        TEXT,                   -- ID do evento original (idempotência)
  event_type      TEXT,                   -- ex: 'donation.confirmed'
  endpoint_url    TEXT,                   -- para outbound: URL do receptor
  payload         JSONB NOT NULL,         -- payload completo do evento
  error_message   TEXT,                   -- última mensagem de erro
  attempt_count   INTEGER NOT NULL DEFAULT 1,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'reprocessing', 'resolved', 'abandoned')),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Isolamento por tenant
ALTER TABLE webhook_failures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_webhook_failures" ON webhook_failures
  USING (church_id = (SELECT church_id FROM profiles WHERE id = auth.uid()));

-- Índices para performance
CREATE INDEX idx_webhook_failures_church_id ON webhook_failures(church_id);
CREATE INDEX idx_webhook_failures_status ON webhook_failures(status) WHERE status = 'pending';
CREATE INDEX idx_webhook_failures_system ON webhook_failures(system);
CREATE INDEX idx_webhook_failures_created_at ON webhook_failures(created_at DESC);
```

### 4.3 Como reprocessar

O n8n executa um workflow de reprocessamento a cada 15 minutos:

```
n8n: webhook-dead-letter-reprocessor
  Trigger: Schedule (a cada 15 minutos)
    ↓
  SELECT * FROM webhook_failures
  WHERE status = 'pending'
    AND attempt_count < 10
    AND last_attempt_at < NOW() - INTERVAL '15 minutes'
  LIMIT 50
    ↓
  Para cada registro:
    ↓ direction = 'inbound'
    → Reenviar para Edge Function de processamento
    ↓ direction = 'outbound'
    → Reenviar para endpoint externo
    ↓
  Sucesso → status = 'resolved', resolved_at = NOW()
  Falha   → attempt_count++, last_attempt_at = NOW()
  attempt_count >= 10 → status = 'abandoned', notifica equipe
```

---

## 5. Segurança

### 5.1 Validação obrigatória

Cada sistema tem seu método de assinatura — todos devem ser implementados:

| Sistema | Método | Header | Algoritmo |
|---|---|---|---|
| WhatsApp Business API | HMAC-SHA256 | `X-Hub-Signature-256` | `sha256=<hash>` |
| Stripe | HMAC-SHA256 | `Stripe-Signature` | `t=<ts>,v1=<hash>` |
| PagSeguro | Verificação de IP + token | `X-Pagseguro-Signature` | SHA1 |
| Mercado Pago | HMAC-SHA256 | `X-Signature` | `ts=<ts>,v1=<hash>` |
| Meta (Instagram) | HMAC-SHA256 | `X-Hub-Signature-256` | `sha256=<hash>` |
| n8n (interno) | Bearer token | `Authorization` | token fixo no Vault |

### 5.2 Princípio de desconfiança

```
REGRA: Nunca confie no payload sem verificar a assinatura.
REGRA: Nunca confie no IP de origem sem verificar a assinatura.
REGRA: Nunca use dados do payload antes de validação completa.
REGRA: Nunca retorne dados sensíveis em resposta de webhook.
```

---

## 6. Tabela de Webhooks do Sistema

| Sistema | Evento | Endpoint no Ekthos | Autenticação |
|---|---|---|---|
| WhatsApp Business API | Mensagem recebida | `/functions/v1/webhook-whatsapp` | HMAC-SHA256 |
| WhatsApp Business API | Status de mensagem | `/functions/v1/webhook-whatsapp` | HMAC-SHA256 |
| Instagram Graph API | DM recebida | `/functions/v1/webhook-instagram` | HMAC-SHA256 |
| Stripe | payment_intent.succeeded | `/functions/v1/webhook-stripe` | HMAC-SHA256 |
| Stripe | payment_intent.failed | `/functions/v1/webhook-stripe` | HMAC-SHA256 |
| PagSeguro | notificação de pagamento | `/functions/v1/webhook-pagseguro` | IP + token |
| Mercado Pago | payment notification | `/functions/v1/webhook-mercadopago` | HMAC-SHA256 |
| n8n (interno) | workflow.completed | `/functions/v1/webhook-n8n` | Bearer token |
| n8n (interno) | workflow.failed | `/functions/v1/webhook-n8n` | Bearer token |

---

## 7. Regras Numeradas

```
WH-01: Nenhum webhook é processado sem validação de assinatura HMAC (ou método específico do sistema)
WH-02: A Edge Function retorna 200 OK imediatamente após validar assinatura — processamento é sempre assíncrono
WH-03: Todo webhook recebido é armazenado em webhook_queue antes de ser processado
WH-04: Idempotência é garantida via event_id — o mesmo evento nunca é processado duas vezes
WH-05: Webhooks de saída incluem X-Ekthos-Signature em toda requisição
WH-06: Retry de webhook de saída: 4 tentativas com backoff (0s, 5s, 30s, 5min)
WH-07: Erros após máximo de tentativas vão para webhook_failures com status='pending'
WH-08: O n8n reprocessa webhook_failures a cada 15 minutos para registros pending
WH-09: Após 10 tentativas sem sucesso, status muda para 'abandoned' e equipe é notificada
WH-10: Payload de webhook de saída NUNCA contém tokens, chaves de API ou dados sensíveis de outros tenants
```

---

## 8. Exemplo de Edge Function para Recepção de Webhook

Exemplo completo com validação HMAC para WhatsApp Business API:

```typescript
// supabase/functions/webhook-whatsapp/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Segredo compartilhado configurado no painel Meta para verificação do webhook
const WHATSAPP_APP_SECRET = Deno.env.get('WHATSAPP_APP_SECRET')!

async function validateWhatsAppSignature(
  rawBody: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!signatureHeader?.startsWith('sha256=')) return false

  const receivedHash = signatureHeader.replace('sha256=', '')

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(WHATSAPP_APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(rawBody)
  )

  const computedHash = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')

  // Comparação em tempo constante para prevenir timing attacks
  if (computedHash.length !== receivedHash.length) return false

  let mismatch = 0
  for (let i = 0; i < computedHash.length; i++) {
    mismatch |= computedHash.charCodeAt(i) ^ receivedHash.charCodeAt(i)
  }
  return mismatch === 0
}

async function resolveChurchIdFromPhone(phoneNumberId: string): Promise<string | null> {
  const { data } = await supabase
    .from('integrations')
    .select('church_id')
    .eq('system', 'whatsapp')
    .eq('status', 'active')
    .contains('config', { phone_number_id: phoneNumberId })
    .single()

  return data?.church_id ?? null
}

serve(async (req: Request) => {
  // Verificação de GET para setup do webhook no painel Meta
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')

    const verifyToken = Deno.env.get('WHATSAPP_VERIFY_TOKEN')
    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('Forbidden', { status: 403 })
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  // Lê o body raw para validação HMAC (deve ser feito antes de parsear JSON)
  const rawBody = await req.text()
  const signatureHeader = req.headers.get('X-Hub-Signature-256')

  // PASSO 1: Valida assinatura — rejeita imediatamente se inválida
  const isValid = await validateWhatsAppSignature(rawBody, signatureHeader)
  if (!isValid) {
    // Registra tentativa suspeita para monitoramento
    await supabase.from('audit_logs').insert({
      church_id: null,  // desconhecido neste ponto
      action: 'webhook.whatsapp.signature_invalid',
      actor: 'system',
      metadata: {
        ip: req.headers.get('CF-Connecting-IP') ?? 'desconhecido',
        signature_received: signatureHeader
      },
      severity: 'warning',
      created_at: new Date().toISOString()
    })
    return new Response('Unauthorized', { status: 401 })
  }

  // PASSO 2: Parseia o JSON após validação
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response('Bad Request', { status: 400 })
  }

  // PASSO 3: Extrai phone_number_id para identificar o tenant
  const entry = (payload.entry as Array<{ changes: Array<{ value: { metadata: { phone_number_id: string } } }> }>)?.[0]
  const phoneNumberId = entry?.changes?.[0]?.value?.metadata?.phone_number_id

  let church_id: string | null = null
  if (phoneNumberId) {
    church_id = await resolveChurchIdFromPhone(phoneNumberId)
  }

  // PASSO 4: Gera event_id para idempotência
  const eventId = (payload.entry as Array<{ id: string }>)?.[0]?.id ?? crypto.randomUUID()

  // PASSO 5: Verifica idempotência — descarta se já processado
  const { data: existingEvent } = await supabase
    .from('webhook_processed_events')
    .select('id')
    .eq('event_id', eventId)
    .eq('system', 'whatsapp')
    .single()

  if (existingEvent) {
    // Já processado — retorna 200 para evitar reenvio do produtor
    return new Response('OK', { status: 200 })
  }

  // PASSO 6: Insere na fila para processamento assíncrono
  await supabase.from('webhook_queue').insert({
    event_id: eventId,
    church_id,  // pode ser null se não identificou o tenant ainda
    system: 'whatsapp',
    payload,
    received_at: new Date().toISOString(),
    status: 'pending'
  })

  // Marca como recebido (não ainda processado)
  await supabase.from('webhook_processed_events').insert({
    event_id: eventId,
    system: 'whatsapp',
    received_at: new Date().toISOString()
  })

  // PASSO 7: Retorna 200 imediatamente — processamento ocorre via n8n
  return new Response('OK', { status: 200 })
})
```

---

## 9. Estrutura SQL da Tabela webhook_failures

```sql
-- Tabela principal de dead letter queue
CREATE TABLE webhook_failures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id       UUID REFERENCES churches(id),  -- pode ser null para inbound não identificado
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  system          TEXT NOT NULL,
  event_id        TEXT,
  event_type      TEXT,
  endpoint_url    TEXT,
  payload         JSONB NOT NULL,
  error_message   TEXT,
  http_status     INTEGER,
  attempt_count   INTEGER NOT NULL DEFAULT 1,
  next_retry_at   TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'reprocessing', 'resolved', 'abandoned')),
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES profiles(id),
  resolution_note TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE webhook_failures ENABLE ROW LEVEL SECURITY;

-- Admins da plataforma veem todos; usuários do tenant veem apenas os seus
CREATE POLICY "webhook_failures_tenant_isolation" ON webhook_failures
  USING (
    church_id IS NULL  -- entradas sem tenant (admins globais)
    OR church_id = (SELECT church_id FROM profiles WHERE id = auth.uid())
  );

-- Tabela de eventos já processados (idempotência)
CREATE TABLE webhook_processed_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     TEXT NOT NULL,
  system       TEXT NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ,
  UNIQUE (event_id, system)
);

-- Sem RLS — acesso apenas via service role (Edge Functions)
-- Limpa automaticamente eventos com mais de 30 dias
CREATE INDEX idx_webhook_processed_cleanup ON webhook_processed_events(received_at)
WHERE received_at < NOW() - INTERVAL '30 days';

-- Tabela de fila de webhooks recebidos (processamento assíncrono)
CREATE TABLE webhook_queue (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    TEXT,
  church_id   UUID REFERENCES churches(id),
  system      TEXT NOT NULL,
  payload     JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status      TEXT NOT NULL DEFAULT 'pending'
              CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  processed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX idx_webhook_queue_pending ON webhook_queue(received_at)
WHERE status = 'pending';
```
