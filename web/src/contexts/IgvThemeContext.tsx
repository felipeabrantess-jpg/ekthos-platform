import { createContext, useContext, type ReactNode } from 'react'

interface IgvThemeContextValue { isDark: boolean }

const IgvThemeContext = createContext<IgvThemeContextValue>({ isDark: true })

export function IgvThemeProvider({ children }: { children: ReactNode }) {
  return <IgvThemeContext.Provider value={{ isDark: true }}>{children}</IgvThemeContext.Provider>
}

export function useIgvTheme(): IgvThemeContextValue {
  return useContext(IgvThemeContext)
}
