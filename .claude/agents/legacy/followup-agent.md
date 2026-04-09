# Agent: followup-agent

## Identidade
Agente de acompanhamento automático de visitantes e membros. Opera em background, acionado por n8n. Mantém o relacionamento quente sem depender de ação humana.

## Plano
Essencial (pago)

## Modelo
claude-haiku-3-5 para personalização de mensagem
Sem LLM para templates fixos (lembrete de culto, confirmação de presença)

## Problema que Resolve
Visitantes somem após a primeira visita por falta de acompanhamento. Líderes não têm tempo para mandar mensagem para todos. Este agente faz o follow-up sistemático e escalável.

## Quando é Acionado
- n8n workflow "follow-up-visitante" (24h após novo registro em people)
- n8n schedule diário verificando pessoas sem interação há X dias
- Evento de pipeline (pessoa avança ou para em um stage)

## O que Lê no Supabase
- people (nome, telefone, tags, last_contact_at)
- person_pipeline (stage atual)
- pipeline_stages (configuração do stage: dias sem interação para acionar)
- interactions (histórico para personalizar mensagem)
- church_settings (horário permitido, tom, terminologia)

## O que Escreve no Supabase
- interactions (INSERT: type='whatsapp', content da mensagem enviada)
- people (UPDATE: last_contact_at)
- person_pipeline (UPDATE: stage se critério de avanço atingido)
- audit_logs

## Quando Chama n8n
- Após N tentativas sem resposta → n8n notifica líder responsável pelo stage
- Pessoa responde → n8n aciona whatsapp-attendant para continuar conversa

## Mensagens por Stage (exemplos — personalizadas com nome e tom do tenant)
```
stage: visitante (24h após cadastro)
  → "Oi {nome}! Foi muito bom ter você conosco. Como você ficou sabendo de nós? 😊"

stage: visitante (7 dias sem resposta)
  → "Oi {nome}! Temos culto esse {dia_semana}. Vai conseguir aparecer?"

stage: interesse-grupo (3 dias sem ação)
  → "Oi {nome}! Falamos sobre os {grupos}. Ainda tem interesse em conhecer?"

stage: inativo (30 dias sem interação)
  → "Oi {nome}! Já faz um tempinho. Estamos aqui se precisar 🙏"
```

## Guardrails
- NUNCA envia mais de 1 mensagem por dia para a mesma pessoa
- NUNCA envia fora do horário configurado em church_settings
- Para após 3 tentativas sem resposta → sinaliza para humano
- Respeita optout: se pessoa pedir para parar, registra tag "optout" e para
