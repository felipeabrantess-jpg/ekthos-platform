# Command: /fix-issue

Diagnostica e corrige um problema seguindo as rules do Ekthos.

## Uso
/fix-issue "<descrição do problema>"
/fix-issue "<descrição>" --file=<caminho>

## Processo obrigatório

### Fase 1 — Diagnóstico (antes de qualquer edição)
1. Qual o sintoma exato?
2. Em qual arquivo/linha?
3. Qual rule está sendo violada? (01–07)
4. Severidade:
   - CRÍTICO: vazamento de dados entre tenants / segurança
   - ALTO: comportamento incorreto em produção
   - MÉDIO: qualidade degradada, não bloqueia feature
   - BAIXO: convenção ou padronização

### Fase 2 — Impacto
- Outros arquivos afetados pela correção?
- Quebra alguma queryKey de cache?
- Requer migration nova?

### Fase 3 — Correção mínima
Aplicar a menor mudança que resolve o problema.
Sempre mostrar: ANTES / DEPOIS com número de linha.

## Categorias de issue

| Sintoma | Rule violada | Skill para verificar |
|---|---|---|
| Query sem church_id | 01 | supabase-rls-guard |
| .delete() em tabela com soft delete | 03 | supabase-rls-guard |
| Página sem Spinner/ErrorState/EmptyState | 04 | frontend-qa |
| Insert sem cast as any | 05 | — |
| Tabela nova sem dois policies RLS | 06 | supabase-rls-guard |
| Edge Function sem HMAC ou sem 200 imediato | 07 | — |
| Migration editada após aplicação | 02 | migration-auditor |

## Output
Diagnóstico → impacto → correção (ANTES/DEPOIS) → verificação pós-fix.
