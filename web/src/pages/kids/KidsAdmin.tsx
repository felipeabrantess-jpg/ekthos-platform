/**
 * KidsAdmin — /kids  (INTERNO, admin apenas)
 * Painel CRM do Ministério Kids: gera links, monitora presença, gerencia salas.
 *
 * Acesso: ProtectedRoute + RoleRoute (admin).
 * Dados: queries diretas ao Supabase (RLS admin) — mais limpo do que usar a EF
 *        pública para operações autenticadas de back-office.
 * Saúde: visível ao admin (autorizado); não exposta publicamente.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Baby, Link2, Users, Settings2, Copy, Check, AlertCircle,
  RefreshCw, Trash2, Plus, Loader2, MessageCircle, X,
  LogIn, LogOut, Edit2, ShieldAlert, ToggleLeft, ToggleRight,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

// ── Types ──────────────────────────────────────────────────────────────────

interface Room {
  id:         string
  name:       string
  age_range:  string | null
  active:     boolean
  sort_order: number | null
}

interface AccessToken {
  id:         string
  token:      string
  token_role: 'secretary' | 'teacher'
  room_id:    string | null
  label:      string | null
  valid_date: string
  revoked_at: string | null
  created_at?: string
}

interface CheckinRecord {
  id:               string
  wristband_number: string
  checkin_time:     string
  checkout_time:    string | null
  checked_out_by:   string | null
  room_id:          string
  room_name:        string
  child_id:         string
  child_name:       string
  health_summary:   string | null
}

type Tab = 'links' | 'presentes' | 'salas'

// ── Helpers ────────────────────────────────────────────────────────────────

function todayBRT(): string {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().split('T')[0]
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function summarizeHealth(row: {
  allergies:            string | null
  syndrome:             string | null
  emergency_medication: string | null
} | null): string | null {
  if (!row) return null
  const parts: string[] = []
  if (row.allergies)            parts.push(`Alérgico a: ${row.allergies}`)
  if (row.syndrome)             parts.push(row.syndrome)
  if (row.emergency_medication) parts.push('Medicação de emergência')
  return parts.length > 0 ? parts.join(' | ') : null
}

function tokenPageUrl(t: AccessToken): string {
  const base = window.location.origin
  return t.token_role === 'secretary'
    ? `${base}/kids/checkin/${t.token}`
    : `${base}/kids/sala/${t.token}`
}

function waUrl(url: string, label: string): string {
  const msg =
    `Olá! 👋 Segue seu link Kids Check-in para hoje:\n\n` +
    `*${label}*\n${url}\n\n_Válido apenas hoje._`
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

// ── Main component ─────────────────────────────────────────────────────────

export default function KidsAdmin() {
  const { churchId, role, isEkthosAdmin } = useAuth()

  const [tab,          setTab]          = useState<Tab>('links')
  const [selectedDate, setSelectedDate] = useState(todayBRT())

  // Rooms — shared across tabs
  const [rooms,        setRooms]        = useState<Room[]>([])
  const [roomsLoading, setRoomsLoading] = useState(true)

  // Links tab
  const [tokens,        setTokens]        = useState<AccessToken[]>([])
  const [tokensLoading, setTokensLoading] = useState(false)
  const [generating,    setGenerating]    = useState(false)
  const [copiedId,      setCopiedId]      = useState<string | null>(null)
  const [linkError,     setLinkError]     = useState<string | null>(null)

  // Presentes tab
  const [checkins,        setCheckins]        = useState<CheckinRecord[]>([])
  const [checkinsLoading, setCheckinsLoading] = useState(false)

  // Salas tab
  const [editingRoom, setEditingRoom] = useState<Room | null>(null)
  const [showRoomForm, setShowRoomForm] = useState(false)
  const [roomForm, setRoomForm] = useState({ name: '', age_range: '', sort_order: '' })
  const [roomSaving, setRoomSaving] = useState(false)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  // ── Data loaders ────────────────────────────────────────────

  const loadRooms = useCallback(async () => {
    if (!churchId) return
    setRoomsLoading(true)
    const { data } = await supabase
      .from('kids_rooms')
      .select('id, name, age_range, active, sort_order')
      .eq('church_id', churchId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name')
    setRooms(data ?? [])
    setRoomsLoading(false)
  }, [churchId])

  const loadTokens = useCallback(async () => {
    if (!churchId) return
    setTokensLoading(true)
    const { data } = await supabase
      .from('kids_access_tokens')
      .select('id, token, token_role, room_id, label, valid_date, revoked_at, created_at')
      .eq('church_id', churchId)
      .eq('valid_date', selectedDate)
      .order('created_at', { ascending: true })
    setTokens(data ?? [])
    setTokensLoading(false)
  }, [churchId, selectedDate])

  const loadCheckins = useCallback(async () => {
    if (!churchId) return
    setCheckinsLoading(true)

    const { data: raw } = await supabase
      .from('kids_checkins')
      .select(`
        id, wristband_number, checkin_time, checkout_time, checked_out_by, room_id,
        kids_children ( id, name ),
        kids_rooms    ( id, name )
      `)
      .eq('church_id', churchId)
      .eq('event_date', selectedDate)
      .order('checkin_time', { ascending: true })

    if (!raw?.length) { setCheckins([]); setCheckinsLoading(false); return }

    const childIds = raw.map(c => (c.kids_children as any)?.id).filter(Boolean)
    const { data: healthRows } = await supabase
      .from('person_health_info')
      .select('child_id, allergies, syndrome, emergency_medication')
      .in('child_id', childIds)

    const healthMap = new Map((healthRows ?? []).map(h => [h.child_id, h]))

    setCheckins(raw.map(c => {
      const child = c.kids_children as any
      const room  = c.kids_rooms  as any
      return {
        id:               c.id,
        wristband_number: c.wristband_number,
        checkin_time:     c.checkin_time,
        checkout_time:    c.checkout_time ?? null,
        checked_out_by:   c.checked_out_by ?? null,
        room_id:          c.room_id,
        room_name:        room?.name ?? '—',
        child_id:         child?.id ?? '',
        child_name:       child?.name ?? '—',
        health_summary:   summarizeHealth(healthMap.get(child?.id) ?? null),
      }
    }))
    setCheckinsLoading(false)
  }, [churchId, selectedDate])

  useEffect(() => { void loadRooms() }, [loadRooms])

  useEffect(() => {
    if (tab === 'links')     void loadTokens()
    if (tab === 'presentes') void loadCheckins()
  }, [tab, selectedDate, loadTokens, loadCheckins])

  // ── Actions ─────────────────────────────────────────────────

  async function generateLinks() {
    if (!churchId) return
    setGenerating(true)
    setLinkError(null)
    try {
      const activeRooms = rooms.filter(r => r.active)
      if (activeRooms.length === 0) {
        setLinkError('Nenhuma sala ativa encontrada. Crie salas na aba "Salas" primeiro.')
        return
      }
      const inserts = [
        {
          church_id:  churchId,
          token:      crypto.randomUUID(),
          token_role: 'secretary' as const,
          room_id:    null,
          label:      'Secretária Kids',
          valid_date: selectedDate,
          revoked_at: null,
        },
        ...activeRooms.map(r => ({
          church_id:  churchId,
          token:      crypto.randomUUID(),
          token_role: 'teacher' as const,
          room_id:    r.id,
          label:      `Professora — ${r.name}`,
          valid_date: selectedDate,
          revoked_at: null,
        })),
      ]
      const { error } = await supabase.from('kids_access_tokens').insert(inserts)
      if (error) throw error
      await loadTokens()
    } catch (err: any) {
      setLinkError(err?.message ?? 'Erro ao gerar links.')
    } finally {
      setGenerating(false)
    }
  }

  async function revokeToken(id: string) {
    await supabase
      .from('kids_access_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
    await loadTokens()
  }

  async function copyUrl(t: AccessToken) {
    await navigator.clipboard.writeText(tokenPageUrl(t))
    setCopiedId(t.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  async function toggleRoom(room: Room) {
    setTogglingId(room.id)
    await supabase
      .from('kids_rooms')
      .update({ active: !room.active })
      .eq('id', room.id)
    setTogglingId(null)
    await loadRooms()
  }

  function openEditRoom(room: Room) {
    setEditingRoom(room)
    setRoomForm({
      name:       room.name,
      age_range:  room.age_range ?? '',
      sort_order: room.sort_order != null ? String(room.sort_order) : '',
    })
    setShowRoomForm(true)
    setRoomError(null)
  }

  function openAddRoom() {
    setEditingRoom(null)
    setRoomForm({ name: '', age_range: '', sort_order: '' })
    setShowRoomForm(true)
    setRoomError(null)
  }

  function cancelRoomForm() {
    setEditingRoom(null)
    setShowRoomForm(false)
    setRoomError(null)
  }

  async function saveRoom() {
    if (!churchId || !roomForm.name.trim()) {
      setRoomError('Nome da sala é obrigatório.')
      return
    }
    setRoomSaving(true)
    setRoomError(null)
    const payload = {
      church_id:  churchId,
      name:       roomForm.name.trim(),
      age_range:  roomForm.age_range.trim() || null,
      sort_order: roomForm.sort_order ? parseInt(roomForm.sort_order, 10) : null,
      active:     true,
    }
    const { error } = editingRoom
      ? await supabase.from('kids_rooms').update(payload).eq('id', editingRoom.id)
      : await supabase.from('kids_rooms').insert(payload)
    if (error) { setRoomError(error.message); setRoomSaving(false); return }
    cancelRoomForm()
    setRoomSaving(false)
    await loadRooms()
  }

  // ── Role guard ───────────────────────────────────────────────

  if (!churchId) {
    return <div className="flex justify-center py-16"><Loader2 className="animate-spin" size={28} /></div>
  }

  if (role !== 'admin' && !isEkthosAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <ShieldAlert size={36} style={{ color: 'var(--text-tertiary)' }} />
        <p style={{ color: 'var(--text-secondary)' }}>Acesso restrito a administradores.</p>
      </div>
    )
  }

  // ── Derived data ─────────────────────────────────────────────

  const present   = checkins.filter(c => !c.checkout_time)
  const checkedOut = checkins.filter(c => !!c.checkout_time)

  // Group present by room
  const byRoom = rooms.reduce<Record<string, CheckinRecord[]>>((acc, r) => {
    acc[r.id] = present.filter(c => c.room_id === r.id)
    return acc
  }, {})

  const activeTokens  = tokens.filter(t => !t.revoked_at)
  const revokedTokens = tokens.filter(t => !!t.revoked_at)

  // ── Render ───────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Baby size={22} style={{ color: 'var(--color-primary)' }} />
          <h1
            className="text-2xl font-bold"
            style={{ fontFamily: 'var(--font-display)', color: 'var(--text-primary)' }}
          >
            Ministério Kids
          </h1>
        </div>
        {(tab === 'links' || tab === 'presentes') && (
          <div className="flex items-center gap-2">
            <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Data:</label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="text-sm px-3 py-1.5 rounded-xl border outline-none"
              style={{ borderColor: 'var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)' }}
            />
            {selectedDate === todayBRT() && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
                hoje
              </span>
            )}
            <button
              onClick={() => { if (tab === 'links') void loadTokens(); else void loadCheckins() }}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-secondary)' }}
              title="Atualizar"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-0 border-b" style={{ borderColor: 'var(--border-default)' }}>
        {([
          { id: 'links',     label: 'Links do dia',  Icon: Link2     },
          { id: 'presentes', label: 'Presentes',     Icon: Users     },
          { id: 'salas',     label: 'Salas',         Icon: Settings2 },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap"
            style={{
              borderBottomColor: tab === id ? 'var(--color-primary)' : 'transparent',
              color: tab === id ? 'var(--color-primary)' : 'var(--text-secondary)',
            }}
          >
            <Icon size={14} />
            {label}
            {id === 'presentes' && present.length > 0 && (
              <span
                className="ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full"
                style={{ background: 'var(--color-primary)', color: '#fff' }}
              >
                {present.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════
          TAB: LINKS
      ═══════════════════════════════════════════════════════ */}
      {tab === 'links' && (
        <div className="space-y-4">

          {/* Ações */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {activeTokens.length > 0
                ? `${activeTokens.length} link(s) ativo(s) — ${checkins.length} check-in(s) registrado(s).`
                : 'Nenhum link gerado para esta data.'}
            </p>
            <button
              onClick={() => void generateLinks()}
              disabled={generating || roomsLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              {generating ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              Gerar links do dia
            </button>
          </div>

          {linkError && (
            <div className="flex items-start gap-2 rounded-xl p-3 text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              <AlertCircle size={15} className="shrink-0 mt-0.5" />
              {linkError}
            </div>
          )}

          {tokensLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            </div>
          ) : tokens.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-14 rounded-2xl text-center gap-3"
              style={{ border: '1.5px dashed var(--border-default)', background: 'var(--bg-card)' }}
            >
              <Link2 size={32} style={{ color: 'var(--text-tertiary)' }} />
              <div>
                <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhum link gerado</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  Clique em "Gerar links do dia" para criar os acessos de hoje
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Ativos primeiro */}
              {activeTokens.map(t => {
                const url = tokenPageUrl(t)
                return (
                  <div
                    key={t.id}
                    className="rounded-2xl p-4"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                            {t.label ?? (t.token_role === 'secretary' ? 'Secretária' : 'Professora')}
                          </span>
                          <span
                            className="text-xs px-2 py-0.5 rounded-full font-medium"
                            style={{
                              background: t.token_role === 'secretary' ? 'var(--info-bg)' : 'var(--warning-bg)',
                              color:      t.token_role === 'secretary' ? 'var(--info)'    : 'var(--warning)',
                            }}
                          >
                            {t.token_role === 'secretary' ? 'Secretária' : 'Professora'}
                          </span>
                        </div>
                        <p className="text-xs truncate" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                          {url}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => void copyUrl(t)}
                          title="Copiar link"
                          className="p-2 rounded-lg transition-colors hover:bg-black/5"
                          style={{ color: copiedId === t.id ? 'var(--success)' : 'var(--text-secondary)' }}
                        >
                          {copiedId === t.id ? <Check size={15} /> : <Copy size={15} />}
                        </button>
                        <a
                          href={waUrl(url, t.label ?? '')}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Enviar no WhatsApp"
                          className="p-2 rounded-lg hover:bg-black/5"
                          style={{ color: '#25D366' }}
                        >
                          <MessageCircle size={15} />
                        </a>
                        <button
                          onClick={() => void revokeToken(t.id)}
                          title="Revogar link"
                          className="p-2 rounded-lg hover:bg-black/5"
                          style={{ color: 'var(--danger)' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Revogados */}
              {revokedTokens.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs cursor-pointer select-none" style={{ color: 'var(--text-tertiary)' }}>
                    {revokedTokens.length} link(s) revogado(s)
                  </summary>
                  <div className="space-y-2 mt-2">
                    {revokedTokens.map(t => (
                      <div
                        key={t.id}
                        className="rounded-2xl px-4 py-3 opacity-50"
                        style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-default)' }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
                            {t.label}
                          </span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
                            Revogado
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: PRESENTES
      ═══════════════════════════════════════════════════════ */}
      {tab === 'presentes' && (
        <div className="space-y-6">
          {checkinsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            </div>
          ) : checkins.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-14 rounded-2xl text-center gap-3"
              style={{ border: '1.5px dashed var(--border-default)', background: 'var(--bg-card)' }}
            >
              <Users size={32} style={{ color: 'var(--text-tertiary)' }} />
              <div>
                <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhum check-in registrado</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  Para {selectedDate === todayBRT() ? 'hoje' : selectedDate}
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Resumo por sala */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div
                  className="rounded-2xl p-4 text-center"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
                >
                  <p className="text-3xl font-black" style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-mono)' }}>
                    {present.length}
                  </p>
                  <p className="text-xs font-medium mt-0.5" style={{ color: 'var(--text-secondary)' }}>Total presentes</p>
                </div>
                {rooms.filter(r => r.active).map(r => (
                  <div
                    key={r.id}
                    className="rounded-2xl p-4 text-center"
                    style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
                  >
                    <p className="text-3xl font-black" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {(byRoom[r.id] ?? []).length}
                    </p>
                    <p className="text-xs font-medium mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{r.name}</p>
                  </div>
                ))}
              </div>

              {/* Por sala: crianças presentes */}
              {rooms.filter(r => r.active && (byRoom[r.id] ?? []).length > 0).map(r => (
                <div key={r.id} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base" style={{ color: 'var(--text-primary)' }}>{r.name}</h3>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: 'var(--color-primary)', color: '#fff' }}
                    >
                      {(byRoom[r.id] ?? []).length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {(byRoom[r.id] ?? []).map(c => (
                      <div
                        key={c.id}
                        className="rounded-xl p-3"
                        style={{
                          background: 'var(--bg-card)',
                          border: c.health_summary
                            ? '1.5px solid var(--danger)'
                            : '1px solid var(--border-default)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                                {c.child_name}
                              </span>
                              <span className="text-xs font-bold" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                                #{c.wristband_number}
                              </span>
                            </div>
                            <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: 'var(--text-tertiary)' }}>
                              <LogIn size={11} />
                              {fmtTime(c.checkin_time)}
                            </p>
                          </div>
                          {c.health_summary && (
                            <div className="flex items-start gap-1.5 max-w-xs">
                              <AlertCircle size={14} className="shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} />
                              <p className="text-xs leading-snug" style={{ color: 'var(--danger)' }}>
                                {c.health_summary}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Crianças que saíram */}
              {checkedOut.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base" style={{ color: 'var(--text-secondary)' }}>Já saíram</h3>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold"
                      style={{ background: 'var(--success-bg)', color: 'var(--success)' }}
                    >
                      {checkedOut.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {checkedOut.map(c => (
                      <div
                        key={c.id}
                        className="rounded-xl px-4 py-3 flex items-center justify-between gap-3 opacity-60"
                        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
                      >
                        <div className="flex items-center gap-3">
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                              {c.child_name}
                              <span className="ml-2 text-xs" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                                #{c.wristband_number}
                              </span>
                            </p>
                            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{c.room_name}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs flex items-center gap-1 justify-end" style={{ color: 'var(--success)' }}>
                            <LogOut size={11} />
                            {c.checkout_time ? fmtTime(c.checkout_time) : '—'}
                          </p>
                          {c.checked_out_by && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                              por {c.checked_out_by}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
          TAB: SALAS
      ═══════════════════════════════════════════════════════ */}
      {tab === 'salas' && (
        <div className="space-y-4">

          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {rooms.filter(r => r.active).length} sala(s) ativa(s)
            </p>
            <button
              onClick={openAddRoom}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{ background: 'var(--color-primary)', color: '#fff' }}
            >
              <Plus size={13} />
              Nova sala
            </button>
          </div>

          {/* Form add/edit */}
          {showRoomForm && (
            <div
              className="rounded-2xl p-5 space-y-4"
              style={{ background: 'var(--bg-card)', border: '1.5px solid var(--color-primary)' }}
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>
                  {editingRoom ? `Editar — ${editingRoom.name}` : 'Nova sala'}
                </h3>
                <button onClick={cancelRoomForm} style={{ color: 'var(--text-tertiary)' }}>
                  <X size={16} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Nome *
                  </label>
                  <input
                    type="text"
                    value={roomForm.name}
                    onChange={e => setRoomForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Ex: Maternal"
                    className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                    style={{ borderColor: 'var(--border-default)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Faixa etária
                  </label>
                  <input
                    type="text"
                    value={roomForm.age_range}
                    onChange={e => setRoomForm(f => ({ ...f, age_range: e.target.value }))}
                    placeholder="Ex: 2 a 6 anos"
                    className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                    style={{ borderColor: 'var(--border-default)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold mb-1 block" style={{ color: 'var(--text-secondary)' }}>
                    Ordem (sort)
                  </label>
                  <input
                    type="number"
                    value={roomForm.sort_order}
                    onChange={e => setRoomForm(f => ({ ...f, sort_order: e.target.value }))}
                    placeholder="1, 2, 3…"
                    className="w-full px-3 py-2 rounded-xl text-sm border outline-none"
                    style={{ borderColor: 'var(--border-default)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
                  />
                </div>
              </div>

              {roomError && (
                <p className="text-xs" style={{ color: 'var(--danger)' }}>{roomError}</p>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={cancelRoomForm}
                  className="px-4 py-2 rounded-xl text-sm border"
                  style={{ borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={() => void saveRoom()}
                  disabled={roomSaving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                  style={{ background: 'var(--color-primary)', color: '#fff' }}
                >
                  {roomSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Salvar
                </button>
              </div>
            </div>
          )}

          {/* Rooms list */}
          {roomsLoading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="animate-spin" style={{ color: 'var(--color-primary)' }} />
            </div>
          ) : rooms.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-14 rounded-2xl text-center gap-3"
              style={{ border: '1.5px dashed var(--border-default)', background: 'var(--bg-card)' }}
            >
              <Settings2 size={32} style={{ color: 'var(--text-tertiary)' }} />
              <div>
                <p className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Nenhuma sala cadastrada</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                  Clique em "Nova sala" para começar
                </p>
              </div>
            </div>
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid var(--border-default)' }}
            >
              {rooms.map((room, idx) => (
                <div
                  key={room.id}
                  className="flex items-center gap-4 px-5 py-4"
                  style={{
                    background:  'var(--bg-card)',
                    borderTop:   idx > 0 ? '1px solid var(--border-default)' : 'none',
                    opacity:     room.active ? 1 : 0.5,
                  }}
                >
                  <div className="w-7 h-7 flex items-center justify-center rounded-lg text-xs font-bold shrink-0"
                    style={{ background: room.active ? 'var(--color-primary)' : 'var(--border-default)', color: room.active ? '#fff' : 'var(--text-tertiary)' }}
                  >
                    {room.sort_order ?? '—'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{room.name}</p>
                    {room.age_range && (
                      <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{room.age_range}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => openEditRoom(room)}
                      title="Editar"
                      className="p-2 rounded-lg hover:bg-black/5"
                      style={{ color: 'var(--text-secondary)' }}
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => void toggleRoom(room)}
                      disabled={togglingId === room.id}
                      title={room.active ? 'Desativar' : 'Ativar'}
                      className="p-2 rounded-lg hover:bg-black/5 disabled:opacity-50"
                      style={{ color: room.active ? 'var(--success)' : 'var(--text-tertiary)' }}
                    >
                      {togglingId === room.id
                        ? <Loader2 size={15} className="animate-spin" />
                        : room.active
                          ? <ToggleRight size={18} />
                          : <ToggleLeft size={18} />
                      }
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
