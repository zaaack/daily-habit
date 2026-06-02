import { useEffect, useRef } from 'react'
import { RouterProvider, createHashRouter } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/useAppStore'
import { Home } from '@/routes/Home'
import { ProjectDetail } from '@/routes/ProjectDetail'
import { History } from '@/routes/History'
import { Settings } from '@/routes/Settings'
import { NotFound } from '@/routes/NotFound'
import { Layout } from '@/components/Layout'
import { ConflictDialog } from '@/components/ConflictDialog'
import { DebugPanel } from '@/components/DebugPanel'

const router = createHashRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Home /> },
      { path: 'project/:id', element: <ProjectDetail /> },
      { path: 'history', element: <History /> },
      { path: 'settings', element: <Settings /> },
      { path: '*', element: <NotFound /> },
    ],
  },
])

function getStoredTheme(): 'auto' | 'light' | 'dark' {
  try {
    const v = localStorage.getItem('theme')
    if (v === 'light' || v === 'dark') return v
  } catch { /* noop */ }
  return 'auto'
}

function applyThemeFromStored() {
  const mode = getStoredTheme()
  const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function App() {
  const { t } = useTranslation()
  const init = useAppStore(s => s.init)
  const ready = useAppStore(s => s.ready)
  const bootedRef = useRef(false)

  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    void init()

    // 每 5 分钟定期检查云端同步
    const interval = setInterval(() => {
      // 只在非 syncing 状态下触发，避免堆积
      const s = useAppStore.getState().sync
      if (s.status !== 'syncing') {
        void useAppStore.getState().triggerSync()
      }
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [init])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => { if (getStoredTheme() === 'auto') applyThemeFromStored() }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // F12: open DevTools in Tauri packaged builds
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F12') {
        e.preventDefault()
        tryOpenDevTools()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  async function tryOpenDevTools() {
    try {
      const { getCurrentWebview } = await import('@tauri-apps/api/webview')
      const wv = getCurrentWebview()
      if ('openDevtools' in wv) {
        await (wv as any).openDevtools()
      }
    } catch {
      // not in Tauri or API unavailable
    }
  }

  if (!ready) {
    return (
      <div className="grid h-full place-items-center text-slate-500">
        <div className="animate-pulse">{t('app.loading')}</div>
      </div>
    )
  }

  return (
    <>
      <RouterProvider router={router} />
      <ConflictDialog />
      <DebugPanel />
    </>
  )
}
