# Sales Tracker — Template e Processo

> **Uso:** Controle diário do pipeline de vendas. Preencher a cada contato.
> **Ferramenta:** Planilha (Google Sheets) ou painel admin futuro
> **Responsável:** SDR + CS + fundadores

---

## Etapas do pipeline (funil de vendas)

```
NOVO → CONTATO_ENVIADO → RESPONDEU → DEMO_AGENDADA → 
DEMO_REALIZADA → TRIAL_ATIVO → NEGOCIANDO → 
CLIENTE_PAGO → DESQUALIFICADO → PERDIDO
```

---

## Definições de cada etapa

| Etapa | Critério de entrada | SLA |
|---|---|---|
| **NOVO** | Lead identificado, sem contato ainda | — |
| **CONTATO_ENVIADO** | Primeiro WhatsApp/email enviado | — |
| **RESPONDEU** | Pastor respondeu qualquer mensagem | — |
| **DEMO_AGENDADA** | Data/hora de call confirmada | 48h para realizar |
| **DEMO_REALIZADA** | Call aconteceu; pastor viu o produto | — |
| **TRIAL_ATIVO** | Conta criada, trial em andamento | 7 dias |
| **NEGOCIANDO** | Trial ativo, pastor está avaliando conversão | 5 dias |
| **CLIENTE_PAGO** | Primeiro pagamento confirmado | — |
| **DESQUALIFICADO** | Lead não tem perfil ICP | — |
| **PERDIDO** | Tinha perfil mas não converteu | — |

---

## Campos obrigatórios por lead

| Campo | Tipo | Exemplo |
|---|---|---|
| ID | auto | #001 |
| Nome da Igreja | texto | Igreja Batista Central |
| Nome do Pastor | texto | Pastor Carlos |
| WhatsApp | telefone | 11 9 9999-9999 |
| Email | email | carlos@ibcentral.com.br |
| Cidade | texto | São Paulo - SP |
| Denominação | select | Batista / Presbiteriana / Assembleia / Independente / Outro |
| Tamanho estimado | número | 200 |
| Score ICP (0–10) | número | 8 |
| Fonte | select | Instagram / WhatsApp cold / Indicação / Email / Evento / Ads |
| Etapa atual | select | (ver etapas acima) |
| Data do primeiro contato | data | 30/05/2026 |
| Data da última interação | data | 02/06/2026 |
| Data de entrada no trial | data | 05/06/2026 |
| Data de conversão | data | 12/06/2026 |
| Receita mensal | valor | R$ 290,00 |
| Cupom usado | texto | FUNDADOR50 |
| Motivo de perda | texto | (se PERDIDO) |
| Notas | texto | "Quer ver demo semana que vem" |

---

## Atividades mínimas por semana

### SDR
- [ ] Prospectar 20 novos leads (pesquisa + scoring ICP)
- [ ] Enviar 10 contatos frios (WhatsApp ou email)
- [ ] Fazer follow-up em todos os leads CONTATO_ENVIADO há > 5 dias
- [ ] Registrar resultado de cada interação

### CS
- [ ] Realizar todos os demos agendados
- [ ] Fazer check-in D3 e D7 de todos os trials ativos
- [ ] Registrar NPS de trials que viraram clientes (mês 3)
- [ ] Solicitar indicações de clientes com NPS ≥ 8

---

## Métricas semanais a acompanhar

### Funil de conversão

| Conversão | Meta |
|---|---|
| NOVO → CONTATO_ENVIADO | 100% (todos os novos contactados) |
| CONTATO_ENVIADO → RESPONDEU | > 15% |
| RESPONDEU → DEMO_REALIZADA | > 50% |
| DEMO_REALIZADA → TRIAL_ATIVO | > 60% |
| TRIAL_ATIVO → CLIENTE_PAGO | > 30% |

### Velocidade do funil

| Etapa | Tempo máximo aceitável |
|---|---|
| NOVO → CONTATO_ENVIADO | 24h |
| RESPONDEU → DEMO_AGENDADA | 48h |
| DEMO_REALIZADA → TRIAL | 48h |
| TRIAL → Onboarding completo | 48h |
| TRIAL → Decisão de conversão | 7 dias |

---

## Revisão semanal do pipeline (sexta-feira)

Perguntas a responder:

1. Quantos leads novos entraram esta semana?
2. Qual etapa tem mais acúmulo? Por quê?
3. Algum trial ativo há > 5 dias sem onboarding? Acionar agora.
4. Quantos clientes converteram esta semana?
5. Qual o motivo mais frequente de perda?
6. Algum lead de alto potencial (score ≥ 8) parado há > 3 dias?

---

## Template de notificação de conversão (para o time)

```
🎉 NOVO CLIENTE — [Nome da Igreja]
Pastor: [Nome]
Cidade: [Cidade]
Plano: Chamado R$ 290/mês
Cupom: [cupom ou "sem cupom"]
Fonte: [fonte]
MRR acumulado: R$ [total mensal atualizado]
Onboarding: [data agendada]
```

Enviar no grupo interno da equipe a cada conversão.

---

## Coluna de motivos de perda (preencher quando PERDIDO)

| Código | Descrição |
|---|---|
| PRECO | Preço acima do orçamento |
| CONCORRENTE | Escolheu Church Tools / outro |
| NAO_PRIORIDADE | Não é prioridade agora |
| SEM_VISITANTES | Igreja sem fluxo de visitantes |
| DENOMINACAO | Restrição da denominação |
| NAO_USA_WHATSAPP | Pastor não usa WhatsApp |
| SEM_RESPOSTA | Nunca respondeu após 3 tentativas |
| TRIAL_SEM_USO | Entrou no trial mas nunca configurou |
| OUTRO | Anotar em "Notas" |
