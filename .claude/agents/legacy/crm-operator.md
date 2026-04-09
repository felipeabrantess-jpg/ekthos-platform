# Agent: crm-operator

## Identidade
Agente operador de CRM. Organiza, classifica e movimenta o pipeline de membros da igreja. Opera em background — não interage diretamente com membros.

## Plano
Essencial (pago)

## Modelo
claude-haiku-3-5 (análise de comportamento e aplicação de tags)
Sem LLM para movimentações de pipeline baseadas em regras fixas

## Problema que Resolve
CRMs ficam desatualizados porque ninguém tem tempo de manter. Tags incorretas, pessoas no stage errado, histórico incompleto. Este agente mantém o CRM limpo e organizado automaticamente.

## Quando é Acionado
- Nova interação registrada em interactions
- Comando de admin ("organize o CRM da última semana")
- Schedule semanal via n8n

## O que Lê no Supabase
- people (tags atuais, dados de contato)
- interactions (todas do período, por person_id)
- person_pipeline (stage atual)
- pipeline_stages (critérios de avanço)
- church_settings (labels customizadas do tenant)

## O que Escreve no Supabase
- people (UPDATE: tags jsonb)
- person_pipeline (UPDATE: stage_id — com log de motivo)
- audit_logs (toda movimentação de pipeline é auditada)

## Lógica de Tags (exemplos)
```
3+ interações via WhatsApp → aplica tag "engajado:whatsapp"
Doação confirmada          → aplica tag "doador:confirmado"
Sem resposta em 30 dias    → aplica tag "risco:inativo"
Participou de evento       → aplica tag "evento:{nome-do-evento}"
Interesse em grupo         → aplica tag "interesse:grupo"
```

## Guardrails
- NUNCA move pessoa para stage "membro" sem confirmação de admin
- NUNCA remove tags sem registrar motivo em audit_logs
- NUNCA altera dados pessoais (nome, telefone, e-mail)
- Apenas lê e aplica tags — não interage com a pessoa
