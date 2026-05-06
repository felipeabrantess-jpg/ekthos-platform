/**
 * playwright.prod.config.ts
 * Configuração Playwright para testes E2E contra produção.
 *
 * Uso:
 *   npx playwright test --config=playwright.prod.config.ts
 *
 * Requer (em web/.env.local ou ambiente CI):
 *   PLAYWRIGHT_ADMIN_EMAIL=playwright@ekthosai.net
 *   PLAYWRIGHT_ADMIN_PASSWORD=<stored in Vercel encrypted env>
 *   PLAYWRIGHT_BASE_URL=https://ekthos-platform.vercel.app  (opcional, é o default)
 *
 * NÃO commitar .env.local. O .gitignore cobre .env.* automaticamente.
 */

import { defineConfig, devices } from '@playwright/test'
import fs from 'fs'
import path from 'path'

// ── Carregar .env.local manualmente (sem dependência de dotenv) ────────────
// NOTA: o parser abaixo é adequado para passwords em formato base64url
// (A-Za-z0-9-_, sem espaços ou aspas). Se a senha for alterada para um formato
// com caracteres especiais, instalar 'dotenv' e substituir este bloco.
// process.cwd() = diretório web/ quando `npx playwright test` é chamado de lá.
const envLocalPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envLocalPath)) {
  fs.readFileSync(envLocalPath, 'utf-8')
    .split('\n')
    .forEach(line => {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].trim()
      }
    })
}

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'https://ekthos-platform.vercel.app'

export default defineConfig({
  testDir: './tests/e2e',
  // Allowlist explícita: apenas arquivos de smoke/prod são executados.
  // Evita que testes locais (localhost) rodem acidentalmente contra produção.
  testMatch: ['**/admin-smoke.spec.ts', '**/*.prod.spec.ts'],
  timeout: 60_000,
  retries: 1,
  globalSetup: './tests/e2e/global-setup.ts',
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: BASE_URL,
    headless: true,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    storageState: './tests/e2e/.auth.json',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Sem webServer — testes rodam contra URL de produção
})
