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
  const value = checkin?.value

  const base =
    'relative grid place-items-center rounded-md border select-none transition active:scale-90'
  const sizeCls = compact ? 'h-7 w-7 text-[10px]' : 'h-9 w-9 text-xs'
  let cls = 'bg-slate-900/40 border-slate-800 text-slate-600'
  if (status === 'success') cls = 'text-slate-950'
  else if (status === 'fail') cls = 'text-white'

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
        className={cn(base, sizeCls, cls)}
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
        {status === 'success' && (value != null ? value : '✓')}
        {status === 'fail' && '✕'}
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
