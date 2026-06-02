import { useRef, useState } from 'react'
import { CheckinEditor } from './CheckinEditor'
import type { Checkin } from '@/db/types'
import { cn } from '@/lib/cn'

interface Props {
  projectId: string
  date: string
  checkin?: Checkin
  unit?: string | null
  color: string
  compact?: boolean
  refreshKey?: number
  onCycle: () => void
}

export function StatusCell({ projectId, date, checkin, unit, color, compact, refreshKey, onCycle }: Props) {
  const [open, setOpen] = useState(false)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const status = checkin?.status
  const dayNum = date.slice(8)

  const base = 'relative grid place-items-center rounded-md border select-none transition active:scale-90'
  const sizeCls = compact ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs'
  const defaultCls = 'bg-slate-900/40 border-slate-800 text-slate-600'

  function startLongPress() {
    longPressTimer.current = setTimeout(() => setOpen(true), 500)
  }
  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  return (
    <>
      <button
        className={cn(base, sizeCls, status ? '' : defaultCls)}
        style={
          status === 'success'
            ? { background: color, borderColor: color, color: '#020617' }
            : status === 'fail'
            ? { background: '#ef4444', borderColor: '#ef4444', color: '#fff' }
            : undefined
        }
        onClick={onCycle}
        onDoubleClick={(e) => { e.preventDefault(); setOpen(true) }}
        onContextMenu={(e) => { e.preventDefault(); setOpen(true) }}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onTouchCancel={cancelLongPress}
        title={date}
      >
        {dayNum}
      </button>
      <CheckinEditor
        key={open ? 'open' : `closed-${refreshKey ?? 0}`}
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        date={date}
        initial={checkin ?? null}
        unit={unit}
      />
    </>
  )
}
