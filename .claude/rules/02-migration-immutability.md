# Regra: Imutabilidade de Migrations

## Proibido
- Nunca editar arquivos existentes em supabase/migrations/
- Arquivos de migration são imutáveis após aplicação em qualquer ambiente

## Obrigatório para toda migration nova
- Nome com próximo prefixo sequencial: 00007_*, 00008_*, etc.
- Cabeçalho descritivo em português no início do arquivo
- Toda nova tabela contém obrigatoriamente os 7 elementos:
  1. church_id UUID NOT NULL REFERENCES churches(id) ON DELETE CASCADE
  2. created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  3. Trigger set_updated_at() se houver coluna updated_at
  4. ALTER TABLE <nome> ENABLE ROW LEVEL SECURITY
  5. CREATE POLICY "<nome>_tenant_select" FOR SELECT
       USING (church_id = auth_church_id())
  6. CREATE POLICY "<nome>_service_all" FOR ALL
       USING (auth.role() = 'service_role')
  7. CREATE INDEX IF NOT EXISTS idx_<nome>_church_id ON <nome> (church_id)

## Comentários
- Todos os comentários de migration em português
- Comentar o propósito de cada coluna não óbvia
