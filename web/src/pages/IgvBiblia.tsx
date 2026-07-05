/**
 * IgvBiblia — /igv/biblia  v2
 * Navegação 3 níveis: Livro → Capítulo → Versículos → Versículo isolado
 * + Busca direta por referência (ex: "João 3:16")
 *
 * LGPD R8: zero SELECT em people. Zero banco. Feature 100% pública.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Link }     from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2, RotateCcw, Search, BookOpen } from 'lucide-react'
import { getAllBooks, fetchChapter, type BibleBook, type BibleVerse } from '@/lib/igv-bible'
import { IGV } from '@/lib/igv-public-data'

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

  function BackButton() {
    const base = 'w-9 h-9 rounded-xl flex items-center justify-center shrink-0 active:bg-white/10 transition-colors'
    const icon = <ChevronLeft size={22} strokeWidth={2} className="text-white/60" />

    if (screen.type === 'books')
      return <Link to="/igv" className={base} aria-label="Voltar para IGV">{icon}</Link>

    const fn =
      screen.type === 'chapters' ? goBooks :
      screen.type === 'verses'   ? () => goChapters(screen.book) :
      screen.type === 'verse'    ? () => goVerses(screen.book, screen.chapter) :
      /* reading */                () => goVerse(screen.book, screen.chapter, screen.highlightNum ?? 1)

    return <button onClick={fn} className={base} aria-label="Voltar">{icon}</button>
  }

  // ── Render ─────────────────────────────────────────────────────────

  const verse = screen.type === 'verse' && chapterData
    ? (chapterData.find(v => v.number === screen.verseNum) ?? null)
    : null

  return (
    <div
      className="min-h-screen bg-black flex flex-col"
      style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
    >
      {/* Header */}
      <header className="sticky top-0 z-30 bg-black/95 backdrop-blur border-b border-white/10">
        <div className="flex items-center h-14 px-3 max-w-[480px] mx-auto gap-2">
          <BackButton />
          <h1 className="flex-1 min-w-0 font-semibold text-white text-[1.07rem] truncate">
            {headerTitle}
          </h1>
          {screen.type === 'reading' && (
            <span className="text-[0.75rem] text-white/40 shrink-0 pr-1">Almeida</span>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-[480px] mx-auto w-full px-4 py-4">

        {/* ── Livros ── */}
        {screen.type === 'books' && (
          <div className="space-y-5 pb-8">
            {/* Busca por referência */}
            <form onSubmit={handleSearch}>
              <div className="flex items-center bg-[#111] rounded-2xl border border-white/10 overflow-hidden">
                <Search size={15} strokeWidth={2} className="ml-4 shrink-0 text-white/30" />
                <input
                  type="text"
                  value={searchQ}
                  onChange={e => { setSearchQ(e.target.value); setSearchErr(null) }}
                  placeholder="ex: João 3:16"
                  className="flex-1 bg-transparent py-3 px-3 text-[1rem] text-white placeholder:text-white/30 outline-none"
                />
                {searching ? (
                  <Loader2 size={16} className="mr-4 animate-spin shrink-0" style={{ color: IGV.primaryColor }} />
                ) : (
                  <button
                    type="submit"
                    className="mr-2 px-3 py-1.5 rounded-xl text-[0.86rem] font-semibold transition-opacity active:opacity-60"
                    style={{ backgroundColor: `${IGV.primaryColor}15`, color: IGV.primaryColor }}
                  >
                    Ir
                  </button>
                )}
              </div>
              {searchErr && (
                <p className="mt-1.5 ml-1 text-[0.75rem] text-red-400">{searchErr}</p>
              )}
            </form>

            <BookSection title="Antigo Testamento" subtitle="39 livros" books={OLD_TESTAMENT} onSelect={goChapters} />
            <BookSection title="Novo Testamento"   subtitle="27 livros" books={NEW_TESTAMENT}  onSelect={goChapters} />
            <p className="text-center text-[0.72rem] text-white/30">
              Tradução João Ferreira de Almeida — domínio público
            </p>
          </div>
        )}

        {/* ── Capítulos ── */}
        {screen.type === 'chapters' && (
          <div className="pb-8">
            <p className="text-[0.82rem] text-white/40 mb-3">
              Selecione um capítulo · {screen.book.chapters} no total
            </p>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: screen.book.chapters }, (_, i) => i + 1).map(ch => (
                <button
                  key={ch}
                  onClick={() => goVerses(screen.book, ch)}
                  className="h-11 rounded-xl text-[1rem] font-semibold bg-[#111] border border-white/10 active:scale-95 transition-all"
                  style={{ color: IGV.primaryColor }}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Versículos (lista numerada) ── */}
        {screen.type === 'verses' && (
          <div className="pb-8">
            {loading && <LoadingSpinner />}
            {error && !loading && (
              <ErrorState message={error} onRetry={() => goVerses(screen.book, screen.chapter)} />
            )}
            {!loading && !error && chapterData && (
              <>
                <p className="text-[0.82rem] text-white/40 mb-3">
                  Selecione um versículo · {chapterData.length} versículos
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {chapterData.map(v => (
                    <button
                      key={v.number}
                      onClick={() => goVerse(screen.book, screen.chapter, v.number)}
                      className="h-11 rounded-xl text-[1rem] font-semibold bg-[#111] border border-white/10 active:scale-95 transition-all"
                      style={{ color: IGV.primaryColor }}
                    >
                      {v.number}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Versículo isolado ── */}
        {screen.type === 'verse' && verse && chapterData && (
          <div className="pb-8 flex flex-col gap-5">
            {/* Texto em destaque */}
            <div className="bg-[#111] rounded-2xl border border-white/10 px-5 py-6">
              <p className="text-[1.18rem] text-white/90 leading-[1.78] mb-4">
                {verse.text}
              </p>
              <p
                className="text-[0.92rem] font-semibold text-right"
                style={{ color: IGV.primaryColor }}
              >
                {screen.book.name} {screen.chapter}:{screen.verseNum}
              </p>
            </div>

            {/* Nav prev / posição / next */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => goVerse(screen.book, screen.chapter, screen.verseNum - 1)}
                disabled={screen.verseNum <= 1}
                className="flex items-center gap-1 text-[0.94rem] font-medium px-3 py-2 rounded-xl disabled:opacity-25 transition-opacity"
                style={{ color: IGV.primaryColor }}
              >
                <ChevronLeft size={16} strokeWidth={2.5} />
                Anterior
              </button>

              <button
                onClick={() => goVerses(screen.book, screen.chapter)}
                className="text-[0.82rem] text-white/40 px-2 py-1 rounded-lg active:bg-white/5"
              >
                {screen.verseNum} / {chapterData.length}
              </button>

              <button
                onClick={() => goVerse(screen.book, screen.chapter, screen.verseNum + 1)}
                disabled={screen.verseNum >= chapterData.length}
                className="flex items-center gap-1 text-[0.94rem] font-medium px-3 py-2 rounded-xl disabled:opacity-25 transition-opacity"
                style={{ color: IGV.primaryColor }}
              >
                Próximo
                <ChevronRight size={16} strokeWidth={2.5} />
              </button>
            </div>

            {/* Ver capítulo completo */}
            <button
              onClick={() => goReading(screen.book, screen.chapter, screen.verseNum)}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border text-[0.92rem] font-medium transition-opacity active:opacity-60"
              style={{
                color: IGV.primaryColor,
                borderColor: `${IGV.primaryColor}28`,
                backgroundColor: `${IGV.primaryColor}08`,
              }}
            >
              <BookOpen size={15} strokeWidth={1.75} />
              Ver capítulo completo
            </button>
          </div>
        )}

        {/* ── Leitura completa (versículo destacado) ── */}
        {screen.type === 'reading' && (
          <div className="pb-8">
            {loading && <LoadingSpinner />}
            {error && !loading && (
              <ErrorState message={error} onRetry={() => void loadChapter(screen.book, screen.chapter)} />
            )}
            {!loading && !error && chapterData && (
              <>
                <div className="space-y-2">
                  {chapterData.map(v => {
                    const hi = v.number === screen.highlightNum
                    return (
                      <div
                        key={v.number}
                        ref={hi ? highlightRef : undefined}
                        className={`flex gap-3 rounded-xl px-2 py-1 ${hi ? 'bg-amber-950/30 ring-1 ring-amber-600/20' : ''}`}
                      >
                        <span
                          className="shrink-0 text-[0.78rem] font-bold pt-[0.22rem] w-6 text-right tabular-nums"
                          style={{ color: hi ? IGV.primaryColor : `${IGV.primaryColor}70` }}
                        >
                          {v.number}
                        </span>
                        <p className={`text-[1.05rem] leading-[1.65] ${hi ? 'text-white font-medium' : 'text-white/85'}`}>
                          {v.text}
                        </p>
                      </div>
                    )
                  })}
                </div>
                <p className="text-center text-[0.72rem] text-white/30 mt-8">
                  Tradução João Ferreira de Almeida — domínio público
                </p>
              </>
            )}
          </div>
        )}

      </main>
    </div>
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
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h2
          className="text-[0.77rem] font-semibold uppercase tracking-[0.14em]"
          style={{ color: IGV.primaryColor }}
        >
          {title}
        </h2>
        <span className="text-[0.72rem] text-white/40">{subtitle}</span>
      </div>
      <div className="bg-[#111] rounded-2xl border border-white/10 overflow-hidden divide-y divide-white/[0.04]">
        {books.map(book => (
          <button
            key={book.id}
            onClick={() => onSelect(book)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span
                className="text-[0.72rem] font-bold shrink-0 w-8 text-right tabular-nums"
                style={{ color: `${IGV.primaryColor}70` }}
              >
                {book.abbr}
              </span>
              <span className="text-[1rem] font-medium text-white">{book.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[0.78rem] text-white/40">{book.chapters} cap.</span>
              <ChevronRight size={14} strokeWidth={2} className="text-white/20" />
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={28} className="animate-spin" style={{ color: IGV.primaryColor }} />
    </div>
  )
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center py-16 gap-4 text-center">
      <p className="text-[1rem] text-white/60 leading-relaxed max-w-xs">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-2 text-[0.92rem] font-medium px-4 py-2 rounded-xl border"
        style={{ color: IGV.primaryColor, borderColor: `${IGV.primaryColor}40` }}
      >
        <RotateCcw size={14} strokeWidth={2} />
        Tentar novamente
      </button>
    </div>
  )
}
