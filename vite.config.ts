import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import sqlocalVitePlugin from 'sqlocal/vite'

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/daily-habit/',
  build: { outDir: 'docs' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  plugins: [
    react(),
    sqlocalVitePlugin({ coi: true }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Daily Habit',
        short_name: 'Habit',
        description: '每日打卡',
        theme_color: '#0f172a',
        background_color: '#020617',
        display: 'standalone',
        start_url: '/daily-habit/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
        navigateFallback: '/daily-habit/index.html',
      },
    }),
  ],
})
