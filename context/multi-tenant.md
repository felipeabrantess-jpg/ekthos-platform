# Documentação Técnica: Multi-Tenancy no Ekthos Platform

## Arquitetura de Isolamento

O Ekthos utiliza o modelo de **multi-tenancy por discriminador de linha** (row-level multi-tenancy): um único banco de dados PostgreSQL compartilhado entre todos os tenants, com isolamento garantido pela coluna `church_id` presente em todas as tabelas de dados, combinado com Row Level Security (RLS) no nível do banco.

Esta abordagem foi escolhida por:
- **Custo**: Muito mais econômico que um banco por tenant
- **Simplicidade operacional**: Uma única instância para gerenciar, fazer backup e monitorar
- **Performance**: Índices compartilhados, pool de conexões eficiente
- **Segurança**: RLS no nível do banco é mais confiável que filtragem na aplicação

O risco desta abordagem (que seria o vazamento de dados entre tenants) é mitigado por múltiplas camadas de segurança descritas neste documento.

---

## Como church_id Flui pelo Sistema

### Origem do church_id

O `church_id` sempre tem origem no banco de dados — nunca no cliente. A cadeia de confiança é:

```
Token JWT (emitido pelo Supabase Auth)
    ↓
user_id (campo sub do JWT)
    ↓
Tabela profiles (profiles.church_id WHERE user_id = auth.uid())
    ↓
church_id confiável e validado
```

### Propagação do church_id

```
Requisição HTTP chega com Bearer Token
    ↓
Edge Function valida o JWT → obtém user_id
    ↓
Edge Function busca profiles.church_id → obtém church_id
    ↓
TODAS as queries usam este church_id (nunca aceito do body ou query params)
    ↓
RLS do banco valida novamente (dupla camada de segurança)
```

### Em Webhooks (sem JWT)

```
Webhook chega com X-Webhook-Token no header
    ↓
Edge Function busca integrations WHERE webhook_token = X-Webhook-Token
    ↓
Obtém church_id da integração (validado via tabela)
    ↓
Todas as operações subsequentes usam este church_id
```

---

## Row Level Security (RLS) no Supabase

### Funções Auxiliares

```sql
-- Obtém church_id do usuário autenticado
CREATE OR REPLACE FUNCTION get_current_church_id()
RETURNS UUID AS $$
  SELECT church_id
  FROM profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Verifica se o usuário é super admin da plataforma
CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_admins
    WHERE user_id = auth.uid()
    AND is_active = true
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Verifica papel do usuário no tenant
CREATE OR REPLACE FUNCTION has_church_role(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role = required_role
      AND church_id = get_current_church_id()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
```

### Padrão de Políticas RLS por Tabela

```sql
-- Exemplo completo para a tabela 'people'

-- Ativar RLS
ALTER TABLE people ENABLE ROW LEVEL SECURITY;

-- SELECT: usuário vê apenas pessoas do seu tenant
CREATE POLICY "people_select_own_tenant" ON people
  FOR SELECT
  USING (
    church_id = get_current_church_id()
    OR is_platform_admin()
  );

-- INSERT: usuário insere apenas no seu tenant
CREATE POLICY "people_insert_own_tenant" ON people
  FOR INSERT
  WITH CHECK (
    church_id = get_current_church_id()
    AND NOT is_platform_admin()  -- admin usa service role
    OR is_platform_admin()
  );

-- UPDATE: usuário atualiza apenas no seu tenant
CREATE POLICY "people_update_own_tenant" ON people
  FOR UPDATE
  USING (church_id = get_current_church_id() OR is_platform_admin())
  WITH CHECK (church_id = get_current_church_id() OR is_platform_admin());

-- DELETE: apenas admins da igreja podem fazer soft delete
CREATE POLICY "people_delete_church_admin_only" ON people
  FOR DELETE
  USING (
    (church_id = get_current_church_id() AND has_church_role('church_admin'))
    OR is_platform_admin()
  );
```

---

## Onboarding de Novo Tenant

### Sequência de Criação

```sql
-- Passo 1: Criar a church (via service role — admin da plataforma)
INSERT INTO churches (name, slug, city, state, timezone, pastor_name)
VALUES ('Igreja da Graça', 'igreja-graca', 'São Paulo', 'SP', 'America/Sao_Paulo', 'João Silva')
RETURNING id AS church_id;

-- Passo 2: Criar configurações do tenant
INSERT INTO church_settings (
  church_id, tone, terminology, enabled_modules,
  business_hours, escalation_contact, use_emojis, auto_approval_limit
)
VALUES (
  '{church_id}',
  'carinhoso',
  '{"groups": "células", "members": "membros", "leader": "pastor", "meeting": "culto"}',
  '["whatsapp", "instagram", "donations"]',
  '{"weekdays": {"start": "09:00", "end": "18:00"}, "saturday": {"start": "09:00", "end": "13:00"}}',
  '+5511999990000',
  true,
  500.00
);

-- Passo 3: Criar primeiro usuário admin (via Supabase Auth)
-- [Feito via API do Supabase Auth, não diretamente no banco]

-- Passo 4: Criar profile vinculado ao tenant
INSERT INTO profiles (user_id, church_id, display_name, email)
VALUES ('{user_id_gerado}', '{church_id}', 'Admin Igreja da Graça', 'admin@igrejadagraca.com.br');

-- Passo 5: Atribuir papel de admin
INSERT INTO user_roles (user_id, church_id, role)
VALUES ('{user_id_gerado}', '{church_id}', 'church_admin');

-- Passo 6: Registrar integrações
INSERT INTO integrations (church_id, type, webhook_token, is_active, config)
VALUES
  ('{church_id}', 'whatsapp', gen_random_uuid(), false, '{"status": "pending_configuration"}'),
  ('{church_id}', 'instagram', gen_random_uuid(), false, '{"status": "pending_configuration"}');
```

---

## Offboarding de Tenant

### Processo de Encerramento

O offboarding é um processo reversível por 90 dias, após o qual os dados são permanentemente excluídos.

```sql
-- Fase 1: Soft-disable (imediato)
UPDATE churches
SET
  is_active = false,
  disabled_at = NOW(),
  disabled_reason = 'Encerramento solicitado pelo titular'
WHERE id = '{church_id}';

-- Desativar todas as integrações
UPDATE integrations
SET is_active = false
WHERE church_id = '{church_id}';

-- Fase 2: Anonimização parcial (após 30 dias de inatividade)
-- Executado por job agendado
UPDATE people
SET
  name = 'MEMBRO_ANONIMIZADO',
  email = NULL,
  phone = NULL,
  cpf = NULL,
  anonymized_at = NOW()
WHERE church_id = '{church_id}'
  AND anonymized_at IS NULL;

-- Fase 3: Exclusão definitiva (após 90 dias)
-- REQUER: aprovação manual do super admin da plataforma
-- GERA: relatório de exclusão para fins de auditoria
DELETE FROM churches WHERE id = '{church_id}' AND disabled_at < NOW() - INTERVAL '90 days';
-- Cascade apaga todos os dados relacionados via FK CASCADE
```

---

## Limites e Quotas por Tenant

```typescript
interface TenantQuotas {
  maxMembers: number;              // Máx de pessoas na tabela people
  maxMonthlyMessages: number;      // Mensagens via WhatsApp/mês
  maxActiveWorkflows: number;      // Workflows simultâneos no n8n
  maxStorageGb: number;            // Armazenamento no Supabase Storage
  maxApiCallsPerMinute: number;    // Rate limit de API
  maxCampaignRecipients: number;   // Máx de destinatários por campanha
}

// Planos disponíveis (hardcoded aqui apenas para referência — no banco em 'plans')
const PLAN_QUOTAS: Record<string, TenantQuotas> = {
  starter: {
    maxMembers: 500,
    maxMonthlyMessages: 1000,
    maxActiveWorkflows: 3,
    maxStorageGb: 1,
    maxApiCallsPerMinute: 60,
    maxCampaignRecipients: 200,
  },
  growth: {
    maxMembers: 3000,
    maxMonthlyMessages: 10000,
    maxActiveWorkflows: 10,
    maxStorageGb: 10,
    maxApiCallsPerMinute: 300,
    maxCampaignRecipients: 1000,
  },
  enterprise: {
    maxMembers: -1,              // Ilimitado
    maxMonthlyMessages: -1,      // Ilimitado
    maxActiveWorkflows: -1,
    maxStorageGb: 100,
    maxApiCallsPerMinute: 1000,
    maxCampaignRecipients: -1,
  },
};
```

---

## Testes de Isolamento

Os seguintes testes devem ser executados após qualquer mudança significativa na camada de acesso a dados:

```typescript
// Teste 1: Tenant A não vê dados do Tenant B
async function testTenantIsolation(): Promise<void> {
  const clientA = createAuthenticatedClient(USER_A_TOKEN); // tenant A
  const clientB = createAuthenticatedClient(USER_B_TOKEN); // tenant B

  // Criar dado no tenant B
  await clientB.from('people').insert({ name: 'Pessoa do Tenant B', church_id: CHURCH_B_ID });

  // Tenant A NÃO deve ver esse dado
  const { data } = await clientA.from('people').select('*');
  const leaked = data?.some(p => p.church_id === CHURCH_B_ID);

  assert(!leaked, 'FALHA DE ISOLAMENTO: Tenant A vê dados do Tenant B!');
}

// Teste 2: Não é possível fazer update em dados de outro tenant
async function testCrossUpdatePrevented(): Promise<void> {
  const clientA = createAuthenticatedClient(USER_A_TOKEN);

  // Tenant A tenta atualizar pessoa do Tenant B
  const { error } = await clientA
    .from('people')
    .update({ name: 'Hackeado' })
    .eq('id', PERSON_FROM_TENANT_B_ID);

  assert(error !== null, 'FALHA: Tenant A conseguiu atualizar dado do Tenant B!');
}
```
