# Command: /audit-schema

Audita o schema do banco e a sincronização com database.types.ts.

## Uso
/audit-schema                          # Audita todas as migrations
/audit-schema <arquivo-de-migration>   # Audita migration específica

## O que executa

### Fase 1 — Auditoria de migrations
Aciona: migration-auditor + supabase-rls-guard

Para cada tabela em cada migration:
- church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE
- created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
- Trigger set_updated_at() se tiver updated_at
- Índices de performance (idx_<tabela>_church_id obrigatório)
- ALTER TABLE ENABLE ROW LEVEL SECURITY
- Policy _tenant_select (auth_church_id())
- Policy _service_all (auth.role() = 'service_role')
- Sem edição de migrations já aplicadas

### Fase 2 — Sincronização de tipos
Aciona: doc-sync

Para cada tabela:
- Entrada em Database.Tables em database.types.ts
- Todos os campos com tipos corretos (UUID→string, TIMESTAMPTZ→string, etc.)
- Campos nullable como tipo | null
- Relationships: [] presente
- Tipos compostos (joins) com interface separada

### Fase 3 — Relatório final
Por tabela: ✅ completa / ❌ itens faltando + linha + correção sugerida.
Ao final: "Schema aprovado" ou lista priorizada de pendências.
