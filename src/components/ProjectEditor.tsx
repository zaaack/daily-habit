import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/useAppStore'
import { PROJECT_COLORS, PROJECT_EMOJIS } from '@/db/schema'
import { Modal } from './Modal'
import { cn } from '@/lib/cn'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  initial?: {
    id?: string
    name?: string
    description?: string
    unit?: string | null
    emoji?: string
    color?: string
  }
  onDelete?: (id: string) => void
}

export function ProjectEditor({ open, onOpenChange, initial, onDelete }: Props) {
  const { t } = useTranslation()
  const addProject = useAppStore(s => s.addProject)
  const updateProject = useAppStore(s => s.updateProject)
  const deleteProject = useAppStore(s => s.deleteProject)
  const restoreProject = useAppStore(s => s.restoreProject)
  const archiveProject = useAppStore(s => s.archiveProject)
  const unarchiveProject = useAppStore(s => s.unarchiveProject)

  const currentProject = initial?.id ? useAppStore(s => s.projects.find(p => p.id === initial.id)) : undefined

  const [name, setName] = useState(initial?.name ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [unit, setUnit] = useState(initial?.unit ?? '')
  const [emoji, setEmoji] = useState(initial?.emoji ?? PROJECT_EMOJIS[0])
  const [color, setColor] = useState(initial?.color ?? PROJECT_COLORS[0])
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const isEdit = !!initial?.id

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setDescription(initial?.description ?? '')
      setUnit(initial?.unit ?? '')
      setEmoji(initial?.emoji ?? PROJECT_EMOJIS[0])
      setColor(initial?.color ?? PROJECT_COLORS[0])
      setConfirmDelete(false)
    }
  }, [open, initial?.id])

  async function handleSubmit() {
    if (!name.trim()) return
    setBusy(true)
    try {
      if (isEdit && initial?.id) {
        await updateProject(initial.id, { name: name.trim(), description: description.trim(), unit: unit.trim() || null, emoji, color })
      } else {
        await addProject({ name: name.trim(), description: description.trim(), unit: unit.trim() || null, emoji, color })
      }
      onOpenChange(false)
    } finally { setBusy(false) }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? t('editor.editProject') : t('editor.newProject')}
    >
      <div className="space-y-3">
        <div>
          <div className="label mb-1">{t('editor.name')}</div>
          <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder={t('editor.namePlaceholder')} />
        </div>
        <div>
          <div className="label mb-1">{t('editor.description')}</div>
          <textarea
            className="input resize-none min-h-[60px]"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('editor.descriptionPlaceholder')}
          />
        </div>
        <div>
          <div className="label mb-1">{t('editor.unit')}</div>
          <input className="input" value={unit} onChange={e => setUnit(e.target.value)} placeholder={t('editor.unitPlaceholder')} />
        </div>
        <div>
          <div className="label mb-1">{t('editor.icon')}</div>
          <div className="flex flex-wrap gap-1.5">
            {PROJECT_EMOJIS.map(e => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={cn(
                  'h-8 w-8 rounded-md grid place-items-center text-lg',
                  emoji === e ? 'bg-brand-500/20 ring-2 ring-brand-500' : 'bg-slate-800 hover:bg-slate-700',
                )}
              >{e}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="label mb-1">{t('editor.color')}</div>
          <div className="flex flex-wrap gap-1.5">
            {PROJECT_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn(
                  'h-7 w-7 rounded-md',
                  color === c && 'ring-2 ring-offset-2 ring-offset-slate-900 ring-white',
                )}
                style={{ background: c }}
                aria-label={`color ${c}`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          {isEdit && onDelete && initial?.id && !confirmDelete && (
            <div className="flex items-center gap-2">
              {currentProject?.deleted ? (
                <button
                  className="btn-outline text-brand-400 border-brand-900/40 hover:bg-brand-900/20"
                  onClick={async () => {
                    if (!initial.id) return
                    await restoreProject(initial.id)
                    onOpenChange(false)
                  }}
                >{t('home.restore')}</button>
              ) : (<>
                {currentProject?.archived ? (
                  <button
                    className="btn-outline"
                    onClick={async () => {
                      if (!initial.id) return
                      await unarchiveProject(initial.id)
                      onOpenChange(false)
                    }}
                  >{t('editor.unarchive')}</button>
                ) : (
                  <button
                    className="btn-outline"
                    onClick={async () => {
                      if (!initial.id) return
                      await archiveProject(initial.id)
                      onOpenChange(false)
                    }}
                  >{t('editor.archive')}</button>
                )}
                <button
                  className="btn-outline text-rose-400 border-rose-900/40 hover:bg-rose-900/20"
                  onClick={() => setConfirmDelete(true)}
                >{t('editor.delete')}</button>
              </>)}
            </div>
          )}
          {isEdit && confirmDelete && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-rose-400">{t('editor.deleteConfirm', { name: name || initial?.name })}</span>
              <button
                className="btn-outline"
                onClick={() => setConfirmDelete(false)}
              >{t('editor.cancel')}</button>
              <button
                className="btn-primary bg-rose-600 hover:bg-rose-500"
                onClick={async () => {
                  if (!initial.id) return
                  await deleteProject(initial.id)
                  onDelete?.(initial.id)
                  onOpenChange(false)
                }}
              >{t('editor.delete')}</button>
            </div>
          )}
          {!confirmDelete && <><div className="flex-1" />
          <button className="btn-ghost" onClick={() => onOpenChange(false)}>{t('editor.cancel')}</button>
          <button className="btn-primary" disabled={busy || !name.trim()} onClick={handleSubmit}>
            {isEdit ? t('editor.save') : t('editor.create')}
          </button></>}
        </div>
      </div>
    </Modal>
  )
}
