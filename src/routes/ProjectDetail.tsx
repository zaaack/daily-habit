import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronDown, RotateCcw, Settings as SettingsIcon } from 'lucide-react'
import { useAppStore } from '@/state/useAppStore'
import { todayStr } from '@/db/schema'
import type { Checkin } from '@/db/types'
import { StatusCell } from '@/components/StatusCell'
import { ProjectEditor } from '@/components/ProjectEditor'
import { MonthlyStatsChart } from '@/components/MonthlyStatsChart'
import { ValueTrendChart } from '@/components/ValueTrendChart'
import { cn } from '@/lib/cn'

interface WeekRow {
  monthLabel: string | null
  days: (string | null)[]
}

function dateToStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getSunday(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00')
  d.setDate(d.getDate() - d.getDay())
  return d
}

function monthDiff(y1: number, m1: number, y2: number, m2: number): number {
  return (y2 - y1) * 12 + (m2 - m1)
}

function pageToMonthYear(pageNum: number): [number, number] {
  const [ty, tm] = todayStr().split('-').map(Number)
  let total = ty * 12 + (tm - 1) + pageNum
  return [Math.floor(total / 12), (total % 12) + 1]
}

function buildPage(pageNum: number): WeekRow[] {
  const [targetYear, targetMonth] = pageToMonthYear(pageNum)
  const firstOfMonth = new Date(targetYear, targetMonth - 1, 1)
  const startSunday = getSunday(dateToStr(firstOfMonth))

  const result: WeekRow[] = []
  let prevMonth = -1

  for (let w = 0; w < 5; w++) {
    const days: (string | null)[] = []
    for (let d = 0; d < 7; d++) {
      const date = new Date(startSunday)
      date.setDate(date.getDate() + w * 7 + d)
      days.push(dateToStr(date))
    }
    const midDate = new Date(startSunday)
    midDate.setDate(midDate.getDate() + w * 7 + 3)
    const month = midDate.getMonth()
    result.push({
      monthLabel: prevMonth !== month ? `${midDate.getFullYear()} 年 ${month + 1} 月` : null,
      days,
    })
    prevMonth = month
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
  const [pickerOpen, setPickerOpen] = useState(false)

  const today = todayStr()
  const [pageNum, setPageNum] = useState(0)
  const [dragY, setDragY] = useState(0)
  const dragging = useRef(false)
  const startY = useRef(0)
  const [pageH, setPageH] = useState(0)
  const currRef = useRef<HTMLDivElement>(null)

  const pages = useMemo(() => ({
    prev: buildPage(pageNum - 1),
    curr: buildPage(pageNum),
    next: buildPage(pageNum + 1),
  }), [pageNum])

  const [viewYear, viewMonth] = useMemo(() => pageToMonthYear(pageNum), [pageNum])

  useEffect(() => {
    const el = currRef.current
    if (!el) return
    const measure = () => setPageH(el.offsetHeight)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pageNum])

  const snapToPage = useCallback((deltaY: number) => {
    const threshold = pageH * 0.2
    if (deltaY < -threshold) setPageNum(p => p + 1)
    else if (deltaY > threshold) setPageNum(p => p - 1)
    setDragY(0)
  }, [pageH])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragging.current = true
    startY.current = e.clientY
    setDragY(0)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    setDragY(e.clientY - startY.current)
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    dragging.current = false
    snapToPage(e.clientY - startY.current)
  }, [snapToPage])

  const goToCurrent = useCallback(() => {
    setPageNum(0)
  }, [])

  const navigateToMonth = useCallback((year: number, month: number) => {
    const [ty, tm] = today.split('-').map(Number)
    setPageNum(monthDiff(ty, tm, year, month))
    setPickerOpen(false)
  }, [today])

  const byDate = new Map(checkins.map(c => [c.date, c]))
  const [ty, tm] = today.split('-').map(Number)

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

  const offset = -pageH + dragY
  const isDragging = dragY !== 0

  const renderWeeks = (weeks: WeekRow[]) =>
    weeks.map((w, wi) => {
      const hasToday = w.days.some(d => d === today)
      return (
        <div key={wi}>
          <div className={cn('grid grid-cols-7 gap-1', hasToday && 'bg-brand-500/5 rounded-md')}>
            {w.days.map((d, j) => {
              if (!d) return <div key={j} />
              const c = byDate.get(d)
              const isToday = d === today
              return (
                <div key={d} className={cn('flex justify-center', isToday && 'border-2 border-brand-500 rounded-md')}>
                  <StatusCell
                    projectId={project.id}
                    date={d}
                    checkin={c}
                    unit={project.unit}
                    color={project.color}
                    refreshKey={tick}
                    disabled={d > today}
                    onCycle={() => void cycle(project.id, d)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )
    })

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
        <button className="btn-ghost p-2" onClick={goToCurrent} aria-label="回到本月">
          <RotateCcw size={14} />
        </button>
        <button className="btn-ghost p-2" onClick={() => setEditorOpen(true)} aria-label="项目设置">
          <SettingsIcon size={16} />
        </button>
      </div>

      <div className="card">
        <div className="relative mb-2">
          <button
            className="flex items-center gap-1 text-sm font-semibold text-slate-200 hover:text-brand-500"
            onClick={() => setPickerOpen(v => !v)}
          >
            {viewYear} 年 {viewMonth} 月
            <ChevronDown size={14} className={cn('transition-transform', pickerOpen && 'rotate-180')} />
          </button>
          {pickerOpen && (
            <div className="absolute left-0 top-full mt-1 z-10 bg-slate-900 rounded-lg shadow-lg border border-slate-700 p-2 min-w-[200px]">
              <div className="flex items-center gap-2 mb-2">
                <select
                  className="flex-1 text-sm bg-slate-800 border border-slate-600 rounded px-2 py-1 text-slate-100"
                  value={viewYear}
                  onChange={e => {
                    const y = Number(e.target.value)
                    navigateToMonth(y, viewMonth)
                  }}
                >
                  {Array.from({ length: 11 }, (_, i) => ty - 5 + i).map(y => (
                    <option key={y} value={y}>{y} 年</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-4 gap-1">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <button
                    key={m}
                    className={cn(
                      'text-xs py-1.5 rounded',
                      m === viewMonth
                        ? 'bg-brand-500 text-white'
                        : 'text-slate-300 hover:bg-slate-800'
                    )}
                    onClick={() => navigateToMonth(viewYear, m)}
                  >
                    {m} 月
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="grid grid-cols-7 gap-1 text-[10px] text-slate-200 mb-1">
          {['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d} className="text-center">{d}</div>)}
        </div>
        <div
          className="overflow-hidden select-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ touchAction: 'none', height: pageH || 'auto' }}
        >
          <div
            style={{
              transform: `translateY(${offset}px)`,
              transition: isDragging ? 'none' : 'transform 0.3s ease',
            }}
          >
            <div className="space-y-2 mb-2">{renderWeeks(pages.prev)}</div>
            <div ref={currRef} className="space-y-2 mb-2">{renderWeeks(pages.curr)}</div>
            <div className="space-y-2">{renderWeeks(pages.next)}</div>
          </div>
        </div>
      </div>

      {project.unit && (
        <div className="card">
          <div className="text-sm font-semibold mb-2">数值趋势</div>
          <ValueTrendChart checkins={checkins} color={project.color} currentYear={ty} currentMonth={tm - 1} />
        </div>
      )}

      <div className="card">
        <div className="text-sm font-semibold mb-2">月度统计</div>
        <MonthlyStatsChart checkins={checkins} color={project.color} currentYear={ty} currentMonth={tm - 1} unit={project.unit} />
      </div>

      <Link to={`/history?project=${project.id}`} className="card flex items-center justify-center text-sm text-brand-600 hover:text-brand-500">
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
