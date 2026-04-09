// Hook principal do Dashboard Pastoral — 15 widgets
// Executa todas as queries em paralelo para máxima performance

import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PastoralStats {
  // W1: Visitantes esta semana
  visitantesSemana: number
  // W2: Taxa de consolidação (0-100)
  taxaConsolidacao: number
  taxaConsolidacaoAlert: boolean // true se < 50%
  // W3: Membros ativos (stage >= frequentador)
  membrosAtivos: number
  // W4: Células ativas
  celulasAtivas: number
  totalCelulas: number
  // W5: Caminho de discipulado por etapa do pipeline
  caminhoDiscipulado: Array<{ name: string; count: number; order_index: number }>
  // W6: Top células por número de membros
  topCelulas: Array<{ name: string; membros: number }>
  // W7: Crescimento de células — últimos 4 trimestres
  crescimentoCelulas: Array<{ periodo: string; celulas: number }>
  // W8: Voluntários por departamento (admin + admin_departments only)
  voluntariosPorDept: Array<{ name: string; total: number }>
  // W9: Batismos no trimestre atual
  batismosTrimestre: number
  // W10: Dízimos e ofertas do mês (role-gated)
  dizimosOfertasMes: number
  // W11: Membros ausentes > 14 dias
  membrosAusentes: Array<{
    id: string
    nome: string
    person_stage: string
    last_contact_at: string | null
  }>
  // W12: Células com poucos membros (alerta operacional)
  celulasEmAlerta: Array<{ id: string; name: string; membros: number }>
  // W13: Visitantes sem consolidação — ALERTA CRÍTICO
  visitantesSemConsolidacao: Array<{ id: string; nome: string; created_at: string }>
  // W14: Evolução de membros — últimos 12 meses
  evolucaoMembros: Array<{ mes: string; total: number }>
  // W15: Alunos na Escola da Fé
  alunosEscolaDaFe: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLast4Quarters(now: Date): string[] {
  const quarters: string[] = []
  let year = now.getFullYear()
  let q = Math.floor(now.getMonth() / 3) + 1
  for (let i = 0; i < 4; i++) {
    quarters.unshift(`Q${q}/${year}`)
    q--
    if (q === 0) { q = 4; year-- }
  }
  return quarters
}

function getQuarterKey(date: Date): string {
  const q = Math.floor(date.getMonth() / 3) + 1
  return `Q${q}/${date.getFullYear()}`
}

function displayName(p: { name?: string | null; first_name?: string | null; last_name?: string | null }): string {
  if (p.name && p.name.trim()) return p.name.trim()
  const full = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()
  return full || 'Sem nome'
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>

export function usePastoralDashboard(churchId: string) {
  return useQuery({
    queryKey: ['pastoral-dashboard', churchId],
    queryFn: async (): Promise<PastoralStats> => {
      const now = new Date()

      // Datas de referência
      const sevenDaysAgo    = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
      const oneDayAgo       = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const quarterMonth    = Math.floor(now.getMonth() / 3) * 3
      const quarterStart    = new Date(now.getFullYear(), quarterMonth, 1)
      const firstOfMonth    = new Date(now.getFullYear(), now.getMonth(), 1)
      const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      const oneYearAgo      = new Date(now.getFullYear() - 1, now.getMonth(), 1)

      // ── Queries em paralelo ──────────────────────────────────────────────────
      const [
        allPeopleStagesRes,     // person_stage de todos (W1, W2, W3)
        visitantesSemanaPesRes, // first_visit_date para W1
        celulasRes,             // grupos (W4, W7, W12)
        pipelineRes,            // person_pipeline com stages (W5, W15)
        membCelulaRes,          // people com celula_id (W6, W12)
        voluntariosRes,         // volunteers com ministries (W8)
        batismosRes,            // pessoas batizadas no trimestre (W9)
        dizimosRes,             // donations do mês (W10)
        ausentesRes,            // membros sem contato > 14 dias (W11)
        semConsolidacaoRes,     // visitantes sem consolidação (W13)
        evolucaoRes,            // pessoas criadas nos últimos 12 meses (W14)
        gruposNomesRes,         // nomes de todos os grupos (W6, W12)
      ] = await Promise.all([

        // W1 + W2 + W3: person_stage de todos
        supabase
          .from('people')
          .select('person_stage')
          .eq('church_id', churchId)
          .is('deleted_at', null),

        // W1: visitantes com first_visit_date na última semana
        supabase
          .from('people')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .eq('person_stage', 'visitante')
          .gte('first_visit_date', sevenDaysAgo.toISOString().slice(0, 10)),

        // W4 + W7 + W12: todos os grupos
        supabase
          .from('groups')
          .select('id, status, created_at')
          .eq('church_id', churchId),

        // W5 + W15: pipeline com stage info
        supabase
          .from('person_pipeline')
          .select('stage_id, pipeline_stages(name, slug, order_index)')
          .eq('church_id', churchId),

        // W6 + W12: pessoas com celula_id
        supabase
          .from('people')
          .select('celula_id')
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .not('celula_id', 'is', null),

        // W8: voluntários ativos por ministério
        (supabase as unknown as { from: (t: string) => AnyRecord })
          .from('volunteers')
          .select('ministry_id, ministries(name)')
          .eq('church_id', churchId)
          .eq('is_active', true),

        // W9: batismos no trimestre
        supabase
          .from('people')
          .select('id', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .eq('baptized', true)
          .gte('baptism_date', quarterStart.toISOString().slice(0, 10)),

        // W10: doações do mês
        supabase
          .from('donations')
          .select('amount')
          .eq('church_id', churchId)
          .eq('status', 'confirmed')
          .gte('confirmed_at', firstOfMonth.toISOString()),

        // W11: membros ausentes > 14 dias
        supabase
          .from('people')
          .select('id, name, first_name, last_name, person_stage, last_contact_at')
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .in('person_stage', ['frequentador', 'consolidado', 'discipulo', 'lider'])
          .or(`last_contact_at.lt.${fourteenDaysAgo.toISOString()},last_contact_at.is.null`)
          .order('last_contact_at', { ascending: true, nullsFirst: true })
          .limit(10),

        // W13: visitantes sem consolidação (> 24h)
        supabase
          .from('people')
          .select('id, name, first_name, last_name, created_at')
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .eq('person_stage', 'visitante')
          .lt('created_at', oneDayAgo.toISOString())
          .order('created_at', { ascending: true })
          .limit(20),

        // W14: pessoas ativas criadas nos últimos 12 meses
        supabase
          .from('people')
          .select('created_at')
          .eq('church_id', churchId)
          .is('deleted_at', null)
          .not('person_stage', 'eq', 'visitante')
          .gte('created_at', twelveMonthsAgo.toISOString()),

        // W6 + W12: nomes dos grupos
        supabase
          .from('groups')
          .select('id, name')
          .eq('church_id', churchId),

        // W7: grupos criados no último ano
        supabase
          .from('groups')
          .select('id, created_at')
          .eq('church_id', churchId)
          .gte('created_at', oneYearAgo.toISOString()),
      ])

      // ── Processamento ────────────────────────────────────────────────────────

      // W1, W2, W3: contar por person_stage
      const stageCounts: Record<string, number> = {}
      for (const p of (allPeopleStagesRes.data ?? []) as AnyRecord[]) {
        const s = p.person_stage as string | null
        if (s) stageCounts[s] = (stageCounts[s] ?? 0) + 1
      }
      const ativos   = (stageCounts['frequentador'] ?? 0) + (stageCounts['consolidado'] ?? 0)
                     + (stageCounts['discipulo'] ?? 0) + (stageCounts['lider'] ?? 0)
      const contato  = stageCounts['contato'] ?? 0
      const visitante = stageCounts['visitante'] ?? 0
      const totalBase = ativos + contato + visitante
      const taxaConsolidacao   = totalBase > 0 ? Math.round((ativos / totalBase) * 100) : 0

      // W1
      const visitantesSemana = visitantesSemanaPesRes.count ?? 0

      // W4: células ativas
      const allGrupos = celulasRes.data ?? []
      const celulasAtivas = allGrupos.filter((g: AnyRecord) => g.status === 'active').length
      const totalCelulas  = allGrupos.length

      // W5 + W15: pipeline
      const stageAgg: Record<string, { name: string; count: number; order_index: number; slug: string }> = {}
      for (const row of (pipelineRes.data ?? []) as AnyRecord[]) {
        const stage = row.pipeline_stages as { name: string; slug: string; order_index: number } | null
        if (!stage || !row.stage_id) continue
        if (!stageAgg[row.stage_id]) {
          stageAgg[row.stage_id] = { name: stage.name, slug: stage.slug, count: 0, order_index: stage.order_index }
        }
        stageAgg[row.stage_id].count++
      }
      const caminhoDiscipulado = Object.values(stageAgg)
        .sort((a, b) => a.order_index - b.order_index)
      const alunosEscolaDaFe = Object.values(stageAgg)
        .find(s => s.slug === 'escola-da-fe')?.count ?? 0

      // W6: top células por membros (usando celula_id)
      const membrosPorCelula: Record<string, number> = {}
      for (const p of (membCelulaRes.data ?? []) as AnyRecord[]) {
        if (p.celula_id) membrosPorCelula[p.celula_id] = (membrosPorCelula[p.celula_id] ?? 0) + 1
      }
      const grupoNomes: Record<string, string> = {}
      for (const g of (gruposNomesRes.data ?? []) as AnyRecord[]) {
        grupoNomes[g.id] = g.name
      }
      const topCelulas = Object.entries(membrosPorCelula)
        .map(([id, membros]) => ({ name: grupoNomes[id] ?? 'Célula', membros }))
        .sort((a, b) => b.membros - a.membros)
        .slice(0, 6)

      // W7: crescimento de células por trimestre
      const quarterCounts: Record<string, number> = {}
      for (const g of (allGrupos as AnyRecord[])) {
        if (g.created_at) {
          const key = getQuarterKey(new Date(g.created_at))
          quarterCounts[key] = (quarterCounts[key] ?? 0) + 1
        }
      }
      const crescimentoCelulas = getLast4Quarters(now).map(q => ({
        periodo: q,
        celulas: quarterCounts[q] ?? 0,
      }))

      // W8: voluntários por departamento
      const deptAgg: Record<string, { name: string; total: number }> = {}
      for (const v of (voluntariosRes.data ?? []) as AnyRecord[]) {
        const min = v.ministries as { name: string } | null
        if (!min?.name || !v.ministry_id) continue
        if (!deptAgg[v.ministry_id]) deptAgg[v.ministry_id] = { name: min.name, total: 0 }
        deptAgg[v.ministry_id].total++
      }
      const voluntariosPorDept = Object.values(deptAgg)
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)

      // W9
      const batismosTrimestre = batismosRes.count ?? 0

      // W10
      const dizimosOfertasMes = (dizimosRes.data ?? []).reduce(
        (sum: number, d: AnyRecord) => sum + (d.amount ?? 0),
        0
      )

      // W11
      const membrosAusentes = (ausentesRes.data ?? []).map((p: AnyRecord) => ({
        id: p.id as string,
        nome: displayName(p),
        person_stage: p.person_stage as string,
        last_contact_at: p.last_contact_at as string | null,
      }))

      // W12: células com < 3 membros
      const celulasEmAlerta = Object.entries(membrosPorCelula)
        .filter(([, count]) => count < 3)
        .map(([id, membros]) => ({ id, name: grupoNomes[id] ?? 'Célula', membros }))
        .sort((a, b) => a.membros - b.membros)
        .slice(0, 5)
      // Células sem nenhum membro também entram
      const celulasSemMembro = (gruposNomesRes.data ?? [])
        .filter((g: AnyRecord) => !membrosPorCelula[g.id])
        .slice(0, 3 - celulasEmAlerta.length)
        .map((g: AnyRecord) => ({ id: g.id as string, name: g.name as string, membros: 0 }))
      const allCelulasAlerta = [...celulasEmAlerta, ...celulasSemMembro]
        .sort((a, b) => a.membros - b.membros)
        .slice(0, 5)

      // W13
      const visitantesSemConsolidacao = (semConsolidacaoRes.data ?? []).map((p: AnyRecord) => ({
        id: p.id as string,
        nome: displayName(p),
        created_at: p.created_at as string,
      }))

      // W14: evolução de membros — acumulado por mês
      const monthMap: Record<string, number> = {}
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        monthMap[d.toISOString().slice(0, 7)] = 0
      }
      for (const p of (evolucaoRes.data ?? []) as AnyRecord[]) {
        const key = (p.created_at as string).slice(0, 7)
        if (key in monthMap) monthMap[key]++
      }
      let cumulative = 0
      const evolucaoMembros = Object.entries(monthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, count]) => {
          cumulative += count
          const [year, month] = key.split('-')
          const label = new Date(+year, +month - 1, 1).toLocaleDateString('pt-BR', {
            month: 'short',
            year: '2-digit',
          })
          return { mes: label, total: cumulative }
        })

      return {
        visitantesSemana,
        taxaConsolidacao,
        taxaConsolidacaoAlert: taxaConsolidacao < 50,
        membrosAtivos: ativos,
        celulasAtivas,
        totalCelulas,
        caminhoDiscipulado,
        topCelulas,
        crescimentoCelulas,
        voluntariosPorDept,
        batismosTrimestre,
        dizimosOfertasMes,
        membrosAusentes,
        celulasEmAlerta: allCelulasAlerta,
        visitantesSemConsolidacao,
        evolucaoMembros,
        alunosEscolaDaFe,
      }
    },
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(churchId),
  })
}
