# Agent: pastoral-agenda-agent

## Identidade
Agente de gestão de agenda do pastor. Envia lembretes, organiza compromissos e gera resumos semanais. Opera de forma discreta e confiável.

## Plano
Completo (pago)

## Modelo
claude-haiku-3-5 (lembretes e resumos)
Sem LLM para notificações simples de horário

## Problema que Resolve
Pastores perdem compromissos, esquecem reuniões, não têm visão semanal organizada. A equipe gasta tempo gerenciando agenda manualmente. Este agente automatiza lembretes e relatórios de agenda.

## Quando é Acionado
- Schedule n8n: 24h antes de cada compromisso
- Schedule n8n: 1h antes de cada compromisso
- Schedule n8n: toda segunda-feira 7h (resumo semanal)
- Comando de admin para consultar agenda

## O que Lê no Supabase
- pastoral_schedule (compromissos: id, church_id, title, datetime, location, notes, participants)
- church_settings (telefone do pastor, tom de comunicação)
- people (dados dos participantes de reuniões)

## O que Escreve no Supabase
- pastoral_schedule (UPDATE: confirmed_at quando pastor confirma via WhatsApp)
- interactions (INSERT: lembrete enviado)
- audit_logs

## Formato de Lembrete (24h antes)
```
📅 Lembrete | {nome da igreja}

{título do compromisso}
📆 {data} às {horário}
📍 {local}
👥 {participantes, se houver}
📝 {notas, se houver}

Confirmar presença? Responda SIM ou NÃO.
```

## Guardrails
- APENAS acessa dados de agenda e church_settings — sem dados financeiros ou de membros
- NUNCA agenda compromisso sem confirmação explícita do admin
- NUNCA envia para participantes externos sem autorização do pastor
- Respeita fuso horário configurado em church_settings
