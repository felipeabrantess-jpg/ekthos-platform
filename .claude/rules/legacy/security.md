# Regras de Segurança — Ekthos Platform

> A segurança não é opcional. Igrejas confiam ao Ekthos dados pessoais de seus membros, informações financeiras e comunicações privadas. Esta responsabilidade é levada com máxima seriedade.

---

## 1. Autenticação e Autorização

### 1.1 Autenticação via Supabase Auth

Todo acesso à plataforma deve ser autenticado via Supabase Auth. Nenhuma rota sensível pode ser acessada sem um JWT válido.

```typescript
// Verificação obrigatória em toda Edge Function
const authHeader = req.headers.get('Authorization');
if (!authHeader?.startsWith('Bearer ')) {
  return new Response(JSON.stringify({ error: 'Token de autenticação ausente' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}

const { data: { user }, error } = await supabase.auth.getUser(
  authHeader.replace('Bearer ', '')
);

if (error || !user) {
  return new Response(JSON.stringify({ error: 'Token inválido ou expirado' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  });
}
```

### 1.2 Controle de Acesso por Papel (RBAC)

Os papéis existentes no sistema:
- `super_admin` — acesso total à plataforma (apenas equipe Ekthos)
- `church_admin` — acesso total ao tenant da sua igreja
- `church_manager` — acesso operacional (sem configurações críticas)
- `church_staff` — acesso limitado a funcionalidades específicas
- `readonly` — somente leitura de relatórios

```sql
-- Verificação de papel no banco
CREATE OR REPLACE FUNCTION has_role(required_role TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
      AND role = required_role
      AND church_id = get_current_church_id()
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Uso em políticas RLS
CREATE POLICY "admin_full_access" ON church_settings
  FOR ALL
  USING (
    church_id = get_current_church_id()
    AND has_role('church_admin')
  );
```

---

## 2. Proteção de Tokens e Secrets

### 2.1 Tokens de Integração NUNCA no Frontend

Todos os tokens de integração (WhatsApp API, Instagram API, gateways de pagamento) **DEVEM** ficar exclusivamente no backend.

```typescript
// CORRETO: Token acessado apenas na Edge Function
const WHATSAPP_TOKEN = Deno.env.get('WHATSAPP_BUSINESS_TOKEN');
if (!WHATSAPP_TOKEN) throw new Error('Token WhatsApp não configurado');

// ERRADO: Token exposto no cliente
// const whatsappToken = 'EAABwzLixnjYBO...'; // JAMAIS
// localStorage.setItem('waba_token', token); // JAMAIS
```

### 2.2 Supabase Vault para Secrets por Tenant

Tokens específicos de cada tenant (número de WhatsApp, token de página do Instagram) devem ser armazenados no Supabase Vault.

```typescript
// Leitura de secret do Vault
const { data: secret } = await supabaseAdmin.rpc('vault.decryptedSecret', {
  secret_name: `whatsapp_token_${churchSlug}`
});

// Armazenamento de secret no Vault (durante onboarding)
await supabaseAdmin.rpc('vault.createSecret', {
  secret: webhookToken,
  name: `whatsapp_token_${churchSlug}`,
  description: `Token WhatsApp para ${churchName}`
});
```

### 2.3 Variáveis de Ambiente Obrigatórias

Nenhuma configuração sensível pode ser hardcoded. Use sempre variáveis de ambiente.

```bash
# .env (NUNCA commitado no git)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
WHATSAPP_BUSINESS_TOKEN=EAABwzL...
N8N_WEBHOOK_SECRET=sh_xxxxx...
STRIPE_SECRET_KEY=sk_live_...
PAGSEGURO_TOKEN=xxxxx...
```

```
# .gitignore — SEMPRE incluir
.env
.env.local
.env.production
*.pem
*.key
secrets/
```

---

## 3. Segurança nas Edge Functions

### 3.1 Validação de Origem (CORS)

CORS deve ser configurado especificamente por domínio, nunca usar `*` em produção.

```typescript
// Configuração CORS correta
const ALLOWED_ORIGINS = [
  'https://app.ekthos.com.br',
  'https://admin.ekthos.com.br',
  Deno.env.get('ALLOWED_ORIGIN_CUSTOM') // Para domínios customizados de tenants
].filter(Boolean);

function getCorsHeaders(origin: string | null): Headers {
  const headers = new Headers();

  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
  }

  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Church-ID');
  headers.set('Access-Control-Max-Age', '86400');
  return headers;
}

// ERRADO
// headers.set('Access-Control-Allow-Origin', '*'); // NUNCA em produção
```

### 3.2 Validação de Payload de Webhooks

Todo webhook recebido deve ter sua assinatura validada antes de processar.

```typescript
// Validação de webhook do WhatsApp
async function validateWhatsAppWebhook(
  req: Request,
  body: string
): Promise<boolean> {
  const signature = req.headers.get('X-Hub-Signature-256');
  if (!signature) return false;

  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET')!;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const expectedSig = 'sha256=' + Array.from(new Uint8Array(signed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return signature === expectedSig;
}
```

### 3.3 Rate Limiting por Tenant

Cada tenant tem um limite de requisições para evitar abuso ou ataques.

```typescript
// Rate limiting simples via Redis (ou Supabase KV no futuro)
async function checkRateLimit(churchId: string, action: string): Promise<boolean> {
  const key = `rate_limit:${churchId}:${action}`;
  const windowSeconds = 60;
  const maxRequests = 100; // por minuto por tenant

  // Implementação usando Supabase para manter estado
  const { data } = await supabaseAdmin.rpc('check_and_increment_rate_limit', {
    p_key: key,
    p_window_seconds: windowSeconds,
    p_max_requests: maxRequests
  });

  return data?.allowed ?? false;
}
```

---

## 4. Proteção de Dados Pessoais (LGPD)

### 4.1 Mascaramento de Dados Sensíveis nos Logs

```typescript
// Funções de mascaramento
function maskPhone(phone: string): string {
  // (11) 99999-9999 → (11) *****-9999
  return phone.replace(/(\d{2})\s?(\d{4,5})-?(\d{4})/, '($1) *****-$3');
}

function maskEmail(email: string): string {
  // joao@email.com → j***@email.com
  const [user, domain] = email.split('@');
  return `${user[0]}***@${domain}`;
}

function maskCpf(cpf: string): string {
  // 123.456.789-00 → ***.456.789-**
  return cpf.replace(/(\d{3})\.(\d{3})\.(\d{3})-(\d{2})/, '***.${2}.${3}-**');
}
```

### 4.2 Dados que NUNCA podem ser logados sem mascaramento
- CPF / RG
- Número de telefone completo
- Dados bancários (agência, conta, PIX)
- Senha (mesmo hasheada)
- Tokens de autenticação
- Dados de cartão de crédito

### 4.3 Direito ao Esquecimento

O sistema deve suportar exclusão completa de dados de um membro quando solicitado.

```sql
-- Soft delete padrão (mantém histórico anonimizado)
UPDATE people
SET
  name = 'MEMBRO REMOVIDO',
  email = NULL,
  phone = NULL,
  cpf = NULL,
  deleted_at = NOW(),
  anonymized_at = NOW()
WHERE id = $person_id
  AND church_id = get_current_church_id();

-- Hard delete apenas quando explicitamente solicitado (processo formal)
-- REQUER: aprovação de church_admin + registro no audit_log
```

---

## 5. Segurança de Infraestrutura

### 5.1 Service Role Key — Uso Restrito

A `SUPABASE_SERVICE_ROLE_KEY` bypassa o RLS e deve ser usada com extrema cautela.

```typescript
// Uso PERMITIDO da Service Role Key
// - Operações de onboarding (criação do primeiro admin do tenant)
// - Sincronização de dados entre sistemas (n8n)
// - Jobs de background que precisam acesso amplo
// - Funções administrativas da plataforma Ekthos

// Uso NÃO PERMITIDO
// - Em qualquer função chamada diretamente pelo usuário
// - Em qualquer código que rode no frontend
// - Em funções que recebem church_id do cliente sem validação adicional
```

### 5.2 Auditoria de Acesso Privilegiado

```sql
-- Toda operação com service role deve ser auditada
CREATE OR REPLACE FUNCTION log_privileged_access(
  p_action TEXT,
  p_church_id UUID,
  p_details JSONB DEFAULT '{}'
)
RETURNS void AS $$
  INSERT INTO audit_logs (
    church_id, action, table_name, new_values, created_at
  )
  VALUES (
    p_church_id,
    'privileged_access:' || p_action,
    'SYSTEM',
    p_details || jsonb_build_object('timestamp', NOW()),
    NOW()
  );
$$ LANGUAGE SQL SECURITY DEFINER;
```

---

## 6. Checklist de Segurança

Antes de qualquer deploy, verificar:

- [ ] Nenhum secret está hardcoded no código
- [ ] `.env` está no `.gitignore`
- [ ] CORS está configurado com origens específicas
- [ ] Todos os webhooks têm validação de assinatura
- [ ] Edge Functions validam autenticação antes de processar
- [ ] Dados sensíveis são mascarados nos logs
- [ ] Rate limiting está ativo para os endpoints críticos
- [ ] RLS está ativado em todas as tabelas novas
- [ ] Service Role Key não é usada em funções chamadas pelo cliente
- [ ] Tokens de tenant estão no Supabase Vault, não no banco diretamente
