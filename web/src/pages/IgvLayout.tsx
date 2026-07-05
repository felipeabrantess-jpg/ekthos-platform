import { Outlet }           from 'react-router-dom'
import { IgvThemeProvider } from '@/contexts/IgvThemeContext'

export default function IgvLayout() {
  return (
    <IgvThemeProvider>
      <div className="dark">
        <Outlet />
      </div>
    </IgvThemeProvider>
  )
}
