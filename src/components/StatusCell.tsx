import { useEffect, useRef, useState } from 'react'
import { CheckinEditor } from './CheckinEditor'
import type { Checkin, CheckStatus } from '@/db/types'
import { cn } from '@/lib/cn'
import { todayStr } from '@/db/schema'

interface Props {
  projectId: string
  date: string
  checkin?: Checkin
  unit?: string | null
  color: string
  compact?: boolean
  disabled?: boolean
  refreshKey?: number
  onCycle: () => void
}

function nextStatus(cur: CheckStatus | undefined): CheckStatus | null {
  if (!cur) return 'success'
  if (cur === 'success') return 'fail'
  return null
}

export function StatusCell({ projectId, date, checkin, unit, color, compact, disabled, refreshKey, onCycle }: Props) {
  const [open, setOpen] = useState(false)
  const [optimistic, setOptimistic] = useState<CheckStatus | null | undefined>(undefined)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setOptimistic(undefined) }, [checkin])

  const status = optimistic !== undefined ? optimistic : checkin?.status
  const dayNum = date.slice(8)
  const isToday = date === todayStr()

  const base = 'relative grid place-items-center rounded-md border select-none transition active:scale-90'
  const sizeCls = compact ? 'h-9 w-9 text-xs' : 'h-9 w-9 text-xs'
  const todayCls = isToday ? '!font-bold !border-2' : ''
  const defaultCls = '!bg-transparent !border-slate-600 !text-slate-400'

  function handleClick() {
    setOptimistic(nextStatus(checkin?.status))
    onCycle()
  }

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
        className={cn(base, sizeCls, todayCls, status ? '' : defaultCls, disabled && 'pointer-events-none')}
        disabled={disabled}
        style={
          status === 'success'
            ? { background: color, borderColor: color, color: '#020617' }
            : status === 'fail'
            ? { background: '#ef4444', borderColor: '#ef4444', color: '#fff' }
            : undefined
        }
        onClick={handleClick}
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
