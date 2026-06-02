# Checklist 1ª Venda Ekthos — v0.9

> Data: 2026-05-31 | Versão: v0.9 | Validade: até próximo MEGA-ONDA

---

## Seção 1 — Antes da Venda (Pré-Requisitos)

### 1.1 Stripe
- [ ] Webhook `checkout.session.completed` configurado e ativo no Stripe Dashboard
- [ ] Webhook `customer.subscription.updated` configurado e ativo
- [ ] Webhook `customer.subscription.deleted` configurado e ativo
- [ ] Webhook secret (`STRIPE_WEBHOOK_SECRET`) presente nos Supabase secrets
- [ ] `STRIPE_SECRET_KEY` presente nos Supabase secrets (live key em produção)
- [ ] Produto e plano "Chamado" (R$97/mês) criado no Stripe com `price_id` correto
- [ ] Checkout session configurada com `metadata.plan_slug='chamado'` e `metadata.church_id` (ou mode create-church)
- [ ] Testar fluxo completo com cartão de teste antes de ir ao vivo

### 1.2 Edge Functions Deployadas
- [ ] `stripe-bootstrap` — cria church + subscription + perfil pós-pagamento
- [ ] `stripe-webhook` — processa eventos do Stripe
- [ ] `agent-acolhimento` (ou agente incluso no plano) deployado e respondendo
- [ ] Verificar que todas as EFs têm `verify_jwt: false` no config
- [ ] `supabase functions list --project-ref mlqjywqnchilvgkbvicd` — confirmar status Active

### 1.3 Banco de Dados
- [ ] Migrations aplicadas (nenhuma pendente): `SELECT * FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5`
- [ ] Tabela `plans` com slug 'chamado' presente: `SELECT * FROM plans WHERE slug='chamado'`
- [ ] Tabela `agent_catalog` com entradas dos agentes dos planos: `SELECT count(*) FROM agent_catalog`
- [ ] RLS habilitado em todas as tabelas sensíveis
- [ ] `auth_church_id()` function existe: `SELECT proname FROM pg_proc WHERE proname='auth_church_id'`
- [ ] pg_cron instalado: `SELECT * FROM cron.job LIMIT 5`

### 1.4 GoTrue / Auth
- [ ] `SITE_URL` apontando para URL de produção Vercel
- [ ] `ADDITIONAL_REDIRECT_URLS` inclui URL de produção
- [ ] Email de convite / magic link testado para um email de domínio confiável
- [ ] Confirmar que não há bloqueio de domínio (armadilha #27)

### 1.5 Frontend / Deploy
- [ ] Branch `main` deployada na Vercel sem erros de build
- [ ] Variáveis de ambiente Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- [ ] Página de checkout acessível e sem erros de console
- [ ] Fluxo pós-pagamento (redirect + criação de conta) testado em staging

---

## Seção 2 — Durante o Pagamento (Monitor & SLA)

### 2.1 O que Monitorar em Tempo Real
Durante a primeira venda, manter abertos:
1. **Stripe Dashboard → Events** — confirmar `checkout.session.completed` chegando
2. **Supabase Dashboard → Edge Functions → Logs** (`stripe-webhook`) — sem erros 500
3. **Supabase Dashboard → Authentication → Users** — novo usuário criado
4. **SQL Monitor:**
```sql
-- Rodar a cada 2 minutos durante o processo
SELECT c.id, c.name, c.created_at, s.status, s.plan_slug
FROM churches c
LEFT JOIN subscriptions s ON s.church_id = c.id
ORDER BY c.created_at DESC
LIMIT 5;
```

### 2.2 SLA Esperado
| Etapa | Tempo Esperado |
|---|---|
| Pagamento confirmado no Stripe | imediato |
| Webhook chegar na EF | < 5 segundos |
| Church + subscription criados | < 15 segundos |
| Agente ativado | < 30 segundos |
| Pastor consegue fazer login | < 2 minutos |

### 2.3 Alertas Amarelos (investigar, não entrar em pânico)
- Webhook demora > 30s: verificar Stripe Dashboard → Webhooks → tentativas
- EF retorna 500: verificar logs — pode ser race condition, retry automático do Stripe resolve
- Pastor não recebe email: ver armadilha #27 (domínio não-reputado) — usar senha direta como fallback

### 2.4 Alertas Vermelhos (acionar recovery imediato)
- Pagamento confirmado + 5 minutos sem church criada → Seção 5.1
- Pastor tenta login e recebe "Invalid credentials" após setup → Seção 5.4
- Dois pagamentos detectados para o mesmo pastor → Seção 5.3

---

## Seção 3 — Após o Pagamento (SQL Validations)

Executar estas queries na ordem após confirmação do pagamento:

### 3.1 Verificar Church Criada
```sql
SELECT id, name, created_at, subscription_status
FROM churches
ORDER BY created_at DESC
LIMIT 1;
```
**Esperado:** 1 linha com `created_at` recente.

### 3.2 Verificar Subscription Ativa
```sql
SELECT s.id, s.church_id, s.plan_slug, s.status, s.stripe_subscription_id,
       s.current_period_start, s.current_period_end
FROM subscriptions s
JOIN churches c ON c.id = s.church_id
ORDER BY s.created_at DESC
LIMIT 1;
```
**Esperado:** `status = 'active'`, `plan_slug` correto, `stripe_subscription_id` preenchido.

### 3.3 Verificar Perfil do Pastor
```sql
SELECT p.id, p.email, p.is_active, ur.role, ur.church_id
FROM profiles p
JOIN user_roles ur ON ur.user_id = p.user_id
JOIN churches c ON c.id = ur.church_id
ORDER BY p.created_at DESC
LIMIT 3;
```
**Esperado:** Pastor com `role = 'admin'`, `is_active = true`, `church_id` correto.

### 3.4 Verificar Agente Ativado
```sql
SELECT ca.agent_slug, ca.model_id, ca.is_active, ca.activated_at
FROM church_agents ca
JOIN churches c ON c.id = ca.church_id
ORDER BY ca.activated_at DESC
LIMIT 5;
```
**Esperado:** Agente incluso no plano com `is_active = true`.

### 3.5 Verificar Audit Log do Evento
```sql
SELECT action, actor_id, metadata, created_at
FROM audit_logs
WHERE action IN ('checkout_session_completed', 'church_created', 'agent_activated')
ORDER BY created_at DESC
LIMIT 10;
```
**Esperado:** Sequência de eventos sem gaps ou erros.

### 3.6 Verificar Crons Ativos
```sql
SELECT jobname, schedule, active, last_run_started_at
FROM cron.job
ORDER BY jobname;
```
**Esperado:** Jobs relevantes com `active = true`.

---

## Seção 4 — Acesso do Pastor (Setup + Rollbacks)

### 4.1 Fluxo Normal de Primeiro Acesso
1. Pastor recebe email de boas-vindas com link de acesso
2. Clica no link → redirecionado para `app.ekthosai.net`
3. Define senha ou usa magic link
4. Vê dashboard com church já configurada e agente ativo
5. Completa perfil da igreja (nome, logo, informações)

### 4.2 Rollback: Pastor Bloqueado — Armadilha #27 (GoTrue Email Validation)

**Sintoma:** Magic Link retorna "Email address is invalid" OU email de recovery não chega no inbox apesar de o frontend mostrar sucesso.

**Causa:** Supabase Email Validation Extended bloqueia domínios "não-reputados" (gmail.com funciona; domínios personalizados como `@minhaigreja.com.br` podem falhar).

**Procedimento de Recovery (10-15 min):**

```bash
# Passo 1: Confirmar que o usuário existe no GoTrue
# Supabase Dashboard → Authentication → Users → buscar por email

# Passo 2: Definir senha via Admin API (contornar magic link)
curl -X PUT "https://mlqjywqnchilvgkbvicd.supabase.co/auth/v1/admin/users/<USER_UUID>" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"password": "SenhaTemporaria2026!", "email_confirm": true}'
# NOTA: usar PUT, não PATCH (PATCH retorna 405)

# Passo 3: Enviar senha temporária ao pastor por WhatsApp/telefone
# Passo 4: Orientar pastor a trocar a senha no primeiro login
```

**Verificação pós-recovery:**
```sql
SELECT id, email, email_confirmed_at, last_sign_in_at
FROM auth.users
WHERE email = '<email_do_pastor>';
```
**Esperado:** `email_confirmed_at` preenchido, `last_sign_in_at` recente após login.

**Solução definitiva (futuro):** Configurar SMTP customizado via Resend/SendGrid nas configurações do Supabase.

### 4.3 Rollback: Pastor Criado Sem Perfil
```sql
-- Verificar se profile existe
SELECT * FROM profiles WHERE user_id = '<uuid>';

-- Se não existir, criar manualmente
INSERT INTO profiles (id, user_id, email, is_active, created_at)
VALUES (gen_random_uuid(), '<user_uuid>', '<email>', true, now())
ON CONFLICT DO NOTHING;

-- Verificar role
SELECT * FROM user_roles WHERE user_id = '<uuid>';

-- Se não existir, criar role
INSERT INTO user_roles (user_id, church_id, role)
VALUES ('<user_uuid>', '<church_id>', 'admin')
ON CONFLICT DO NOTHING;
```

### 4.4 Rollback: Dashboard Carregando Sem Dados
**Causa provável:** `church_id` ausente no `app_metadata` do usuário GoTrue.
```bash
# Atualizar app_metadata via Admin API
curl -X PUT "https://mlqjywqnchilvgkbvicd.supabase.co/auth/v1/admin/users/<USER_UUID>" \
  -H "apikey: <SERVICE_ROLE_KEY>" \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"app_metadata": {"church_id": "<CHURCH_UUID>", "role": "admin"}}'
```
**Após:** Pastor deve fazer logout e login novamente para novo JWT com `church_id`.

---

## Seção 5 — Recovery Manual (Cenários de Emergência)

### 5.1 Cobrança Sem Igreja Criada
**Sintoma:** Stripe mostra pagamento confirmado, mas `SELECT count(*) FROM churches WHERE created_at > now() - interval '30 minutes'` retorna 0.
**Causa provável:** Webhook não processou (timeout, erro 500 na EF).
**Ação:**
1. Stripe Dashboard → Events → buscar `checkout.session.completed` → retentar webhook manualmente
2. Se ainda falhar: executar `stripe-bootstrap` manualmente com `session_id`
3. Audit: verificar `audit_logs` WHERE `action='checkout_session_completed'`

### 5.2 Igreja Órfã (church sem subscription)
**Sintoma:** church existe mas `SELECT count(*) FROM subscriptions WHERE church_id='<id>'` = 0.
**Ação:**
```sql
-- Criar subscription manualmente
INSERT INTO subscriptions (id, church_id, stripe_subscription_id, plan_slug, status, current_period_start, current_period_end)
VALUES (gen_random_uuid(), '<church_id>', '<stripe_sub_id>', 'chamado', 'active', now(), now() + interval '30 days');

-- Ativar agente
SELECT activate_agent_internal('<church_id>', 'agent-acolhimento', 'agent-haiku-triagem');
```

### 5.3 Double Billing Refund
**Sintoma:** Pastor pagou 2x (duas checkout sessions completadas).
**Verificação:** `SELECT count(*) FROM subscriptions WHERE church_id='<id>'` > 1 OU Stripe Dashboard mostra 2 subscriptions.
**Ação:**
1. Stripe Dashboard → Customers → cancelar subscription duplicada (imediatamente)
2. Stripe Dashboard → criar Refund pela segunda cobrança
3. SQL: `DELETE FROM subscriptions WHERE id='<id_duplicado>'` (apenas se `stripe_subscription_id` já cancelado)
4. Registrar em `audit_logs` com razão

### 5.4 Pastor Bloqueado GoTrue (armadilha #27)
Ver Seção 4.2 para procedimento completo.
Tempo estimado de recovery: 10-15 min.

### 5.5 Cron Travado (expire-recargas ou caminho-a-rescue)
**Verificação:**
```sql
SELECT jobname, last_run_started_at, last_run_status
FROM cron.job_run_details
ORDER BY start_time DESC LIMIT 5;
```
**Ação se travado:** Supabase Dashboard → Extensions → pg_cron → verificar job status. Rescheduler via SQL se necessário.

### 5.6 Contatos de Emergência
- Felipe Abrantes: responsável técnico e de produto
- Supabase Status: https://status.supabase.com
- Stripe Status: https://status.stripe.com
