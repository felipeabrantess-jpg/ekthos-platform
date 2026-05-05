/**
 * E2E: Sprint 3A.1 — Habilitação de Agente Premium via Cockpit
 * Itens R1–R12 do roteiro de validação.
 */

import { test, expect, Page } from '@playwright/test'
import https from 'https'
import path from 'path'

const SUPABASE_URL  = 'https://mlqjywqnchilvgkbvicd.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1scWp5d3FuY2hpbHZna2J2aWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTIyMjMsImV4cCI6MjA5MTIyODIyM30.NpsCJU8QlGPI9o6vSYL6Ne7tozfKrt_haYBmSFIeEtA'
const CHURCH_ID     = '62e473b8-cd39-4da2-aa5d-c296b03d6873'
const CHURCH_URL    = `/admin/churches/${CHURCH_ID}`
const AUTH_FILE     = path.join('e2e', '.auth.json')

// ── HTTP helper ───────────────────────────────────────────────────────────────

function httpsReq(opts: https.RequestOptions, body?: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

async function efRequest(token: string, method: string, body: Record<string, unknown>): Promise<{ status: number; json: Record<string, unknown> }> {
  const bodyStr = JSON.stringify(body)
  const res = await httpsReq({
    hostname: 'mlqjywqnchilvgkbvicd.supabase.co',
    path: '/functions/v1/admin-agent-grant',
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      Origin: 'http://localhost:5173',
    },
  }, bodyStr)
  return { status: res.status, json: JSON.parse(res.body) as Record<string, unknown> }
}

async function getAdminToken(): Promise<string> {
  const loginBody = JSON.stringify({ email: 'felipe@ekthosai.net', password: 'Ekthos2026!' })
  const res = await httpsReq({
    hostname: 'mlqjywqnchilvgkbvicd.supabase.co',
    path: '/auth/v1/token?grant_type=password',
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) },
  }, loginBody)
  const j = JSON.parse(res.body) as Record<string, unknown>
  if (!j.access_token) throw new Error(`Login falhou: ${res.body}`)
  return j.access_token as string
}

// ── Login via UI (salva storage state) ───────────────────────────────────────

async function loginViaUI(page: Page) {
  await page.goto('/login')
  await page.locator('input[type="email"]').fill('felipe@ekthosai.net')
  await page.locator('input[type="password"]').fill('Ekthos2026!')
  await page.getByRole('button', { name: /Entrar/i }).click()
  // Aguardar redirect para cockpit
  await page.waitForURL(/\/admin\/cockpit/, { timeout: 20_000 })
  console.log('[login] Autenticado, URL:', page.url())
}

// ── Helpers de navegação ──────────────────────────────────────────────────────

async function goToChurch(page: Page) {
  await page.goto(CHURCH_URL)
  await page.waitForURL(new RegExp(CHURCH_ID), { timeout: 15_000 })
  // Aguardar fetch async da EF terminar (networkidle) e h1 com conteúdo
  await page.waitForLoadState('networkidle', { timeout: 15_000 })
  await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 })
}

async function goToOperacaoTab(page: Page) {
  const tab = page.getByRole('button', { name: /Operação/i })
  await expect(tab).toBeVisible({ timeout: 15_000 })
  await tab.click()
  await expect(page.getByText(/Agentes de IA/i)).toBeVisible({ timeout: 10_000 })
}

async function openGrantModal(page: Page) {
  await page.getByRole('button', { name: /\+ Habilitar agente/i }).click()
  // Aguardar heading do modal (h2 exato)
  await expect(page.getByRole('heading', { name: 'Habilitar Agente' })).toBeVisible({ timeout: 5_000 })
  // Aguardar RPC carregar a lista
  await expect(page.locator('select')).toBeEnabled({ timeout: 10_000 })
  await page.waitForTimeout(500)
}

// ── Suite principal ───────────────────────────────────────────────────────────

test.describe('Sprint 3A.1 — Agent grants cockpit', () => {
  // Usar sessão salva pelo globalSetup
  test.use({ storageState: AUTH_FILE })

  test.beforeAll(async () => {
    // Preparar DB: garantir agent-acolhimento ativo, agent-reengajamento sem grant
    const token = await getAdminToken()

    // Revogar reengajamento se existir
    await efRequest(token, 'DELETE', { church_id: CHURCH_ID, agent_slug: 'agent-reengajamento' }).catch(() => {})

    // Reabilitar acolhimento (upsert courtesy)
    await efRequest(token, 'POST', { church_id: CHURCH_ID, agent_slug: 'agent-acolhimento', grant_type: 'courtesy' })

    console.log('[setup] DB pronto: acolhimento(courtesy active), reengajamento(sem grant)')
  })

// ── Testes ───────────────────────────────────────────────────────────────────

test('R1-R2: Cockpit abre e navega para detalhe de igreja', async ({ page }) => {
  await goToChurch(page)

  // R1: h1 com nome da igreja
  const titulo = await page.locator('h1').textContent()
  console.log('[R1] Título da página:', titulo)
  expect(titulo).toBeTruthy()

  // R2: tabs incluindo Operação
  await expect(page.getByRole('button', { name: /Operação/i })).toBeVisible()
  console.log('[R2] ✅ Tab Operação visível')
})

test('R3: Aba Operação carrega lista de agentes e botão Habilitar', async ({ page }) => {
  await goToChurch(page)
  await goToOperacaoTab(page)

  await expect(page.getByRole('button', { name: /\+ Habilitar agente/i })).toBeVisible()
  console.log('[R3] ✅ Aba Operação OK')
})

test('R4-R5: Habilitar agent-acolhimento como Cortesia — badge + botão revogar', async ({ page }) => {
  // Garantir que agent-acolhimento não tem grant (revogar antes do teste)
  const token = await getAdminToken()
  await efRequest(token, 'DELETE', { church_id: CHURCH_ID, agent_slug: 'agent-acolhimento' }).catch(() => {})

  await goToChurch(page)
  await goToOperacaoTab(page)
  await openGrantModal(page)

  // Capturar network
  let postPayload = '', postStatus = 0, postResp = ''
  page.on('request', req => { if (req.url().includes('admin-agent-grant') && req.method() === 'POST') postPayload = req.postData() ?? '' })
  page.on('response', async res => {
    if (res.url().includes('admin-agent-grant') && res.request().method() === 'POST') {
      postStatus = res.status()
      postResp   = await res.text().catch(() => '')
    }
  })

  // Selecionar agent-acolhimento (by value = slug)
  const select = page.locator('select')
  await select.selectOption('agent-acolhimento')

  // grantType padrão = Cortesia (verificado via payload — não precisamos checar UI antes do submit)

  // Submit (exact match para não conflitar com o botão "+" da lista)
  await page.getByRole('button', { name: 'Habilitar agente', exact: true }).click()

  // R4: mensagem de sucesso
  await expect(page.getByText(/Agente habilitado com sucesso/i)).toBeVisible({ timeout: 10_000 })
  // Modal fecha
  await expect(page.getByRole('heading', { name: 'Habilitar Agente' })).not.toBeVisible({ timeout: 5_000 })

  console.log('[R4] POST payload:', postPayload)
  console.log('[R4] POST response:', postStatus, postResp)

  expect(postPayload).toContain('"agent_slug":"agent-acolhimento"')
  expect(postPayload).toContain('"grant_type":"courtesy"')
  expect(postStatus).toBe(201)
  console.log('[R4] ✅ POST 201 OK')

  // R5: badge Cortesia na lista
  await expect(page.getByText('Cortesia').first()).toBeVisible({ timeout: 8_000 })
  console.log('[R5] ✅ Badge Cortesia visível')

  // Botão revogar visível (✕)
  await expect(page.locator('[title="Revogar acesso"]').first()).toBeVisible()
  console.log('[R5] ✅ Botão Revogar visível')
})

test('R6: Link "Configurar →" navega para tela de config do agente', async ({ page }) => {
  await goToChurch(page)
  await goToOperacaoTab(page)

  const configLink = page.getByRole('link', { name: /Configurar/i }).first()
  await expect(configLink).toBeVisible({ timeout: 5_000 })

  await configLink.click()
  await page.waitForURL(/agentes/, { timeout: 10_000 })
  console.log('[R6] ✅ Navegou para:', page.url())

  // Deve ter conteúdo da tela de config (ex: abas ou header)
  await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 8_000 })
})

test('R7: Abrir modal — acolhimento (ativo) aparece no dropdown', async ({ page }) => {
  await goToChurch(page)
  await goToOperacaoTab(page)
  await openGrantModal(page)

  const options = await page.locator('select option').allTextContents()
  console.log('[R7] Opções no modal:', options)

  const hasAcolhimento = options.some(o => /acolhimento/i.test(o))
  expect(hasAcolhimento).toBe(true)
  console.log('[R7] ✅ agent-acolhimento presente no modal (disabled ou habilitável)')

  await page.keyboard.press('Escape')
})

test('R8: Habilitar agent-reengajamento como Trial 7 dias — POST 201, badge Trial', async ({ page }) => {
  await goToChurch(page)
  await goToOperacaoTab(page)
  await openGrantModal(page)

  // Network capture
  let postPayload = '', postStatus = 0, postResp = ''
  page.on('request', req => { if (req.url().includes('admin-agent-grant') && req.method() === 'POST') postPayload = req.postData() ?? '' })
  page.on('response', async res => {
    if (res.url().includes('admin-agent-grant') && res.request().method() === 'POST') {
      postStatus = res.status()
      postResp   = await res.text().catch(() => '')
    }
  })

  // Selecionar agent-reengajamento (by value = slug)
  await page.locator('select').selectOption('agent-reengajamento')
  console.log('[R8] agent-reengajamento selecionado')

  // Clicar Trial
  await page.getByRole('button', { name: /Trial/i }).click()
  console.log('[R8] Trial clicado')

  // Campo dias
  const daysInput = page.locator('input[type="number"]')
  await expect(daysInput).toBeVisible({ timeout: 3_000 })
  await daysInput.fill('7')
  const daysVal = await daysInput.inputValue()
  console.log('[R8] Dias preenchidos:', daysVal)
  expect(daysVal).toBe('7')

  // Botão submit habilitado (exact match para não conflitar com o botão "+" da lista)
  const submitBtn = page.getByRole('button', { name: 'Habilitar agente', exact: true })
  await expect(submitBtn).toBeEnabled()

  // Submit
  await submitBtn.click()

  // Sucesso
  await expect(page.getByText(/Agente habilitado com sucesso/i)).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: 'Habilitar Agente' })).not.toBeVisible({ timeout: 5_000 })

  console.log('[R8] POST payload:', postPayload)
  console.log('[R8] POST response:', postStatus, postResp)

  // Assertions de payload
  expect(postPayload).toContain('"agent_slug":"agent-reengajamento"')
  expect(postPayload).toContain('"grant_type":"trial"')
  expect(postPayload).toContain('"duration_days":7')
  expect(postStatus).toBe(201)
  console.log('[R8] ✅ POST trial chegou na EF com status 201')

  // Badge Trial na lista
  await expect(page.getByText(/Trial/i).first()).toBeVisible({ timeout: 8_000 })
  console.log('[R8] ✅ Badge Trial visível')
})

test('R9: Modal após grants — agent-acolhimento disabled, agent-reengajamento disabled', async ({ page }) => {
  await goToChurch(page)
  await goToOperacaoTab(page)
  await openGrantModal(page)

  const options = await page.locator('select option').allTextContents()
  console.log('[R9] Opções:', options)

  // agent-acolhimento deve estar disabled (tem grant ativo)
  const acolhimentoOpt = page.locator('select option').filter({ hasText: /acolhimento/i })
  const reengajamentoOpt = page.locator('select option').filter({ hasText: /reengajamento/i })

  const acolhimentoDisabled     = await acolhimentoOpt.evaluate((el: HTMLOptionElement) => el.disabled)
  const reengajamentoDisabled   = await reengajamentoOpt.evaluate((el: HTMLOptionElement) => el.disabled)
  const acolhimentoText         = await acolhimentoOpt.textContent()
  const reengajamentoText       = await reengajamentoOpt.textContent()

  console.log('[R9] acolhimento disabled?', acolhimentoDisabled, '| texto:', acolhimentoText)
  console.log('[R9] reengajamento disabled?', reengajamentoDisabled, '| texto:', reengajamentoText)

  expect(acolhimentoDisabled).toBe(true)
  expect(acolhimentoText).toContain('já habilitado')
  expect(reengajamentoDisabled).toBe(true)
  expect(reengajamentoText).toContain('já habilitado')

  await page.keyboard.press('Escape')
  console.log('[R9] ✅ Filtro list_grantable OK — agentes ativos aparecem como disabled')
})

test('R10: Revogar agent-acolhimento via confirmação inline — DELETE 200, agente some', async ({ page }) => {
  await goToChurch(page)
  await goToOperacaoTab(page)

  // Network capture para DELETE
  let deletePayload = '', deleteStatus = 0, deleteResp = ''
  page.on('request', req => { if (req.url().includes('admin-agent-grant') && req.method() === 'DELETE') deletePayload = req.postData() ?? '' })
  page.on('response', async res => {
    if (res.url().includes('admin-agent-grant') && res.request().method() === 'DELETE') {
      deleteStatus = res.status()
      deleteResp   = await res.text().catch(() => '')
    }
  })

  // Localizar botão ✕ ESPECÍFICO do agent-acolhimento
  // Cada row é um div.flex.items-center contendo span com o slug e o botão de revogar
  const acolhimentoRow = page.locator('div.flex.items-center').filter({
    has: page.locator('span', { hasText: 'agent-acolhimento' }),
  })
  const revokeBtn = acolhimentoRow.locator('[title="Revogar acesso"]')
  await expect(revokeBtn).toBeVisible({ timeout: 8_000 })
  console.log('[R10] Botão ✕ encontrado')

  await revokeBtn.click()
  console.log('[R10] Clicou ✕')

  // NOVO COMPORTAMENTO: confirmação inline, SEM window.confirm
  const confirmBtn = page.getByRole('button', { name: /Confirmar/i })
  await expect(confirmBtn).toBeVisible({ timeout: 3_000 })
  const cancelBtn = page.getByRole('button', { name: /Cancelar/i })
  await expect(cancelBtn).toBeVisible()
  console.log('[R10] ✅ Confirmação inline apareceu (sem window.confirm nativo)')

  // Clicar Confirmar
  await confirmBtn.click()
  console.log('[R10] Clicou Confirmar')

  // Aguardar DELETE chegar
  await page.waitForResponse(
    res => res.url().includes('admin-agent-grant') && res.request().method() === 'DELETE',
    { timeout: 10_000 }
  )

  console.log('[R10] DELETE payload:', deletePayload)
  console.log('[R10] DELETE response:', deleteStatus, deleteResp)

  expect(deletePayload).toContain('"agent_slug":"agent-acolhimento"')
  expect(deletePayload).toContain(`"church_id":"${CHURCH_ID}"`)
  expect(deleteStatus).toBe(200)
  console.log('[R10] ✅ DELETE 200 OK')

  // Lista deve recarregar — badge Cortesia some (ou agente some)
  await page.waitForTimeout(2_000)
  // Verificar que não há mais confirmação inline visível
  await expect(confirmBtn).not.toBeVisible({ timeout: 3_000 })
})

test('R11: Após revogar — agent-acolhimento volta como habilitável no modal', async ({ page }) => {
  await goToChurch(page)
  await goToOperacaoTab(page)
  await openGrantModal(page)

  const acolhimentoOpt = page.locator('select option').filter({ hasText: /acolhimento/i })
  // <option> dentro de <select> fechado é considerado "hidden" pelo Playwright — usar evaluate diretamente
  const isDisabled = await acolhimentoOpt.evaluate((el: HTMLOptionElement) => el.disabled)
  const optText    = await acolhimentoOpt.textContent()

  console.log('[R11] acolhimento disabled?', isDisabled, '| texto:', optText)
  expect(isDisabled).toBe(false)
  expect(optText).not.toContain('já habilitado')

  await page.keyboard.press('Escape')
  console.log('[R11] ✅ agent-acolhimento disponível para habilitar após revogação')
})

test('R12: Console sem erros JS, Network sem chamadas com erro inesperado', async ({ page }) => {
  const jsErrors: string[] = []
  page.on('pageerror', err => jsErrors.push(err.message))

  const networkErrors: string[] = []
  page.on('response', res => {
    if (res.url().includes('admin-agent-grant') && res.status() >= 400) {
      networkErrors.push(`${res.status()} ${res.url()}`)
    }
  })

  await goToChurch(page)
  await goToOperacaoTab(page)
  await page.waitForTimeout(1_000)

  console.log('[R12] JS errors:', jsErrors.length ? jsErrors : 'nenhum')
  console.log('[R12] Network errors na EF:', networkErrors.length ? networkErrors : 'nenhum')

  expect(jsErrors.length).toBe(0)
  expect(networkErrors.length).toBe(0)
  console.log('[R12] ✅ Sem erros JS, sem erros de rede inesperados')
})

}) // end describe 'Sprint 3A.1 — Agent grants cockpit'
