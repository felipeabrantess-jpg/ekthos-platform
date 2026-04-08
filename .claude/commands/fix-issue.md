# Command: /fix-issue

## Descrição

Recebe a descrição de um problema reportado (bug, violação de segurança, falha de comportamento) e aplica a correção seguindo todas as regras do sistema. O processo começa obrigatoriamente pelo diagnóstico da causa raiz antes de qualquer correção ser aplicada.

---

## Como Usar

```
/fix-issue "Descrição clara do problema"
/fix-issue --file=caminho/do/arquivo --issue="descrição"
/fix-issue --type=security "Token exposto no frontend"
/fix-issue --type=multi-tenant "Query retornando dados de outros tenants"
/fix-issue --type=agent "Agente inventando informação sobre evento"
```

---

## Tipos de Issues Suportados

| Tipo | Exemplos |
|------|---------|
| `security` | Token exposto, CORS aberto, autenticação faltando |
| `multi-tenant` | Vazamento de dados entre tenants, church_id ausente |
| `agent` | Agente inventando info, tom incorreto, escalada faltando |
| `performance` | Query lenta, falta de índice, N+1 queries |
| `data-integrity` | Registro sem church_id, FK faltando, RLS desativado |
| `bug` | Comportamento inesperado geral |

---

## Processo Obrigatório de Diagnóstico

Antes de qualquer correção, o command executa a análise de causa raiz:

### Fase 1 — Identificação

```
1. Qual é o sintoma reportado?
2. Em qual arquivo/função o problema foi encontrado?
3. Qual regra do sistema está sendo violada?
4. Qual é a categoria de severidade?
   - CRÍTICO: Segurança ou vazamento de dados
   - ALTO: Comportamento incorreto em produção
   - MÉDIO: Qualidade degradada, não bloqueia funcionalidade
   - BAIXO: Melhoria estética ou de convenção
```

### Fase 2 — Análise de Impacto

```
1. Quantos tenants são afetados?
2. Existe risco de perda de dados?
3. Existe risco de exposição de dados de membros?
4. A correção pode afetar outros módulos?
5. É necessário rollback de migration?
```

### Fase 3 — Planejamento da Correção

```
1. Qual a menor mudança que resolve o problema?
2. Existem efeitos colaterais da correção?
3. Quais testes devem ser executados após?
4. É necessário notificar tenants afetados?
```

---

## Formato do Relatório de Diagnóstico

```
## Diagnóstico: {título do issue}

### Causa Raiz Identificada
{Descrição técnica clara da causa raiz}

### Impacto
- **Tenants afetados**: {todos / específicos / nenhum em produção}
- **Severidade**: {CRÍTICO / ALTO / MÉDIO / BAIXO}
- **Risco de dados**: {Sim — [descrever] / Não}
- **Módulos afetados**: {lista}

### Regra Violada
{Referência à regra de .claude/rules/}

---

## Plano de Correção

### Passo 1: {Descrição}
**Arquivo**: {caminho}
**Mudança**:
```{linguagem}
// ANTES (com problema)
...

// DEPOIS (corrigido)
...
```

### Passo 2: {Descrição se houver mais passos}
...

---

## Verificação Pós-Correção

- [ ] {Teste 1 que deve passar}
- [ ] {Teste 2}
- [ ] Revisar com /review após a correção
- [ ] Confirmar que nenhum tenant foi afetado

---

## Prevenção Futura

{Sugestão de como evitar este problema no futuro — pode incluir adição de regra, teste automatizado ou checklist}
```

---

## Exemplos de Uso

### Exemplo 1: Bug de Multi-Tenancy

```
/fix-issue --type=multi-tenant "A função fetchPeople está retornando pessoas de todas as igrejas sem filtrar por church_id"
```

**Diagnóstico esperado**:
- Causa: Query sem cláusula WHERE church_id
- Impacto: CRÍTICO — vazamento de dados entre tenants
- Regra violada: `.claude/rules/multi-tenant.md` — Regra 1

**Correção esperada**:
```typescript
// ANTES
const { data } = await supabase.from('people').select('*');

// DEPOIS
const { data } = await supabase
  .from('people')
  .select('*')
  .eq('church_id', churchId) // Adicionado
  .is('deleted_at', null);   // Adicionado — excluir soft deletes
```

---

### Exemplo 2: Segurança — Token Exposto

```
/fix-issue --type=security "O token do WhatsApp está sendo enviado no response da API para o frontend"
```

**Diagnóstico esperado**:
- Causa: Select incluindo campo `token` na query de integrações
- Impacto: CRÍTICO — token de integração exposto para o cliente
- Correção: Remover campo token do select, criar endpoint separado para administração via service role

---

### Exemplo 3: Comportamento de Agente

```
/fix-issue --type=agent "O agente do WhatsApp está respondendo em inglês para a Igreja da Graça"
```

**Diagnóstico esperado**:
- Causa: Contexto do tenant não está sendo carregado antes do processamento
- Impacto: MÉDIO — experiência degradada para o tenant
- Correção: Verificar se `loadTenantContext()` é chamado antes de `generateResponse()`
