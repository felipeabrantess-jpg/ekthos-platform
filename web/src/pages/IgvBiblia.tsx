/**
 * IgvBiblia — /igv/biblia
 * Leitura da Bíblia Sagrada via bible-api.com (tradução Almeida, domínio público).
 * LGPD R8: zero SELECT em people. Zero banco. Zero dado privado.
 */

import { useState } from 'react'
import { Link }     from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2, RotateCcw } from 'lucide-react'
import { getAllBooks, fetchChapter, type BibleBook, type BibleVerse } from '@/lib/igv-bible'
import { IGV } from '@/lib/igv-public-data'

// ── State machine ──────────────────────────────────────────────────

type Screen =
  | { type: 'books' }
  | { type: 'chapters'; book: BibleBook }
  | { type: 'reading';  book: BibleBook; chapter: number }

// ── Page ──────────────────────────────────────────────────────────

export default function IgvBiblia() {
  const [screen,  setScreen]  = useState<Screen>({ type: 'books' })
  const [verses,  setVerses]  = useState<BibleVerse[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const allBooks      = getAllBooks()
  const oldTestament  = allBooks.filter(b => b.testament === 'old')
  const newTestament  = allBooks.filter(b => b.testament === 'new')

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }

  function goBooks() {
    setScreen({ type: 'books' })
    setVerses(null)
    setError(null)
    scrollTop()
  }

  function goChapters(book: BibleBook) {
    setScreen({ type: 'chapters', book })
    setVerses(null)
    setError(null)
    scrollTop()
  }

  async function goReading(book: BibleBook, chapter: number) {
    setScreen({ type: 'reading', book, chapter })
    setVerses(null)
    setError(null)
    setLoading(true)
    scrollTop()
    try {
      const data = await fetchChapter(book, chapter)
      setVerses(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar capítulo')
    } finally {
      setLoading(false)
    }
  }

  function navChapter(delta: number) {
    if (screen.type !== 'reading') return
    const next = screen.chapter + delta
    if (next < 1 || next > screen.book.chapters) return
    void goReading(screen.book, next)
  }

  // ── Header back action ────────────────────────────────────────────

  const headerBack =
    screen.type === 'books'    ? null :
    screen.type === 'chapters' ? () => goBooks() :
                                 () => goChapters(screen.book)

  const headerTitle =
    screen.type === 'books'    ? 'Bíblia Sagrada' :
    screen.type === 'chapters' ? screen.book.name :
                                 `${screen.book.name} ${screen.chapter}`

  return (
    <div
      className="min-h-screen bg-[#F9F7F4] flex flex-col"
      style={{ fontFamily: '"DM Sans", system-ui, sans-serif' }}
    >
      {/* ── Header ── */}
      <header className="sticky top-0 z-30 bg-[#F9F7F4]/95 backdrop-blur border-b border-black/[0.06]">
        <div className="flex items-center h-14 px-3 max-w-[480px] mx-auto gap-2">

          {headerBack ? (
            <button
              onClick={headerBack}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 active:bg-black/5 transition-colors"
              aria-label="Voltar"
            >
              <ChevronLeft size={22} strokeWidth={2} className="text-gray-500" />
            </button>
          ) : (
            <Link
              to="/igv"
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 active:bg-black/5 transition-colors"
              aria-label="Voltar para IGV"
            >
              <ChevronLeft size={22} strokeWidth={2} className="text-gray-500" />
            </Link>
          )}

          <h1 className="flex-1 min-w-0 font-semibold text-gray-900 text-[0.95rem] truncate">
            {headerTitle}
          </h1>

          {screen.type === 'reading' && (
            <span className="text-[0.65rem] text-gray-400 shrink-0 pr-1">Almeida</span>
          )}
        </div>
      </header>

      {/* ── Content ── */}
      <main className="flex-1 max-w-[480px] mx-auto w-full px-4 py-4">

        {/* ── Livros ── */}
        {screen.type === 'books' && (
          <div className="space-y-5 pb-8">
            <BookSection
              title="Antigo Testamento"
              subtitle="39 livros"
              books={oldTestament}
              onSelect={goChapters}
            />
            <BookSection
              title="Novo Testamento"
              subtitle="27 livros"
              books={newTestament}
              onSelect={goChapters}
            />
            <p className="text-center text-[0.62rem] text-gray-300">
              Tradução João Ferreira de Almeida — domínio público
            </p>
          </div>
        )}

        {/* ── Capítulos ── */}
        {screen.type === 'chapters' && (
          <div className="pb-8">
            <p className="text-[0.7rem] text-gray-400 mb-3">
              Selecione um capítulo · {screen.book.chapters} no total
            </p>
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: screen.book.chapters }, (_, i) => i + 1).map(ch => (
                <button
                  key={ch}
                  onClick={() => void goReading(screen.book, ch)}
                  className="h-11 rounded-xl text-[0.875rem] font-semibold bg-white border border-black/[0.07] shadow-sm active:scale-95 transition-all"
                  style={{ color: IGV.primaryColor }}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Leitura ── */}
        {screen.type === 'reading' && (
          <div className="pb-8">
            {loading && (
              <div className="flex items-center justify-center py-20">
                <Loader2
                  size={28}
                  className="animate-spin"
                  style={{ color: IGV.primaryColor }}
                />
              </div>
            )}

            {error && !loading && (
              <div className="flex flex-col items-center py-16 gap-4 text-center">
                <p className="text-[0.875rem] text-gray-500 leading-relaxed max-w-xs">{error}</p>
                <button
                  onClick={() => void goReading(screen.book, screen.chapter)}
                  className="inline-flex items-center gap-2 text-[0.8rem] font-medium px-4 py-2 rounded-xl border"
                  style={{ color: IGV.primaryColor, borderColor: `${IGV.primaryColor}40` }}
                >
                  <RotateCcw size={14} strokeWidth={2} />
                  Tentar novamente
                </button>
              </div>
            )}

            {verses && !loading && (
              <>
                {/* Versículos */}
                <div className="space-y-3">
                  {verses.map(v => (
                    <div key={v.number} className="flex gap-3">
                      <span
                        className="shrink-0 text-[0.68rem] font-bold pt-[0.2rem] w-6 text-right tabular-nums"
                        style={{ color: `${IGV.primaryColor}80` }}
                      >
                        {v.number}
                      </span>
                      <p className="text-[0.925rem] text-gray-800 leading-[1.65]">
                        {v.text}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Navegação anterior / próximo */}
                <div className="flex items-center justify-between pt-6 mt-6 border-t border-black/[0.06]">
                  <button
                    onClick={() => navChapter(-1)}
                    disabled={screen.chapter <= 1}
                    className="flex items-center gap-1 text-[0.82rem] font-medium px-3 py-2 rounded-xl disabled:opacity-25 transition-opacity"
                    style={{ color: IGV.primaryColor }}
                  >
                    <ChevronLeft size={16} strokeWidth={2.5} />
                    Anterior
                  </button>

                  <button
                    onClick={() => goChapters(screen.book)}
                    className="text-[0.72rem] text-gray-400 px-2 py-1 rounded-lg active:bg-black/5"
                  >
                    Cap. {screen.chapter} / {screen.book.chapters}
                  </button>

                  <button
                    onClick={() => navChapter(+1)}
                    disabled={screen.chapter >= screen.book.chapters}
                    className="flex items-center gap-1 text-[0.82rem] font-medium px-3 py-2 rounded-xl disabled:opacity-25 transition-opacity"
                    style={{ color: IGV.primaryColor }}
                  >
                    Próximo
                    <ChevronRight size={16} strokeWidth={2.5} />
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// ── Seção de livros (AT / NT) ──────────────────────────────────────

function BookSection({
  title,
  subtitle,
  books,
  onSelect,
}: {
  title: string
  subtitle: string
  books: BibleBook[]
  onSelect: (book: BibleBook) => void
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-2">
        <h2
          className="text-[0.67rem] font-semibold uppercase tracking-[0.14em]"
          style={{ color: IGV.primaryColor }}
        >
          {title}
        </h2>
        <span className="text-[0.62rem] text-gray-400">{subtitle}</span>
      </div>

      <div className="bg-white rounded-2xl border border-black/[0.05] shadow-sm overflow-hidden divide-y divide-black/[0.04]">
        {books.map(book => (
          <button
            key={book.id}
            onClick={() => onSelect(book)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 active:bg-gray-100/70 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span
                className="text-[0.62rem] font-bold shrink-0 w-8 text-right tabular-nums"
                style={{ color: `${IGV.primaryColor}70` }}
              >
                {book.abbr}
              </span>
              <span className="text-[0.875rem] font-medium text-gray-900">{book.name}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[0.68rem] text-gray-400">{book.chapters} cap.</span>
              <ChevronRight size={14} strokeWidth={2} className="text-gray-300" />
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}
