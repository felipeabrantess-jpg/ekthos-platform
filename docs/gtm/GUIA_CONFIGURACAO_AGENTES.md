# Guia de Configuração de Agentes de IA

> **Público:** Administrador da igreja  
> **Data:** 2026-05-30  
> **Pré-requisito:** WhatsApp conectado, membros cadastrados

---

## O que são os Agentes Ekthos

Agentes de IA são assistentes inteligentes que executam tarefas pastorais automaticamente. Cada agente tem uma especialidade — acolhimento, reengajamento, relatórios — e pode ser ativado e configurado pelo administrador da igreja sem precisar de conhecimento técnico.

---

## Agente de Acolhimento

**Função:** Responder visitantes e membros no WhatsApp automaticamente.

### Configurações disponíveis

| Configuração | Descrição | Padrão |
|---|---|---|
| Janela de atendimento | Horário em que o agente responde | 08h–21h |
| Tom de voz | Formal / Informal / Carismático | Informal |
| Nome do assistente | Como o agente se apresenta | "Assistente da Igreja" |
| Handoff automático | Quando escalar para humano | Nunca (manual) |
| Anti-spam | Limite de respostas por conversa | 5 mensagens/5 min |

### Como configurar a janela de atendimento

1. Vá em **Agentes → Acolhimento → Configurações**
2. Defina hora de início e hora de fim
3. Mensagens fora da janela são respondidas no início do próximo período (não ficam sem resposta)

### Configuração de handoff (escalonamento para humano)

O agente pode escalar automaticamente para um líder quando detecta:
- Pedido de oração urgente
- Crise emocional ou familiar
- Dúvida que ele não consegue responder

Para configurar:
1. Vá em **Agentes → Acolhimento → Handoff**
2. Adicione palavras-chave que disparam o handoff
3. Defina o líder que recebe a notificação

---

## Agente de Reengajamento

**Função:** Identificar membros que sumiram e iniciar contato de cuidado.

### Como funciona

O agente monitora a frequência de interações e presença no pipeline. Quando detecta que alguém está ausente por um período configurado, envia uma mensagem de cuidado pastoral.

### Configurações

| Configuração | Descrição | Padrão |
|---|---|---|
| Dias de silêncio | Quantos dias sem contato antes de agir | 14 dias |
| Tipo de mensagem | Texto / Áudio (em breve) | Texto |
| Frequência máxima | Máximo de tentativas | 2x/mês |

### Ativação

1. Vá em **Agentes → Reengajamento**
2. Configure o período de silêncio
3. Revise e personalize o texto da mensagem
4. Ative

---

## Boas práticas para todos os agentes

### Tom de voz consistente com sua igreja

Defina o tom que reflete a identidade da sua comunidade. Igrejas mais formais devem usar linguagem mais cuidadosa; igrejas jovens e carismáticas podem usar linguagem mais descontraída. A Ekthos adapta o agente ao seu perfil.

### Revisão periódica

Acompanhe as conversas dos agentes semanalmente no painel **Conversas → Automáticas**. Isso permite:
- Identificar perguntas que o agente não soube responder
- Ajustar o tom se necessário
- Verificar se handoffs estão funcionando

### Não ative agentes que você não acompanha

Cada agente ativo envia mensagens em nome da sua igreja. Ative um de cada vez, acompanhe por 2 semanas, depois expanda.

---

## Marketplace de Agentes

Para adicionar novos agentes ao seu plano:

1. Vá em **Agentes → Marketplace**
2. Explore os agentes disponíveis
3. Clique em "Ativar" para iniciar o trial de 7 dias (quando disponível)
4. Após trial, o valor é adicionado à sua assinatura

> Cada agente tem uma trial independente. Você pode testar todos antes de decidir.

---

## Solução de problemas comuns

| Problema | Solução |
|---|---|
| Agente não responde | Verifique se o WhatsApp está conectado (Settings → WhatsApp) |
| Resposta fora do horário configurado | Revise a janela de atendimento — timezone está correta? |
| Agente respondendo mas não salvando contato | Verifique permissões da integração Z-API |
| Muitos handoffs desnecessários | Revise as palavras-chave de handoff |

---

## Suporte para configuração

Se precisar de ajuda para configurar qualquer agente, o CS da Ekthos pode fazer uma sessão de configuração guiada por vídeo. Entre em contato via chat no app ou suporte@ekthosai.com.
