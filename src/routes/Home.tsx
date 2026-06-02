import { useState, useEffect, useRef } from 'react'
import { Plus, Check } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/useAppStore'
import { ProjectCard } from '@/components/ProjectCard'
import { ProjectEditor } from '@/components/ProjectEditor'
import { shiftDateStr, todayStr } from '@/db/schema'
import { cn } from '@/lib/cn'

export function Home() {
  const { t } = useTranslation()
  const projects = useAppStore(s => s.projects)
  const reorderProjects = useAppStore(s => s.reorderProjects)
  const [open, setOpen] = useState(false)

  const today = todayStr()
  const todayDow = new Date(today + 'T00:00:00').getDay()
  const saturdayOffset = 6 - todayDow
  const dates: string[] = []
  for (let i = 6; i >= 0; i--) dates.push(shiftDateStr(today, saturdayOffset - i))

  const oldest = dates[0]
  const newest = dates[dates.length - 1]
  const rangeLabel = `${oldest.slice(5)} – ${newest.slice(5)}`

  const [sorting, setSorting] = useState(false)
  const [localProjects, setLocalProjects] = useState(projects)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const dragState = useRef<{ idx: number; startY: number } | null>(null)

  useEffect(() => {
    if (!sorting) setLocalProjects(projects)
  }, [projects, sorting])

  const displayProjects = sorting ? localProjects : projects

  const startSortMode = () => {
    setSorting(true)
    setLocalProjects(projects)
    navigator.vibrate?.(10)
  }

  const handlePointerDown = (idx: number) => (e: React.PointerEvent) => {
    if (!sorting) {
      longPressTimer.current = setTimeout(startSortMode, 600)
      return
    }
    e.preventDefault()
    dragState.current = { idx, startY: e.clientY }

    const onMove = (me: PointerEvent) => {
      if (!dragState.current) return
      me.preventDefault()
      const delta = me.clientY - dragState.current.startY
      if (Math.abs(delta) < 30) return
      const dir = delta > 0 ? 1 : -1
      const newIdx = Math.max(0, Math.min(localProjects.length - 1, dragState.current.idx + dir))
      if (newIdx !== dragState.current.idx) {
        setLocalProjects(prev => {
          const next = [...prev]
          const [item] = next.splice(dragState.current!.idx, 1)
          next.splice(newIdx, 0, item)
          return next
        })
        dragState.current.idx = newIdx
        dragState.current.startY = me.clientY
      }
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      dragState.current = null
    }

    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  const handlePointerUp = () => {
    clearTimeout(longPressTimer.current)
  }

  const doneSorting = () => {
    setSorting(false)
    reorderProjects(localProjects.map(p => p.id))
    dragState.current = null
  }

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <span className="tabular-nums">{rangeLabel}</span>
          {sorting && (
            <button
              onClick={doneSorting}
              className="ml-auto flex items-center gap-1 text-xs text-brand-400 font-medium"
            >
              <Check size={14} />
              {t('common.done')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-xs">
          {dates.map(d => {
            const dow = new Date(d + 'T00:00:00').getDay()
            const isToday = d === today
            const isFuture = d > today
            return (
              <div
                key={'dow-' + d}
                className={cn(
                  'text-left pl-2 box-border',
                  isToday ? 'font-bold text-slate-50' : isFuture ? 'text-slate-300' : 'text-slate-400',
                )}
              >
                {(t('common.dow', { returnObjects: true }) as string[])[dow]}
              </div>
            )
          })}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="card text-center text-slate-500 py-10">
          <div className="text-2xl mb-2">📝</div>
          <div className="text-sm">{t('home.empty')}</div>
          <div className="text-xs text-slate-400 mt-1">{t('home.emptyHint')}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {displayProjects.map((p, i) => (
            <div
              key={p.id}
              onPointerDown={handlePointerDown(i)}
              onPointerUp={handlePointerUp}
              className={cn(sorting && 'touch-none select-none')}
            >
              <ProjectCard project={p} dates={dates} sorting={sorting} />
            </div>
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-20 z-40 h-12 w-12 rounded-full bg-brand-500 text-slate-50 shadow-lg shadow-brand-500/30 grid place-items-center active:scale-95"
        aria-label={t('home.newProject')}
      >
        <Plus size={20} />
      </button>
      <ProjectEditor open={open} onOpenChange={setOpen} />
    </div>
  )
}
