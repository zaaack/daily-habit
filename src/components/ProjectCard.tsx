import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, GripVertical } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/useAppStore'
import { getRepo } from '@/db'
import { StatusCell } from './StatusCell'
import type { Project, Checkin, CheckStatus } from '@/db/types'
import { todayStr, nowMs } from '@/db/schema'
import { cn } from '@/lib/cn'

export function ProjectCard({ project, dates, sorting }: { project: Project; dates: string[]; sorting?: boolean }) {
  const { t } = useTranslation()
  const cycle = useAppStore(s => s.cycleCheckin)
  const syncStatus = useAppStore(s => s.sync.status)
  const syncAt = useAppStore(s => s.sync.at)
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [refreshKey, setRefreshKey] = useState(0)

  // Load checkins on mount, date range change, or sync completion
  useEffect(() => {
    let alive = true
    const load = async () => {
      const repo = await getRepo()
      const start = dates[0]
      const end = dates[dates.length - 1]
      const range = start && end ? { from: start, to: end } : undefined
      const data = await repo.getCheckins(project.id, range)
      if (alive) setCheckins(data)
    }
    void load()
    return () => { alive = false }
  }, [project.id, dates[0], dates[dates.length - 1], syncStatus === 'ok' ? syncAt : null])

  const byDate = new Map(checkins.map(c => [c.date, c]))
  const today = todayStr()

  const failRate = (() => {
    const inRange = checkins.filter(c => dates.includes(c.date))
    let fail = 0, total = 0
    for (const c of inRange) {
      if (c.status === 'success') total++
      else if (c.status === 'fail') { total++; fail++ }
    }
    return total > 0 ? Math.round((fail / total) * 100) : null
  })()

  const onCycle = useCallback(async (date: string) => {
    const cur = byDate.get(date)
    let nextStatus: CheckStatus | null
    if (!cur) nextStatus = 'success'
    else if (cur.status === 'success') nextStatus = 'fail'
    else nextStatus = null

    // Optimistic: update local state immediately
    setCheckins(prev => {
      if (nextStatus === null) {
        return prev.filter(c => c.date !== date)
      }
      const exists = prev.find(c => c.date === date)
      if (exists) {
        return prev.map(c => c.date === date ? { ...c, status: nextStatus, updatedAt: nowMs() } : c)
      }
      const newCheckin: Checkin = {
        projectId: project.id, date, status: nextStatus,
        value: null, note: null, updatedAt: nowMs(),
      }
      return [...prev, newCheckin]
    })
    setRefreshKey(k => k + 1)

    // Write to DB
    await cycle(project.id, date)
  }, [project.id, byDate, cycle])

  if (sorting) {
    return (
      <div className="card flex items-center gap-2">
        <GripVertical size={18} className="text-slate-500 shrink-0" />
        <span className="h-7 w-7 grid place-items-center rounded text-base shrink-0" style={{ background: project.color + '33' }}>
          {project.emoji}
        </span>
        <div className="font-medium text-slate-200 truncate">{project.name}</div>
        {project.unit && <div className="text-xs text-slate-500 truncate">· {project.unit}</div>}
      </div>
    )
  }

  return (
    <div className="card">
      <Link
        to={`/project/${project.id}`}
        className="flex items-center gap-2 mb-2 active:opacity-70"
      >
        <span className="h-7 w-7 grid place-items-center rounded text-base" style={{ background: project.color + '33' }}>
          {project.emoji}
        </span>
        <div className={cn(
          'font-medium',
          project.deleted ? 'text-rose-500 line-through' : project.archived ? 'text-amber-600/70 dark:text-amber-400/70' : 'text-slate-200',
        )}>{project.name}</div>
        {project.unit && <div className="text-xs text-slate-500">· {project.unit}</div>}
        {failRate != null && failRate > 0 && (
          <div className="text-xs text-rose-400 font-medium">{t('home.failRate', { rate: failRate })}</div>
        )}
        <ChevronRight size={16} className="ml-auto text-slate-500" />
      </Link>
      <div className="grid grid-cols-7 gap-1.5">
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
                disabled={isFuture}
                refreshKey={refreshKey}
                onCycle={() => void onCycle(d)}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}
