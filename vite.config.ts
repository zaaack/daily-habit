import path from 'node:path'
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'

const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined
const base = isTauri ? '/' : (process.env.VITE_BASE_URL || '/daily-habit/')

async function createPlugins(): Promise<PluginOption[]> {
  const plugins: PluginOption[] = [react()]

  if (!isTauri) {
    const { default: sqlocalVitePlugin } = await import('sqlocal/vite')
    const { VitePWA } = await import('vite-plugin-pwa')
    plugins.push(sqlocalVitePlugin({ coi: true }))
    plugins.push(
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
          start_url: base,
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webp}'],
          navigateFallback: `${base}index.html`,
        },
      }),
    )
  }

  return plugins
}

export default defineConfig({
  base,
  build: {
    outDir: 'docs',
    ...(isTauri ? { rollupOptions: { external: [/^sqlocal/] } } : {}),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: isTauri
    ? { port: 5173, strictPort: true }
    : {
        headers: {
          'Cross-Origin-Embedder-Policy': 'require-corp',
          'Cross-Origin-Opener-Policy': 'same-origin',
        },
      },
  plugins: await createPlugins(),
})
