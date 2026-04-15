// ============================================================
// Shared: anthropic-client.ts
// Factory do cliente Anthropic com seleção de modelo e helpers.
// ============================================================

import Anthropic from 'https://esm.sh/@anthropic-ai/sdk@0.24.3'

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? ''

// ── Modelos disponíveis ────────────────────────────────────

export const MODELS = {
  haiku:  'claude-3-5-haiku-20241022',
  sonnet: 'claude-3-5-sonnet-20241022',
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

// ── Estimativa de custo em centavos de USD ─────────────────
// Preços aproximados por 1K tokens (input / output)

const PRICING: Record<ModelTier, { input: number; output: number }> = {
  haiku:  { input: 0.00025, output: 0.00125 },
  sonnet: { input: 0.003,   output: 0.015   },
}

export function estimateCostCents(
  model: ModelTier,
  inputTokens: number,
  outputTokens: number,
): number {
  const p = PRICING[model]
  return Math.round(
    (inputTokens  / 1000) * p.input  * 100 +
    (outputTokens / 1000) * p.output * 100,
  )
}

// ── Helper: cria SSE data line ─────────────────────────────

export function sseData(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`
}

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type':  'text/event-stream',
  'Cache-Control': 'no-cache',
  'Connection':    'keep-alive',
}
