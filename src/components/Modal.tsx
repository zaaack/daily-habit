import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/cn'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  children: ReactNode
  size?: 'sm' | 'md'
}

export function Modal({ open, onOpenChange, title, children, size = 'md' }: ModalProps) {
  const { t } = useTranslation()
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-md animate-fade-in" />
        <Dialog.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2',
            'w-[92vw] rounded-2xl border border-slate-700/50 bg-slate-900/95 p-5 shadow-2xl',
            'animate-scale-in focus:outline-none',
            size === 'sm' ? 'max-w-sm' : 'max-w-md',
          )}
        >
          <div className="flex items-start justify-between mb-4">
            <Dialog.Title className="text-base font-semibold text-slate-50">{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button className="text-slate-400 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800/50 transition-colors" aria-label={t('modal.close')}>
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
