import { useEffect, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import { useAppStore } from '@/state/useAppStore'
import { StatusCell } from './StatusCell'
import type { Project, Checkin } from '@/db/types'
import { shiftDateStr, todayStr } from '@/db/schema'
import { cn } from '@/lib/cn'

export function ProjectCard({ project }: { project: Project }) {
  const recentDays = useAppStore(s => s.recentDays)
  const cycle = useAppStore(s => s.cycleCheckin)
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const conflicts = useAppStore(s => s.conflicts[project.id])
  const [tick, setTick] = useState(0)

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

  const dates: string[] = []
  const today = todayStr()
  for (let i = recentDays - 1; i >= 0; i--) dates.push(shiftDateStr(today, -i))
  const byDate = new Map(checkins.map(c => [c.date, c]))

  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-6 w-6 grid place-items-center rounded" style={{ background: project.color + '33' }}>
          <span className="text-sm">{project.emoji}</span>
        </span>
        <div className="font-semibold">{project.name}</div>
        {project.unit && <div className="text-xs text-slate-500">· {project.unit}</div>}
        {conflicts && conflicts.length > 0 && (
          <span className="ml-auto text-[10px] text-amber-300 bg-amber-900/30 border border-amber-900/50 rounded px-1.5 py-0.5">同步冲突</span>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-wrap pb-1">
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
              refreshKey={tick}
              onCycle={() => void cycle(project.id, d)}
            />
          )
        })}
        <div className="text-[10px] text-slate-500 ml-1">
          {dates[0].slice(5)} ~ {dates[dates.length - 1].slice(5)}
        </div>
      </div>
    </div>
  )
}

export function RecentDaysSlider() {
  const recentDays = useAppStore(s => s.recentDays)
  const setRecentDays = useAppStore(s => s.setRecentDays)
  return (
    <div className="card flex items-center gap-3">
      <div className="text-xs text-slate-400 whitespace-nowrap">显示最近</div>
      <Slider.Root
        className="relative flex items-center select-none touch-none w-full h-5"
        value={[recentDays]}
        onValueChange={v => setRecentDays(v[0])}
        min={3}
        max={7}
        step={1}
      >
        <Slider.Track className="bg-slate-800 relative grow rounded-full h-1.5">
          <Slider.Range className="absolute bg-brand-500 rounded-full h-full" />
        </Slider.Track>
        <Slider.Thumb
          className="block h-4 w-4 bg-brand-500 rounded-full shadow-md focus:outline-none focus:ring-2 focus:ring-brand-500/50"
          aria-label="天数"
        />
      </Slider.Root>
      <div className={cn('text-sm font-semibold w-6 text-right tabular-nums')}>{recentDays}</div>
      <div className="text-[10px] text-slate-500">天</div>
    </div>
  )
}
