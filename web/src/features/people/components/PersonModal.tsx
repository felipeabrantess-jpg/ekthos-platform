import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { useCreatePerson, useUpdatePerson } from '../hooks/usePeople'
import { useGroups } from '@/features/celulas/hooks/useGroups'
import { useAuth } from '@/hooks/useAuth'
import { canManageFinancial, isAdminLevel } from '@/hooks/useRole'
import type { Person, AppRoleDB } from '@/lib/database.types'

// ──────────────────────────────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────────────────────────────

type TabId = 'pessoal' | 'eclesiastico' | 'formacao' | 'financeiro' | 'acompanhamento'

interface Tab {
  id: TabId
  label: string
  gated?: (role: AppRoleDB | null) => boolean
}

const TABS: Tab[] = [
  { id: 'pessoal',        label: 'Pessoal' },
  { id: 'eclesiastico',   label: 'Eclesiástico' },
  { id: 'formacao',       label: 'Formação' },
  { id: 'financeiro',     label: 'Financeiro',     gated: (r) => canManageFinancial(r as Parameters<typeof canManageFinancial>[0]) },
  { id: 'acompanhamento', label: 'Acompanhamento', gated: (r) => isAdminLevel(r as Parameters<typeof isAdminLevel>[0]) },
]

interface FormState {
  // Pessoal
  name: string
  phone: string
  email: string
  birth_date: string
  marital_status: string
  neighborhood: string
  como_conheceu: string
  // Eclesiástico
  celula_id: string
  conversion_date: string
  batismo_status: string
  baptism_date: string
  calling: string
  ministry_interest: string[]
  // Formação
  consolidation_school: string   // 'true' | 'false' | '' (tristate via select)
  experiencia_lideranca: string
  // Financeiro
  is_dizimista: string           // 'true' | 'false' | ''
  // Acompanhamento
  observacoes_pastorais: string
}

const EMPTY_FORM: FormState = {
  name: '', phone: '', email: '',
  birth_date: '', marital_status: '', neighborhood: '', como_conheceu: '',
  celula_id: '', conversion_date: '', batismo_status: '', baptism_date: '',
  calling: '', ministry_interest: [],
  consolidation_school: '', experiencia_lideranca: '',
  is_dizimista: '',
  observacoes_pastorais: '',
}

// Converte Person → FormState para edição
function personToForm(p: Person): FormState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const any = p as any
  return {
    name:                 p.name ?? '',
    phone:                p.phone ?? '',
    email:                p.email ?? '',
    birth_date:           p.birth_date ?? '',
    marital_status:       p.marital_status ?? '',
    neighborhood:         p.neighborhood ?? '',
    como_conheceu:        any.como_conheceu ?? '',
    celula_id:            any.celula_id ?? '',
    conversion_date:      p.conversion_date ?? '',
    batismo_status:       any.batismo_status ?? '',
    baptism_date:         p.baptism_date ?? '',
    calling:              p.calling ?? '',
    ministry_interest:    p.ministry_interest ?? [],
    consolidation_school: p.consolidation_school == null ? '' : String(p.consolidation_school),
    experiencia_lideranca: any.experiencia_lideranca ?? '',
    is_dizimista:         any.is_dizimista == null ? '' : String(any.is_dizimista),
    observacoes_pastorais: any.observacoes_pastorais ?? '',
  }
}

// ──────────────────────────────────────────────────────────────────────
// Componentes auxiliares
// ──────────────────────────────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-1">
      {children}
    </h4>
  )
}

function FieldRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>
}

// ──────────────────────────────────────────────────────────────────────
// PersonModal
// ──────────────────────────────────────────────────────────────────────

interface PersonModalProps {
  open: boolean
  onClose: () => void
  churchId: string
  person?: Person | null
}

export default function PersonModal({ open, onClose, churchId, person }: PersonModalProps) {
  const { role } = useAuth()
  const isEdit = Boolean(person)
  const createPerson = useCreatePerson()
  const updatePerson = useUpdatePerson()
  const { data: groups = [] } = useGroups(churchId)

  const [activeTab, setActiveTab] = useState<TabId>('pessoal')
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [error, setError] = useState<string | null>(null)

  // Tabs visíveis para o role atual
  const visibleTabs = TABS.filter((t) => !t.gated || t.gated(role as AppRoleDB | null))

  // Preenche o form ao editar
  useEffect(() => {
    setForm(person ? personToForm(person) : EMPTY_FORM)
    setActiveTab('pessoal')
    setError(null)
  }, [person, open])

  // Célula selecionada → auto-fill líder (exibição)
  const selectedGroup = groups.find((g) => g.id === form.celula_id)

  const set = (key: keyof FormState, val: string) =>
    setForm((f) => ({ ...f, [key]: val }))

  const isPending = createPerson.isPending || updatePerson.isPending

  // Constrói o payload final para salvar
  function buildPayload() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: Record<string, any> = {
      name:               form.name.trim() || null,
      phone:              form.phone.trim() || null,
      email:              form.email.trim() || null,
      birth_date:         form.birth_date || null,
      marital_status:     form.marital_status || null,
      neighborhood:       form.neighborhood.trim() || null,
      como_conheceu:      form.como_conheceu || null,
      celula_id:          form.celula_id || null,
      conversion_date:    form.conversion_date || null,
      batismo_status:     form.batismo_status || null,
      baptism_date:       form.batismo_status === 'sim' ? (form.baptism_date || null) : null,
      calling:            form.calling.trim() || null,
      ministry_interest:  form.ministry_interest.length > 0 ? form.ministry_interest : null,
      consolidation_school: form.consolidation_school === '' ? null
        : form.consolidation_school === 'true',
      experiencia_lideranca: form.experiencia_lideranca || null,
    }
    if (canManageFinancial(role as Parameters<typeof canManageFinancial>[0])) {
      payload.is_dizimista = form.is_dizimista === '' ? null : form.is_dizimista === 'true'
    }
    if (isAdminLevel(role as Parameters<typeof isAdminLevel>[0])) {
      payload.observacoes_pastorais = form.observacoes_pastorais.trim() || null
    }
    return payload
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!form.name.trim()) {
      setActiveTab('pessoal')
      setError('Nome é obrigatório.')
      return
    }

    const payload = buildPayload()

    try {
      if (isEdit && person) {
        await updatePerson.mutateAsync({ id: person.id, church_id: churchId, ...payload })
      } else {
        await createPerson.mutateAsync({ church_id: churchId, source: 'manual', ...payload, name: form.name.trim() })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.')
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar Membro' : 'Novo Membro'}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-100 -mx-6 px-6 pb-0">
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Aba Pessoal ── */}
        {activeTab === 'pessoal' && (
          <div className="space-y-3 pt-1">
            <SectionTitle>Identificação</SectionTitle>
            <Input
              label="Nome completo *"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Nome"
              required
            />
            <FieldRow>
              <Input
                label="Telefone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+55 11 99999-9999"
                type="tel"
              />
              <Input
                label="E-mail"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="email@exemplo.com"
                type="email"
              />
            </FieldRow>

            <SectionTitle>Dados Pessoais</SectionTitle>
            <FieldRow>
              <Input
                label="Data de Nascimento"
                value={form.birth_date}
                onChange={(e) => set('birth_date', e.target.value)}
                type="date"
              />
              <Select
                label="Estado Civil"
                value={form.marital_status}
                onChange={(e) => set('marital_status', e.target.value)}
                placeholder="Selecionar..."
              >
                <option value="solteiro">Solteiro(a)</option>
                <option value="casado">Casado(a)</option>
                <option value="divorciado">Divorciado(a)</option>
                <option value="viuvo">Viúvo(a)</option>
              </Select>
            </FieldRow>
            <FieldRow>
              <Input
                label="Bairro / Endereço"
                value={form.neighborhood}
                onChange={(e) => set('neighborhood', e.target.value)}
                placeholder="Ex: Vila Mariana"
              />
              <Select
                label="Como conheceu a igreja"
                value={form.como_conheceu}
                onChange={(e) => set('como_conheceu', e.target.value)}
                placeholder="Selecionar..."
              >
                <option value="convite_membro">Convite de membro</option>
                <option value="redes_sociais">Redes sociais</option>
                <option value="passou_na_frente">Passou na frente</option>
                <option value="evento">Evento</option>
                <option value="familia">Família</option>
                <option value="outro">Outro</option>
              </Select>
            </FieldRow>
          </div>
        )}

        {/* ── Aba Eclesiástico ── */}
        {activeTab === 'eclesiastico' && (
          <div className="space-y-3 pt-1">
            <SectionTitle>Vínculo com a Igreja</SectionTitle>
            <FieldRow>
              <Select
                label="Célula"
                value={form.celula_id}
                onChange={(e) => set('celula_id', e.target.value)}
                placeholder="Nenhuma"
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </Select>
              <Input
                label="Líder da Célula"
                value={selectedGroup ? (selectedGroup.name + ' (auto)') : '—'}
                readOnly
                disabled
                hint="Preenchido automaticamente"
              />
            </FieldRow>
            <Input
              label="Data de Conversão"
              value={form.conversion_date}
              onChange={(e) => set('conversion_date', e.target.value)}
              type="date"
            />

            <SectionTitle>Batismo</SectionTitle>
            <FieldRow>
              <Select
                label="Batizado"
                value={form.batismo_status}
                onChange={(e) => set('batismo_status', e.target.value)}
                placeholder="Selecionar..."
              >
                <option value="sim">Sim</option>
                <option value="nao">Não</option>
                <option value="agendado">Agendado</option>
              </Select>
              {/* Condicional: data do batismo só aparece se batismo_status === 'sim' */}
              {form.batismo_status === 'sim' && (
                <Input
                  label="Data do Batismo"
                  value={form.baptism_date}
                  onChange={(e) => set('baptism_date', e.target.value)}
                  type="date"
                />
              )}
            </FieldRow>

            <SectionTitle>Serviço</SectionTitle>
            <Input
              label="Dons e Talentos"
              value={form.calling}
              onChange={(e) => set('calling', e.target.value)}
              placeholder="Ex: Música (voz), Ensino, Liderança, Mídia"
              hint="Separe por vírgulas"
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Departamentos
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  'Louvor', 'Infantil', 'Jovens', 'Recepção', 'Mídia/Design',
                  'Som/Iluminação', 'Intercessão', 'Administração', 'Assistência Social',
                ].map((dep) => {
                  const active = form.ministry_interest.includes(dep)
                  return (
                    <button
                      key={dep}
                      type="button"
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          ministry_interest: active
                            ? f.ministry_interest.filter((d) => d !== dep)
                            : [...f.ministry_interest, dep],
                        }))
                      }
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        active
                          ? 'bg-brand-50 border-brand-300 text-brand-700 font-medium'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {dep}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Aba Formação ── */}
        {activeTab === 'formacao' && (
          <div className="space-y-3 pt-1">
            <SectionTitle>Formação e Experiência</SectionTitle>
            <FieldRow>
              <Select
                label="Tem curso teológico"
                value={form.consolidation_school}
                onChange={(e) => set('consolidation_school', e.target.value)}
                placeholder="Selecionar..."
              >
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </Select>
              <Select
                label="Já foi líder antes"
                value={form.experiencia_lideranca}
                onChange={(e) => set('experiencia_lideranca', e.target.value)}
                placeholder="Selecionar..."
              >
                <option value="sim_esta">Sim, nesta igreja</option>
                <option value="sim_outra">Sim, em outra igreja</option>
                <option value="nao">Não</option>
              </Select>
            </FieldRow>
          </div>
        )}

        {/* ── Aba Financeiro (admin + treasurer) ── */}
        {activeTab === 'financeiro' && canManageFinancial(role as Parameters<typeof canManageFinancial>[0]) && (
          <div className="space-y-3 pt-1">
            <SectionTitle>Informações Financeiras</SectionTitle>
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 mb-3">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              Visível apenas para Admin e Tesoureiro.
            </div>
            <Select
              label="Dizimista Ativo"
              value={form.is_dizimista}
              onChange={(e) => set('is_dizimista', e.target.value)}
              placeholder="Não informado"
            >
              <option value="true">Sim</option>
              <option value="false">Não</option>
            </Select>
          </div>
        )}

        {/* ── Aba Acompanhamento (admin only) ── */}
        {activeTab === 'acompanhamento' && isAdminLevel(role as Parameters<typeof isAdminLevel>[0]) && (
          <div className="space-y-3 pt-1">
            <SectionTitle>Acompanhamento Pastoral</SectionTitle>
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 mb-3">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Confidencial — visível apenas para o Pastor.
            </div>
            <div className="w-full">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observações Pastorais
              </label>
              <textarea
                value={form.observacoes_pastorais}
                onChange={(e) => setForm((f) => ({ ...f, observacoes_pastorais: e.target.value }))}
                rows={6}
                placeholder="Anotações confidenciais de acompanhamento pastoral..."
                className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-none"
              />
            </div>
          </div>
        )}

        {/* Erro */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
        )}

        {/* Ações */}
        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            {visibleTabs.indexOf(visibleTabs.find((t) => t.id === activeTab)!) + 1} / {visibleTabs.length}
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" loading={isPending}>
              {isEdit ? 'Salvar' : 'Criar Membro'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
