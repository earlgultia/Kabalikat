import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'

function pwaAssetsPlugin(): Plugin {
  return {
    name: 'kabalikat-pwa-assets',
    apply: 'build',
    generateBundle(_options, bundle) {
      const precacheUrls = [
        '/', '/index.html', '/offline.html', '/manifest.webmanifest',
        '/icons/kabalikat-heart-192.png', '/icons/kabalikat-heart-512.png',
        '/icons/kabalikat-heart-maskable-512.png', '/icons/kabalikat-ios-180.png',
        ...Object.keys(bundle).filter((fileName) => fileName !== 'sw.js' && !fileName.endsWith('.map')).map((fileName) => `/${fileName}`),
      ]
      const template = readFileSync(new URL('./src/pwa/sw-template.js', import.meta.url), 'utf8')
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replace('const PRECACHE_URLS = __PRECACHE_URLS__', `const PRECACHE_URLS = ${JSON.stringify([...new Set(precacheUrls)])}`),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), pwaAssetsPlugin()],
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
