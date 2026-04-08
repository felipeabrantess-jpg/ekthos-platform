# Integrações — Ekthos Platform

## Visão Geral

O Ekthos Platform integra-se com diversas plataformas externas para entregar suas funcionalidades. Esta pasta documenta cada integração disponível: como configurar, como testar e como resolver problemas comuns.

**Princípio**: Tokens e credenciais de cada tenant nunca ficam neste repositório. Ficam no Supabase Vault, referenciados pelo nome da chave.

---

## Integrações Disponíveis

| Integração | Status | Módulo | Documentação |
|------------|--------|--------|-------------|
| WhatsApp Business API | Produção | Atendimento | `whatsapp/` |
| Instagram Graph API | Produção | Atendimento + Marketing | `instagram/` |
| n8n | Produção | Automações | `n8n/` |
| Stripe | Produção | Pagamentos | `payment/stripe/` |
| PagSeguro | Produção | Pagamentos | `payment/pagseguro/` |
| Mercado Pago | Beta | Pagamentos | `payment/mercadopago/` |
| Asaas | Planejado | Pagamentos | — |
| SendGrid | Planejado | E-mail | — |

---

## Como Adicionar uma Nova Integração para um Tenant

### Via Interface Administrativa (recomendado)
1. Acesse o painel Ekthos → Configurações → Integrações
2. Selecione o tipo de integração
3. Siga o wizard de configuração
4. O sistema armazena as credenciais no Vault automaticamente

### Via Código (durante onboarding ou desenvolvimento)

```typescript
// 1. Armazenar secret no Vault (via Edge Function com service role)
await supabaseAdmin.rpc('vault.createSecret', {
  secret: tokenValue,
  name: `whatsapp_token_${churchSlug}`,
  description: `Token WhatsApp Business para ${churchName}`
});

// 2. Registrar integração no banco
const { data: integration } = await supabaseAdmin
  .from('integrations')
  .insert({
    church_id: churchId,
    type: 'whatsapp',
    name: 'WhatsApp Principal',
    config: {
      phone_number_id: phoneNumberId,
      business_account_id: businessAccountId,
    },
    vault_keys: [`whatsapp_token_${churchSlug}`, `whatsapp_secret_${churchSlug}`],
    is_active: false, // Ativar apenas após teste bem-sucedido
  })
  .select()
  .single();

// 3. Testar a integração
const pingResult = await testIntegration(integration.id);
if (pingResult.success) {
  await supabaseAdmin
    .from('integrations')
    .update({ is_active: true, last_ping_at: new Date().toISOString() })
    .eq('id', integration.id);
}
```

---

## WhatsApp Business API

### Pré-requisitos
- Conta no Meta Business Suite verificada
- Número de telefone dedicado (não pode ser número pessoal)
- App no Meta Developers aprovado para a API do WhatsApp

### Configuração
1. Crie um App no [Meta for Developers](https://developers.facebook.com)
2. Adicione o produto WhatsApp Business
3. Gere o `Phone Number ID` e o `Access Token` (de longa duração: 60 dias)
4. Configure o webhook para: `https://{projeto}.supabase.co/functions/v1/whatsapp-webhook`
5. Use o `Verify Token` gerado pelo Ekthos durante o onboarding

### Dados necessários por tenant
- `phone_number_id` — ID do número no Meta (público, vai no `config`)
- `waba_id` — WhatsApp Business Account ID (público, vai no `config`)
- `access_token` — Token de acesso (sensível, vai no **Vault**)
- `app_secret` — Secret do App Meta (sensível, vai no **Vault**)

### Renovação de Token
Tokens expiram a cada 60 dias. O sistema monitora a expiração e notifica o admin 7 dias antes.

---

## Instagram Graph API

### Pré-requisitos
- Conta Instagram Professional (Business ou Creator)
- Página do Facebook vinculada
- App no Meta Developers com permissão `instagram_manage_messages`

### Permissões Necessárias
- `instagram_manage_messages` — Para responder DMs
- `instagram_manage_comments` — Para responder comentários
- `instagram_basic` — Para informações básicas do perfil
- `pages_manage_metadata` — Para webhooks

### Configuração do Webhook
URL: `https://{projeto}.supabase.co/functions/v1/instagram-webhook`
Campos assinados: `messages`, `comments`, `story_mentions`

### Dados necessários por tenant
- `instagram_account_id` — ID da conta Instagram (público)
- `page_id` — ID da página Facebook vinculada (público)
- `access_token` — Token de longa duração (sensível, **Vault**)
- `app_secret` — Secret do App Meta (sensível, **Vault**)

---

## n8n

### Configuração da Conexão
O n8n conecta-se ao Supabase usando a `SUPABASE_SERVICE_ROLE_KEY` armazenada nas credenciais do n8n (nunca em variável pública).

### Dados de configuração
- `n8n_instance_url` — URL da instância n8n (ex: `https://n8n.ekthos.com.br`)
- `n8n_api_key` — Chave de API do n8n (sensível, variável de ambiente da plataforma)

### Criação de Workflow via API
```typescript
const workflow = await fetch(`${N8N_URL}/api/v1/workflows`, {
  method: 'POST',
  headers: {
    'X-N8N-API-KEY': N8N_API_KEY,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(workflowDefinition),
});
```

---

## Gateways de Pagamento

### PagSeguro
**Configuração**:
- `pagseguro_email` — E-mail da conta (público)
- `pagseguro_token` — Token de integração (sensível, **Vault**)
- Webhook URL: `https://{projeto}.supabase.co/functions/v1/payment-webhook`
- Notificações: Ativar para PIX e Cartão nas configurações do PagSeguro

### Stripe
**Configuração**:
- `stripe_publishable_key` — Chave pública (pode ir no frontend)
- `stripe_secret_key` — Chave secreta (sensível, **Vault**)
- `stripe_webhook_secret` — Secret do endpoint (sensível, **Vault**)
- Webhook URL: `https://{projeto}.supabase.co/functions/v1/payment-webhook`
- Eventos: `payment_intent.succeeded`, `payment_intent.payment_failed`, `charge.refunded`

### Mercado Pago
**Configuração**:
- `mp_public_key` — Chave pública (pode ir no frontend)
- `mp_access_token` — Token de acesso (sensível, **Vault**)
- Webhook URL: `https://{projeto}.supabase.co/functions/v1/payment-webhook`

---

## Testando Integrações

```bash
# Testar webhook do WhatsApp (simulação)
curl -X POST "https://{projeto}.supabase.co/functions/v1/whatsapp-webhook" \
  -H "X-Hub-Signature-256: sha256={assinatura_calculada}" \
  -H "Content-Type: application/json" \
  -d '{
    "object": "whatsapp_business_account",
    "entry": [{
      "id": "{waba_id}",
      "changes": [{
        "value": {
          "messages": [{
            "from": "5511999990000",
            "text": {"body": "Olá, qual o horário do culto?"}
          }]
        }
      }]
    }]
  }'
```

---

## Diagnóstico de Problemas

### Integração marcada como inativa
1. Verificar `last_ping_at` — se null, nunca foi testada
2. Verificar `status_message` — contém o último erro
3. Verificar se o token no Vault ainda é válido
4. Reconfigurar e reativar

### Webhooks não chegando
1. Confirmar URL do webhook na plataforma de origem
2. Verificar se a Edge Function está deployada (`supabase functions list`)
3. Verificar logs da Edge Function (`supabase functions logs {nome}`)
4. Verificar se o `webhook_token` na tabela `integrations` está correto

### Token expirado
1. Gerar novo token na plataforma de origem
2. Atualizar no Vault via interface admin ou Edge Function privilegiada
3. Atualizar `last_ping_at` após confirmar funcionamento
