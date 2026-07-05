import { Outlet }           from 'react-router-dom'
import { IgvThemeProvider } from '@/contexts/IgvThemeContext'

export default function IgvLayout() {
  return (
    <IgvThemeProvider>
      <div className="dark overflow-x-hidden">
        <Outlet />
      </div>
    </IgvThemeProvider>
  )
}
