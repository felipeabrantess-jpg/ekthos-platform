import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    // Target browsers com suporte a módulos ES modernos
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Vendor: React core
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
            return 'vendor-react'
          }
          // Vendor: React Router
          if (id.includes('node_modules/react-router') || id.includes('node_modules/@remix-run')) {
            return 'vendor-router'
          }
          // Vendor: TanStack Query
          if (id.includes('node_modules/@tanstack/')) {
            return 'vendor-query'
          }
          // Vendor: Supabase
          if (id.includes('node_modules/@supabase/')) {
            return 'vendor-supabase'
          }
          // Vendor: Lucide icons (pesado)
          if (id.includes('node_modules/lucide-react')) {
            return 'vendor-icons'
          }
          // Vendor: restante de node_modules
          if (id.includes('node_modules/')) {
            return 'vendor-misc'
          }
          // Admin cockpit em chunk separado (carregado só por admins)
          if (id.includes('/pages/admin/')) {
            return 'chunk-admin'
          }
          // Onboarding em chunk separado
          if (id.includes('/pages/onboarding') || id.includes('/pages/Onboarding') || id.includes('/pages/Signup') || id.includes('/pages/ChoosePlan')) {
            return 'chunk-onboarding'
          }
        },
      },
    },
    // Avisa se algum chunk ultrapassar 400 KB
    chunkSizeWarningLimit: 400,
  },
})
