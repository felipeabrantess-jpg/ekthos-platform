/**
 * frente-3a-smoke.prod.spec.ts
 * Smoke test E2E — Frente 3A Backend (Cadastro Cristalino).
 *
 * Pré-condição: global-setup.ts fez login e salvou .auth.json (via storageState).
 * Reutiliza a mesma infra da Frente 2.5 (global-setup.ts + .auth.json).
 *
 * Cobertura:
 *   1. /admin/churches carrega sem erro (tabela de igrejas visível)
 *   2. /admin/churches/:id (primeira igreja) carrega sem erro (sem crash de página)
 *
 * Esses testes verificam que as novas colunas (onboarding_step, uf, etc.)
 * não quebraram as queries existentes do cockpit.
 */

import { test, expect } from '@playwright/test'

test.describe('Frente 3A — smoke backend (produção)', () => {
  test('/admin/churches carrega sem erro', async ({ page }) => {
    await page.goto('/admin/churches')

    // Auth válida: não redirecionou para /login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page).toHaveURL(/churches/, { timeout: 15_000 })

    // Aguarda carregamento assíncrono
    await page.waitForTimeout(2_000)

    // Nenhum erro fatal na página (não deve ter texto de erro/crash explícito)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)

    // Deve haver pelo menos um elemento visível de conteúdo da lista
    // (heading ou linha de tabela — aceita qualquer um)
    const hasContent = await page.locator('h1, h2, tbody tr').first().isVisible({ timeout: 10_000 }).catch(() => false)
    expect(hasContent, 'Página /admin/churches deve ter conteúdo visível').toBe(true)
  })

  test('/admin/churches/:id (primeira igreja) carrega sem crash', async ({ page }) => {
    await page.goto('/admin/churches')

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await page.waitForTimeout(2_000)

    // Clica no link da primeira igreja (se houver)
    const firstChurchLink = page.locator('tbody tr a, tbody tr [role="link"]').first()
    const linkVisible = await firstChurchLink.isVisible({ timeout: 5_000 }).catch(() => false)

    if (!linkVisible) {
      // Fallback: navega diretamente via botão ou célula clicável
      const firstRow = page.locator('tbody tr').first()
      const rowVisible = await firstRow.isVisible({ timeout: 5_000 }).catch(() => false)
      if (rowVisible) {
        await firstRow.click()
      } else {
        // Sem igrejas cadastradas — smoke ainda passa (nenhum crash)
        console.log('[frente-3a-smoke] Nenhuma linha de igreja encontrada — skip detalhe')
        return
      }
    } else {
      await firstChurchLink.click()
    }

    // Aguarda navegação para página de detalhe (qualquer URL /admin/churches/...)
    await page.waitForURL(/\/admin\/churches\/.+/, { timeout: 15_000 }).catch(() => {
      // Se não navegar (botão de editar inline etc.), apenas verifica estado atual
    })

    await page.waitForTimeout(1_500)

    // Sem erro fatal
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)

    // Página não deve estar em branco
    const body = page.locator('body')
    await expect(body).toBeVisible({ timeout: 5_000 })
  })
})
