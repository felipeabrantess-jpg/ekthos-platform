# Regras de Multi-Tenancy — Ekthos Platform

> Estas regras são absolutas e invioláveis. Qualquer violação compromete a segurança e privacidade de centenas de igrejas e seus membros.

---

## Princípio Fundamental

O Ekthos Platform opera em um modelo de multi-tenancy compartilhado: um único banco de dados, uma única instância da aplicação, mas dados completamente isolados por `church_id`. Este modelo é economicamente eficiente, mas exige disciplina absoluta no acesso aos dados.

**A regra é simples: cada church_id é um universo isolado. Eles nunca se tocam.**

---

## Regra 1 — church_id Obrigatório em TODAS as Queries

Toda operação de SELECT, INSERT, UPDATE ou DELETE em tabelas que possuem `church_id` **DEVE** incluir esse campo no filtro ou no valor.

### Correto
```sql
-- Buscar membros de uma igreja específica
SELECT * FROM people
WHERE church_id = auth.uid_to_church_id()
  AND deleted_at IS NULL;

-- Inserir uma interação
INSERT INTO interactions (church_id, person_id, channel, message)
VALUES (get_current_church_id(), $person_id, 'whatsapp', $message);

-- Atualizar status de doação
UPDATE donations
SET status = 'confirmed', updated_at = NOW()
WHERE id = $donation_id
  AND church_id = get_current_church_id(); -- CRÍTICO: sempre filtrar por church_id
```

### INCORRETO — NUNCA FAÇA ISSO
```sql
-- ERRADO: Sem church_id — retorna dados de TODAS as igrejas
SELECT * FROM people WHERE email = $email;

-- ERRADO: Atualiza sem validar se pertence ao tenant
UPDATE donations SET status = 'confirmed' WHERE id = $donation_id;

-- ERRADO: Conta total sem filtro — vaza métricas entre tenants
SELECT COUNT(*) FROM people;
```

---

## Regra 2 — RLS Obrigatório em Todas as Tabelas

Toda tabela que armazena dados relacionados a um tenant **DEVE** ter Row Level Security ativado com políticas adequadas.

### Checklist de RLS por Tabela

```sql
-- Verificar se RLS está ativado
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- Ativar RLS (obrigatório em toda nova tabela)
ALTER TABLE nome_da_tabela ENABLE ROW LEVEL SECURITY;

-- Política padrão de leitura por tenant
CREATE POLICY "tenant_isolation_select" ON nome_da_tabela
  FOR SELECT
  USING (church_id = get_current_church_id());

-- Política padrão de escrita por tenant
CREATE POLICY "tenant_isolation_insert" ON nome_da_tabela
  FOR INSERT
  WITH CHECK (church_id = get_current_church_id());

-- Política padrão de atualização por tenant
CREATE POLICY "tenant_isolation_update" ON nome_da_tabela
  FOR UPDATE
  USING (church_id = get_current_church_id())
  WITH CHECK (church_id = get_current_church_id());
```

### Tabelas Sem church_id (exceções explícitas)

As seguintes tabelas são globais e não têm RLS de tenant, mas têm seus próprios controles:
- `churches` — somente super admin pode modificar
- `auth.users` — gerenciado pelo Supabase Auth

---

## Regra 3 — Validação do church_id no Servidor

O `church_id` nunca deve ser aceito diretamente do cliente sem validação. Sempre derive o `church_id` a partir do token de autenticação do usuário.

### Função Helper no Banco
```sql
-- Função para obter o church_id do usuário autenticado
CREATE OR REPLACE FUNCTION get_current_church_id()
RETURNS UUID AS $$
  SELECT church_id
  FROM profiles
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;
```

### Na Edge Function (TypeScript/Deno)
```typescript
// CORRETO: Deriva church_id do token JWT
async function handleRequest(req: Request) {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: req.headers.get('Authorization')! } }
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (!user || error) throw new Error('Não autorizado');

  // Busca church_id do perfil — NUNCA aceita do body da requisição
  const { data: profile } = await supabase
    .from('profiles')
    .select('church_id')
    .eq('user_id', user.id)
    .single();

  const churchId = profile?.church_id;
  if (!churchId) throw new Error('Perfil sem church_id');

  // Usa o churchId validado em todas as operações subsequentes
  return processRequest(supabase, churchId, req);
}

// ERRADO: Aceita church_id do body sem validação
async function handleRequestInsecure(req: Request) {
  const body = await req.json();
  const churchId = body.church_id; // NUNCA FAÇA ISSO
  // ...
}
```

---

## Regra 4 — Logs de Auditoria por Tenant

Toda ação significativa deve ser registrada na tabela `audit_logs` com o `church_id` correspondente.

```sql
-- Estrutura da tabela de auditoria
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  church_id UUID NOT NULL REFERENCES churches(id),
  user_id UUID REFERENCES auth.users(id),
  action VARCHAR(100) NOT NULL,   -- ex: 'member.created', 'donation.updated'
  table_name VARCHAR(100),
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consulta eficiente
CREATE INDEX idx_audit_logs_church_id ON audit_logs(church_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

### Ações que DEVEM ser auditadas
- Criação/edição/exclusão de membros (people)
- Qualquer transação financeira (donations)
- Alterações em configurações (church_settings)
- Login/logout de usuários administrativos
- Adição/remoção de integrações
- Exportação de dados

---

## Regra 5 — Isolamento em Webhooks e Integrações

Quando um webhook externo chegar (WhatsApp, Instagram, gateway de pagamento), o primeiro passo é sempre identificar e validar o tenant.

```typescript
// Identificação de tenant via token de integração
async function identifyTenant(webhookToken: string): Promise<string> {
  const { data: integration } = await supabaseAdmin
    .from('integrations')
    .select('church_id')
    .eq('webhook_token', webhookToken)
    .eq('is_active', true)
    .single();

  if (!integration) {
    throw new Error(`Token de webhook inválido: ${webhookToken}`);
  }

  return integration.church_id;
}

// USO CORRETO em Edge Function de webhook
Deno.serve(async (req) => {
  const token = req.headers.get('X-Webhook-Token');
  if (!token) return new Response('Unauthorized', { status: 401 });

  const churchId = await identifyTenant(token); // SEMPRE primeiro passo
  // Todas as operações subsequentes usam churchId
});
```

---

## Regra 6 — Contextos de IA Isolados por Tenant

Quando um agente de IA processa uma mensagem, o contexto carregado deve ser exclusivamente do tenant relevante.

```typescript
// CORRETO: Carrega contexto específico do tenant
async function loadTenantContext(churchId: string): Promise<TenantContext> {
  const { data: church } = await supabase
    .from('churches')
    .select('slug, settings, name')
    .eq('id', churchId)
    .single();

  // Carrega o arquivo de contexto específico
  const contextFile = `context/tenants/${church.slug}.md`;
  // ...

  return {
    churchId,
    churchName: church.name,
    terminology: church.settings.terminology,
    tone: church.settings.tone,
    // ...
  };
}
```

---

## Checklist de Conformidade Multi-Tenant

Antes de fazer deploy de qualquer feature, verificar:

- [ ] Todas as queries incluem `church_id` no WHERE
- [ ] Todas as novas tabelas têm RLS ativado
- [ ] Nenhuma rota aceita `church_id` diretamente do cliente
- [ ] Webhooks validam o token antes de processar
- [ ] Logs de auditoria estão sendo gerados
- [ ] Testes de isolamento foram executados (tenant A não vê dados do tenant B)
- [ ] Contextos de IA são carregados por tenant
- [ ] Sem dados hardcoded de qualquer tenant específico no código

---

> Violações das regras de multi-tenancy são tratadas como incidentes críticos de segurança.
> Reporte imediatamente e reverta qualquer código que viole estas regras.
