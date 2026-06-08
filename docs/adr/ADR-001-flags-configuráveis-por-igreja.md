# ADR-001: Flags Configuráveis por Igreja — Reutilizar `tags` + nova `person_tags`

**Status:** Accepted  
**Data:** 2026-06-08  
**Deciders:** Felipe Abrantes (produto), Code (implementação)  
**PR:** feat/flags-pessoas-pr1 (PR 1/4)

---

## Contexto

Cada igreja tem cultura e vocabulário próprios para classificar pessoas (visitante, membro, batizado, líder…). Uma solução de flags hardcoded no código ignoraria essa diversidade e exigiria deploy a cada ajuste. O pastor precisa criar, renomear e colorir flags sem depender de engenharia.

Tabelas existentes antes deste ADR:

| Tabela | Colunas originais |
|---|---|
| `tags` | `id, church_id, name, created_at` |
| `person_tags` | `id, person_id, tag_id, church_id, created_at` + UNIQUE(person_id, tag_id) + FKs CASCADE |

RLS já habilitada em ambas (`auth_church_id()` USING, sem WITH CHECK).

---

## Decisão

**Reutilizar `tags` + expandir + usar `person_tags` como junction UI.**

### O que foi adicionado

```sql
-- tags: metadados visuais
ALTER TABLE tags ADD COLUMN color      TEXT    NOT NULL DEFAULT '#6B7280';
ALTER TABLE tags ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE tags ADD COLUMN icon       TEXT;

-- person_tags: rastreabilidade de quem atribuiu
ALTER TABLE person_tags ADD COLUMN assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Indexes de performance
CREATE INDEX idx_tags_church_sort     ON tags(church_id, sort_order);
CREATE INDEX idx_person_tags_person_id ON person_tags(person_id);

-- RLS WITH CHECK explícito (antes só tinha USING)
DROP POLICY tags_church ON tags;
CREATE POLICY tags_church ON tags FOR ALL
  USING (church_id = auth_church_id()) WITH CHECK (church_id = auth_church_id());

-- idem person_tags
```

### Convenção crítica

| Campo | Uso | Quem popula |
|---|---|---|
| `people.tags[]` | Tags internas (importação CSV, agentes IA) | Sistema / migrations |
| `person_tags` | Flags visíveis e gerenciáveis pelo pastor | UI / hooks useTags |

**Nunca misturar:** agentes leem `people.tags[]`; a UI lê `person_tags JOIN tags`.

### Sem defaults / sem templates

Cada igreja começa com **zero flags** e cria as suas. Sem seed automático. Sem templates sugeridos na UI. Decisão de produto: Felipe, 2026-06-08.

---

## Opções consideradas e rejeitadas

### Opção A (rejeitada): JSON em `church_settings`

```json
{ "person_flags": [{"name": "Batizado", "color": "#60A5FA"}] }
```

**Rejeitada porque:**
- Sem FK → sem integridade referencial em `person_tags`
- Sem rastreabilidade de quem atribuiu cada flag
- Queries de "listar pessoas por flag" seriam `jsonb @>` sem índice eficiente

### Opção B (rejeitada): Novas tabelas `church_flags` + `person_flags`

**Rejeitada porque:**
- `tags` + `person_tags` já existiam com a estrutura correta (FKs, UNIQUE, RLS)
- Duplicação de esquema sem ganho; violaria R-CANON-FIRST

### Opção C (escolhida): Expandir `tags` existente ✅

**Escolhida porque:**
- Reutiliza infra existente (FKs CASCADE, UNIQUE constraint, RLS base)
- Adiciona apenas o que falta (color, sort_order, icon, assigned_by)
- Multi-tenant por design: `church_id` em ambas as tabelas + RLS WITH CHECK
- Zero breaking change: `tags` antes era usada apenas internamente (vazia em prod)

---

## Consequências

### Fica mais fácil
- CRUD de flags via Supabase client direto (sem Edge Function)
- Filtrar pessoas por flag: `SELECT people JOIN person_tags WHERE tag_id = ?`
- Badge colorido dinâmico: cor vem do banco, sem hardcode no frontend
- PRs 2/3/4 (filtro na lista, filtro no pipeline, export CSV) consomem `useTags` sem nova infra

### Fica mais complexo
- Dois conceitos de "tag" coexistem: `people.tags[]` (agentes) ≠ `person_tags` (UI) — requer disciplina
- Sort manual (sort_order) não tem drag-and-drop no PR 1; usuário reordena editando o campo

### O que revisitaremos
- Drag-and-drop para reordenar flags (PR futuro)
- Ícone lucide renderizado no badge (icon: TEXT → PR 2+)
- Filtro multi-flag na lista de pessoas (PR 2)
- Export CSV com flags (PR 3)
- Filtro no pipeline de discipulado por flag (PR 4)

---

## Índices e performance

Com 300 pessoas e ~20 flags por igreja, os índices são suficientes para qualquer join. Revisitar particionamento apenas se escala atingir 50k+ pessoas por church_id.

---

## Action items

- [x] Migration: `tags_expand_person_tags_assigned_by` aplicada em prod
- [x] RLS WITH CHECK em ambas as tabelas
- [x] **Sem seed automático** — cada igreja cria do zero
- [x] `useTags.ts` — hooks completos (CRUD + person_tags)
- [x] `TagBadge.tsx` — badge dinâmico com cor do banco
- [x] `PersonTagsSection.tsx` — seção no PersonDetailPanel
- [x] `FlagsManager.tsx` — página CRUD `/pessoas/flags`
- [x] `navigation.ts` + `App.tsx` — rota com RoleRoute 'pessoas'
- [ ] PR 2: filtro por flag na lista de pessoas
- [ ] PR 3: export CSV com flags
- [ ] PR 4: filtro no pipeline / discipulado por flag
