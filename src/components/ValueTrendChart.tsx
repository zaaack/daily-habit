import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
} from 'chart.js'
import { Line } from 'react-chartjs-2'
import type { Checkin } from '@/db/types'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip)

interface Props {
  checkins: Checkin[]
  color: string
  currentYear: number
  currentMonth: number
}

export function ValueTrendChart({ checkins, color, currentYear, currentMonth }: Props) {
  const { t } = useTranslation()
  const [pageOffset, setPageOffset] = useState(0)

  const months = useMemo(() => {
    const result: { year: number; month: number; label: string }[] = []
    for (let i = 0; i < 12; i++) {
      const m = currentMonth + pageOffset * 12 - 11 + i
      const y = currentYear + Math.floor(m / 12)
      const mo = ((m % 12) + 12) % 12
      result.push({ year: y, month: mo, label: t('project.month', { month: mo + 1 }) })
    }
    return result
  }, [currentYear, currentMonth, pageOffset])

  const isCurrentPage = pageOffset === 0

  const { labels, values } = useMemo(() => {
    const byMonth = new Map<string, { sum: number; count: number }>()
    for (const c of checkins) {
      if (c.value == null) continue
      const key = c.date.slice(0, 7)
      const prev = byMonth.get(key)
      if (prev) { prev.sum += c.value; prev.count++ }
      else byMonth.set(key, { sum: c.value, count: 1 })
    }

    const labels: string[] = []
    const values: (number | null)[] = []
    for (const m of months) {
      const key = `${m.year}-${String(m.month + 1).padStart(2, '0')}`
      labels.push(m.label)
      const entry = byMonth.get(key)
      values.push(entry ? entry.sum / entry.count : null)
    }
    return { labels, values }
  }, [checkins, months])

  const label = `${months[0].year}.${months[0].month + 1} – ${months[11].year}.${months[11].month + 1}`

  const s = getComputedStyle(document.documentElement)
  const axisColor = `rgb(${s.getPropertyValue('--c-slate-400').trim()})`
  const gridColor = `rgb(${s.getPropertyValue('--c-slate-600').trim()})`

  const chartData = {
    labels,
    datasets: [
      {
        label: t('chart.monthlyAvg'),
        data: values,
        borderColor: color,
        backgroundColor: color + '33',
        borderWidth: 2,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: true,
      },
    ],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: axisColor },
      },
      y: {
        grid: { color: gridColor },
        ticks: { color: axisColor },
      },
    },
  }

  return (
    <div>
      <div className="flex items-center mb-3">
        <button className="btn-ghost p-1.5 rounded-lg" onClick={() => setPageOffset(v => v - 1)}>
          <ChevronLeft size={14} />
        </button>
        <div className="flex-1 text-center text-xs text-slate-400 tabular-nums font-medium">{label}</div>
        <button
          className="btn-ghost p-1.5 rounded-lg"
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
