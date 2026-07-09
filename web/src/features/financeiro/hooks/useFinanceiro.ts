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
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]

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
          .gte('donation_date', startOfMonth),
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
  culto_type?: string | null
  donation_date?: string | null
  unit_id?: string | null
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          culto_type: (input.culto_type ?? null) as any,
          donation_date: input.donation_date ?? null,
          unit_id: (input.unit_id ?? null) as any,
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
  unit_id: string | null
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
  unit_id?: string | null
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
          unit_id: (input.unit_id ?? null) as any,
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
          unit_id: (updates.unit_id ?? null) as any,
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
  unit_id: string | null
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
  unit_id?: string | null
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
          unit_id: (input.unit_id ?? null) as any,
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
          unit_id: (updates.unit_id ?? null) as any,
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
          .select('donation_date, amount')
          .eq('church_id', churchId)
          .eq('status', 'confirmed')
          .gte('donation_date', sixMonthsAgo),
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

      type DonRow = { donation_date: string | null; amount: number }
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
          .filter(d => d.donation_date && d.donation_date.slice(0, 7) === mes)
          .reduce((s, d) => s + Number(d.amount), 0)
        const entRecebidos = receivables
          .filter(r => r.received_date && r.received_date.slice(0, 7) === mes)
          .reduce((s, r) => s + Number(r.amount), 0)
        const entradas = entDoacoes + entRecebidos
        const saidas = expenses
          .filter(e => e.expense_date && e.expense_date.slice(0, 7) === mes)
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

// ── DRE — Demonstração de Resultado por Categoria ─────────────────────────────

export interface DRECategoria {
  categoria: string
  total: number
}

export interface DREData {
  receitas: {
    realizadas: DRECategoria[]
    previstas: DRECategoria[]
    total_realizado: number
    total_previsto: number
  }
  despesas: {
    realizadas: DRECategoria[]
    previstas: DRECategoria[]
    total_realizado: number
    total_previsto: number
  }
  resultado_realizado: number
  resultado_projetado: number
  periodo: { start: string; end: string }
}

const DONATION_TYPE_LABEL: Record<string, string> = {
  dizimo:    'Dízimo',
  oferta:    'Oferta',
  campanha:  'Campanha',
  missoes:   'Missões',
  construcao: 'Construção',
}

function groupByKey<T>(
  rows: T[],
  keyFn: (r: T) => string,
  amtFn: (r: T) => number,
): DRECategoria[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const k = keyFn(r)
    map.set(k, (map.get(k) ?? 0) + amtFn(r))
  }
  return Array.from(map.entries())
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total)
}

export function useDRE(churchId: string, startDate: string, endDate: string) {
  return useQuery({
    queryKey: ['dre', churchId, startDate, endDate],
    queryFn: async (): Promise<DREData> => {
      type DonRow = { type: string; amount: number }
      type ExpRow = { category_id: string | null; amount: number; cat_name: string | null }
      type RecRow = { category_id: string | null; amount: number; cat_name: string | null; received_date: string | null; due_date: string | null }

      const [donRealRes, recRealRes, recPrevRes, expRealRes, expPrevRes] = await Promise.all([
        // Receitas realizadas: donations confirmed no período
        supabase
          .from('donations')
          .select('type, amount')
          .eq('church_id', churchId)
          .eq('status', 'confirmed')
          .gte('donation_date', startDate)
          .lte('donation_date', endDate),

        // Receitas realizadas complementares: receivables recebido no período
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('receivables' as any)
          .select('category_id, amount, financial_categories(name)')
          .eq('church_id', churchId)
          .eq('status', 'recebido')
          .gte('received_date', startDate)
          .lte('received_date', endDate),

        // Receitas previstas: receivables a_receber (due_date no período ou sem vencimento)
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('receivables' as any)
          .select('category_id, amount, due_date, financial_categories(name)')
          .eq('church_id', churchId)
          .eq('status', 'a_receber'),

        // Despesas realizadas: expenses paga no período
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('expenses' as any)
          .select('category_id, amount, financial_categories(name)')
          .eq('church_id', churchId)
          .eq('status', 'paga')
          .gte('expense_date', startDate)
          .lte('expense_date', endDate),

        // Despesas previstas: expenses a_pagar (due_date no período ou sem vencimento)
        supabase
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .from('expenses' as any)
          .select('category_id, amount, due_date, financial_categories(name)')
          .eq('church_id', churchId)
          .eq('status', 'a_pagar'),
      ])

      if (donRealRes.error) throw new Error(donRealRes.error.message)
      if (recRealRes.error) throw new Error(recRealRes.error.message)
      if (recPrevRes.error) throw new Error(recPrevRes.error.message)
      if (expRealRes.error) throw new Error(expRealRes.error.message)
      if (expPrevRes.error) throw new Error(expPrevRes.error.message)

      const donRows  = (donRealRes.data ?? []) as unknown as DonRow[]
      const recReal  = (recRealRes.data ?? []) as unknown as RecRow[]
      const recPrev  = (recPrevRes.data ?? []) as unknown as RecRow[]
      const expReal  = (expRealRes.data ?? []) as unknown as ExpRow[]
      const expPrev  = (expPrevRes.data ?? []) as unknown as ExpRow[]

      // Receitas realizadas: donations por type + receivables por categoria
      const receitasReal: DRECategoria[] = [
        ...groupByKey(donRows, r => DONATION_TYPE_LABEL[r.type] ?? r.type, r => Number(r.amount)),
        ...groupByKey(
          recReal,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          r => (r as any).financial_categories?.name ?? 'Sem categoria',
          r => Number(r.amount),
        ),
      ]

      // Receitas previstas: receivables a_receber
      const receitasPrev = groupByKey(
        recPrev,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        r => (r as any).financial_categories?.name ?? 'Sem categoria',
        r => Number(r.amount),
      )

      // Despesas realizadas: expenses paga por categoria
      const despesasReal = groupByKey(
        expReal,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        r => (r as any).financial_categories?.name ?? 'Sem categoria',
        r => Number(r.amount),
      )

      // Despesas previstas: expenses a_pagar por categoria
      const despesasPrev = groupByKey(
        expPrev,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        r => (r as any).financial_categories?.name ?? 'Sem categoria',
        r => Number(r.amount),
      )

      const totalRecReal = receitasReal.reduce((s, r) => s + r.total, 0)
      const totalRecPrev = receitasPrev.reduce((s, r) => s + r.total, 0)
      const totalExpReal = despesasReal.reduce((s, r) => s + r.total, 0)
      const totalExpPrev = despesasPrev.reduce((s, r) => s + r.total, 0)

      return {
        receitas: {
          realizadas: receitasReal,
          previstas:  receitasPrev,
          total_realizado: totalRecReal,
          total_previsto:  totalRecPrev,
        },
        despesas: {
          realizadas: despesasReal,
          previstas:  despesasPrev,
          total_realizado: totalExpReal,
          total_previsto:  totalExpPrev,
        },
        resultado_realizado:  totalRecReal - totalExpReal,
        resultado_projetado:  (totalRecReal + totalRecPrev) - (totalExpReal + totalExpPrev),
        periodo: { start: startDate, end: endDate },
      }
    },
    enabled: Boolean(churchId) && Boolean(startDate) && Boolean(endDate),
  })
}

// ── Conciliação Bancária (2D-1) ───────────────────────────────────────────────

export interface ReconciliationItem {
  id: string
  tipo: 'entrada' | 'saida'
  fonte: 'donation' | 'receivable' | 'expense'
  data: string
  descricao: string
  valor: number
  bank_account_id: string | null
  reconciled: boolean
  reconciled_at: string | null
}

export function useReconciliation(
  churchId: string,
  bankAccountId: string | null,
  startDate: string,
  endDate: string,
) {
  return useQuery({
    queryKey: ['reconciliation', churchId, bankAccountId, startDate, endDate],
    queryFn: async (): Promise<ReconciliationItem[]> => {
      const [donRes, expRes, recRes] = await Promise.all([
        supabase
          .from('donations')
          .select('id, confirmed_at, type, amount, bank_account_id, reconciled, reconciled_at')
          .eq('church_id', churchId)
          .eq('status', 'confirmed')
          .gte('confirmed_at', `${startDate}T00:00:00`)
          .lte('confirmed_at', `${endDate}T23:59:59`),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.from('expenses' as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select('id, expense_date, description, amount, bank_account_id, reconciled, reconciled_at' as any)
          .eq('church_id', churchId)
          .eq('status', 'paga')
          .gte('expense_date', startDate)
          .lte('expense_date', endDate),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        supabase.from('receivables' as any)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select('id, received_date, description, amount, bank_account_id, reconciled, reconciled_at' as any)
          .eq('church_id', churchId)
          .eq('status', 'recebido')
          .not('received_date', 'is', null)
          .gte('received_date', startDate)
          .lte('received_date', endDate),
      ])

      if (donRes.error) throw new Error(donRes.error.message)
      if (expRes.error) throw new Error(expRes.error.message)
      if (recRes.error) throw new Error(recRes.error.message)

      type DonRow = { id: string; confirmed_at: string | null; type: string; amount: number; bank_account_id: string | null; reconciled: boolean; reconciled_at: string | null }
      type ExpRow = { id: string; expense_date: string; description: string; amount: number; bank_account_id: string | null; reconciled: boolean; reconciled_at: string | null }
      type RecRow = { id: string; received_date: string | null; description: string; amount: number; bank_account_id: string | null; reconciled: boolean; reconciled_at: string | null }

      const donations   = (donRes.data ?? []) as unknown as DonRow[]
      const expenses    = (expRes.data  ?? []) as unknown as ExpRow[]
      const receivables = (recRes.data  ?? []) as unknown as RecRow[]

      const items: ReconciliationItem[] = []

      for (const d of donations) {
        if (bankAccountId && d.bank_account_id !== bankAccountId) continue
        items.push({
          id: d.id,
          tipo: 'entrada',
          fonte: 'donation',
          data: d.confirmed_at ? d.confirmed_at.slice(0, 10) : startDate,
          descricao: DONATION_TYPE_LABEL[d.type] ?? d.type,
          valor: Number(d.amount),
          bank_account_id: d.bank_account_id,
          reconciled: d.reconciled ?? false,
          reconciled_at: d.reconciled_at ?? null,
        })
      }

      for (const e of expenses) {
        if (bankAccountId && e.bank_account_id !== bankAccountId) continue
        items.push({
          id: e.id,
          tipo: 'saida',
          fonte: 'expense',
          data: e.expense_date,
          descricao: e.description,
          valor: Number(e.amount),
          bank_account_id: e.bank_account_id,
          reconciled: e.reconciled ?? false,
          reconciled_at: e.reconciled_at ?? null,
        })
      }

      for (const r of receivables) {
        if (bankAccountId && r.bank_account_id !== bankAccountId) continue
        items.push({
          id: r.id,
          tipo: 'entrada',
          fonte: 'receivable',
          data: r.received_date ?? startDate,
          descricao: r.description,
          valor: Number(r.amount),
          bank_account_id: r.bank_account_id,
          reconciled: r.reconciled ?? false,
          reconciled_at: r.reconciled_at ?? null,
        })
      }

      return items.sort((a, b) => a.data.localeCompare(b.data))
    },
    enabled: Boolean(churchId) && Boolean(startDate) && Boolean(endDate),
  })
}

export function useToggleReconciled() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      fonte,
      reconciled,
      churchId,
    }: {
      id: string
      fonte: 'donation' | 'receivable' | 'expense'
      reconciled: boolean
      churchId: string
    }) => {
      const table = fonte === 'donation' ? 'donations' : fonte === 'expense' ? 'expenses' : 'receivables'
      const now = new Date().toISOString()
      const { error } = await supabase
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .from(table as any)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ reconciled, reconciled_at: reconciled ? now : null } as any)
        .eq('id', id)
        .eq('church_id', churchId)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_data, { churchId }) => {
      void queryClient.invalidateQueries({ queryKey: ['reconciliation', churchId] })
    },
  })
}

export interface ApuracaoCultoRow {
  data: string         // YYYY-MM-DD
  culto_type: string
  dizimo: number
  oferta: number
  campanha: number
  missoes: number
  construcao: number
  total: number
}

export function useApuracaoCultos(churchId: string) {
  return useQuery({
    queryKey: ['apuracao-cultos', churchId],
    queryFn: async (): Promise<ApuracaoCultoRow[]> => {
      const { data, error } = await (supabase as any)
        .from('donations')
        .select('donation_date, created_at, culto_type, type, amount')
        .eq('church_id', churchId)
        .not('culto_type', 'is', null)
        .order('donation_date', { ascending: false })

      if (error) throw new Error((error as { message: string }).message)

      const raw = (data ?? []) as Array<{
        donation_date: string | null
        created_at: string
        culto_type: string
        type: string
        amount: string | number
      }>

      const map = new Map<string, ApuracaoCultoRow>()
      for (const row of raw) {
        const data_dia = (row.donation_date ?? row.created_at ?? '').slice(0, 10)
        const key = `${data_dia}__${row.culto_type}`
        const existing = map.get(key) ?? {
          data: data_dia,
          culto_type: row.culto_type,
          dizimo: 0, oferta: 0, campanha: 0, missoes: 0, construcao: 0, total: 0,
        }
        const amt = Number(row.amount)
        if (row.type === 'dizimo')    existing.dizimo    += amt
        if (row.type === 'oferta')    existing.oferta    += amt
        if (row.type === 'campanha')  existing.campanha  += amt
        if (row.type === 'missoes')   existing.missoes   += amt
        if (row.type === 'construcao')existing.construcao+= amt
        existing.total += amt
        map.set(key, existing)
      }

      return Array.from(map.values())
    },
    enabled: Boolean(churchId),
  })
}

// ── Relatório Mensal (F3-C) ───────────────────────────────────────────────────

export interface RelatorioMensalLinha {
  data: string        // 'YYYY-MM-DD' ou '' se nulo
  historico: string
  entrada: number | null
  saida: number | null
}

export interface RelatorioMensalData {
  saldo_anterior: number
  linhas: RelatorioMensalLinha[]
  total_entrada: number
  total_saida: number
  saldo_final: number
}

const DON_LABEL_REL: Record<string, string> = {
  dizimo: 'Dízimo', oferta: 'Oferta', campanha: 'Campanha',
  missoes: 'Missões', construcao: 'Construção',
}

export function useRelatorioMensal(
  churchId: string,
  unitId: string | null,   // null = sem filtro de unidade ("Todas")
  mes: string,             // 'YYYY-MM'
) {
  return useQuery({
    queryKey: ['relatorio-mensal', churchId, unitId, mes],
    queryFn: async (): Promise<RelatorioMensalData> => {
      const [y, m] = mes.split('-')
      const year  = parseInt(y, 10)
      const month = parseInt(m, 10)

      // Último dia do mês selecionado (aritmética de calendário — não é data de banco)
      const lastDayOfMonth = new Date(year, month, 0).getDate()
      const startOfMonth   = `${mes}-01`
      const endOfMonth     = `${mes}-${String(lastDayOfMonth).padStart(2, '0')}`

      // Último dia do mês anterior
      const prevYear     = month === 1 ? year - 1 : year
      const prevMonthNum = month === 1 ? 12 : month - 1
      const prevMonthStr = `${prevYear}-${String(prevMonthNum).padStart(2, '0')}`
      const lastDayOfPrev = new Date(year, month - 1, 0).getDate()
      const endOfPrevMonth = `${prevMonthStr}-${String(lastDayOfPrev).padStart(2, '0')}`

      // Helper: adiciona filtro de unidade apenas quando selecionada
      const addUnit = (q: any) => unitId ? q.eq('unit_id', unitId) : q

      const [
        bankRes,
        donPrevRes, recPrevRes, expPrevRes,
        donCurRes,  recCurRes,  expCurRes,
      ] = await Promise.all([
        // Saldo inicial das contas (bank_accounts não tem unit_id — inclui todas)
        supabase
          .from('bank_accounts' as any)
          .select('initial_balance')
          .eq('church_id', churchId)
          .eq('is_active', true),

        // Entradas até fim do mês anterior (para saldo anterior)
        addUnit(supabase.from('donations')
          .select('amount').eq('church_id', churchId)
          .eq('status', 'confirmed').lte('donation_date', endOfPrevMonth)),

        addUnit(supabase.from('receivables' as any)
          .select('amount').eq('church_id', churchId)
          .eq('status', 'recebido').not('received_date', 'is', null)
          .lte('received_date', endOfPrevMonth)),

        addUnit(supabase.from('expenses' as any)
          .select('amount').eq('church_id', churchId)
          .eq('status', 'paga').lte('expense_date', endOfPrevMonth)),

        // Doações do mês
        addUnit(supabase.from('donations')
          .select('donation_date, type, amount')
          .eq('church_id', churchId).eq('status', 'confirmed')
          .gte('donation_date', startOfMonth).lte('donation_date', endOfMonth)
          .order('donation_date', { ascending: true })),

        // Recebíveis do mês
        addUnit(supabase.from('receivables' as any)
          .select('received_date, description, amount')
          .eq('church_id', churchId).eq('status', 'recebido')
          .not('received_date', 'is', null)
          .gte('received_date', startOfMonth).lte('received_date', endOfMonth)
          .order('received_date', { ascending: true })),

        // Despesas do mês
        addUnit(supabase.from('expenses' as any)
          .select('expense_date, description, amount')
          .eq('church_id', churchId).eq('status', 'paga')
          .gte('expense_date', startOfMonth).lte('expense_date', endOfMonth)
          .order('expense_date', { ascending: true })),
      ])

      if (donPrevRes.error) throw new Error(donPrevRes.error.message)
      if (recPrevRes.error) throw new Error(recPrevRes.error.message)
      if (expPrevRes.error) throw new Error(expPrevRes.error.message)
      if (donCurRes.error)  throw new Error(donCurRes.error.message)
      if (recCurRes.error)  throw new Error(recCurRes.error.message)
      if (expCurRes.error)  throw new Error(expCurRes.error.message)

      // Saldo anterior: saldo inicial das contas + entradas acumuladas - saídas acumuladas
      const bankInitial = !bankRes.error
        ? ((bankRes.data ?? []) as any[]).reduce((s, b) => s + Number(b.initial_balance ?? 0), 0)
        : 0
      const donPrevTotal = ((donPrevRes.data ?? []) as any[]).reduce((s, d) => s + Number(d.amount), 0)
      const recPrevTotal = ((recPrevRes.data ?? []) as any[]).reduce((s, r) => s + Number(r.amount), 0)
      const expPrevTotal = ((expPrevRes.data ?? []) as any[]).reduce((s, e) => s + Number(e.amount), 0)
      const saldo_anterior = bankInitial + donPrevTotal + recPrevTotal - expPrevTotal

      // Linhas do mês
      const entradas: RelatorioMensalLinha[] = [
        ...((donCurRes.data ?? []) as any[]).map(d => ({
          data: String(d.donation_date ?? ''),
          historico: DON_LABEL_REL[String(d.type ?? '')] ?? String(d.type ?? 'Doação'),
          entrada: Number(d.amount),
          saida: null,
        })),
        ...((recCurRes.data ?? []) as any[]).map(r => ({
          data: String(r.received_date ?? ''),
          historico: String(r.description ?? 'Recebível'),
          entrada: Number(r.amount),
          saida: null,
        })),
      ]

      const saidas: RelatorioMensalLinha[] = ((expCurRes.data ?? []) as any[]).map(e => ({
        data: String(e.expense_date ?? ''),
        historico: String(e.description ?? 'Despesa'),
        entrada: null,
        saida: Number(e.amount),
      }))

      // Ordenar por data (string compare — sem new Date pra evitar timezone)
      const linhas = [...entradas, ...saidas].sort((a, b) => {
        const ad = a.data || '9999-99-99'
        const bd = b.data || '9999-99-99'
        return ad.localeCompare(bd)
      })

      const total_entrada = entradas.reduce((s, l) => s + (l.entrada ?? 0), 0)
      const total_saida   = saidas.reduce((s, l) => s + (l.saida ?? 0), 0)
      const saldo_final   = saldo_anterior + total_entrada - total_saida

      return { saldo_anterior, linhas, total_entrada, total_saida, saldo_final }
    },
    enabled: Boolean(churchId) && Boolean(mes),
  })
}

