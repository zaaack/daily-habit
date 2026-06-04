import { useState, useRef, useMemo } from 'react'
import { Plus, Check, Filter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DndContext, PointerSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useAppStore } from '@/state/useAppStore'
import { ProjectCard } from '@/components/ProjectCard'
import { ProjectEditor } from '@/components/ProjectEditor'
import { Modal } from '@/components/Modal'
import { shiftDateStr, todayStr } from '@/db/schema'
import { cn } from '@/lib/cn'
import type { Project } from '@/db/types'

function SortableProjectCard({ project, dates }: { project: Project; dates: string[] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: project.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ProjectCard project={project} dates={dates} sorting />
    </div>
  )
}

export function Home() {
  const { t } = useTranslation()
  const allProjects = useAppStore(s => s.projects)
  const reorderProjects = useAppStore(s => s.reorderProjects)
  const filter = useAppStore(s => s.filterState)
  const setFilterState = useAppStore(s => s.setFilterState)
  const [open, setOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  const projects = useMemo(() => allProjects.filter(p => {
    if (p.deleted) return filter.deleted
    if (p.archived) return filter.archived
    return filter.normal
  }), [allProjects, filter])

  const today = todayStr()
  const todayDow = new Date(today + 'T00:00:00').getDay()
  const saturdayOffset = 6 - todayDow
  const dates: string[] = []
  for (let i = 6; i >= 0; i--) dates.push(shiftDateStr(today, saturdayOffset - i))

  const oldest = dates[0]
  const newest = dates[dates.length - 1]
  const rangeLabel = `${oldest.slice(5)} – ${newest.slice(5)}`

  const [sorting, setSorting] = useState(false)
  const [localProjects, setLocalProjects] = useState(projects)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  )

  const displayProjects = sorting ? localProjects : projects

  const startSortMode = () => {
    setSorting(true)
    setLocalProjects(projects)
    navigator.vibrate?.(10)
  }

  const handlePointerDown = () => {
    longPressTimer.current = setTimeout(startSortMode, 600)
  }

  const handlePointerUp = () => {
    clearTimeout(longPressTimer.current)
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (active.id !== over?.id) {
      setLocalProjects(prev => {
        const oldIndex = prev.findIndex(p => p.id === active.id)
        const newIndex = prev.findIndex(p => p.id === over!.id)
        if (oldIndex === -1 || newIndex === -1) return prev
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  const doneSorting = () => {
    setSorting(false)
    reorderProjects(localProjects.map(p => p.id))
  }

  return (
    <div className="space-y-3">
      <div className="card">
        <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
          <span className="tabular-nums font-medium">{rangeLabel}</span>
          <button
            onClick={() => setFilterOpen(true)}
            className="ml-auto flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            aria-label={t('home.filter')}
          >
            <Filter size={14} />
            {t('home.filter')}
          </button>
          {sorting && (
            <button
              onClick={doneSorting}
              className="ml-auto flex items-center gap-1 text-xs text-brand-400 font-medium"
            >
              <Check size={14} />
              {t('common.done')}
            </button>
          )}
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
        <div className="card text-center text-slate-400 py-12">
          <div className="text-3xl mb-3">📝</div>
          <div className="text-sm font-medium text-slate-300">{t('home.empty')}</div>
          <div className="text-xs text-slate-400 mt-1.5">{t('home.emptyHint')}</div>
        </div>
      ) : (
        <div className="space-y-3">
          {sorting ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={displayProjects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {displayProjects.map(p => (
                  <SortableProjectCard key={p.id} project={p} dates={dates} />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            displayProjects.map(p => (
              <div
                key={p.id}
                onPointerDown={handlePointerDown}
                onPointerUp={handlePointerUp}
              >
                <ProjectCard project={p} dates={dates} />
              </div>
            ))
          )}
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

      <Modal open={filterOpen} onOpenChange={setFilterOpen} title={t('home.filterTitle')} size="sm">
        <div className="space-y-3">
          {(['normal', 'archived', 'deleted'] as const).map(key => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={filter[key]}
                onChange={() => setFilterState({ ...filter, [key]: !filter[key] })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-brand-500 focus:ring-brand-500"
              />
              <span className={cn(
                'text-sm',
                key === 'deleted' ? 'text-rose-400' : key === 'archived' ? 'text-amber-400/90' : 'text-slate-200',
              )}>{t(`home.status${key.charAt(0).toUpperCase() + key.slice(1)}`)}</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  )
}
