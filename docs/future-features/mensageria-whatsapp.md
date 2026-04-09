# Mensageria WhatsApp — Templates e Integração

> Feature futura. Depende de WhatsApp Business API aprovada (Meta).
> Referência para: feature de mensageria, tabela `message_templates`.

---

## Dependência crítica

Todos os templates abaixo dependem de **WhatsApp Business API** aprovada pela Meta.
Sem essa integração, as automações #1–5 e #9–15 de `automacoes.md` não funcionam.
Alternativa de curto prazo: notificações in-app (push) enquanto WhatsApp não está ativo.

---

## Os 13 templates

### `boas_vindas_visitante`
**Uso:** Automação #1 — 2h após chegada do visitante
```
Olá {nome}! Que alegria ter você conosco no culto!
Eu sou {consolidador}, da {nome_igreja}.
Gostaria de saber como foi sua experiência e te convidar
para conhecer nossa célula mais perto de você. Posso te contar mais?
```

### `convite_celula_proxima`
**Uso:** Automação #5 — após aceitar consolidação
```
{nome}, temos uma célula pertinho de você no bairro {bairro}!
O líder é {lider_nome} e eles se reúnem toda {dia_celula} às {hora_celula}.
Quer participar esta semana?
```

### `membro_ausente_lider`
**Uso:** Automação #6 — 14 dias sem presença
```
Líder {lider_nome}, o(a) {nome} não participa da célula há {dias} dias.
Vale uma ligação?
```

### `membro_ausente_supervisor`
**Uso:** Automação #7 — 14 dias sem presença
```
{supervisor_nome}, o(a) {nome} da célula {celula_nome} (líder {lider_nome})
está ausente há {dias} dias. Área: {area}.
```

### `membro_ausente_30dias_pastor`
**Uso:** Automação #4 — 30 dias sem presença (membro ativo)
```
Pastor, o(a) {nome} (célula {celula}, sede {sede}) está ausente há 30 dias.
Último registro: {ultimo_registro}. Recomendo contato pastoral.
```

### `consolidacao_atrasada`
**Uso:** Automação #3 — SLA de 24h estourado
```
ALERTA: Visitante {nome} ({sede}) veio ao culto há mais de 24h
e NINGUÉM fez contato. Consolidador designado: {consolidador}.
Favor agir imediatamente.
```

### `convite_escola_fe`
**Uso:** Automação #9 — turma da Escola da Fé abrindo
```
{nome}, que bom que você está firme na célula!
A próxima turma da Escola da Fé começa dia {data}.
É o próximo passo no seu caminho de crescimento. Quer se inscrever?
```

### `convite_batismo`
**Uso:** Automação #10 — 48h após formatura
```
{nome}, parabéns por concluir a Escola da Fé!
O próximo batismo será dia {data_batismo}. Quer fazer parte?
```

### `feliz_aniversario`
**Uso:** Automação #12 — aniversário do membro
```
Feliz aniversário, {nome}! A {nome_igreja} celebra sua vida.
Que Deus continue abençoando você ricamente!
```

### `aniversario_conversao`
**Uso:** Automação #13 — data de conversão
```
{nome}, hoje faz {anos} ano(s) da sua decisão por Cristo!
Que linda jornada. A {nome_igreja} é grata por caminhar com você.
```

### `convite_evento`
**Uso:** Automação #14 — 5 dias antes do evento
```
{nome}, o evento {evento_nome} está chegando!
Dia {evento_data} às {evento_hora} na {sede}. Confirma sua presença?
```

### `queda_departamento`
**Uso:** Automação #11 — queda de frequência
```
{destinatario}, o departamento {departamento} teve queda de {percentual}%
na frequência nas últimas 2 semanas.
```

### `novo_visitante_consolidar`
**Uso:** Automação #2 — aviso imediato ao consolidador
```
Novo visitante! {nome}, {telefone}.
Veio ao culto de {dia_culto} na {sede}.
Consolidador designado: VOCÊ. Faça contato em até 24h.
```

---

## Variáveis globais disponíveis

| Variável | Fonte |
|----------|-------|
| `{nome}` | `members.full_name` |
| `{nome_igreja}` | `churches.name` |
| `{sede}` | `sedes.name` via `members.sede_id` |
| `{celula}` / `{celula_nome}` | `celulas.name` via `members.celula_id` |
| `{lider_nome}` | `members.name` do líder da célula |
| `{supervisor_nome}` | `members.name` do supervisor da área |
| `{consolidador}` | Usuário designado pelo sistema |
| `{dias}` | Calculado: `NOW() - ultimo_registro` |
| `{ultimo_registro}` | `members.ultimo_registro` |

---

## Regras de tom

- Linguagem **acolhedora e fraternal** — nunca fria ou corporativa
- Nunca usar "lead", "prospect", "cliente" ou termos de CRM genérico
- Chamar de "irmão/irmã" apenas se o membro usar esse tratamento primeiro
- Templates de alerta (consolidação, ausência) são diretos e objetivos — sem suavizar urgência
- Templates para membros são calorosos — representam a voz da igreja, não do sistema
