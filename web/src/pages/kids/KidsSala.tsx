/**
 * KidsSala — /kids/sala/:token  (PÚBLICA — sem login, sem sidebar)
 * Página da professora para check-out de crianças no Kids.
 *
 * Segurança:
 *   - Token validado pela EF (role=teacher obrigatório).
 *   - church_id e room_id vêm SEMPRE do token (nunca do cliente).
 *   - guardian_verified=true obrigatório na EF — trava impossível de bypassar.
 *   - Alerta de saúde exibido ANTES da tela de confirmação.
 *
 * UX: mobile-first 375px — professora usa na correria da saída com pais esperando.
 * Botões grandes. Alerta de saúde em vermelho muito visível. Trava clara.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams }                         from 'react-router-dom'
import {
  Baby, AlertCircle, Users, CheckCircle2, Loader2,
  Search, Phone, X, ShieldCheck, RefreshCw,
} from 'lucide-react'

const EF_URL = `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/kids-checkin-handler`

// ── Types ─────────────────────────────────────────────────────

interface Guardian {
  name:         string
  phone:        string
  relationship: string | null
  is_primary:   boolean
}

interface PresentChild {
  checkin_id:       string
  wristband_number: string
  checkin_time:     string
  child_name:       string
  child_age:        number | null
  has_health_alert: boolean
  guardian_primary: { name: string; phone: string } | null
  room:             { id: string; name: string } | null
}

interface ChildDetail {
  checkin_id:       string
  wristband_number: string
  child: {
    id:   string
    name: string
    age:  number | null
  }
  health_alert: string | null
  guardians:    Guardian[]
}

type PageState =
  | 'loading'
  | 'invalid'
  | 'ready'
  | 'detail-loading'
  | 'detail'
  | 'checking-out'
  | 'success'

interface SuccessData {
  childName:    string
  checkoutTime: string
}

// ── Main component ────────────────────────────────────────────

export default function KidsSala() {
  const { token } = useParams<{ token: string }>()

  const [pageState,   setPageState]   = useState<PageState>('loading')
  const [churchName,  setChurchName]  = useState('')
  const [tokenLabel,  setTokenLabel]  = useState('')
  const [roomName,    setRoomName]    = useState('')
  const [children,    setChildren]    = useState<PresentChild[]>([])
  const [search,      setSearch]      = useState('')
  const [detail,      setDetail]      = useState<ChildDetail | null>(null)
  const [confirmed,   setConfirmed]   = useState(false)
  const [teacherName, setTeacherName] = useState('')
  const [checkoutErr, setCheckoutErr] = useState('')
  const [success,     setSuccess]     = useState<SuccessData | null>(null)
  const [refreshing,  setRefreshing]  = useState(false)

  // ── Carrega token + lista de crianças presentes ─────────────
  const loadRoom = useCallback(async (isRefresh = false) => {
    if (!token) { setPageState('invalid'); return }
    if (isRefresh) setRefreshing(true)

    try {
      // 1. Valida token e obtém contexto (church_name, token_role, rooms[])
      const metaRes = await fetch(
        `${EF_URL}?action=rooms&token=${encodeURIComponent(token)}`
      )
      if (!metaRes.ok) { setPageState('invalid'); return }
      const meta = await metaRes.json()
      if (meta.token_role !== 'teacher') { setPageState('invalid'); return }

      setChurchName(meta.church_name ?? '')
      setTokenLabel(meta.token_label ?? '')

      // 2. Lista crianças presentes na sala da professora
      const roomRes = await fetch(`${EF_URL}?action=room`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!roomRes.ok) { setPageState('invalid'); return }
      const roomData = await roomRes.json()

      setChildren(roomData.present ?? [])

      // Resolve nome da sala: primeiro filho → room_id em meta.rooms → token_label
      const firstRoomName = (roomData.present ?? [])[0]?.room?.name as string | undefined
      if (firstRoomName) {
        setRoomName(firstRoomName)
      } else if (roomData.room_id) {
        const found = (meta.rooms ?? []).find(
          (r: { id: string; name: string }) => r.id === roomData.room_id
        )
        setRoomName(found?.name ?? meta.token_label ?? 'Sala')
      } else {
        setRoomName(meta.token_label ?? 'Sala')
      }

      if (!isRefresh) setPageState('ready')
    } catch {
      if (!isRefresh) setPageState('invalid')
    } finally {
      if (isRefresh) {
        setRefreshing(false)
        setPageState('ready')
      }
    }
  }, [token])

  useEffect(() => {
    loadRoom().catch(() => setPageState('invalid'))
  }, [loadRoom])

  // ── Abre detalhe da criança (busca full na EF) ─────────────
  const openDetail = useCallback(async (wristband: string) => {
    setPageState('detail-loading')
    setConfirmed(false)
    setCheckoutErr('')

    try {
      const res = await fetch(
        `${EF_URL}?action=search&wristband=${encodeURIComponent(wristband)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      if (!res.ok) {
        const err = await res.json()
        setCheckoutErr(err.error ?? 'Criança não encontrada. Tente novamente.')
        setPageState('ready')
        return
      }
      const d = await res.json()
      setDetail({
        checkin_id:       d.checkin_id,
        wristband_number: d.wristband_number,
        child:            d.child,
        health_alert:     d.health_alert ?? null,
        guardians:        d.guardians ?? [],
      })
      setPageState('detail')
    } catch {
      setCheckoutErr('Falha de conexão. Tente novamente.')
      setPageState('ready')
    }
  }, [token])

  // ── Fecha detalhe ──────────────────────────────────────────
  const closeDetail = () => {
    setDetail(null)
    setConfirmed(false)
    setCheckoutErr('')
    setPageState('ready')
  }

  // ── Confirma saída ─────────────────────────────────────────
  const handleCheckout = useCallback(async () => {
    if (!detail || !confirmed) return
    setPageState('checking-out')
    setCheckoutErr('')

    try {
      const res = await fetch(EF_URL, {
        method:  'PATCH',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${token}`,
        },
        body: JSON.stringify({
          wristband_number:  detail.wristband_number,
          checked_out_by:    teacherName.trim() || 'Professora',
          guardian_verified: true,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setCheckoutErr(err.error ?? 'Erro ao registrar saída. Tente novamente.')
        setPageState('detail')
        return
      }

      const data = await res.json()
      const childName = detail.child.name

      // Remove da lista local otimistamente
      setChildren(prev =>
        prev.filter(c => c.wristband_number !== detail.wristband_number)
      )
      setDetail(null)
      setConfirmed(false)
      setSuccess({ childName, checkoutTime: data.checkout_time })
      setPageState('success')

      // Volta para a lista após 2.5s
      setTimeout(() => {
        setSuccess(null)
        setPageState('ready')
      }, 2500)
    } catch {
      setCheckoutErr('Falha de conexão. Tente novamente.')
      setPageState('detail')
    }
  }, [detail, confirmed, teacherName, token])

  // ── Filtro local de busca ──────────────────────────────────
  const filtered = search.trim()
    ? children.filter(c =>
        c.wristband_number.includes(search.trim()) ||
        c.child_name.toLowerCase().includes(search.trim().toLowerCase())
      )
    : children

  // ── Renders ────────────────────────────────────────────────

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

  // Flash de sucesso (2.5s antes de voltar à lista)
  if (pageState === 'success' && success) {
    return (
      <div className="min-h-screen bg-amber-50 flex flex-col items-center justify-center px-6 text-center">
        <div className="bg-white rounded-3xl p-8 shadow-sm border border-amber-100 max-w-sm w-full">
          <CheckCircle2 size={64} className="text-green-500 mx-auto mb-4" />
          <p className="text-sm text-green-600 font-semibold uppercase tracking-wide mb-1">
            Saída registrada
          </p>
          <h1 className="text-2xl font-bold text-amber-900 mb-2">{success.childName}</h1>
          <p className="text-amber-500 text-sm">
            {new Date(success.checkoutTime).toLocaleTimeString('pt-BR', {
              hour: '2-digit', minute: '2-digit',
            })}
          </p>
        </div>
      </div>
    )
  }

  const isDetailActive  = pageState === 'detail' || pageState === 'checking-out'
  const isDetailLoading = pageState === 'detail-loading'
  const isCheckingOut   = pageState === 'checking-out'

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col">

      {/* ── Header ──────────────────────────────────────────── */}
      <div className="bg-amber-600 px-5 pt-10 pb-5 text-white">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 opacity-80">
            <Baby size={16} />
            <span className="text-xs font-medium">{churchName}</span>
          </div>
          <button
            onClick={() => loadRoom(true)}
            disabled={refreshing}
            aria-label="Atualizar lista"
            className="opacity-80 active:opacity-100 p-1 disabled:opacity-40"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold leading-tight">
            {tokenLabel || 'Check-out Kids'}
          </h1>
          <span className="bg-white/20 text-white text-sm font-bold px-3 py-1 rounded-full shrink-0">
            {children.length} {children.length === 1 ? 'criança' : 'crianças'}
          </span>
        </div>
        {roomName && (
          <p className="text-sm opacity-80 mt-0.5">Sala: {roomName}</p>
        )}
      </div>

      {/* ── Busca ───────────────────────────────────────────── */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-400"
          />
          <input
            type="text"
            inputMode="search"
            placeholder="Buscar por nome ou número da pulseira…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-3 rounded-2xl border-2 border-amber-200 bg-white text-amber-900 text-sm outline-none focus:border-amber-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-400"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Erro não-fatal (ex: busca por pulseira que não existe) */}
      {checkoutErr && pageState === 'ready' && (
        <div className="mx-4 mb-2 bg-red-50 border border-red-200 rounded-2xl p-3 flex gap-2 items-start">
          <AlertCircle size={15} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{checkoutErr}</p>
        </div>
      )}

      {/* ── Lista de crianças presentes ──────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 flex flex-col gap-3 pt-2">
        {children.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Users size={44} className="text-amber-300 mb-3" />
            <p className="text-amber-700 font-semibold">Nenhuma criança na sala ainda</p>
            <p className="text-amber-500 text-sm mt-1">
              As crianças aparecem aqui após o check-in da secretária
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-amber-500 text-sm">Nenhum resultado para "{search}"</p>
          </div>
        ) : (
          filtered.map(child => (
            <button
              key={child.checkin_id}
              onClick={() => openDetail(child.wristband_number)}
              disabled={isDetailLoading}
              className="w-full bg-white rounded-2xl p-4 border-2 border-amber-100 text-left active:border-amber-400 active:bg-amber-50 transition-colors disabled:opacity-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-amber-900 text-base leading-tight truncate">
                    {child.child_name}
                  </p>
                  <p className="text-amber-500 text-sm mt-0.5">
                    Pulseira{' '}
                    <span className="font-black text-amber-700 text-xl">
                      #{child.wristband_number}
                    </span>
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {child.has_health_alert && (
                    <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full flex items-center gap-1">
                      <AlertCircle size={11} /> Saúde ⚠️
                    </span>
                  )}
                  <span className="text-xs text-amber-400">
                    {new Date(child.checkin_time).toLocaleTimeString('pt-BR', {
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
              {child.guardian_primary && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-400">
                  <Phone size={11} />
                  <span className="truncate">{child.guardian_primary.name}</span>
                </div>
              )}
            </button>
          ))
        )}
      </div>

      {/* ── Loading overlay ao abrir detalhe ─────────────────── */}
      {isDetailLoading && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-end">
          <div className="bg-white rounded-t-3xl p-8 w-full text-center shadow-2xl">
            <Loader2 className="animate-spin text-amber-500 mx-auto mb-2" size={32} />
            <p className="text-amber-700 text-sm font-medium">Carregando dados da criança…</p>
          </div>
        </div>
      )}

      {/* ── Bottom sheet: detalhe + check-out ───────────────── */}
      {isDetailActive && detail && (
        <>
          {/* Backdrop — fecha ao tocar (exceto durante submissão) */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={!isCheckingOut ? closeDetail : undefined}
          />

          <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto">
            {/* Handle visual */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 bg-amber-200 rounded-full" />
            </div>

            {/* Botão fechar */}
            {!isCheckingOut && (
              <button
                onClick={closeDetail}
                className="absolute top-4 right-4 text-amber-400 active:text-amber-700 p-1"
                aria-label="Fechar"
              >
                <X size={22} />
              </button>
            )}

            <div className="px-5 pb-10 flex flex-col gap-5">

              {/* Dados da criança */}
              <div className="pt-2">
                <p className="text-xs text-amber-500 font-semibold uppercase tracking-wide mb-1">
                  Criança
                </p>
                <p className="text-2xl font-black text-amber-900 leading-tight">
                  {detail.child.name}
                </p>
                <p className="text-amber-600 mt-0.5">
                  Pulseira{' '}
                  <span className="font-black text-amber-700 text-xl">
                    #{detail.wristband_number}
                  </span>
                  {detail.child.age != null && (
                    <span className="text-amber-400 text-sm"> · {detail.child.age} anos</span>
                  )}
                </p>
              </div>

              {/* ⚠️ Alerta de saúde — destaque máximo */}
              {detail.health_alert && (
                <div className="bg-red-50 border-2 border-red-400 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertCircle size={20} className="text-red-600 shrink-0" />
                    <p className="font-black text-red-700 text-base">⚠️ ALERTA DE SAÚDE</p>
                  </div>
                  <p className="text-red-700 text-sm leading-relaxed font-medium">
                    {detail.health_alert}
                  </p>
                </div>
              )}

              {/* Responsáveis autorizados */}
              <div>
                <p className="text-xs text-amber-500 font-semibold uppercase tracking-wide mb-2">
                  Responsável(is) autorizado(s)
                </p>
                {detail.guardians.length === 0 ? (
                  <p className="text-amber-400 text-sm">Nenhum responsável cadastrado</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {detail.guardians.map((g, i) => (
                      <div
                        key={i}
                        className={`rounded-2xl p-4 border-2 ${
                          g.is_primary
                            ? 'border-amber-300 bg-amber-50'
                            : 'border-amber-100 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <div>
                            <p className="font-bold text-amber-900">{g.name}</p>
                            {g.relationship && (
                              <p className="text-xs text-amber-500 mt-0.5">{g.relationship}</p>
                            )}
                          </div>
                          {g.is_primary && (
                            <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded-full font-semibold shrink-0">
                              Principal
                            </span>
                          )}
                        </div>
                        <a
                          href={`tel:${g.phone.replace(/\D/g, '')}`}
                          className="flex items-center gap-1.5 text-amber-700 font-medium text-sm active:text-amber-900"
                          onClick={e => e.stopPropagation()}
                        >
                          <Phone size={14} />
                          {g.phone}
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Divisor visual */}
              <div className="border-t-2 border-dashed border-amber-100" />

              {/* ⚠️ Trava de segurança — confirmação obrigatória */}
              <div
                className={`rounded-2xl p-4 border-2 transition-colors ${
                  confirmed
                    ? 'border-green-400 bg-green-50'
                    : 'border-amber-200 bg-amber-50'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <ShieldCheck
                    size={20}
                    className={confirmed ? 'text-green-600' : 'text-amber-500'}
                  />
                  <p className="font-bold text-amber-900 text-sm">
                    Confirme antes de liberar
                  </p>
                </div>
                <p className="text-amber-800 text-sm leading-relaxed mb-3">
                  Quem está retirando <strong>{detail.child.name}</strong>{' '}
                  é o(a) responsável cadastrado(a) acima?
                </p>
                <label className="flex gap-3 items-start cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={e => setConfirmed(e.target.checked)}
                    disabled={isCheckingOut}
                    className="mt-0.5 w-6 h-6 accent-green-600 shrink-0"
                  />
                  <span className="text-sm font-bold text-amber-900 leading-relaxed">
                    ✅ Confirmei a identidade do responsável
                  </span>
                </label>
              </div>

              {/* Nome da professora (opcional, para auditoria) */}
              <div>
                <label className="text-xs text-amber-500 font-semibold uppercase tracking-wide mb-1.5 block">
                  Seu nome (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Nome da professora"
                  value={teacherName}
                  onChange={e => setTeacherName(e.target.value)}
                  disabled={isCheckingOut}
                  className="w-full rounded-xl px-4 py-3 text-sm text-amber-900 bg-white border-2 border-amber-200 outline-none focus:border-amber-500 disabled:opacity-50"
                />
              </div>

              {/* Erro de check-out */}
              {checkoutErr && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-3 flex gap-2 items-start">
                  <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-red-700">{checkoutErr}</p>
                </div>
              )}

              {/* Botão CONFIRMAR SAÍDA — desabilitado até checkbox marcado */}
              <button
                onClick={handleCheckout}
                disabled={!confirmed || isCheckingOut}
                className="w-full bg-amber-600 text-white text-lg font-bold py-4 rounded-2xl shadow active:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {isCheckingOut ? (
                  <>
                    <Loader2 className="animate-spin" size={20} />
                    Registrando saída…
                  </>
                ) : (
                  'CONFIRMAR SAÍDA'
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
