# Rule: Política de Uso de Modelos de IA

## Princípio

O custo de IA é o principal custo variável da plataforma. Todo token consumido deve ter justificativa. O modelo padrão é sempre o mais barato que resolve o problema.

## Hierarquia de Modelos

### claude-haiku-3-5 — PADRÃO OBRIGATÓRIO

Usar em:
- Classificação de intenção e triagem
- Respostas de suporte 24h
- Atendimento via WhatsApp e Instagram
- Follow-ups automáticos
- Operações de CRM (tags, pipeline)
- Agenda pastoral (lembretes, notificações)
- Campanhas simples (template + personalização básica)
- Confirmação de doações e envio de links

Custo aproximado: $0.0008 por 1.000 tokens de entrada

### claude-sonnet-4-5 — EXCEÇÃO JUSTIFICADA

Usar somente quando:
- Onboarding estratégico de nova igreja (ekthos-chief-architect em EVALUATE/DESIGN)
- Geração de workflows n8n via linguagem natural
- Revisão de arquitetura ou contexto complexo
- Diagnóstico de problema com múltiplas variáveis
- Situação onde Haiku falhou documentadamente

Custo aproximado: $0.003 por 1.000 tokens de entrada (3.75× mais caro)

Meta: uso de Sonnet < 10% das chamadas totais

## Regras Numeradas: MOD-01 a MOD-10

MOD-01: Todo agente novo começa com Haiku. Sonnet só entra com evidência de falha documentada.
MOD-02: Prompts de sistema devem ter menos de 500 tokens. Contexto do tenant: apenas o trecho relevante.
MOD-03: Contexto de tenant (church_settings + context/tenants/{slug}.md) é cacheado por 30 minutos por sessão.
MOD-04: Classificação de intenção é sempre separada da geração de resposta (2 chamadas menores > 1 chamada grande).
MOD-05: Tokens consumidos por church_id devem ser registrados em audit_logs com o campo token_count.
MOD-06: Alertar admin do tenant quando uso atingir 80% do limite do plano.
MOD-07: Automações com template fixo (comprovante, confirmação, lembrete) NÃO usam LLM.
MOD-08: follow-ups com mensagem padronizada NÃO usam LLM — apenas personalização de nome e data.
MOD-09: Nunca usar streaming desnecessariamente — aumenta custo de conexão sem benefício em automações.
MOD-10: Revisar mensalmente os agentes com maior consumo — otimizar prompts ou reclassificar para Haiku.

## Tabela de Decisão por Situação

| Situação | Modelo | Justificativa |
|---|---|---|
| Classificar intenção de mensagem | Haiku | Tarefa simples de categorização |
| Responder "qual o horário do culto?" | Haiku | Lookup de dado + template |
| Captar dados de visitante via chat | Haiku | Extração estruturada simples |
| Gerar copy de campanha criativa | Haiku | Testar primeiro; Sonnet se qualidade insuficiente |
| Onboarding de nova igreja | Sonnet | Raciocínio estratégico, múltiplas variáveis |
| Gerar workflow n8n completo | Sonnet | Geração de estrutura complexa |
| Diagnosticar problema de arquitetura | Sonnet | Análise multi-camada |
| Enviar lembrete de culto | Sem LLM | Template fixo via n8n |
| Confirmar doação | Sem LLM | Template + dados do banco |
| Relatório de interações | Haiku | Sumarização simples |

## Estrutura de Prompt Eficiente

Todo prompt de agente deve seguir:

```
SISTEMA (< 300 tokens):
  - Identidade do agente (1-2 linhas)
  - Contexto mínimo do tenant (nome, tom, terminologia)
  - Escopo restrito do agente (o que pode e não pode)
  - Formato de output esperado

USUÁRIO (< 200 tokens):
  - Mensagem ou dado a processar
  - Histórico recente (max últimas 3 interações)

TOTAL ALVO: < 500 tokens por chamada de classificação
            < 800 tokens por chamada de resposta
```

## Monitoramento de Custo

Logar em audit_logs para cada chamada de LLM:
```typescript
{
  church_id: string,
  agent: string,
  model: 'haiku' | 'sonnet',
  tokens_input: number,
  tokens_output: number,
  tokens_total: number,
  purpose: string, // ex: 'intent_classification', 'response_generation'
  created_at: timestamp
}
```

Alertas automáticos via n8n:
- church_id usa > 80% do limite do plano → notifica admin
- Chamada de Sonnet sem campo `reason` preenchido → alerta para revisão
- Custo diário > threshold configurado → pausa agentes não críticos
