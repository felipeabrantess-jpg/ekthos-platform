# Regra: Dois Policies de RLS por Tabela

## Toda nova tabela recebe exatamente dois policies — nunca apenas um

Policy 1 — acesso por tenant (frontend):
  CREATE POLICY "<tabela>_tenant_select" ON <tabela>
    FOR SELECT USING (church_id = auth_church_id());

Policy 2 — acesso total para service_role (Edge Functions):
  CREATE POLICY "<tabela>_service_all" ON <tabela>
    FOR ALL USING (auth.role() = 'service_role');

## Por que o segundo policy é obrigatório
Edge Functions usam service_role key para bypass intencional de RLS.
Sem o policy _service_all, a função whatsapp-webhook não consegue
inserir em tabelas novas — o erro é silencioso e difícil de diagnosticar.

## Ordem obrigatória na migration
1. CREATE TABLE
2. ALTER TABLE <nome> ENABLE ROW LEVEL SECURITY
3. CREATE POLICY <nome>_tenant_select
4. CREATE POLICY <nome>_service_all
5. CREATE INDEX idx_<nome>_church_id

Nunca alterar a ordem. Nunca omitir o passo 2 antes dos policies.
