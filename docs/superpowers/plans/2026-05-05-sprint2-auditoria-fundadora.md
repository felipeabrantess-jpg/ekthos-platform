# Sprint 2 — Fase 0 Auditoria Fundadora (Multi-Tenant Config Agentes)

> **Para agentes alocados:** Este plano é de AUDITORIA — sem código, sem migrations, sem commits.
> Entrega final: `docs/SPRINT-2-AUDITORIA-FUNDADORA-2026-05-05.md`

**Goal:** Mapear o estado real do sistema de configuração multi-tenant de agentes e produzir documento técnico completo com gaps, proposta de schema, proposta de cockpit e plano de ondas para o Sprint 2.

**Architecture:** 6 subagents paralelos coletam dados independentes (schema SQL, código das EFs, estado de catálogo, RPCs, cockpit, canon) e o agente coordenador consolida em documento único. Nenhum arquivo de código é criado ou modificado.

**Tech Stack:** MCP Supabase (execute_sql, list_tables, list_migrations), Read/Grep/Glob (codebase), Agent tool (dispatching)

---

## Mapa de subagents

| Agente | Escopo | Ferramentas |
|--------|--------|-------------|
| A | Schema church_agent_config + tabelas correlatas + schedule/followup | MCP Supabase |
| B | Hardcoding em agent-acolhimento/index.ts | Read file |
| C | Estado dos 3 agentes premium (EF + cron + templates + catálogo) | MCP Supabase + Read |
| D | Agentes internos/inclusos — modelos, templates, config | MCP Supabase + Read |
| E | RPCs + cockpit existente | MCP Supabase + Glob/Read |
| F | Migrations 90 dias + canon (docs/) | MCP Supabase + Read |

---

## Fase de Coleta (paralela)

- [ ] **Dispatch simultâneo dos 6 subagents**

---

## Fase de Consolidação

- [ ] **Reunir outputs de A-F**
- [ ] **Seção 1:** Estado atual (1.1-1.8)
- [ ] **Seção 2:** Gaps vs proposta Felipe (7 dimensões)
- [ ] **Seção 3:** Proposta de schema (5 tabelas)
- [ ] **Seção 4:** RPCs propostas
- [ ] **Seção 5:** Cockpit em 7 abas
- [ ] **Seção 6:** Plano em ondas A-G com estimativas
- [ ] **Seção 7:** Riscos (5 áreas)
- [ ] **Seção 8:** Decisões aguardando Felipe
- [ ] **Seção 9:** Estimativa refinada total

---

## Fase de Revisão

- [ ] **requesting-code-review no documento final**
- [ ] **Reportar decisões críticas a Felipe**
- [ ] **NÃO iniciar Onda A até validação**
