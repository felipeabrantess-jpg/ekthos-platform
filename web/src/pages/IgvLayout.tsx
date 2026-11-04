import { useEffect }        from 'react'
import { Outlet }           from 'react-router-dom'
import { IgvThemeProvider } from '@/contexts/IgvThemeContext'
import { GlassNavBar }       from '@/components/igv'

// Ícone se mexe quando o dedo toca ou passa por cima (e no passar do mouse)
function wiggleAt(target: Element | null) {
  const host = target?.closest('a, button, .igv-glass--tile')
  const svg = host?.querySelector('svg')
  if (!svg || svg.classList.contains('igv-wiggle')) return
  svg.classList.add('igv-wiggle')
  svg.addEventListener('animationend', () => svg.classList.remove('igv-wiggle'), { once: true })
}

export default function IgvLayout() {
  useEffect(() => {
    const onTouch = (e: TouchEvent) => {
      const t = e.touches[0]
      if (t) wiggleAt(document.elementFromPoint(t.clientX, t.clientY))
    }
    const onOver = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') wiggleAt(e.target as Element)
    }
    document.addEventListener('touchstart', onTouch, { passive: true })
    document.addEventListener('touchmove', onTouch, { passive: true })
    document.addEventListener('pointerover', onOver)
    return () => {
      document.removeEventListener('touchstart', onTouch)
      document.removeEventListener('touchmove', onTouch)
      document.removeEventListener('pointerover', onOver)
    }
  }, [])

  return (
    <IgvThemeProvider>
      <div className="igv-app overflow-x-hidden">
        <Outlet />
        <GlassNavBar />
      </div>
    </IgvThemeProvider>
  )
}
