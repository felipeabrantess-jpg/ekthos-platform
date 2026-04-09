# Skill: Donation Management (Gestão de Doações)

## Descrição

Gerencia todo o ciclo de vida financeiro das igrejas: configuração de gateways de pagamento, processamento de doações (PIX, cartão, débito), classificação por tipo (dízimo, oferta, campanha específica), geração de relatórios, notificações automáticas de confirmação e emissão de comprovantes. A skill respeita profundamente a sensibilidade do tema financeiro no contexto ministerial.

Diferente de um sistema financeiro genérico, esta skill entende que o dízimo tem significado espiritual, que a oferta é voluntária e que o comprovante pode ser necessário para declaração de IR. Cada interação financeira é tratada com seriedade e discrição.

---

## Quando Usar

- Webhook de gateway de pagamento recebido (confirmação, estorno, falha)
- Usuário solicita informações sobre sua doação
- Administrador solicita relatório financeiro
- Configuração de novo gateway de pagamento
- Geração de comprovante de doação
- Agendamento de doação recorrente
- Campanha de arrecadação específica

---

## Inputs

| Campo | Tipo | Obrigatório | Descrição |
|-------|------|-------------|-----------|
| `churchId` | `string` | Sim | UUID do tenant |
| `action` | `DonationAction` | Sim | Tipo de ação a executar |
| `context` | `TenantContext` | Sim | Contexto do tenant |
| `webhookPayload` | `GatewayWebhookPayload \| null` | Depende | Payload do gateway (para eventos de pagamento) |
| `donorPhone` | `string \| null` | Depende | Telefone do doador (para consultas via WhatsApp) |
| `donorId` | `string \| null` | Depende | ID do doador no banco (se identificado) |
| `reportFilters` | `ReportFilters \| null` | Depende | Filtros para relatórios |
| `requestedBy` | `string` | Sim | ID do usuário ou 'system' para webhooks |

---

## Outputs

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `action` | `string` | Ação executada |
| `donationId` | `string \| null` | ID da doação processada |
| `donationStatus` | `DonationStatus \| null` | Status atualizado |
| `confirmationMessage` | `string \| null` | Mensagem de confirmação para o doador |
| `receiptUrl` | `string \| null` | URL do comprovante PDF gerado |
| `report` | `DonationReport \| null` | Relatório financeiro |
| `pixQrCode` | `PixQrCode \| null` | QR Code PIX gerado (para novas doações) |
| `recurringSetup` | `RecurringDonation \| null` | Configuração de doação recorrente |

---

## Regras

1. **Validação de webhook obrigatória** — Todo payload de webhook de pagamento deve ter sua assinatura validada antes de qualquer processamento.
2. **Idempotência** — Nunca processar o mesmo evento de pagamento duas vezes. Verificar `external_transaction_id` antes de inserir.
3. **church_id em todas as operações** — Toda doação é vinculada ao church_id correto, identificado via token de integração do webhook.
4. **Dados financeiros nunca no frontend** — Chaves de API de gateways ficam exclusivamente no servidor.
5. **Comprovante obrigatório** — Toda doação confirmada gera comprovante disponível para download.
6. **Sem acesso cruzado** — Um doador nunca vê doações de outros doadores. Um admin só vê doações do seu tenant.
7. **Limite de auto-aprovação** — Estornos e ajustes acima de `church_settings.auto_approval_limit` requerem aprovação manual.
8. **Log de auditoria completo** — Toda operação financeira gera entrada no `audit_log` com valores antes e depois.
9. **Mascaramento em logs** — Dados de cartão (nunca armazenados) e PIX são sempre mascarados nos logs.

---

## Gateways Suportados

| Gateway | PIX | Cartão | Débito | Recorrência | Observações |
|---------|-----|--------|--------|-------------|-------------|
| Stripe | Não | Sim | Sim | Sim | Internacional, melhor para dólares |
| PagSeguro | Sim | Sim | Sim | Sim | Amplamente usado no Brasil |
| Mercado Pago | Sim | Sim | Sim | Sim | Alta penetração no Brasil |
| Asaas | Sim | Sim | Sim | Sim | Focado em cobranças recorrentes |

---

## Categorias de Doação

```typescript
type DonationCategory =
  | 'tithe'           // Dízimo
  | 'offering'        // Oferta
  | 'missions'        // Missões
  | 'building_fund'   // Fundo de obras/construção
  | 'campaign'        // Campanha específica (com campaign_id)
  | 'social_action'   // Ação social
  | 'media'           // Ministério de mídia
  | 'other';          // Outra (campo observação obrigatório)
```

---

## Dependências

- Tabelas: `donations`, `people`, `integrations`, `church_settings`, `audit_logs`
- Supabase Storage (para comprovantes PDF)
- Supabase Vault (tokens de gateway)
- Stripe API / PagSeguro API / Mercado Pago API
- Edge Function `generate-receipt` (geração de PDF)
- `n8n-orchestration` skill (para notificações automáticas)

---

## Fluxo de Processamento de Webhook

```typescript
async function processPaymentWebhook(
  payload: RawWebhookPayload,
  churchId: string,
  gateway: 'stripe' | 'pagseguro' | 'mercadopago'
): Promise<void> {
  // 1. Validar assinatura do webhook
  const isValid = await validateWebhookSignature(payload, gateway, churchId);
  if (!isValid) throw new Error('Assinatura de webhook inválida');

  // 2. Verificar idempotência — já processou este evento?
  const externalId = extractExternalId(payload, gateway);
  const alreadyProcessed = await checkIfAlreadyProcessed(externalId, churchId);
  if (alreadyProcessed) {
    console.log(`Evento ${externalId} já processado — ignorando`);
    return;
  }

  // 3. Normalizar payload para formato interno
  const normalizedEvent = normalizeWebhookPayload(payload, gateway);

  // 4. Processar por tipo de evento
  switch (normalizedEvent.type) {
    case 'payment.confirmed':
      await handlePaymentConfirmed(normalizedEvent, churchId);
      break;
    case 'payment.failed':
      await handlePaymentFailed(normalizedEvent, churchId);
      break;
    case 'payment.refunded':
      await handlePaymentRefunded(normalizedEvent, churchId);
      break;
    default:
      console.log(`Evento desconhecido: ${normalizedEvent.type}`);
  }

  // 5. Registrar evento processado (idempotência futura)
  await markEventAsProcessed(externalId, churchId, normalizedEvent.type);
}
```

---

## Exemplos

### Exemplo 1 — Confirmação de PIX

```
Input:
  action: 'process_webhook'
  webhookPayload: { /* payload do PagSeguro confirmando PIX */ }
  gateway: 'pagseguro'

Output:
  donationId: 'donation-uuid-xxx'
  donationStatus: 'confirmed'
  confirmationMessage: "✅ Seu dízimo de R$ 200,00 foi confirmado! Que Deus abençoe sua fidelidade. Seu comprovante está disponível em: [link]"
  receiptUrl: 'https://storage.supabase.co/receipts/donation-xxx.pdf'
```

### Exemplo 2 — Consulta de Doador via WhatsApp

```
Input:
  action: 'query_donor_donations'
  donorPhone: '+5511999990000'
  context.tone: 'carinhoso'

Output:
  report: {
    donorName: 'João Silva',
    period: '2026',
    totalDonated: 2400.00,
    donationCount: 12,
    categories: {
      tithe: 2000.00,
      offering: 400.00
    }
  }
  confirmationMessage: "Olá, João! 😊 No ano de 2026, você contribuiu R$ 2.400,00 — sendo R$ 2.000,00 em dízimos e R$ 400,00 em ofertas. Muito obrigado pela sua fidelidade! Posso te enviar o relatório completo em PDF?"
```

### Exemplo 3 — Relatório Mensal para Admin

```
Input:
  action: 'generate_report'
  reportFilters: {
    period: '2026-03',
    groupBy: 'category'
  }
  requestedBy: 'admin-uuid'

Output:
  report: {
    period: 'Março 2026',
    totalReceived: 45230.00,
    byCategory: {
      tithe: 32000.00,
      offering: 8500.00,
      missions: 2500.00,
      building_fund: 2230.00
    },
    donorCount: 187,
    newDonors: 12,
    averageDonation: 241.87,
    topDonationCategory: 'tithe',
    comparisonPreviousMonth: '+8.3%'
  }
```

### Exemplo 4 — Geração de QR Code PIX

```
Input:
  action: 'generate_pix'
  amount: 100.00
  category: 'tithe'
  donorId: 'person-uuid'

Output:
  pixQrCode: {
    qrCodeImage: 'data:image/png;base64,...',
    pixCode: '00020126580014br.gov.bcb.pix...',
    expiresAt: '2026-04-07T23:59:59Z',
    amount: 100.00
  }
  confirmationMessage: "Escaneie o QR Code abaixo para pagar seu dízimo de R$ 100,00. O código expira hoje à meia-noite."
```
