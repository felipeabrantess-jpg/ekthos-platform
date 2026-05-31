# Sequência de Emails de Onboarding — D0, D3, D7, D30

> **Uso:** Enviado automaticamente após ativação da conta (trial ou pagante).
> **Sistema:** Configurar via Resend ou similar. Trigger: evento de signup no Supabase.
> **Remetente:** "Felipe da Ekthos <felipe@ekthosai.net>"
> **Tom:** Pessoal, direto, pastoral — não corporativo

---

## D0 — Boas-vindas imediatas (enviar em até 5 min após cadastro)

**Assunto:** "Sua conta Ekthos está pronta, [Nome]"

```
Oi [Nome],

Seja bem-vindo ao Ekthos.

Configurar leva menos de 48 horas — e eu mesmo vou te ajudar.

Próximo passo: me chame no WhatsApp agora para agendarmos 
seu onboarding.

👉 [Link WhatsApp direto — wa.me/5511...]

Nessa conversa vamos:
✓ Registrar o número da sua igreja no sistema
✓ Personalizar o tom das mensagens do agente
✓ Testar o primeiro envio com um número real

O trial dura 7 dias. Vamos aproveitar cada um deles.

Felipe
Fundador, Ekthos
```

---

## D3 — Verificação de progresso (dia 3 do trial)

**Assunto:** "Como está indo, [Nome]?"

```
Oi [Nome],

Já faz 3 dias desde que você abriu sua conta Ekthos.

Quero saber: o agente já está funcionando na sua igreja? 
Já enviou a primeira mensagem para um visitante?

Se ainda não — não tem problema. Demora 30 minutos 
configurar juntos. Qual é o melhor horário pra você 
amanhã?

[Link de agendamento ou WhatsApp direto]

Se já está funcionando — ótimo! Como foi a reação 
dos visitantes que receberam a mensagem?

Responde esse email ou me chama no WhatsApp.

Felipe
```

---

## D7 — Final do trial (enviar na manhã do último dia)

**Assunto:** "Último dia do trial — o que decidiu, [Nome]?"

```
Oi [Nome],

Hoje é o último dia do seu trial.

Tenho uma pergunta direta: o Ekthos funcionou para você?

Se sim — ótimo. Ativar o plano Chamado por R$ 290/mês 
leva 2 minutos: [link de ativação]

Se ainda não testou de verdade — me fala o motivo. 
Posso estender o trial por mais 3 dias se houver uma 
razão real (viagem, compromisso, culto especial).

Se decidiu que não é para agora — tudo bem. 
Me conta o motivo? Ajuda muito a melhorar o produto.

Qualquer resposta aqui é bem-vinda.

Felipe
```

---

## D7+1 — Cliente convertido (enviar após ativação do pagamento)

**Assunto:** "Bem-vindo como cliente, [Nome] — o que vem a seguir"

```
Oi [Nome],

Obrigado por confiar no Ekthos.

Sua assinatura está ativa. Aqui está o que acontece agora:

1. O agente continua funcionando — sem interrupção
2. Toda renovação acontece automaticamente no dia [data]
3. Seu painel está em: [link do painel]

Dica desta semana: veja o relatório de visitantes do 
último mês no painel. Quantos já responderam ao agente?

Qualquer dúvida: [WhatsApp direto]

Felipe
```

---

## D30 — Check-in de sucesso (30 dias como cliente)

**Assunto:** "30 dias com o Ekthos — como está o resultado?"

```
Oi [Nome],

Faz 30 dias que a [Igreja] está usando o Ekthos.

Dois números que quero que você veja no seu painel:
- Quantos visitantes o agente acompanhou
- Quantos desses estão em acompanhamento ativo agora

Se esses números não parecem certos, me chama — 
pode ter algo que podemos ajustar.

Uma coisa que eu peço: você conhece outro pastor que 
poderia se beneficiar disso? Uma indicação sua vale 
mais do que qualquer anúncio.

[Link do programa de indicações]

Gratidão pela confiança,
Felipe
```

---

## Notas técnicas de implementação

### Trigger no Supabase
```sql
-- Disparar D0 via webhook quando novo perfil criado
-- Evento: INSERT na tabela profiles com role = 'admin'
-- Payload: { user_id, church_id, name, email }
```

### Condições de envio
- D0: sempre (todos os cadastros)
- D3: apenas se `onboarding_completed = false` na `profiles`
- D7: apenas se `subscription_status = 'trialing'` em `churches`
- D7+1: trigger em `stripe-webhook` quando `subscription.active`
- D30: apenas se `subscription_status = 'active'` por 28+ dias

### Personalização dinâmica
- `[Nome]` = `profiles.display_name`
- `[Igreja]` = `churches.name`
- `[data]` = próxima data de cobrança do Stripe
- Links dinâmicos com UTM para rastreamento por campanha
