import * as Dialog from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/useAppStore'
import { X, Info } from 'lucide-react'
import { useMemo } from 'react'

export function ConflictDialog() {
  const { t } = useTranslation()
  const conflicts = useAppStore(s => s.conflicts)
  const clearConflicts = useAppStore(s => s.clearConflicts)

  const open = conflicts.length > 0

  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of conflicts) m.set(c.tbl, (m.get(c.tbl) ?? 0) + 1)
    return [...m.entries()]
  }, [conflicts])

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) clearConflicts() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md animate-fade-in" />
        <Dialog.Content className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[92vw] max-w-sm border border-slate-700/50 bg-slate-900/95 p-5 shadow-2xl animate-scale-in focus:outline-none">
          <div className="flex items-start justify-between mb-3">
            <Dialog.Title className="text-base font-semibold text-slate-50 flex items-center gap-2">
              <Info size={16} className="text-amber-300" />
              {t('conflict.title')}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800/50 transition-colors"><X size={16} /></button>
            </Dialog.Close>
          </div>
          <div className="text-sm text-slate-300 leading-relaxed">
            {t('conflict.notice')}
          </div>
          {counts.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {counts.map(([tbl, n]) => (
                <div key={tbl} className="flex items-center justify-between rounded-lg bg-slate-800/30 border border-slate-700/50 px-3 py-2 text-sm">
                  <span className="text-slate-300">{tbl === 'projects' ? t('conflict.project') : t('conflict.checkin')}</span>
                  <span className="text-slate-400 text-xs">{t('conflict.count', { count: n })}</span>
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end mt-5">
            <button className="btn-primary" onClick={clearConflicts}>{t('common.ok')}</button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}