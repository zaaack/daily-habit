import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/useAppStore'
import { ProjectCard } from '@/components/ProjectCard'
import { ProjectEditor } from '@/components/ProjectEditor'
import { shiftDateStr, todayStr } from '@/db/schema'
import { cn } from '@/lib/cn'

export function Home() {
  const { t } = useTranslation()
  const projects = useAppStore(s => s.projects)
  const [open, setOpen] = useState(false)

  const today = todayStr()
  const todayDow = new Date(today + 'T00:00:00').getDay()
  const saturdayOffset = 6 - todayDow
  const dates: string[] = []
  for (let i = 6; i >= 0; i--) dates.push(shiftDateStr(today, saturdayOffset - i))

  const oldest = dates[0]
  const newest = dates[dates.length - 1]
  const rangeLabel = `${oldest.slice(5)} – ${newest.slice(5)}`

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-center gap-2 text-sm text-slate-500 mb-1">
          <span className="tabular-nums">{rangeLabel}</span>
        </div>
        <div className="grid grid-cols-7 gap-1.5 text-xs">
          {dates.map(d => {
            const dow = new Date(d + 'T00:00:00').getDay()
            const isToday = d === today
            const isFuture = d > today
            return (
              <div
                key={'dow-' + d}
                className={cn(
                  'text-left pl-2 box-border',
                  isToday ? 'font-bold text-slate-50' : isFuture ? 'text-slate-300' : 'text-slate-400',
                )}
              >
                {(t('common.dow', { returnObjects: true }) as string[])[dow]}
              </div>
            )
          })}
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="card text-center text-slate-500 py-10">
          <div className="text-2xl mb-2">📝</div>
          <div className="text-sm">{t('home.empty')}</div>
          <div className="text-xs text-slate-400 mt-1">{t('home.emptyHint')}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map(p => (
            <ProjectCard key={p.id} project={p} dates={dates} />
          ))}
        </div>
      )}

      <button
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-20 z-40 h-12 w-12 rounded-full bg-brand-500 text-slate-50 shadow-lg shadow-brand-500/30 grid place-items-center active:scale-95"
        aria-label={t('home.newProject')}
      >
        <Plus size={20} />
      </button>
      <ProjectEditor open={open} onOpenChange={setOpen} />
    </div>
  )
}
