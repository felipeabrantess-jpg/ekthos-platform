# Rule: Arquitetura Multi-Tenant

> **Versão:** 1.0.0 | **Status:** Ativo — produção | **Revisão:** 2026-04-07

---

## 1. Decisão Arquitetural — Schema Único com RLS

O Ekthos adota **schema único com Row Level Security** — não schema separado por tenant.

### Por que não schema separado?

| Critério | Schema por tenant | Schema único com RLS |
|---|---|---|
| Isolamento | Forte (separação física) | Forte (RLS enforced pelo banco) |
| Número de tenants | Limitado (100-200 prático) | Ilimitado |
| Migrations | Complexas (N deploys) | Simples (1 deploy) |
| Custo de infra | Alto (N databases) | Baixo (1 database) |
| Onboarding de novo tenant | Lento (cria schema, migra) | Instantâneo (INSERT na tabela) |
| Backup | N backups | 1 backup |
| Monitoramento | N instâncias | 1 instância |
| Risco de configuração errada | Alto por tenant | Centralizado e auditável |

### Por que não tenant_id como coluna simples sem RLS?

Sem RLS, o isolamento depende 100% do código. Um bug em qualquer query pode vazar dados de outro tenant. Com RLS, o banco bloqueia o acesso mesmo se o código tiver um bug. É defesa em profundidade.

### Decisão final e definitiva

```
Schema único → PostgreSQL com RLS em 100% das tabelas com dados de tenant
church_id   → UUID obrigatório em toda tabela de dados (não opcional, sem default)
RLS         → Ativado via ALTER TABLE, política por tenant via auth.uid()
```

---

## 2. Routing de Tenant

O `church_id` deve ser identificado no ponto de entrada. O método varia por tipo de entrada:

### 2.1 Requisição HTTP (API)

```typescript
// JWT do Supabase Auth contém auth.uid()
// church_id é buscado via profile do usuário autenticado

async function extractChurchId(authHeader: string): Promise<string> {
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) throw new Error('Token inválido')

  const { data: profile } = await supabase
    .from('profiles')
    .select('church_id')
    .eq('id', user.id)
    .single()

  if (!profile?.church_id) throw new Error('Tenant não encontrado para este usuário')
  return profile.church_id
}
```

### 2.2 Webhook recebido

```typescript
// Identifica tenant pelo dado de roteamento do sistema externo
// Ex: WhatsApp usa phone_number_id; Stripe usa metadata.church_id

async function extractChurchIdFromWebhook(
  system: string,
  payload: Record<string, unknown>
): Promise<string | null> {
  switch (system) {
    case 'whatsapp': {
      const phoneId = (payload as any).entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id
      const { data } = await supabase
        .from('integrations')
        .select('church_id')
        .eq('system', 'whatsapp')
        .contains('config', { phone_number_id: phoneId })
        .single()
      return data?.church_id ?? null
    }

    case 'stripe': {
      const churchId = (payload as any).data?.object?.metadata?.church_id
      return churchId ?? null
    }

    case 'instagram': {
      const accountId = (payload as any).entry?.[0]?.id
      const { data } = await supabase
        .from('integrations')
        .select('church_id')
        .eq('system', 'instagram')
        .contains('config', { account_id: accountId })
        .single()
      return data?.church_id ?? null
    }

    default:
      return null
  }
}
```

### 2.3 Agente (WhatsApp, Instagram)

```
O agente carrega church_id a partir do número/conta configurado na tabela integrations.
Nunca aceita church_id enviado pelo usuário final — sempre busca do banco.
```

### 2.4 Workflow n8n

```
n8n recebe church_id no payload inicial do trigger.
O trigger é sempre gerado pelo Ekthos (Supabase webhook ou schedule interno).
n8n NUNCA usa church_id de origem externa sem validar no banco.
```

---

## 3. Feature Flags por Tenant

### 3.1 Estrutura em church_settings

```sql
-- Coluna modules_enabled em church_settings
CREATE TABLE church_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id        UUID UNIQUE NOT NULL REFERENCES churches(id),
  modules_enabled  JSONB NOT NULL DEFAULT '{}',
  labels           JSONB NOT NULL DEFAULT '{}',
  colors           JSONB NOT NULL DEFAULT '{}',
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### 3.2 Estrutura de modules_enabled

```json
{
  "whatsapp_agent": true,
  "instagram_agent": false,
  "pipeline_members": true,
  "donations": true,
  "campaigns": true,
  "financial_reports": false,
  "multi_campus": false,
  "advanced_segmentation": false
}
```

### 3.3 Como verificar antes de executar

```typescript
async function isModuleEnabled(
  church_id: string,
  module: string
): Promise<boolean> {
  const { data } = await supabase
    .from('church_settings')
    .select('modules_enabled, onboarding_completed')
    .eq('church_id', church_id)
    .single()

  // Onboarding não concluído = nenhum módulo ativo
  if (!data?.onboarding_completed) return false

  return data?.modules_enabled?.[module] === true
}

// Uso obrigatório antes de qualquer operação de módulo
async function executeIfEnabled(
  church_id: string,
  module: string,
  operation: () => Promise<void>
): Promise<void> {
  const enabled = await isModuleEnabled(church_id, module)
  if (!enabled) {
    throw new Error(`Módulo '${module}' não habilitado para o tenant ${church_id}`)
  }
  await operation()
}
```

---

## 4. Onboarding como Gate

### 4.1 Princípio absoluto

Nenhum módulo opera antes do onboarding estar marcado como concluído em `church_settings.onboarding_completed = true`.

Sem onboarding completo, qualquer tentativa de usar módulos retorna erro controlado — não silencia, não degrada, não ignora.

### 4.2 Checklist completo de onboarding

O onboarding só é marcado como concluído quando todos os itens abaixo estão verificados:

```
[ ] 1. Registro na tabela churches com dados válidos
        - name, slug (único), timezone, contact_email
        - status = 'active'

[ ] 2. church_settings criado com módulos selecionados
        - modules_enabled mapeado com base nas respostas
        - labels customizados (terminologia própria)
        - onboarding_completed = false (ainda)

[ ] 3. context/tenants/{slug}.md gerado com:
        - Identidade da igreja
        - Terminologia própria validada
        - Tom de comunicação definido
        - Restrições e escaladas configuradas

[ ] 4. Integrações configuradas (apenas as selecionadas)
        - Tokens no Vault com chave padronizada
        - Registro em tabela integrations com status='active'
        - Teste de conectividade aprovado

[ ] 5. Usuário admin criado em profiles com church_id correto
        - role = 'admin' na tabela user_roles
        - Convite enviado por e-mail

[ ] 6. Audit log de criação do tenant inserido em audit_logs
        - action = 'tenant.created'
        - metadata com dados do onboarding (sem secrets)

[ ] 7. Notificação enviada para equipe Ekthos
        - Resumo do tenant
        - Módulos ativos
        - Integrações configuradas

[ ] 8. onboarding_completed = true (último passo — desbloqueia os módulos)
```

---

## 5. Adição de Tenant sem Downtime

Adicionar um novo tenant é uma operação de dados — não de infra. Nenhum serviço precisa reiniciar.

### Procedimento passo a passo

```
PASSO 1: Validações pré-criação
  - Verificar que o slug é único: SELECT id FROM churches WHERE slug = $1
  - Verificar que o e-mail de admin não existe em outro tenant ativo
  - Verificar que o timezone é válido

PASSO 2: Transação atômica de criação
  BEGIN;
    INSERT INTO churches (name, slug, timezone, contact_email, status)
    VALUES ($name, $slug, $timezone, $email, 'onboarding');

    INSERT INTO church_settings (church_id, modules_enabled, labels, onboarding_completed)
    VALUES ($church_id, $modules, $labels, false);
  COMMIT;

PASSO 3: Configurar integrações (fora da transação)
  Para cada integração selecionada:
    - Armazenar token no Vault com chave: {church_id}_{sistema}_{tipo}
    - INSERT em integrations com status='testing'
    - Executar teste de conectividade
    - UPDATE integrations SET status='active' se sucesso

PASSO 4: Gerar arquivo de contexto
  - Criar context/tenants/{slug}.md via script/edge-function
  - Commit no repositório via GitHub API (se versionado no git)

PASSO 5: Criar usuário admin
  - supabase.auth.admin.createUser com e-mail do admin
  - INSERT em profiles com church_id e dados básicos
  - INSERT em user_roles com role='admin'
  - Enviar convite por e-mail via Supabase Auth

PASSO 6: Finalizar onboarding
  - UPDATE church_settings SET onboarding_completed = true
  - INSERT em audit_logs (action: 'tenant.created')
  - Notificar equipe Ekthos

PASSO 7: Verificação pós-criação
  - Verificar que RLS está funcionando: testar query com outro tenant
  - Verificar que agentes respondem corretamente para o novo tenant
  - Verificar que workflows n8n estão ativos
```

---

## 6. Limites por Tenant

Limites são configurados em `church_settings.labels.limits` e verificados antes de operações em massa.

### Limites padrão (ajustáveis por plano)

```json
{
  "limits": {
    "contacts_max": 10000,
    "messages_per_day": 5000,
    "campaigns_per_month": 20,
    "storage_gb": 10,
    "automations_concurrent": 5,
    "integrations_max": 5,
    "api_requests_per_minute": 100
  }
}
```

### Verificação de limite antes de operação

```typescript
async function checkTenantLimit(
  church_id: string,
  limitKey: string,
  currentValue: number
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const { data: settings } = await supabase
    .from('church_settings')
    .select('labels')
    .eq('church_id', church_id)
    .single()

  const limit = settings?.labels?.limits?.[limitKey] ?? getDefaultLimit(limitKey)

  return {
    allowed: currentValue < limit,
    limit,
    current: currentValue
  }
}
```

---

## 7. Offboarding

### 7.1 Soft delete — nunca hard delete imediato

```sql
-- Marcar tenant como inativo (não deleta dados)
UPDATE churches
SET status = 'inactive', deactivated_at = NOW(), deactivated_reason = $reason
WHERE id = $church_id;

-- Desativar todas as integrações
UPDATE integrations
SET status = 'inactive'
WHERE church_id = $church_id;

-- Revogar acessos dos usuários (mas manter os perfis)
UPDATE profiles
SET is_active = false
WHERE church_id = $church_id;
```

### 7.2 Retenção de dados — LGPD

```
Dados operacionais (interactions, audit_logs): retidos por 5 anos
Dados pessoais (people): retidos por 2 anos após inativação
Dados financeiros (donations): retidos por 5 anos (obrigação fiscal)
Dados de autenticação (profiles): retidos por 90 dias, depois anonimizados
```

### 7.3 Direito ao esquecimento (LGPD Art. 18)

Quando solicitado formalmente:
```sql
-- Anonimiza dados pessoais (não deleta — mantém estrutura para auditoria)
UPDATE people
SET
  name = 'Pessoa Removida',
  email = NULL,
  phone = NULL,
  cpf = NULL,
  address = NULL,
  tags = '[]',
  external_ids = '{}',
  anonymized_at = NOW()
WHERE church_id = $church_id AND id = $person_id;

INSERT INTO audit_logs (church_id, action, actor, metadata)
VALUES ($church_id, 'person.anonymized', $requested_by, '{"reason": "lgpd_request"}');
```

---

## 8. Regras Numeradas

```
MTA-01: Toda tabela de dados de tenant DEVE ter church_id UUID NOT NULL REFERENCES churches(id)
MTA-02: RLS DEVE estar habilitado em 100% das tabelas com dados de tenant — sem exceção
MTA-03: church_id NUNCA vem do payload do cliente — sempre extraído do JWT ou da integração
MTA-04: Nenhum módulo opera antes de church_settings.onboarding_completed = true
MTA-05: Feature flags são verificados antes de toda operação de módulo
MTA-06: Novos tenants são criados via transação atômica — não por passos manuais avulsos
MTA-07: Limites por tenant são verificados antes de operações em massa
MTA-08: Offboarding é sempre soft delete — nunca hard delete imediato de dados
MTA-09: Dados pessoais anonimizados preservam a estrutura de auditoria (IDs e timestamps)
MTA-10: Contexto de tenant (context/tenants/{slug}.md) NUNCA é compartilhado entre tenants
MTA-11: Queries de administração global (cross-tenant) só são executadas com service_role — nunca com JWT de usuário
MTA-12: Todo acesso cross-tenant (relatórios da plataforma) é registrado em audit_logs com severity='info'
```

---

## 9. Exemplo de Middleware TypeScript

Middleware que extrai e valida `church_id` em toda requisição. Para ser usado em todas as Edge Functions.

```typescript
// supabase/functions/_shared/tenant-middleware.ts

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface TenantContext {
  church_id: string
  slug: string
  onboarding_completed: boolean
  modules_enabled: Record<string, boolean>
  labels: Record<string, unknown>
  trace_id: string
}

export class TenantValidationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'TenantValidationError'
  }
}

export async function extractTenantContext(
  req: Request,
  supabase: SupabaseClient
): Promise<TenantContext> {
  // 1. Extrai e valida o JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    throw new TenantValidationError('Token ausente', 'AUTH_MISSING', 401)
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)

  if (authError || !user) {
    throw new TenantValidationError('Token inválido ou expirado', 'AUTH_INVALID', 401)
  }

  // 2. Busca profile e church_id — church_id NUNCA vem do payload
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('church_id, is_active')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    throw new TenantValidationError('Perfil não encontrado', 'PROFILE_NOT_FOUND', 403)
  }

  if (!profile.is_active) {
    throw new TenantValidationError('Usuário inativo', 'USER_INACTIVE', 403)
  }

  if (!profile.church_id) {
    throw new TenantValidationError('Usuário sem tenant associado', 'NO_TENANT', 403)
  }

  // 3. Carrega configurações do tenant
  const { data: church, error: churchError } = await supabase
    .from('churches')
    .select('id, slug, status')
    .eq('id', profile.church_id)
    .single()

  if (churchError || !church) {
    throw new TenantValidationError('Tenant não encontrado', 'TENANT_NOT_FOUND', 404)
  }

  if (church.status === 'inactive') {
    throw new TenantValidationError('Tenant inativo', 'TENANT_INACTIVE', 403)
  }

  const { data: settings, error: settingsError } = await supabase
    .from('church_settings')
    .select('modules_enabled, labels, onboarding_completed')
    .eq('church_id', profile.church_id)
    .single()

  if (settingsError || !settings) {
    throw new TenantValidationError('Configurações do tenant não encontradas', 'SETTINGS_NOT_FOUND', 500)
  }

  // 4. Retorna contexto validado
  return {
    church_id: profile.church_id,
    slug: church.slug,
    onboarding_completed: settings.onboarding_completed,
    modules_enabled: (settings.modules_enabled ?? {}) as Record<string, boolean>,
    labels: (settings.labels ?? {}) as Record<string, unknown>,
    trace_id: req.headers.get('X-Request-ID') ?? crypto.randomUUID()
  }
}

// Helper: verifica módulo e lança erro se desabilitado
export function requireModule(
  context: TenantContext,
  module: string
): void {
  if (!context.onboarding_completed) {
    throw new TenantValidationError(
      'Onboarding não concluído para este tenant',
      'ONBOARDING_INCOMPLETE',
      403
    )
  }

  if (!context.modules_enabled[module]) {
    throw new TenantValidationError(
      `Módulo '${module}' não habilitado para este tenant`,
      'MODULE_DISABLED',
      403
    )
  }
}

// Wrapper para Edge Functions — captura erros de validação de tenant
export function withTenantContext(
  handler: (req: Request, context: TenantContext, supabase: SupabaseClient) => Promise<Response>
) {
  return async (req: Request): Promise<Response> => {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    try {
      const context = await extractTenantContext(req, supabase)
      return await handler(req, context, supabase)
    } catch (error) {
      if (error instanceof TenantValidationError) {
        return new Response(
          JSON.stringify({ error: error.message, code: error.code }),
          { status: error.status, headers: { 'Content-Type': 'application/json' } }
        )
      }
      // Erro inesperado — não vaza detalhes internos
      console.error('Erro interno:', error)
      return new Response(
        JSON.stringify({ error: 'Erro interno do servidor', code: 'INTERNAL_ERROR' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }
  }
}

// Uso em Edge Function:
//
// import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
// import { withTenantContext, requireModule } from '../_shared/tenant-middleware.ts'
//
// serve(withTenantContext(async (req, context, supabase) => {
//   requireModule(context, 'campaigns')
//   // ... lógica da edge function usando context.church_id
//   return new Response(JSON.stringify({ ok: true }), { status: 200 })
// }))
```
