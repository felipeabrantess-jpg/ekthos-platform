import { Outlet }    from 'react-router-dom'
import { Sun, Moon } from 'lucide-react'
import { IgvThemeProvider, useIgvTheme } from '@/contexts/IgvThemeContext'

function IgvThemeToggle() {
  const { isDark, toggleTheme } = useIgvTheme()
  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-colors bg-white dark:bg-black border border-black/10 dark:border-white/20"
      aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
    >
      {isDark
        ? <Sun  size={18} strokeWidth={1.75} className="text-white" />
        : <Moon size={18} strokeWidth={1.75} className="text-gray-600" />
      }
    </button>
  )
}

function IgvLayoutInner() {
  const { isDark } = useIgvTheme()
  return (
    <div className={isDark ? 'dark' : ''}>
      <Outlet />
      <div className="fixed top-4 right-4 z-50 pointer-events-auto">
        <IgvThemeToggle />
      </div>
    </div>
  )
}

export default function IgvLayout() {
  return (
    <IgvThemeProvider>
      <IgvLayoutInner />
    </IgvThemeProvider>
  )
}
