# Auditoria: Webhook Guards — SA-B4 MEGA-ONDA SEGURANÇA
**Data:** 2026-05-30 | **Analista:** SA-B4 (subagente)

## Resumo

Auditoria de guards nos endpoints de webhook: verificação de assinatura, replay protection e autenticação.

## Achados

### 1. webhook-receiver — BLINDADO (não modificável)
- **Status:** BLINDADO (fora do escopo de modificação)
- **Risco:** CRÍTICO — sem verificação de assinatura no payload Z-API/WhatsApp
- **Detalhe:** O webhook-receiver não verifica assinatura criptográfica das mensagens recebidas. Qualquer attacker que conheça a URL pode injetar mensagens falsas.
- **Bug adicional:** `provider_message_id = ''` bypassa dedup check → pode processar a mesma mensagem múltiplas vezes.
- **Ação necessária (humano):** Implementar verificação do header `client-token` da Z-API e normalizar `provider_message_id` antes de dedup.

### 2. stripe-webhook — BLINDADO (não modificável)
- **Status:** BLINDADO
- **Risco:** Baixo (mitigado em prod), Alto se `SKIP_SIG=true` em produção
- **Detalhe:** Flag `SKIP_SIG=true` desabilita verificação de assinatura Stripe. Deve ser confirmado como ausente em produção.
- **Verificação:** `supabase secrets list --project-ref mlqjywqnchilvgkbvicd | grep SKIP_SIG`

### 3. whatsapp-webhook — BLINDADO (não modificável)
- **Status:** BLINDADO
- **Risco:** Médio — sem replay protection (timestamp check ausente)

### 4. lead-capture — CORRIGIDO (SA-B7)
- **Status:** ✅ CORRIGIDO (CORS whitelist expandida para incluir ekthosai.net)

## Ações Pendentes (Humano)

| Prioridade | Ação | Arquivo |
|---|---|---|
| CRÍTICO | Implementar verificação de assinatura Z-API (client-token) | webhook-receiver — BLINDADO |
| CRÍTICO | Fix dedup: normalizar provider_message_id='' | webhook-receiver — BLINDADO |
| ALTO | Confirmar SKIP_SIG ausente em produção | Secrets do projeto |
| MÉDIO | Adicionar timestamp check anti-replay | whatsapp-webhook — BLINDADO |
