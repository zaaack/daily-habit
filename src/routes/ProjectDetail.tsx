import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, RotateCcw, Settings as SettingsIcon } from 'lucide-react'
import { useAppStore } from '@/state/useAppStore'
import { monthDays, todayStr } from '@/db/schema'
import type { Checkin } from '@/db/types'
import { StatusCell } from '@/components/StatusCell'
import { ProjectEditor } from '@/components/ProjectEditor'
import { ValueTrendChart } from '@/components/ValueTrendChart'
import { cn } from '@/lib/cn'

export function ProjectDetail() {
  const { id = '' } = useParams<{ id: string }>()
  const projects = useAppStore(s => s.projects)
  const cycle = useAppStore(s => s.cycleCheckin)
  const project = useMemo(() => projects.find(p => p.id === id), [projects, id])
  const [now, setNow] = useState(() => {
    const [y, m] = todayStr().split('-').map(Number)
    return new Date(y, m - 1, 1)
  })
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [tick, setTick] = useState(0)
  const [editorOpen, setEditorOpen] = useState(false)

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

  if (!project) {
    return (
      <div className="card text-center text-slate-400 py-10">
        <div>项目不存在</div>
        <Link to="/" className="btn-ghost mt-3">返回首页</Link>
      </div>
    )
  }

  const year = now.getFullYear()
  const month = now.getMonth()
  const days = monthDays(year, month)
  const byDate = new Map(checkins.map(c => [c.date, c]))
  const today = todayStr()
  const [ty, tm] = today.split('-').map(Number)
  const isCurrentMonth = year === ty && month === tm - 1

  function shift(delta: number) {
    setNow(new Date(year, month + delta, 1))
  }
  function goCurrentMonth() {
    const [y, m] = today.split('-').map(Number)
    setNow(new Date(y, m - 1, 1))
  }

  // group by week
  const firstDow = new Date(year, month, 1).getDay()
  const rows: (string | null)[][] = []
  let week: (string | null)[] = Array(firstDow).fill(null)
  for (const d of days) {
    week.push(d)
    if (week.length === 7) { rows.push(week); week = [] }
  }
  if (week.length) {
    while (week.length < 7) week.push(null)
    rows.push(week)
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
        <button className="btn-ghost p-2" onClick={() => setEditorOpen(true)} aria-label="项目设置">
          <SettingsIcon size={16} />
        </button>
      </div>

      <div className="card">
        <div className="flex items-center mb-2">
          <button className="btn-ghost p-1" onClick={() => shift(-1)}><ChevronLeft size={16} /></button>
          <div className="flex-1 text-center text-sm font-semibold tabular-nums">{year} 年 {month + 1} 月</div>
          <button className="btn-ghost p-1" onClick={() => shift(1)}><ChevronRight size={16} /></button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-[10px] text-slate-500 mb-1">
          {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} className="text-center">{d}</div>)}
        </div>
        <div className="space-y-1">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-7 gap-1">
              {row.map((d, j) => {
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
          ))}
        </div>
        {!isCurrentMonth && (
          <div className="mt-2 text-center">
            <button
              onClick={goCurrentMonth}
              className="text-[11px] text-brand-500 hover:text-brand-400 inline-flex items-center gap-0.5"
            >
              <RotateCcw size={10} /> 回到本月
            </button>
          </div>
        )}
      </div>

      {project.unit && (
        <div className="card">
          <div className="text-sm font-semibold mb-2">数值趋势 · {month + 1} 月</div>
          <ValueTrendChart checkins={checkins} color={project.color} year={year} month={month} />
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
