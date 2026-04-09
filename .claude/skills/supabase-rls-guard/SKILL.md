# Skill: supabase-rls-guard

## Quando usar
Ao criar ou revisar qualquer tabela nova ou query existente.

## O que verificar

### Nova tabela
- [ ] Tem `church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE`
- [ ] Tem `ALTER TABLE <nome> ENABLE ROW LEVEL SECURITY`
- [ ] Tem policy `_tenant_select`: `FOR SELECT USING (church_id = auth_church_id())`
- [ ] Tem policy `_service_all`: `FOR ALL USING (auth.role() = 'service_role')`
- [ ] Tem `CREATE INDEX IF NOT EXISTS idx_<nome>_church_id`
- [ ] Está em arquivo de migration novo (não editou migration existente)

### Query existente (useQuery / useMutation)
- [ ] Tem `.eq('church_id', churchId)` como primeira cláusula após `.from()`
- [ ] Tem `enabled: Boolean(churchId)` no useQuery
- [ ] `churchId` vem de `useAuth()` — nunca hardcoded
- [ ] Updates e deletes têm duplo filtro: `.eq('id', id).eq('church_id', churchId)`
- [ ] Leituras em tabelas com soft delete têm `.is('deleted_at', null)`

## Output esperado
Lista de itens marcados (✅) ou com problema (❌ + explicação + código corrigido).
