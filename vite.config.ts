import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { rollupOptions: { output: { manualChunks(id) {
    if (!id.includes('node_modules')) return
    if (id.includes('@supabase')) return 'vendor-supabase'
    if (id.includes('@tanstack')) return 'vendor-query'
    if (id.includes('lucide-react')) return 'vendor-icons'
    if (/[/\\]node_modules[/\\](react|react-dom|scheduler)[/\\]/.test(id)) return 'vendor-react'
    return 'vendor'
  } } } },
  test: { environment: 'jsdom', setupFiles: './src/test-setup.ts' },
})
