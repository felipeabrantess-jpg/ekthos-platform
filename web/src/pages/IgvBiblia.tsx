/**
 * IgvBiblia — /igv/biblia  v2
 * Navegação 3 níveis: Livro → Capítulo → Versículos → Versículo isolado
 * + Busca direta por referência (ex: "João 3:16")
 *
 * LGPD R8: zero SELECT em people. Zero banco. Feature 100% pública.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { ArrowCounterClockwiseIcon, BookOpenIcon, CaretLeftIcon, CaretRightIcon, CircleNotchIcon, MagnifyingGlassIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { GlassButton, GlassCard, IGV_FOCUS, IGV_INPUT, IGV_TEXT, IgvContent, IgvNotice, IgvPageShell, PageHeader, SectionTitle } from '@/components/igv'
import { getAllBooks, fetchChapter, type BibleBook, type BibleVerse } from '@/lib/igv-bible'
import { ICON_SIZE } from '@/lib/icon-tokens'

// ── State machine ──────────────────────────────────────────────────

type Screen =
  | { type: 'books' }
  | { type: 'chapters'; book: BibleBook }
  | { type: 'verses';   book: BibleBook; chapter: number }
  | { type: 'verse';    book: BibleBook; chapter: number; verseNum: number }
  | { type: 'reading';  book: BibleBook; chapter: number; highlightNum?: number }

// ── Module-level data (stable) ────────────────────────────────────

const ALL_BOOKS     = getAllBooks()
const OLD_TESTAMENT = ALL_BOOKS.filter(b => b.testament === 'old')
const NEW_TESTAMENT = ALL_BOOKS.filter(b => b.testament === 'new')

// ── Reference parser ──────────────────────────────────────────────

function norm(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

type ParseResult =
  | { ok: true;  book: BibleBook; chapter: number; verse: number }
  | { ok: false; error: string }

function parseReference(raw: string): ParseResult {
  const m = raw.trim().match(/^(.+?)\s+(\d+):(\d+)$/)
  if (!m) return { ok: false, error: 'Use o formato "Livro capítulo:versículo" — ex: João 3:16' }
  const [, bookRaw, chStr, vStr] = m
  const chapter = parseInt(chStr, 10)
  const verse   = parseInt(vStr, 10)
  const q       = norm(bookRaw)
  const book    = ALL_BOOKS.find(b => norm(b.name) === q || norm(b.abbr) === q)
  if (!book) return { ok: false, error: `Livro "${bookRaw}" não encontrado. Tente o nome completo ou abreviação` }
  if (chapter < 1 || chapter > book.chapters)
    return { ok: false, error: `${book.name} tem ${book.chapters} capítulo${book.chapters > 1 ? 's' : ''}` }
  if (verse < 1) return { ok: false, error: 'Versículo inválido' }
  return { ok: true, book, chapter, verse }
}

// ── Main component ────────────────────────────────────────────────

export default function IgvBiblia() {
  const [screen,      setScreen]      = useState<Screen>({ type: 'books' })
  const [chapterData, setChapterData] = useState<BibleVerse[] | null>(null)
  const [loadedFor,   setLoadedFor]   = useState<{ bookId: number; chapter: number } | null>(null)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState<string | null>(null)
  const [searchQ,     setSearchQ]     = useState('')
  const [searchErr,   setSearchErr]   = useState<string | null>(null)
  const [searching,   setSearching]   = useState(false)
  const highlightRef = useRef<HTMLDivElement>(null)

  // Scroll to highlighted verse when reading screen mounts
  useEffect(() => {
    if (screen.type === 'reading' && screen.highlightNum && highlightRef.current) {
      const t = setTimeout(() => {
        highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 80)
      return () => clearTimeout(t)
    }
  }, [screen])

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }

  // Load chapter — cached if same book+chapter already in state
  const loadChapter = useCallback(async (book: BibleBook, chapter: number): Promise<BibleVerse[] | null> => {
    if (loadedFor?.bookId === book.id && loadedFor.chapter === chapter && chapterData) {
      return chapterData
    }
    setLoading(true)
    setError(null)
    try {
      const verses = await fetchChapter(book, chapter)
      setChapterData(verses)
      setLoadedFor({ bookId: book.id, chapter })
      return verses
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar capítulo')
      return null
    } finally {
      setLoading(false)
    }
  }, [loadedFor, chapterData])

  // ── Navigation ────────────────────────────────────────────────────

  function goBooks() {
    setScreen({ type: 'books' })
    setError(null)
    setSearchErr(null)
    scrollTop()
  }

  function goChapters(book: BibleBook) {
    setScreen({ type: 'chapters', book })
    setError(null)
    scrollTop()
  }

  function goVerses(book: BibleBook, chapter: number) {
    setScreen({ type: 'verses', book, chapter })
    setError(null)
    scrollTop()
    void loadChapter(book, chapter)
  }

  function goVerse(book: BibleBook, chapter: number, verseNum: number) {
    setScreen({ type: 'verse', book, chapter, verseNum })
    scrollTop()
  }

  function goReading(book: BibleBook, chapter: number, highlightNum?: number) {
    setScreen({ type: 'reading', book, chapter, highlightNum })
    scrollTop()
  }

  // ── Search handler ────────────────────────────────────────────────

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setSearchErr(null)
    if (!searchQ.trim()) return
    const parsed = parseReference(searchQ)
    if (!parsed.ok) { setSearchErr(parsed.error); return }
    const { book, chapter, verse } = parsed
    setSearching(true)
    try {
      const verses = await loadChapter(book, chapter)
      if (!verses) {
        setSearchErr(`Não foi possível carregar ${book.name} ${chapter}. Tente novamente.`)
        return
      }
      const found = verses.find(v => v.number === verse)
      if (!found) {
        setSearchErr(`${book.name} ${chapter} tem ${verses.length} versículo${verses.length > 1 ? 's' : ''}`)
        return
      }
      setSearchQ('')
      setSearchErr(null)
      goVerse(book, chapter, verse)
    } finally {
      setSearching(false)
    }
  }

  // ── Header ────────────────────────────────────────────────────────

  const headerTitle =
    screen.type === 'books'    ? 'Bíblia Sagrada' :
    screen.type === 'chapters' ? screen.book.name :
    screen.type === 'verses'   ? `${screen.book.name} ${screen.chapter}` :
    screen.type === 'verse'    ? `${screen.book.name} ${screen.chapter}:${screen.verseNum}` :
    /* reading */                `${screen.book.name} ${screen.chapter}`

  const onBack =
    screen.type === 'books'    ? undefined :
    screen.type === 'chapters' ? goBooks :
    screen.type === 'verses'   ? () => goChapters(screen.book) :
    screen.type === 'verse'    ? () => goVerses(screen.book, screen.chapter) :
    /* reading */                () => goVerse(screen.book, screen.chapter, screen.highlightNum ?? 1)

  // ── Render ─────────────────────────────────────────────────────────

  const verse = screen.type === 'verse' && chapterData
    ? (chapterData.find(v => v.number === screen.verseNum) ?? null)
    : null

  return (
    <IgvPageShell>
      <PageHeader
        title={headerTitle}
        subtitle={screen.type === 'reading' ? 'Almeida' : undefined}
        backTo="/igv"
        onBack={onBack}
      />

      <IgvContent>

        {/* ── Livros ── */}
        {screen.type === 'books' && (
          <>
            {/* Busca por referência */}
            <GlassCard>
              <form onSubmit={handleSearch}>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={searchQ}
                    onChange={e => { setSearchQ(e.target.value); setSearchErr(null) }}
                    placeholder="ex: João 3:16"
                    aria-label="Buscar por referência"
                    className={`min-w-0 flex-1 ${IGV_INPUT}`}
                  />
                  {searching ? (
                    <CircleNotchIcon size={ICON_SIZE.list} className="mx-3 animate-spin shrink-0 text-[var(--igv-accent)]" role="status" aria-label="Buscando" />
                  ) : (
                    <GlassButton type="submit" variant="accent" Icon={MagnifyingGlassIcon} className="shrink-0">Ir</GlassButton>
                  )}
                </div>
                {searchErr && (
                  <p role="alert" className={`mt-2 ${IGV_TEXT.error}`}>{searchErr}</p>
                )}
              </form>
            </GlassCard>

            <BookSection title="Antigo Testamento" subtitle="39 livros" books={OLD_TESTAMENT} onSelect={goChapters} />
            <BookSection title="Novo Testamento"   subtitle="27 livros" books={NEW_TESTAMENT}  onSelect={goChapters} />
            <p className={`mt-3 px-1 text-center ${IGV_TEXT.muted}`}>
              Tradução João Ferreira de Almeida — domínio público
            </p>
          </>
        )}

        {/* ── Capítulos ── */}
        {screen.type === 'chapters' && (
          <GlassCard>
            <p className={`mb-4 ${IGV_TEXT.muted}`}>
              Selecione um capítulo · {screen.book.chapters} no total
            </p>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: screen.book.chapters }, (_, i) => i + 1).map(ch => (
                <GlassButton key={ch} onClick={() => goVerses(screen.book, ch)} className="!px-0 !rounded-2xl igv-glass--inset">
                  {ch}
                </GlassButton>
              ))}
            </div>
          </GlassCard>
        )}

        {/* ── Versículos (lista numerada) ── */}
        {screen.type === 'verses' && (
          <>
            {loading && <LoadingSpinner />}
            {error && !loading && (
              <ErrorState message={error} onRetry={() => goVerses(screen.book, screen.chapter)} />
            )}
            {!loading && !error && chapterData && (
              <GlassCard>
                <p className={`mb-4 ${IGV_TEXT.muted}`}>
                  Selecione um versículo · {chapterData.length} versículos
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {chapterData.map(v => (
                    <GlassButton key={v.number} onClick={() => goVerse(screen.book, screen.chapter, v.number)} className="!px-0 !rounded-2xl igv-glass--inset">
                      {v.number}
                    </GlassButton>
                  ))}
                </div>
              </GlassCard>
            )}
          </>
        )}

        {/* ── Versículo isolado ── */}
        {screen.type === 'verse' && verse && chapterData && (
          <>
            {/* Texto em destaque */}
            <GlassCard className="py-6">
              <p className={`igv-serif !font-normal mb-4 ${IGV_TEXT.heading}`}>
                {verse.text}
              </p>
              <p className={`text-right ${IGV_TEXT.muted}`}>
                {screen.book.name} {screen.chapter}:{screen.verseNum}
              </p>
            </GlassCard>

            {/* Nav anterior / próximo */}
            <div className="grid grid-cols-2 gap-2">
              <GlassButton
                onClick={() => goVerse(screen.book, screen.chapter, screen.verseNum - 1)}
                disabled={screen.verseNum <= 1}
                Icon={CaretLeftIcon}
                className="!px-2"
              >
                Anterior
              </GlassButton>
              <GlassButton
                onClick={() => goVerse(screen.book, screen.chapter, screen.verseNum + 1)}
                disabled={screen.verseNum >= chapterData.length}
                className="!px-2"
              >
                Próximo
                <CaretRightIcon size={ICON_SIZE.button} aria-hidden="true" />
              </GlassButton>
            </div>

            {/* Posição: volta à lista de versículos */}
            <GlassButton onClick={() => goVerses(screen.book, screen.chapter)} fullWidth>
              {screen.verseNum} / {chapterData.length}
            </GlassButton>

            {/* Ver capítulo completo */}
            <GlassButton
              onClick={() => goReading(screen.book, screen.chapter, screen.verseNum)}
              variant="accent"
              Icon={BookOpenIcon}
              fullWidth
            >
              Ver capítulo completo
            </GlassButton>
          </>
        )}

        {/* ── Leitura completa (versículo destacado) ── */}
        {screen.type === 'reading' && (
          <>
            {loading && <LoadingSpinner />}
            {error && !loading && (
              <ErrorState message={error} onRetry={() => void loadChapter(screen.book, screen.chapter)} />
            )}
            {!loading && !error && chapterData && (
              <>
                <GlassCard className="flex flex-col gap-2">
                  {chapterData.map(v => {
                    const hi = v.number === screen.highlightNum
                    return (
                      <div
                        key={v.number}
                        ref={hi ? highlightRef : undefined}
                        className={`flex gap-3 rounded-xl p-2 ${hi ? 'bg-[var(--igv-tint)] outline outline-1 outline-[var(--igv-accent)]' : ''}`}
                      >
                        <span className={`shrink-0 w-7 text-right tabular-nums ${IGV_TEXT.muted}`}>
                          {v.number}
                        </span>
                        <p className={`igv-serif min-w-0 ${hi ? '' : '!font-normal'} ${IGV_TEXT.body}`}>
                          {v.text}
                        </p>
                      </div>
                    )
                  })}
                </GlassCard>
                <p className={`mt-3 px-1 text-center ${IGV_TEXT.muted}`}>
                  Tradução João Ferreira de Almeida — domínio público
                </p>
              </>
            )}
          </>
        )}

      </IgvContent>
    </IgvPageShell>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function BookSection({
  title, subtitle, books, onSelect,
}: {
  title: string
  subtitle: string
  books: BibleBook[]
  onSelect: (b: BibleBook) => void
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <SectionTitle>{title}</SectionTitle>
        <p className={`mt-0.5 px-1 ${IGV_TEXT.muted}`}>{subtitle}</p>
      </div>
      <GlassCard className="!py-2">
        <div className="divide-y divide-[var(--igv-line)]">
          {books.map(book => (
            <button
              key={book.id}
              type="button"
              onClick={() => onSelect(book)}
              className={`w-full min-h-[52px] flex items-center justify-between gap-3 py-2 text-left rounded-lg ${IGV_FOCUS}`}
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className={`shrink-0 w-10 tabular-nums ${IGV_TEXT.muted}`}>{book.abbr}</span>
                <span className={IGV_TEXT.item}>{book.name}</span>
              </span>
              <span className={`flex items-center gap-2 shrink-0 ${IGV_TEXT.muted}`}>
                {book.chapters} cap.
                <CaretRightIcon size={ICON_SIZE.button} aria-hidden="true" />
              </span>
            </button>
          ))}
        </div>
      </GlassCard>
    </section>
  )
}

function LoadingSpinner() {
  return (
    <GlassCard className="flex justify-center py-10">
      <CircleNotchIcon size={ICON_SIZE.tile} className="animate-spin text-[var(--igv-accent)]" role="status" aria-label="Carregando" />
    </GlassCard>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <IgvNotice Icon={WarningCircleIcon} title={message} tone="error">
      <GlassButton onClick={onRetry} Icon={ArrowCounterClockwiseIcon} className="mt-3">
        Tentar novamente
      </GlassButton>
    </IgvNotice>
  )
}
