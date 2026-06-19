import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Donation, DonationType, DonationStatus, FinancialCampaign, PaymentMethod } from '@/lib/types/joins'

interface FinanceiroStats {
  totalConfirmedAllTime: number
  totalThisMonth: number
  dizimoThisMonth: number
  byType: Record<DonationType, number>
  countPending: number
  campaigns: FinancialCampaign[]
  raisedByCampaign: Record<string, number>
}

export function useFinanceiroStats(churchId: string) {
  return useQuery({
    queryKey: ['financeiro-stats', churchId],
    queryFn: async (): Promise<FinanceiroStats> => {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [allDonationsConfirmedRes, thisMonthRes, campaignsRes, campaignRaisedRes, pendingRes] = await Promise.all([
        // Todos os confirmados all-time (para totalConfirmedAllTime e byType)
        supabase
          .from('donations')
          .select('amount, type')
          .eq('church_id', churchId)
          .eq('status', 'confirmed'),
        // Confirmados do mês atual (para totalThisMonth e dizimoThisMonth)
        supabase
          .from('donations')
          .select('amount, type')
          .eq('church_id', churchId)
          .eq('status', 'confirmed')
          .gte('created_at', startOfMonth),
        // Campanhas ativas
        supabase
          .from('financial_campaigns')
          .select('*')
          .eq('church_id', churchId)
          .eq('is_active', true),
        // Soma confirmada por campanha (para progresso real de campanha)
        supabase
          .from('donations')
          .select('campaign_id, amount')
          .eq('church_id', churchId)
          .eq('status', 'confirmed')
          .not('campaign_id', 'is', null),
        // Count de pendentes (para KPI Pendentes)
        supabase
          .from('donations')
          .select('*', { count: 'exact', head: true })
          .eq('church_id', churchId)
          .eq('status', 'pending'),
      ])

      if (allDonationsConfirmedRes.error) throw new Error(allDonationsConfirmedRes.error.message)
      if (thisMonthRes.error) throw new Error(thisMonthRes.error.message)
      if (campaignsRes.error) throw new Error(campaignsRes.error.message)
      if (campaignRaisedRes.error) throw new Error(campaignRaisedRes.error.message)
      if (pendingRes.error) throw new Error(pendingRes.error.message)

      const totalConfirmedAllTime = (allDonationsConfirmedRes.data ?? []).reduce((sum, d) => sum + (d.amount ?? 0), 0)
      const totalThisMonth = (thisMonthRes.data ?? []).reduce((sum, d) => sum + (d.amount ?? 0), 0)
      const dizimoThisMonth = (thisMonthRes.data ?? [])
        .filter(d => d.type === 'dizimo')
        .reduce((sum, d) => sum + (d.amount ?? 0), 0)

      const byType: Record<DonationType, number> = {
        dizimo: 0,
        oferta: 0,
        campanha: 0,
        missoes: 0,
        construcao: 0,
      }

      for (const d of allDonationsConfirmedRes.data ?? []) {
        if (d.type in byType) {
          byType[d.type as DonationType] += d.amount ?? 0
        }
      }

      const countPending = pendingRes.count ?? 0

      const raisedByCampaign: Record<string, number> = {}
      for (const d of campaignRaisedRes.data ?? []) {
        if (d.campaign_id) {
          raisedByCampaign[d.campaign_id] = (raisedByCampaign[d.campaign_id] ?? 0) + (d.amount ?? 0)
        }
      }

      return {
        totalConfirmedAllTime,
        totalThisMonth,
        dizimoThisMonth,
        byType,
        countPending,
        campaigns: campaignsRes.data ?? [],
        raisedByCampaign,
      }
    },
    enabled: Boolean(churchId),
  })
}

interface DonationsFilters {
  type?: DonationType
  status?: DonationStatus
  campaignId?: string
}

interface DonationWithPerson extends Donation {
  people: { id: string; name: string | null } | null
}

export function useDonations(churchId: string, filters: DonationsFilters = {}) {
  return useQuery({
    queryKey: ['donations', churchId, filters],
    queryFn: async (): Promise<DonationWithPerson[]> => {
      let query = supabase
        .from('donations')
        .select(`
          *,
          people ( id, name )
        `)
        .eq('church_id', churchId)
        .order('created_at', { ascending: false })
        .limit(50)

      if (filters.type) {
        query = query.eq('type', filters.type)
      }

      if (filters.status) {
        query = query.eq('status', filters.status)
      }

      if (filters.campaignId) {
        query = query.eq('campaign_id', filters.campaignId)
      }

      const { data, error } = await query

      if (error) throw new Error(error.message)
      return (data ?? []) as DonationWithPerson[]
    },
    enabled: Boolean(churchId),
  })
}

interface CreateDonationInput {
  church_id: string
  person_id?: string | null
  type: DonationType
  amount: number
  payment_method?: PaymentMethod | null
  notes?: string | null
  status?: DonationStatus
  campaign_id?: string | null
}

export function useCreateDonation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateDonationInput) => {
      const { data, error } = await supabase
        .from('donations')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          church_id: input.church_id,
          person_id: input.person_id ?? null,
          type: input.type,
          amount: input.amount,
          currency: 'BRL',
          payment_method: input.payment_method ?? null,
          notes: input.notes ?? null,
          status: input.status ?? 'pending',
          campaign_id: input.campaign_id ?? null,
          receipt_sent: false,
        } as any)
        .select()
        .single()

      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['donations', church_id] })
      void queryClient.invalidateQueries({ queryKey: ['financeiro-stats', church_id] })
    },
  })
}

export function useConfirmDonation() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, churchId }: { id: string; churchId: string }) => {
      const { error } = await supabase
        .from('donations')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
        } as any)
        .eq('id', id)
        .eq('church_id', churchId)

      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['donations', churchId] })
      void queryClient.invalidateQueries({ queryKey: ['financeiro-stats', churchId] })
    },
  })
}
