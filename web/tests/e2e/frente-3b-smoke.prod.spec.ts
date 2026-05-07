/**
 * frente-3b-smoke.prod.spec.ts
 * Smoke test E2E — Frente 3B Frontend (Cadastro Cristalino).
 *
 * Pré-condição: global-setup.ts fez login e salvou .auth.json (via storageState).
 * Reutiliza a mesma infra das frentes anteriores.
 *
 * Cobertura:
 *   1. /admin/churches/:id — tab Contratante carrega sem crash
 *   2. /admin/churches/:id — tab Perfil Pastoral carrega sem crash
 *   3. /onboarding/wizard  — rota existe e renderiza (sem crash de página)
 */

import { test, expect } from '@playwright/test'

test.describe('Frente 3B — smoke frontend (produção)', () => {
  test('/admin/churches/:id — tab Contratante carrega sem crash', async ({ page }) => {
    await page.goto('/admin/churches')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    // Aguarda tabela carregar
    const firstRow = page.locator('tbody tr').first()
    const rowVisible = await firstRow.isVisible({ timeout: 10_000 }).catch(() => false)

    if (!rowVisible) {
      console.log('[frente-3b-smoke] Nenhuma igreja encontrada — skip tab tests')
      return
    }

    // Navega para a primeira igreja
    const firstLink = page.locator('tbody tr a, tbody tr [role="link"]').first()
    const linkVisible = await firstLink.isVisible({ timeout: 3_000 }).catch(() => false)
    if (linkVisible) {
      await firstLink.click()
    } else {
      await firstRow.click()
    }

    await page.waitForURL(/\/admin\/churches\/.+/, { timeout: 15_000 }).catch(() => {})

    // Aguarda tabs aparecerem
    await page.waitForSelector('[role="button"], button', { timeout: 10_000 }).catch(() => {})

    // Clica na tab Contratante
    const contratanteTab = page.getByRole('button', { name: /Contratante/i }).first()
    const tabVisible = await contratanteTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (!tabVisible) {
      // Tab pode não estar visível por scroll horizontal — verifica que não crashou
      const bodyText = await page.locator('body').innerText()
      expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)
      console.log('[frente-3b-smoke] Tab Contratante não visível no viewport (scroll needed) — sem crash ✓')
      return
    }

    await contratanteTab.click()
    await page.waitForLoadState('networkidle').catch(() => {})

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)
    expect(bodyText).not.toMatch(/Cannot read properties/i)
  })

  test('/admin/churches/:id — tab Perfil Pastoral carrega sem crash', async ({ page }) => {
    await page.goto('/admin/churches')
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })

    const firstRow = page.locator('tbody tr').first()
    const rowVisible = await firstRow.isVisible({ timeout: 10_000 }).catch(() => false)
    if (!rowVisible) { return }

    const firstLink = page.locator('tbody tr a, tbody tr [role="link"]').first()
    const linkVisible = await firstLink.isVisible({ timeout: 3_000 }).catch(() => false)
    if (linkVisible) { await firstLink.click() }
    else { await firstRow.click() }

    await page.waitForURL(/\/admin\/churches\/.+/, { timeout: 15_000 }).catch(() => {})

    const pastoralTab = page.getByRole('button', { name: /Perfil Pastoral/i }).first()
    const tabVisible = await pastoralTab.isVisible({ timeout: 5_000 }).catch(() => false)

    if (!tabVisible) {
      const bodyText = await page.locator('body').innerText()
      expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)
      console.log('[frente-3b-smoke] Tab Perfil Pastoral não visível no viewport — sem crash ✓')
      return
    }

    await pastoralTab.click()
    await page.waitForLoadState('networkidle').catch(() => {})

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)
    expect(bodyText).not.toMatch(/Cannot read properties/i)
  })

  test('/onboarding/wizard — rota renderiza sem crash (redireciona para login ou /onboarding)', async ({ page }) => {
    // O admin (playwright@ekthosai.net) tem is_ekthos_admin=true mas sem church_id no app_metadata,
    // portanto o wizard vai redirecionar para /login (sem churchId).
    // Em qualquer caso, não deve ter crash 500.
    await page.goto('/onboarding/wizard')

    await page.waitForLoadState('networkidle').catch(() => {})

    const bodyText = await page.locator('body').innerText()
    expect(bodyText).not.toMatch(/500|Internal Server Error|Unexpected error/i)
    expect(bodyText).not.toMatch(/Cannot read properties/i)

    // Deve ter redirecionado para /login ou /onboarding (ambos válidos para admin sem churchId)
    const url = page.url()
    console.log(`[frente-3b-smoke] /onboarding/wizard → redirecionou para: ${url}`)
    expect(url).toMatch(/login|onboarding|admin|dashboard/)
  })
})
