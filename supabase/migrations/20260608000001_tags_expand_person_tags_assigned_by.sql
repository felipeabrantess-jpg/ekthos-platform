-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: tags_expand_person_tags_assigned_by
-- PR 1/4 — Flags Configuráveis por Igreja
--
-- Expande tabela `tags` com color/sort_order/icon
-- Adiciona `assigned_by` em `person_tags`
-- Reforça RLS WITH CHECK em ambas as tabelas
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Expandir `tags` com metadados visuais
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS color       TEXT    NOT NULL DEFAULT '#6B7280',
  ADD COLUMN IF NOT EXISTS sort_order  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS icon        TEXT;

-- 2. Adicionar `assigned_by` em person_tags (nullable — pode ser system)
ALTER TABLE public.person_tags
  ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Índice composto para ordenação de tags por igreja
CREATE INDEX IF NOT EXISTS idx_tags_church_sort
  ON public.tags(church_id, sort_order);

-- 4. Índice para busca de tags de uma pessoa (left join + array_agg)
CREATE INDEX IF NOT EXISTS idx_person_tags_person_id
  ON public.person_tags(person_id);

-- 5. RLS WITH CHECK explícito em tags (antes só tinha USING)
DROP POLICY IF EXISTS tags_church ON public.tags;
CREATE POLICY tags_church ON public.tags
  FOR ALL
  USING      (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

-- 6. RLS WITH CHECK explícito em person_tags
DROP POLICY IF EXISTS person_tags_church ON public.person_tags;
CREATE POLICY person_tags_church ON public.person_tags
  FOR ALL
  USING      (church_id = auth_church_id())
  WITH CHECK (church_id = auth_church_id());

COMMENT ON COLUMN public.tags.color      IS 'Hex color da flag, ex: #6B7280';
COMMENT ON COLUMN public.tags.sort_order IS 'Ordem de exibição na UI (0 = primeiro)';
COMMENT ON COLUMN public.tags.icon       IS 'Nome de ícone lucide opcional';
COMMENT ON COLUMN public.person_tags.assigned_by IS 'UUID do usuário que atribuiu a flag (auth.users)';
