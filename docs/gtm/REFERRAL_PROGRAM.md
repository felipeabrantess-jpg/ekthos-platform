# Programa de Indicação — Ekthos

> **Nome do programa:** "Pastores que Crescem Juntos"
> **Status:** Planejado — implementar após 20 clientes pagantes ativos
> **Responsável:** CS + fundadores

---

## Modelo de incentivo

### Para quem indica (cliente Ekthos)
- **1 mês grátis** na própria assinatura por cada indicação que se tornar cliente pagante
- Sem limite de indicações — pode ganhar meses ilimitados
- Desconto aplicado automaticamente após confirmação de pagamento do indicado

### Para quem é indicado (nova igreja)
- **30 dias de trial** em vez do trial padrão de 7 dias
- Sem cartão de crédito

**Mensagem de posicionamento:**
> "Quando você indica um pastor amigo, vocês dois saem ganhando. Ele tem 30 dias para testar. Você ganha um mês grátis."

---

## Como funciona

### Fluxo do indicador

1. Pastor acessa o painel Ekthos → seção "Indicar pastor"
2. Sistema gera link único de indicação: `ekthosapp.com.br/signup?ref=PASTOR_SLUG`
3. Pastor compartilha o link pelo WhatsApp ou Instagram DM
4. Quando o indicado se cadastra via link → entra em trial de 30 dias
5. Quando o indicado paga o primeiro mês → indicador recebe crédito de 1 mês grátis

### Fluxo do indicado

1. Recebe link do pastor amigo
2. Acessa landing page com mensagem personalizada: "O Pastor [Nome] te convidou para conhecer o Ekthos"
3. Cadastra com 30 dias de trial (sem cartão)
4. Ao final dos 30 dias: converte ou cancela

---

## Implementação técnica (roadmap)

### Fase 1 — Manual (agora)
- SDR/CS pergunta em toda call: "Você conhece outro pastor que poderia se beneficiar?"
- Registrar indicação manualmente no painel admin
- Aplicar desconto manualmente via Stripe coupon único

### Fase 2 — Semi-automático (pós 20 clientes)
- Campo "como conheceu o Ekthos?" no signup com opção "indicação de pastor"
- Campo para nome do pastor que indicou
- CS confirma e aplica desconto manualmente

### Fase 3 — Automático (roadmap produto)
- Link de indicação único por cliente (`/signup?ref=SLUG`)
- Tracking automático de signup via link
- Crédito automático após primeiro pagamento do indicado
- Painel do pastor mostra indicações ativas + créditos acumulados

**Tabelas necessárias (Fase 3):**
```sql
CREATE TABLE public.referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_church_id uuid REFERENCES churches(id),
  referred_church_id uuid REFERENCES churches(id),
  referred_email text,
  status text CHECK (status IN ('pending', 'signed_up', 'trialing', 'converted', 'churned')),
  credit_applied boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  converted_at timestamptz
);
```

---

## Script de solicitação de indicação (CS)

**Durante onboarding (dia 3 de trial):**
```
"[Nome], ótimo que o agente já está funcionando. 
Uma coisa rápida: você conhece outro pastor que enfrenta 
o mesmo desafio com visitantes? 

Se você indicar e ele virar cliente, você ganha um mês 
grátis na sua assinatura. E ele tem 30 dias de trial 
em vez de 7."
```

**No email de D30:**
```
(Ver EMAIL_ONBOARDING_D0_D3_D7_D30.md — já inclui CTA de indicação)
```

**Após resolução de suporte:**
```
"Fico feliz que resolvemos! Já que você está satisfeito 
com o Ekthos — você tem um pastor amigo que poderia 
se beneficiar? Indicação = 1 mês grátis pra você."
```

---

## Regras do programa

### Crédito válido quando:
- Indicado se cadastrou via link do indicador (ou informou o nome)
- Indicado completou o trial e realizou o primeiro pagamento
- Indicado está ativo por ao menos 30 dias

### Crédito inválido:
- Auto-indicação (mesma pessoa, CNPJ diferente)
- Indicado cancelou antes do primeiro pagamento
- Indicado usou cartão recusado/chargeback

### Limite por indicação:
- 1 crédito de 1 mês por indicado convertido
- Sem limite no total de indicações por pastor
- Créditos acumulam: indicou 3 → ganha 3 meses grátis

---

## Comunicação do programa

### Email de apresentação (enviar D7 para clientes pagantes)
**Assunto:** "Indique um pastor e ganhe 1 mês grátis"

```
Oi [Nome],

Semana passada você virou cliente Ekthos. Obrigado pela confiança.

Tenho uma proposta: você indica um pastor que conhece, 
ele tem 30 dias de trial. Se ele continuar, você ganha 
1 mês grátis na sua assinatura.

Sem limite. Se indicar 5 pastores que ficam, você ganha 
5 meses grátis.

Como participar: me responde esse email com o WhatsApp 
ou Instagram do pastor. Eu conto o resto.

Felipe
```

---

## Métricas

| Métrica | Alvo (mês 3) |
|---|---|
| % de clientes que fizeram indicação | > 30% |
| Taxa de conversão indicação → trial | > 50% |
| Taxa de conversão trial → pago (indicados) | > 40% |
| CAC de clientes via indicação | < R$ 50 (vs. R$ 200+ via ads) |
