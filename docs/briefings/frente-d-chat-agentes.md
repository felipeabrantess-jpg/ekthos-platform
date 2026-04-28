# Frente D — Chat Dedicado por Agente
**Data:** 2026-05-08  
**Branch:** `staging`

---

## Objetivo

Dar tela de chat dedicada por agente. Cliente com agente ativo consegue
conversar de verdade com SSE streaming real.

---

## Arquitetura

### Sessões vs Mensagens

- `agent_chat_sessions` — tabela de **metadata de UI** (título, last_message_at)
- `agent_conversations` — tabela **gerenciada pelas EFs** (mensagens reais)
- As EFs persistem mensagens por `(church_id, user_id, agent_slug)` flat
- Sessões isolam visualmente as conversas via **time-range** em `created_at`
- `clear_history: true` enviado na primeira mensagem de uma "Nova conversa"

### Limitação MVP conhecida
Clicar em sessão antiga mostra mensagens vazias se houve um `clear_history`
posterior. Full session isolation requer adicionar `session_id` nas EFs — TODOdeja listado abaixo.

---

## Arquivos criados

### `supabase/migrations/20260427230000_agent_chat_sessions.sql`
```
agent_chat_sessions:
  id, church_id, user_id, agent_slug,
  title (default 'Nova conversa'), last_message_at, archived, created_at
RLS: chat_sessions_user_read + chat_sessions_user_write
     (church_id = auth_church_id() AND user_id = auth.uid())
```

### `web/src/lib/agent-chat-client.ts`
- `openAgentStream(slug, message, clearHistory, callbacks)` — consome SSE
- `loadAgentMessages(slug, userId, limit)` — carrega histórico do DB
- Formato SSE: `data: {"type":"token","content":"..."}`  / `{"type":"done"}` / `{"type":"error"}`

### `web/src/components/agents/AgentChatInterface.tsx`
- Header sticky: ícone + nome + "Nova conversa" + status online/digitando
- Mensagens: bulhas alinhadas (user=direita brand-600, assistant=esquerda cream-light)
- Streaming: typing dots → texto acumulado em tempo real
- Input: textarea auto-grow + botão Send + atalho Enter/Shift+Enter
- Auto-scroll ao receber chunk
- Estados: idle / sending / streaming / error (com botão retry)
- Mobile-first: full-width, input adesivo no rodapé

### `web/src/components/agents/AgentChatHistory.tsx`
- Lista sessões ordenadas por `last_message_at DESC`
- Cada item: título + tempo relativo (agora / há Xmin / há Xh / ontem)
- Sessão ativa: bg-brand-50 + border-l-2 brand
- Botão "Nova" no topo
- Desktop: painel fixo 240px; Mobile: com botão onClose (drawer)

### `web/src/pages/agents/AgentChat.tsx`
- Rotas: `/agentes/:slug/conversar` e `/agentes/:slug/conversar/:sessionId`
- Desktop: History (240px) + Interface (flex-1)
- Mobile: Interface fullscreen + drawer overlay para histórico
- Guarda acesso: `hasAgent(slug)` via `usePlan()` → mostra tela restrita
- "Nova conversa": cria row em `agent_chat_sessions` → navega para novo sessionId
- Carrega mensagens via time-range entre `session.created_at` e próxima sessão
- Atualiza título da sessão com primeiros 40 chars da primeira mensagem

---

## Arquivos modificados

| Arquivo | Mudança |
|---------|---------|
| `web/src/App.tsx` | +2 rotas: `/agentes/:slug/conversar[/:sessionId]` |
| `web/src/pages/agents/AgentDetail.tsx` | Estado "ativo" agora tem botão "Conversar com agente →" |
| `web/src/components/Sidebar.tsx` | Agentes ativos linkam para `/agentes/:slug/conversar` |

---

## Portões

| Portão | Status | Detalhe |
|--------|--------|---------|
| P1 — Build | ✅ | `✓ 6.78s` — 0 erros, 0 warnings |
| P2 — Validação técnica | ⏳ | Aguarda deploy Vercel após merge |
| P3 — Não-regressão | ✅ | Z1+Z2 intactos; sidebar premium intacta; agentes/módulos intactos |
| P4 — Relatório | ✅ | Este documento |

---

## Teste manual para Felipe (5 min)

1. Navegar para `/agentes` → selecionar um agente ativo
2. `/agentes/agent-suporte` → badge verde + botão "Conversar com agente →"
3. Clicar → vai para `/agentes/agent-suporte/conversar`
4. Chat vazio com empty state "Como posso te ajudar hoje?"
5. Digitar mensagem → tokens aparecem em tempo real (SSE)
6. Sidebar esquerda (desktop) mostra "Conversas" com a sessão recém-criada
7. Clicar "Nova conversa" → nova linha no histórico, chat limpo
8. Segunda mensagem → contexto reiniciado na EF (`clear_history: true`)
9. Mobile: botão History (ícone) no topo-esquerdo abre drawer

---

## TODOs registrados

| ID | Detalhe |
|----|---------|
| TODO-FRENTE-D-SESSION | Adicionar `session_id` nas EFs dos agentes para isolamento real por sessão |
| TODO-FRENTE-D-MARKDOWN | Renderizar markdown nas mensagens do agente (bold, listas, código) |
| TODO-FRENTE-D-TITLE-AUTO | Título da sessão atualizar apenas na primeira mensagem (evitar double update) |
| TODO-FRENTE-D-MOBILE-SCROLL | Validar scroll no iOS Safari (altura 100dvh em vez de calc) |

---

## PR

https://github.com/felipeabrantess-jpg/ekthos-platform/compare/main...staging?expand=1
