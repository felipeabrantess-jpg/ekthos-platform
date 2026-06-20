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
  receipt_path: string | null
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
  receipt_path?: string | null
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
          receipt_path: input.receipt_path ?? null,
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
          receipt_path: updates.receipt_path !== undefined ? updates.receipt_path : undefined,
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

// ── Storage: comprovantes (SF3) ───────────────────────────────────────────────

const RECEIPTS_BUCKET = 'financial-receipts'

export async function uploadReceipt(file: File, churchId: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin'
  const fileId = crypto.randomUUID()
  const path = `${churchId}/${fileId}.${ext}`
  const { error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
  if (error) throw new Error(`Upload falhou: ${error.message}`)
  return path
}

export async function deleteReceipt(path: string): Promise<void> {
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).remove([path])
  if (error) throw new Error(`Remoção falhou: ${error.message}`)
}

export async function getSignedReceiptUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from(RECEIPTS_BUCKET)
    .createSignedUrl(path, 3600) // expira em 1h
  if (error || !data?.signedUrl) throw new Error(error?.message ?? 'URL temporária não gerada')
  return data.signedUrl
}

// ── Receivables (Contas a Receber) ────────────────────────────────────────────

export interface Receivable {
  id: string
  church_id: string
  description: string
  amount: number
  due_date: string | null
  payer_name: string | null
  person_id: string | null
  status: 'a_receber' | 'recebido'
  received_date: string | null
  bank_account_id: string | null
  category_id: string | null
  receipt_path: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

interface ReceivableInput {
  church_id: string
  description: string
  amount: number
  due_date?: string | null
  payer_name?: string | null
  person_id?: string | null
  status?: 'a_receber' | 'recebido'
  received_date?: string | null
  bank_account_id?: string | null
  category_id?: string | null
  receipt_path?: string | null
  notes?: string | null
}

export function useReceivables(churchId: string) {
  return useQuery({
    queryKey: ['receivables', churchId],
    queryFn: async (): Promise<Receivable[]> => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('receivables' as any)
        .select('*')
        .eq('church_id', churchId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as Receivable[]
    },
    enabled: Boolean(churchId),
  })
}

export function useCreateReceivable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: ReceivableInput) => {
      const { data, error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('receivables' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({
          church_id: input.church_id,
          description: input.description,
          amount: input.amount,
          due_date: input.due_date ?? null,
          payer_name: input.payer_name ?? null,
          person_id: input.person_id ?? null,
          status: input.status ?? 'a_receber',
          received_date: input.received_date ?? null,
          bank_account_id: input.bank_account_id ?? null,
          category_id: input.category_id ?? null,
          receipt_path: input.receipt_path ?? null,
          notes: input.notes ?? null,
        } as any)
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['receivables', church_id] })
      void queryClient.invalidateQueries({ queryKey: ['bank-account-balances', church_id] })
    },
  })
}

export function useUpdateReceivable() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, church_id, ...updates }: { id: string } & ReceivableInput) => {
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from('receivables' as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({
          description: updates.description,
          amount: updates.amount,
          due_date: updates.due_date ?? null,
          payer_name: updates.payer_name ?? null,
          person_id: updates.person_id ?? null,
          status: updates.status ?? 'a_receber',
          received_date: updates.received_date ?? null,
          bank_account_id: updates.bank_account_id !== undefined ? updates.bank_account_id : undefined,
          category_id: updates.category_id ?? null,
          receipt_path: updates.receipt_path !== undefined ? updates.receipt_path : undefined,
          notes: updates.notes ?? null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq('id', id)
        .eq('church_id', church_id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { church_id }) => {
      void queryClient.invalidateQueries({ queryKey: ['receivables', church_id] })
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
      const [accountsRes, donationsRes, expensesRes, receivablesRes] = await Promise.all([
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
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('receivables' as any)
          .select('bank_account_id, amount')
          .eq('church_id', churchId)
          .eq('status', 'recebido')
          .not('bank_account_id', 'is', null),
      ])

      if (accountsRes.error) throw new Error(accountsRes.error.message)
      if (donationsRes.error) throw new Error(donationsRes.error.message)
      if (expensesRes.error) throw new Error(expensesRes.error.message)
      if (receivablesRes.error) throw new Error(receivablesRes.error.message)

      const accounts = (accountsRes.data ?? []) as unknown as Array<{ id: string; name: string; initial_balance: number }>
      const donations = (donationsRes.data ?? []) as unknown as Array<{ bank_account_id: string; amount: number }>
      const expenses = (expensesRes.data ?? []) as unknown as Array<{ bank_account_id: string; amount: number }>
      const receivables = (receivablesRes.data ?? []) as unknown as Array<{ bank_account_id: string; amount: number }>

      return accounts.map(acc => {
        const entradasDoacoes = donations
          .filter(d => d.bank_account_id === acc.id)
          .reduce((sum, d) => sum + Number(d.amount), 0)
        const entradasRecebidas = receivables
          .filter(r => r.bank_account_id === acc.id)
          .reduce((sum, r) => sum + Number(r.amount), 0)
        const entradas = entradasDoacoes + entradasRecebidas
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

// ── Fluxo de Caixa (últimos 6 meses) ─────────────────────────────────────────

export interface FluxoMes {
  mes: string          // 'YYYY-MM'
  label: string        // 'Jun/26'
  entradas: number     // donations confirmed + receivables recebido
  saidas: number       // expenses paga
  resultado: number    // entradas - saidas
}

export interface FluxoCaixaData {
  meses: FluxoMes[]
  mesAtual: FluxoMes
  projecao: {
    entradas_previstas: number   // receivables a_receber
    saidas_previstas: number     // expenses a_pagar
    resultado_projetado: number  // resultado + entradas_previstas - saidas_previstas (se tudo se realizar)
  }
}

function buildMonthRange(count: number): string[] {
  const months: string[] = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    months.push(`${y}-${m}`)
  }
  return months
}

function monthLabel(mes: string): string {
  const [y, m] = mes.split('-')
  const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  return `${MONTHS[parseInt(m, 10) - 1]}/${y.slice(2)}`
}

export function useFluxoCaixa(churchId: string) {
  return useQuery({
    queryKey: ['fluxo-caixa', churchId],
    queryFn: async (): Promise<FluxoCaixaData> => {
      const sixMonthsAgo = (() => {
        const d = new Date()
        d.setMonth(d.getMonth() - 5)
        d.setDate(1)
        return d.toISOString().split('T')[0]
      })()

      const [donationsRes, expensesRes, receivablesRes, projecaoExpRes, projecaoRecRes] = await Promise.all([
        // Entradas realizadas: donations confirmed nos últimos 6 meses
        supabase
          .from('donations')
          .select('created_at, amount')
          .eq('church_id', churchId)
          .eq('status', 'confirmed')
          .gte('created_at', sixMonthsAgo),
        // Saídas realizadas: expenses paga nos últimos 6 meses
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('expenses' as any)
          .select('expense_date, amount')
          .eq('church_id', churchId)
          .eq('status', 'paga')
          .gte('expense_date', sixMonthsAgo),
        // Entradas realizadas complementares: receivables recebido nos últimos 6 meses
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('receivables' as any)
          .select('received_date, amount')
          .eq('church_id', churchId)
          .eq('status', 'recebido')
          .gte('received_date', sixMonthsAgo),
        // Projeção saídas: expenses a_pagar (independe do mês)
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('expenses' as any)
          .select('amount')
          .eq('church_id', churchId)
          .eq('status', 'a_pagar'),
        // Projeção entradas: receivables a_receber (independe do mês)
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('receivables' as any)
          .select('amount')
          .eq('church_id', churchId)
          .eq('status', 'a_receber'),
      ])

      if (donationsRes.error) throw new Error(donationsRes.error.message)
      if (expensesRes.error) throw new Error(expensesRes.error.message)
      if (receivablesRes.error) throw new Error(receivablesRes.error.message)
      if (projecaoExpRes.error) throw new Error(projecaoExpRes.error.message)
      if (projecaoRecRes.error) throw new Error(projecaoRecRes.error.message)

      type DonRow = { created_at: string; amount: number }
      type ExpRow = { expense_date: string; amount: number }
      type RecRow = { received_date: string | null; amount: number }
      type AmtRow = { amount: number }

      const donations   = (donationsRes.data   ?? []) as unknown as DonRow[]
      const expenses    = (expensesRes.data     ?? []) as unknown as ExpRow[]
      const receivables = (receivablesRes.data  ?? []) as unknown as RecRow[]
      const projecaoExp = (projecaoExpRes.data  ?? []) as unknown as AmtRow[]
      const projecaoRec = (projecaoRecRes.data  ?? []) as unknown as AmtRow[]

      const months = buildMonthRange(6)

      const meses: FluxoMes[] = months.map(mes => {
        const entDoacoes = donations
          .filter(d => d.created_at.slice(0, 7) === mes)
          .reduce((s, d) => s + Number(d.amount), 0)
        const entRecebidos = receivables
          .filter(r => r.received_date && r.received_date.slice(0, 7) === mes)
          .reduce((s, r) => s + Number(r.amount), 0)
        const entradas = entDoacoes + entRecebidos
        const saidas = expenses
          .filter(e => e.expense_date.slice(0, 7) === mes)
          .reduce((s, e) => s + Number(e.amount), 0)
        return { mes, label: monthLabel(mes), entradas, saidas, resultado: entradas - saidas }
      })

      const currentMes = new Date().toISOString().slice(0, 7)
      const mesAtual = meses.find(m => m.mes === currentMes) ?? {
        mes: currentMes,
        label: monthLabel(currentMes),
        entradas: 0,
        saidas: 0,
        resultado: 0,
      }

      const saidas_previstas   = projecaoExp.reduce((s, e) => s + Number(e.amount), 0)
      const entradas_previstas = projecaoRec.reduce((s, r) => s + Number(r.amount), 0)

      return {
        meses,
        mesAtual,
        projecao: {
          entradas_previstas,
          saidas_previstas,
          resultado_projetado: mesAtual.resultado + entradas_previstas - saidas_previstas,
        },
      }
    },
    enabled: Boolean(churchId),
  })
}
