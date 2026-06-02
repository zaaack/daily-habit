import { Capacitor } from '@capacitor/core'

export const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
export const isNative = Capacitor.isNativePlatform()
export const platform: 'android' | 'ios' | 'web' | 'tauri' = isTauri
  ? 'tauri'
  : (Capacitor.getPlatform() as 'android' | 'ios' | 'web')
export const isAndroid = platform === 'android'
export const isWeb = !isNative && !isTauri

// In Tauri, override global fetch with plugin-http to bypass CORS for WebDAV sync.
// Must happen before any lazy import('webdav') is triggered.
if (isTauri) {
  import('@tauri-apps/plugin-http').then(({ fetch }) => {
    window.fetch = fetch as unknown as typeof window.fetch
  }).catch(() => {
    console.warn('[platform] Failed to load @tauri-apps/plugin-http')
  })
}
