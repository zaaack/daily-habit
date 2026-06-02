import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, RotateCcw, Settings as SettingsIcon } from 'lucide-react'
import { useAppStore } from '@/state/useAppStore'
import { todayStr } from '@/db/schema'
import type { Checkin } from '@/db/types'
import { StatusCell } from '@/components/StatusCell'
import { ProjectEditor } from '@/components/ProjectEditor'
import { ValueTrendChart } from '@/components/ValueTrendChart'
import { cn } from '@/lib/cn'

interface WeekRow {
  monthLabel: string | null
  days: (string | null)[]
}

function buildWeeks(monthOffsetStart: number, monthOffsetEnd: number): WeekRow[] {
  const today = todayStr()
  const [ty, tm] = today.split('-').map(Number)
  const result: WeekRow[] = []
  let prevMonth = -1

  for (let mo = monthOffsetStart; mo <= monthOffsetEnd; mo++) {
    const base = new Date(ty, tm - 1 + mo, 1)
    const year = base.getFullYear()
    const month = base.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const label = `${year} 年 ${month + 1} 月`

    const firstDow = new Date(year, month, 1).getDay()
    let week: (string | null)[] = Array(firstDow).fill(null)

    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      week.push(ds)
      if (week.length === 7) {
        result.push({ monthLabel: prevMonth !== month ? label : null, days: week })
        prevMonth = month
        week = []
      }
    }
    if (week.length) {
      while (week.length < 7) week.push(null)
      result.push({ monthLabel: prevMonth !== month ? label : null, days: week })
      prevMonth = month
    }
  }
  return result
}

export function ProjectDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const projects = useAppStore(s => s.projects)
  const cycle = useAppStore(s => s.cycleCheckin)
  const project = useMemo(() => projects.find(p => p.id === id), [projects, id])
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [tick, setTick] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const currentWeekRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let alive = true
    const load = async () => {
      const { getRepo } = await import('@/db')
      const repo = await getRepo()
      const all = await repo.getCheckins(id)
      if (alive) setCheckins(all)
    }
    void load()
    const t = setInterval(() => { void load(); setTick(x => x + 1) }, 2000)
    return () => { alive = false; clearInterval(t) }
  }, [id])

  const weeks = useMemo(() => buildWeeks(-12, 12), [])
  const byDate = new Map(checkins.map(c => [c.date, c]))
  const today = todayStr()
  const [ty, tm] = today.split('-').map(Number)

  useEffect(() => {
    if (currentWeekRef.current) {
      currentWeekRef.current.scrollIntoView({ block: 'center' })
    }
  }, [])

  function scrollToCurrent() {
    currentWeekRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  if (!project) {
    return (
      <div className="card text-center text-slate-400 py-10">
        <div>项目不存在</div>
        <Link to="/" className="btn-ghost mt-3">返回首页</Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="card flex items-center gap-2">
        <Link to="/" className="btn-ghost p-2" aria-label="返回">
          <ChevronLeft size={18} />
        </Link>
        <span className="h-7 w-7 grid place-items-center rounded" style={{ background: project.color + '33' }}>{project.emoji}</span>
        <div>
          <div className="font-semibold">{project.name}</div>
          {project.unit && <div className="text-xs text-slate-500">{project.unit}</div>}
        </div>
        <div className="flex-1" />
        <button className="btn-ghost p-2" onClick={scrollToCurrent} aria-label="回到本月">
          <RotateCcw size={14} />
        </button>
        <button className="btn-ghost p-2" onClick={() => setEditorOpen(true)} aria-label="项目设置">
          <SettingsIcon size={16} />
        </button>
      </div>

      <div className="card">
        <div className="grid grid-cols-7 gap-1 text-[10px] text-slate-500 mb-1">
          {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} className="text-center">{d}</div>)}
        </div>
        <div
          ref={scrollRef}
          className="overflow-y-auto snap-y snap-mandatory"
          style={{ maxHeight: 280 }}
        >
          {weeks.map((w, i) => {
            const hasToday = w.days.some(d => d === today)
            return (
              <div key={i}>
                {w.monthLabel && (
                  <div className="text-[10px] text-slate-500 font-semibold py-1 snap-start">{w.monthLabel}</div>
                )}
                <div
                  ref={hasToday ? currentWeekRef : undefined}
                  className={cn('grid grid-cols-7 gap-1 snap-start', hasToday && 'bg-brand-500/5 rounded-md')}
                >
                  {w.days.map((d, j) => {
                    if (!d) return <div key={j} />
                    const c = byDate.get(d)
                    const isToday = d === today
                    return (
                      <div key={d} className={cn('flex justify-center', isToday && 'ring-1 ring-brand-500 rounded-md')}>
                        <StatusCell
                          projectId={project.id}
                          date={d}
                          checkin={c}
                          unit={project.unit}
                          color={project.color}
                          refreshKey={tick}
                          onCycle={() => void cycle(project.id, d)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {project.unit && (
        <div className="card">
          <div className="text-sm font-semibold mb-2">数值趋势</div>
          <ValueTrendChart checkins={checkins} color={project.color} currentYear={ty} currentMonth={tm - 1} />
        </div>
      )}

      <Link to={`/history?project=${project.id}`} className="card flex items-center justify-center text-sm text-brand-400 hover:text-brand-300">
        查看全部历史 →
      </Link>

      <ProjectEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={{ id: project.id, name: project.name, unit: project.unit, emoji: project.emoji, color: project.color }}
      />
    </div>
  )
}
