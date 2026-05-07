import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Church,
  User,
  FileText,
  CheckCircle2,
  ChevronRight,
  Loader2,
  AlertCircle,
  Heart,
  MessageSquare,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ─── CSS helpers ────────────────────────────────────────────────────────────

const inputClass =
  'w-full px-4 py-3 rounded-xl border border-black/10 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-200 focus:border-transparent transition-all bg-white'

const labelClass = 'block text-xs font-semibold text-gray-600 mb-1.5'

const errorClass = 'text-xs text-red-600 mt-1'

const UF_LIST = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA',
  'MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN',
  'RO','RR','RS','SC','SE','SP','TO',
]

// ─── Types ───────────────────────────────────────────────────────────────────

type OnboardingStep = 'pending' | 'pastoral' | 'completed'

interface OnboardingState {
  church_id: string
  step: OnboardingStep
  contractor_complete: boolean
  pastoral_complete: boolean
  blocked: boolean
  completed_at: string | null
}

interface Step1Church {
  name: string
  city: string
  uf: string
  main_phone: string
  main_email: string
  pastor_titular_name: string
  pastor_titular_phone: string
  pastor_titular_email: string
  pastor_titular_can_be_quoted: boolean
}

interface Step1Contractor {
  name: string
  document_type: 'cpf' | 'cnpj'
  document_number: string
  person_type: 'pf' | 'pj'
  role_label: string
  email: string
  phone: string
  notes: string
}

interface Step2Pastoral {
  estilo_comunicacao: 'formal' | 'casual' | 'intermediario' | ''
  horarios_culto: string
  maior_desafio: string
  foco_pastoral_30_dias: string
  algo_importante_comunidade: string
}

// ─── WizardHeader ────────────────────────────────────────────────────────────

function WizardHeader({ step }: { step: 1 | 2 }) {
  const progress = step === 1 ? 50 : 100

  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        padding: '0 24px',
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            backgroundColor: '#e13500',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Church size={18} color="#fff" />
        </div>
        <span
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 700,
            fontSize: 18,
            color: '#161616',
          }}
        >
          Ekthos
        </span>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
          Etapa {step} de 2
        </span>
        <div
          style={{
            width: 160,
            height: 4,
            backgroundColor: '#f3f4f6',
            borderRadius: 99,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${progress}%`,
              height: '100%',
              backgroundColor: '#e13500',
              borderRadius: 99,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>
    </div>
  )
}

// ─── FieldGroup ──────────────────────────────────────────────────────────────

function FieldGroup({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        backgroundColor: '#fff',
        borderRadius: 16,
        border: '1px solid rgba(0,0,0,0.06)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        padding: 24,
        marginBottom: 20,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            backgroundColor: 'rgba(225,53,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {icon}
        </div>
        <h2
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 700,
            fontSize: 17,
            color: '#161616',
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      {children}
    </div>
  )
}

// ─── ErrorBanner ─────────────────────────────────────────────────────────────

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        backgroundColor: '#fef2f2',
        border: '1px solid #fecaca',
        borderRadius: 12,
        padding: '12px 16px',
        marginBottom: 20,
      }}
    >
      <AlertCircle size={16} color="#dc2626" style={{ flexShrink: 0, marginTop: 1 }} />
      <span style={{ fontSize: 13, color: '#dc2626', lineHeight: 1.5 }}>{message}</span>
    </div>
  )
}

// ─── Step1Form ───────────────────────────────────────────────────────────────

function Step1Form({
  churchId,
  onComplete,
}: {
  churchId: string
  onComplete: () => void
}) {
  const [church, setChurch] = useState<Step1Church>({
    name: '',
    city: '',
    uf: '',
    main_phone: '',
    main_email: '',
    pastor_titular_name: '',
    pastor_titular_phone: '',
    pastor_titular_email: '',
    pastor_titular_can_be_quoted: false,
  })

  const [contractor, setContractor] = useState<Step1Contractor>({
    name: '',
    document_type: 'cpf',
    document_number: '',
    person_type: 'pf',
    role_label: '',
    email: '',
    phone: '',
    notes: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function setC(field: keyof Step1Church, value: string | boolean) {
    setChurch((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  function setCo(field: keyof Step1Contractor, value: string) {
    setContractor((prev) => {
      const next = { ...prev, [field]: value }
      // If person_type changes to pj, force cnpj
      if (field === 'person_type' && value === 'pj') {
        next.document_type = 'cnpj'
      }
      if (field === 'person_type' && value === 'pf') {
        next.document_type = 'cpf'
      }
      return next
    })
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}

    if (!church.name.trim()) e.name = 'Nome da igreja é obrigatório.'
    if (!church.city.trim()) e.city = 'Cidade é obrigatória.'
    if (!church.uf) e.uf = 'Estado é obrigatório.'
    if (!church.pastor_titular_name.trim()) e.pastor_titular_name = 'Nome do pastor titular é obrigatório.'

    if (!contractor.name.trim()) e.co_name = 'Nome do contratante é obrigatório.'
    if (!contractor.role_label.trim()) e.co_role_label = 'Cargo/função é obrigatório.'

    const digits = contractor.document_number.replace(/\D/g, '')
    if (!digits) {
      e.co_document_number = 'Documento é obrigatório.'
    } else if (contractor.document_type === 'cpf' && !/^\d{11}$/.test(digits)) {
      e.co_document_number = 'CPF deve ter 11 dígitos.'
    } else if (contractor.document_type === 'cnpj' && !/^\d{14}$/.test(digits)) {
      e.co_document_number = 'CNPJ deve ter 14 dígitos.'
    }

    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setApiError('')
    if (!validate()) return

    setSubmitting(true)
    try {
      const digits = contractor.document_number.replace(/\D/g, '')

      const { data, error } = await supabase.rpc('upsert_church_cadastro_cristalino', {
        p_church_id: churchId,
        p_church_data: {
          name: church.name.trim(),
          city: church.city.trim(),
          uf: church.uf,
          main_phone: church.main_phone.trim() || null,
          main_email: church.main_email.trim() || null,
          pastor_titular_name: church.pastor_titular_name.trim(),
          pastor_titular_phone: church.pastor_titular_phone.trim() || null,
          pastor_titular_email: church.pastor_titular_email.trim() || null,
          pastor_titular_can_be_quoted: church.pastor_titular_can_be_quoted,
        },
        p_contractor_data: {
          name: contractor.name.trim(),
          document_type: contractor.document_type,
          document_number: digits,
          person_type: contractor.person_type,
          role_label: contractor.role_label.trim(),
          email: contractor.email.trim() || null,
          phone: contractor.phone.trim() || null,
          notes: contractor.notes.trim() || null,
        },
      })

      if (error) {
        const msg = error.message || ''
        if (msg.includes('validation_error:')) {
          setApiError(msg.replace('validation_error:', '').trim())
        } else if (msg.includes('permission_denied')) {
          setApiError('Sem permissão para atualizar os dados.')
        } else {
          setApiError('Ocorreu um erro inesperado. Tente novamente.')
        }
        return
      }

      if (data?.onboarding_step === 'pastoral') {
        onComplete()
      }
    } catch {
      setApiError('Falha de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <WizardHeader step={1} />

      <div
        style={{
          maxWidth: 680,
          margin: '0 auto',
          padding: '32px 24px 80px',
        }}
      >
        {/* Page title */}
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 700,
              fontSize: 28,
              color: '#161616',
              margin: '0 0 8px',
            }}
          >
            Dados da sua Igreja
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Essas informações alimentam o CRM e os contratos. Leva menos de 3 minutos.
          </p>
        </div>

        {apiError && <ErrorBanner message={apiError} />}

        <form onSubmit={handleSubmit} noValidate>
          {/* ── Igreja ── */}
          <FieldGroup title="Dados da Igreja" icon={<Church size={18} color="#e13500" />}>
            <div style={{ display: 'grid', gap: 16 }}>
              {/* Nome */}
              <div>
                <label className={labelClass}>Nome da Igreja *</label>
                <input
                  className={inputClass}
                  placeholder="Ex: Igreja Batista Central"
                  value={church.name}
                  onChange={(e) => setC('name', e.target.value)}
                />
                {errors.name && <p className={errorClass}>{errors.name}</p>}
              </div>

              {/* Cidade + UF */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
                <div>
                  <label className={labelClass}>Cidade *</label>
                  <input
                    className={inputClass}
                    placeholder="Ex: São Paulo"
                    value={church.city}
                    onChange={(e) => setC('city', e.target.value)}
                  />
                  {errors.city && <p className={errorClass}>{errors.city}</p>}
                </div>
                <div>
                  <label className={labelClass}>Estado *</label>
                  <select
                    className={inputClass}
                    value={church.uf}
                    onChange={(e) => setC('uf', e.target.value)}
                  >
                    <option value="">UF</option>
                    {UF_LIST.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                  {errors.uf && <p className={errorClass}>{errors.uf}</p>}
                </div>
              </div>

              {/* Telefone + Email */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className={labelClass}>Telefone principal</label>
                  <input
                    className={inputClass}
                    placeholder="(11) 9 9999-9999"
                    value={church.main_phone}
                    onChange={(e) => setC('main_phone', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>E-mail principal</label>
                  <input
                    type="email"
                    className={inputClass}
                    placeholder="contato@igreja.com"
                    value={church.main_email}
                    onChange={(e) => setC('main_email', e.target.value)}
                  />
                </div>
              </div>
            </div>
          </FieldGroup>

          {/* ── Pastor Titular ── */}
          <FieldGroup title="Pastor Titular" icon={<User size={18} color="#e13500" />}>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label className={labelClass}>Nome do pastor titular *</label>
                <input
                  className={inputClass}
                  placeholder="Ex: Pr. João Silva"
                  value={church.pastor_titular_name}
                  onChange={(e) => setC('pastor_titular_name', e.target.value)}
                />
                {errors.pastor_titular_name && (
                  <p className={errorClass}>{errors.pastor_titular_name}</p>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className={labelClass}>Telefone do pastor</label>
                  <input
                    className={inputClass}
                    placeholder="(11) 9 9999-9999"
                    value={church.pastor_titular_phone}
                    onChange={(e) => setC('pastor_titular_phone', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>E-mail do pastor</label>
                  <input
                    type="email"
                    className={inputClass}
                    placeholder="pastor@igreja.com"
                    value={church.pastor_titular_email}
                    onChange={(e) => setC('pastor_titular_email', e.target.value)}
                  />
                </div>
              </div>

              {/* Can be quoted */}
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <input
                  type="checkbox"
                  checked={church.pastor_titular_can_be_quoted}
                  onChange={(e) => setC('pastor_titular_can_be_quoted', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#e13500', cursor: 'pointer' }}
                />
                <span style={{ fontSize: 13, color: '#374151' }}>
                  O pastor titular pode ser citado em comunicações externas
                </span>
              </label>
            </div>
          </FieldGroup>

          {/* ── Contratante ── */}
          <FieldGroup title="Responsável pelo Contrato" icon={<FileText size={18} color="#e13500" />}>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label className={labelClass}>Nome completo *</label>
                <input
                  className={inputClass}
                  placeholder="Nome do responsável legal"
                  value={contractor.name}
                  onChange={(e) => setCo('name', e.target.value)}
                />
                {errors.co_name && <p className={errorClass}>{errors.co_name}</p>}
              </div>

              <div>
                <label className={labelClass}>Cargo / Função *</label>
                <input
                  className={inputClass}
                  placeholder="Ex: Pastor Presidente, Tesoureiro, Diretor Administrativo"
                  value={contractor.role_label}
                  onChange={(e) => setCo('role_label', e.target.value)}
                />
                {errors.co_role_label && <p className={errorClass}>{errors.co_role_label}</p>}
              </div>

              {/* Tipo pessoa */}
              <div>
                <label className={labelClass}>Tipo de pessoa *</label>
                <div style={{ display: 'flex', gap: 12 }}>
                  {(['pf', 'pj'] as const).map((type) => (
                    <label
                      key={type}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        cursor: 'pointer',
                        fontSize: 14,
                        color: '#374151',
                        padding: '10px 16px',
                        borderRadius: 12,
                        border: `1.5px solid ${contractor.person_type === type ? '#e13500' : 'rgba(0,0,0,0.1)'}`,
                        backgroundColor: contractor.person_type === type ? 'rgba(225,53,0,0.04)' : '#fff',
                        transition: 'all 0.15s',
                        flex: 1,
                        justifyContent: 'center',
                      }}
                    >
                      <input
                        type="radio"
                        name="person_type"
                        value={type}
                        checked={contractor.person_type === type}
                        onChange={() => setCo('person_type', type)}
                        style={{ accentColor: '#e13500' }}
                      />
                      {type === 'pf' ? 'Pessoa Física (CPF)' : 'Pessoa Jurídica (CNPJ)'}
                    </label>
                  ))}
                </div>
              </div>

              {/* Documento */}
              <div>
                <label className={labelClass}>
                  {contractor.document_type === 'cpf' ? 'CPF *' : 'CNPJ *'}
                </label>
                <input
                  className={inputClass}
                  placeholder={contractor.document_type === 'cpf' ? '000.000.000-00' : '00.000.000/0001-00'}
                  value={contractor.document_number}
                  onChange={(e) => setCo('document_number', e.target.value)}
                />
                {errors.co_document_number && (
                  <p className={errorClass}>{errors.co_document_number}</p>
                )}
              </div>

              {/* Email + Phone */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label className={labelClass}>E-mail do contratante</label>
                  <input
                    type="email"
                    className={inputClass}
                    placeholder="email@exemplo.com"
                    value={contractor.email}
                    onChange={(e) => setCo('email', e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Telefone do contratante</label>
                  <input
                    className={inputClass}
                    placeholder="(11) 9 9999-9999"
                    value={contractor.phone}
                    onChange={(e) => setCo('phone', e.target.value)}
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={labelClass}>Observações</label>
                <textarea
                  className={inputClass}
                  placeholder="Informações adicionais relevantes para o contrato..."
                  rows={3}
                  value={contractor.notes}
                  onChange={(e) => setCo('notes', e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          </FieldGroup>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 24px',
              backgroundColor: submitting ? '#9ca3af' : '#e13500',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!submitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FF4D1A'
            }}
            onMouseLeave={(e) => {
              if (!submitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#e13500'
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                Salvando...
              </>
            ) : (
              <>
                Continuar para Etapa 2
                <ChevronRight size={18} />
              </>
            )}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </>
  )
}

// ─── Step2Form ───────────────────────────────────────────────────────────────

function Step2Form({
  churchId,
  onComplete,
}: {
  churchId: string
  onComplete: () => void
}) {
  const [pastoral, setPastoral] = useState<Step2Pastoral>({
    estilo_comunicacao: '',
    horarios_culto: '',
    maior_desafio: '',
    foco_pastoral_30_dias: '',
    algo_importante_comunidade: '',
  })

  const [errors, setErrors] = useState<Record<string, string>>({})
  const [apiError, setApiError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function setP(field: keyof Step2Pastoral, value: string) {
    setPastoral((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  function validate(): boolean {
    const e: Record<string, string> = {}
    if (!pastoral.estilo_comunicacao) {
      e.estilo_comunicacao = 'Selecione o estilo de comunicação.'
    }
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setApiError('')
    if (!validate()) return

    setSubmitting(true)
    try {
      const { data, error } = await supabase.rpc('upsert_church_onboarding_pastoral', {
        p_church_id: churchId,
        p_pastoral_data: {
          estilo_comunicacao: pastoral.estilo_comunicacao || null,
          horarios_culto: pastoral.horarios_culto.trim() || null,
          maior_desafio: pastoral.maior_desafio.trim() || null,
          foco_pastoral_30_dias: pastoral.foco_pastoral_30_dias.trim() || null,
          algo_importante_comunidade: pastoral.algo_importante_comunidade.trim() || null,
        },
      })

      if (error) {
        const msg = error.message || ''
        if (msg.includes('precondition_failed')) {
          setApiError('Etapa 1 não concluída. Recarregue a página.')
        } else if (msg.includes('validation_error:')) {
          setApiError(msg.replace('validation_error:', '').trim())
        } else {
          setApiError('Ocorreu um erro inesperado. Tente novamente.')
        }
        return
      }

      if (data?.onboarding_step === 'completed') {
        onComplete()
      }
    } catch {
      setApiError('Falha de conexão. Verifique sua internet e tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const estilos = [
    {
      value: 'formal',
      label: 'Formal',
      desc: 'Comunicação institucional e reverente',
    },
    {
      value: 'intermediario',
      label: 'Intermediário',
      desc: 'Equilibrado, acessível e respeitoso',
    },
    {
      value: 'casual',
      label: 'Casual',
      desc: 'Próximo, direto e descontraído',
    },
  ] as const

  return (
    <>
      <WizardHeader step={2} />

      <div
        style={{
          maxWidth: 680,
          margin: '0 auto',
          padding: '32px 24px 80px',
        }}
      >
        {/* Page title */}
        <div style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 700,
              fontSize: 28,
              color: '#161616',
              margin: '0 0 8px',
            }}
          >
            Perfil Pastoral
          </h1>
          <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
            Essas informações ajudam o Ekthos a personalizar a comunicação e os agentes de IA para a sua realidade.
          </p>
        </div>

        {apiError && <ErrorBanner message={apiError} />}

        <form onSubmit={handleSubmit} noValidate>
          {/* ── Estilo de Comunicação ── */}
          <FieldGroup
            title="Estilo de Comunicação"
            icon={<MessageSquare size={18} color="#e13500" />}
          >
            <div>
              <label className={labelClass}>
                Como a sua igreja prefere se comunicar? *
              </label>
              <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
                {estilos.map((est) => (
                  <label
                    key={est.value}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      cursor: 'pointer',
                      padding: '14px 18px',
                      borderRadius: 14,
                      border: `1.5px solid ${
                        pastoral.estilo_comunicacao === est.value
                          ? '#e13500'
                          : 'rgba(0,0,0,0.1)'
                      }`,
                      backgroundColor:
                        pastoral.estilo_comunicacao === est.value
                          ? 'rgba(225,53,0,0.04)'
                          : '#fff',
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="radio"
                      name="estilo_comunicacao"
                      value={est.value}
                      checked={pastoral.estilo_comunicacao === est.value}
                      onChange={() => setP('estilo_comunicacao', est.value)}
                      style={{ accentColor: '#e13500', width: 17, height: 17 }}
                    />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#161616' }}>
                        {est.label}
                      </div>
                      <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                        {est.desc}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
              {errors.estilo_comunicacao && (
                <p className={errorClass}>{errors.estilo_comunicacao}</p>
              )}
            </div>
          </FieldGroup>

          {/* ── Contexto Pastoral ── */}
          <FieldGroup
            title="Contexto da sua Igreja"
            icon={<Heart size={18} color="#e13500" />}
          >
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <label className={labelClass}>Horários dos cultos</label>
                <input
                  className={inputClass}
                  placeholder="Ex: Domingo 9h e 19h, Quarta 19h30"
                  value={pastoral.horarios_culto}
                  onChange={(e) => setP('horarios_culto', e.target.value)}
                />
              </div>

              <div>
                <label className={labelClass}>Maior desafio pastoral atual</label>
                <textarea
                  className={inputClass}
                  placeholder="Ex: Engajamento de jovens, crescimento de membros, consolidação de células..."
                  rows={3}
                  value={pastoral.maior_desafio}
                  onChange={(e) => setP('maior_desafio', e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div>
                <label className={labelClass}>Foco pastoral nos próximos 30 dias</label>
                <textarea
                  className={inputClass}
                  placeholder="Ex: Lançar grupo de louvor, iniciar campanha de oração, revisão de membros..."
                  rows={3}
                  value={pastoral.foco_pastoral_30_dias}
                  onChange={(e) => setP('foco_pastoral_30_dias', e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>

              <div>
                <label className={labelClass}>
                  Algo importante sobre sua comunidade que devemos saber
                </label>
                <textarea
                  className={inputClass}
                  placeholder="Contexto, história, particularidades da sua congregação..."
                  rows={3}
                  value={pastoral.algo_importante_comunidade}
                  onChange={(e) => setP('algo_importante_comunidade', e.target.value)}
                  style={{ resize: 'vertical' }}
                />
              </div>
            </div>
          </FieldGroup>

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '14px 24px',
              backgroundColor: submitting ? '#9ca3af' : '#e13500',
              color: '#fff',
              border: 'none',
              borderRadius: 12,
              fontSize: 15,
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (!submitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FF4D1A'
            }}
            onMouseLeave={(e) => {
              if (!submitting) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#e13500'
            }}
          >
            {submitting ? (
              <>
                <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                Finalizando cadastro...
              </>
            ) : (
              <>
                Concluir cadastro
                <CheckCircle2 size={18} />
              </>
            )}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </>
  )
}

// ─── CompletionScreen ─────────────────────────────────────────────────────────

function CompletionScreen() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#f9eedc',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          width: '100%',
          backgroundColor: '#fff',
          borderRadius: 24,
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          padding: 48,
          textAlign: 'center',
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            backgroundColor: 'rgba(225,53,0,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <CheckCircle2 size={36} color="#e13500" />
        </div>

        <h1
          style={{
            fontFamily: "'Playfair Display', serif",
            fontWeight: 700,
            fontSize: 26,
            color: '#161616',
            margin: '0 0 12px',
          }}
        >
          Cadastro concluído!
        </h1>

        <p
          style={{
            fontSize: 15,
            color: '#6b7280',
            lineHeight: 1.6,
            margin: '0 0 32px',
          }}
        >
          Seu perfil pastoral está configurado. Agora você pode começar a usar o Ekthos CRM para
          gerenciar sua congregação com inteligência.
        </p>

        <button
          onClick={() => navigate('/onboarding')}
          style={{
            width: '100%',
            padding: '14px 24px',
            backgroundColor: '#e13500',
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            fontSize: 15,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background-color 0.15s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#FF4D1A'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#e13500'
          }}
        >
          Configurar meu CRM agora
        </button>
      </div>
    </div>
  )
}

// ─── Wizard (default export) ─────────────────────────────────────────────────

export default function Wizard() {
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [churchId, setChurchId] = useState<string | null>(null)
  const [step, setStep] = useState<OnboardingStep>('pending')
  const [showCompletion, setShowCompletion] = useState(false)

  useEffect(() => {
    async function init() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession()

        if (!session) {
          navigate('/login')
          return
        }

        const cid: string | undefined = session.user.app_metadata?.church_id
        if (!cid) {
          navigate('/login')
          return
        }

        setChurchId(cid)

        const { data, error } = await supabase.rpc('get_church_onboarding_state', {
          p_church_id: cid,
        })

        if (error || !data) {
          // Non-blocking: default to pending if RPC fails
          setStep('pending')
          setLoading(false)
          return
        }

        const state = data as OnboardingState

        if (state.step === 'completed') {
          navigate('/onboarding')
          return
        }

        setStep(state.step)
      } catch {
        navigate('/login')
      } finally {
        setLoading(false)
      }
    }

    init()
  }, [navigate])

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          backgroundColor: '#f9eedc',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <Loader2
          size={32}
          color="#e13500"
          style={{ animation: 'spin 1s linear infinite' }}
        />
        <p style={{ fontSize: 14, color: '#6b7280' }}>Carregando seu perfil...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  if (showCompletion) {
    return <CompletionScreen />
  }

  if (!churchId) return null

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9eedc' }}>
      {step === 'pending' && (
        <Step1Form
          churchId={churchId}
          onComplete={() => setStep('pastoral')}
        />
      )}

      {step === 'pastoral' && (
        <Step2Form
          churchId={churchId}
          onComplete={() => setShowCompletion(true)}
        />
      )}
    </div>
  )
}
