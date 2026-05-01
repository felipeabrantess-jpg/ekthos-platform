// ============================================================
// Shared: anthropic-client.ts
// Factory do cliente Anthropic com:
//   - Seleção de modelo (Haiku padrão, Sonnet para agentes premium)
//   - Prompt caching (cache_control: ephemeral)
//   - Batch API helpers (50% custo vs síncrono)
//   - Estimativa de custo
//
// Sprint 2 — 01/05/2026: Sonnet habilitado para agentes premium pastorais
//   Modelo Sonnet atual: claude-sonnet-4-6 (validado em docs.anthropic.com)
// ============================================================

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

// ── Modelos ────────────────────────────────────────────────
// Haiku:  agentes internos (suporte, onboarding, cadastro, config) — custo mínimo
// Sonnet: agentes premium pastorais (acolhimento, operacao, reengajamento) — qualidade pastoral

export const MODELS = {
  haiku:        'claude-haiku-4-5-20251001',      // primary — agentes internos
  haiku_legacy: 'claude-3-5-haiku-20241022',      // DEPRECATED — não usar
  sonnet:       'claude-sonnet-4-6',              // agentes premium pastorais (Sprint 2+)
} as const

export type ModelTier = keyof typeof MODELS

// ── Cliente singleton ──────────────────────────────────────

let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('[anthropic-client] ANTHROPIC_API_KEY não configurada')
    }
    _client = new Anthropic({ apiKey: ANTHROPIC_API_KEY })
  }
  return _client
}

// ── Prompt caching ─────────────────────────────────────────
// Cacheia o system prompt por 5 minutos.
// Chamadas subsequentes dentro do cache window pagam apenas 10% do input.
// Formato exigido pelo Anthropic para ativar caching.

export type CachedSystemBlock = {
  type:          'text'
  text:          string
  cache_control: { type: 'ephemeral' }
}

export function cachedSystem(text: string): CachedSystemBlock[] {
  return [{
    type:          'text',
    text,
    cache_control: { type: 'ephemeral' },
  }]
}

// ── Estimativa de custo em centavos de USD ─────────────────
// Preços por 1K tokens. Cache read = 10% do input normal.
// Cache creation = 125% do input normal (amortizado em chamadas futuras).

const PRICING: Record<
  'haiku' | 'haiku_legacy' | 'sonnet',
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  haiku:        { input: 0.00025, output: 0.00125, cacheRead: 0.000025, cacheWrite: 0.0003125 },
  haiku_legacy: { input: 0.00025, output: 0.00125, cacheRead: 0.000025, cacheWrite: 0.0003125 },
  sonnet:       { input: 0.003,   output: 0.015,   cacheRead: 0.0003,   cacheWrite: 0.00375   },  // claude-sonnet-4-6
}

export function estimateCostCents(
  model: ModelTier,
  inputTokens:         number,
  outputTokens:        number,
  cacheReadTokens?:    number,
  cacheCreationTokens?: number,
): number {
  const p = PRICING[model]
  return Math.round(
    (inputTokens          / 1000) * p.input     * 100 +
    (outputTokens         / 1000) * p.output    * 100 +
    ((cacheReadTokens    ?? 0) / 1000) * p.cacheRead  * 100 +
    ((cacheCreationTokens ?? 0) / 1000) * p.cacheWrite * 100,
  )
}

// ── SSE helpers ────────────────────────────────────────────

export function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type':  'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection':    'keep-alive',
}

// ── Batch API ──────────────────────────────────────────────
// Custo: 50% do preço normal.
// Processamento: minutos a 24h (na prática ~5min para Haiku).
// Usar em agentes chamados por cron (não interativos em tempo real).

const BATCH_API = 'https://api.anthropic.com/v1/messages/batches'
const BATCH_HEADERS = {
  'x-api-key':        ANTHROPIC_API_KEY,
  'anthropic-version': '2023-06-01',
  'anthropic-beta':   'message-batches-2024-09-24',
  'content-type':     'application/json',
}

export interface BatchRequest {
  customId:   string
  model:      ModelTier
  maxTokens:  number
  system:     string          // plain text — wrapping em cache_control é feito aqui
  userMessage: string
}

export interface BatchSubmitResult {
  id:                string
  processing_status: 'validating' | 'in_progress' | 'ended' | 'canceling' | 'canceled'
  request_counts:    { processing: number; succeeded: number; errored: number; canceled: number; expired: number }
  created_at:        string
}

export interface BatchResultItem {
  custom_id: string
  result: {
    type:     'succeeded' | 'errored' | 'canceled' | 'expired'
    message?: {
      content: Array<{ type: string; text: string }>
      usage:   { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
    }
    error?: { type: string; message: string }
  }
}

export async function submitBatch(requests: BatchRequest[]): Promise<BatchSubmitResult> {
  const res = await fetch(BATCH_API, {
    method:  'POST',
    headers: BATCH_HEADERS,
    body: JSON.stringify({
      requests: requests.map(r => ({
        custom_id: r.customId,
        params: {
          model:      MODELS[r.model],
          max_tokens: r.maxTokens,
          // Caching habilitado também nos batches
          system: [{ type: 'text', text: r.system, cache_control: { type: 'ephemeral' } }],
          messages: [{ role: 'user', content: r.userMessage }],
        },
      })),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`[batch] submit failed ${res.status}: ${err}`)
  }
  return res.json() as Promise<BatchSubmitResult>
}

export async function getBatchStatus(batchId: string): Promise<BatchSubmitResult> {
  const res = await fetch(`${BATCH_API}/${batchId}`, { headers: BATCH_HEADERS })
  if (!res.ok) throw new Error(`[batch] status check failed ${res.status}`)
  return res.json() as Promise<BatchSubmitResult>
}

export async function getBatchResults(batchId: string): Promise<BatchResultItem[]> {
  const res = await fetch(`${BATCH_API}/${batchId}/results`, { headers: BATCH_HEADERS })
  if (!res.ok) throw new Error(`[batch] results fetch failed ${res.status}`)
  const text = await res.text()
  return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) as BatchResultItem[]
}
