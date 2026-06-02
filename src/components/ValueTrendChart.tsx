import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import uPlot, { type Options as UPlotOptions, type AlignedData } from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { Checkin } from '@/db/types'

interface Props {
  checkins: Checkin[]
  color: string
  currentYear: number
  currentMonth: number
}

export function ValueTrendChart({ checkins, color, currentYear, currentMonth }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const plotRef = useRef<uPlot | null>(null)
  const [pageOffset, setPageOffset] = useState(0)

  const months = useMemo(() => {
    const result: { year: number; month: number; label: string }[] = []
    for (let i = 0; i < 12; i++) {
      const m = currentMonth + pageOffset * 12 - 11 + i
      const y = currentYear + Math.floor(m / 12)
      const mo = ((m % 12) + 12) % 12
      result.push({ year: y, month: mo, label: `${mo + 1}月` })
    }
    return result
  }, [currentYear, currentMonth, pageOffset])

  const isCurrentPage = pageOffset === 0

  useEffect(() => {
    if (!ref.current) return

    const byMonth = new Map<string, { sum: number; count: number }>()
    for (const c of checkins) {
      if (c.value == null) continue
      const key = c.date.slice(0, 7)
      const prev = byMonth.get(key)
      if (prev) { prev.sum += c.value; prev.count++ }
      else byMonth.set(key, { sum: c.value, count: 1 })
    }

    const xs: number[] = []
    const ys: (number | null)[] = []
    for (const m of months) {
      const key = `${m.year}-${String(m.month + 1).padStart(2, '0')}`
      xs.push(Math.floor(new Date(m.year, m.month, 15).getTime() / 1000))
      const entry = byMonth.get(key)
      ys.push(entry ? entry.sum / entry.count : null)
    }

    const data: AlignedData = [xs, ys.map(v => v == null ? Number.NaN : v)]

    if (plotRef.current) {
      plotRef.current.setData(data)
      return
    }

    const s = getComputedStyle(document.documentElement)
    const axisColor = `rgb(${s.getPropertyValue('--c-slate-400').trim()})`
    const gridColor = `rgb(${s.getPropertyValue('--c-slate-600').trim()})`

    const opts: UPlotOptions = {
      width: ref.current.clientWidth,
      height: 200,
      cursor: { drag: { x: true, y: false } },
      scales: { x: { time: true }, y: { auto: true } },
      series: [
        {},
        {
          label: '月均值',
          stroke: color,
          width: 2,
          points: { show: true, size: 6, stroke: color, fill: color },
          spanGaps: true,
        },
      ],
      axes: [
        {
          stroke: axisColor,
          grid: { stroke: gridColor },
          values: (_self, ticks) => ticks.map(t => {
            const d = new Date(t * 1000)
            return `${d.getMonth() + 1}月`
          }),
        },
        { stroke: axisColor, grid: { stroke: gridColor }, size: 50 },
      ],
    }
    plotRef.current = new uPlot(opts, data, ref.current)

    const ro = new ResizeObserver(() => {
      if (plotRef.current && ref.current) {
        plotRef.current.setSize({ width: ref.current.clientWidth, height: 200 })
      }
    })
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      plotRef.current?.destroy()
      plotRef.current = null
    }
  }, [checkins, color, months])

  const label = `${months[0].year}.${months[0].month + 1} – ${months[11].year}.${months[11].month + 1}`

  return (
    <div>
      <div className="flex items-center mb-2">
        <button className="btn-ghost p-1" onClick={() => setPageOffset(v => v - 1)}>
          <ChevronLeft size={14} />
        </button>
        <div className="flex-1 text-center text-xs text-slate-500 tabular-nums">{label}</div>
        <button
          className="btn-ghost p-1"
          onClick={() => setPageOffset(v => v + 1)}
          disabled={isCurrentPage}
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div ref={ref} className="w-full" />
    </div>
  )
}
