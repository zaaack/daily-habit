import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { Checkin } from '@/db/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend)

interface Props {
  checkins: Checkin[]
  color: string
  currentYear: number
  currentMonth: number
  unit: string | null
}

export function MonthlyStatsChart({ checkins, color, currentYear, currentMonth, unit }: Props) {
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

  const { labels, successValues, valueSumValues } = useMemo(() => {
    const byMonth = new Map<string, { successCount: number; valueSum: number }>()
    for (const c of checkins) {
      const key = c.date.slice(0, 7)
      const prev = byMonth.get(key)
      if (prev) {
        if (c.status === 'success') prev.successCount++
        if (c.value != null) prev.valueSum += c.value
      } else {
        byMonth.set(key, {
          successCount: c.status === 'success' ? 1 : 0,
          valueSum: c.value ?? 0,
        })
      }
    }

    const labels: string[] = []
    const successValues: (number | null)[] = []
    const valueSumValues: (number | null)[] = []
    for (const m of months) {
      const key = `${m.year}-${String(m.month + 1).padStart(2, '0')}`
      labels.push(m.label)
      const entry = byMonth.get(key)
      if (entry) {
        successValues.push(entry.successCount)
        valueSumValues.push(entry.valueSum)
      } else {
        successValues.push(null)
        valueSumValues.push(null)
      }
    }
    return { labels, successValues, valueSumValues }
  }, [checkins, months])

  const label = `${months[0].year}.${months[0].month + 1} – ${months[11].year}.${months[11].month + 1}`

  const s = getComputedStyle(document.documentElement)
  const axisColor = `rgb(${s.getPropertyValue('--c-slate-400').trim()})`
  const gridColor = `rgb(${s.getPropertyValue('--c-slate-600').trim()})`
  const successColor = '#22c55e'

  const chartData = {
    labels,
    datasets: [
      {
        label: '成功次数',
        data: successValues,
        borderColor: successColor,
        backgroundColor: successColor,
        borderWidth: 2,
        pointBackgroundColor: successColor,
        pointBorderColor: successColor,
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: true,
        yAxisID: 'y',
      },
      {
        label: unit ? `总数值 (${unit})` : '总数值',
        data: valueSumValues,
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: true,
        yAxisID: 'y1',
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        labels: { color: axisColor, boxWidth: 12, padding: 8 },
      },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: axisColor },
      },
      y: {
        type: 'linear' as const,
        position: 'left' as const,
        grid: { color: gridColor },
        ticks: { color: axisColor },
        title: { display: true, text: '成功次数', color: axisColor },
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        grid: { drawOnChartArea: false },
        ticks: { color: axisColor },
        title: { display: true, text: unit ? `总数值 (${unit})` : '总数值', color: axisColor },
      },
    },
  }

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
      <div className="w-full" style={{ height: 200 }}>
        <Line data={chartData} options={options} />
      </div>
    </div>
  )
}
