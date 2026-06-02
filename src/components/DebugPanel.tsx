import { useEffect, useState, useRef } from 'react'
import { useAppStore } from '@/state/useAppStore'
import { getRepo } from '@/db'
import { platform } from '@/lib/platform'

interface MemInfo {
  used: string
  total: string
  limit: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function readMem(): MemInfo | null {
  const m = (performance as any)?.memory
  if (!m) return null
  return {
    used: formatBytes(m.usedJSHeapSize),
    total: formatBytes(m.totalJSHeapSize),
    limit: formatBytes(m.jsHeapSizeLimit),
  }
}

export function DebugPanel() {
  const [visible, setVisible] = useState(false)
  const [mem, setMem] = useState<MemInfo | null>(null)
  const [checkinCount, setCheckinCount] = useState<number | null>(null)
  const [dbProjects, setDbProjects] = useState<number | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        setVisible(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!visible) {
      if (tickRef.current) clearInterval(tickRef.current)
      return
    }

    const refresh = async () => {
      setMem(readMem())
      try {
        const repo = await getRepo()
        const projects = await repo.listProjects(true)
        setDbProjects(projects.length)
        let count = 0
        for (const p of projects) {
          const cs = await repo.getCheckins(p.id)
          count += cs.length
        }
        setCheckinCount(count)
      } catch { /* ignore */ }
    }
    void refresh()
    tickRef.current = setInterval(refresh, 4000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [visible])

  if (!visible) return null

  const state = useAppStore.getState()

  return (
    <div className="fixed bottom-20 right-4 z-50 w-72 rounded-lg border border-slate-600 bg-slate-900/95 p-3 text-xs font-mono text-slate-300 shadow-xl backdrop-blur">
      <div className="mb-2 font-bold text-slate-100">Debug</div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-slate-500">Platform</span>
          <span>{platform}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Projects</span>
          <span>{state.projects.length} / {dbProjects ?? '?'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Checkins</span>
          <span>{checkinCount ?? '…'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Sync</span>
          <span className={state.sync.status === 'error' ? 'text-rose-400' : 'text-emerald-400'}>
            {state.sync.status}
          </span>
        </div>
        {state.sync.error && (
          <div className="text-rose-400 break-all">Error: {state.sync.error}</div>
        )}
        <hr className="border-slate-700" />
        {mem ? (
          <>
            <div className="flex justify-between">
              <span className="text-slate-500">Heap Used</span>
              <span>{mem.used}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Heap Total</span>
              <span>{mem.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Heap Limit</span>
              <span>{mem.limit}</span>
            </div>
          </>
        ) : (
          <div className="text-slate-500">No memory info</div>
        )}
      </div>
    </div>
  )
}
