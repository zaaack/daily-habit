import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/useAppStore'
import type { ConflictItem } from '@/db/types'
import { useState } from 'react'
import { X } from 'lucide-react'

export function ConflictDialog() {
  const { t } = useTranslation()
  const conflicts = useAppStore(s => s.conflicts)
  const projects = useAppStore(s => s.projects)
  const resolve = useAppStore(s => s.resolveConflict)
  const clear = useAppStore(s => s.clearConflict)

  const entries = Object.entries(conflicts)
  const open = entries.length > 0
  const firstEntry = entries[0]
  const [localDraft, setLocalDraft] = useState<Record<string, 'local' | 'remote'>>({})

  if (!firstEntry) return null
  const [projectId, items] = firstEntry as [string, ConflictItem[]]
  const project = projects.find(p => p.id === projectId)

  function getRes(item: ConflictItem): 'local' | 'remote' {
    const k = `${item.date}-${item.field}`
    return localDraft[k] ?? 'local'
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) void clear(projectId) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl animate-scale-in focus:outline-none">
          <div className="flex items-start justify-between mb-3">
            <div>
              <Dialog.Title className="text-base font-semibold">{t('conflict.title')}</Dialog.Title>
              <div className="text-xs text-slate-400 mt-0.5">{project?.emoji} {project?.name} · {t('conflict.count', { count: items.length })}</div>
            </div>
            <Dialog.Close asChild>
              <button className="text-slate-400 hover:text-slate-100 p-1"><X size={16} /></button>
            </Dialog.Close>
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-2 pr-1">
            {items.map((it) => {
              const k = `${it.date}-${it.field}`
              const cur = getRes(it)
              return (
                <div key={k} className="rounded-lg border border-slate-800 p-2.5 text-sm">
                  <div className="text-xs text-slate-400 mb-1.5">{it.date} · {it.field}</div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setLocalDraft(d => ({ ...d, [k]: 'local' }))}
                      className={'text-left rounded-md p-2 border ' + (cur === 'local' ? 'border-brand-500 bg-brand-500/10' : 'border-slate-800 hover:bg-slate-800/40')}
                    >
                      <div className="text-[10px] uppercase text-slate-500 mb-0.5">{t('conflict.local')}</div>
                      <div className="text-sm break-all">{String(it.local ?? '∅')}</div>
                    </button>
                    <button
                      onClick={() => setLocalDraft(d => ({ ...d, [k]: 'remote' }))}
                      className={'text-left rounded-md p-2 border ' + (cur === 'remote' ? 'border-brand-500 bg-brand-500/10' : 'border-slate-800 hover:bg-slate-800/40')}
                    >
                      <div className="text-[10px] uppercase text-slate-500 mb-0.5">{t('conflict.remote')}</div>
                      <div className="text-sm break-all">{String(it.remote ?? '∅')}</div>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button className="btn-ghost" onClick={() => void clear(projectId)}>{t('conflict.later')}</button>
            <div className="flex-1" />
            <button
              className="btn-primary"
              onClick={() => {
                const final = items.map(it => ({ ...it, resolution: getRes(it) }))
                void resolve(projectId, final)
                setLocalDraft({})
              }}
            >{t('conflict.apply')}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
