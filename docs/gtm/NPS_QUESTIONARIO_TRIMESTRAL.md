# NPS Trimestral — Questionário e Processo

> **Frequência:** Trimestral (meses 3, 6, 9, 12 de cada cliente)
> **Meio:** WhatsApp (mais resposta que email para pastores)
> **Responsável:** CS
> **Meta de taxa de resposta:** > 60%

---

## Pergunta NPS principal

Enviada via WhatsApp, texto simples:

```
Oi Pastor [Nome], tudo bem?

Uma pergunta rápida: de 0 a 10, o quanto você recomendaria 
o Ekthos para outro pastor que você conhece?

(0 = não recomendaria de jeito nenhum / 10 = recomendaria 
com certeza)

Só um número basta. :)
```

→ Aguardar resposta. Registrar no painel.

---

## Perguntas de follow-up por score

### Promotores (9–10)

```
Que ótimo! Fico feliz. 

O que o Ekthos fez que mais te ajudou?
```

→ Usar a resposta como depoimento (com permissão).
→ Solicitar indicação imediatamente após.

---

### Neutros (7–8)

```
Obrigado pelo feedback.

O que faria você dar um 10? 
O que está faltando ou poderia ser melhor?
```

→ Registrar feedback. Avaliar se é bug, feature request ou expectativa não alinhada.
→ Criar tarefa interna para resolver o ponto levantado.

---

### Detratores (0–6)

```
Obrigado por ser honesto. Isso me ajuda muito.

Pode me contar o que está frustrando na sua experiência?
```

→ Escutar sem defender. Registrar.
→ Acionar fundadores se score < 5 — risco de churn em 30 dias.
→ Oferecer call urgente de resolução.

---

## Questionário completo (versão estendida — trimestral)

Enviar apenas para clientes que responderam a pergunta NPS. Máximo 5 perguntas.

**Pergunta 2 — Facilidade de uso**
```
Como você avalia a facilidade de usar o painel do pastor?
(Muito difícil / Difícil / Ok / Fácil / Muito fácil)
```

**Pergunta 3 — Resultado percebido**
```
Você percebeu diferença no número de visitantes que voltam 
depois de começar a usar o Ekthos?
(Sim, claramente / Acho que sim / Ainda não deu pra avaliar / Não percebi diferença)
```

**Pergunta 4 — Suporte**
```
Como foi sua experiência com o suporte da Ekthos?
(Ótimo / Bom / Regular / Ruim / Não precisei usar)
```

**Pergunta 5 — Melhoria prioritária**
```
Se você pudesse mudar uma coisa no Ekthos, o que seria?
(Resposta aberta)
```

---

## Processo de coleta e registro

### Calendário de envio
```
Mês 3:  Pergunta NPS + follow-up de score
Mês 6:  Questionário completo (5 perguntas)
Mês 9:  Pergunta NPS + follow-up de score
Mês 12: Questionário completo + pedido de depoimento formal
```

### Registro no painel admin
```sql
INSERT INTO public.admin_events (
  action, church_id, admin_user_id,
  before, after, reason
) VALUES (
  'nps_collected',
  '[church_id]',
  '[admin_uuid]',
  NULL,
  '{
    "score": [0-10],
    "qualitative": "[resposta de follow-up]",
    "period": "Q1_2026",
    "would_recommend": true/false
  }'::jsonb,
  'NPS trimestral'
);
```

---

## Cálculo do NPS consolidado

```
NPS = % Promotores (9–10) - % Detratores (0–6)

Exemplo:
- 10 respondentes
- 6 promotores (60%)
- 2 neutros (20%)
- 2 detratores (20%)

NPS = 60% - 20% = 40

Referência de mercado SaaS: 
- < 0: Crítico
- 0–30: Bom
- 30–70: Excelente
- > 70: World-class
```

**Meta Ekthos:** NPS > 50 ao final do primeiro ano.

---

## Ações por faixa de NPS

### NPS < 20 (atenção crítica)
- Revisar product-market fit com top 3 reclamações
- Reunião de retrospectiva com fundadores
- Priorizar os 2 feedbacks mais recorrentes no roadmap

### NPS 20–40 (ok, mas melhorável)
- Listar top 5 feedbacks de melhoria
- Criar plano de ação trimestral

### NPS > 40 (excelente)
- Intensificar programa de indicações
- Coletar depoimentos para landing e redes sociais
- Avaliar expansão de features (novos agentes, planos superiores)

---

## Depoimentos coletados

Registrar aqui (ou em documento separado) os depoimentos com permissão:

| Igreja | Pastor | Score | Depoimento | Permissão de publicar |
|---|---|---|---|---|
| (preencher) | (preencher) | (preencher) | (preencher) | Sim/Não |

→ Usar nos slides de venda, landing page e Instagram.
