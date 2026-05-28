/**
 * helpers/auth.ts
 * Auxiliares de autenticação para testes E2E de produção.
 *
 * Fail-loud: lança erro descritivo se env vars ausentes —
 * nunca silencia credenciais faltando.
 */

export interface AdminCredentials {
  email: string
  password: string
}

/**
 * Retorna credenciais do admin de teste.
 * Lança se PLAYWRIGHT_ADMIN_EMAIL ou PLAYWRIGHT_ADMIN_PASSWORD não estiverem
 * definidos no ambiente (via web/.env.local ou CI).
 */
export function getAdminCredentials(): AdminCredentials {
  const email    = process.env.PLAYWRIGHT_ADMIN_EMAIL
  const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD

  if (!email || !password) {
    const missing: string[] = []
    if (!email)    missing.push('PLAYWRIGHT_ADMIN_EMAIL')
    if (!password) missing.push('PLAYWRIGHT_ADMIN_PASSWORD')

    throw new Error(
      `[playwright-prod] Variáveis de ambiente ausentes: ${missing.join(', ')}\n` +
      'Configure em web/.env.local (gitignored) ou no ambiente CI.\n' +
      'NUNCA coloque credenciais em código ou commits.'
    )
  }

  return { email, password }
}

/**
 * Retorna a baseURL de produção.
 * Default: https://ekthos-platform.vercel.app
 */
export function getBaseURL(): string {
  return process.env.PLAYWRIGHT_BASE_URL ?? 'https://ekthos-platform.vercel.app'
}
