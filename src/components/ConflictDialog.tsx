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

  const entries = Object.entries(conflicts) as [string, ConflictItem[]][]
  const open = entries.length > 0
  const [currentIdx, setCurrentIdx] = useState(0)
  const [localDraft, setLocalDraft] = useState<Record<string, 'local' | 'remote'>>({})

  const idx = Math.min(currentIdx, entries.length - 1)
  const [projectId, items] = entries[idx] ?? [null, []]
  const project = projectId ? projects.find(p => p.id === projectId) : undefined

  function getRes(item: ConflictItem): 'local' | 'remote' {
    const k = `${projectId}-${item.date}-${item.field}`
    return localDraft[k] ?? 'local'
  }

  function handleApply() {
    if (!projectId) return
    const final = items.map(it => ({ ...it, resolution: getRes(it) }))
    void resolve(projectId, final)
    setLocalDraft({})
    if (idx < entries.length - 1) {
      setCurrentIdx(idx)
    } else {
      setCurrentIdx(0)
    }
  }

  function handleSkip() {
    if (!projectId) return
    void clear(projectId)
    setLocalDraft({})
    if (idx >= entries.length - 1) setCurrentIdx(0)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v && projectId) void clear(projectId) }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-lg rounded-2xl border border-slate-700/50 bg-slate-900/95 p-5 shadow-2xl animate-scale-in focus:outline-none flex flex-col max-h-[85vh]">
          <div className="flex items-start justify-between mb-4">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-50">{t('conflict.title')}</Dialog.Title>
              <div className="text-xs text-slate-400 mt-0.5">
                {project?.emoji} {project?.name} · {t('conflict.count', { count: items.length })}
                {entries.length > 1 && <span className="ml-1">({idx + 1}/{entries.length})</span>}
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"><X size={16} /></button>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 min-h-0">
            {items.map((it) => {
              const k = `${projectId}-${it.date}-${it.field}`
              const cur = getRes(it)
              return (
                <div key={k} className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-3 text-sm">
                  <div className="text-xs text-slate-400 mb-2 font-medium">{it.date} · {it.field}</div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      onClick={() => setLocalDraft(d => ({ ...d, [k]: 'local' }))}
                      className={'text-left rounded-xl p-2.5 border transition-all duration-150 ' + (cur === 'local' ? 'border-brand-500/70 bg-brand-500/10 shadow-sm shadow-brand-500/10' : 'border-slate-700/50 hover:bg-slate-800/50 hover:border-slate-600/50')}
                    >
                      <div className="text-[11px] uppercase text-slate-400 mb-1 font-medium">{t('conflict.local')}</div>
                      <div className="text-sm break-all text-slate-200">{String(it.local ?? '∅')}</div>
                    </button>
                    <button
                      onClick={() => setLocalDraft(d => ({ ...d, [k]: 'remote' }))}
                      className={'text-left rounded-xl p-2.5 border transition-all duration-150 ' + (cur === 'remote' ? 'border-brand-500/70 bg-brand-500/10 shadow-sm shadow-brand-500/10' : 'border-slate-700/50 hover:bg-slate-800/50 hover:border-slate-600/50')}
                    >
                      <div className="text-[11px] uppercase text-slate-400 mb-1 font-medium">{t('conflict.remote')}</div>
                      <div className="text-sm break-all text-slate-200">{String(it.remote ?? '∅')}</div>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex items-center gap-2 mt-5">
            <button className="btn-ghost" onClick={handleSkip}>{t('conflict.later')}</button>
            <div className="flex-1" />
            <button className="btn-primary" onClick={handleApply}>{t('conflict.apply')}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
