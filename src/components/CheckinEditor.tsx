import { useState } from 'react'
import { useAppStore } from '@/state/useAppStore'
import { Modal } from './Modal'
import type { Checkin, CheckStatus } from '@/db/types'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  projectId: string
  date: string
  initial?: Checkin | null
  unit?: string | null
}

export function CheckinEditor({ open, onOpenChange, projectId, date, initial, unit }: Props) {
  const setCheckin = useAppStore(s => s.setCheckin)
  const [status, setStatus] = useState<CheckStatus>(initial?.status ?? 'success')
  const [value, setValue] = useState<string>(initial?.value != null ? String(initial.value) : '')
  const [note, setNote] = useState<string>(initial?.note ?? '')

  async function save(next: { status: CheckStatus | null; value: number | null; note: string | null }) {
    await setCheckin(projectId, date, next.status, next.value, next.note)
    onOpenChange(false)
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`编辑 · ${date}`}>
      <div className="space-y-3">
        <div>
          <div className="label mb-1">状态</div>
          <div className="flex gap-1.5">
            {(['success', 'fail'] as CheckStatus[]).map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={
                  'flex-1 btn ' +
                  (status === s
                    ? (s === 'success' ? 'bg-brand-500 text-white' : 'bg-rose-500 text-white')
                    : 'btn-outline')
                }
              >{s === 'success' ? '✅ 完成' : '❌ 失败'}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="label mb-1">数值 {unit && <span className="text-slate-500">（{unit}）</span>}</div>
          <input
            className="input"
            inputMode="decimal"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="留空表示未填写"
          />
        </div>

        <div>
          <div className="label mb-1">备注</div>
          <textarea
            className="input min-h-[64px]"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="可选"
          />
        </div>

        <div className="flex items-center gap-2 pt-1">
          {initial && (
            <button
              className="btn-outline text-rose-400 border-rose-900/40"
              onClick={() => save({ status: null, value: null, note: null })}
            >清空</button>
          )}
          <div className="flex-1" />
          <button className="btn-ghost" onClick={() => onOpenChange(false)}>取消</button>
          <button
            className="btn-primary"
            onClick={() => save({
              status,
              value: value === '' ? null : Number(value),
              note: note.trim() || null,
            })}
          >保存</button>
        </div>
      </div>
    </Modal>
  )
}
