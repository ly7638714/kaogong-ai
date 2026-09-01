import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three']
        }
      }
    }
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: '行测名师AI小助理',
        short_name: '行测名师AI',
        description: '行测全题型智能答疑 · 命题人视角',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      },
      workbox: { navigateFallback: null, maximumFileSizeToCacheInBytes: 4 * 1024 * 1024 }
    })
  ]
})
