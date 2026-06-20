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
  bank_account_id?: string | null
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
          bank_account_id: input.bank_account_id ?? null,
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

// ── Campaign mutations ────────────────────────────────────────────────────────

interface CampaignInput {
  church_id: string
  name: string
  description?: string | null
  goal_amount?: number | null
  start_date?: string | null
  end_date?: string | null
  is_active?: boolean
}

export function useCreateCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CampaignInput) => {
      const { data, error } = await supabase
        .from('financial_campaigns')
        .insert({
          church_id: input.church_id,
          name: input.name,
          description: input.description ?? null,
          goal_amount: input.goal_amount ?? null,
          start_date: input.start_date ?? null,
          end_date: input.end_date ?? null,
          is_active: input.is_active ?? true,
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['financeiro-stats', church_id] })
    },
  })
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: { id: string } & CampaignInput) => {
      const { error } = await supabase
        .from('financial_campaigns')
        .update({
          name: updates.name,
          description: updates.description ?? null,
          goal_amount: updates.goal_amount ?? null,
          start_date: updates.start_date ?? null,
          end_date: updates.end_date ?? null,
          is_active: updates.is_active ?? true,
        })
        .eq('id', id)
        .eq('church_id', church_id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['financeiro-stats', church_id] })
    },
  })
}

// ── Financial Categories ──────────────────────────────────────────────────────

export interface FinancialCategory {
  id: string
  church_id: string
  name: string
  color: string | null
  type: 'income' | 'expense' | 'both'
  sort_order: number
  is_active: boolean
  created_at: string
}

interface CategoryInput {
  church_id: string
  name: string
  color?: string | null
  type?: 'income' | 'expense' | 'both'
  sort_order?: number
  is_active?: boolean
}

export function useFinancialCategories(churchId: string) {
  return useQuery({
    queryKey: ['financial-categories', churchId],
    queryFn: async (): Promise<FinancialCategory[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('financial_categories' as any)
        .select('*')
        .eq('church_id', churchId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as FinancialCategory[]
    },
    enabled: Boolean(churchId),
  })
}

export function useCreateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: CategoryInput) => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('financial_categories' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          church_id: input.church_id,
          name: input.name,
          color: input.color ?? null,
          type: input.type ?? 'expense',
          sort_order: input.sort_order ?? 0,
          is_active: input.is_active ?? true,
        } as any)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['financial-categories', church_id] })
    },
  })
}

export function useUpdateCategory() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: { id: string } & CategoryInput) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('financial_categories' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          name: updates.name,
          color: updates.color ?? null,
          type: updates.type ?? 'expense',
          sort_order: updates.sort_order ?? 0,
          is_active: updates.is_active ?? true,
        } as any)
        .eq('id', id)
        .eq('church_id', church_id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['financial-categories', church_id] })
    },
  })
}

// ── Bank Accounts ─────────────────────────────────────────────────────────────

export interface BankAccount {
  id: string
  church_id: string
  name: string
  bank_name: string | null
  account_type: 'conta_corrente' | 'poupanca' | 'caixa' | 'investimento'
  initial_balance: number
  is_active: boolean
  created_at: string
  updated_at: string
}

interface BankAccountInput {
  church_id: string
  name: string
  bank_name?: string | null
  account_type?: 'conta_corrente' | 'poupanca' | 'caixa' | 'investimento'
  initial_balance?: number
  is_active?: boolean
}

export function useBankAccounts(churchId: string) {
  return useQuery({
    queryKey: ['bank-accounts', churchId],
    queryFn: async (): Promise<BankAccount[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('bank_accounts' as any)
        .select('*')
        .eq('church_id', churchId)
        .order('created_at', { ascending: true })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as BankAccount[]
    },
    enabled: Boolean(churchId),
  })
}

export function useCreateBankAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: BankAccountInput) => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('bank_accounts' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          church_id: input.church_id,
          name: input.name,
          bank_name: input.bank_name ?? null,
          account_type: input.account_type ?? 'conta_corrente',
          initial_balance: input.initial_balance ?? 0,
          is_active: input.is_active ?? true,
        } as any)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['bank-accounts', church_id] })
    },
  })
}

export function useUpdateBankAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: { id: string } & BankAccountInput) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('bank_accounts' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          name: updates.name,
          bank_name: updates.bank_name ?? null,
          account_type: updates.account_type ?? 'conta_corrente',
          initial_balance: updates.initial_balance ?? 0,
          is_active: updates.is_active ?? true,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id)
        .eq('church_id', church_id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['bank-accounts', church_id] })
    },
  })
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export interface Expense {
  id: string
  church_id: string
  category_id: string | null
  bank_account_id: string | null
  amount: number
  description: string
  supplier: string | null
  expense_date: string
  due_date: string | null
  status: 'paga' | 'a_pagar'
  payment_method: string | null
  created_at: string
  updated_at: string
}

interface ExpenseInput {
  church_id: string
  category_id?: string | null
  bank_account_id?: string | null
  amount: number
  description: string
  supplier?: string | null
  expense_date: string
  due_date?: string | null
  status?: 'paga' | 'a_pagar'
  payment_method?: string | null
}

export function useExpenses(churchId: string) {
  return useQuery({
    queryKey: ['expenses', churchId],
    queryFn: async (): Promise<Expense[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('expenses' as any)
        .select('*')
        .eq('church_id', churchId)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as Expense[]
    },
    enabled: Boolean(churchId),
  })
}

export function useCreateExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ExpenseInput) => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('expenses' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          church_id: input.church_id,
          category_id: input.category_id ?? null,
          bank_account_id: input.bank_account_id ?? null,
          amount: input.amount,
          description: input.description,
          supplier: input.supplier ?? null,
          expense_date: input.expense_date,
          due_date: input.due_date ?? null,
          status: input.status ?? 'a_pagar',
          payment_method: input.payment_method ?? null,
        } as any)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['expenses', church_id] })
      void queryClient.invalidateQueries({ queryKey: ['bank-account-balances', church_id] })
    },
  })
}

export function useUpdateExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: { id: string } & ExpenseInput) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('expenses' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          category_id: updates.category_id ?? null,
          bank_account_id: updates.bank_account_id ?? null,
          amount: updates.amount,
          description: updates.description,
          supplier: updates.supplier ?? null,
          expense_date: updates.expense_date,
          due_date: updates.due_date ?? null,
          status: updates.status ?? 'a_pagar',
          payment_method: updates.payment_method ?? null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id)
        .eq('church_id', church_id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['expenses', church_id] })
      void queryClient.invalidateQueries({ queryKey: ['bank-account-balances', church_id] })
    },
  })
}

// ── Bank Account Balances ─────────────────────────────────────────────────────

export interface BankAccountBalance {
  id: string
  name: string
  initial_balance: number
  entradas: number
  saidas: number
  saldo_atual: number
}

export function useBankAccountBalances(churchId: string) {
  return useQuery({
    queryKey: ['bank-account-balances', churchId],
    queryFn: async (): Promise<BankAccountBalance[]> => {
      const [accountsRes, donationsRes, expensesRes] = await Promise.all([
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('bank_accounts' as any)
          .select('id, name, initial_balance')
          .eq('church_id', churchId)
          .eq('is_active', true),
        supabase
          .from('donations')
          .select('bank_account_id, amount')
          .eq('church_id', churchId)
          .eq('status', 'confirmed')
          .not('bank_account_id', 'is', null),
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('expenses' as any)
          .select('bank_account_id, amount')
          .eq('church_id', churchId)
          .eq('status', 'paga')
          .not('bank_account_id', 'is', null),
      ])

      if (accountsRes.error) throw new Error(accountsRes.error.message)
      if (donationsRes.error) throw new Error(donationsRes.error.message)
      if (expensesRes.error) throw new Error(expensesRes.error.message)

      const accounts = (accountsRes.data ?? []) as unknown as Array<{ id: string; name: string; initial_balance: number }>
      const donations = (donationsRes.data ?? []) as unknown as Array<{ bank_account_id: string; amount: number }>
      const expenses = (expensesRes.data ?? []) as unknown as Array<{ bank_account_id: string; amount: number }>

      return accounts.map(acc => {
        const entradas = donations
          .filter(d => d.bank_account_id === acc.id)
          .reduce((sum, d) => sum + Number(d.amount), 0)
        const saidas = expenses
          .filter(e => e.bank_account_id === acc.id)
          .reduce((sum, e) => sum + Number(e.amount), 0)
        return {
          id: acc.id,
          name: acc.name,
          initial_balance: Number(acc.initial_balance),
          entradas,
          saidas,
          saldo_atual: Number(acc.initial_balance) + entradas - saidas,
        }
      })
    },
    enabled: Boolean(churchId),
  })
}
