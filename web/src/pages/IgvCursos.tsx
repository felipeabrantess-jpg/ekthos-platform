/**
 * IgvCursos — /igv/cursos  (pública, sem auth)
 * LGPD R8: zero dado de inscritos exposto. POST envia nome+fone+email para EF.
 * EF igv-public-courses: GET cursos públicos IGV.
 * EF igv-public-enrollment: POST inscrição com upsert em people.
 */

import { useState, useEffect }      from 'react'
import { Link }                     from 'react-router-dom'
import { ChevronLeft, GraduationCap, MapPin, Clock, Users, X } from 'lucide-react'
import { IGV }                      from '@/lib/igv-public-data'

const EF_COURSES_URL    = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/igv-public-courses`
const EF_ENROLLMENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/igv-public-enrollment`

interface Course {
  id:            string
  title:         string
  description:   string | null
  instructor:    string | null
  schedule_text: string | null
  location:      string | null
  start_date:    string | null
  end_date:      string | null
  image_url:     string | null
  price:         number | null
  prerequisites: string | null
  max_capacity:  number | null
  enrolled_count: number
  is_full:       boolean
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  const months = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
  return `${d} de ${months[m - 1]}.`
}

function formatPrice(price: number | null): string {
  if (!price || price === 0) return 'Gratuito'
  return `R$ ${price.toFixed(2).replace('.', ',')}`
}

// ── Sub-componentes ──────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[0.75rem] font-semibold uppercase tracking-[0.14em] mb-3"
       style={{ color: IGV.primaryColor }}>
      {children}
    </p>
  )
}

function Spinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-6 h-6 border-2 rounded-full animate-spin"
           style={{ borderColor: `${IGV.primaryColor}30`, borderTopColor: IGV.primaryColor }} />
    </div>
  )
}

function EmptyCourses() {
  return (
    <div className="rounded-2xl bg-[#111] border border-white/10 p-8 flex flex-col items-center gap-3 text-center">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
           style={{ backgroundColor: `${IGV.primaryColor}15` }}>
        <GraduationCap size={24} style={{ color: IGV.primaryColor }} strokeWidth={1.75} />
      </div>
      <div>
        <p className="font-semibold text-white text-[1.02rem]">Sem cursos no momento</p>
        <p className="text-white/50 text-[0.86rem] mt-1 leading-snug">
          Em breve novos cursos serão disponibilizados.
        </p>
      </div>
    </div>
  )
}

// ── Modal de inscrição ───────────────────────────────────────────────

interface EnrollModalProps {
  course: Course
  onClose: () => void
}

function EnrollModal({ course, onClose }: EnrollModalProps) {
  const [name,   setName]   = useState('')
  const [phone,  setPhone]  = useState('')
  const [email,  setEmail]  = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error' | 'duplicate' | 'full'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !phone.trim()) return
    setStatus('loading')

    try {
      const res = await fetch(EF_ENROLLMENT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ course_id: course.id, name: name.trim(), phone: phone.trim(), email: email.trim() || undefined }),
      })
      const data = await res.json()

      if (res.ok) {
        setStatus('success')
        return
      }
      if (res.status === 409) {
        if (data.already_enrolled) { setStatus('duplicate'); return }
        setStatus('full'); return
      }
      setErrorMsg(data.error || 'Erro inesperado. Tente novamente.')
      setStatus('error')
    } catch {
      setErrorMsg('Sem conexão. Tente novamente.')
      setStatus('error')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
         onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-md bg-[#111] rounded-t-3xl border-t border-white/10 p-6 pb-10 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="font-semibold text-white text-[1.07rem] leading-snug">{course.title}</p>
            {course.instructor && <p className="text-white/50 text-[0.86rem] mt-0.5">{course.instructor}</p>}
          </div>
          <button onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full text-white/50 hover:text-white/80 transition-colors">
            <X size={18} />
          </button>
        </div>

        {status === 'success' && (
          <div className="rounded-2xl p-5 text-center"
               style={{ backgroundColor: `${IGV.primaryColor}10`, border: `1px solid ${IGV.primaryColor}30` }}>
            <div className="text-2xl mb-2">🎉</div>
            <p className="font-semibold text-[0.97rem]" style={{ color: IGV.primaryColor }}>
              Inscrição confirmada!
            </p>
            <p className="text-white/60 text-[0.92rem] mt-1 leading-snug">
              Em breve entraremos em contato com mais detalhes.
            </p>
            <button onClick={onClose}
                    className="mt-4 px-5 py-2 rounded-xl text-white text-[0.97rem] font-medium"
                    style={{ backgroundColor: IGV.primaryColor }}>
              Fechar
            </button>
          </div>
        )}

        {status === 'duplicate' && (
          <div className="rounded-2xl p-5 text-center bg-amber-900/30 border border-amber-600/30">
            <p className="font-semibold text-amber-300 text-[0.97rem]">Você já está inscrito!</p>
            <p className="text-amber-400/80 text-[0.92rem] mt-1">Sua inscrição neste curso já foi registrada.</p>
            <button onClick={onClose}
                    className="mt-4 px-5 py-2 rounded-xl text-white text-[0.97rem] font-medium bg-amber-700">
              Fechar
            </button>
          </div>
        )}

        {status === 'full' && (
          <div className="rounded-2xl p-5 text-center bg-red-900/30 border border-red-600/30">
            <p className="font-semibold text-red-300 text-[0.97rem]">Vagas esgotadas</p>
            <p className="text-red-400/80 text-[0.92rem] mt-1">Todas as vagas foram preenchidas.</p>
            <button onClick={onClose}
                    className="mt-4 px-5 py-2 rounded-xl text-white text-[0.97rem] font-medium bg-red-700">
              Fechar
            </button>
          </div>
        )}

        {(status === 'idle' || status === 'loading' || status === 'error') && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {status === 'error' && (
              <p className="text-red-400 text-[0.92rem] bg-red-900/20 border border-red-600/20 rounded-xl px-3 py-2">{errorMsg}</p>
            )}

            <div>
              <label className="text-[0.86rem] font-medium text-white/60 mb-1 block">
                Nome completo <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Seu nome"
                required
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': IGV.primaryColor, fontSize: '16px' } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="text-[0.86rem] font-medium text-white/60 mb-1 block">
                WhatsApp / Telefone <span className="text-red-400">*</span>
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(21) 99999-0000"
                required
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': IGV.primaryColor, fontSize: '16px' } as React.CSSProperties}
              />
            </div>

            <div>
              <label className="text-[0.86rem] font-medium text-white/60 mb-1 block">E-mail (opcional)</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ '--tw-ring-color': IGV.primaryColor, fontSize: '16px' } as React.CSSProperties}
              />
            </div>

            <p className="text-[0.82rem] text-white/40 leading-snug">
              Seus dados serão usados apenas para contato sobre este curso (LGPD).
            </p>

            <button
              type="submit"
              disabled={status === 'loading' || !name.trim() || !phone.trim()}
              className="w-full py-3 rounded-xl text-white font-semibold text-[1.02rem] transition-opacity disabled:opacity-50"
              style={{ backgroundColor: IGV.primaryColor }}
            >
              {status === 'loading' ? 'Enviando…' : 'Confirmar inscrição'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Card de curso ────────────────────────────────────────────────────

interface CourseCardProps {
  course:   Course
  onEnroll: (c: Course) => void
}

function CourseCard({ course, onEnroll }: CourseCardProps) {
  const priceLabel = formatPrice(course.price)
  const isFree     = !course.price || course.price === 0

  return (
    <div className="bg-[#111] rounded-2xl border border-white/10 overflow-hidden mb-3">
      {course.image_url && (
        <div className="w-full h-36 bg-white/5 overflow-hidden">
          <img src={course.image_url} alt={course.title}
               className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <p className="font-semibold text-white text-[1.02rem] leading-snug flex-1">{course.title}</p>
          <span className={`shrink-0 text-[0.82rem] font-semibold px-2 py-0.5 rounded-full ${
            isFree
              ? 'bg-green-900/40 text-green-400'
              : 'text-white'
          }`} style={isFree ? {} : { backgroundColor: IGV.primaryColor }}>
            {priceLabel}
          </span>
        </div>

        {course.instructor && (
          <p className="text-white/50 text-[0.86rem] mb-2">{course.instructor}</p>
        )}

        {course.description && (
          <p className="text-white/70 text-[0.92rem] leading-relaxed mb-3 line-clamp-3">{course.description}</p>
        )}

        <div className="flex flex-col gap-1.5 mb-3">
          {course.schedule_text && (
            <div className="flex items-center gap-2 text-white/50 text-[0.86rem]">
              <Clock size={13} strokeWidth={1.75} style={{ color: IGV.primaryColor }} />
              <span>{course.schedule_text}</span>
            </div>
          )}
          {(course.start_date || course.end_date) && (
            <div className="flex items-center gap-2 text-white/50 text-[0.86rem]">
              <GraduationCap size={13} strokeWidth={1.75} style={{ color: IGV.primaryColor }} />
              <span>
                {course.start_date ? formatDate(course.start_date) : ''}
                {course.end_date ? ` — ${formatDate(course.end_date)}` : ''}
              </span>
            </div>
          )}
          {course.location && (
            <div className="flex items-center gap-2 text-white/50 text-[0.86rem]">
              <MapPin size={13} strokeWidth={1.75} style={{ color: IGV.primaryColor }} />
              <span>{course.location}</span>
            </div>
          )}
          {course.max_capacity !== null && (
            <div className="flex items-center gap-2 text-white/50 text-[0.86rem]">
              <Users size={13} strokeWidth={1.75} style={{ color: IGV.primaryColor }} />
              <span>
                {course.is_full
                  ? `Vagas esgotadas (${course.max_capacity})`
                  : `${course.max_capacity - course.enrolled_count} vagas disponíveis`}
              </span>
            </div>
          )}
        </div>

        {course.prerequisites && (
          <div className="bg-amber-900/20 border border-amber-500/20 rounded-xl px-3 py-2 mb-3">
            <p className="text-[0.82rem] text-amber-300 leading-snug">
              <span className="font-semibold">Pré-requisitos: </span>{course.prerequisites}
            </p>
          </div>
        )}

        <button
          onClick={() => onEnroll(course)}
          disabled={course.is_full}
          className="w-full py-2.5 rounded-xl text-[0.97rem] font-semibold transition-opacity disabled:opacity-40"
          style={course.is_full
            ? { backgroundColor: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.3)' }
            : { backgroundColor: IGV.primaryColor, color: '#fff' }}
        >
          {course.is_full ? 'Vagas esgotadas' : 'Inscrever-se'}
        </button>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────

export default function IgvCursos() {
  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(false)
  const [selected, setSelected] = useState<Course | null>(null)

  useEffect(() => {
    fetch(EF_COURSES_URL)
      .then(r => r.json())
      .then(data => {
        setCourses(data.courses ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError(true)
        setLoading(false)
      })
  }, [])

  return (
    <div className="min-h-screen bg-black flex flex-col" style={{ fontFamily: 'DM Sans, sans-serif' }}>
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-black/90 backdrop-blur-sm border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <Link to="/igv" className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors">
          <ChevronLeft size={20} strokeWidth={2} className="text-white/70" />
        </Link>
        <h1 className="font-semibold text-white text-[1.12rem]">Cursos</h1>
      </header>

      <main className="flex-1 px-4 pt-5 pb-10 max-w-md mx-auto w-full">
        <SectionLabel>Formações disponíveis</SectionLabel>

        {loading && <Spinner />}

        {!loading && error && (
          <div className="rounded-2xl bg-[#111] border border-white/10 p-6 text-center">
            <p className="text-white/60 text-[0.97rem]">Não foi possível carregar os cursos. Tente novamente.</p>
          </div>
        )}

        {!loading && !error && courses.length === 0 && <EmptyCourses />}

        {!loading && !error && courses.map(c => (
          <CourseCard key={c.id} course={c} onEnroll={setSelected} />
        ))}
      </main>

      {selected && (
        <EnrollModal course={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
