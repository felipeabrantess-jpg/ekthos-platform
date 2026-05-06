/**
 * admin-smoke.spec.ts
 * Smoke test E2E contra produção (https://ekthos-platform.vercel.app).
 *
 * Pré-condição: global-setup.ts fez login e salvou .auth.json (via storageState).
 *
 * Fluxo:
 *   1. Navega para /admin/cockpit/ativacoes  → assert: URL correta, não redirecionou para login
 *   2. Navega para /admin/churches           → assert: ≥1 linha de tabela com dado de igreja
 *   3. Logout obrigatório                   → assert: redireciona para /login (sessão destruída)
 */

import { test, expect } from '@playwright/test'

test.describe('Admin smoke — produção', () => {
  test('ativações → churches → logout', async ({ page }) => {
    // ── 1. /admin/cockpit/ativacoes ───────────────────────────────────────────
    await page.goto('/admin/cockpit/ativacoes')

    // Confirma que auth está válida: não redirecionou para /login
    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page).toHaveURL(/ativacoes/, { timeout: 15_000 })

    // Conteúdo visível da página (heading ou elemento principal da lista)
    const ativacoesContent = page.locator('h1, h2, h3').first()
    await expect(ativacoesContent).toBeVisible({ timeout: 15_000 })

    // ── 2. /admin/churches ────────────────────────────────────────────────────
    await page.goto('/admin/churches')

    await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 })
    await expect(page).toHaveURL(/churches/, { timeout: 15_000 })

    // Aguarda carregamento assíncrono dos dados
    await page.waitForTimeout(2_000)

    // Deve haver ≥1 linha de tabela com conteúdo real
    // (tbody tr com pelo menos uma célula não-vazia)
    const churchRow = page.locator('tbody tr td:not(:empty)').first()
    await expect(
      churchRow,
      '≥1 linha de igreja deve estar visível em /admin/churches'
    ).toBeVisible({ timeout: 10_000 })

    // ── 3. Logout obrigatório ─────────────────────────────────────────────────
    // Localiza botão/item de menu "Sair" (sidebar Ekthos tem avatar no rodapé)
    const logoutBtn = page
      .getByRole('button', { name: /sair/i })
      .or(page.getByRole('menuitem', { name: /sair/i }))
      .or(page.locator('[data-testid="logout-btn"]'))
      .first()

    // Tenta clicar no trigger do menu de usuário se o botão não estiver visível diretamente
    const directVisible = await logoutBtn.isVisible({ timeout: 3_000 }).catch(() => false)
    if (!directVisible) {
      const userTrigger = page
        .locator('[data-testid="user-menu"], [aria-label*="uário"], [aria-label*="sair"]')
        .first()
      if (await userTrigger.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await userTrigger.click()
      }
    }

    // Logout obrigatório — falha loudly se botão não encontrado
    await expect(logoutBtn).toBeVisible({
      timeout: 5_000,
      message: 'Botão de logout não encontrado — o menu do usuário pode ter mudado de seletor.',
    })
    await logoutBtn.click()

    // Confirma que sessão foi destruída: redireciona para /login
    await expect(page).toHaveURL(/\/login/, { timeout: 15_000 })

    // Confirma que reacesso a área admin redireciona de volta para /login
    await page.goto('/admin/cockpit')
    await expect(page).toHaveURL(/\/login/, { timeout: 10_000 })
  })
})
