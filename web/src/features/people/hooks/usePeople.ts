import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PersonWithStage, Person } from '@/lib/types/joins'

export const PEOPLE_PAGE_SIZE = 50

interface PeopleFilters {
  search?: string
  stageSlug?: string
  tag?: string
  optout?: boolean
  celulaId?: string
  /** UUID de church_unit, ou 'none' para filtrar pessoas sem unidade definida. */
  unitId?: string
  /** 0-indexed page (para a tab "Visão Geral"). Use pageSize=-1 para buscar tudo (tabs filtradas). */
  page?: number
  /** Tamanho da página. Default: PEOPLE_PAGE_SIZE. Passar 500 para buscar tudo nas tabs filtradas. */
  pageSize?: number
}

// Lista pessoas com stage atual
export function usePeople(churchId: string, filters: PeopleFilters = {}) {
  return useQuery({
    queryKey: ['people', churchId, filters],
    queryFn: async (): Promise<PersonWithStage[]> => {
      const page     = filters.page     ?? 0
      const pageSize = filters.pageSize ?? PEOPLE_PAGE_SIZE
      const from     = page * pageSize
      const to       = from + pageSize - 1

      let query = supabase
        .from('people')
        .select(`
          *,
          person_pipeline (
            stage_id,
            last_activity_at,
            entered_at,
            pipeline_stages ( id, name, slug, order_index, color )
          ),
          person_tags (
            tag_id,
            tags ( id, name, color, sort_order )
          )
        `)
        .eq('church_id', churchId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (filters.search) {
        query = query.or(
          `name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,email.ilike.%${filters.search}%`
        )
      }

      if (filters.optout !== undefined) {
        query = query.eq('optout', filters.optout)
      }

      if (filters.celulaId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).eq('celula_id', filters.celulaId)
      }

      if (filters.unitId === 'none') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).is('unit_id', null)
      } else if (filters.unitId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        query = (query as any).eq('unit_id', filters.unitId)
      }

      const { data, error } = await query

      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as PersonWithStage[]
    },
    enabled: Boolean(churchId),
  })
}

// Conta total para paginação futura
export function usePeopleCount(churchId: string) {
  return useQuery({
    queryKey: ['people-count', churchId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('people')
        .select('*', { count: 'exact', head: true })
        .eq('church_id', churchId)
        .is('deleted_at', null)
      if (error) throw new Error(error.message)
      return count ?? 0
    },
    enabled: Boolean(churchId),
  })
}

// ──────────────────────────────────────────────────────────────────────
// Tipos de input expandidos com os 17 campos de membro (migration 00009)
// ──────────────────────────────────────────────────────────────────────

interface PersonFields {
  // Identificação básica
  name?: string
  phone?: string | null
  email?: string | null
  tags?: string[]
  // Pessoal
  birth_date?: string | null
  marital_status?: string | null
  neighborhood?: string | null
  como_conheceu?: string | null
  // Eclesiástico
  celula_id?: string | null
  conversion_date?: string | null
  batismo_status?: string | null
  baptism_date?: string | null
  calling?: string | null          // dons e talentos (texto livre)
  ministry_interest?: string[]     // departamentos (multi-select)
  // Formação
  consolidation_school?: boolean | null   // curso teológico
  experiencia_lideranca?: string | null
  // Financeiro — apenas admin/treasurer (visibilidade no frontend)
  is_dizimista?: boolean | null
  // Acompanhamento — apenas admin (visibilidade no frontend)
  observacoes_pastorais?: string | null
  // Liderança
  is_leader?: boolean
  // Unidade/sede
  unit_id?: string | null
}

interface CreatePersonInput extends PersonFields {
  church_id: string
  name: string
  source: Person['source']
}

export function useCreatePerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreatePersonInput) => {
      const { data, error } = await supabase
        .from('people')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(input as any)
        .select()
        .single()

      if (error) throw new Error(error.message)

      // Dispara evento de pessoa criada (non-blocking — notificações in-app)
      void supabase.functions.invoke('dispatch-person-event', {
        body: { person_id: data.id, event: 'person_created' },
      })

      return data
    },
    onSuccess: (data) => {
      if (!data) return
      void queryClient.invalidateQueries({ queryKey: ['people', data.church_id], exact: false })
      void queryClient.invalidateQueries({ queryKey: ['people-count', data.church_id], exact: false })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats', data.church_id], exact: false })
    },
  })
}

interface UpdatePersonInput extends PersonFields {
  id: string
  church_id: string
}

export function useUpdatePerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: UpdatePersonInput) => {
      const { data, error } = await supabase
        .from('people')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('id', id)
        .eq('church_id', church_id)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (data) => {
      if (!data) return
      void queryClient.invalidateQueries({ queryKey: ['people', data.church_id] })
    },
  })
}

// Soft delete
export function useDeletePerson() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: { id: string; churchId: string }) => {
      // .select('id') forces Supabase to return affected rows — without it,
      // the API returns {data:null, error:null} even when RLS silently blocks
      // the UPDATE (0 rows affected), making it indistinguishable from success.
      const { data, error } = await supabase
        .from('people')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ deleted_at: new Date().toISOString() } as any)
        .eq('id', id)
        .eq('church_id', churchId)
        .select('id')
      if (error) throw new Error(error.message)
      if (!data || data.length === 0) throw new Error('Não foi possível excluir. Verifique suas permissões e tente novamente.')
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['people', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['people-count', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard-stats', churchId] })
    },
  })
}
