// StickyHorizontalScroll — rolagem horizontal sempre acessível.
//
// A barra horizontal nativa de uma tabela larga só aparece no fim do conteúdo, obrigando
// a descer a página. Aqui o conteúdo rola num wrapper com a barra nativa OCULTA e a única
// barra visível é um "trilho" fixo (position: sticky; bottom: 0) na base da área visível
// do contêiner de rolagem vertical (o <main> do layout). O trilho tem um fantasma com a
// largura real do conteúdo e os dois scrollLeft ficam sincronizados nos dois sentidos —
// uma barra só, um movimento só. Quando o conteúdo cabe na largura, o trilho some.
import { useEffect, useRef, useState, type ReactNode } from 'react'

export function StickyHorizontalScroll({ children, className = '', contentClassName = '', testId = 'sticky-hscroll' }: { children: ReactNode; className?: string; contentClassName?: string; testId?: string }) {
  const contentRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const [scrollWidth, setScrollWidth] = useState(0)
  const [clientWidth, setClientWidth] = useState(0)
  const syncing = useRef(false)

  // Largura real do conteúdo (muda com colunas, filtros, páginas, redimensionamento)
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => { setScrollWidth(el.scrollWidth); setClientWidth(el.clientWidth) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    const table = el.firstElementChild
    if (table) ro.observe(table)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [children])

  const link = (from: HTMLDivElement | null, to: HTMLDivElement | null) => {
    if (!from || !to || syncing.current) return
    syncing.current = true
    if (to.scrollLeft !== from.scrollLeft) to.scrollLeft = from.scrollLeft
    syncing.current = false
  }

  const needsRail = scrollWidth > clientWidth + 1

  return (
    <div className={className}>
      <div
        ref={contentRef}
        data-testid={`${testId}-content`}
        className={`overflow-x-auto ${contentClassName}`}
        style={{ scrollbarWidth: 'none' }}
        onScroll={() => link(contentRef.current, railRef.current)}
      >
        {/* esconde a barra nativa também no WebKit/Blink */}
        <style>{`[data-testid="${testId}-content"]::-webkit-scrollbar{display:none}`}</style>
        {children}
      </div>
      {needsRail && (
        <div
          ref={railRef}
          data-testid={testId}
          aria-label="Rolagem horizontal da tabela"
          className="sticky bottom-0 z-10 overflow-x-auto overflow-y-hidden bg-bg-primary/95 border-t border-border-default"
          style={{ height: 14 }}
          onScroll={() => link(railRef.current, contentRef.current)}
        >
          <div style={{ width: scrollWidth, height: 1 }} />
        </div>
      )}
    </div>
  )
}
