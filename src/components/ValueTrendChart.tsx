import { useEffect, useRef } from 'react'
import uPlot, { type Options as UPlotOptions, type AlignedData } from 'uplot'
import 'uplot/dist/uPlot.min.css'
import type { Checkin } from '@/db/types'
import { monthDays } from '@/db/schema'

interface Props {
  checkins: Checkin[]
  color: string
  year: number
  month: number
}

export function ValueTrendChart({ checkins, color, year, month }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const plotRef = useRef<uPlot | null>(null)

  useEffect(() => {
    if (!ref.current) return
    const days = monthDays(year, month)
    const xs: number[] = []
    const ys: (number | null)[] = []
    const map = new Map(checkins.filter(c => c.value != null).map(c => [c.date, c.value!]))
    for (const d of days) {
      xs.push(Math.floor(new Date(d + 'T00:00:00').getTime() / 1000))
      ys.push(map.get(d) ?? null)
    }
    const data: AlignedData = [xs, ys.map(v => v == null ? Number.NaN : v)]

    if (plotRef.current) {
      plotRef.current.setData(data)
      return
    }

    const opts: UPlotOptions = {
      width: ref.current.clientWidth,
      height: 220,
      cursor: { drag: { x: true, y: false } },
      scales: { x: { time: true }, y: { auto: true } },
      series: [
        {},
        {
          label: '数值',
          stroke: color,
          width: 2,
          points: { show: true, size: 5, stroke: color, fill: color },
          spanGaps: true,
        },
      ],
      axes: [
        { stroke: '#94a3b8', grid: { stroke: '#1e293b' } },
        { stroke: '#94a3b8', grid: { stroke: '#1e293b' }, size: 50 },
      ],
    }
    plotRef.current = new uPlot(opts, data, ref.current)

    const ro = new ResizeObserver(() => {
      if (plotRef.current && ref.current) {
        plotRef.current.setSize({ width: ref.current.clientWidth, height: 220 })
      }
    })
    ro.observe(ref.current)
    return () => {
      ro.disconnect()
      plotRef.current?.destroy()
      plotRef.current = null
    }
  }, [checkins, color, year, month])

  return <div ref={ref} className="w-full" />
}
