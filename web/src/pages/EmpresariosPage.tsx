import { useState }                    from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase }                    from '@/lib/supabase'
import { useAuth }                     from '@/hooks/useAuth'
import { useChurch }                   from '@/hooks/useChurch'
import { Loader2, Plus, Pencil, Trash2, Globe, GlobeLock, ImageIcon, Briefcase } from 'lucide-react'
function toast(opts: { title: string; description?: string; variant?: string }) {
  if (opts.variant === 'destructive') {
    window.alert(`${opts.title}${opts.description ? ': ' + opts.description : ''}`)
  }
}

// ── Tipos ──────────────────────────────────────────────────────────────────────

const CATEGORIAS = [
  'Alimentação',
  'Saúde e Bem-estar',
  'Beleza e Estética',
  'Construção e Reformas',
  'Tecnologia',
  'Moda e Vestuário',
  'Educação',
  'Serviços Gerais',
  'Consultoria',
  'Eventos e Fotografia',
  'Limpeza',
  'Outros',
] as const

type Categoria = (typeof CATEGORIAS)[number]

interface Empresario {
  id:               string
  church_id:        string
  nome:             string
  categoria:        Categoria
  descricao:        string | null
  telefone:         string | null
  instagram:        string | null
  site:             string | null
  email:            string | null
  foto_url:         string | null
  active:           boolean
  authorized_public: boolean
  authorized_at:    string | null
  authorized_by:    string | null
  created_at:       string
}

// ── Modal de criação/edição ────────────────────────────────────────────────────

interface ModalProps {
  item:     Partial<Empresario> | null
  onClose:  () => void
  churchId: string
  userId:   string
}

function EmpresarioModal({ item, onClose, churchId, userId }: ModalProps) {
  const queryClient = useQueryClient()
  const isEdit      = Boolean(item?.id)

  const [nome,      setNome]      = useState(item?.nome      ?? '')
  const [categoria, setCategoria] = useState<Categoria>((item?.categoria as Categoria) ?? 'Outros')
  const [descricao, setDescricao] = useState(item?.descricao ?? '')
  const [telefone,  setTelefone]  = useState(item?.telefone  ?? '')
  const [instagram, setInstagram] = useState(item?.instagram ?? '')
  const [site,      setSite]      = useState(item?.site      ?? '')
  const [email,     setEmail]     = useState(item?.email     ?? '')
  const [fotoUrl,   setFotoUrl]   = useState(item?.foto_url  ?? '')
  const [uploading, setUploading] = useState(false)
  const [saving,    setSaving]    = useState(false)

  async function handlePhotoUpload(file: File) {
    setUploading(true)
    try {
      const ext  = file.name.split('.').pop()
      const path = `empresarios/${churchId}/${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from('church-logos')
        .upload(path, file, { upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('church-logos').getPublicUrl(path)
      setFotoUrl(data.publicUrl)
    } catch {
      toast({ title: 'Erro no upload da foto', variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  async function handleSave() {
    if (!nome.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        nome:      nome.trim(),
        categoria,
        descricao: descricao.trim() || null,
        telefone:  telefone.trim()  || null,
        instagram: instagram.replace(/^@/, '').trim() || null,
        site:      site.trim()      || null,
        email:     email.trim()     || null,
        foto_url:  fotoUrl          || null,
      }
      if (isEdit && item?.id) {
        const { error } = await supabase
          .from('church_empresarios')
          .update(payload as any)
          .eq('id', item.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('church_empresarios')
          .insert({ ...payload, church_id: churchId } as any)
        if (error) throw error
      }
      await queryClient.invalidateQueries({ queryKey: ['church_empresarios'] })
      toast({ title: isEdit ? 'Empresário atualizado' : 'Empresário cadastrado' })
      onClose()
    } catch (err: any) {
      toast({ title: 'Erro ao salvar', description: err.message, variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-y-auto">
        <div className="p-5 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            {isEdit ? 'Editar Empresário' : 'Novo Empresário'}
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Preencha os dados de contato. Foto e campos de contato são opcionais.
          </p>
        </div>

        <div className="p-5 space-y-4">
          {/* Foto */}
          <div className="flex items-center gap-4">
            {fotoUrl ? (
              <img src={fotoUrl} alt="foto" className="w-16 h-16 rounded-xl object-cover border" />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
                <ImageIcon size={22} className="text-amber-400" />
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Foto (opcional)</label>
              <label className="cursor-pointer text-sm text-amber-600 hover:underline flex items-center gap-1">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : null}
                {uploading ? 'Enviando…' : 'Selecionar imagem'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={e => { if (e.target.files?.[0]) handlePhotoUpload(e.target.files[0]) }}
                />
              </label>
            </div>
          </div>

          {/* Nome */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
            <input
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: Padaria do João"
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoria *</label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value as Categoria)}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
            >
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              rows={2}
              placeholder="Breve descrição do negócio…"
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
          </div>

          {/* Telefone / WhatsApp */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp</label>
            <input
              value={telefone}
              onChange={e => setTelefone(e.target.value)}
              placeholder="(21) 99999-9999"
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Instagram */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Instagram (handle)</label>
            <input
              value={instagram}
              onChange={e => setInstagram(e.target.value)}
              placeholder="@meuNegocio"
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Site */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Site</label>
            <input
              value={site}
              onChange={e => setSite(e.target.value)}
              placeholder="https://meunegocio.com.br"
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="contato@meunegocio.com.br"
              type="email"
              className="w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>
        </div>

        <div className="p-5 border-t flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60 flex items-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Salvar alterações' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

export default function EmpresariosPage() {
  const { user }               = useAuth()
  const { church }             = useChurch()
  const queryClient            = useQueryClient()
  const churchId               = church?.id ?? ''
  const userId                 = user?.id   ?? ''

  const [modalItem, setModalItem] = useState<Partial<Empresario> | null | false>(false)
  const [deleting,  setDeleting]  = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['church_empresarios', churchId],
    enabled:  Boolean(churchId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('church_empresarios')
        .select('*')
        .eq('church_id', churchId)
        .order('nome')
      if (error) throw error
      return data as Empresario[]
    },
  })

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('church_empresarios')
        .update({ active } as any)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['church_empresarios'] }),
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  })

  const toggleAuthorized = useMutation({
    mutationFn: async ({ id, authorized_public }: { id: string; authorized_public: boolean }) => {
      const patch: any = { authorized_public }
      if (authorized_public) {
        patch.authorized_at = new Date().toISOString()
        patch.authorized_by = userId
      } else {
        patch.authorized_at = null
        patch.authorized_by = null
      }
      const { error } = await supabase
        .from('church_empresarios')
        .update(patch)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['church_empresarios'] }),
    onError: (e: any) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  })

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      setDeleting(id)
      const { error } = await supabase
        .from('church_empresarios')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      setDeleting(null)
      queryClient.invalidateQueries({ queryKey: ['church_empresarios'] })
      toast({ title: 'Empresário removido' })
    },
    onError: (e: any) => {
      setDeleting(null)
      toast({ title: 'Erro ao remover', description: e.message, variant: 'destructive' })
    },
  })

  const ativos   = data?.filter(e => e.active)  ?? []
  const inativos = data?.filter(e => !e.active)  ?? []

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <Briefcase size={20} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Rede de Negócios</h1>
            <p className="text-sm text-gray-500">Empresários da congregação visíveis no app</p>
          </div>
        </div>
        <button
          onClick={() => setModalItem({})}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors"
        >
          <Plus size={16} />
          Novo empresário
        </button>
      </div>

      {/* Aviso LGPD */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-800">
        <strong>LGPD:</strong> Somente empresários com <em>divulgação autorizada</em> aparecem no app público.
        O admin confirma que o membro autorizou a exibição antes de ativar a visibilidade.
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 size={28} className="animate-spin text-amber-600" />
        </div>
      ) : (
        <>
          {/* Ativos */}
          {ativos.length > 0 && (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Ativos ({ativos.length})
              </h2>
              <div className="space-y-3 mb-8">
                {ativos.map(e => (
                  <EmpresarioCard
                    key={e.id}
                    item={e}
                    deleting={deleting === e.id}
                    onEdit={() => setModalItem(e)}
                    onToggleActive={() => toggleActive.mutate({ id: e.id, active: !e.active })}
                    onToggleAuthorized={() => {
                      const next = !e.authorized_public
                      if (next && !window.confirm(
                        `Confirma que ${e.nome} autorizou a divulgação pública dos dados de contato?`
                      )) return
                      toggleAuthorized.mutate({ id: e.id, authorized_public: next })
                    }}
                    onDelete={() => {
                      if (window.confirm(`Remover ${e.nome}? Esta ação não pode ser desfeita.`)) {
                        deleteItem.mutate(e.id)
                      }
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {/* Inativos */}
          {inativos.length > 0 && (
            <>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                Inativos ({inativos.length})
              </h2>
              <div className="space-y-3">
                {inativos.map(e => (
                  <EmpresarioCard
                    key={e.id}
                    item={e}
                    deleting={deleting === e.id}
                    onEdit={() => setModalItem(e)}
                    onToggleActive={() => toggleActive.mutate({ id: e.id, active: !e.active })}
                    onToggleAuthorized={() => {
                      const next = !e.authorized_public
                      if (next && !window.confirm(
                        `Confirma que ${e.nome} autorizou a divulgação pública dos dados de contato?`
                      )) return
                      toggleAuthorized.mutate({ id: e.id, authorized_public: next })
                    }}
                    onDelete={() => {
                      if (window.confirm(`Remover ${e.nome}? Esta ação não pode ser desfeita.`)) {
                        deleteItem.mutate(e.id)
                      }
                    }}
                  />
                ))}
              </div>
            </>
          )}

          {ativos.length === 0 && inativos.length === 0 && (
            <div className="text-center py-16 text-gray-400">
              <Briefcase size={40} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Nenhum empresário cadastrado ainda</p>
              <p className="text-sm mt-1">Clique em "Novo empresário" para começar.</p>
            </div>
          )}
        </>
      )}

      {modalItem !== false && (
        <EmpresarioModal
          item={modalItem}
          onClose={() => setModalItem(false)}
          churchId={churchId}
          userId={userId}
        />
      )}
    </div>
  )
}

// ── Card do empresário ────────────────────────────────────────────────────────

interface CardProps {
  item:               Empresario
  deleting:           boolean
  onEdit:             () => void
  onToggleActive:     () => void
  onToggleAuthorized: () => void
  onDelete:           () => void
}

function EmpresarioCard({ item, deleting, onEdit, onToggleActive, onToggleAuthorized, onDelete }: CardProps) {
  const initial = item.nome.charAt(0).toUpperCase()

  return (
    <div className={`bg-white rounded-2xl border p-4 flex gap-4 items-start ${!item.active ? 'opacity-60' : ''}`}>
      {/* Foto ou placeholder */}
      {item.foto_url ? (
        <img
          src={item.foto_url}
          alt={item.nome}
          className="w-12 h-12 rounded-xl object-cover border shrink-0"
        />
      ) : (
        <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
          <span className="text-amber-700 font-bold text-lg">{initial}</span>
        </div>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">{item.nome}</p>
            <p className="text-xs text-gray-400">{item.categoria}</p>
          </div>
          {/* Badge autorizado */}
          <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
            item.authorized_public
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-gray-100 text-gray-500'
          }`}>
            {item.authorized_public ? <Globe size={10} /> : <GlobeLock size={10} />}
            {item.authorized_public ? 'Público' : 'Privado'}
          </span>
        </div>

        {item.descricao && (
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{item.descricao}</p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-3">
          {/* Ativo toggle */}
          <button
            onClick={onToggleActive}
            className={`text-xs px-3 py-1 rounded-lg font-medium border transition-colors ${
              item.active
                ? 'border-gray-200 text-gray-600 hover:bg-gray-50'
                : 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
            }`}
          >
            {item.active ? 'Desativar' : 'Reativar'}
          </button>

          {/* Autorizar toggle */}
          <button
            onClick={onToggleAuthorized}
            className={`text-xs px-3 py-1 rounded-lg font-medium border transition-colors ${
              item.authorized_public
                ? 'border-red-200 text-red-600 hover:bg-red-50'
                : 'border-green-200 text-green-700 hover:bg-green-50'
            }`}
          >
            {item.authorized_public ? 'Retirar do app' : 'Publicar no app'}
          </button>

          {/* Editar */}
          <button
            onClick={onEdit}
            className="text-xs px-3 py-1 rounded-lg font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 flex items-center gap-1"
          >
            <Pencil size={11} />
            Editar
          </button>

          {/* Deletar */}
          <button
            onClick={onDelete}
            disabled={deleting}
            className="text-xs px-3 py-1 rounded-lg font-medium border border-red-100 text-red-500 hover:bg-red-50 flex items-center gap-1 disabled:opacity-50"
          >
            {deleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
            Remover
          </button>
        </div>
      </div>
    </div>
  )
}
