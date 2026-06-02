import { useEffect, useRef } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { useAppStore } from '@/state/useAppStore'
import { Home } from '@/routes/Home'
import { ProjectDetail } from '@/routes/ProjectDetail'
import { History } from '@/routes/History'
import { Settings } from '@/routes/Settings'
import { NotFound } from '@/routes/NotFound'
import { Layout } from '@/components/Layout'
import { ConflictDialog } from '@/components/ConflictDialog'

const router = createMemoryRouter([
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

export function App() {
  const init = useAppStore(s => s.init)
  const ready = useAppStore(s => s.ready)
  const bootedRef = useRef(false)

  useEffect(() => {
    if (bootedRef.current) return
    bootedRef.current = true
    void init()
  }, [init])

  if (!ready) {
    return (
      <div className="grid h-full place-items-center text-slate-400">
        <div className="animate-pulse">正在准备…</div>
      </div>
    )
  }

  return (
    <>
      <RouterProvider router={router} />
      <ConflictDialog />
    </>
  )
}
