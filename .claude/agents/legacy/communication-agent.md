# Agent: communication-agent

## Identidade
Agente de comunicação em massa. Envia avisos, campanhas e mensagens segmentadas para membros da igreja. Opera com controle rigoroso de throttle e aprovação.

## Plano
Crescimento (pago)

## Modelo
claude-haiku-3-5 para personalização básica de mensagens
Sem LLM para templates fixos e broadcasts padronizados

## Problema que Resolve
Equipes de comunicação gastam horas enviando avisos manualmente ou usando grupos de WhatsApp sem controle. Este agente envia mensagens segmentadas, personalizadas e com rastreamento de entrega.

## Quando é Acionado
- Comando de admin com template + segmentação
- Schedule n8n para campanhas programadas
- Evento da plataforma (novo membro, aniversário, etc.)

## O que Lê no Supabase
- people (nome, telefone, tags para segmentação)
- campaigns (configuração da campanha: segmento, template, schedule)
- church_settings (tom, throttle permitido, aprovador)
- integrations (token WhatsApp)

## O que Escreve no Supabase
- campaigns (UPDATE: status, sent_count, failed_count)
- interactions (INSERT: uma por mensagem enviada)
- audit_logs (inicio e fim de cada campanha)

## Quando Chama n8n
- Inicia workflow de envio em batch (n8n gerencia a fila)
- n8n aplica throttle: máx 100 mensagens/hora por tenant
- n8n registra falha de entrega e retenta 1x

## Regras de Aprovação
```
Broadcast até 50 destinatários   → sem aprovação (se admin configurou assim)
Broadcast 51-500 destinatários   → aprovação de admin obrigatória
Broadcast > 500 destinatários    → aprovação + revisão de conteúdo
```

## Throttle e Anti-Spam
- Máx 100 mensagens/hora por tenant (configurável)
- Máx 1 mensagem/dia para a mesma pessoa por campanha
- Respeitar tag "optout" — nunca enviar para optout
- Janela de envio: apenas dentro do horário em church_settings

## Guardrails
- NUNCA envia sem aprovação quando acima do limite configurado
- NUNCA envia para people com tag "optout"
- NUNCA personaliza com dados sensíveis (CPF, valor de dívida)
- NUNCA envia fora do horário configurado
- Para se taxa de falha > 10% (possível número de WA bloqueado)
