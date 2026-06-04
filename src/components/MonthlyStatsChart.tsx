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

  const { labels, successValues, failValues, valueSumValues } = useMemo(() => {
    const byMonth = new Map<string, { successCount: number; failCount: number; valueSum: number }>()
    for (const c of checkins) {
      const key = c.date.slice(0, 7)
      const prev = byMonth.get(key)
      if (prev) {
        if (c.status === 'success') prev.successCount++
        else if (c.status === 'fail') prev.failCount++
        if (c.value != null) prev.valueSum += c.value
      } else {
        byMonth.set(key, {
          successCount: c.status === 'success' ? 1 : 0,
          failCount: c.status === 'fail' ? 1 : 0,
          valueSum: c.value ?? 0,
        })
      }
    }

    const labels: string[] = []
    const successValues: (number | null)[] = []
    const failValues: (number | null)[] = []
    const valueSumValues: (number | null)[] = []
    for (const m of months) {
      const key = `${m.year}-${String(m.month + 1).padStart(2, '0')}`
      labels.push(m.label)
      const entry = byMonth.get(key)
      if (entry) {
        successValues.push(entry.successCount)
        failValues.push(entry.failCount)
        valueSumValues.push(entry.valueSum)
      } else {
        successValues.push(null)
        failValues.push(null)
        valueSumValues.push(null)
      }
    }
    return { labels, successValues, failValues, valueSumValues }
  }, [checkins, months])

  const label = `${months[0].year}.${months[0].month + 1} – ${months[11].year}.${months[11].month + 1}`

  const s = getComputedStyle(document.documentElement)
  const axisColor = `rgb(${s.getPropertyValue('--c-slate-400').trim()})`
  const gridColor = `rgb(${s.getPropertyValue('--c-slate-600').trim()})`
  const successColor = '#22c55e'
  const failColor = '#ef4444'

  const chartData = {
    labels,
    datasets: [
      {
        label: t('chart.successCount'),
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
        label: t('chart.failCount'),
        data: failValues,
        borderColor: failColor,
        backgroundColor: failColor,
        borderWidth: 2,
        pointBackgroundColor: failColor,
        pointBorderColor: failColor,
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: true,
        yAxisID: 'y',
      },
      {
        label: unit ? t('chart.totalValueWithUnit', { unit }) : t('chart.totalValue'),
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
        title: { display: true, text: t('chart.successCount'), color: axisColor },
      },
      y1: {
        type: 'linear' as const,
        position: 'right' as const,
        grid: { drawOnChartArea: false },
        ticks: { color: axisColor },
        title: { display: true, text: unit ? t('chart.totalValueWithUnit', { unit }) : t('chart.totalValue'), color: axisColor },
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
