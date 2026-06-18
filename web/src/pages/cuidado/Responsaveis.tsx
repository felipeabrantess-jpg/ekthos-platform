/**
 * Responsaveis — /cuidado/responsaveis
 * CRUD de responsáveis de cuidado pastoral.
 * Responsável NÃO é usuário do sistema — ficha independente com token privado.
 */

import { useState }                              from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Copy, Check, ToggleLeft, ToggleRight, Trash2, HeartHandshake } from 'lucide-react'
import { useAuth }  from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import Spinner      from '@/components/ui/Spinner'
import Modal        from '@/components/ui/Modal'
import Button       from '@/components/ui/Button'
import Input        from '@/components/ui/Input'
import CuidadoTabBar from './CuidadoTabBar'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface CareResponsible {
  id:         string
  name:       string
  phone:      string | null
  type:       'pastor' | 'lider' | 'voluntario'
  region:     string | null
  token:      string
  is_active:  boolean
  created_at: string
}

const TYPE_LABELS = {
  pastor:     'Pastor(a)',
  lider:      'Líder',
  voluntario: 'Voluntário(a)',
}

// ── Modal: Novo / Editar ───────────────────────────────────────────────────────

interface ResponsavelModalProps {
  open:      boolean
  onClose:   () => void
  churchId:  string
  existing?: CareResponsible
}

function ResponsavelModal({ open, onClose, churchId, existing }: ResponsavelModalProps) {
  const qc = useQueryClient()
  const [form, setForm] = useState({
    name:   existing?.name   ?? '',
    phone:  existing?.phone  ?? '',
    type:   existing?.type   ?? 'voluntario',
    region: existing?.region ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      if (existing) {
        const { error: err } = await (supabase as any)
          .from('care_responsibles')
          .update({
            name:   form.name.trim(),
            phone:  form.phone.trim() || null,
            type:   form.type,
            region: form.region.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .eq('church_id', churchId)
        if (err) throw new Error(err.message)
      } else {
        const { error: err } = await (supabase as any)
          .from('care_responsibles')
          .insert({
            church_id: churchId,
            name:      form.name.trim(),
            phone:     form.phone.trim() || null,
            type:      form.type,
            region:    form.region.trim() || null,
          })
        if (err) throw new Error(err.message)
      }
      await qc.invalidateQueries({ queryKey: ['care_responsibles', churchId] })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={existing ? 'Editar Responsável' : 'Novo Responsável'}>
      <form onSubmit={e => { void handleSubmit(e) }} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Nome *
          </label>
          <Input
            value={form.name}
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="Nome completo"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Telefone (WhatsApp)
          </label>
          <Input
            value={form.phone}
            onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
            placeholder="(11) 99999-9999"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Tipo *
          </label>
          <select
            value={form.type}
            onChange={e => setForm(p => ({ ...p, type: e.target.value as any }))}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-default)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="pastor">Pastor(a)</option>
            <option value="lider">Líder</option>
            <option value="voluntario">Voluntário(a)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-secondary)' }}>
            Bairro / Região de Atuação
          </label>
          <Input
            value={form.region}
            onChange={e => setForm(p => ({ ...p, region: e.target.value }))}
            placeholder="Ex: Zona Norte, Barra..."
          />
        </div>
        {error && (
          <p className="text-sm" style={{ color: 'var(--color-danger)' }}>{error}</p>
        )}
        <div className="flex gap-3 justify-end pt-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting || !form.name.trim()}>
            {submitting ? 'Salvando...' : existing ? 'Salvar' : 'Criar Responsável'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Linha de responsável ───────────────────────────────────────────────────────

interface RowProps {
  resp:     CareResponsible
  churchId: string
  linkBase: string
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    void navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <button
      onClick={copy}
      className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-all"
      style={{
        background: 'var(--bg-hover)',
        color: copied ? 'var(--color-success)' : 'var(--text-secondary)',
      }}
      title="Copiar link privado"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? 'Copiado!' : 'Copiar link'}
    </button>
  )
}

function ResponsavelRow({ resp, churchId, linkBase }: RowProps) {
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('care_responsibles')
        .update({ is_active: !resp.is_active, updated_at: new Date().toISOString() })
        .eq('id', resp.id)
        .eq('church_id', churchId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['care_responsibles', churchId] }),
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from('care_responsibles')
        .delete()
        .eq('id', resp.id)
        .eq('church_id', churchId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      setDeletingId(null)
      qc.invalidateQueries({ queryKey: ['care_responsibles', churchId] })
    },
  })

  const privateUrl = `${linkBase}/cuidado/${resp.token}`

  return (
    <>
      <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
        <td className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: 'var(--bg-hover)', color: 'var(--color-primary)' }}
            >
              {resp.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{resp.name}</p>
              <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                {resp.phone ?? '—'}
              </p>
            </div>
          </div>
        </td>
        <td className="py-3 px-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {TYPE_LABELS[resp.type]}
        </td>
        <td className="py-3 px-4 text-sm" style={{ color: 'var(--text-secondary)' }}>
          {resp.region ?? '—'}
        </td>
        <td className="py-3 px-4">
          <CopyLinkButton url={privateUrl} />
        </td>
        <td className="py-3 px-4">
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
            style={{
              background: resp.is_active ? '#d1fae5' : 'var(--bg-hover)',
              color:      resp.is_active ? '#065f46' : 'var(--text-tertiary)',
            }}
          >
            {resp.is_active ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td className="py-3 px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditOpen(true)}
              className="text-xs px-2 py-1 rounded transition-all"
              style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
            >
              Editar
            </button>
            <button
              onClick={() => toggleMutation.mutate()}
              className="transition-all"
              style={{ color: resp.is_active ? 'var(--color-warning)' : 'var(--color-success)' }}
              title={resp.is_active ? 'Desativar' : 'Ativar'}
            >
              {resp.is_active
                ? <ToggleRight size={18} strokeWidth={1.75} />
                : <ToggleLeft  size={18} strokeWidth={1.75} />
              }
            </button>
            {deletingId === resp.id ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => deleteMutation.mutate()}
                  className="text-xs px-2 py-0.5 rounded font-medium"
                  style={{ background: 'var(--color-danger)', color: '#fff' }}
                >
                  Confirmar
                </button>
                <button
                  onClick={() => setDeletingId(null)}
                  className="text-xs px-2 py-0.5 rounded"
                  style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)' }}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={() => setDeletingId(resp.id)}
                style={{ color: 'var(--text-tertiary)' }}
                title="Excluir"
              >
                <Trash2 size={15} strokeWidth={1.75} />
              </button>
            )}
          </div>
        </td>
      </tr>

      {editOpen && (
        <ResponsavelModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          churchId={churchId}
          existing={resp}
        />
      )}
    </>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function Responsaveis() {
  const { churchId } = useAuth()
  const [modalOpen, setModalOpen] = useState(false)

  const { data: responsaveis, isLoading, error } = useQuery({
    queryKey: ['care_responsibles', churchId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('care_responsibles')
        .select('id, name, phone, type, region, token, is_active, created_at')
        .eq('church_id', churchId)
        .order('name', { ascending: true })
      if (error) throw new Error(error.message)
      return data as CareResponsible[]
    },
    enabled: !!churchId,
  })

  const linkBase = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}`
    : ''

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <HeartHandshake size={22} strokeWidth={1.75} style={{ color: 'var(--color-primary)' }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
              Cuidado Pastoral
            </h1>
            <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
              Responsáveis pelo acompanhamento de membros
            </p>
          </div>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus size={16} strokeWidth={2} className="mr-2" />
          Novo Responsável
        </Button>
      </div>

      <CuidadoTabBar />

      {isLoading && (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      )}

      {error && (
        <p className="text-sm py-8 text-center" style={{ color: 'var(--color-danger)' }}>
          Erro ao carregar responsáveis.
        </p>
      )}

      {!isLoading && !error && responsaveis && (
        <>
          {responsaveis.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16">
              <HeartHandshake size={40} strokeWidth={1.25} style={{ color: 'var(--text-tertiary)', opacity: 0.4 }} />
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Nenhum responsável cadastrado ainda.
              </p>
              <Button onClick={() => setModalOpen(true)}>
                <Plus size={14} className="mr-1.5" />
                Adicionar primeiro responsável
              </Button>
            </div>
          ) : (
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--border-default)', background: 'var(--bg-surface)' }}
            >
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-default)' }}>
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
                  {responsaveis.length} responsável{responsaveis.length !== 1 ? 'is' : ''}
                </p>
              </div>
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                    {['Nome', 'Tipo', 'Bairro/Região', 'Link Privado', 'Status', 'Ações'].map(h => (
                      <th
                        key={h}
                        className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide"
                        style={{ color: 'var(--text-tertiary)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {responsaveis.map(r => (
                    <ResponsavelRow
                      key={r.id}
                      resp={r}
                      churchId={churchId!}
                      linkBase={linkBase}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {modalOpen && churchId && (
        <ResponsavelModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          churchId={churchId}
        />
      )}
    </div>
  )
}
