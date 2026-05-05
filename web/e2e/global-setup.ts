/**
 * Global Setup — executa UMA vez antes de todos os testes.
 * Faz login via UI e salva storageState em e2e/.auth.json.
 */

import { chromium, FullConfig } from '@playwright/test'
import path from 'path'
import fs from 'fs'

const AUTH_FILE = path.join('e2e', '.auth.json')

export default async function globalSetup(_config: FullConfig) {
  if (fs.existsSync(AUTH_FILE)) {
    console.log('[global-setup] Auth já existe, reutilizando')
    return
  }

  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  const page = await ctx.newPage()

  await page.goto('http://localhost:5173/login')
  await page.locator('input[type="email"]').fill('felipe@ekthosai.net')
  await page.locator('input[type="password"]').fill('Ekthos2026!')
  await page.getByRole('button', { name: /Entrar/i }).click()
  await page.waitForURL(/\/admin\/cockpit/, { timeout: 30_000 })
  console.log('[global-setup] Login OK, URL:', page.url())

  await ctx.storageState({ path: AUTH_FILE })
  console.log('[global-setup] Auth salva em', AUTH_FILE)

  await browser.close()
}
