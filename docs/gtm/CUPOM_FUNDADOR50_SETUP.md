# Cupom FUNDADOR50 — Setup e Regras de Uso

> **Uso:** Primeiros 50 clientes pagantes. Desconto de 50% no primeiro mês.
> **Responsável:** Fundadores / SDR
> **Validade:** Até 50 resgates ou 31/12/2026, o que vier primeiro

---

## O que é o FUNDADOR50

Oferta exclusiva para os primeiros 50 clientes pagantes do Ekthos. Quem usar o cupom FUNDADOR50 paga apenas R$ 145 no primeiro mês (50% de desconto sobre o plano Chamado R$ 290/mês). A partir do segundo mês, o valor retorna ao preço cheio.

**Objetivo:** Reduzir atrito de conversão do trial → pago. Pastores hesitam menos quando o primeiro mês tem risco reduzido.

---

## Configuração no Stripe

### Coupon criado via Stripe Dashboard ou MCP
```
code:         FUNDADOR50
percent_off:  50
duration:     once          (apenas primeiro mês)
max_redemptions: 50
redeem_by:    2026-12-31    (Unix timestamp: 1798761600)
applies_to:   price_chamado (price ID do plano Chamado mensal)
```

### Verificar no banco após sync
```sql
SELECT id, code, percent_off, discount_type, duration,
       max_redemptions, redemptions_used, valid_until, is_active
FROM public.coupons
WHERE code = 'FUNDADOR50';
```

**Resultado esperado:**
```
id:                <uuid>
code:              FUNDADOR50
percent_off:       50
discount_type:     percent
duration:          once
max_redemptions:   50
redemptions_used:  0
valid_until:       2026-12-31
is_active:         true
```

---

## Regras de uso

### Pode usar
- Qualquer novo cliente no plano Chamado
- Clientes em trial que querem converter para pago
- Leads prospectados via WhatsApp, Instagram DM ou cold email

### Não pode usar
- Clientes já pagantes (upgrade ou migração)
- Clientes que já usaram outro cupom de desconto
- Uso retroativo (não se aplica a cobrança já realizada)

### Não oferecer sem contexto
- Não enviar o cupom antes de qualquer conversa (devalua)
- Oferecer apenas após o pastor expressar interesse genuíno
- Se o pastor não perguntou, oferecer apenas como "oferta de entrada especial"

---

## Script de uso (WhatsApp)

**Cenário A — Pastor ainda em trial, querendo continuar:**
```
Oi [Pastor Nome], vi que seu trial acaba em [data].

Quero te dar uma condição especial para continuar: use o cupom 
FUNDADOR50 na ativação e seu primeiro mês sai por R$ 145 
(metade do valor).

A partir do segundo mês fica R$ 290/mês — mas o valor está 
travado para quem entra agora. Ao chegar nos 50 clientes, 
esse desconto acaba.

Quer que eu te ajudo com a ativação agora?
```

**Cenário B — Lead novo com objeção de preço:**
```
Entendo. Posso te oferecer uma condição de fundador: 
cupom FUNDADOR50, que dá 50% de desconto no primeiro mês.

Você começa por R$ 145 — sem cartão nos 7 dias de trial 
que vêm antes. Se funcionar, continua. Se não funcionar, 
cancela sem custo.

Quantas igrejas já usaram o desconto? [X] das 50 vagas.
```

---

## Controle de resgates

Monitorar semanalmente:

```sql
SELECT redemptions_used, max_redemptions,
       max_redemptions - redemptions_used AS vagas_restantes
FROM public.coupons
WHERE code = 'FUNDADOR50';
```

**Alertas:**
- 25 resgates → informar time que metade das vagas foi usada
- 40 resgates → alertar equipe, preparar narrativa de urgência
- 50 resgates → desativar cupom no Stripe + banco, comunicar fim da oferta

---

## Comunicação de encerramento (quando esgotar)

```
[Mensagem para novos leads após 50 resgates]

O desconto de fundador foi encerrado — as 50 vagas foram 
preenchidas. O trial de 7 dias continua gratuito sem cartão.

O plano Chamado segue em R$ 290/mês após o trial.
```

---

## FAQ interno

**Posso criar um cupom diferente para um pastor específico?**
Sim. Criar via Stripe Dashboard com `max_redemptions: 1` e código personalizado (ex: PASTOR_CARLOS). Registrar em `admin_events` como motivo da concessão.

**O cupom vale para planos Missão e Avivamento?**
Não. FUNDADOR50 é exclusivo para o plano Chamado. Outros planos têm negociação direta com fundadores.

**O que acontece se o pastor cancelar e querer usar o cupom de novo?**
Stripe não permite reuso de cupom `once` na mesma subscription. Novo customer Stripe com nova subscription — verificar com fundadores caso a caso.
