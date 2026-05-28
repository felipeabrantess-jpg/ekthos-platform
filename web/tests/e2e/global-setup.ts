/**
 * global-setup.ts — produção
 * Executa uma vez antes de todos os testes prod.
 * Faz login e salva storageState em .auth.json.
 *
 * Credenciais lidas de env vars (NUNCA hardcoded).
 * PLAYWRIGHT_ADMIN_EMAIL e PLAYWRIGHT_ADMIN_PASSWORD são obrigatórias.
 */

import { chromium } from '@playwright/test'
import path from 'path'
import fs from 'fs'

// process.cwd() = web/ quando chamado via playwright.prod.config.ts
export const AUTH_FILE = path.resolve(process.cwd(), 'tests/e2e/.auth.json')

// Regenerar auth se arquivo tiver mais de 1 hora (tokens de sessão expiram)
const AUTH_MAX_AGE_MS = 60 * 60 * 1000 // 1 hora

function isAuthStale(): boolean {
  if (!fs.existsSync(AUTH_FILE)) return true
  const stats = fs.statSync(AUTH_FILE)
  return Date.now() - stats.mtimeMs > AUTH_MAX_AGE_MS
}

export default async function globalSetup() {
  const email    = process.env.PLAYWRIGHT_ADMIN_EMAIL
  const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD
  const baseURL  = process.env.PLAYWRIGHT_BASE_URL ?? 'https://ekthos-platform.vercel.app'

  if (!email || !password) {
    throw new Error(
      '[playwright-prod] Variáveis obrigatórias ausentes.\n' +
      'Necessário: PLAYWRIGHT_ADMIN_EMAIL e PLAYWRIGHT_ADMIN_PASSWORD\n' +
      'Solução: source web/.env.local antes de rodar, ou configure no CI.'
    )
  }

  if (!isAuthStale()) {
    console.log('[global-setup-prod] Auth válida reutilizada (< 1h):', AUTH_FILE)
    return
  }

  // Remover auth stale antes de refazer login
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE)
    console.log('[global-setup-prod] Auth stale removida, refazendo login')
  }

  console.log(`[global-setup-prod] Login como ${email} em ${baseURL}`)

  const browser = await chromium.launch()
  const ctx     = await browser.newContext()
  const page    = await ctx.newPage()

  try {
    await page.goto(`${baseURL}/login`)
    await page.locator('input[type="email"]').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.getByRole('button', { name: /Entrar/i }).click()
    await page.waitForURL(/\/admin\/cockpit/, { timeout: 30_000 })
  } catch (err) {
    throw new Error(
      `[playwright-prod] Falha no login em ${baseURL}/login\n` +
      'Verifique se as credenciais em .env.local estão corretas.\n' +
      `Detalhe: ${err instanceof Error ? err.message : String(err)}`
    )
  }

  console.log('[global-setup-prod] Login OK:', page.url())

  await ctx.storageState({ path: AUTH_FILE })
  console.log('[global-setup-prod] Auth salva em', AUTH_FILE)

  await browser.close()
}
