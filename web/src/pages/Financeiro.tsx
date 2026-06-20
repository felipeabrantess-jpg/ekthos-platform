import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  useFinanceiroStats,
  useDonations,
  useCreateDonation,
  useConfirmDonation,
  useCreateCampaign,
  useUpdateCampaign,
  useFinancialCategories,
  useCreateCategory,
  useUpdateCategory,
  useBankAccounts,
  useCreateBankAccount,
  useUpdateBankAccount,
  useExpenses,
  useCreateExpense,
  useUpdateExpense,
  useReceivables,
  useCreateReceivable,
  useUpdateReceivable,
  useBankAccountBalances,
  uploadReceipt,
  deleteReceipt,
  getSignedReceiptUrl,
  type FinancialCategory,
  type BankAccount,
  type Expense,
  type Receivable,
  type BankAccountBalance,
} from '@/features/financeiro/hooks/useFinanceiro'
import { usePeople } from '@/features/people/hooks/usePeople'
import Spinner from '@/components/ui/Spinner'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import type { DonationType, DonationStatus, PaymentMethod, FinancialCampaign } from '@/lib/types/joins'

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

type BadgeVariant = 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'purple'

function statusBadgeVariant(status: DonationStatus): BadgeVariant {
  const map: Record<DonationStatus, BadgeVariant> = {
    pending: 'yellow',
    confirmed: 'green',
    failed: 'red',
    refunded: 'gray',
    cancelled: 'red',
  }
  return map[status]
}

function statusLabel(status: DonationStatus): string {
  const map: Record<DonationStatus, string> = {
    pending: 'Pendente',
    confirmed: 'Confirmado',
    failed: 'Falhou',
    refunded: 'Estornado',
    cancelled: 'Cancelado',
  }
  return map[status]
}

function typeLabel(type: DonationType): string {
  const map: Record<DonationType, string> = {
    dizimo: 'Dízimo',
    oferta: 'Oferta',
    campanha: 'Campanha',
    missoes: 'Missões',
    construcao: 'Construção',
  }
  return map[type]
}

function accountTypeLabel(type: string): string {
  const map: Record<string, string> = {
    conta_corrente: 'Conta Corrente',
    poupanca: 'Poupança',
    caixa: 'Caixa',
    investimento: 'Investimento',
  }
  return map[type] ?? type
}

function categoryTypeLabel(type: string): string {
  const map: Record<string, string> = {
    income: 'Entrada',
    expense: 'Saída',
    both: 'Ambos',
  }
  return map[type] ?? type
}

interface KPICardProps {
  label: string
  value: string
  sub?: string
  valueColor?: string
}

function KPICard({ label, value, sub, valueColor }: KPICardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valueColor ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

interface CampaignProgressProps {
  campaign: FinancialCampaign
  raised: number
  onEdit?: (campaign: FinancialCampaign) => void
}

function CampaignProgress({ campaign, raised, onEdit }: CampaignProgressProps) {
  const goal = campaign.goal_amount ?? 0
  const pct = goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : 0

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-800">{campaign.name}</span>
        <div className="flex items-center gap-3">
          <span className="text-gray-500">{BRL.format(raised)} / {goal > 0 ? BRL.format(goal) : '∞'}</span>
          {onEdit && (
            <button
              type="button"
              onClick={() => onEdit(campaign)}
              className="text-xs text-gray-400 hover:text-primary transition-colors"
            >
              Editar
            </button>
          )}
        </div>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400">{pct}% da meta</p>
    </div>
  )
}

interface TypeBreakdownProps {
  byType: Record<DonationType, number>
  total: number
}

function TypeBreakdown({ byType, total }: TypeBreakdownProps) {
  const types: DonationType[] = ['dizimo', 'oferta', 'campanha', 'missoes', 'construcao']

  return (
    <div className="space-y-3">
      {types.map((type) => {
        const amount = byType[type] ?? 0
        const pct = total > 0 ? Math.round((amount / total) * 100) : 0
        return (
          <div key={type} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-700">{typeLabel(type)}</span>
              <span className="font-medium text-gray-900">{BRL.format(amount)}</span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

interface CreateDonationModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  campaigns?: FinancialCampaign[]
  bankAccounts?: BankAccount[]
}

function CreateDonationModal({ open, onClose, churchId, campaigns = [], bankAccounts = [] }: CreateDonationModalProps) {
  const createDonation = useCreateDonation()
  const { data: peopleList } = usePeople(churchId, {})
  const [form, setForm] = useState({
    personId: '',
    type: 'dizimo' as DonationType,
    amount: '',
    payment_method: '' as PaymentMethod | '',
    notes: '',
    status: 'pending' as DonationStatus,
    campaign_id: '',
    bank_account_id: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(form.amount.replace(',', '.'))
    if (isNaN(amt) || amt <= 0) {
      setError('Informe um valor válido.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      await createDonation.mutateAsync({
        church_id: churchId,
        person_id: form.personId.trim() || null,
        type: form.type,
        amount: amt,
        payment_method: (form.payment_method as PaymentMethod) || null,
        notes: form.notes.trim() || null,
        status: form.status,
        campaign_id: form.campaign_id || null,
        bank_account_id: form.bank_account_id || null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar doação')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Registrar Doação">
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pessoa (opcional)</label>
          <select
            value={form.personId}
            onChange={(e) => setForm((p) => ({ ...p, personId: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Anônimo / Não identificado</option>
            {(peopleList ?? []).map(person => (
              <option key={person.id} value={person.id}>
                {person.name ?? person.email ?? 'Sem nome'}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
            <select
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as DonationType }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            >
              <option value="dizimo">Dízimo</option>
              <option value="oferta">Oferta</option>
              <option value="campanha">Campanha</option>
              <option value="missoes">Missões</option>
              <option value="construcao">Construção</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
            <Input
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0,00"
              required
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value as PaymentMethod | '' }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Não informado</option>
              <option value="pix">PIX</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="boleto">Boleto</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="transferencia">Transferência</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as DonationStatus }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="pending">Pendente</option>
              <option value="confirmed">Confirmado</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
          <Input
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Observações adicionais..."
          />
        </div>
        {campaigns.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Campanha (opcional)</label>
            <select
              value={form.campaign_id}
              onChange={(e) => setForm((p) => ({ ...p, campaign_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Nenhuma campanha</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        {bankAccounts.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conta de Destino (opcional)</label>
            <select
              value={form.bank_account_id}
              onChange={(e) => setForm((p) => ({ ...p, bank_account_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Não informado</option>
              {bankAccounts.filter(a => a.is_active).map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.amount}>
            {submitting ? 'Salvando...' : 'Registrar'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface ExpenseModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  expense?: Expense | null
  categories: FinancialCategory[]
  bankAccounts: BankAccount[]
}

function ExpenseModal({ open, onClose, churchId, expense, categories, bankAccounts }: ExpenseModalProps) {
  const createExpense = useCreateExpense()
  const updateExpense = useUpdateExpense()
  const isEdit = Boolean(expense)

  const todayISO = new Date().toISOString().split('T')[0]

  const [form, setForm] = useState({
    description: expense?.description ?? '',
    amount: expense?.amount != null ? String(expense.amount) : '',
    supplier: expense?.supplier ?? '',
    category_id: expense?.category_id ?? '',
    bank_account_id: expense?.bank_account_id ?? '',
    expense_date: expense?.expense_date ?? todayISO,
    due_date: expense?.due_date ?? '',
    status: (expense?.status ?? 'a_pagar') as 'paga' | 'a_pagar',
    payment_method: expense?.payment_method ?? '',
  })
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [removeReceipt, setRemoveReceipt] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleViewExistingReceipt() {
    if (!expense?.receipt_path) return
    try {
      const url = await getSignedReceiptUrl(expense.receipt_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      setError('Não foi possível gerar o link do comprovante.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(form.amount.replace(',', '.'))
    if (isNaN(amt) || amt <= 0) { setError('Informe um valor válido.'); return }
    if (!form.description.trim()) { setError('Informe a descrição.'); return }
    setSubmitting(true)
    setError(null)

    let finalReceiptPath: string | null = isEdit ? (expense?.receipt_path ?? null) : null

    if (removeReceipt && expense?.receipt_path) {
      try { await deleteReceipt(expense.receipt_path) } catch { /* best-effort */ }
      finalReceiptPath = null
    }

    if (receiptFile) {
      if (isEdit && expense?.receipt_path && !removeReceipt) {
        try { await deleteReceipt(expense.receipt_path) } catch { /* best-effort */ }
      }
      try {
        finalReceiptPath = await uploadReceipt(receiptFile, churchId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro no upload do comprovante')
        setSubmitting(false)
        return
      }
    }

    try {
      const payload: Parameters<typeof createExpense.mutateAsync>[0] = {
        church_id: churchId,
        description: form.description.trim(),
        amount: amt,
        supplier: form.supplier.trim() || null,
        category_id: form.category_id || null,
        bank_account_id: form.bank_account_id || null,
        expense_date: form.expense_date,
        due_date: form.due_date || null,
        status: form.status,
        payment_method: (form.payment_method as PaymentMethod) || null,
        receipt_path: finalReceiptPath,
      }
      if (isEdit && expense) {
        await updateExpense.mutateAsync({ id: expense.id, ...payload })
      } else {
        await createExpense.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar despesa')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Despesa' : 'Registrar Despesa'}>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
          <Input
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Ex: Conta de luz"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
            <Input
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0,00"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fornecedor</label>
            <Input
              value={form.supplier}
              onChange={(e) => setForm((p) => ({ ...p, supplier: e.target.value }))}
              placeholder="Ex: Copel"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Sem categoria</option>
              {categories.filter(c => c.is_active && c.type !== 'income').map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conta Bancária</label>
            <select
              value={form.bank_account_id}
              onChange={(e) => setForm((p) => ({ ...p, bank_account_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Sem conta</option>
              {bankAccounts.filter(a => a.is_active).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data *</label>
            <input
              type="date"
              value={form.expense_date}
              onChange={(e) => setForm((p) => ({ ...p, expense_date: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
            <select
              value={form.status}
              onChange={(e) => setForm((p) => ({ ...p, status: e.target.value as 'paga' | 'a_pagar' }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="a_pagar">A Pagar</option>
              <option value="paga">Paga</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
            <select
              value={form.payment_method}
              onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Não informado</option>
              <option value="pix">PIX</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="boleto">Boleto</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="transferencia">Transferência</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        </div>
        {/* Comprovante (SF3) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Comprovante (opcional)</label>
          {isEdit && expense?.receipt_path && !removeReceipt && !receiptFile && (
            <div className="flex items-center gap-2 mb-2 p-2 bg-gray-50 rounded-lg border border-gray-100">
              <span className="text-xs text-gray-600 flex-1">Comprovante anexado</span>
              <button
                type="button"
                onClick={() => { void handleViewExistingReceipt() }}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                Ver
              </button>
              <button
                type="button"
                onClick={() => setRemoveReceipt(true)}
                className="text-xs text-red-500 hover:text-red-600"
              >
                Remover
              </button>
            </div>
          )}
          {removeReceipt && (
            <p className="text-xs text-orange-600 mb-2">
              Comprovante será removido ao salvar.{' '}
              <button type="button" className="underline" onClick={() => setRemoveReceipt(false)}>Desfazer</button>
            </p>
          )}
          {!removeReceipt && (
            <div>
              <input
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  if (f && f.size > 10 * 1024 * 1024) {
                    setError('Arquivo muito grande. Máximo 10 MB.')
                    e.target.value = ''
                    return
                  }
                  setReceiptFile(f)
                  setError(null)
                }}
                className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 file:text-xs file:font-medium file:text-gray-700 file:bg-white hover:file:bg-gray-50 file:cursor-pointer"
              />
              <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP ou PDF · máx 10 MB</p>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.description.trim() || !form.amount}>
            {submitting ? 'Salvando...' : (isEdit ? 'Salvar Alterações' : 'Registrar Despesa')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface DarBaixaModalProps {
  open: boolean
  onClose: () => void
  expense: Expense
  bankAccounts: BankAccount[]
}

function DarBaixaModal({ open, onClose, expense, bankAccounts }: DarBaixaModalProps) {
  const updateExpense = useUpdateExpense()
  const todayISO = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    payment_date: todayISO,
    bank_account_id: expense.bank_account_id ?? '',
    payment_method: expense.payment_method ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.payment_date) { setError('Informe a data de pagamento.'); return }
    setSubmitting(true)
    setError(null)
    try {
      await updateExpense.mutateAsync({
        id: expense.id,
        church_id: expense.church_id,
        description: expense.description,
        amount: expense.amount,
        supplier: expense.supplier ?? null,
        category_id: expense.category_id ?? null,
        bank_account_id: form.bank_account_id || null,
        expense_date: form.payment_date,
        due_date: expense.due_date ?? null,
        status: 'paga',
        payment_method: (form.payment_method as PaymentMethod) || null,
        receipt_path: expense.receipt_path ?? null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao dar baixa')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Dar Baixa — ${expense.description}`}>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <p className="text-sm text-gray-600">
          Valor: <span className="font-semibold text-red-600">{BRL.format(expense.amount)}</span>
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data de Pagamento *</label>
          <input
            type="date"
            value={form.payment_date}
            onChange={(e) => setForm((p) => ({ ...p, payment_date: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Conta Debitada</label>
          <select
            value={form.bank_account_id}
            onChange={(e) => setForm((p) => ({ ...p, bank_account_id: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Sem conta</option>
            {bankAccounts.filter(a => a.is_active).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Forma de Pagamento</label>
          <select
            value={form.payment_method}
            onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Não informado</option>
            <option value="pix">PIX</option>
            <option value="cartao_credito">Cartão de Crédito</option>
            <option value="cartao_debito">Cartão de Débito</option>
            <option value="boleto">Boleto</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="transferencia">Transferência</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.payment_date}>
            {submitting ? 'Salvando...' : 'Confirmar Baixa'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface ReceivableModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  receivable?: Receivable | null
  categories: FinancialCategory[]
  bankAccounts: BankAccount[]
}

function ReceivableModal({ open, onClose, churchId, receivable, categories, bankAccounts }: ReceivableModalProps) {
  const createReceivable = useCreateReceivable()
  const updateReceivable = useUpdateReceivable()
  const isEdit = Boolean(receivable)

  const [form, setForm] = useState({
    description: receivable?.description ?? '',
    amount: receivable?.amount != null ? String(receivable.amount) : '',
    payer_name: receivable?.payer_name ?? '',
    category_id: receivable?.category_id ?? '',
    bank_account_id: receivable?.bank_account_id ?? '',
    due_date: receivable?.due_date ?? '',
    notes: receivable?.notes ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const amt = parseFloat(form.amount.replace(',', '.'))
    if (isNaN(amt) || amt <= 0) { setError('Informe um valor válido.'); return }
    if (!form.description.trim()) { setError('Informe a descrição.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const payload: Parameters<typeof createReceivable.mutateAsync>[0] = {
        church_id: churchId,
        description: form.description.trim(),
        amount: amt,
        payer_name: form.payer_name.trim() || null,
        category_id: form.category_id || null,
        bank_account_id: form.bank_account_id || null,
        due_date: form.due_date || null,
        notes: form.notes.trim() || null,
      }
      if (isEdit && receivable) {
        await updateReceivable.mutateAsync({ id: receivable.id, ...payload })
      } else {
        await createReceivable.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Entrada Prevista' : 'Lançar Entrada Prevista'}>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição *</label>
          <Input
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Ex: Dízimo de João, Aluguel do salão"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
            <Input
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              placeholder="0,00"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Pagador</label>
            <Input
              value={form.payer_name}
              onChange={(e) => setForm((p) => ({ ...p, payer_name: e.target.value }))}
              placeholder="Ex: João Silva"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm((p) => ({ ...p, category_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Sem categoria</option>
              {categories.filter(c => c.is_active && c.type !== 'expense').map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Conta de Destino</label>
            <select
              value={form.bank_account_id}
              onChange={(e) => setForm((p) => ({ ...p, bank_account_id: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">Sem conta</option>
              {bankAccounts.filter(a => a.is_active).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento</label>
          <input
            type="date"
            value={form.due_date}
            onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
          <Input
            value={form.notes}
            onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            placeholder="Observações opcionais..."
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.description.trim() || !form.amount}>
            {submitting ? 'Salvando...' : (isEdit ? 'Salvar Alterações' : 'Lançar')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface ConfirmReceivableModalProps {
  open: boolean
  onClose: () => void
  receivable: Receivable
  bankAccounts: BankAccount[]
  churchId: string
}

function ConfirmReceivableModal({ open, onClose, receivable, bankAccounts, churchId }: ConfirmReceivableModalProps) {
  const updateReceivable = useUpdateReceivable()
  const todayISO = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({
    received_date: todayISO,
    bank_account_id: receivable.bank_account_id ?? '',
  })
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.received_date) { setError('Informe a data de recebimento.'); return }
    setSubmitting(true)
    setError(null)

    let finalReceiptPath = receivable.receipt_path ?? null
    if (receiptFile) {
      try {
        finalReceiptPath = await uploadReceipt(receiptFile, churchId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro no upload do comprovante')
        setSubmitting(false)
        return
      }
    }

    try {
      await updateReceivable.mutateAsync({
        id: receivable.id,
        church_id: receivable.church_id,
        description: receivable.description,
        amount: receivable.amount,
        due_date: receivable.due_date ?? null,
        payer_name: receivable.payer_name ?? null,
        person_id: receivable.person_id ?? null,
        status: 'recebido',
        received_date: form.received_date,
        bank_account_id: form.bank_account_id || receivable.bank_account_id || null,
        category_id: receivable.category_id ?? null,
        receipt_path: finalReceiptPath,
        notes: receivable.notes ?? null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao confirmar recebimento')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={`Confirmar Recebimento — ${receivable.description}`}>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <p className="text-sm text-gray-600">
          Valor esperado: <span className="font-semibold text-green-600">{BRL.format(receivable.amount)}</span>
          {receivable.payer_name && <span className="ml-2 text-gray-500">· {receivable.payer_name}</span>}
        </p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data de Recebimento *</label>
          <input
            type="date"
            value={form.received_date}
            onChange={(e) => setForm((p) => ({ ...p, received_date: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Conta de Crédito</label>
          <select
            value={form.bank_account_id}
            onChange={(e) => setForm((p) => ({ ...p, bank_account_id: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">Sem conta</option>
            {bankAccounts.filter(a => a.is_active).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Comprovante (opcional)</label>
          <input
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null
              if (f && f.size > 10 * 1024 * 1024) {
                setError('Arquivo muito grande. Máximo 10 MB.')
                e.target.value = ''
                return
              }
              setReceiptFile(f)
              setError(null)
            }}
            className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-gray-200 file:text-xs file:font-medium file:text-gray-700 file:bg-white hover:file:bg-gray-50 file:cursor-pointer"
          />
          <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP ou PDF · máx 10 MB</p>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.received_date}>
            {submitting ? 'Confirmando...' : 'Confirmar Recebimento'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface CategoryModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  category?: FinancialCategory | null
}

function CategoryModal({ open, onClose, churchId, category }: CategoryModalProps) {
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const isEdit = Boolean(category)

  const [form, setForm] = useState({
    name: category?.name ?? '',
    type: (category?.type ?? 'expense') as 'income' | 'expense' | 'both',
    color: category?.color ?? '#6B7280',
    is_active: category?.is_active ?? true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Informe o nome.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        church_id: churchId,
        name: form.name.trim(),
        type: form.type,
        color: form.color || null,
        is_active: form.is_active,
      }
      if (isEdit && category) {
        await updateCategory.mutateAsync({ id: category.id, ...payload })
      } else {
        await createCategory.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar categoria')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Categoria' : 'Nova Categoria'}>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
          <Input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Ex: Manutenção"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
            <select
              value={form.type}
              onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as 'income' | 'expense' | 'both' }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="expense">Saída</option>
              <option value="income">Entrada</option>
              <option value="both">Ambos</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cor</label>
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm((p) => ({ ...p, color: e.target.value }))}
              className="w-full h-[38px] rounded-lg border border-gray-200 px-1 py-1 cursor-pointer"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="cat_is_active"
            checked={form.is_active}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            className="rounded border-gray-300"
          />
          <label htmlFor="cat_is_active" className="text-sm text-gray-700">Categoria ativa</label>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.name.trim()}>
            {submitting ? 'Salvando...' : (isEdit ? 'Salvar Alterações' : 'Criar Categoria')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface BankAccountModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  account?: BankAccount | null
}

function BankAccountModal({ open, onClose, churchId, account }: BankAccountModalProps) {
  const createBank = useCreateBankAccount()
  const updateBank = useUpdateBankAccount()
  const isEdit = Boolean(account)

  const [form, setForm] = useState({
    name: account?.name ?? '',
    bank_name: account?.bank_name ?? '',
    account_type: (account?.account_type ?? 'conta_corrente') as 'conta_corrente' | 'poupanca' | 'caixa' | 'investimento',
    initial_balance: account?.initial_balance != null ? String(account.initial_balance) : '0',
    is_active: account?.is_active ?? true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setError('Informe o nome.'); return }
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        church_id: churchId,
        name: form.name.trim(),
        bank_name: form.bank_name.trim() || null,
        account_type: form.account_type,
        initial_balance: parseFloat(form.initial_balance.replace(',', '.')) || 0,
        is_active: form.is_active,
      }
      if (isEdit && account) {
        await updateBank.mutateAsync({ id: account.id, ...payload })
      } else {
        await createBank.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar conta')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Conta' : 'Nova Conta Bancária'}>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
          <Input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Ex: Conta Principal"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Banco</label>
            <Input
              value={form.bank_name}
              onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))}
              placeholder="Ex: Bradesco"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={form.account_type}
              onChange={(e) => setForm((p) => ({ ...p, account_type: e.target.value as typeof form.account_type }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="conta_corrente">Conta Corrente</option>
              <option value="poupanca">Poupança</option>
              <option value="caixa">Caixa</option>
              <option value="investimento">Investimento</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Saldo Inicial (R$)</label>
          <Input
            value={form.initial_balance}
            onChange={(e) => setForm((p) => ({ ...p, initial_balance: e.target.value }))}
            placeholder="0,00"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="bank_is_active"
            checked={form.is_active}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            className="rounded border-gray-300"
          />
          <label htmlFor="bank_is_active" className="text-sm text-gray-700">Conta ativa</label>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.name.trim()}>
            {submitting ? 'Salvando...' : (isEdit ? 'Salvar Alterações' : 'Criar Conta')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

interface CampaignModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  campaign?: FinancialCampaign | null
}

function CampaignModal({ open, onClose, churchId, campaign }: CampaignModalProps) {
  const createCampaign = useCreateCampaign()
  const updateCampaign = useUpdateCampaign()
  const isEdit = Boolean(campaign)

  const [form, setForm] = useState({
    name: campaign?.name ?? '',
    goal_amount: campaign?.goal_amount != null ? String(campaign.goal_amount) : '',
    description: campaign?.description ?? '',
    start_date: campaign?.start_date ?? '',
    end_date: campaign?.end_date ?? '',
    is_active: campaign?.is_active ?? true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const goal = parseFloat(form.goal_amount.replace(',', '.'))
    if (isNaN(goal) || goal <= 0) {
      setError('Informe uma meta válida.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const payload = {
        church_id: churchId,
        name: form.name.trim(),
        description: form.description.trim() || null,
        goal_amount: goal,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        is_active: form.is_active,
      }
      if (isEdit && campaign) {
        await updateCampaign.mutateAsync({ id: campaign.id, ...payload })
      } else {
        await createCampaign.mutateAsync(payload)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar campanha')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar Campanha' : 'Nova Campanha'}>
      <form onSubmit={(e) => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
          <Input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="Ex: Reforma do Templo"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Meta (R$) *</label>
          <Input
            value={form.goal_amount}
            onChange={(e) => setForm((p) => ({ ...p, goal_amount: e.target.value }))}
            placeholder="0,00"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
          <Input
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Descrição opcional..."
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Início</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data Fim</label>
            <input
              type="date"
              value={form.end_date}
              onChange={(e) => setForm((p) => ({ ...p, end_date: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="campaign_is_active"
            checked={form.is_active}
            onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
            className="rounded border-gray-300"
          />
          <label htmlFor="campaign_is_active" className="text-sm text-gray-700">Campanha ativa</label>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={submitting || !form.name.trim() || !form.goal_amount}>
            {submitting ? 'Salvando...' : (isEdit ? 'Salvar Alterações' : 'Criar Campanha')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default function Financeiro() {
  const { churchId } = useAuth()
  const [createOpen, setCreateOpen] = useState(false)
  const [campaignModalOpen, setCampaignModalOpen] = useState(false)
  const [editingCampaign, setEditingCampaign] = useState<FinancialCampaign | null>(null)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<FinancialCategory | null>(null)
  const [bankModalOpen, setBankModalOpen] = useState(false)
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [expenseTab, setExpenseTab] = useState<'a_pagar' | 'paga'>('a_pagar')
  const [darBaixaOpen, setDarBaixaOpen] = useState(false)
  const [darBaixaExpense, setDarBaixaExpense] = useState<Expense | null>(null)
  const [receivableModalOpen, setReceivableModalOpen] = useState(false)
  const [editingReceivable, setEditingReceivable] = useState<Receivable | null>(null)
  const [confirmReceivableOpen, setConfirmReceivableOpen] = useState(false)
  const [confirmingReceivable, setConfirmingReceivable] = useState<Receivable | null>(null)
  const confirmDonation = useConfirmDonation()

  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useFinanceiroStats(churchId ?? '')
  const { data: donations, isLoading: donationsLoading, isError: donationsError, refetch: refetchDonations } = useDonations(churchId ?? '')
  const { data: categories } = useFinancialCategories(churchId ?? '')
  const { data: bankAccounts } = useBankAccounts(churchId ?? '')
  const { data: expenses } = useExpenses(churchId ?? '')
  const { data: receivables } = useReceivables(churchId ?? '')
  const { data: balances } = useBankAccountBalances(churchId ?? '')

  if (!churchId) return <ErrorState message="Igreja não identificada." />

  const isLoading = statsLoading || donationsLoading
  const isError = statsError || donationsError

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    )
  }

  if (isError) {
    return (
      <ErrorState
        message="Não foi possível carregar os dados financeiros."
        onRetry={() => { void refetchStats(); void refetchDonations() }}
      />
    )
  }

  const todayISO = new Date().toISOString().split('T')[0]
  const totalByType = Object.values(stats?.byType ?? {}).reduce((sum, v) => sum + v, 0)
  const totalAPagar = (expenses ?? []).filter(e => e.status === 'a_pagar').reduce((sum, e) => sum + Number(e.amount), 0)
  const totalAReceber = (receivables ?? []).filter(r => r.status === 'a_receber').reduce((sum, r) => sum + Number(r.amount), 0)

  const expensesToPayCount = (expenses ?? []).filter(e => e.status === 'a_pagar').length
  const filteredExpenses = (expenses ?? [])
    .filter(e => e.status === expenseTab)
    .sort((a, b) => {
      if (expenseTab === 'a_pagar') {
        if (!a.due_date && !b.due_date) return 0
        if (!a.due_date) return 1
        if (!b.due_date) return -1
        return a.due_date.localeCompare(b.due_date)
      }
      return b.expense_date.localeCompare(a.expense_date)
    })

  async function handleConfirm(id: string) {
    await confirmDonation.mutateAsync({ id, churchId: churchId! })
  }

  async function handleViewReceipt(path: string) {
    try {
      const url = await getSignedReceiptUrl(path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch {
      // silencia — usuário vê erro no browser
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-500 mt-1">Gestão de dízimos, ofertas e despesas</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ Registrar Doação</Button>
      </div>

      {/* KPI Cards — 6 cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard
          label="Total Confirmado (Mês)"
          value={BRL.format(stats?.totalThisMonth ?? 0)}
        />
        <KPICard
          label="Total Geral Confirmado"
          value={BRL.format(stats?.totalConfirmedAllTime ?? 0)}
        />
        <KPICard
          label="Pendentes"
          value={String(stats?.countPending ?? 0)}
          sub="aguardando confirmação"
        />
        <KPICard
          label="Dízimos (Mês)"
          value={BRL.format(stats?.dizimoThisMonth ?? 0)}
        />
        <KPICard
          label="Total a Pagar"
          value={BRL.format(totalAPagar)}
          sub={expensesToPayCount > 0 ? `${expensesToPayCount} despesa${expensesToPayCount > 1 ? 's' : ''}` : undefined}
          valueColor="text-red-600"
        />
        <KPICard
          label="Total a Receber"
          value={BRL.format(totalAReceber)}
          valueColor="text-green-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Type Breakdown */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Distribuição por Tipo</h2>
          <TypeBreakdown byType={stats?.byType ?? { dizimo: 0, oferta: 0, campanha: 0, missoes: 0, construcao: 0 }} total={totalByType} />
        </div>

        {/* Campaigns */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Campanhas Ativas</h2>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => { setEditingCampaign(null); setCampaignModalOpen(true) }}
            >
              + Nova Campanha
            </Button>
          </div>
          {(stats?.campaigns ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma campanha ativa.</p>
          ) : (
            <div className="space-y-4">
              {(stats?.campaigns ?? []).map((campaign) => {
                const raised = stats?.raisedByCampaign?.[campaign.id] ?? 0
                return (
                  <CampaignProgress
                    key={campaign.id}
                    campaign={campaign}
                    raised={raised}
                    onEdit={(c) => { setEditingCampaign(c); setCampaignModalOpen(true) }}
                  />
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Contas & Categorias */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contas Bancárias */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Contas Bancárias</h2>
            <Button size="sm" variant="secondary" onClick={() => { setEditingBank(null); setBankModalOpen(true) }}>
              + Nova Conta
            </Button>
          </div>
          {(bankAccounts ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma conta cadastrada.</p>
          ) : (
            <div className="space-y-2">
              {(bankAccounts ?? []).map((acc) => {
                const bal = (balances ?? []).find((b: BankAccountBalance) => b.id === acc.id)
                return (
                  <div key={acc.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{acc.name}</p>
                      <p className="text-xs text-gray-400">
                        {acc.bank_name ? `${acc.bank_name} · ` : ''}
                        {accountTypeLabel(acc.account_type)}
                        {!acc.is_active && ' · Inativa'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-gray-900">
                          {BRL.format(bal?.saldo_atual ?? acc.initial_balance)}
                        </p>
                        {bal && (
                          <p className="text-xs text-gray-400">saldo atual</p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => { setEditingBank(acc); setBankModalOpen(true) }}
                        className="text-xs text-gray-400 hover:text-primary transition-colors"
                      >
                        Editar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Categorias */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700">Categorias</h2>
            <Button size="sm" variant="secondary" onClick={() => { setEditingCategory(null); setCategoryModalOpen(true) }}>
              + Nova Categoria
            </Button>
          </div>
          {(categories ?? []).length === 0 ? (
            <p className="text-sm text-gray-400">Nenhuma categoria cadastrada.</p>
          ) : (
            <div className="space-y-2">
              {(categories ?? []).map((cat) => (
                <div key={cat.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: cat.color ?? '#6B7280' }}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{cat.name}</p>
                      <p className="text-xs text-gray-400">
                        {categoryTypeLabel(cat.type)}
                        {!cat.is_active && ' · Inativa'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setEditingCategory(cat); setCategoryModalOpen(true) }}
                    className="text-xs text-gray-400 hover:text-primary transition-colors"
                  >
                    Editar
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Entradas Previstas (Contas a Receber) */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">Entradas Previstas</h2>
          <Button size="sm" variant="secondary" onClick={() => { setEditingReceivable(null); setReceivableModalOpen(true) }}>
            + Lançar Entrada Prevista
          </Button>
        </div>
        {(receivables ?? []).length === 0 ? (
          <EmptyState
            title="Nenhuma entrada prevista"
            description="Lance entradas previstas (dízimos prometidos, aluguéis, ressarcimentos) aqui."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pagador</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Vencimento</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(receivables ?? []).map((rec: Receivable) => {
                  const isOverdue = rec.status === 'a_receber' && rec.due_date != null && rec.due_date < todayISO
                  return (
                    <tr key={rec.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{rec.description}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{rec.payer_name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-green-600">+ {BRL.format(rec.amount)}</td>
                      <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        {rec.due_date ? (
                          <span>
                            {new Date(rec.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                            {isOverdue && <span className="block text-xs text-red-500">Vencida</span>}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          label={rec.status === 'recebido' ? 'Recebido' : 'A Receber'}
                          variant={rec.status === 'recebido' ? 'green' : 'yellow'}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {rec.status === 'a_receber' && (
                            <button
                              type="button"
                              onClick={() => { setConfirmingReceivable(rec); setConfirmReceivableOpen(true) }}
                              className="text-xs text-green-600 hover:text-green-700 font-medium"
                            >
                              Confirmar
                            </button>
                          )}
                          {rec.receipt_path && (
                            <button
                              type="button"
                              onClick={() => { void handleViewReceipt(rec.receipt_path!) }}
                              className="text-xs text-blue-500 hover:text-blue-700 font-medium"
                            >
                              Comprovante
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { setEditingReceivable(rec); setReceivableModalOpen(true) }}
                            className="text-xs text-gray-400 hover:text-primary transition-colors"
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Saídas / Despesas — com abas A Pagar / Pagas */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-700">Saídas / Despesas</h2>
            <div className="flex gap-0.5 bg-gray-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setExpenseTab('a_pagar')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  expenseTab === 'a_pagar'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                A Pagar
                {expensesToPayCount > 0 && (
                  <span className="ml-1.5 bg-yellow-100 text-yellow-700 rounded-full px-1.5 text-xs">
                    {expensesToPayCount}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setExpenseTab('paga')}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  expenseTab === 'paga'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Pagas
              </button>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={() => { setEditingExpense(null); setExpenseModalOpen(true) }}>
            + Registrar Despesa
          </Button>
        </div>
        {filteredExpenses.length === 0 ? (
          <EmptyState
            title={expenseTab === 'a_pagar' ? 'Nenhuma despesa a pagar' : 'Nenhuma despesa paga'}
            description={expenseTab === 'a_pagar' ? "Registre despesas usando o botão 'Registrar Despesa'." : 'Despesas pagas aparecem aqui após dar baixa.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {expenseTab === 'a_pagar' ? 'Vencimento' : 'Data'}
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fornecedor</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoria</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Conta</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredExpenses.map((exp: Expense) => {
                  const cat = (categories ?? []).find((c: FinancialCategory) => c.id === exp.category_id)
                  const acc = (bankAccounts ?? []).find((a: BankAccount) => a.id === exp.bank_account_id)
                  const isOverdue = exp.status === 'a_pagar' && exp.due_date != null && exp.due_date < todayISO
                  return (
                    <tr key={exp.id} className="hover:bg-gray-50 transition-colors">
                      <td className={`px-4 py-3 text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                        {expenseTab === 'a_pagar' ? (
                          exp.due_date ? (
                            <span>
                              {new Date(exp.due_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                              {isOverdue && <span className="block text-xs text-red-500">Vencida</span>}
                            </span>
                          ) : <span className="text-gray-400">—</span>
                        ) : (
                          new Date(exp.expense_date + 'T00:00:00').toLocaleDateString('pt-BR')
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{exp.description}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{exp.supplier ?? '—'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {cat ? (
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color ?? '#6B7280' }} />
                            {cat.name}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{acc?.name ?? '—'}</td>
                      <td className="px-4 py-3 text-sm font-medium text-red-600">- {BRL.format(exp.amount)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {exp.status === 'a_pagar' && (
                            <button
                              type="button"
                              onClick={() => { setDarBaixaExpense(exp); setDarBaixaOpen(true) }}
                              className="text-xs text-primary hover:text-primary/80 font-medium"
                            >
                              Dar Baixa
                            </button>
                          )}
                          {exp.receipt_path && (
                            <button
                              type="button"
                              onClick={() => { void handleViewReceipt(exp.receipt_path!) }}
                              className="text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium"
                            >
                              Comprovante
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => { setEditingExpense(exp); setExpenseModalOpen(true) }}
                            className="text-xs text-gray-400 hover:text-primary transition-colors"
                          >
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Donations Table */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-700">Últimas Doações</h2>
        </div>
        {(donations ?? []).length === 0 ? (
          <EmptyState
            title="Nenhuma doação registrada"
            description="Registre a primeira doação clicando em 'Registrar Doação'."
            action={<Button onClick={() => setCreateOpen(true)}>+ Registrar Doação</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Pessoa</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Valor</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(donations ?? []).map((d) => (
                  <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {(d as typeof d & { people?: { name: string | null } | null }).people?.name ?? 'Anônimo'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{typeLabel(d.type as DonationType)}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{BRL.format(d.amount)}</td>
                    <td className="px-4 py-3">
                      <Badge label={statusLabel(d.status as DonationStatus)} variant={statusBadgeVariant(d.status as DonationStatus)} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(d.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      {d.status === 'pending' && (
                        <button
                          onClick={() => { void handleConfirm(d.id) }}
                          className="text-xs text-green-600 hover:text-green-700 font-medium"
                        >
                          Confirmar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Donation Modal */}
      {createOpen && (
        <CreateDonationModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          churchId={churchId}
          campaigns={stats?.campaigns ?? []}
          bankAccounts={bankAccounts ?? []}
        />
      )}

      {/* Campaign Modal (create + edit) */}
      {campaignModalOpen && (
        <CampaignModal
          key={editingCampaign?.id ?? 'new'}
          open={campaignModalOpen}
          onClose={() => { setCampaignModalOpen(false); setEditingCampaign(null) }}
          churchId={churchId}
          campaign={editingCampaign}
        />
      )}

      {/* Category Modal (create + edit) */}
      {categoryModalOpen && (
        <CategoryModal
          key={editingCategory?.id ?? 'new-cat'}
          open={categoryModalOpen}
          onClose={() => { setCategoryModalOpen(false); setEditingCategory(null) }}
          churchId={churchId}
          category={editingCategory}
        />
      )}

      {/* Bank Account Modal (create + edit) */}
      {bankModalOpen && (
        <BankAccountModal
          key={editingBank?.id ?? 'new-bank'}
          open={bankModalOpen}
          onClose={() => { setBankModalOpen(false); setEditingBank(null) }}
          churchId={churchId}
          account={editingBank}
        />
      )}

      {/* Expense Modal (create + edit) */}
      {expenseModalOpen && (
        <ExpenseModal
          key={editingExpense?.id ?? 'new-expense'}
          open={expenseModalOpen}
          onClose={() => { setExpenseModalOpen(false); setEditingExpense(null) }}
          churchId={churchId}
          expense={editingExpense}
          categories={categories ?? []}
          bankAccounts={bankAccounts ?? []}
        />
      )}

      {/* Dar Baixa Modal */}
      {darBaixaOpen && darBaixaExpense && (
        <DarBaixaModal
          key={darBaixaExpense.id}
          open={darBaixaOpen}
          onClose={() => { setDarBaixaOpen(false); setDarBaixaExpense(null) }}
          expense={darBaixaExpense}
          bankAccounts={bankAccounts ?? []}
        />
      )}

      {/* Receivable Modal (create + edit) */}
      {receivableModalOpen && (
        <ReceivableModal
          key={editingReceivable?.id ?? 'new-receivable'}
          open={receivableModalOpen}
          onClose={() => { setReceivableModalOpen(false); setEditingReceivable(null) }}
          churchId={churchId}
          receivable={editingReceivable}
          categories={categories ?? []}
          bankAccounts={bankAccounts ?? []}
        />
      )}

      {/* Confirm Receivable Modal */}
      {confirmReceivableOpen && confirmingReceivable && (
        <ConfirmReceivableModal
          key={confirmingReceivable.id}
          open={confirmReceivableOpen}
          onClose={() => { setConfirmReceivableOpen(false); setConfirmingReceivable(null) }}
          receivable={confirmingReceivable}
          bankAccounts={bankAccounts ?? []}
          churchId={churchId}
        />
      )}
    </div>
  )
}
