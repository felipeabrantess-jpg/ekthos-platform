# Command: /audit-project

## Descrição

Executa uma auditoria completa do projeto Ekthos Platform verificando segurança, conformidade com multi-tenancy, tabelas sem RLS, secrets expostos, comportamento de agentes e estrutura geral do projeto. Gera um relatório executivo com priorização de ações corretivas.

---

## Como Usar

```
/audit-project                          # Auditoria completa
/audit-project --scope=security         # Apenas segurança
/audit-project --scope=multi-tenant     # Apenas multi-tenancy
/audit-project --scope=rls              # Apenas verificação de RLS
/audit-project --tenant=igreja-exemplo  # Auditoria de tenant específico
/audit-project --format=json            # Saída em JSON para automação
```

---

## Escopo da Auditoria

### Módulo 1 — Segurança

```
Verificações:
1. Busca por tokens, API keys e secrets hardcoded no código
   - Patterns: AAAA, sk_live_, sk_test_, EAABwz, eyJ (JWT)
   - Arquivos: *.ts, *.js, *.json, *.env.example

2. Verificação de CORS
   - Edge Functions com Access-Control-Allow-Origin: *
   - Funções que deveriam ter CORS restrito

3. Autenticação em Edge Functions
   - Funções sem verificação auth.getUser()
   - Exceções legítimas (webhooks com validação própria)

4. Validação de webhooks
   - Funções de webhook sem validação de assinatura

5. Service Role Key
   - Usos em contextos inadequados (funções chamadas pelo cliente)

6. Dados sensíveis em logs
   - console.log com CPF, telefone, token sem mascaramento

7. Verificação do .gitignore
   - .env está ignorado
   - Arquivos de credenciais estão ignorados
```

### Módulo 2 — Multi-Tenancy

```
Verificações:
1. Queries sem church_id
   - Arquivos TypeScript: SELECT sem .eq('church_id', ...)
   - Arquivos SQL: WHERE sem church_id =

2. Tabelas sem RLS
   SELECT tablename FROM pg_tables
   WHERE schemaname = 'public'
   AND rowsecurity = false

3. Políticas RLS ausentes ou incompletas
   - Tabelas com RLS mas sem política de SELECT
   - Tabelas com RLS mas sem política de INSERT

4. Webhooks sem identificação de tenant
   - Handlers que não chamam identifyTenant()

5. Contextos de IA sem isolamento de tenant
   - Chamadas a generateResponse() sem carregar contexto primeiro
```

### Módulo 3 — Integridade do Banco

```
Verificações:
1. Tabelas sem campo church_id
   SELECT column_name FROM information_schema.columns
   WHERE table_schema = 'public'
   -- Verificar tabelas que deveriam ter church_id

2. Foreign keys faltando
   - Referências sem FK declarada

3. Tabelas sem soft delete (deleted_at)
   - Tabelas críticas sem suporte a exclusão reversível

4. Índices faltando para performance
   - Colunas church_id sem índice
   - Colunas de filtro frequente sem índice

5. Triggers de updated_at
   - Tabelas sem trigger automático de atualização
```

### Módulo 4 — Qualidade de Código

```
Verificações:
1. Uso de 'any' no TypeScript
   - Pattern: ": any" ou "as any"

2. Erros silenciados
   - try/catch sem relançamento
   - catch vazio

3. Funções sem tipos de retorno
   - async function sem Promise<Tipo>

4. Dados hardcoded que deveriam ser configuráveis
   - UUIDs no código
   - Textos de resposta fixos

5. Nomenclatura incorreta
   - Variáveis em português no código
   - Comentários em inglês
```

### Módulo 5 — Conformidade de Estrutura

```
Verificações:
1. Skills sem todas as seções obrigatórias
2. Agents sem todas as seções obrigatórias
3. Migrations sem numeração sequencial
4. Arquivos no local errado
5. context/tenants/ com dados sensíveis reais
6. README files desatualizados
```

### Módulo 6 — Auditoria de Tenant (quando --tenant especificado)

```
Verificações:
1. Contexto do tenant existe e está completo
2. Integrações configuradas e ativas
3. church_settings com todos os campos obrigatórios
4. Agentes respondendo com tom correto
5. Módulos habilitados correspondem ao contrato
6. Último backup dentro do prazo
7. Logs de auditoria sendo gerados corretamente
```

---

## Formato do Relatório

```
# Relatório de Auditoria — Ekthos Platform
Data: {data}
Escopo: {escopo auditado}
Executor: {quem executou}

---

## Resumo Executivo

| Categoria | Críticos | Altos | Médios | Baixos | Status |
|-----------|---------|-------|--------|--------|--------|
| Segurança | 0 | 1 | 2 | 3 | ALERTA |
| Multi-Tenancy | 0 | 0 | 1 | 0 | OK |
| Banco de Dados | 0 | 0 | 0 | 2 | OK |
| Qualidade | 0 | 0 | 3 | 8 | OK |
| Estrutura | 0 | 0 | 0 | 1 | OK |

**Veredicto Geral**: APROVADO COM RESSALVAS

---

## Problemas Encontrados

### CRÍTICOS (requerem ação imediata)
[Nenhum encontrado]

### ALTOS (resolver antes do próximo deploy)

#### A1 — CORS permissivo em webhook do Instagram
**Arquivo**: supabase/functions/instagram-webhook/index.ts:45
**Problema**: Access-Control-Allow-Origin: '*'
**Risco**: Qualquer origem pode fazer requisições
**Ação**: Restringir ao domínio da Meta/Instagram

### MÉDIOS (resolver no próximo sprint)
...

### BAIXOS (backlog)
...

---

## Conformidade com Regras

- [x] multi-tenant.md — Conforme
- [!] security.md — 1 alerta (CORS Instagram)
- [x] code-standards.md — Conforme
- [x] agent-behavior.md — Conforme
- [x] project-structure.md — Conforme

---

## Próximos Passos Recomendados

1. [URGENTE] Corrigir CORS na função instagram-webhook
2. [SPRINT] Adicionar índice na coluna church_id da tabela interactions
3. [BACKLOG] Refatorar função processMessage para < 50 linhas

---

## Histórico de Auditorias

| Data | Críticos | Altos | Status Geral |
|------|---------|-------|-------------|
| 2026-04-07 | 0 | 1 | APROVADO COM RESSALVAS |
```

---

## Automação da Auditoria

Para integrar no pipeline de CI/CD:

```bash
# GitHub Actions / n8n step
/audit-project --format=json > audit-report.json

# Verificar se há problemas críticos
CRITICAL_COUNT=$(cat audit-report.json | jq '.summary.critical')
if [ "$CRITICAL_COUNT" -gt 0 ]; then
  echo "Auditoria FALHOU: $CRITICAL_COUNT problema(s) crítico(s) encontrado(s)"
  exit 1
fi

echo "Auditoria passou — pode prosseguir com o deploy"
```
