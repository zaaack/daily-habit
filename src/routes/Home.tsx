import { useRef, useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { useAppStore } from '@/state/useAppStore'
import { ProjectCard } from '@/components/ProjectCard'
import { ProjectEditor } from '@/components/ProjectEditor'
import { shiftDateStr, todayStr } from '@/db/schema'
import { cn } from '@/lib/cn'

const DAYS_PER_PAGE = 7

export function Home() {
  const projects = useAppStore(s => s.projects)
  const [open, setOpen] = useState(false)
  const [endOffset, setEndOffset] = useState(0)
  const startXRef = useRef<number | null>(null)

  const today = todayStr()
  const todayDow = new Date(today + 'T00:00:00').getDay()
  const saturdayOffset = 6 - todayDow
  const dates: string[] = []
  for (let i = 6; i >= 0; i--) dates.push(shiftDateStr(today, endOffset + saturdayOffset - i))

  const oldest = dates[0]
  const newest = dates[dates.length - 1]
  const rangeLabel = `${oldest.slice(5)} – ${newest.slice(5)}`
  const isCurrent = endOffset === 0

  function onTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (startXRef.current == null) return
    const dx = e.changedTouches[0].clientX - startXRef.current
    startXRef.current = null
    if (Math.abs(dx) < 60) return
    if (dx < 0) setEndOffset(v => v + DAYS_PER_PAGE)
    else setEndOffset(v => v - DAYS_PER_PAGE)
  }

  return (
    <div className="space-y-2">
      <div className="card">
        <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
          <span className="tabular-nums">{rangeLabel}</span>
          <div className="flex-1" />
          {!isCurrent && (
            <button
              onClick={() => setEndOffset(0)}
              className="text-brand-500 hover:text-brand-400 inline-flex items-center gap-0.5"
              title="回到本周"
            >
              <RotateCcw size={10} /> 本周
            </button>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1 text-[9px]">
          {dates.map(d => {
            const dow = new Date(d + 'T00:00:00').getDay()
            const isToday = d === today
            const isFuture = d > today
            return (
              <div
                key={'dow-' + d}
                className={cn(
                  'text-center',
                  isToday ? 'font-bold text-slate-950' : isFuture ? 'text-slate-500' : 'text-slate-400',
                )}
              >
                {'日一二三四五六'[dow]}
              </div>
            )
          })}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="card text-center text-slate-500 py-10">
          <div className="text-2xl mb-2">📝</div>
          <div className="text-sm">还没有打卡项目</div>
          <div className="text-xs text-slate-400 mt-1">点击右下角 + 创建一个</div>
        </div>
      ) : (
        <div
          className="space-y-2"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          {projects.map(p => (
            <ProjectCard key={p.id} project={p} dates={dates} />
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-20 z-40 h-12 w-12 rounded-full bg-brand-500 text-slate-50 shadow-lg shadow-brand-500/30 grid place-items-center active:scale-95"
        aria-label="新建项目"
      >
        <Plus size={20} />
      </button>
      <ProjectEditor open={open} onOpenChange={setOpen} />
    </div>
  )
}
