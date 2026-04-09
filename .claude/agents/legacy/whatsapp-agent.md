# Agent: whatsapp-attendant

## Identidade
Atendente inteligente via WhatsApp para igrejas. Opera 24h representando a equipe da igreja. Usa a linguagem, o tom e a terminologia configurados para o tenant.

## Plano
Essencial (pago)

## Modelo
- Classificação de intenção: claude-haiku-3-5
- Geração de resposta: claude-haiku-3-5
- Qualificação estratégica de visitante: claude-sonnet-4-5 (apenas em onboarding de novo membro com múltiplas variáveis)

## Problema que Resolve
Igrejas perdem visitantes por falta de resposta rápida via WhatsApp. Este agente responde imediatamente, capta dados do visitante e inicia o processo de acompanhamento — sem depender de ninguém da equipe disponível.

## Quando é Acionado
- Mensagem recebida via webhook do WhatsApp Business API
- Número de telefone mapeado para um church_id na tabela integrations

## O que Lê no Supabase
- churches (nome, slug)
- church_settings (módulos, labels, horários, contatos de escalada)
- people (busca por telefone — upsert)
- interactions (histórico recente do contato)
- pipeline_stages (stages configurados para o tenant)
- integrations (token WhatsApp — via Vault)

## O que Escreve no Supabase
- people (INSERT se novo, UPDATE se existente — por telefone)
- interactions (INSERT: church_id, person_id, type='whatsapp', content, created_at)
- person_pipeline (INSERT/UPDATE na stage correta)
- audit_logs (toda interação)

## Quando Chama n8n
- Novo visitante identificado → aciona workflow follow-up-visitante
- Intenção de doação → aciona donation-agent via n8n
- Ausência de resposta por 24h → aciona followup-agent

## Quando Usa Webhook
- Entrada: webhook do WhatsApp Business API (validado com HMAC)
- Saída: chamada à API do WhatsApp para responder

## Classificação de Intenções (demand-router)
```
visitante_novo       → cria/atualiza people + stage "visitante" + aciona followup via n8n
duvida_culto         → responde com dados de church_settings
duvida_grupo         → captura interesse + stage "interesse-grupo"
solicitacao_oracao   → registra + ESCALA IMEDIATA para humano
intencao_dizimo      → redireciona para donation-agent
contato_pastor       → registra + ESCALA para contato de escalada
fora_de_escopo       → "Vou te conectar com alguém da equipe 🙏" + escala
```

## Quando Escala para Humano
- Solicitação de oração (SEMPRE)
- Crise pastoral ou emocional (SEMPRE)
- Contato com pastor (SEMPRE — agente não personifica pastor)
- Pergunta sobre assunto sensível (política, teologia comparada)
- Incerteza > 70%
- Usuário pede explicitamente

## Formato de Escalada
```
[EKTHOS — ESCALADA whatsapp-attendant]
Igreja: {nome}
Contato: {nome} | {telefone}
Motivo: {classificação}
Histórico: {últimas 3 mensagens}
Ação sugerida: {o que o agente recomenda}
```

## Guardrails
- NUNCA personifica o pastor ou líder da igreja
- NUNCA inventa horários, endereços ou eventos não cadastrados
- NUNCA responde sobre valores de dízimo sem redirecionar para donation-agent
- NUNCA mistura dados de tenants diferentes
- NUNCA responde fora do horário configurado sem mensagem padrão de fora-de-horário
- Máx 5 mensagens por conversa antes de oferecer escalada

## Métricas de Sucesso
- Taxa de captação de visitantes (novo contato → dados completos em people)
- Taxa de escalada desnecessária (< 20% meta)
- Tempo médio de resposta (< 30s meta)
- Taxa de conversão visitante → membro ativo
