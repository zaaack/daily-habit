import { useEffect, useState, useRef } from 'react'
import { useAppStore } from '@/state/useAppStore'
import { getDB } from '@/db'
import { platform } from '@/lib/platform'
import { getSiteId } from '@/sync/engine'

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
        const db = getDB()
        const [{ count: pc }, { count: cc }] = await Promise.all([
          db.selectFrom('projects').select(db.fn.countAll().as('count')).executeTakeFirstOrThrow(),
          db.selectFrom('checkins').select(db.fn.countAll().as('count')).executeTakeFirstOrThrow(),
        ])
        setDbProjects(Number(pc))
        setCheckinCount(Number(cc))
      } catch { /* ignore */ }
    }
    void refresh()
    tickRef.current = setInterval(refresh, 4000)
    return () => { if (tickRef.current) clearInterval(tickRef.current) }
  }, [visible])

  if (!visible) return null

  const state = useAppStore.getState()

  return (
    <div className="fixed bottom-20 right-4 z-50 w-72 rounded-xl border border-slate-700/50 bg-slate-900/95 p-4 text-xs font-mono text-slate-300 shadow-2xl backdrop-blur-xl">
      <div className="mb-3 font-bold text-slate-100 text-sm">Debug</div>
      <div className="space-y-1.5">
        <div className="flex justify-between">
          <span className="text-slate-400">Platform</span>
          <span>{platform}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">SiteId</span>
          <span className="break-all text-right max-w-[140px]">{getSiteId()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Projects</span>
          <span>{dbProjects ?? '?'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Checkins</span>
          <span>{checkinCount ?? '…'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Configured</span>
          <span className={state.configured ? 'text-emerald-400' : 'text-slate-400'}>
            {state.configured ? 'yes' : 'no'}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-400">Conflicts</span>
          <span>{state.conflicts.length}</span>
        </div>
        <hr className="border-slate-700/50 my-2" />
        {mem ? (
          <>
            <div className="flex justify-between">
              <span className="text-slate-400">Heap Used</span>
              <span>{mem.used}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Heap Total</span>
              <span>{mem.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Heap Limit</span>
              <span>{mem.limit}</span>
            </div>
          </>
        ) : (
          <div className="text-slate-400">No memory info</div>
        )}
      </div>
    </div>
  )
}
