# Command: /review

## Descrição

Revisa código, arquivos de configuração ou queries SQL passados como argumento, verificando conformidade com todas as regras do sistema Ekthos Platform. Gera um relatório estruturado com problemas críticos, alertas e sugestões de melhoria.

---

## Como Usar

```
/review [arquivo ou trecho de código]
/review --file=supabase/functions/whatsapp-webhook/index.ts
/review --migration=supabase/migrations/00003_campaigns.sql
/review --skill=.claude/skills/marketing-core.md
```

---

## O que o Command Verifica

### Categoria 1: Segurança (Crítico)
- Presença de secrets ou tokens hardcoded
- CORS configurado com `*` em funções que não deveriam
- Falta de validação de autenticação em endpoints
- Uso de `SUPABASE_SERVICE_ROLE_KEY` em contextos inadequados
- Dados sensíveis sendo logados sem mascaramento
- Validação de assinatura de webhooks ausente

### Categoria 2: Multi-Tenancy (Crítico)
- Queries sem `church_id` no WHERE
- Tabelas sem RLS habilitado
- Aceitação de `church_id` diretamente do cliente
- Ausência de validação de tenant em webhooks
- Cache compartilhado sem discriminação por tenant

### Categoria 3: Qualidade de Código (Alerta)
- Uso de `any` no TypeScript
- Erros silenciados ou não tratados
- Falta de tipagem em funções
- Nomes de variáveis em português (código deve ser inglês)
- Comentários em inglês (comentários devem ser português)
- Ausência de tratamento de casos `null/undefined`

### Categoria 4: Estrutura (Sugestão)
- Arquivo no local errado conforme convenção
- Nome do arquivo não segue kebab-case
- Imports desordenados
- Função com mais de 50 linhas (candidata a refatoração)
- Ausência de comentários em lógica complexa

### Categoria 5: Conformidade com Regras do Sistema
- Violações de `.claude/rules/multi-tenant.md`
- Violações de `.claude/rules/security.md`
- Violações de `.claude/rules/code-standards.md`
- Violações de `.claude/rules/agent-behavior.md`

---

## Formato do Relatório

```
## Relatório de Revisão: {nome do arquivo}
Data: {data}

### Resumo Executivo
{Veredicto geral: APROVADO / APROVADO COM RESSALVAS / REPROVADO}
- Problemas Críticos: {n}
- Alertas: {n}
- Sugestões: {n}

---

### Problemas Críticos (BLOQUEIAM MERGE)

#### C1 — {Título do Problema}
**Arquivo**: {caminho}:{linha}
**Regra Violada**: {referência à regra}
**Problema**: {descrição clara do problema}
**Impacto**: {o que pode acontecer se não corrigido}
**Correção**:
```{linguagem}
// Código com o problema
...
// Código corrigido
...
```

---

### Alertas (Devem ser corrigidos antes do próximo release)

#### A1 — {Título}
...

---

### Sugestões (Melhorias recomendadas)

#### S1 — {Título}
...

---

### Conformidade com Regras do Sistema
- [x] multi-tenant.md — {status}
- [x] security.md — {status}
- [x] code-standards.md — {status}
- [ ] agent-behavior.md — {problema encontrado}
```

---

## Processo de Revisão Interno

O command executa as seguintes verificações na ordem:

1. **Parse do arquivo** — Identificar linguagem (TypeScript, SQL, Markdown)
2. **Scan de segurança** — Buscar patterns de secrets, tokens, CORS permissivo
3. **Análise de multi-tenancy** — Verificar queries e acesso a dados
4. **Análise de qualidade** — TypeScript, erros não tratados, nomenclatura
5. **Verificação estrutural** — Localização do arquivo, nomenclatura, seções
6. **Geração do relatório** — Compilar e formatar resultado

---

## Exemplos de Uso

### Exemplo 1: Revisar Edge Function
```
/review supabase/functions/process-donation/index.ts
```

**Resultado esperado**: Verificação de autenticação, church_id nas queries, tratamento de erros, CORS.

### Exemplo 2: Revisar Migration SQL
```
/review supabase/migrations/00003_add_campaigns.sql
```

**Resultado esperado**: Verificação de RLS habilitado, church_id como FK obrigatória, índices de performance, comentários.

### Exemplo 3: Revisar Arquivo de Skill
```
/review .claude/skills/marketing-core.md
```

**Resultado esperado**: Verificação de todas as seções obrigatórias, regras de escopo, ausência de dados hardcoded.
