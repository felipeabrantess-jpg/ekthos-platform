# Política de Garantia e Reembolso — Uso Interno

> **Uso:** CS/suporte ao responder pedidos de cancelamento ou reembolso.
> **NÃO é texto para publicar na landing** — é política operacional interna.
> **Versão:** 1.0 — 30/05/2026

---

## Princípio geral

O Ekthos não tem contrato de longo prazo. Igrejas podem cancelar a qualquer momento. Nossa política de reembolso reflete isso: somos generosos em casos legítimos, mas mantemos critérios claros para evitar abuso.

**Filosofia:** Um pastor insatisfeito que sai bem tratado indica o produto para outro. Um pastor insatisfeito que sai mal trata faz exatamente o oposto.

---

## Situações e respostas padrão

### 1. Cancelamento dentro dos 7 dias de trial

**Política:** Trial é gratuito. Não há cobrança. Nada a reembolsar.

**Ação:** Cancelar imediatamente via Stripe. Marcar como `churned_trial` no painel. Enviar pergunta de saída:

```
"Lamentamos que não tenha funcionado como esperado. 
Para melhorarmos: o que impediu o Ekthos de ser útil para você?"
```

---

### 2. Cancelamento em até 7 dias após o primeiro pagamento

**Política:** Reembolso total do primeiro mês, sem questionamentos.

**Condição:** Não há condição — reembolso automático em até 7 dias corridos do pagamento.

**Ação:** Processar reembolso no Stripe. Cancelar subscription. Marcar `churned_paid_early` no painel.

**Script de resposta:**
```
"Entendido, Pastor [Nome]. Processarei o reembolso integral 
de R$ [valor] agora — você receberá em 5–10 dias úteis 
dependendo do banco. Lamento que não tenha funcionado. 
Posso perguntar o motivo principal?"
```

---

### 3. Cancelamento entre 7–30 dias após o pagamento

**Política:** Reembolso proporcional aos dias não utilizados (pro-rata).

**Exceção:** Se o cancelamento for por falha técnica comprovada do Ekthos (sistema fora do ar, mensagens não enviadas sem justificativa), reembolso total independente do período.

**Cálculo:**
```
dias_restantes = 30 - dias_desde_pagamento
valor_reembolso = (valor_pago / 30) * dias_restantes
```

**Ação:** Calcular, processar no Stripe, registrar em `admin_events`.

---

### 4. Cancelamento após 30 dias

**Política:** Sem reembolso do mês corrente. Cancelamento válido para o próximo ciclo.

**Exceção:** Falha técnica comprovada — avaliar caso a caso.

**Script de resposta:**
```
"Cancelamento processado, Pastor [Nome]. Sua assinatura 
não será renovada no dia [data]. Você mantém acesso até 
o final do ciclo atual. Foi um prazer servir [Igreja]."
```

---

### 5. Pedido de reembolso por "não funcionou" sem ter usado

**Verificar no painel:**
- Conversas iniciadas: 0?
- Onboarding completo: não?
- Visitantes registrados: 0?

**Se não usou:**
```
"Pastor [Nome], percebo que o agente ainda não foi 
configurado na sua igreja. Antes de cancelar, posso 
dedicar 30 minutos para configurar juntos? Quero 
garantir que você veja o resultado de verdade."
```

→ Oferecer nova sessão de onboarding. Se recusar: processar reembolso sem fricção.

---

### 6. Disputa de cobrança (chargeback no cartão)

**Política:** Não contestar chargebacks de até R$ 290 (custo de contestação é igual ou maior que o valor).

**Ação:** Cancelar subscription imediatamente. Marcar `banned_chargeback` no painel. Não reativar sem avaliação manual.

---

## Limites de autoridade

| Situação | CS pode aprovar sozinho | Precisa de fundador |
|---|---|---|
| Reembolso < R$ 290 | ✅ | |
| Reembolso entre R$ 290–580 | ✅ | |
| Reembolso > R$ 580 | | ✅ |
| Extensão de trial gratuita | ✅ (máx 7 dias) | |
| Desconto personalizado retroativo | | ✅ |
| Cancelamento de chargeback | | ✅ |

---

## Registro obrigatório

Todo reembolso processado deve ser registrado:

```sql
INSERT INTO public.admin_events (
  action, church_id, admin_user_id,
  before, after, reason
) VALUES (
  'refund_processed',
  '[church_id]',
  '[admin_uuid]',
  '{"amount_charged": [valor], "subscription_status": "active"}',
  '{"amount_refunded": [valor], "subscription_status": "canceled"}',
  '[motivo relatado pelo pastor]'
);
```

---

## Métricas de acompanhamento

Revisar mensalmente:

- Taxa de churn trial → pago: meta < 40%
- Taxa de churn pago < 30 dias: meta < 10%
- Taxa de churn pago > 30 dias: meta < 5%/mês
- Reembolsos solicitados / total de pagamentos: meta < 3%
- NPS de saída (pergunta no cancelamento): meta > 6/10
