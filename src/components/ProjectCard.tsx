import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/state/useAppStore'
import { StatusCell } from './StatusCell'
import type { Project, Checkin } from '@/db/types'
import { shiftDateStr, todayStr } from '@/db/schema'
import { RotateCcw } from 'lucide-react'

const DAYS_PER_PAGE = 7

export function ProjectCard({ project }: { project: Project }) {
  const cycle = useAppStore(s => s.cycleCheckin)
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [tick, setTick] = useState(0)
  const [endOffset, setEndOffset] = useState(0)  // 0=ends at today; negative=older
  const startXRef = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { getRepo } = await import('@/db')
      const repo = await getRepo()
      const all = await repo.getCheckins(project.id)
      if (alive) setCheckins(all)
    }
    void load()
    const t = setInterval(() => { void load(); setTick(x => x + 1) }, 2000)
    return () => { alive = false; clearInterval(t) }
  }, [project.id])

  const today = todayStr()
  const dates: string[] = []
  for (let i = DAYS_PER_PAGE - 1; i >= 0; i--) dates.push(shiftDateStr(today, endOffset - i))
  const byDate = new Map(checkins.map(c => [c.date, c]))

  const start = dates[0]
  const end = dates[dates.length - 1]
  const sameMonth = start.slice(0, 7) === end.slice(0, 7)
  const rangeLabel = sameMonth
    ? `${start.slice(5)} – ${end.slice(5)}`
    : `${start.slice(5)} – ${end.slice(5)}`

  const isCurrent = endOffset === 0

  function onTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (startXRef.current == null) return
    const dx = e.changedTouches[0].clientX - startXRef.current
    startXRef.current = null
    if (Math.abs(dx) < 60) return
    if (dx < 0) setEndOffset(v => v + DAYS_PER_PAGE)   // 手指向左 → 较新
    else setEndOffset(v => v - DAYS_PER_PAGE)          // 手指向右 → 较旧
  }

  return (
    <div
      className="card"
      style={{ touchAction: 'pan-y' }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span className="h-6 w-6 grid place-items-center rounded text-sm" style={{ background: project.color + '33' }}>
          {project.emoji}
        </span>
        <div className="font-medium text-sm">{project.name}</div>
        {project.unit && <div className="text-[11px] text-slate-500">· {project.unit}</div>}
        <div className="flex-1" />
        <span className="text-[11px] text-slate-500 tabular-nums">{rangeLabel}</span>
        {!isCurrent && (
          <button
            onClick={() => setEndOffset(0)}
            className="text-[11px] text-brand-500 hover:text-brand-400 inline-flex items-center gap-0.5"
            title="回到本周"
          >
            <RotateCcw size={10} /> 本周
          </button>
        )}
      </div>
      <div className="grid grid-cols-7 gap-1 text-[9px] text-slate-500 mb-0.5 px-0.5">
        {dates.map(d => {
          const dow = new Date(d + 'T00:00:00').getDay()
          return <div key={'dow-' + d} className="text-center">{'日一二三四五六'[dow]}</div>
        })}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {dates.map(d => {
          const c = byDate.get(d)
          return (
            <StatusCell
              key={d}
              projectId={project.id}
              date={d}
              checkin={c}
              unit={project.unit}
              color={project.color}
              compact
              refreshKey={tick}
              onCycle={() => void cycle(project.id, d)}
            />
          )
        })}
      </div>
      <div className="grid grid-cols-7 gap-1 text-[9px] text-slate-500 mt-0.5 px-0.5 tabular-nums">
        {dates.map(d => <div key={'d-' + d} className="text-center">{d.slice(8)}</div>)}
      </div>
    </div>
  )
}
