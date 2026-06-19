import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import {
  useFinanceiroStats,
  useDonations,
  useCreateDonation,
  useConfirmDonation,
  useCreateCampaign,
  useUpdateCampaign,
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

interface KPICardProps {
  label: string
  value: string
  sub?: string
}

function KPICard({ label, value, sub }: KPICardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
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
}

function CreateDonationModal({ open, onClose, churchId, campaigns = [] }: CreateDonationModalProps) {
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
  const confirmDonation = useConfirmDonation()

  const { data: stats, isLoading: statsLoading, isError: statsError, refetch: refetchStats } = useFinanceiroStats(churchId ?? '')
  const { data: donations, isLoading: donationsLoading, isError: donationsError, refetch: refetchDonations } = useDonations(churchId ?? '')

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

  const totalByType = Object.values(stats?.byType ?? {}).reduce((sum, v) => sum + v, 0)

  async function handleConfirm(id: string) {
    await confirmDonation.mutateAsync({ id, churchId: churchId! })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Financeiro</h1>
          <p className="text-sm text-gray-500 mt-1">Gestão de dízimos e ofertas</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ Registrar Doação</Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
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
    </div>
  )
}
