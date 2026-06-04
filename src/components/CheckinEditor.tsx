import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const setCheckin = useAppStore(s => s.setCheckin)
  const [status, setStatus] = useState<CheckStatus>(initial?.status ?? 'success')
  const [value, setValue] = useState<string>(initial?.value != null ? String(initial.value) : '')
  const [note, setNote] = useState<string>(initial?.note ?? '')

  async function save(next: { status: CheckStatus | null; value: number | null; note: string | null }) {
    await setCheckin(projectId, date, next.status, next.value, next.note)
    onOpenChange(false)
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={t('checkin.edit', { date })}>
      <div className="space-y-4">
        <div>
          <div className="label mb-1.5">{t('checkin.status')}</div>
          <div className="flex gap-2">
            {(['success', 'fail'] as CheckStatus[]).map(s => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={
                  'flex-1 btn py-2.5 ' +
                  (status === s
                    ? (s === 'success' ? 'bg-brand-500 text-white shadow-sm shadow-brand-500/30' : 'bg-rose-500 text-white shadow-sm shadow-rose-500/30')
                    : 'btn-outline')
                }
              >{s === 'success' ? t('checkin.done') : t('checkin.fail')}</button>
            ))}
          </div>
        </div>

        <div>
          <div className="label mb-1.5">{t('checkin.value')}{unit && <span className="text-slate-400">{t('checkin.unitLabel', { unit })}</span>}</div>
          <input
            className="input"
            inputMode="decimal"
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={t('checkin.valuePlaceholder')}
          />
        </div>

        <div>
          <div className="label mb-1.5">{t('checkin.note')}</div>
          <textarea
            className="input min-h-[72px] resize-none"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('checkin.notePlaceholder')}
          />
        </div>

        <div className="flex items-center gap-2 pt-2">
          {initial && (
            <button
              className="btn-outline text-rose-400 border-rose-900/40"
              onClick={() => save({ status: null, value: null, note: null })}
            >{t('checkin.clear')}</button>
          )}
          <div className="flex-1" />
          <button className="btn-ghost" onClick={() => onOpenChange(false)}>{t('checkin.cancel')}</button>
          <button
            className="btn-primary"
            onClick={() => save({
              status,
              value: value === '' ? null : Number(value),
              note: note.trim() || null,
            })}
          >{t('checkin.save')}</button>
        </div>
      </div>
    </Modal>
  )
}
