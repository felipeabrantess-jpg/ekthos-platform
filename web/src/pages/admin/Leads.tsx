// ============================================================
// Admin — Leads: pastores interessados nos planos consultivos
// Rota: /admin/leads
// ============================================================

import { useEffect, useState } from 'react'
import {
  UserPlus, RefreshCw, Phone, Mail, ChevronRight,
  X, Check, Building2, Users, MessageCircle,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import Spinner from '@/components/ui/Spinner'

interface Lead {
  id:                string
  name:              string
  email:             string
  phone:             string | null
  church_name:       string | null
  estimated_members: string | null
  plan_interest:     string
  status:            'new' | 'contacted' | 'negotiating' | 'closed' | 'lost'
  notes:             string | null
  assigned_to:       string | null
  utm_source:        string | null
  utm_medium:        string | null
  utm_campaign:      string | null
  created_at:        string
}

const STATUS_CONFIG: Record<Lead['status'], { label: string; color: string; bg: string }> = {
  new:         { label: 'Novo',        color: '#2D7A4F', bg: 'rgba(45,122,79,0.1)' },
  contacted:   { label: 'Contatado',   color: '#2B6CB0', bg: 'rgba(43,108,176,0.1)' },
  negotiating: { label: 'Negociando',  color: '#C4841D', bg: 'rgba(196,132,29,0.1)' },
  closed:      { label: 'Fechado',     color: '#1a5c38', bg: 'rgba(26,92,56,0.15)' },
  lost:        { label: 'Perdido',     color: '#e13500', bg: 'rgba(225,53,0,0.1)' },
}

const PLAN_COLORS: Record<string, string> = {
  'Missão':    '#e13500',
  'Avivamento':'#670000',
}

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export default function AdminLeads() {
  const [leads,       setLeads]       = useState<Lead[]>([])
  const [loading,     setLoading]     = useState(true)
  const [filterStatus, setFilterStatus] = useState<Lead['status'] | 'all'>('all')
  const [filterPlan,   setFilterPlan]   = useState<'all' | 'Missão' | 'Avivamento'>('all')
  const [selected,    setSelected]    = useState<Lead | null>(null)
  const [notes,       setNotes]       = useState('')
  const [saving,      setSaving]      = useState(false)

  async function load() {
    setLoading(true)
    try {
      let q = supabase
        .from('leads')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200)

      if (filterStatus !== 'all') q = q.eq('status', filterStatus)
      if (filterPlan   !== 'all') q = q.eq('plan_interest', filterPlan)

      const { data, error } = await q
      if (error) throw error
      setLeads((data ?? []) as Lead[])
    } catch {
      setLeads([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [filterStatus, filterPlan])

  async function updateStatus(leadId: string, status: Lead['status']) {
    const { error } = await supabase
      .from('leads')
      .update({ status })
      .eq('id', leadId)
    if (!error) {
      setLeads(ls => ls.map(l => l.id === leadId ? { ...l, status } : l))
      if (selected?.id === leadId) setSelected(s => s ? { ...s, status } : s)
    }
  }

  async function saveNotes() {
    if (!selected) return
    setSaving(true)
    const { error } = await supabase
      .from('leads')
      .update({ notes })
      .eq('id', selected.id)
    if (!error) {
      setLeads(ls => ls.map(l => l.id === selected.id ? { ...l, notes } : l))
      setSelected(s => s ? { ...s, notes } : s)
    }
    setSaving(false)
  }

  function openDetail(lead: Lead) {
    setSelected(lead)
    setNotes(lead.notes ?? '')
  }

  const countByStatus = (s: Lead['status']) => leads.filter(l => l.status === s).length

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="px-6 lg:px-10 pt-8 pb-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(225,53,0,0.1)', color: '#e13500' }}>
              <UserPlus size={20} />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-[#161616]">Leads</h1>
              <p className="text-sm text-gray-500">{leads.length} pastor{leads.length !== 1 ? 'es' : ''} interessados</p>
            </div>
          </div>
          <button
            onClick={() => void load()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:bg-white border border-gray-200 text-gray-500">
            <RefreshCw size={14} />
            Atualizar
          </button>
        </div>

        {/* Contadores por status */}
        <div className="grid grid-cols-5 gap-3 mt-6">
          {(Object.entries(STATUS_CONFIG) as [Lead['status'], typeof STATUS_CONFIG[Lead['status']]][]).map(([s, cfg]) => (
            <button
              key={s}
              onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
              className="rounded-xl p-3 text-center border transition-all"
              style={{
                background:   filterStatus === s ? cfg.bg : '#ffffff',
                borderColor:  filterStatus === s ? cfg.color : 'transparent',
              }}>
              <p className="font-mono font-bold text-lg" style={{ color: cfg.color }}>{countByStatus(s)}</p>
              <p className="text-xs font-medium text-gray-500">{cfg.label}</p>
            </button>
          ))}
        </div>

        {/* Filtros */}
        <div className="flex gap-3 mt-4 flex-wrap">
          {(['all', 'Missão', 'Avivamento'] as const).map(p => (
            <button
              key={p}
              onClick={() => setFilterPlan(p)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold border transition-all"
              style={{
                background:   filterPlan === p ? (p === 'all' ? '#161616' : PLAN_COLORS[p]) : '#ffffff',
                color:        filterPlan === p ? '#ffffff' : '#5A5A5A',
                borderColor:  filterPlan === p ? 'transparent' : '#e5e5e5',
              }}>
              {p === 'all' ? 'Todos os planos' : `Plano ${p}`}
            </button>
          ))}
        </div>
      </div>

      {/* Tabela */}
      <div className="px-6 lg:px-10 pb-12">
        {loading ? (
          <div className="flex justify-center py-20"><Spinner /></div>
        ) : leads.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-16 text-center">
            <UserPlus size={40} className="mx-auto mb-4 text-gray-300" />
            <p className="font-semibold text-gray-400">Nenhum lead encontrado</p>
            <p className="text-sm text-gray-300 mt-1">Leads aparecem aqui quando pastores solicitam contato na landing page.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--bg-primary)' }}>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#161616]">Pastor / Igreja</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#161616]">Plano</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#161616] hidden lg:table-cell">Telefone</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#161616] hidden lg:table-cell">Membros</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#161616]">Status</th>
                  <th className="text-left px-5 py-3.5 font-semibold text-[#161616] hidden xl:table-cell">Data</th>
                  <th className="px-5 py-3.5" />
                </tr>
              </thead>
              <tbody>
                {leads.map((lead, i) => {
                  const cfg = STATUS_CONFIG[lead.status]
                  return (
                    <tr
                      key={lead.id}
                      className="cursor-pointer hover:bg-[#f9eedc]/40 transition-colors"
                      style={{ borderTop: i > 0 ? '1px solid #f0f0f0' : undefined }}
                      onClick={() => openDetail(lead)}
                    >
                      <td className="px-5 py-4">
                        <p className="font-semibold text-[#161616] truncate max-w-[160px]">{lead.name}</p>
                        <p className="text-xs text-gray-400 truncate max-w-[160px]">{lead.church_name ?? '—'}</p>
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                          style={{ background: PLAN_COLORS[lead.plan_interest] ?? '#5A5A5A' }}>
                          {lead.plan_interest}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-gray-500 hidden lg:table-cell">
                        {lead.phone ?? '—'}
                      </td>
                      <td className="px-5 py-4 text-gray-500 hidden lg:table-cell">
                        {lead.estimated_members ?? '—'}
                      </td>
                      <td className="px-5 py-4">
                        <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{ color: cfg.color, background: cfg.bg }}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-gray-400 hidden xl:table-cell whitespace-nowrap">
                        {fmtDate(lead.created_at)}
                      </td>
                      <td className="px-5 py-4 text-gray-300">
                        <ChevronRight size={16} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Painel de detalhe (slide-over) */}
      {selected && (
        <div className="fixed inset-0 z-50 flex" onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
          {/* Overlay */}
          <div className="flex-1" style={{ background: 'rgba(0,0,0,0.35)' }} onClick={() => setSelected(null)} />

          {/* Painel */}
          <div className="w-full max-w-md bg-white h-full overflow-y-auto shadow-2xl flex flex-col">
            {/* Header */}
            <div className="px-7 pt-7 pb-5 border-b border-gray-100">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-[#161616]">{selected.name}</h2>
                  <p className="text-sm text-gray-500">{selected.church_name ?? '—'}</p>
                </div>
                <button onClick={() => setSelected(null)}
                  className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
                  <X size={18} />
                </button>
              </div>

              {/* Badge plano */}
              <span className="inline-flex px-3 py-1 rounded-full text-xs font-bold text-white"
                style={{ background: PLAN_COLORS[selected.plan_interest] ?? '#5A5A5A' }}>
                Plano {selected.plan_interest}
              </span>
            </div>

            {/* Body */}
            <div className="px-7 py-6 flex-1 space-y-6">
              {/* Contato */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Contato</p>
                <div className="space-y-2.5">
                  <a href={`mailto:${selected.email}`}
                    className="flex items-center gap-2.5 text-sm text-[#161616] hover:text-[#e13500] transition-colors">
                    <Mail size={15} className="text-gray-400" /> {selected.email}
                  </a>
                  {selected.phone && (
                    <a href={`https://wa.me/55${selected.phone.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-2.5 text-sm text-[#161616] hover:text-[#e13500] transition-colors">
                      <Phone size={15} className="text-gray-400" /> {selected.phone}
                    </a>
                  )}
                </div>
              </div>

              {/* Igreja */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Igreja</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-[#161616]">
                    <Building2 size={15} className="text-gray-400" />
                    {selected.church_name ?? '—'}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-[#161616]">
                    <Users size={15} className="text-gray-400" />
                    {selected.estimated_members ? `${selected.estimated_members} membros` : 'Não informado'}
                  </div>
                </div>
              </div>

              {/* UTM */}
              {(selected.utm_source || selected.utm_medium || selected.utm_campaign) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Origem</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      selected.utm_source   && `source: ${selected.utm_source}`,
                      selected.utm_medium   && `medium: ${selected.utm_medium}`,
                      selected.utm_campaign && `campaign: ${selected.utm_campaign}`,
                    ].filter(Boolean).map(tag => (
                      <span key={String(tag)} className="px-2.5 py-1 rounded-lg text-xs font-mono text-gray-500"
                        style={{ background: '#f3f3f3' }}>{tag}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Data */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Recebido em</p>
                <p className="text-sm text-[#161616]">{fmtDate(selected.created_at)}</p>
              </div>

              {/* Status */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Status</p>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.entries(STATUS_CONFIG) as [Lead['status'], typeof STATUS_CONFIG[Lead['status']]][]).map(([s, cfg]) => (
                    <button
                      key={s}
                      onClick={() => void updateStatus(selected.id, s)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all"
                      style={{
                        background:  selected.status === s ? cfg.bg : '#fff',
                        color:       cfg.color,
                        borderColor: selected.status === s ? cfg.color : '#e5e5e5',
                      }}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Notas internas</p>
                  <button
                    onClick={() => void saveNotes()}
                    disabled={saving || notes === (selected.notes ?? '')}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all disabled:opacity-40"
                    style={{ background: '#e13500', color: '#fff' }}>
                    {saving ? (
                      <span className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                    ) : <Check size={12} />}
                    Salvar
                  </button>
                </div>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  rows={5}
                  placeholder="Adicione notas sobre este lead, histórico de contato, próximos passos..."
                  className="w-full px-4 py-3 rounded-xl text-sm border border-gray-200 focus:outline-none focus:border-[#e13500] transition-colors resize-none"
                  style={{ background: '#fafafa' }}
                />
              </div>

              {/* Ações rápidas */}
              <div className="flex gap-3">
                {selected.phone && (
                  <a
                    href={`https://wa.me/55${selected.phone.replace(/\D/g,'')}?text=Ol%C3%A1%2C+${encodeURIComponent(selected.name)}%21+Sou+da+equipe+Ekthos+Church+e+gostaria+de+apresentar+uma+proposta+para+o+plano+${encodeURIComponent(selected.plan_interest)}.`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 flex-1 justify-center py-3 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90"
                    style={{ background: '#25D366' }}>
                    <MessageCircle size={16} /> WhatsApp
                  </a>
                )}
                <a href={`mailto:${selected.email}?subject=Sua+solicitação+do+plano+${encodeURIComponent(selected.plan_interest)}&body=Olá+${encodeURIComponent(selected.name)}!`}
                  className="flex items-center gap-2 flex-1 justify-center py-3 rounded-xl text-sm font-semibold border-2 transition-all hover:bg-[#e13500]/5"
                  style={{ borderColor: '#e13500', color: '#e13500' }}>
                  <Mail size={16} /> Email
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
