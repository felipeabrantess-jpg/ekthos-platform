# Campos de Membros — Vertical Igrejas

> Define os 17 campos customizados do perfil de membro para igrejas evangélicas,
> organizados por grupo, com tipo, obrigatoriedade, visibilidade e lógica condicional.
> Referência para: `People.tsx`, formulário de cadastro, tabela `members` / `profiles`.

---

## Visão geral por grupo

| Grupo | Campos | Visibilidade |
|-------|--------|-------------|
| Eclesiástico | 9 campos | Liderança (exceto dizimista) |
| Financeiro | 1 campo | Apenas admin + tesoureiro |
| Pessoal | 4 campos | Liderança |
| Formação | 2 campos | Liderança |
| Acompanhamento | 1 campo | Apenas pastor_geral |

---

## Grupo: Eclesiástico

| # | Campo | Label UI | Tipo | Obrigatório | Regra / Lógica condicional |
|---|-------|----------|------|-------------|---------------------------|
| 1 | `sede_id` | Sede/Congregação | `select` (FK) | **Sim** | Opções vindas da tabela `sedes` do tenant |
| 2 | `celula_id` | Célula | `select_dynamic` | Não | Lista de células ativas da sede selecionada |
| 3 | `lider_celula` | Líder da Célula | `auto` | Não | Preenchido automaticamente ao selecionar a célula |
| 4 | `supervisor` | Supervisor de Área | `auto` | Não | Preenchido automaticamente pela célula |
| 5 | `departamentos` | Departamento(s) | `multi_select` | Não | Lista de departamentos ativos do tenant |
| 6 | `data_conversao` | Data de Conversão | `date` | Não | — |
| 7 | `is_batizado` | Batizado | `select` | Não | Opções: `Sim` / `Não` / `Agendado` |
| 8 | `data_batismo` | Data do Batismo | `date` | Não | **Mostrar apenas se** `is_batizado = 'Sim'` |
| 9 | `dons_talentos` | Dons e Talentos | `tags` | Não | Sugestões: Música (voz), Música (instrumento), Ensino, Liderança, Hospitalidade, Intercessão, Mídia/Design, Som/Iluminação, Administração |

---

## Grupo: Financeiro

| # | Campo | Label UI | Tipo | Visibilidade | Regra |
|---|-------|----------|------|-------------|-------|
| 10 | `is_dizimista` | Dizimista Ativo | `select` | **Apenas** `pastor_geral` + `tesoureiro` | Opções: `Sim` / `Não` — **NUNCA** expor em relatórios visíveis para líderes ou supervisores |

---

## Grupo: Pessoal

| # | Campo | Label UI | Tipo | Obrigatório |
|---|-------|----------|------|-------------|
| 11 | `estado_civil` | Estado Civil | `select` | Não |
| 12 | `data_nascimento` | Data de Nascimento | `date` | Não |
| 13 | `endereco_bairro` | Endereço/Bairro | `text` | Não |
| 14 | `como_conheceu` | Como conheceu a igreja | `select` | Não |

**Opções de `estado_civil`:** Solteiro(a) / Casado(a) / Divorciado(a) / Viúvo(a)

**Opções de `como_conheceu`:** Convite de membro / Redes sociais / Passou na frente / Evento / Família / Outro

---

## Grupo: Formação

| # | Campo | Label UI | Tipo | Obrigatório |
|---|-------|----------|------|-------------|
| 15 | `curso_teologico` | Tem curso teológico | `select` | Não |
| 16 | `experiencia_lideranca` | Já foi líder antes | `select` | Não |

**Opções de `curso_teologico`:** Sim / Não / Cursando

**Opções de `experiencia_lideranca`:** Sim, nesta igreja / Sim, em outra igreja / Não

---

## Grupo: Acompanhamento (confidencial)

| # | Campo | Label UI | Tipo | Visibilidade | Regra |
|---|-------|----------|------|-------------|-------|
| 17 | `observacoes_pastorais` | Observações Pastorais | `textarea` | **Apenas** `pastor_geral` | Campo bloqueado via RLS — não deve aparecer na query para outros roles |

---

## Campos de status do membro

> Além dos 17 campos customizados, o perfil de membro tem campos de sistema:

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `status_pipeline` | FK `pipeline_stages` | Stage atual no caminho de discipulado |
| `is_ativo` | `boolean` | Membro ativo ou inativo |
| `data_entrada` | `date` | Data da primeira visita |
| `ultimo_registro` | `timestamp` | Última presença registrada |
| `church_id` | FK `churches` | Tenant (sempre filtrado) |
| `sede_origem_id` | FK `sedes` | Sede onde foi registrado pela primeira vez |

---

## Lógica condicional — resumo

| Condição | Campo que aparece |
|----------|------------------|
| `is_batizado = 'Sim'` | `data_batismo` (exibir) |
| `celula_id` selecionada | `lider_celula` (auto-fill) |
| `celula_id` selecionada | `supervisor` (auto-fill via join) |
| Role = `pastor_geral` ou `tesoureiro` | `is_dizimista` (exibir) |
| Role = `pastor_geral` | `observacoes_pastorais` (exibir) |

---

## Notas de implementação

- `dons_talentos` deve ser armazenado como `text[]` ou tabela de tags — usado no direcionamento para departamentos
- `is_dizimista` não deve estar em SELECT queries padrão — usar view ou policy de coluna para garantir o RLS
- O campo `observacoes_pastorais` é candidato a tabela separada (`member_notes`) para isolamento total via RLS
- Campos `auto` (`lider_celula`, `supervisor`) são derivados — calculados por JOIN, não armazenados como string duplicada
- `endereco_bairro` é usado pelo agente de cadastro para sugerir a célula mais próxima (feature futura)
