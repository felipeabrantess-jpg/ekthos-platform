import { Sun, Moon } from 'lucide-react'
import { useTheme } from '@/contexts/ThemeProvider'

export default function ThemeToggle() {
  const { effectiveTheme, setTheme } = useTheme()

  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-lg"
      style={{ background: 'var(--bg-hover)' }}
    >
      <button
        onClick={() => setTheme('light')}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
        style={{
          background: effectiveTheme === 'light' ? 'var(--bg-surface)' : 'transparent',
          color: effectiveTheme === 'light' ? 'var(--color-primary-text)' : 'var(--text-secondary)',
          boxShadow: effectiveTheme === 'light' ? '0 1px 2px rgba(7,19,31,0.08)' : 'none',
        }}
        aria-label="Ativar modo claro"
      >
        <Sun size={14} />
        <span>Claro</span>
      </button>
      <button
        onClick={() => setTheme('dark')}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all"
        style={{
          background: effectiveTheme === 'dark' ? 'var(--bg-surface)' : 'transparent',
          color: effectiveTheme === 'dark' ? 'var(--color-primary)' : 'var(--text-secondary)',
          boxShadow: effectiveTheme === 'dark' ? '0 1px 2px rgba(0,0,0,0.3)' : 'none',
        }}
        aria-label="Ativar modo escuro"
      >
        <Moon size={14} />
        <span>Escuro</span>
      </button>
    </div>
  )
}
