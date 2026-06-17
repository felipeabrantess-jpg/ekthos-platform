/**
 * CursosPage — /cursos  (CRM autenticado)
 * Lista cursos da igreja + inscritos por curso.
 * CRUD completo: criar / editar / ativar-desativar + upload de foto.
 * Multi-tenant via RLS (auth_church_id()). Zero toque em telas existentes.
 */

import { useState, useRef }                from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase }                        from '@/lib/supabase'
import { useAuth }                         from '@/hooks/useAuth'
import {
  GraduationCap, Users, ChevronDown, ChevronUp,
  Clock, MapPin, Loader2, Plus, Pencil, Power,
  PowerOff, X, Upload, ImageIcon,
} from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────

interface Course {
  id:             string
  title:          string
  description:    string | null
  instructor:     string | null
  schedule_text:  string | null
  location:       string | null
  start_date:     string | null
  end_date:       string | null
  price:          number | null
  max_capacity:   number | null
  enrolled_count: number
  is_public:      boolean
  active:         boolean
  image_url:      string | null
  prerequisites:  string | null
}

interface Enrollment {
  id:          string
  name:        string
  phone:       string
  email:       string | null
  enrolled_at: string
}

interface CourseFormData {
  title:         string
  description:   string
  instructor:    string
  schedule_text: string
  location:      string
  start_date:    string
  end_date:      string
  max_capacity:  string
  price:         string
  prerequisites: string
  is_public:     boolean
}

// ── Helpers ──────────────────────────────────────────────────────────

function formatPrice(price: number | null): string {
  if (!price || price === 0) return 'Gratuito'
  return `R$ ${price.toFixed(2).replace('.', ',')}`
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  return `${d}/${months[m-1]}/${y}`
}

function formatEnrolledAt(iso: string): string {
  const dt = new Date(iso)
  return dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'short', year:'numeric' })
}

const emptyForm: CourseFormData = {
  title: '', description: '', instructor: '', schedule_text: '',
  location: '', start_date: '', end_date: '',
  max_capacity: '', price: '', prerequisites: '', is_public: true,
}

// ── Modal de criação / edição ────────────────────────────────────────

interface CourseFormModalProps {
  mode:     'create' | 'edit'
  initial?: Course | null
  churchId: string
  onClose:  () => void
  onSaved:  () => void
}

function CourseFormModal({ mode, initial, churchId, onClose, onSaved }: CourseFormModalProps) {
  const [form, setForm] = useState<CourseFormData>(() =>
    initial ? {
      title:         initial.title,
      description:   initial.description    ?? '',
      instructor:    initial.instructor     ?? '',
      schedule_text: initial.schedule_text  ?? '',
      location:      initial.location       ?? '',
      start_date:    initial.start_date     ?? '',
      end_date:      initial.end_date       ?? '',
      max_capacity:  initial.max_capacity != null ? String(initial.max_capacity) : '',
      price:         initial.price        != null ? String(initial.price)        : '',
      prerequisites: initial.prerequisites  ?? '',
      is_public:     initial.is_public,
    } : { ...emptyForm }
  )

  const [photoFile, setPhotoFile]     = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(initial?.image_url ?? null)
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const fileRef                       = useRef<HTMLInputElement>(null)

  function set(field: keyof CourseFormData, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }))
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) { setError('Título é obrigatório.'); return }
    setSaving(true)
    setError(null)

    try {
      let image_url: string | null = initial?.image_url ?? null

      // Upload da foto se houver arquivo selecionado
      if (photoFile) {
        const ext  = photoFile.name.split('.').pop() ?? 'jpg'
        const path = `${churchId}/curso-${Date.now()}.${ext}`
        const { error: upErr } = await supabase.storage
          .from('church-logos')
          .upload(path, photoFile, { upsert: true, contentType: photoFile.type })
        if (upErr) throw upErr
        const { data: urlData } = supabase.storage.from('church-logos').getPublicUrl(path)
        image_url = `${urlData.publicUrl}?t=${Date.now()}`
      }

      const payload = {
        title:         form.title.trim(),
        description:   form.description.trim()   || null,
        instructor:    form.instructor.trim()    || null,
        schedule_text: form.schedule_text.trim() || null,
        location:      form.location.trim()      || null,
        start_date:    form.start_date           || null,
        end_date:      form.end_date             || null,
        max_capacity:  form.max_capacity ? Number(form.max_capacity) : null,
        price:         form.price        ? Number(form.price)        : null,
        prerequisites: form.prerequisites.trim() || null,
        is_public:     form.is_public,
        image_url,
      }

      if (mode === 'create') {
        const { error: dbErr } = await supabase
          .from('church_courses')
          .insert(payload as any)
        if (dbErr) throw dbErr
      } else {
        const { error: dbErr } = await supabase
          .from('church_courses')
          .update(payload as any)
          .eq('id', initial!.id)
        if (dbErr) throw dbErr
      }

      onSaved()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900 text-base">
            {mode === 'create' ? 'Novo curso' : 'Editar curso'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {/* Foto */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Foto do curso</label>
            <div
              onClick={() => fileRef.current?.click()}
              className="relative cursor-pointer rounded-xl border-2 border-dashed border-gray-200 hover:border-amber-400 transition-colors overflow-hidden"
              style={{ height: 120 }}
            >
              {photoPreview ? (
                <img src={photoPreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-300 gap-1.5">
                  <ImageIcon size={28} strokeWidth={1.5} />
                  <span className="text-xs text-gray-400">Clique para fazer upload</span>
                </div>
              )}
              {photoPreview && (
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <Upload size={22} className="text-white" />
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
          </div>

          {/* Título */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Título <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="Ex.: Escola de Líderes 2026"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
          </div>

          {/* Instrutor */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Instrutor</label>
            <input
              type="text"
              value={form.instructor}
              onChange={e => set('instructor', e.target.value)}
              placeholder="Ex.: Pr. João Silva"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Descrição</label>
            <textarea
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={3}
              placeholder="Apresente o curso em poucas frases…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
            />
          </div>

          {/* Horário + Local */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Horário</label>
              <input
                type="text"
                value={form.schedule_text}
                onChange={e => set('schedule_text', e.target.value)}
                placeholder="Sáb 9h–12h"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Local</label>
              <input
                type="text"
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="Sala 3"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
          </div>

          {/* Datas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Data de início</label>
              <input
                type="date"
                value={form.start_date}
                onChange={e => set('start_date', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Data de encerramento</label>
              <input
                type="date"
                value={form.end_date}
                onChange={e => set('end_date', e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
          </div>

          {/* Vagas + Valor */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Vagas</label>
              <input
                type="number"
                min={1}
                value={form.max_capacity}
                onChange={e => set('max_capacity', e.target.value)}
                placeholder="Ilimitadas"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Valor (R$)</label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.price}
                onChange={e => set('price', e.target.value)}
                placeholder="Gratuito"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
              />
            </div>
          </div>

          {/* Pré-requisitos */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Pré-requisitos</label>
            <textarea
              value={form.prerequisites}
              onChange={e => set('prerequisites', e.target.value)}
              rows={2}
              placeholder="Ex.: Ser membro há pelo menos 6 meses"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent resize-none"
            />
          </div>

          {/* Visibilidade pública */}
          <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-gray-700">Visível no site público</p>
              <p className="text-xs text-gray-400">Aparece em /igv/cursos para qualquer visitante</p>
            </div>
            <button
              type="button"
              onClick={() => set('is_public', !form.is_public)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                form.is_public ? 'bg-amber-500' : 'bg-gray-200'
              }`}
            >
              <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                form.is_public ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}
        </form>

        {/* Footer */}
        <div className="flex gap-3 px-5 py-4 border-t border-gray-100">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {mode === 'create' ? 'Criar curso' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Lista de inscritos ───────────────────────────────────────────────

function EnrollmentList({ courseId }: { courseId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['course_enrollments', courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('course_enrollments')
        .select('id, name, phone, email, enrolled_at')
        .eq('course_id', courseId)
        .order('enrolled_at', { ascending: false })
      if (error) throw error
      return data as unknown as Enrollment[]
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-4 pb-4 text-gray-400 text-sm">
        <Loader2 size={14} className="animate-spin" />
        <span>Carregando inscritos…</span>
      </div>
    )
  }

  if (error || !data) {
    return <p className="px-4 pb-4 text-sm text-red-500">Erro ao carregar inscritos.</p>
  }

  if (data.length === 0) {
    return <p className="px-4 pb-4 text-sm text-gray-400">Nenhum inscrito ainda.</p>
  }

  return (
    <div className="border-t border-gray-100 divide-y divide-gray-50">
      {data.map(e => (
        <div key={e.id} className="px-4 py-3">
          <div className="flex items-center justify-between">
            <p className="font-medium text-gray-900 text-sm">{e.name}</p>
            <p className="text-xs text-gray-400">{formatEnrolledAt(e.enrolled_at)}</p>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{e.phone}{e.email ? ` · ${e.email}` : ''}</p>
        </div>
      ))}
    </div>
  )
}

// ── Card de curso ────────────────────────────────────────────────────

interface CourseCardProps {
  course:   Course
  onEdit:   (c: Course) => void
  onToggle: (c: Course) => void
  toggling: boolean
}

function CourseCard({ course, onEdit, onToggle, toggling }: CourseCardProps) {
  const [expanded, setExpanded] = useState(false)
  const isFull = course.max_capacity !== null && course.enrolled_count >= course.max_capacity

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-3 overflow-hidden">
      <div className="px-4 py-4">
        <div className="flex items-start gap-3">
          {/* Foto miniatura */}
          {course.image_url && (
            <img
              src={course.image_url}
              alt={course.title}
              className="w-12 h-12 rounded-xl object-cover shrink-0"
            />
          )}

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-semibold text-gray-900 text-sm leading-snug">{course.title}</span>
              {!course.active && (
                <span className="text-[0.65rem] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 font-medium">Inativo</span>
              )}
              {!course.is_public && (
                <span className="text-[0.65rem] px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">Privado</span>
              )}
              {isFull && (
                <span className="text-[0.65rem] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-medium">Lotado</span>
              )}
            </div>

            {course.instructor && (
              <p className="text-xs text-gray-400 mb-2">{course.instructor}</p>
            )}

            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span className="text-xs text-gray-500">{formatPrice(course.price)}</span>
              {course.schedule_text && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock size={11} strokeWidth={1.75} />
                  {course.schedule_text}
                </span>
              )}
              {course.location && (
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <MapPin size={11} strokeWidth={1.75} />
                  {course.location}
                </span>
              )}
              {(course.start_date || course.end_date) && (
                <span className="text-xs text-gray-400">
                  {course.start_date ? formatDate(course.start_date) : ''}
                  {course.end_date   ? ` – ${formatDate(course.end_date)}`   : ''}
                </span>
              )}
            </div>
          </div>

          {/* Ações */}
          <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
            <span className="flex items-center gap-1 text-xs font-medium text-gray-400 mr-1">
              <Users size={13} strokeWidth={1.75} />
              {course.enrolled_count}
              {course.max_capacity !== null ? `/${course.max_capacity}` : ''}
            </span>

            <button
              onClick={() => onEdit(course)}
              title="Editar curso"
              className="p-1.5 rounded-lg text-gray-400 hover:text-amber-600 hover:bg-amber-50 transition-colors"
            >
              <Pencil size={14} strokeWidth={1.75} />
            </button>

            <button
              onClick={() => onToggle(course)}
              disabled={toggling}
              title={course.active ? 'Desativar curso' : 'Ativar curso'}
              className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${
                course.active
                  ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                  : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
              }`}
            >
              {toggling
                ? <Loader2 size={14} className="animate-spin" />
                : course.active
                  ? <PowerOff size={14} strokeWidth={1.75} />
                  : <Power    size={14} strokeWidth={1.75} />
              }
            </button>

            <button
              onClick={() => setExpanded(v => !v)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>
        </div>
      </div>

      {expanded && <EnrollmentList courseId={course.id} />}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────

export default function CursosPage() {
  const { churchId }   = useAuth()
  const queryClient    = useQueryClient()

  const [modalMode,    setModalMode]    = useState<'create' | 'edit' | null>(null)
  const [editingCourse, setEditingCourse] = useState<Course | null>(null)
  const [togglingId,   setTogglingId]   = useState<string | null>(null)

  const { data: courses, isLoading, error } = useQuery({
    queryKey: ['church_courses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('church_courses')
        .select('id, title, description, instructor, schedule_text, location, start_date, end_date, price, max_capacity, enrolled_count, is_public, active, image_url, prerequisites')
        .order('start_date', { ascending: true })
      if (error) throw error
      return data as unknown as Course[]
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('church_courses')
        .update({ active } as any)
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['church_courses'] })
    },
  })

  function openCreate() {
    setEditingCourse(null)
    setModalMode('create')
  }

  function openEdit(course: Course) {
    setEditingCourse(course)
    setModalMode('edit')
  }

  function closeModal() {
    setModalMode(null)
    setEditingCourse(null)
  }

  function handleSaved() {
    void queryClient.invalidateQueries({ queryKey: ['church_courses'] })
    closeModal()
  }

  async function handleToggle(course: Course) {
    setTogglingId(course.id)
    try {
      await toggleMutation.mutateAsync({ id: course.id, active: !course.active })
    } finally {
      setTogglingId(null)
    }
  }

  const active   = courses?.filter(c => c.active)  ?? []
  const inactive = courses?.filter(c => !c.active) ?? []

  return (
    <div className="p-6 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <GraduationCap size={20} className="text-amber-700" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Cursos</h1>
            <p className="text-sm text-gray-400">Formações com inscrição aberta</p>
          </div>
        </div>

        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 transition-colors shadow-sm"
        >
          <Plus size={15} strokeWidth={2.5} />
          Criar curso
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
          <Loader2 size={16} className="animate-spin" />
          <span>Carregando cursos…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-6 text-center text-sm text-red-600">
          Erro ao carregar cursos. Tente novamente.
        </div>
      )}

      {/* Empty */}
      {!isLoading && !error && courses?.length === 0 && (
        <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-10 text-center">
          <GraduationCap size={32} className="text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
          <p className="font-medium text-gray-500 text-sm">Nenhum curso cadastrado</p>
          <p className="text-gray-400 text-xs mt-1">Clique em "Criar curso" para começar.</p>
        </div>
      )}

      {/* Ativos */}
      {!isLoading && !error && active.length > 0 && (
        <section className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Ativos ({active.length})
          </p>
          {active.map(c => (
            <CourseCard
              key={c.id}
              course={c}
              onEdit={openEdit}
              onToggle={handleToggle}
              toggling={togglingId === c.id}
            />
          ))}
        </section>
      )}

      {/* Encerrados / Inativos */}
      {!isLoading && !error && inactive.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Encerrados ({inactive.length})
          </p>
          {inactive.map(c => (
            <CourseCard
              key={c.id}
              course={c}
              onEdit={openEdit}
              onToggle={handleToggle}
              toggling={togglingId === c.id}
            />
          ))}
        </section>
      )}

      {/* Modal */}
      {modalMode && churchId && (
        <CourseFormModal
          mode={modalMode}
          initial={editingCourse}
          churchId={churchId}
          onClose={closeModal}
          onSaved={handleSaved}
        />
      )}
    </div>
  )
}
