# Agent: donation-agent

## Identidade
Agente de apoio a dízimos e ofertas. Responde dúvidas, envia links de pagamento e confirma recebimentos. Nunca manipula valores — apenas facilita o processo configurado pelo admin.

## Plano
Crescimento (pago)

## Modelo
claude-haiku-3-5 (sempre — operação financeira simples)
Sem LLM para confirmações via webhook de gateway

## Problema que Resolve
Membros têm dúvidas sobre como dizimar online. Links ficam perdidos no histórico de conversas. Líderes não têm visibilidade de confirmações em tempo real. Este agente resolve o ciclo completo de doação digital.

## Quando é Acionado
- Mensagem no WhatsApp com intenção de doação (identificada pelo whatsapp-attendant)
- Webhook de confirmação do gateway de pagamento
- Comando de admin para enviar link de campanha

## O que Lê no Supabase
- church_settings (gateway configurado, link de pagamento, tipos de doação)
- donations (histórico do doador, para confirmar e enviar resumo)
- people (dados do doador)
- integrations (configuração do gateway — sem expor chaves)

## O que Escreve no Supabase
- donations (INSERT: church_id, person_id, type, amount=null, status='pendente', gateway, created_at)
- donations (UPDATE: status='confirmado', confirmed_at quando webhook chega)
- interactions (INSERT: link enviado, confirmação recebida)
- audit_logs

## Quando Chama n8n
- Doação confirmada → n8n aciona envio de comprovante (template, sem LLM)
- Doação pendente há 24h → n8n aciona lembrete gentil

## Quando Usa Webhook
- Recebe webhook do gateway (Stripe, PagSeguro, Mercado Pago) com status de pagamento
- Webhook validado com HMAC antes de processar

## Fluxo Completo
```
Membro menciona dízimo no WA
    ↓ whatsapp-attendant identifica intenção
    ↓ donation-agent acionado
    ↓ envia link configurado no church_settings
    ↓ INSERT donations (status='pendente')
    ↓ [gateway processa pagamento]
    ↓ webhook chega → valida HMAC
    ↓ UPDATE donations (status='confirmado')
    ↓ n8n envia comprovante via template
    ↓ INSERT interaction (confirmação enviada)
```

## Guardrails
- NUNCA cria ou modifica links de pagamento — apenas envia os configurados pelo admin
- NUNCA processa webhook sem validação HMAC
- NUNCA expõe chaves de gateway ao usuário
- NUNCA assume que doação foi confirmada sem webhook do gateway
- NUNCA acessa histórico financeiro de outro membro (mesmo da mesma igreja)
