/**
 * CursosPage — /cursos  (CRM autenticado)
 * Lista cursos da igreja + inscritos por curso.
 * Multi-tenant via RLS (auth_church_id()). Zero toque em telas existentes.
 */

import { useState }              from 'react'
import { useQuery }              from '@tanstack/react-query'
import { supabase }              from '@/lib/supabase'
import { GraduationCap, Users, ChevronDown, ChevronUp, Clock, MapPin, Loader2 } from 'lucide-react'

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
}

interface Enrollment {
  id:          string
  name:        string
  phone:       string
  email:       string | null
  enrolled_at: string
}

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

// ── Sub-componente: lista de inscritos ───────────────────────────────

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
      return data as Enrollment[]
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

// ── Card de curso com expansão ───────────────────────────────────────

function CourseCard({ course }: { course: Course }) {
  const [expanded, setExpanded] = useState(false)
  const isFull = course.max_capacity !== null && course.enrolled_count >= course.max_capacity

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm mb-3 overflow-hidden">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full text-left px-4 py-4 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors"
      >
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
                {course.end_date ? ` – ${formatDate(course.end_date)}` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-3 mt-1">
          <span className="flex items-center gap-1 text-xs font-medium text-gray-500">
            <Users size={13} strokeWidth={1.75} />
            {course.enrolled_count}
            {course.max_capacity !== null ? `/${course.max_capacity}` : ''}
          </span>
          {expanded
            ? <ChevronUp  size={16} className="text-gray-400" />
            : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      {expanded && <EnrollmentList courseId={course.id} />}
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────

export default function CursosPage() {
  const { data: courses, isLoading, error } = useQuery({
    queryKey: ['church_courses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('church_courses')
        .select('id, title, description, instructor, schedule_text, location, start_date, end_date, price, max_capacity, enrolled_count, is_public, active')
        .order('start_date', { ascending: true })
      if (error) throw error
      return data as Course[]
    },
  })

  const active   = courses?.filter(c => c.active)   ?? []
  const inactive = courses?.filter(c => !c.active)  ?? []

  return (
    <div className="p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <GraduationCap size={20} className="text-amber-700" strokeWidth={1.75} />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Cursos</h1>
          <p className="text-sm text-gray-400">Formações com inscrição aberta</p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-gray-400 text-sm py-8">
          <Loader2 size={16} className="animate-spin" />
          <span>Carregando cursos…</span>
        </div>
      )}

      {error && (
        <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-6 text-center text-sm text-red-600">
          Erro ao carregar cursos. Tente novamente.
        </div>
      )}

      {!isLoading && !error && courses?.length === 0 && (
        <div className="rounded-2xl bg-gray-50 border border-gray-100 px-4 py-10 text-center">
          <GraduationCap size={32} className="text-gray-300 mx-auto mb-3" strokeWidth={1.5} />
          <p className="font-medium text-gray-500 text-sm">Nenhum curso cadastrado</p>
          <p className="text-gray-400 text-xs mt-1">Cursos criados aparecerão aqui com seus inscritos.</p>
        </div>
      )}

      {!isLoading && !error && active.length > 0 && (
        <section className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Ativos ({active.length})
          </p>
          {active.map(c => <CourseCard key={c.id} course={c} />)}
        </section>
      )}

      {!isLoading && !error && inactive.length > 0 && (
        <section>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
            Encerrados ({inactive.length})
          </p>
          {inactive.map(c => <CourseCard key={c.id} course={c} />)}
        </section>
      )}
    </div>
  )
}
