# SPEC — Orquestração Multi-Agente (SA-A5)

> **Sprint:** MEGA-ONDA SEGURANÇA AMPLA  
> **Data:** 2026-05-30  
> **Status:** CRÍTICO — agent-operacao referenciado mas não existe  
> **Prioridade:** CRÍTICO (quebra silenciosa em produção)

---

## Bug Crítico Identificado

### agent-operacao referenciado mas não implementado

O `conversation-router` referencia `agent-operacao` como destino para conversas classificadas como "operacionais" — mas o arquivo `supabase/functions/agent-operacao/index.ts` **não existe**.

**Impacto:** qualquer conversa roteada para `agent-operacao` falha silenciosamente. O roteamento acontece mas a chamada ao agente inexistente retorna 404 ou timeout.

**Ação imediata (pré-implementação):** `conversation-router` deve ser auditado para confirmar o comportamento atual quando o agente destino não existe. Se está lançando erro não tratado → hotfix de fallback necessário.

> ⚠️ **BLINDAGEM:** `conversation-router` está na lista de arquivos blindados. Qualquer modificação requer aprovação explícita de Felipe.

---

## Arquitetura atual de orquestração

```
webhook-receiver (WhatsApp)
  └→ conversation-router
       ├→ agent-acolhimento   (visitante / membro novo)
       ├→ agent-reengajamento (membro ausente)
       ├→ agent-operacao      ← NÃO EXISTE
       └→ conversation-handoff (escalate para humano)
```

### Critérios de roteamento (conversation-router)

| Classificação | Agente destino | Status |
|---|---|---|
| `novo_contato` | agent-acolhimento | ✅ Implementado |
| `reengajamento` | agent-reengajamento | ✅ Implementado |
| `operacional` | agent-operacao | ❌ Não implementado |
| `escalate` | conversation-handoff | ✅ Implementado |

---

## Spec do agent-operacao (a implementar)

### Responsabilidade

Responder a perguntas operacionais de membros já conhecidos: horários, endereços, departamentos, eventos próximos, informações gerais da igreja.

**Diferença do agent-acolhimento:** acolhimento é para pessoas novas (primeira interação, consolidação). Operacional é para membros que já pertencem e têm dúvidas do dia-a-dia.

### Input esperado (do conversation-router)

```typescript
interface OperacionalInput {
  church_id: string
  person_id: string
  conversation_id: string
  message: string
  message_id: string
  wamid: string
  phone: string
}
```

### Fluxo

1. Recebe mensagem classificada como `operacional`
2. Busca contexto da pessoa em `people` + `acolhimento_journey`
3. Busca informações da igreja em `church_info` / `churches`
4. Chama Claude Haiku (`claude-haiku-4-5-20251001`) com prompt pastoral
5. Envia resposta via `dispatch-message`
6. Registra em `conversations` + `conversation_messages`

### Prompt base (personalizar por igreja)

```
Você é o assistente de {{nome_da_igreja}}.
Responda de forma {{tom_de_voz}} a perguntas operacionais como horários de culto,
endereço, departamentos e eventos. Seja conciso e pastoral.
Se não souber a resposta, oriente o membro a entrar em contato com a secretaria.
Nunca invente informações.

Informações da igreja:
- Nome: {{nome}}
- Endereço: {{endereco}}
- Cultos: {{horarios}}
- Contato secretaria: {{contato}}
```

### EF a criar

**Path:** `supabase/functions/agent-operacao/index.ts`

**Deploy:** `supabase functions deploy agent-operacao --project-ref mlqjywqnchilvgkbvicd --no-verify-jwt`

**Modelo:** `claude-haiku-4-5-20251001` (NUNCA `claude-3-5-haiku-20241022`)

---

## Fallback para agente inexistente (hotfix imediato)

Enquanto `agent-operacao` não é implementado, o `conversation-router` deve ter fallback para `agent-acolhimento` quando o agente destino não responder ou não existir:

```typescript
// Em conversation-router — trecho de roteamento
try {
  const response = await supabase.functions.invoke(targetAgent, { body: payload })
  if (response.error) throw response.error
} catch (err) {
  console.error(`[router] Agente ${targetAgent} falhou, fallback para acolhimento`, err)
  await supabase.functions.invoke('agent-acolhimento', { body: payload })
}
```

> ⚠️ Modificação em arquivo BLINDADO — requer aprovação explícita de Felipe antes de executar.

---

## Roadmap de agentes futuros

| Agente | Classificação | Status |
|---|---|---|
| agent-acolhimento | `novo_contato` | ✅ Produção |
| agent-reengajamento | `reengajamento` | ✅ Produção |
| agent-operacao | `operacional` | ❌ A criar |
| agent-pastoral | `aconselhamento` | 🗓 Roadmap |
| agent-financeiro | `dizimo_oferta` | 🗓 Roadmap |
| agent-celulas | `celula_lider` | 🗓 Roadmap |

---

## Critérios de aceite

- [ ] `agent-operacao/index.ts` criado e deployado
- [ ] Mensagens classificadas como `operacional` recebem resposta em < 5s
- [ ] Fallback em `conversation-router` implementado (BLINDADO — com aprovação)
- [ ] `debit_agent_credits` chamado com `agent_scope='operacao'`
- [ ] Conversas registradas em `conversations` + `conversation_messages`
- [ ] Log de erro claro quando agente destino não existe (não falha silenciosamente)
