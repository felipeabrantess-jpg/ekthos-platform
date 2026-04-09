# Skill: doc-sync

## Quando usar
Após qualquer migration nova ou mudança de schema. Garante que
src/lib/database.types.ts reflita o estado real do banco.

## O que verificar

### Para cada tabela nova na migration
- [ ] Existe entrada em Database.Tables em database.types.ts
- [ ] Todos os campos da tabela estão na interface (Row, Insert, Update)
- [ ] Tipos PostgreSQL mapeados corretamente:
    UUID        → string
    TEXT        → string
    BOOLEAN     → boolean
    INTEGER     → number
    NUMERIC     → number
    TIMESTAMPTZ → string
    DATE        → string
    TIME        → string
    JSONB       → Json (tipo importado) ou Record<string, unknown>
    TEXT[]      → string[]
- [ ] Campos nullable (sem NOT NULL) estão como tipo | null
- [ ] Campo com DEFAULT mas sem NOT NULL: tipo | null na interface
- [ ] Relationships: [] presente — nunca omitir

### Para cada coluna nova em tabela existente
- [ ] Interface Row atualizada com o campo e tipo correto
- [ ] Interface Insert atualizada (campo opcional se tiver DEFAULT)
- [ ] Interface Update atualizada (campo sempre opcional)

### Tipos compostos (joins)
- [ ] Joins usados em hooks têm interface separada estendendo a base
  Padrão real: PersonWithStage extends Person + { person_pipeline: [...] }
- [ ] Tipos compostos ficam em database.types.ts — não inline nos hooks

## Output esperado
Relatório: tabelas/colunas verificadas, divergências encontradas
(❌ campo faltando + tipo esperado + snippet de correção).
Ao final: "Types sincronizados" ou lista de itens pendentes.
