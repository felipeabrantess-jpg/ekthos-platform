# Rule: Integração de APIs Externas

> **Versão:** 1.0.0 | **Status:** Ativo — produção | **Revisão:** 2026-04-07

---

## 1. Princípio

Toda integração com sistema externo é uma decisão arquitetural — não uma tarefa de código.

Antes de qualquer integração ser implementada, o `ekthos-chief-architect` deve ser invocado no modo INTEGRATE:

```
/architect MODO=INTEGRATE "nome do sistema e finalidade"
```

O output do arquiteto é obrigatório. Se STATUS = BLOQUEADO, a integração não acontece.

Razão: integrações introduzem superfície de ataque, custo variável, dependência externa e risco de vazamento de dados entre tenants. Nenhuma integração é trivial.

---

## 2. Quando usar API direta vs Edge Function

A decisão segue uma regra binária sem exceções:

| Cenário | Abordagem correta | Motivo |
|---|---|---|
| Chamada com credencial secreta | Edge Function obrigatória | Credencial nunca vai ao cliente |
| Webhook recebido externamente | Edge Function obrigatória | Validação de assinatura no servidor |
| Leitura de dado público (ex: CEP) | Edge Function recomendada | Evita exposição da origem |
| Sync assíncrono em background | n8n Workflow + Edge Function | Tolerância a falha, retry nativo |
| Polling periódico de API externa | n8n Workflow com schedule | Não bloqueia requisição principal |

**Regra simples:** se a chamada envolve credencial, ela nunca sai do servidor. Sem exceção.

**Exemplo de anti-padrão (NUNCA fazer):**
```typescript
// ERRADO — credencial no cliente
const response = await fetch('https://api.externa.com/dados', {
  headers: { 'Authorization': `Bearer ${process.env.API_KEY}` }
})
```

**Padrão correto:**
```typescript
// CORRETO — Edge Function chama a API externa
// O cliente só chama a Edge Function (autenticada via JWT)
const { data } = await supabase.functions.invoke('integration-nome-sistema', {
  body: { church_id, payload }
})
```

---

## 3. Armazenamento de Credenciais

### Hierarquia obrigatória

```
Supabase Vault (única fonte de verdade para secrets)
    ↓
Edge Function (lê do Vault em runtime)
    ↓
n8n (acessa via referência de credencial — nunca hard-coded)
    ↓
Agente/Skill (recebe dado já processado, nunca o secret)
    ↓
Frontend/Cliente → JAMAIS recebe credencial
```

### Como referenciar no Vault

Toda credencial é armazenada com uma chave padronizada:

```
{church_id}_{sistema}_{tipo}

Exemplos:
  uuid-001_whatsapp_token
  uuid-001_stripe_secret_key
  uuid-002_hubspot_api_key
  plataforma_anthropic_api_key    ← credencial global (sem church_id)
```

### Como acessar na Edge Function

```typescript
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

async function getSecret(key: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_secret', { secret_name: key })
  if (error || !data) throw new Error(`Secret não encontrado: ${key}`)
  return data
}

// Uso
const whatsappToken = await getSecret(`${church_id}_whatsapp_token`)
```

---

## 4. Padrão de Requisição

### Headers obrigatórios em toda chamada de saída

```typescript
const headers: HeadersInit = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${apiToken}`,
  'X-Request-ID': crypto.randomUUID(),     // rastreamento
  'X-Tenant-ID': church_id,               // identificação do originador
  'User-Agent': 'Ekthos-Platform/2.0'     // identificação do sistema
}
```

### Timeout e Retry com Exponential Backoff

```typescript
interface RetryConfig {
  maxAttempts: number    // padrão: 3
  baseDelayMs: number    // padrão: 1000ms
  maxDelayMs: number     // padrão: 30000ms
  retryableStatuses: number[]  // [429, 500, 502, 503, 504]
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  config: RetryConfig = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 30000, retryableStatuses: [429, 500, 502, 503, 504] }
): Promise<Response> {
  let lastError: Error | null = null

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // timeout 15s

    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      clearTimeout(timeout)

      if (!config.retryableStatuses.includes(response.status)) {
        return response  // sucesso ou erro fatal — não retenta
      }

      // erro retentável — calcula delay com jitter
      const delay = Math.min(
        config.baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 500,
        config.maxDelayMs
      )
      await new Promise(resolve => setTimeout(resolve, delay))

    } catch (error) {
      clearTimeout(timeout)
      lastError = error as Error
      if (attempt === config.maxAttempts) throw lastError
    }
  }

  throw lastError ?? new Error('Máximo de tentativas atingido')
}
```

---

## 5. Mapeamento de Dados

Todo dado recebido de sistema externo DEVE ser mapeado para o schema Ekthos antes de ser persistido. Nunca persiste estrutura externa diretamente.

### Regra de mapeamento

```typescript
// ERRADO — persiste estrutura do HubSpot diretamente
await supabase.from('people').insert(hubspotContact)

// CORRETO — mapeia para schema Ekthos
function mapHubSpotToEkthos(
  contact: HubSpotContact,
  church_id: string
): Partial<Person> {
  return {
    church_id,                                        // obrigatório sempre
    name: contact.properties.firstname + ' ' + contact.properties.lastname,
    email: contact.properties.email ?? null,
    phone: normalizePhone(contact.properties.phone),  // normaliza formato
    tags: ['origem:hubspot', `hubspot_id:${contact.id}`],
    external_ids: { hubspot: contact.id },            // referência cruzada
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}
```

### Campos de referência cruzada

Toda entidade sincronizada com sistema externo deve ter um campo `external_ids` em JSONB:

```json
{
  "hubspot": "contact-12345",
  "rd_station": "lead-67890"
}
```

---

## 6. Tratamento de Erros

### Categorias de erro e comportamento

| Categoria | Exemplos de status | Comportamento |
|---|---|---|
| **Retryable** | 429, 500, 502, 503, 504 | Retry com exponential backoff |
| **Fatal** | 400, 401, 403, 404 | Falha imediata, log de erro, notifica equipe |
| **Degradado** | Timeout, DNS failure | Retry 3x, depois coloca em dead letter queue |

### Estrutura de erro padronizada

```typescript
interface IntegrationError {
  code: string              // ex: 'WHATSAPP_AUTH_FAILED'
  message: string           // mensagem legível
  system: string            // ex: 'whatsapp', 'stripe'
  church_id: string         // tenant afetado
  retryable: boolean
  timestamp: string
  raw_response?: unknown    // payload original da API externa (sem secrets)
}
```

### O que fazer em cada caso

**Erro Fatal (401, 403):**
```
1. Loga em audit_logs com severity='error'
2. Notifica equipe Ekthos via webhook de monitoramento
3. Desativa integração do tenant até resolução manual
4. Retorna erro estruturado para o chamador
```

**Erro Retryable (429, 5xx):**
```
1. Aplica exponential backoff
2. Após 3 tentativas → coloca em webhook_failures
3. n8n processa dead letter queue periodicamente
4. Notifica somente se falhar por mais de 1 hora
```

**Degradado (timeout):**
```
1. Registra em webhook_failures com tentativa=1
2. n8n reagenda para 5 minutos depois
3. Se falhar 3 vezes → notifica equipe
```

---

## 7. Rate Limiting

### Por tenant (aplicado na Edge Function)

```typescript
// Checa rate limit antes de chamar API externa
async function checkRateLimit(
  church_id: string,
  system: string,
  limitPerMinute: number
): Promise<boolean> {
  const key = `rate_limit:${church_id}:${system}`
  const windowStart = Math.floor(Date.now() / 60000) * 60000

  const { data: count } = await supabase
    .from('rate_limit_counters')
    .select('count')
    .eq('key', key)
    .eq('window_start', new Date(windowStart).toISOString())
    .single()

  return (count?.count ?? 0) < limitPerMinute
}
```

### Limites por sistema (padrão — ajustável por tenant)

| Sistema | Limite padrão | Janela |
|---|---|---|
| WhatsApp Business API | 80 mensagens | por segundo |
| Instagram Graph API | 200 chamadas | por hora |
| Stripe | 100 requisições | por segundo |
| PagSeguro | 20 requisições | por segundo |
| HubSpot | 100 requisições | por 10 segundos |
| Gemini / OpenAI | configurável por plano | por minuto |

### Throttle para envio em massa

Campanhas em massa NUNCA disparam todas as mensagens ao mesmo tempo.
O n8n divide em batches com delay entre eles:

```
Configuração padrão de campanha:
  batch_size: 50 mensagens
  delay_entre_batches: 1000ms
  max_concurrent_tenants: 5
```

---

## 8. Tabela de Integrações Conhecidas

| Sistema | Autenticação | Endpoint base | Onde persiste no Ekthos |
|---|---|---|---|
| WhatsApp Business API | Bearer token (no Vault) | `https://graph.facebook.com/v18.0/` | interactions, people |
| Instagram Graph API | OAuth token (no Vault) | `https://graph.instagram.com/v18.0/` | interactions, people |
| Meta Ads API | Bearer token (no Vault) | `https://graph.facebook.com/v18.0/act_{id}/` | campaigns |
| Stripe | Secret key (no Vault) | `https://api.stripe.com/v1/` | donations |
| PagSeguro | Token (no Vault) | `https://api.pagseguro.com/` | donations |
| Mercado Pago | Access token (no Vault) | `https://api.mercadopago.com/v1/` | donations |
| HubSpot | API key / OAuth (no Vault) | `https://api.hubapi.com/crm/v3/` | people, interactions |
| RD Station | Access token (no Vault) | `https://api.rd.services/` | people |
| Salesforce | OAuth (no Vault) | instância específica por tenant | people, interactions |
| SendGrid | API key (no Vault) | `https://api.sendgrid.com/v3/` | interactions |
| Anthropic Claude | API key (no Vault) | `https://api.anthropic.com/v1/` | não persiste resposta bruta |
| OpenAI | API key (no Vault) | `https://api.openai.com/v1/` | não persiste resposta bruta |
| n8n (self-hosted) | Webhook token (no Vault) | configurável por deploy | audit_logs |

---

## 9. Regras Numeradas

```
API-01: Toda integração passa pelo ekthos-chief-architect (MODO=INTEGRATE) antes de ser implementada
API-02: Credenciais externas vivem APENAS no Supabase Vault — nunca em variáveis de ambiente do cliente
API-03: Toda chamada de API externa passa por Edge Function — nunca diretamente do frontend
API-04: Dado externo é mapeado para schema Ekthos antes de qualquer persistência
API-05: Toda requisição de saída inclui X-Request-ID para rastreamento
API-06: Timeout máximo de 15 segundos por chamada individual de API
API-07: Retry com exponential backoff para erros retryable (máximo 3 tentativas)
API-08: Erros fatais (401, 403) desativam a integração e notificam equipe imediatamente
API-09: Rate limiting é aplicado por tenant e por sistema antes de toda chamada em massa
API-10: Erros e tentativas de retry são registrados em webhook_failures, não apenas em logs
API-11: Integrações síncronas têm timeout de 15s; integrações assíncronas vão para n8n
API-12: Toda entrada de integração na tabela integrations contém church_id, sistema, status e timestamp
```

---

## 10. Exemplo de Edge Function de Integração

Exemplo completo de Edge Function para integração com HubSpot — sincronização de contatos.

```typescript
// supabase/functions/integration-hubspot-sync/index.ts

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

interface SyncRequest {
  church_id: string
  trace_id: string
  since?: string  // ISO timestamp — sincroniza apenas contatos atualizados desde
}

interface HubSpotContact {
  id: string
  properties: {
    firstname?: string
    lastname?: string
    email?: string
    phone?: string
    hs_lead_status?: string
    lastmodifieddate?: string
  }
}

interface Person {
  church_id: string
  name: string
  email: string | null
  phone: string | null
  tags: string[]
  external_ids: Record<string, string>
  created_at: string
  updated_at: string
}

async function getSecret(key: string): Promise<string> {
  const { data, error } = await supabase.rpc('get_secret', { secret_name: key })
  if (error || !data) throw new Error(`Secret não encontrado: ${key}`)
  return data as string
}

function normalizePhone(phone: string | undefined): string | null {
  if (!phone) return null
  return phone.replace(/\D/g, '').replace(/^0/, '+55')
}

function mapHubSpotToEkthos(contact: HubSpotContact, church_id: string): Person {
  return {
    church_id,
    name: [contact.properties.firstname, contact.properties.lastname]
      .filter(Boolean)
      .join(' ')
      .trim() || 'Sem nome',
    email: contact.properties.email ?? null,
    phone: normalizePhone(contact.properties.phone),
    tags: ['origem:hubspot'],
    external_ids: { hubspot: contact.id },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
}

async function fetchHubSpotContacts(
  apiKey: string,
  since?: string
): Promise<HubSpotContact[]> {
  const filter = since
    ? { filterGroups: [{ filters: [{ propertyName: 'lastmodifieddate', operator: 'GTE', value: since }] }] }
    : {}

  const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'X-Request-ID': crypto.randomUUID()
    },
    body: JSON.stringify({
      ...filter,
      properties: ['firstname', 'lastname', 'email', 'phone', 'hs_lead_status', 'lastmodifieddate'],
      limit: 100
    }),
    signal: AbortSignal.timeout(15000)
  })

  if (response.status === 401 || response.status === 403) {
    throw new Error(`HUBSPOT_AUTH_FAILED:${response.status}`)
  }

  if (!response.ok) {
    throw new Error(`HUBSPOT_API_ERROR:${response.status}`)
  }

  const data = await response.json()
  return data.results as HubSpotContact[]
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405 })
  }

  // Valida JWT do chamador
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 })
  }

  let body: SyncRequest
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Payload inválido' }), { status: 400 })
  }

  const { church_id, trace_id, since } = body

  if (!church_id || !trace_id) {
    return new Response(JSON.stringify({ error: 'church_id e trace_id são obrigatórios' }), { status: 400 })
  }

  // Verifica se a integração está ativa para o tenant
  const { data: integration, error: integrationError } = await supabase
    .from('integrations')
    .select('status, config')
    .eq('church_id', church_id)
    .eq('system', 'hubspot')
    .eq('status', 'active')
    .single()

  if (integrationError || !integration) {
    return new Response(JSON.stringify({ error: 'Integração HubSpot não configurada ou inativa' }), { status: 404 })
  }

  try {
    // Lê credencial do Vault
    const apiKey = await getSecret(`${church_id}_hubspot_api_key`)

    // Busca contatos no HubSpot
    const contacts = await fetchHubSpotContacts(apiKey, since)

    let inserted = 0
    let updated = 0
    const errors: string[] = []

    for (const contact of contacts) {
      const person = mapHubSpotToEkthos(contact, church_id)

      // Upsert por external_id para idempotência
      const { error: upsertError } = await supabase
        .from('people')
        .upsert(
          { ...person },
          { onConflict: 'church_id,external_ids->hubspot', ignoreDuplicates: false }
        )

      if (upsertError) {
        errors.push(`Contato ${contact.id}: ${upsertError.message}`)
      } else {
        if (contact.properties.lastmodifieddate && since &&
            contact.properties.lastmodifieddate > since) {
          updated++
        } else {
          inserted++
        }
      }
    }

    // Registra em audit_logs
    await supabase.from('audit_logs').insert({
      church_id,
      action: 'integration.hubspot.sync',
      actor: 'system',
      trace_id,
      metadata: {
        contacts_fetched: contacts.length,
        inserted,
        updated,
        errors: errors.length > 0 ? errors : undefined
      },
      created_at: new Date().toISOString()
    })

    return new Response(JSON.stringify({
      success: true,
      contacts_fetched: contacts.length,
      inserted,
      updated,
      errors: errors.length > 0 ? errors : undefined
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  } catch (error) {
    const err = error as Error

    // Desativa integração se autenticação falhou
    if (err.message.startsWith('HUBSPOT_AUTH_FAILED')) {
      await supabase
        .from('integrations')
        .update({ status: 'error', error_message: 'Credenciais inválidas — reconfigurar' })
        .eq('church_id', church_id)
        .eq('system', 'hubspot')
    }

    // Registra falha em audit_logs
    await supabase.from('audit_logs').insert({
      church_id,
      action: 'integration.hubspot.sync.failed',
      actor: 'system',
      trace_id,
      metadata: { error: err.message },
      severity: 'error',
      created_at: new Date().toISOString()
    })

    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
})
```
