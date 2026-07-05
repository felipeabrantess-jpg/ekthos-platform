import { createContext, useContext, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'igv-theme'
type Theme = 'light' | 'dark'

interface IgvThemeContextValue {
  isDark: boolean
  toggleTheme: () => void
}

const IgvThemeContext = createContext<IgvThemeContextValue>({
  isDark: false,
  toggleTheme: () => {},
})

export function IgvThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return 'light'
    return (localStorage.getItem(STORAGE_KEY) as Theme) ?? 'light'
  })

  const isDark = theme === 'dark'

  const toggleTheme = () => {
    const next: Theme = isDark ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem(STORAGE_KEY, next)
  }

  return (
    <IgvThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </IgvThemeContext.Provider>
  )
}

export function useIgvTheme(): IgvThemeContextValue {
  return useContext(IgvThemeContext)
}
