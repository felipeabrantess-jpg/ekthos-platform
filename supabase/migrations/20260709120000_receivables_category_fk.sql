-- FK receivables.category_id → financial_categories.id
-- Necessário para o useDRE usar PostgREST embedded join financial_categories(name)
-- sem este FK o join falha silenciosamente tornando o DRE vazio
ALTER TABLE receivables
  ADD CONSTRAINT receivables_category_id_fkey
  FOREIGN KEY (category_id) REFERENCES financial_categories(id) ON DELETE SET NULL;
