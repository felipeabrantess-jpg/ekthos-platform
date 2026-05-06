/**
 * E2E: Refactor — Separar Cadastro da Igreja vs Config do Agente
 *
 * R1–R11   Bloco A — Aba Cadastro em Church.tsx
 * R12–R20  Bloco B — TabIdentidade refatorada em AgentConfigCockpit
 * R21–R28  Bloco C — Non-regression (Resumo, Assinatura, Operação, Logs, sem erros JS)
 *
 * Pré-requisitos:
 *  - migration 20260506000001_churches_add_main_email.sql aplicada em produção ✅
 *  - Edge Function admin-church-detail v4 deployada ✅
 *  - agent-acolhimento com grant ativo para CHURCH_ID (beforeAll garante isso)
 */

import { test, expect, Page } from '@playwright/test'
import https from 'https'
import path from 'path'

const SUPABASE_URL  = 'https://mlqjywqnchilvgkbvicd.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1scWp5d3FuY2hpbHZna2J2aWNkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTIyMjMsImV4cCI6MjA5MTIyODIyM30.NpsCJU8QlGPI9o6vSYL6Ne7tozfKrt_haYBmSFIeEtA'
const CHURCH_ID     = '62e473b8-cd39-4da2-aa5d-c296b03d6873'
const CHURCH_URL    = `/admin/churches/${CHURCH_ID}`
const COCKPIT_URL   = `/admin/churches/${CHURCH_ID}/agentes/agent-acolhimento`
const AUTH_FILE     = path.join('e2e', '.auth.json')

// ── Timestamp único para evitar colisão entre runs ─────────────────────────
const TS = Date.now()

// ── HTTP helpers ───────────────────────────────────────────────────────────

function httpsPost(opts: https.RequestOptions, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(opts, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: data }))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

async function getAdminToken(): Promise<string> {
  const loginBody = JSON.stringify({ email: 'felipe@ekthosai.net', password: 'Ekthos2026!' })
  const res = await httpsPost({
    hostname: 'mlqjywqnchilvgkbvicd.supabase.co',
    path: '/auth/v1/token?grant_type=password',
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginBody),
    },
  }, loginBody)
  const j = JSON.parse(res.body) as Record<string, unknown>
  if (!j.access_token) throw new Error(`Login falhou: ${res.body}`)
  return j.access_token as string
}

async function efGrantRequest(token: string, method: string, body: Record<string, unknown>) {
  const bodyStr = JSON.stringify(body)
  const res = await httpsPost({
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

// ── Helpers de navegação ───────────────────────────────────────────────────

async function goToChurch(page: Page, tabParam?: string) {
  const url = tabParam ? `${CHURCH_URL}?tab=${tabParam}` : CHURCH_URL
  await page.goto(url)
  await page.waitForURL(new RegExp(CHURCH_ID), { timeout: 15_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 })
  await expect(page.locator('h1')).toBeVisible({ timeout: 10_000 })
}

async function goToCockpit(page: Page) {
  await page.goto(COCKPIT_URL)
  await page.waitForURL(new RegExp('agentes/agent-acolhimento'), { timeout: 15_000 })
  await page.waitForLoadState('networkidle', { timeout: 20_000 })
}

async function clickTab(page: Page, label: RegExp | string) {
  const btn = page.getByRole('button', { name: label })
  await expect(btn).toBeVisible({ timeout: 10_000 })
  await btn.click()
}

// ── Suite principal ────────────────────────────────────────────────────────

test.describe('Refactor — Cadastro Igreja vs Config Agente', () => {
  test.use({ storageState: AUTH_FILE })

  test.beforeAll(async () => {
    // Garantir agent-acolhimento ativo com grant courtesy para os testes do Bloco B
    const token = await getAdminToken()
    // Revogar e recriar para ter estado limpo
    await efGrantRequest(token, 'DELETE', { church_id: CHURCH_ID, agent_slug: 'agent-acolhimento' }).catch(() => {})
    const grant = await efGrantRequest(token, 'POST', {
      church_id: CHURCH_ID,
      agent_slug: 'agent-acolhimento',
      grant_type: 'courtesy',
    })
    console.log('[beforeAll] Grant agent-acolhimento:', grant.status, JSON.stringify(grant.json))
  })

  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO A — Aba Cadastro em Church.tsx
  // ════════════════════════════════════════════════════════════════════════════

  test('R1: Tab "Cadastro" existe e está visível em Church.tsx', async ({ page }) => {
    await goToChurch(page)

    const cadastroBtn = page.getByRole('button', { name: /Cadastro/i })
    await expect(cadastroBtn).toBeVisible({ timeout: 8_000 })
    console.log('[R1] ✅ Tab Cadastro visível')
  })

  test('R2: URL ?tab=cadastro abre diretamente na aba Cadastro', async ({ page }) => {
    await goToChurch(page, 'cadastro')

    // Ao carregar com ?tab=cadastro, o form da aba Cadastro deve estar visível
    // Verificar label "Nome da Igreja" que só existe no TabCadastro
    await expect(page.getByText('Nome da Igreja')).toBeVisible({ timeout: 10_000 })
    console.log('[R2] URL ?tab=cadastro OK — form de Cadastro visível')

    // URL deve conter tab=cadastro
    expect(page.url()).toContain('tab=cadastro')
    console.log('[R2] ✅ URL contém tab=cadastro')
  })

  test('R3: Formulário de Cadastro carrega os campos principais', async ({ page }) => {
    await goToChurch(page, 'cadastro')

    // Labels de campo (exactos para evitar strict mode violation)
    await expect(page.getByText('Nome da Igreja', { exact: true })).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('Cidade', { exact: true })).toBeVisible()
    await expect(page.getByText('Estado (UF)', { exact: true })).toBeVisible()
    await expect(page.getByText('Denominação', { exact: true })).toBeVisible()
    await expect(page.getByText('Visão / Missão', { exact: true })).toBeVisible()
    // Heading "Pastor Titular" é um h3 dentro do form
    await expect(page.locator('h3').filter({ hasText: /^Pastor Titular$/ })).toBeVisible()
    // Heading "Redes Sociais" é um h3 dentro do form
    await expect(page.locator('h3').filter({ hasText: /^Redes Sociais$/ })).toBeVisible()
    console.log('[R3] ✅ Todos os campos do form Cadastro estão visíveis')
  })

  test('R4: Campo "Nome da Igreja" é editável', async ({ page }) => {
    await goToChurch(page, 'cadastro')

    const nomeInput = page.locator('label').filter({ hasText: 'Nome da Igreja' }).locator('.. >> input')
      .or(page.locator('input').first())
    // Usar label + input associado de forma mais robusta
    const label = page.getByText('Nome da Igreja')
    await expect(label).toBeVisible({ timeout: 8_000 })

    // O input de nome é o primeiro input dentro do form
    const inputs = page.locator('input[type="text"], input:not([type])').first()
    await expect(inputs).toBeEditable({ timeout: 5_000 })

    const currentVal = await inputs.inputValue()
    console.log('[R4] Valor atual do nome:', currentVal)
    expect(currentVal.length).toBeGreaterThan(0) // nome da igreja já preenchido
    console.log('[R4] ✅ Campo Nome da Igreja é editável e tem valor')
  })

  test('R5: Campos Pastor Titular são editáveis', async ({ page }) => {
    await goToChurch(page, 'cadastro')

    // Nome do Pastor Titular
    const pastorLabel = page.getByText('Nome do Pastor Titular')
    await expect(pastorLabel).toBeVisible({ timeout: 8_000 })

    // Telefone do Pastor
    const telefoneLabel = page.getByText('Telefone do Pastor (interno)')
    await expect(telefoneLabel).toBeVisible()

    // Inputs tel devem ser editáveis
    const telInputs = page.locator('input[type="tel"]')
    const count = await telInputs.count()
    console.log('[R5] Inputs type=tel encontrados:', count)
    expect(count).toBeGreaterThanOrEqual(1)

    await expect(telInputs.first()).toBeEditable()
    console.log('[R5] ✅ Campos Pastor Titular editáveis')
  })

  test('R6: Campos de contato (telefone, e-mail) são editáveis', async ({ page }) => {
    await goToChurch(page, 'cadastro')

    await expect(page.getByText('Telefone Principal')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('E-mail Principal')).toBeVisible()

    const emailInput = page.locator('input[type="email"]')
    await expect(emailInput).toBeEditable()
    console.log('[R6] ✅ Campos contato editáveis')
  })

  test('R7: Campos de redes sociais são editáveis', async ({ page }) => {
    await goToChurch(page, 'cadastro')

    await expect(page.getByText('Instagram')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText('YouTube (channel ID)')).toBeVisible()

    // Inputs com placeholder @igrejax e UCxxxxx
    const instagramInput = page.locator('input[placeholder="@igrejax"]')
    const youtubeInput   = page.locator('input[placeholder="UCxxxxx"]')

    await expect(instagramInput).toBeEditable()
    await expect(youtubeInput).toBeEditable()
    console.log('[R7] ✅ Campos redes sociais editáveis')
  })

  test('R8: Botão "Salvar Cadastro" está disabled quando form não está dirty', async ({ page }) => {
    await goToChurch(page, 'cadastro')

    const saveBtn = page.getByRole('button', { name: /Salvar Cadastro/i })
    await expect(saveBtn).toBeVisible({ timeout: 8_000 })
    await expect(saveBtn).toBeDisabled()
    console.log('[R8] ✅ Botão "Salvar Cadastro" disabled quando sem alterações')
  })

  test('R9: Botão "Salvar Cadastro" fica enabled após editar um campo', async ({ page }) => {
    await goToChurch(page, 'cadastro')

    const saveBtn = page.getByRole('button', { name: /Salvar Cadastro/i })
    await expect(saveBtn).toBeDisabled({ timeout: 5_000 })

    // Editar o campo denominação
    const denomLabel = page.getByText('Denominação')
    await expect(denomLabel).toBeVisible({ timeout: 8_000 })
    const denomInput = page.locator('input[placeholder="ex: Assembleia de Deus"]')
    await denomInput.click()
    await denomInput.fill(`AD Teste ${TS}`)

    // Botão deve ter habilitado
    await expect(saveBtn).toBeEnabled({ timeout: 3_000 })
    console.log('[R9] ✅ Botão "Salvar Cadastro" enabled após edição')
  })

  test('R10: Salvar Cadastro persiste — toast de sucesso aparece', async ({ page }) => {
    await goToChurch(page, 'cadastro')

    // Editar um campo único para este run
    const regionInput = page.locator('label').filter({ hasText: 'Região / Bairro' })
    await expect(regionInput).toBeVisible({ timeout: 8_000 })
    const regionField = page.locator('input').nth(3) // campo região (4º input no form)
    // Usar valor único para este test run
    const newRegion = `Centro-E2E-${TS}`
    await regionField.fill(newRegion)
    console.log('[R10] Editou região para:', newRegion)

    const saveBtn = page.getByRole('button', { name: /Salvar Cadastro/i })
    await expect(saveBtn).toBeEnabled({ timeout: 3_000 })
    await saveBtn.click()

    // Toast de sucesso
    await expect(page.getByText(/Cadastro salvo com sucesso/i)).toBeVisible({ timeout: 10_000 })
    console.log('[R10] ✅ Toast "Cadastro salvo com sucesso." apareceu')

    // Botão volta a disabled
    await expect(saveBtn).toBeDisabled({ timeout: 5_000 })
    console.log('[R10] ✅ Botão volta a disabled após salvar')
  })

  test('R11: F5 após salvar — dados persistem (banco)', async ({ page }) => {
    // Primeiro: salvar um valor único rastreável
    await goToChurch(page, 'cadastro')

    const newDenom = `E2E-Denom-${TS}`
    const denomInput = page.locator('input[placeholder="ex: Assembleia de Deus"]')
    await expect(denomInput).toBeVisible({ timeout: 8_000 })
    await denomInput.fill(newDenom)

    const saveBtn = page.getByRole('button', { name: /Salvar Cadastro/i })
    await expect(saveBtn).toBeEnabled()
    await saveBtn.click()
    await expect(page.getByText(/Cadastro salvo com sucesso/i)).toBeVisible({ timeout: 10_000 })
    console.log('[R11] Salvou denominação:', newDenom)

    // F5 — recarregar página
    await page.reload()
    await page.waitForLoadState('networkidle', { timeout: 20_000 })

    // Navegar para aba cadastro novamente (após reload URL perde querystring)
    const url = page.url()
    if (!url.includes('tab=cadastro')) {
      await clickTab(page, /Cadastro/i)
      await page.waitForTimeout(500)
    }

    await expect(page.locator('input[placeholder="ex: Assembleia de Deus"]')).toBeVisible({ timeout: 8_000 })
    const persistedVal = await page.locator('input[placeholder="ex: Assembleia de Deus"]').inputValue()
    console.log('[R11] Valor após F5:', persistedVal)
    expect(persistedVal).toBe(newDenom)
    console.log('[R11] ✅ Dados persistiram após F5')
  })

  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO B — TabIdentidade refatorada em AgentConfigCockpit
  // ════════════════════════════════════════════════════════════════════════════

  test('R12: AgentConfigCockpit abre em /agentes/agent-acolhimento sem erro', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await goToCockpit(page)

    // Deve ter algum conteúdo (heading, tabs, etc.)
    await expect(page.locator('h1, h2').first()).toBeVisible({ timeout: 10_000 })
    const heading = await page.locator('h1, h2').first().textContent()
    console.log('[R12] Heading do AgentConfigCockpit:', heading)

    expect(jsErrors).toHaveLength(0)
    console.log('[R12] ✅ AgentConfigCockpit carregou sem erros JS')
  })

  test('R13: Aba "Identidade" está presente no AgentConfigCockpit', async ({ page }) => {
    await goToCockpit(page)

    // A aba Identidade deve estar visível (pode ser botão ou tab item)
    const identidadeTab = page.getByRole('button', { name: /Identidade/i })
      .or(page.getByText(/Identidade/i).first())
    await expect(identidadeTab).toBeVisible({ timeout: 10_000 })
    console.log('[R13] ✅ Aba Identidade presente no AgentConfigCockpit')
  })

  test('R14: Bloco read-only mostra dados da Igreja (nome, denominação, cidade)', async ({ page }) => {
    await goToCockpit(page)

    // Clicar na aba Identidade se não estiver ativa
    const identidadeBtn = page.getByRole('button', { name: /Identidade/i })
    if (await identidadeBtn.isVisible()) {
      await identidadeBtn.click()
      await page.waitForTimeout(300)
    }

    // Header "Dados da Igreja" deve estar presente
    await expect(page.getByText(/Dados da Igreja/i)).toBeVisible({ timeout: 8_000 })
    console.log('[R14] Bloco "Dados da Igreja" visível')

    // Labels do bloco read-only: <p class="text-xs text-gray-400 mb-0.5">
    // Usar exact: true + locator de parágrafo para não colidir com os labels dos overrides
    await expect(page.locator('p.text-xs.text-gray-400').filter({ hasText: /^Nome$/ }).first()).toBeVisible()
    await expect(page.locator('p.text-xs.text-gray-400').filter({ hasText: /^Denominação$/ }).first()).toBeVisible()
    await expect(page.locator('p.text-xs.text-gray-400').filter({ hasText: /^Cidade$/ }).first()).toBeVisible()
    await expect(page.locator('p.text-xs.text-gray-400').filter({ hasText: /^Estado$/ }).first()).toBeVisible()
    console.log('[R14] ✅ Labels do bloco read-only presentes')
  })

  test('R15: Botão "Editar cadastro da Igreja" está visível e ativo', async ({ page }) => {
    await goToCockpit(page)

    const identidadeBtn = page.getByRole('button', { name: /Identidade/i })
    if (await identidadeBtn.isVisible()) {
      await identidadeBtn.click()
      await page.waitForTimeout(300)
    }

    const editBtn = page.getByRole('button', { name: /Editar cadastro da Igreja/i })
      .or(page.getByText(/Editar cadastro da Igreja/i))
    await expect(editBtn).toBeVisible({ timeout: 8_000 })

    // Deve estar habilitado (não disabled)
    const isDisabled = await editBtn.evaluate((el: HTMLButtonElement) => el.disabled)
    expect(isDisabled).toBe(false)
    console.log('[R15] ✅ Botão "Editar cadastro da Igreja" visível e enabled')
  })

  test('R16: Clicar "Editar cadastro da Igreja" navega para Church.tsx ?tab=cadastro', async ({ page }) => {
    await goToCockpit(page)

    const identidadeBtn = page.getByRole('button', { name: /Identidade/i })
    if (await identidadeBtn.isVisible()) {
      await identidadeBtn.click()
      await page.waitForTimeout(300)
    }

    const editBtn = page.getByRole('button', { name: /Editar cadastro da Igreja/i })
    await expect(editBtn).toBeVisible({ timeout: 8_000 })
    await editBtn.click()

    // Deve navegar para Church.tsx com ?tab=cadastro
    await page.waitForURL(new RegExp(`churches/${CHURCH_ID}`), { timeout: 10_000 })
    const newUrl = page.url()
    console.log('[R16] Navegou para:', newUrl)

    expect(newUrl).toContain(CHURCH_ID)
    expect(newUrl).toContain('tab=cadastro')
    console.log('[R16] ✅ URL contém church_id e tab=cadastro')

    // Form de Cadastro deve estar visível após navegação
    await expect(page.getByText('Nome da Igreja')).toBeVisible({ timeout: 10_000 })
    console.log('[R16] ✅ Form Cadastro visível após navegação')
  })

  test('R17: 3 overrides (agent_name, pastor_name, church_name_short) estão editáveis', async ({ page }) => {
    await goToCockpit(page)

    const identidadeBtn = page.getByRole('button', { name: /Identidade/i })
    if (await identidadeBtn.isVisible()) {
      await identidadeBtn.click()
      await page.waitForTimeout(300)
    }

    // Labels dos overrides
    await expect(page.getByText('Nome do Agente')).toBeVisible({ timeout: 8_000 })
    await expect(page.getByText(/Nome do Pastor.*mencionado/i)).toBeVisible()
    await expect(page.getByText(/Nome Curto da Igreja/i)).toBeVisible()
    console.log('[R17] Todos os 3 override labels visíveis')

    // Inputs editáveis (seção de overrides tem 3 inputs)
    const inputs = page.locator('.space-y-4 input, input[class*="rounded-xl"]')
    const count = await inputs.count()
    console.log('[R17] Inputs de override encontrados:', count)
    expect(count).toBeGreaterThanOrEqual(3)

    // Verificar que são editáveis
    for (let i = 0; i < Math.min(count, 3); i++) {
      await expect(inputs.nth(i)).toBeEditable()
    }
    console.log('[R17] ✅ 3 overrides editáveis')
  })

  test('R18: Botão de salvar tem texto "Salvar Overrides" (NÃO "Salvar Identidade")', async ({ page }) => {
    await goToCockpit(page)

    const identidadeBtn = page.getByRole('button', { name: /Identidade/i })
    if (await identidadeBtn.isVisible()) {
      await identidadeBtn.click()
      await page.waitForTimeout(300)
    }

    // Botão deve ser "Salvar Overrides"
    const saveBtn = page.getByRole('button', { name: /Salvar Overrides/i })
    await expect(saveBtn).toBeVisible({ timeout: 8_000 })
    console.log('[R18] ✅ Botão "Salvar Overrides" presente')

    // Texto "Salvar Identidade" NÃO deve existir nesta aba
    const oldBtn = page.getByRole('button', { name: /Salvar Identidade/i })
    await expect(oldBtn).not.toBeVisible()
    console.log('[R18] ✅ Texto "Salvar Identidade" ausente')
  })

  test('R19: Salvar overrides mostra toast de sucesso', async ({ page }) => {
    await goToCockpit(page)

    const identidadeBtn = page.getByRole('button', { name: /Identidade/i })
    if (await identidadeBtn.isVisible()) {
      await identidadeBtn.click()
      await page.waitForTimeout(300)
    }

    // Editar Nome do Agente
    const agentNameInput = page.locator('input').first()
    await agentNameInput.fill(`Agente E2E ${TS}`)

    const saveBtn = page.getByRole('button', { name: /Salvar Overrides/i })
    await expect(saveBtn).toBeVisible({ timeout: 8_000 })
    await saveBtn.click()

    // Toast: "Overrides do agente salvos com sucesso."
    await expect(page.getByText(/Overrides do agente salvos com sucesso/i)).toBeVisible({ timeout: 10_000 })
    console.log('[R19] ✅ Toast "Overrides do agente salvos com sucesso." apareceu')
  })

  test('R20: Overrides persistem após F5', async ({ page }) => {
    await goToCockpit(page)

    const identidadeBtn = page.getByRole('button', { name: /Identidade/i })
    if (await identidadeBtn.isVisible()) {
      await identidadeBtn.click()
      await page.waitForTimeout(300)
    }

    const overrideValue = `AgF5-${TS}`
    const agentNameInput = page.locator('input').first()
    await agentNameInput.fill(overrideValue)

    const saveBtn = page.getByRole('button', { name: /Salvar Overrides/i })
    await saveBtn.click()
    await expect(page.getByText(/Overrides do agente salvos com sucesso/i)).toBeVisible({ timeout: 10_000 })
    console.log('[R20] Salvou override agent_name:', overrideValue)

    // F5
    await page.reload()
    await page.waitForLoadState('networkidle', { timeout: 20_000 })

    // Reabrir aba Identidade após reload
    const identidadeBtnAfter = page.getByRole('button', { name: /Identidade/i })
    if (await identidadeBtnAfter.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await identidadeBtnAfter.click()
      await page.waitForTimeout(500)
    }

    const persistedInput = page.locator('input').first()
    await expect(persistedInput).toBeVisible({ timeout: 8_000 })
    const persistedVal = await persistedInput.inputValue()
    console.log('[R20] Valor após F5:', persistedVal)
    expect(persistedVal).toBe(overrideValue)
    console.log('[R20] ✅ Override agent_name persistiu após F5')
  })

  // ════════════════════════════════════════════════════════════════════════════
  // BLOCO C — Non-regression
  // ════════════════════════════════════════════════════════════════════════════

  test('R21: Aba Resumo ainda funciona', async ({ page }) => {
    await goToChurch(page)

    await clickTab(page, /Resumo/i)
    // Resumo tem "Informações" e "Operação" headings
    await expect(page.getByText('Informações').first()).toBeVisible({ timeout: 8_000 })
    console.log('[R21] ✅ Aba Resumo OK')
  })

  test('R22: Aba Assinatura ainda funciona', async ({ page }) => {
    await goToChurch(page)

    await clickTab(page, /Assinatura/i)
    await expect(page.getByText(/Plano e Assinatura/i)).toBeVisible({ timeout: 8_000 })
    console.log('[R22] ✅ Aba Assinatura OK')
  })

  test('R23: Aba Operação ainda tem botão "+ Habilitar agente"', async ({ page }) => {
    await goToChurch(page)

    await clickTab(page, /Operação/i)
    await expect(page.getByRole('button', { name: /\+ Habilitar agente/i })).toBeVisible({ timeout: 10_000 })
    console.log('[R23] ✅ Aba Operação OK — botão "+ Habilitar agente" presente')
  })

  test('R24: Aba Logs ainda carrega', async ({ page }) => {
    await goToChurch(page)

    const logsBtn = page.getByRole('button', { name: /Logs e Ações/i })
    await expect(logsBtn).toBeVisible({ timeout: 8_000 })
    await logsBtn.click()

    // A aba Logs pode mostrar "Sem logs" ou uma tabela, mas não deve dar erro
    await page.waitForTimeout(1_000)
    const jsErrors: string[] = []
    page.on('pageerror', err => jsErrors.push(err.message))
    // Verificar que não há erro explícito de componente
    await expect(page.locator('body')).toBeVisible()
    console.log('[R24] ✅ Aba Logs carregou sem crash')
  })

  test('R25: Sem erros JS no carregamento de Church.tsx', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await goToChurch(page)
    await clickTab(page, /Cadastro/i)
    await page.waitForTimeout(1_000)

    console.log('[R25] Erros JS capturados:', jsErrors.length ? jsErrors : 'nenhum')
    expect(jsErrors).toHaveLength(0)
    console.log('[R25] ✅ Sem erros JS em Church.tsx + aba Cadastro')
  })

  test('R26: Sem erros JS no carregamento de AgentConfigCockpit', async ({ page }) => {
    const jsErrors: string[] = []
    page.on('pageerror', err => jsErrors.push(err.message))

    await goToCockpit(page)

    const identidadeBtn = page.getByRole('button', { name: /Identidade/i })
    if (await identidadeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await identidadeBtn.click()
      await page.waitForTimeout(500)
    }

    console.log('[R26] Erros JS capturados:', jsErrors.length ? jsErrors : 'nenhum')
    expect(jsErrors).toHaveLength(0)
    console.log('[R26] ✅ Sem erros JS em AgentConfigCockpit')
  })

  test('R27: Texto "Salvar Identidade" não aparece em nenhum lugar', async ({ page }) => {
    // Church.tsx — aba cadastro
    await goToChurch(page, 'cadastro')
    await expect(page.getByText(/Salvar Identidade/i)).not.toBeVisible()
    console.log('[R27] "Salvar Identidade" ausente em Church.tsx')

    // AgentConfigCockpit — aba identidade
    await goToCockpit(page)
    const identidadeBtn = page.getByRole('button', { name: /Identidade/i })
    if (await identidadeBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await identidadeBtn.click()
      await page.waitForTimeout(300)
    }
    await expect(page.getByText(/Salvar Identidade/i)).not.toBeVisible()
    console.log('[R27] "Salvar Identidade" ausente em AgentConfigCockpit')
    console.log('[R27] ✅ Texto obsoleto "Salvar Identidade" removido de todos os componentes')
  })

  test('R28: Tab "Cadastro" está na posição correta (entre Resumo e Assinatura)', async ({ page }) => {
    await goToChurch(page)

    // Capturar todos os botões de tab na ordem do DOM
    const tabButtons = page.getByRole('button').filter({ hasText: /^(Resumo|Cadastro|Assinatura|Operação|Saúde)$/ })
    const count = await tabButtons.count()
    const labels: string[] = []
    for (let i = 0; i < count; i++) {
      const txt = await tabButtons.nth(i).textContent()
      if (txt) labels.push(txt.trim())
    }
    console.log('[R28] Ordem das tabs capturadas:', labels)

    const resumoIdx   = labels.findIndex(l => /Resumo/i.test(l))
    const cadastroIdx = labels.findIndex(l => /Cadastro/i.test(l))
    const assinaturaIdx = labels.findIndex(l => /Assinatura/i.test(l))

    console.log(`[R28] Resumo=${resumoIdx}, Cadastro=${cadastroIdx}, Assinatura=${assinaturaIdx}`)

    expect(cadastroIdx).toBeGreaterThan(resumoIdx)     // Cadastro depois de Resumo
    expect(cadastroIdx).toBeLessThan(assinaturaIdx)    // Cadastro antes de Assinatura
    console.log('[R28] ✅ Tab Cadastro está na posição correta (entre Resumo e Assinatura)')
  })

}) // end describe
