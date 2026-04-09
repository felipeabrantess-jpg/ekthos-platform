# Skill: migration-auditor

## Quando usar
Antes de aplicar qualquer migration em staging ou produção.

## O que auditar

### Integridade
- [ ] Nome do arquivo segue padrão `YYYYMMDDHHMMSS_descricao.sql`
- [ ] É um arquivo novo — nunca edição de migration existente
- [ ] Prefixo sequencial após o último arquivo em `supabase/migrations/`

### Conteúdo obrigatório (para toda tabela nova)
1. `CREATE TABLE` com `church_id UUID NOT NULL`
2. `ALTER TABLE <nome> ENABLE ROW LEVEL SECURITY`
3. `CREATE POLICY <nome>_tenant_select FOR SELECT USING (church_id = auth_church_id())`
4. `CREATE POLICY <nome>_service_all FOR ALL USING (auth.role() = 'service_role')`
5. `CREATE INDEX IF NOT EXISTS idx_<nome>_church_id`
6. Trigger `set_updated_at()` se a tabela tiver coluna `updated_at`

### Proibições
- [ ] Não contém `DROP TABLE` sem `IF EXISTS`
- [ ] Não contém `DELETE FROM` sem cláusula `WHERE`
- [ ] Não contém `TRUNCATE`
- [ ] Não edita policies ou índices de migrations anteriores

### Sincronização de tipos
- [ ] Toda coluna nova tem interface correspondente atualizada em `src/lib/database.types.ts`
- [ ] Toda tabela nova tem entrada em `Database.Tables` com `Relationships: []`

## Output esperado
Relatório: arquivo auditado, itens OK (✅), itens faltando (❌ + linha + correção sugerida).
