import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Donation, DonationType, DonationStatus, FinancialCampaign, PaymentMethod } from '@/lib/database.types'

interface FinanceiroStats {
  totalConfirmedAllTime: number
  totalThisMonth: number
  byType: Record<DonationType, number>
  countByStatus: Record<DonationStatus, number>
  campaigns: FinancialCampaign[]
}

export function useFinanceiroStats(churchId: string) {
  return useQuery({
    queryKey: ['financeiro-stats', churchId],
    queryFn: async (): Promise<FinanceiroStats> => {
      const now = new Date()
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [allTimeRes, thisMonthRes, allDonationsRes, campaignsRes] = await Promise.all([
        supabase
          .from('donations')
          .select('amount')
          .eq('church_id', churchId)
          .eq('status', 'confirmed'),
        supabase
          .from('donations')
          .select('amount')
          .eq('church_id', churchId)
          .eq('status', 'confirmed')
          .gte('created_at', startOfMonth),
        supabase
          .from('donations')
          .select('amount, type, status')
          .eq('church_id', churchId),
        supabase
          .from('financial_campaigns')
          .select('*')
          .eq('church_id', churchId)
          .eq('is_active', true),
      ])

      if (allTimeRes.error) throw new Error(allTimeRes.error.message)
      if (thisMonthRes.error) throw new Error(thisMonthRes.error.message)
      if (allDonationsRes.error) throw new Error(allDonationsRes.error.message)
      if (campaignsRes.error) throw new Error(campaignsRes.error.message)

      const totalConfirmedAllTime = (allTimeRes.data ?? []).reduce((sum, d) => sum + (d.amount ?? 0), 0)
      const totalThisMonth = (thisMonthRes.data ?? []).reduce((sum, d) => sum + (d.amount ?? 0), 0)

      const byType: Record<DonationType, number> = {
        dizimo: 0,
        oferta: 0,
        campanha: 0,
        missoes: 0,
        construcao: 0,
      }

      const countByStatus: Record<DonationStatus, number> = {
        pending: 0,
        confirmed: 0,
        failed: 0,
        refunded: 0,
        cancelled: 0,
      }

      for (const d of allDonationsRes.data ?? []) {
        if (d.type in byType) {
          byType[d.type as DonationType] += d.amount ?? 0
        }
        if (d.status in countByStatus) {
          countByStatus[d.status as DonationStatus] += 1
        }
      }

      return {
        totalConfirmedAllTime,
        totalThisMonth,
        byType,
        countByStatus,
        campaigns: campaignsRes.data ?? [],
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
