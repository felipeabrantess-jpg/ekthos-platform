# Command: /review

Revisa um arquivo contra as rules e skills operacionais do Ekthos.

## Uso
/review <caminho-do-arquivo>

## O que executa

### Para arquivos em src/pages/ ou src/features/
Aciona: frontend-qa
- Imports permitidos (useAuth + hook + UI + useState)
- Guard de churchId
- Spinner / ErrorState / EmptyState presentes
- confirm() antes de ações destrutivas
- Modal com reset de estado no onClose
- Sub-componentes tipados sem acesso a Supabase

### Para arquivos em src/features/*/hooks/
Aciona: supabase-rls-guard (checklist de query)
- enabled: Boolean(churchId)
- .eq('church_id', churchId) em toda query
- duplo filtro em updates/deletes
- .is('deleted_at', null) nas tabelas com soft delete
- onSuccess invalida todas as queryKeys afetadas
- cast as any com eslint-disable em inserts/updates

### Para hooks de CRM (pipeline, interactions, people, stages)
Acionar adicionalmente: crm-flow-validator
Aplica-se quando o arquivo contém referência a:
  usePipeline · useInteractions · usePeople · person_pipeline
  pipeline_stages · interactions · stage · channel · direction
Checklist extra:
- Transições de stage com duplo filtro (person_id + church_id)
- Stage resolvido via person_pipeline[0].pipeline_stages
- Inserção em interactions com church_id + person_id + channel + direction
- direction: 'inbound' | 'outbound' — nunca valor fora do enum
- onSuccess invalida ['people', churchId] e ['dashboard-stats', churchId]

### Para arquivos em supabase/migrations/
Aciona: migration-auditor + supabase-rls-guard
- 6 elementos obrigatórios por tabela
- Ordem: TABLE → trigger → index → ENABLE RLS → policies
- Dois policies por tabela (_tenant_select + _service_all)
- Sem DROP TABLE sem IF EXISTS, sem DELETE FROM sem WHERE

### Para arquivos em supabase/functions/
Aciona: (checklist manual, regras 01 e 07)
- HMAC validado antes de processar payload
- Resposta 200 imediata em webhooks
- churchId resolvido antes de qualquer operação de banco
- AbortSignal.timeout(30_000) em todo fetch interno
- Variáveis via Deno.env.get() — nunca process.env
- service_role key nunca exposta em logs

## Output
Relatório com ✅ aprovado / ❌ problema + linha + correção.
Veredicto final: APROVADO ou N itens a corrigir.
