import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useAppStore } from '@/state/useAppStore'
import { StatusCell } from './StatusCell'
import type { Project, Checkin } from '@/db/types'
import { todayStr } from '@/db/schema'
import { cn } from '@/lib/cn'

export function ProjectCard({ project, dates }: { project: Project; dates: string[] }) {
  const cycle = useAppStore(s => s.cycleCheckin)
  const [checkins, setCheckins] = useState<Checkin[]>([])
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

  const byDate = new Map(checkins.map(c => [c.date, c]))
  const today = todayStr()

  return (
    <div className="card">
      <Link
        to={`/project/${project.id}`}
        className="flex items-center gap-2 mb-1.5 active:opacity-70"
      >
        <span className="h-6 w-6 grid place-items-center rounded text-sm" style={{ background: project.color + '33' }}>
          {project.emoji}
        </span>
        <div className="font-medium text-sm">{project.name}</div>
        {project.unit && <div className="text-[11px] text-slate-500">· {project.unit}</div>}
        <ChevronRight size={14} className="ml-auto text-slate-500" />
      </Link>
      <div className="grid grid-cols-7 gap-1">
        {dates.map(d => {
          const c = byDate.get(d)
          const isFuture = d > today
          return (
            <div
              key={d}
              className={cn(
                isFuture && 'opacity-50',
              )}
            >
              <StatusCell
                projectId={project.id}
                date={d}
                checkin={c}
                unit={project.unit}
                color={project.color}
                compact
                refreshKey={tick}
                onCycle={() => void cycle(project.id, d)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
