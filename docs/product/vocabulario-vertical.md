# Vocabulário Canônico — Vertical Igrejas

> Este glossário define os termos corretos do domínio eclesiástico para uso em
> código, labels, mensagens, prompts ao Claude Code e comunicação com o cliente.
> Todo novo arquivo, migration, componente e texto deve seguir este vocabulário.

---

## Termos de entidade

| Termo correto | NÃO usar | Contexto |
|---|---|---|
| `membro` | lead, contato, cliente, usuário | Pessoa cadastrada na igreja |
| `visitante` | prospect, novo lead, potencial membro | Pessoa que visitou mas ainda não é membro |
| `célula` | grupo, squad, turma, small group | Pequeno grupo pastoral liderado por um líder |
| `sede` / `congregação` | filial, unidade, branch, loja | Local físico da igreja |
| `departamento` / `ministério` | área, squad, setor, time | Grupo de serviço (Louvor, Missões, Infantil...) |
| `dizimista` | pagador, cliente ativo, contribuinte | Membro que contribui financeiramente de forma regular |
| `culto` | reunião, evento principal, sessão | Serviço religioso regular |
| `EBD` | treinamento semanal, curso dominical | Escola Bíblica Dominical |
| `Escola da Fé` | onboarding, curso base, integração | Programa de formação de novos membros (≈ 3 meses) |
| `obreiro` | colaborador, staff, funcionário voluntário | Voluntário em serviço ativo na igreja |
| `retiro` | offsite, evento externo | Evento de imersão espiritual (geralmente semestral) |
| `conferência` | summit, congresso interno | Evento de grande porte da igreja (geralmente trimestral) |

---

## Termos de processo

| Termo correto | NÃO usar | Contexto |
|---|---|---|
| `consolidação` | follow-up, nurturing, acompanhamento inicial | Processo de acolhida do visitante após primeira visita |
| `consolidador` | SDR, rep, responsável de follow-up | Pessoa designada para fazer contato com o visitante |
| `discipulado` | jornada, funil, pipeline de crescimento | Caminho de formação espiritual do membro |
| `batismo` | conversão formal, ativação de membro | Rito de entrada oficial na membresia |
| `multiplicação` | expansão, scale de células | Quando uma célula se divide para formar uma nova |
| `intercessão` | oração, prayer | Prática de oração específica da denominação |

---

## Termos de roles

| Termo correto | NÃO usar | Contexto |
|---|---|---|
| `pastor` | CEO, gestor, admin principal | Líder espiritual principal da igreja |
| `pastor de células` | coordenador, gerente de grupos | Pastor que supervisiona toda a rede de células |
| `supervisor` | gerente, regional, coordenador de área | Líder que cuida de 5-8 células |
| `líder de célula` | team lead, facilitador | Responsável por conduzir uma célula |
| `líder em treinamento` | trainee, aspirante | Auxiliar do líder, em formação para assumir célula |
| `secretária` | assistente administrativa, ops | Responsável pelo cadastro e dados dos membros |
| `tesoureiro` | financeiro, CFO, controller | Responsável pelo controle financeiro da igreja |

---

## Regras de tom

- Agentes IA devem usar linguagem **acolhedora e fraternal**, nunca corporativa
- Chamar membros de "irmão/irmã" apenas se o próprio membro usar esse tratamento primeiro
- Métricas devem ser expressas em linguagem pastoral: "a igreja cresceu 12%" — não "o KPI subiu 12%"
- Dados financeiros (dizimista, valores) são **confidenciais**: nunca expor em contextos visíveis para líderes de célula ou supervisores
- Observações pastorais são **estritamente confidenciais**: apenas o pastor (admin) acessa

---

## Regras de nomenclatura em código

| Contexto | Convenção |
|---|---|
| Tabelas SQL | plural snake_case: `membros`, `celulas`, `sedes`, `departamentos` |
| Colunas de status | snake_case descritivo: `is_dizimista`, `is_batizado`, `is_ativo` |
| Pipeline stages | string em português: `"Visitante"`, `"Frequentando célula"`, `"Membro ativo"` |
| Roles de usuário | snake_case: `pastor_geral`, `pastor_celulas`, `supervisor`, `lider_celula` |
| Labels de UI | português, tom informal: "Membros ativos", "Células em risco" |
| Slugs de agente | kebab-case: `agent-suporte`, `agent-funil`, `agent-metricas` |
