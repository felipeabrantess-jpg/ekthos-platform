/**
 * KidsCheckin — /kids/checkin/:token  (PÚBLICA — sem login, sem sidebar)
 * Página da secretária para check-in de crianças no Kids.
 *
 * Segurança:
 *   - Token validado pela EF kids-checkin-handler (server-side).
 *   - Token inválido/expirado → tela de aviso claro.
 *   - church_id vem SEMPRE do token (nunca do cliente).
 *   - LGPD: consentimento obrigatório para salvar dados de saúde.
 *
 * UX: mobile-first 375px. Botões grandes, uso rápido na porta do Kids.
 * Re-check-in: MVP — sempre cria nova criança (melhoria futura).
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams }                        from 'react-router-dom'
import {
  Baby, CheckCircle2, AlertCircle, ChevronRight,
  Plus, Trash2, Loader2,
} from 'lucide-react'

// ── Constante de URL da EF ────────────────────────────────────

const EF_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/kids-checkin-handler`

// ── Types ─────────────────────────────────────────────────────

interface Room {
  id:        string
  name:      string
  age_range: string | null
}

interface Guardian {
  name:         string
  phone:        string
  relationship: string
  is_primary:   boolean
}

interface FormState {
  childName:   string
  birthDate:   string
  allergies:   string
  syndrome:    string
  guardians:   Guardian[]
  roomId:      string
  wristband:   string
  lgpdConsent: boolean
}

type PageState = 'loading' | 'invalid' | 'menu' | 'form' | 'submitting' | 'success'

interface SuccessData {
  childName: string
  roomName:  string
  wristband: string
}

// ── Helpers ───────────────────────────────────────────────────

const RELATIONSHIPS = ['Mãe', 'Pai', 'Avó', 'Avô', 'Tia', 'Tio', 'Irmã', 'Irmão', 'Outro']

function maskPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2)  return d
  if (d.length <= 7)  return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

function isValidPhone(v: string): boolean {
  return v.replace(/\D/g, '').length >= 10
}

function emptyGuardian(isPrimary: boolean): Guardian {
  return { name: '', phone: '', relationship: 'Mãe', is_primary: isPrimary }
}

function emptyForm(): FormState {
  return {
    childName:   '',
    birthDate:   '',
    allergies:   '',
    syndrome:    '',
    guardians:   [emptyGuardian(true)],
    roomId:      '',
    wristband:   '',
    lgpdConsent: false,
  }
}

// ── Sub-components ────────────────────────────────────────────

function Section({ title, subtitle, children }: {
  title:     string
  subtitle?: string
  children:  React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-xs font-bold text-amber-700 uppercase tracking-wider">{title}</h2>
        {subtitle && <p className="text-xs text-amber-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, error, children }: {
  label:    string
  error?:   string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-amber-900">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

function inputCls(hasError: boolean): string {
  return [
    'w-full rounded-xl px-4 py-3 text-base text-amber-900 bg-white',
    'border-2 outline-none transition-colors',
    'focus:border-amber-500',
    hasError ? 'border-red-400 bg-red-50' : 'border-amber-200',
  ].join(' ')
}

// ── Main component ────────────────────────────────────────────

export default function KidsCheckin() {
  const { token } = useParams<{ token: string }>()

  const [pageState,   setPageState]   = useState<PageState>('loading')
  const [churchName,  setChurchName]  = useState('')
  const [tokenLabel,  setTokenLabel]  = useState('')
  const [rooms,       setRooms]       = useState<Room[]>([])
  const [form,        setForm]        = useState<FormState>(emptyForm())
  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState('')
  const [success,     setSuccess]     = useState<SuccessData | null>(null)

  // ── Valida token ao montar ─────────────────────────────────
  useEffect(() => {
    if (!token) { setPageState('invalid'); return }

    fetch(`${EF_URL}?action=rooms&token=${encodeURIComponent(token)}`)
      .then(async r => {
        if (!r.ok) { setPageState('invalid'); return }
        const data = await r.json()
        if (data.token_role !== 'secretary') { setPageState('invalid'); return }
        setChurchName(data.church_name ?? '')
        setTokenLabel(data.token_label ?? 'Check-in Kids')
        setRooms(data.rooms ?? [])
        // Pré-seleciona a única sala, se houver
        if ((data.rooms ?? []).length === 1) {
          setForm(f => ({ ...f, roomId: data.rooms[0].id }))
        }
        setPageState('menu')
      })
      .catch(() => setPageState('invalid'))
  }, [token])

  // ── Validação do formulário ────────────────────────────────
  const validate = useCallback((): boolean => {
    const e: Record<string, string> = {}
    if (!form.childName.trim())  e.childName = 'Nome da criança é obrigatório'
    if (!form.roomId)            e.roomId    = 'Selecione a sala'
    if (!form.wristband.trim())  e.wristband = 'Número da pulseira é obrigatório'
    if (!form.lgpdConsent)       e.lgpd      = 'O responsável precisa consentir para continuar'
    form.guardians.forEach((g, i) => {
      if (!g.name.trim())        e[`g${i}name`]  = 'Nome obrigatório'
      if (!isValidPhone(g.phone)) e[`g${i}phone`] = 'Telefone inválido'
    })
    setErrors(e)
    return Object.keys(e).length === 0
  }, [form])

  // ── Submit check-in ────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (!validate()) return
    setPageState('submitting')
    setSubmitError('')

    const roomName  = rooms.find(r => r.id === form.roomId)?.name ?? ''
    const hasHealth = form.allergies.trim() || form.syndrome.trim()

    const body: Record<string, unknown> = {
      room_id:          form.roomId,
      wristband_number: form.wristband.trim(),
      checked_in_by:    'Secretária',
      lgpd_consent:     true,
      child: {
        name:       form.childName.trim(),
        birth_date: form.birthDate || null,
      },
      guardians: form.guardians.map((g, i) => ({
        name:         g.name.trim(),
        phone:        g.phone.replace(/\D/g, ''),
        relationship: g.relationship,
        is_primary:   i === 0,
      })),
    }

    if (hasHealth && form.lgpdConsent) {
      body.health = {
        allergies: form.allergies.trim() || null,
        syndrome:  form.syndrome.trim()  || null,
      }
    }

    try {
      const r = await fetch(EF_URL, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      })

      if (r.status === 409) {
        const d = await r.json()
        setSubmitError(d.error ?? `Pulseira ${form.wristband} já está em uso hoje`)
        setPageState('form')
        return
      }

      if (!r.ok) {
        const d = await r.json()
        setSubmitError(d.error ?? 'Erro ao registrar check-in. Tente novamente.')
        setPageState('form')
        return
      }

      setSuccess({ childName: form.childName.trim(), roomName, wristband: form.wristband.trim() })
      setPageState('success')
    } catch {
      setSubmitError('Falha de conexão. Verifique sua internet e tente novamente.')
      setPageState('form')
    }
  }, [form, validate, rooms, token])

  const updateGuardian = (idx: number, field: keyof Guardian, value: string | boolean) => {
    setForm(f => {
      const gs = [...f.guardians]
      gs[idx]  = { ...gs[idx], [field]: value }
      return { ...f, guardians: gs }
    })
  }

  const resetToForm = () => {
    setForm(emptyForm())
    setErrors({})
    setSubmitError('')
    // Pré-seleciona sala única se houver
    if (rooms.length === 1) setForm(f => ({ ...f, roomId: rooms[0].id }))
    setPageState('form')
  }

  // ── Renders por estado ─────────────────────────────────────

  if (pageState === 'loading') {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-amber-500" size={40} />
      </div>
    )
  }

  if (pageState === 'invalid') {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-amber-100 max-w-sm w-full">
          <AlertCircle size={52} className="text-amber-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-amber-900 mb-2">
            Link inválido ou expirado
          </h1>
          <p className="text-amber-700 text-sm leading-relaxed">
            Este link não é mais válido para hoje. Peça um novo link à liderança da igreja.
          </p>
        </div>
      </div>
    )
  }

  if (pageState === 'success' && success) {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-amber-100 max-w-sm w-full">
          <CheckCircle2 size={64} className="text-green-500 mx-auto mb-4" />
          <p className="text-sm text-amber-600 font-semibold uppercase tracking-wide mb-1">Check-in realizado</p>
          <h1 className="text-2xl font-bold text-amber-900 mb-3">{success.childName}</h1>
          <div className="bg-amber-50 rounded-2xl p-4 mb-6 flex flex-col gap-1">
            <p className="text-sm text-amber-700">
              Sala: <span className="font-semibold">{success.roomName}</span>
            </p>
            <p className="text-amber-700">
              Pulseira: <span className="text-3xl font-black text-amber-600">#{success.wristband}</span>
            </p>
          </div>
          <button
            onClick={resetToForm}
            className="w-full bg-amber-600 text-white text-lg font-bold py-4 rounded-2xl shadow active:bg-amber-700 transition-colors"
          >
            Próxima criança
          </button>
        </div>
      </div>
    )
  }

  if (pageState === 'menu') {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col">
        {/* Header */}
        <div className="bg-amber-600 px-5 pt-12 pb-7 text-white">
          <div className="flex items-center gap-2 mb-2 opacity-80">
            <Baby size={18} />
            <span className="text-sm font-medium">{churchName}</span>
          </div>
          <h1 className="text-2xl font-bold leading-tight">{tokenLabel || 'Check-in Kids'}</h1>
        </div>

        {/* Menu */}
        <div className="flex-1 px-4 pt-8 flex flex-col gap-4">
          <button
            onClick={() => { setForm(emptyForm()); if (rooms.length === 1) setForm(f => ({ ...f, roomId: rooms[0].id })); setPageState('form') }}
            className="w-full bg-amber-600 text-white rounded-2xl p-5 text-left shadow-md active:bg-amber-700 transition-colors flex items-center justify-between"
          >
            <div>
              <div className="text-lg font-bold mb-0.5">Nova criança</div>
              <div className="text-sm opacity-80">Cadastrar e fazer check-in</div>
            </div>
            <ChevronRight size={24} className="shrink-0" />
          </button>

          {/* MVP: re-check-in desabilitado */}
          <div className="w-full bg-white border-2 border-amber-100 rounded-2xl p-5 flex items-center justify-between opacity-50">
            <div>
              <div className="text-lg font-bold text-amber-900 mb-0.5">Criança já cadastrada</div>
              <div className="text-sm text-amber-500">Re-check-in rápido</div>
            </div>
            <span className="text-xs bg-amber-100 text-amber-600 px-3 py-1 rounded-full font-semibold shrink-0">
              Em breve
            </span>
          </div>
        </div>

        <p className="text-center text-xs text-amber-400 pb-8 pt-4">
          {rooms.length} sala{rooms.length !== 1 ? 's' : ''} ativa{rooms.length !== 1 ? 's' : ''}
        </p>
      </div>
    )
  }

  // ── Formulário ─────────────────────────────────────────────

  const isSubmitting = pageState === 'submitting'

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col">
      {/* Header */}
      <div className="bg-amber-600 px-5 pt-12 pb-5 text-white">
        <button
          onClick={() => setPageState('menu')}
          className="text-xs opacity-70 mb-2 active:opacity-100"
        >
          ← Voltar
        </button>
        <div className="flex items-center gap-2 opacity-80 mb-1">
          <Baby size={16} />
          <span className="text-xs font-medium">{tokenLabel}</span>
        </div>
        <h1 className="text-xl font-bold">Nova criança</h1>
      </div>

      {/* Formulário com scroll */}
      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5 pb-28">

        {/* Seção: Criança */}
        <Section title="Criança">
          <Field label="Nome *" error={errors.childName}>
            <input
              type="text"
              autoFocus
              placeholder="Nome completo da criança"
              value={form.childName}
              onChange={e => setForm(f => ({ ...f, childName: e.target.value }))}
              className={inputCls(!!errors.childName)}
            />
          </Field>
          <Field label="Data de nascimento">
            <input
              type="date"
              value={form.birthDate}
              onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
              className={inputCls(false)}
            />
          </Field>
        </Section>

        {/* Seção: Dados de saúde */}
        <Section title="Dados de saúde" subtitle="Opcional — salvo somente com consentimento LGPD abaixo">
          <Field label="Alergias">
            <input
              type="text"
              placeholder="Ex: amendoim, glúten, lactose…"
              value={form.allergies}
              onChange={e => setForm(f => ({ ...f, allergies: e.target.value }))}
              className={inputCls(false)}
            />
          </Field>
          <Field label="Síndrome / condição especial">
            <input
              type="text"
              placeholder="Ex: TEA, Síndrome de Down…"
              value={form.syndrome}
              onChange={e => setForm(f => ({ ...f, syndrome: e.target.value }))}
              className={inputCls(false)}
            />
          </Field>
        </Section>

        {/* Seção: Responsáveis */}
        <Section title="Responsável(is)">
          {form.guardians.map((g, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-4 border border-amber-100 flex flex-col gap-3"
            >
              {i > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-amber-600 font-semibold">
                    Responsável {i + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, guardians: f.guardians.filter((_, idx) => idx !== i) }))}
                    className="text-red-400 active:text-red-600 p-1"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
              <Field label={i === 0 ? 'Nome *' : 'Nome *'} error={errors[`g${i}name`]}>
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={g.name}
                  onChange={e => updateGuardian(i, 'name', e.target.value)}
                  className={inputCls(!!errors[`g${i}name`])}
                />
              </Field>
              <Field label="Telefone *" error={errors[`g${i}phone`]}>
                <input
                  type="tel"
                  placeholder="(00) 00000-0000"
                  value={g.phone}
                  onChange={e => updateGuardian(i, 'phone', maskPhone(e.target.value))}
                  inputMode="numeric"
                  className={inputCls(!!errors[`g${i}phone`])}
                />
              </Field>
              <Field label="Vínculo">
                <select
                  value={g.relationship}
                  onChange={e => updateGuardian(i, 'relationship', e.target.value)}
                  className={inputCls(false)}
                >
                  {RELATIONSHIPS.map(r => <option key={r}>{r}</option>)}
                </select>
              </Field>
            </div>
          ))}

          {form.guardians.length < 3 && (
            <button
              type="button"
              onClick={() => setForm(f => ({ ...f, guardians: [...f.guardians, emptyGuardian(false)] }))}
              className="flex items-center gap-2 text-amber-700 font-semibold text-sm py-2 active:opacity-70"
            >
              <Plus size={18} />
              Adicionar outro responsável
            </button>
          )}
        </Section>

        {/* Seção: Check-in */}
        <Section title="Check-in">
          <Field label="Sala *" error={errors.roomId}>
            <select
              value={form.roomId}
              onChange={e => setForm(f => ({ ...f, roomId: e.target.value }))}
              className={inputCls(!!errors.roomId)}
            >
              <option value="">Selecione a sala…</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}{r.age_range ? ` — ${r.age_range}` : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Número da pulseira *" error={errors.wristband}>
            <input
              type="text"
              inputMode="numeric"
              placeholder="Ex: 42"
              value={form.wristband}
              onChange={e => setForm(f => ({ ...f, wristband: e.target.value }))}
              className={`${inputCls(!!errors.wristband)} text-2xl font-black text-center tracking-widest`}
            />
          </Field>
        </Section>

        {/* LGPD */}
        <div
          className={`rounded-2xl p-4 border-2 transition-colors ${
            errors.lgpd
              ? 'border-red-300 bg-red-50'
              : form.lgpdConsent
                ? 'border-green-300 bg-green-50'
                : 'border-amber-200 bg-white'
          }`}
        >
          <label className="flex gap-3 items-start cursor-pointer">
            <input
              type="checkbox"
              checked={form.lgpdConsent}
              onChange={e => setForm(f => ({ ...f, lgpdConsent: e.target.checked }))}
              className="mt-0.5 w-5 h-5 accent-amber-600 shrink-0"
            />
            <span className="text-sm text-amber-900 leading-relaxed">
              O responsável consentiu com o armazenamento dos dados da criança,
              incluindo dados de saúde, conforme a LGPD. *
            </span>
          </label>
          {errors.lgpd && (
            <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={12} /> {errors.lgpd}
            </p>
          )}
        </div>

        {/* Erro de submissão */}
        {submitError && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex gap-2 items-start">
            <AlertCircle size={18} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{submitError}</p>
          </div>
        )}
      </div>

      {/* Botão fixo no rodapé */}
      <div className="fixed bottom-0 left-0 right-0 bg-amber-50/95 backdrop-blur border-t border-amber-200 px-4 py-3 safe-area-inset-bottom">
        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full bg-amber-600 text-white text-lg font-bold py-4 rounded-2xl shadow active:bg-amber-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          {isSubmitting ? (
            <><Loader2 className="animate-spin" size={20} /> Registrando…</>
          ) : (
            'CONFIRMAR CHECK-IN'
          )}
        </button>
      </div>
    </div>
  )
}
