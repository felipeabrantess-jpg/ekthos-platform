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
    target: 'esnext',
    rollupOptions: {
      output: {
        // Mapa simples — Rollup resolve dependências internas sem criar
        // ciclos. Evita o "Circular chunk: vendor-misc -> vendor-react" que
        // causava TypeError: Cannot read properties of undefined (reading 'useState').
        manualChunks: {
          'vendor-react':    ['react', 'react-dom'],
          'vendor-router':   ['react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-charts':   ['recharts'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
})
