/**
 * IgvCursos — /igv/cursos  (pública, sem auth)
 * LGPD R8: zero dado de inscritos exposto. POST envia nome+fone+email para EF.
 * EF igv-public-courses: GET cursos públicos IGV.
 * EF igv-public-enrollment: POST inscrição com upsert em people.
 */

import { useState, useEffect }      from 'react'
import { CalendarBlankIcon, CircleNotchIcon, ClockIcon, MapPinIcon, UsersIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { GlassButton, GlassCard, GlassIconButton, IconTile, IgvContent, IgvNotice, IgvPageShell, PageHeader, IGV_INPUT, IGV_TEXT, type AnyIcon } from '@/components/igv'
import { OpenBookIcon } from '@/components/igv/icons'
import { ICON_SIZE } from '@/lib/icon-tokens'

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

function Spinner() {
  return (
    <GlassCard className="flex justify-center py-10">
      <CircleNotchIcon size={ICON_SIZE.tile} className="animate-spin text-[var(--igv-accent)]" role="status" aria-label="Carregando" />
    </GlassCard>
  )
}

function EmptyCourses() {
  return (
    <IgvNotice Icon={OpenBookIcon} title="Sem cursos no momento">
      Em breve novos cursos serão disponibilizados.
    </IgvNotice>
  )
}

/** Resultado da inscrição dentro da folha: título, texto e botão de fechar. */
function EnrollResult({ Icon, title, text, tone, onClose }: { Icon: AnyIcon; title: string; text: string; tone?: 'error'; onClose: () => void }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-4">
      <IconTile Icon={Icon} />
      <p className={tone === 'error' ? `${IGV_TEXT.error} font-semibold` : IGV_TEXT.item}>{title}</p>
      <p className={IGV_TEXT.muted}>{text}</p>
      <GlassButton onClick={onClose} className="mt-3">Fechar</GlassButton>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center"
         onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-[var(--igv-ink)] opacity-50 pointer-events-none" aria-hidden="true" />
      <GlassCard className="relative w-full max-w-[480px] max-h-[90svh] overflow-y-auto rounded-b-none pb-[calc(24px+env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className={IGV_TEXT.heading}>{course.title}</h2>
            {course.instructor && <p className={`mt-0.5 ${IGV_TEXT.muted}`}>{course.instructor}</p>}
          </div>
          <GlassIconButton Icon={XIcon} label="Fechar" onClick={onClose} />
        </div>

        {status === 'success' && (
          <EnrollResult Icon={OpenBookIcon} title="Inscrição confirmada!" text="Em breve entraremos em contato com mais detalhes." onClose={onClose} />
        )}

        {status === 'duplicate' && (
          <EnrollResult Icon={OpenBookIcon} title="Você já está inscrito!" text="Sua inscrição neste curso já foi registrada." onClose={onClose} />
        )}

        {status === 'full' && (
          <EnrollResult Icon={WarningCircleIcon} title="Vagas esgotadas" text="Todas as vagas foram preenchidas." tone="error" onClose={onClose} />
        )}

        {(status === 'idle' || status === 'loading' || status === 'error') && (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {status === 'error' && <p role="alert" className={IGV_TEXT.error}>{errorMsg}</p>}

            <div>
              <label htmlFor="cur-nome" className={IGV_TEXT.label}>Nome completo *</label>
              <input
                id="cur-nome"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Seu nome"
                required
                className={IGV_INPUT}
              />
            </div>

            <div>
              <label htmlFor="cur-fone" className={IGV_TEXT.label}>WhatsApp / telefone *</label>
              <input
                id="cur-fone"
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(21) 99999-0000"
                required
                className={IGV_INPUT}
              />
            </div>

            <div>
              <label htmlFor="cur-email" className={IGV_TEXT.label}>E-mail (opcional)</label>
              <input
                id="cur-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className={IGV_INPUT}
              />
            </div>

            <p className={IGV_TEXT.muted}>
              Seus dados serão usados apenas para contato sobre este curso (LGPD).
            </p>

            <GlassButton
              type="submit"
              variant="accent"
              fullWidth
              disabled={status === 'loading' || !name.trim() || !phone.trim()}
            >
              {status === 'loading' ? 'Enviando…' : 'Confirmar inscrição'}
            </GlassButton>
          </form>
        )}
      </GlassCard>
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
    <GlassCard>
      {course.image_url && (
        <div className="-mx-5 -mt-5 mb-4 h-36 overflow-hidden rounded-t-[20px]">
          <img src={course.image_url} alt={course.title}
               className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}

      <div className="flex items-start gap-3 mb-1">
        {!course.image_url && <IconTile Icon={OpenBookIcon} />}
        <div className="flex-1 min-w-0">
          <h2 className={IGV_TEXT.heading}>{course.title}</h2>
          <p className={`mt-0.5 ${isFree ? IGV_TEXT.muted : IGV_TEXT.item}`}>{priceLabel}</p>
        </div>
      </div>

      {course.instructor && (
        <p className={`mt-2 ${IGV_TEXT.muted}`}>{course.instructor}</p>
      )}

      {course.description && (
        <p className={`mt-2 line-clamp-3 ${IGV_TEXT.body}`}>{course.description}</p>
      )}

      <div className="flex flex-col gap-1.5 mt-3">
        {course.schedule_text && (
          <DetailLine Icon={ClockIcon}>{course.schedule_text}</DetailLine>
        )}
        {(course.start_date || course.end_date) && (
          <DetailLine Icon={CalendarBlankIcon}>
            {course.start_date ? formatDate(course.start_date) : ''}
            {course.end_date ? ` — ${formatDate(course.end_date)}` : ''}
          </DetailLine>
        )}
        {course.location && (
          <DetailLine Icon={MapPinIcon}>{course.location}</DetailLine>
        )}
        {course.max_capacity !== null && (
          <DetailLine Icon={UsersIcon}>
            {course.is_full
              ? `Vagas esgotadas (${course.max_capacity})`
              : `${course.max_capacity - course.enrolled_count} vagas disponíveis`}
          </DetailLine>
        )}
      </div>

      {course.prerequisites && (
        <p className={`mt-3 rounded-2xl bg-[var(--igv-tint)] p-3 ${IGV_TEXT.muted}`}>
          <span className="font-semibold">Pré-requisitos: </span>{course.prerequisites}
        </p>
      )}

      <GlassButton
        onClick={() => onEnroll(course)}
        disabled={course.is_full}
        variant={course.is_full ? 'default' : 'accent'}
        fullWidth
        className="mt-4"
      >
        {course.is_full ? 'Vagas esgotadas' : 'Inscrever-se'}
      </GlassButton>
    </GlassCard>
  )
}

function DetailLine({ Icon, children }: { Icon: typeof ClockIcon; children: React.ReactNode }) {
  return (
    <p className={`flex items-start gap-2 ${IGV_TEXT.muted}`}>
      <Icon size={ICON_SIZE.button} className="shrink-0 text-[var(--igv-accent)]" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
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
    <IgvPageShell>
      <PageHeader title="Cursos" subtitle="Formações disponíveis" />

      <IgvContent>
        {loading && <Spinner />}

        {!loading && error && (
          <IgvNotice Icon={WarningCircleIcon} title="Não foi possível carregar os cursos. Tente novamente." tone="error" />
        )}

        {!loading && !error && courses.length === 0 && <EmptyCourses />}

        {!loading && !error && courses.map(c => (
          <CourseCard key={c.id} course={c} onEnroll={setSelected} />
        ))}
      </IgvContent>

      {selected && (
        <EnrollModal course={selected} onClose={() => setSelected(null)} />
      )}
    </IgvPageShell>
  )
}
