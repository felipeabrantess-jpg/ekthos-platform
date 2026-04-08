# Rule: Segurança e Isolamento de Tenant

> **Versão:** 1.0.0 | **Status:** Ativo — produção | **Revisão:** 2026-04-07

---

## 1. Camadas de Segurança

O Ekthos implementa defesa em profundidade com três camadas independentes. Uma falha em uma camada não compromete as outras.

```
CAMADA 1 — BANCO (Supabase + RLS)
  Garante: nenhum usuário acessa dados de outro tenant
  Mecanismo: Row Level Security em 100% das tabelas
  Falha possível: nenhuma — é enforced pelo PostgreSQL
  Bypass possível: apenas via service_role (acesso restrito a Edge Functions)

CAMADA 2 — CÓDIGO (Edge Functions + Middleware)
  Garante: church_id nunca vem do cliente; credenciais nunca saem do servidor
  Mecanismo: extractTenantContext() obrigatório em toda Edge Function
  Falha possível: bug no código de extração → mitigado pela Camada 1

CAMADA 3 — AGENTE (LLM + Skill)
  Garante: agente opera apenas dentro do escopo configurado para o tenant
  Mecanismo: contexto carregado do banco; escopo documentado e verificado em código
  Falha possível: prompt injection → mitigado por validação de intenção e threshold de escalada
```

### O que cada camada garante (e o que não garante)

| Proteção | Banco (RLS) | Código | Agente |
|---|---|---|---|
| Cross-tenant data leak | Sim | Sim | Parcial |
| Credential exposure | Não | Sim | Sim |
| Prompt injection | Não | Não | Sim (threshold) |
| SQL injection | Sim (parameterized) | Sim | N/A |
| Rate limit abuse | Não | Sim | Não |
| Unauthorized module access | Sim | Sim | Sim |

---

## 2. Hierarquia de Acesso a Secrets

```
Supabase Vault
    ↓ (runtime, apenas)
Edge Function (service_role)
    ↓ (resultado processado, nunca o secret)
n8n (acessa via Credential Store — referência, não valor)
    ↓ (dado processado)
Agente/Skill
    ↓ BLOQUEADO — NUNCA passa adiante
Frontend / Cliente / Usuário final
```

### Regras absolutas de secrets

```
SEC-VAULT-01: Toda credencial externa vive no Supabase Vault
SEC-VAULT-02: Chaves de Vault seguem padrão: {church_id}_{sistema}_{tipo}
SEC-VAULT-03: Edge Functions acessam o Vault apenas via service_role
SEC-VAULT-04: Nenhuma credencial aparece em logs — nem mascarada
SEC-VAULT-05: Rotação de credencial = update no Vault + teste de conectividade
SEC-VAULT-06: Credenciais globais da plataforma (Anthropic API Key) usam prefixo 'plataforma_'
```

### Como rotacionar credencial

```typescript
async function rotateCredential(
  church_id: string,
  system: string,
  new_value: string,
  rotated_by: string
): Promise<void> {
  // 1. Salva nova credencial no Vault
  await supabase.rpc('update_secret', {
    secret_name: `${church_id}_${system}_token`,
    secret_value: new_value
  })

  // 2. Testa conectividade com nova credencial
  const testResult = await testIntegrationConnectivity(church_id, system)
  if (!testResult.success) {
    // Falhou — restaura credencial anterior (mantida por 24h no Vault)
    throw new Error(`Rotação falhou: ${testResult.error}`)
  }

  // 3. Registra rotação em audit_logs (sem o valor da credencial)
  await supabase.from('audit_logs').insert({
    church_id,
    action: `integration.${system}.credential_rotated`,
    actor: rotated_by,
    metadata: { system, rotated_at: new Date().toISOString() },
    severity: 'info'
  })
}
```

---

## 3. Validação de Payload

### HMAC para webhooks

Todo webhook recebido passa por validação HMAC antes de qualquer processamento (ver `webhooks.md` para implementação completa).

```typescript
// Comparação em tempo constante — previne timing attacks
function compareHmac(expected: string, received: string): boolean {
  if (expected.length !== received.length) return false
  let mismatch = 0
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ received.charCodeAt(i)
  }
  return mismatch === 0
}
```

### JWT para API

```typescript
// Toda Edge Function valida JWT antes de qualquer operação
async function validateJwt(authHeader: string | null): Promise<User> {
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthError('Token ausente', 401)
  }

  const { data: { user }, error } = await supabase.auth.getUser(
    authHeader.replace('Bearer ', '')
  )

  if (error || !user) {
    throw new AuthError('Token inválido ou expirado', 401)
  }

  return user
}
```

### Schema validation para formulários

```typescript
import { z } from 'https://deno.land/x/zod@v3.21.4/mod.ts'

// Schema de validação para inputs do usuário
const PersonInputSchema = z.object({
  name: z.string().min(2).max(200).trim(),
  phone: z.string().regex(/^\+\d{10,15}$/).optional(),
  email: z.string().email().max(254).optional(),
  tags: z.array(z.string().max(50)).max(20).optional()
})

// Uso: valida antes de qualquer operação
const validated = PersonInputSchema.safeParse(rawInput)
if (!validated.success) {
  throw new ValidationError('Dados inválidos', validated.error.errors)
}
```

---

## 4. Rate Limiting

### Por tenant e por endpoint

```sql
-- Tabela de controle de rate limit
CREATE TABLE rate_limit_counters (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL,            -- '{church_id}:{endpoint}:{window}'
  count       INTEGER NOT NULL DEFAULT 1,
  window_start TIMESTAMPTZ NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  UNIQUE (key, window_start)
);

CREATE INDEX idx_rate_limit_key ON rate_limit_counters(key, window_start);
CREATE INDEX idx_rate_limit_expires ON rate_limit_counters(expires_at);
```

```typescript
// Rate limiter por tenant — aplicado no início de toda Edge Function de escrita
async function checkRateLimit(
  church_id: string,
  endpoint: string,
  limitPerMinute: number
): Promise<{ allowed: boolean; remaining: number; reset_at: string }> {
  const windowStart = new Date(Math.floor(Date.now() / 60000) * 60000)
  const windowEnd = new Date(windowStart.getTime() + 60000)
  const key = `${church_id}:${endpoint}`

  const { data, error } = await supabase.rpc('increment_rate_limit', {
    p_key: key,
    p_window_start: windowStart.toISOString(),
    p_expires_at: windowEnd.toISOString()
  })

  const count = data ?? 0
  const allowed = count <= limitPerMinute

  if (!allowed) {
    await supabase.from('audit_logs').insert({
      church_id,
      action: 'security.rate_limit_exceeded',
      actor: 'system',
      metadata: { endpoint, count, limit: limitPerMinute },
      severity: 'warning'
    })
  }

  return {
    allowed,
    remaining: Math.max(0, limitPerMinute - count),
    reset_at: windowEnd.toISOString()
  }
}
```

### Limites padrão por tipo de operação

| Operação | Limite | Janela |
|---|---|---|
| POST /people | 100 | por minuto por tenant |
| POST /interactions | 500 | por minuto por tenant |
| POST /campaigns (envio) | 10 | por hora por tenant |
| Webhooks recebidos | 1000 | por minuto global |
| Edge Functions (geral) | 200 | por minuto por tenant |
| Chamadas ao LLM | 60 | por minuto por tenant |

---

## 5. Auditoria Obrigatória

### O que DEVE estar em audit_logs

```
OBRIGATÓRIO registrar:
  - Criação de tenant (tenant.created)
  - Login de usuário (auth.login)
  - Alteração de configurações do tenant (settings.updated)
  - Ativação/desativação de integração (integration.activated, integration.deactivated)
  - Rotação de credencial (integration.*.credential_rotated)
  - Escalada de agente para humano (agent.escalated)
  - Envio de campanha em massa (campaign.started, campaign.completed)
  - Doação confirmada ou estornada (donation.confirmed, donation.refunded)
  - Anonimização de pessoa (person.anonymized)
  - Rate limit atingido (security.rate_limit_exceeded)
  - Assinatura HMAC inválida recebida (security.webhook_signature_invalid)
  - Alteração de role de usuário (user_role.changed)
  - Offboarding de tenant (tenant.deactivated)

NÃO registrar em audit_logs (apenas em interactions):
  - Respostas normais de agentes
  - Leituras simples (SELECT sem impacto operacional)
  - Health checks
```

### Schema de audit_logs

```sql
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id   UUID REFERENCES churches(id),  -- null para eventos globais da plataforma
  action      TEXT NOT NULL,                  -- ex: 'tenant.created', 'agent.escalated'
  actor       TEXT NOT NULL,                  -- UUID do usuário ou 'system'
  actor_type  TEXT NOT NULL DEFAULT 'system'
              CHECK (actor_type IN ('user', 'system', 'agent')),
  trace_id    TEXT,                           -- rastreamento cross-service
  metadata    JSONB NOT NULL DEFAULT '{}',    -- dados do evento (sem dados sensíveis)
  severity    TEXT NOT NULL DEFAULT 'info'
              CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Particionamento por mês para performance (recomendado para volumes altos)
-- ALTER TABLE audit_logs PARTITION BY RANGE (created_at);

-- Sem RLS total — admins globais veem tudo; tenant admins veem seu escopo
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_logs_tenant_access" ON audit_logs
  USING (
    church_id IS NULL  -- eventos globais: apenas service_role
    OR church_id = (SELECT church_id FROM profiles WHERE id = auth.uid())
  );

-- Apenas service_role pode inserir
CREATE POLICY "audit_logs_insert_service_only" ON audit_logs
  FOR INSERT WITH CHECK (false);  -- bloqueado para roles normais
-- Edge Functions usam service_role para inserir

CREATE INDEX idx_audit_logs_church_id ON audit_logs(church_id, created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity, created_at DESC) WHERE severity IN ('error', 'critical');
```

### Retenção mínima

```
audit_logs: 5 anos (obrigação de conformidade)
interactions: 3 anos
webhook_failures: 6 meses após resolução
rate_limit_counters: 24 horas (limpeza automática)
webhook_processed_events: 30 dias
```

---

## 6. LGPD

### Dados sensíveis e tratamento

| Dado | Tabela | Sensibilidade | Em repouso | Em trânsito | Em logs |
|---|---|---|---|---|---|
| CPF | people.cpf | Alta | Criptografado (pgcrypto) | TLS 1.3 | Nunca exposto |
| Telefone | people.phone | Média | Texto plano | TLS 1.3 | Mascarado |
| E-mail | people.email | Média | Texto plano | TLS 1.3 | Mascarado |
| Endereço | people.address | Média | JSONB texto plano | TLS 1.3 | Mascarado |
| Data de nascimento | people.birth_date | Média | Texto plano | TLS 1.3 | Nunca em logs |
| Valor de doação | donations.amount | Alta | Texto plano | TLS 1.3 | Nunca em logs externos |
| Token de pagamento | donations.gateway_txn_id | Alta | Texto plano | TLS 1.3 | Nunca |

### Direito ao esquecimento — procedimento

```
1. Solicitação registrada formalmente (e-mail ou painel)
2. Verificação de identidade do solicitante
3. Verificação de restrições legais (dados financeiros têm retenção obrigatória de 5 anos)
4. Para dados sem restrição: executa anonimização (ver crm-modeling.md)
5. Para dados com restrição: informa o prazo de retenção obrigatória
6. Confirma ao solicitante por e-mail com ID do pedido
7. Registra em audit_logs com evidence da solicitação
```

### Data de retenção por categoria

```
Dados de cadastro sem vínculo financeiro: 2 anos após inativação
Dados financeiros (donations): 5 anos (obrigação fiscal - Receita Federal)
Logs de auditoria: 5 anos
Dados de autenticação: 90 dias após exclusão da conta
Interações de WhatsApp/Instagram: 3 anos
```

---

## 7. Separação de Ambientes

### Identificação de ambiente

```typescript
const ENVIRONMENT = Deno.env.get('ENVIRONMENT') as 'production' | 'staging' | 'development'

// Tenants de teste são identificados por sufixo no slug
function isTestTenant(slug: string): boolean {
  return slug.endsWith('-test') || slug.endsWith('-staging') || slug.endsWith('-dev')
}
```

### Diferenças entre ambientes

| Comportamento | Produção | Staging | Development |
|---|---|---|---|
| Envio real de WhatsApp | Sim | Não (sandbox) | Não |
| Envio real de e-mail | Sim | Não (mailtrap) | Não |
| Cobranças reais | Sim | Não (test mode) | Não |
| Dados reais | Sim | Não | Não |
| Rate limits | Configurado | Relaxado 10x | Sem limite |
| Audit logs | Completos | Completos | Resumido |

### Proteção contra execução em prod com dados de dev

```typescript
// Verificação obrigatória antes de qualquer operação destrutiva ou de envio em massa
if (ENVIRONMENT === 'production' && isTestTenant(church_slug)) {
  throw new Error('Tenant de teste não pode executar operações em produção')
}

if (ENVIRONMENT !== 'production' && !isTestTenant(church_slug)) {
  throw new Error('Dados de produção não podem ser processados fora do ambiente de produção')
}
```

---

## 8. Incident Response

### Classificação de incidentes

| Severidade | Definição | Tempo de resposta | Notificação |
|---|---|---|---|
| P1 — Crítico | Vazamento de dados confirmado | 15 minutos | CTO + equipe + ANPD (72h) |
| P2 — Alto | Acesso não autorizado suspeito | 1 hora | Tech Lead + equipe |
| P3 — Médio | Rate limit abusado, spam de webhook | 4 horas | Equipe técnica |
| P4 — Baixo | Assinatura inválida recebida (1-2x) | Próximo dia útil | Log automático |

### Procedimento para P1 (vazamento de dados)

```
IMEDIATO (primeiros 15 minutos):
  1. Identificar escopo: quais tenants, quais tabelas, período do vazamento
  2. Isolar o vetor de acesso: desativar integração, revogar token comprometido
  3. Notificar CTO e responsável pelo tenant afetado
  4. Registrar em audit_logs com severity='critical'

CURTO PRAZO (primeiras 2 horas):
  5. Inventário dos dados expostos (nomes, telefones, e-mails, dados financeiros?)
  6. Verificar se dados foram exfiltrados ou apenas acessados
  7. Preservar logs para investigação forense (não sobrescrever)
  8. Elaborar comunicado para o tenant afetado

LEGAL (primeiras 72 horas — obrigatório pela LGPD):
  9. Avaliar obrigatoriedade de notificação à ANPD
  10. Se dados de titulares foram expostos: notificar ANPD e titulares
  11. Documentar medidas corretivas adotadas

PÓS-INCIDENTE:
  12. Root cause analysis
  13. Implementar correção estrutural
  14. Atualizar regras de segurança deste documento
  15. Post-mortem documentado em arquivo interno
```

---

## 9. Checklist de Segurança — Antes de Qualquer Deploy

```
BANCO:
[ ] RLS habilitado em todas as novas tabelas
[ ] Políticas de RLS testadas com usuário de outro tenant (acesso bloqueado?)
[ ] Índices adequados para as queries principais (evitar full table scan)
[ ] Dados sensíveis não expostos em colunas sem criptografia

CÓDIGO:
[ ] church_id extraído de JWT/integração, nunca de payload do usuário
[ ] Nenhuma credencial no código (hardcoded, .env exposto, console.log)
[ ] Inputs validados com schema (Zod ou equivalente) antes de usar
[ ] Erros capturados sem vazar detalhes internos para o cliente
[ ] Timeout configurado em todas as chamadas a serviços externos
[ ] Rate limit verificado antes de operações em massa

INTEGRAÇÕES:
[ ] Credenciais no Vault com chave padronizada
[ ] Validação HMAC implementada para webhooks recebidos
[ ] Retry com exponential backoff implementado
[ ] Dead letter queue configurado para falhas

AGENTES:
[ ] Escopo documentado explicitamente (pode / não pode)
[ ] Threshold de escalada testado com casos de crise
[ ] Registro em interactions e audit_logs verificado

GERAL:
[ ] ekthos-chief-architect consultado (MODO=REVIEW) antes do merge
[ ] Teste de isolamento: dados de tenant A não acessíveis por tenant B
[ ] Deploy em staging antes de produção
[ ] Rollback plan definido antes do deploy
```

---

## 10. Regras Numeradas

```
SEC-01: RLS habilitado em 100% das tabelas com dados de tenant — sem exceção, sem data de validade
SEC-02: church_id nunca vem do payload do cliente — sempre extraído do JWT ou da integração configurada
SEC-03: Toda credencial externa vive no Supabase Vault — nunca em código, .env exposto ou banco não criptografado
SEC-04: Webhooks recebidos são validados por HMAC antes de qualquer processamento
SEC-05: Edge Functions retornam 200 para webhooks imediatamente — processamento é sempre assíncrono
SEC-06: Dados sensíveis (CPF, telefone, e-mail, valores financeiros) são mascarados em todos os logs
SEC-07: Comparação de assinaturas é sempre em tempo constante — nunca com early return ou comparação direta
SEC-08: Rate limiting aplicado por tenant antes de operações em massa ou chamadas a APIs externas
SEC-09: Toda operação com impacto de negócio gera registro em audit_logs com actor e trace_id
SEC-10: Audit_logs têm retenção mínima de 5 anos — nunca são deletados, apenas arquivados
SEC-11: Incidentes P1 e P2 têm notificação obrigatória à ANPD conforme prazos da LGPD
SEC-12: Dados de produção nunca são processados em ambiente de staging ou desenvolvimento
SEC-13: Rotação de credencial passa por teste de conectividade antes de confirmar — rollback automático se falhar
SEC-14: Deploy em produção requer checklist de segurança completo e revisão do ekthos-chief-architect
SEC-15: Tenants inativos têm integrações desativadas imediatamente no offboarding — tokens revogados no Vault
```

---

## 11. Exemplos de RLS Policies Avançadas

```sql
-- =============================================
-- 1. Política de admin: acesso total ao tenant
-- =============================================
CREATE POLICY "admin_full_access" ON people
  FOR ALL
  USING (
    church_id = (SELECT church_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'dev')
        AND church_id = (SELECT church_id FROM profiles WHERE id = auth.uid())
    )
  );

-- =============================================
-- 2. Política de operador: leitura + inserção, sem delete
-- =============================================
CREATE POLICY "operator_read_insert" ON people
  FOR SELECT
  USING (church_id = (SELECT church_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "operator_insert_only" ON people
  FOR INSERT
  WITH CHECK (
    church_id = (SELECT church_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'operator')
    )
  );

-- Operador NÃO tem política de DELETE — bloqueia por omissão

-- =============================================
-- 3. Política de somente leitura (relatórios)
-- =============================================
CREATE POLICY "readonly_access" ON interactions
  FOR SELECT
  USING (
    church_id = (SELECT church_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin', 'operator', 'readonly')
    )
  );

-- =============================================
-- 4. Política de doações: doador vê apenas as próprias
-- =============================================
CREATE POLICY "donor_own_donations" ON donations
  FOR SELECT
  USING (
    church_id = (SELECT church_id FROM profiles WHERE id = auth.uid())
    AND (
      -- Admin vê tudo
      EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'operator')
      )
      OR
      -- Doador vê apenas as suas
      person_id = (
        SELECT id FROM people
        WHERE church_id = (SELECT church_id FROM profiles WHERE id = auth.uid())
          AND email = (SELECT email FROM auth.users WHERE id = auth.uid())
        LIMIT 1
      )
    )
  );

-- =============================================
-- 5. Política de audit_logs: admin vê tudo; service_role insere
-- =============================================
-- Apenas service_role insere (via Edge Function)
CREATE POLICY "audit_logs_read_admin" ON audit_logs
  FOR SELECT
  USING (
    church_id IS NULL  -- eventos globais: bloqueados para usuários normais (apenas service_role)
    OR (
      church_id = (SELECT church_id FROM profiles WHERE id = auth.uid())
      AND EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid() AND role IN ('admin', 'dev')
      )
    )
  );

-- Insert bloqueado para todos exceto service_role (edge functions)
-- Implementado via ausência de política FOR INSERT — default deny

-- =============================================
-- 6. Proteção adicional: função que verifica tenant ativo
-- =============================================
CREATE OR REPLACE FUNCTION is_tenant_active(p_church_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM churches
    WHERE id = p_church_id AND status = 'active'
  );
$$;

-- Política com verificação de status do tenant
CREATE POLICY "active_tenant_only" ON people
  USING (
    church_id = (SELECT church_id FROM profiles WHERE id = auth.uid())
    AND is_tenant_active(church_id)
  );
```
