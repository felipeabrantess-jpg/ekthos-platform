# Superpowers × regras da Ekthos — precedência

O plugin `superpowers@superpowers-marketplace` (v7.0.0) está habilitado neste projeto. Ele orienta o PROCESSO de
engenharia (brainstorming, planos, TDD, depuração sistemática, verificação, revisão). Em qualquer conflito,
**as regras abaixo e o CLAUDE.md vencem**, assim como as instruções explícitas do proprietário na conversa.

## Nunca é permitido por causa de uma skill
- Fazer deploy de Edge Function, aplicar migration, executar SQL de escrita em produção, mesclar PR (`merge`), dar
  `push` em `main` ou publicar o front **sem autorização expressa e atual** do proprietário para aquela ação.
  (`finishing-a-development-branch` e similares: apresentar as opções e PARAR; não executar merge/push/descartar.)
- Alterar a IGV (`6c127559-874a-4748-8fce-55d4079613a5`), a Juntas, agentes, canais, jornadas, secrets, Stripe ou Meta
  fora do escopo autorizado; enviar mensagens; ativar agentes ou canais; restaurar jornadas canceladas.
- Tocar nas Edge Functions blindadas sem autorização (`visitor-capture`, `dispatch-person-event`, `channel-dispatcher`,
  `webhook-receiver`, `agent-acolhimento` e as demais da lista de proteção).
- Digitar ou pedir senhas/tokens; expor credenciais em chat, código ou logs.
- Apagar dados reais; exclusões só com backup validado, plano aprovado e autorização expressa.

## Como as skills se encaixam no fluxo da Ekthos
- Correção de bug: `systematic-debugging` (causa raiz com evidência) → `test-driven-development` (teste que falha primeiro,
  com controle negativo) → correção mínima → `verification-before-completion` (evidência, inclusive homologação real).
- Mudança com vários passos: `writing-plans` → aprovação do proprietário → `executing-plans` com checkpoints.
- Antes de pedir merge: `requesting-code-review`. Trabalho em branch/worktree isolada (`using-git-worktrees`).
- Subagentes (`subagent-driven-development`, `dispatching-parallel-agents`): somente em tarefas de leitura/análise ou em
  branch isolada; nunca para executar deploy, migration ou exclusão.
- As etapas de "perguntar" do `brainstorming` não substituem as autorizações já descritas acima: autorização para
  planejar não é autorização para executar.
