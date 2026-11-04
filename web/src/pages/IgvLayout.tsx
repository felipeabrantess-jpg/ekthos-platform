import { Outlet }           from 'react-router-dom'
import { IgvThemeProvider } from '@/contexts/IgvThemeContext'
import { GlassNavBar }       from '@/components/igv'

export default function IgvLayout() {
  return (
    <IgvThemeProvider>
      <div className="igv-app overflow-x-hidden">
        <Outlet />
        <GlassNavBar />
      </div>
    </IgvThemeProvider>
  )
}
