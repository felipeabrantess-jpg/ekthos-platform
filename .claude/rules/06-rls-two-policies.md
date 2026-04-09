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
Padrão confirmado em 00006_modules_expansion.sql (12 tabelas):

1. CREATE TABLE
2. CREATE TRIGGER set_updated_at (somente se a tabela tiver coluna updated_at)
3. CREATE INDEX idx_<nome>_church_id (e demais índices de performance)
4. ALTER TABLE <nome> ENABLE ROW LEVEL SECURITY
5. CREATE POLICY "<nome>_tenant_select"
6. CREATE POLICY "<nome>_service_all"

Regra crítica: o passo 4 (ENABLE ROW LEVEL SECURITY) deve sempre
preceder os passos 5 e 6. Essa é a única restrição funcional do Postgres.
A posição dos índices (passo 3) antes do RLS é intencional e consistente
com o padrão real do projeto.

Nunca omitir o passo 4 antes dos policies.
