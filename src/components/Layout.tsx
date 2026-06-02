import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home as HomeIcon, ListChecks, Settings as SettingsIcon, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/useAppStore'
import { cn } from '@/lib/cn'
import { formatDistanceToNow } from 'date-fns'
import { getDateFnsLocale } from '@/i18n/locale'

export function Layout() {
  const { t } = useTranslation()
  const sync = useAppStore(s => s.sync)
  const triggerSync = useAppStore(s => s.triggerSync)
  const loc = useLocation()
  const onDetail = /^\/project\//.test(loc.pathname)

  return (
    <div className="min-h-full flex flex-col">
      <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur border-b border-slate-800">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center gap-2">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold">
            <span className="inline-block h-7 w-7 rounded-md bg-brand-500 grid place-items-center text-white">✅</span>
            <span>Daily Habit</span>
          </Link>
          <div className="flex-1" />
          <SyncBadge />
          <button
            className="btn-ghost p-2"
            onClick={() => void triggerSync()}
            title={t('layout.syncNow')}
            aria-label={t('layout.syncNow')}
          >
            <RefreshCw size={16} className={sync.status === 'syncing' ? 'animate-spin' : ''} />
          </button>
          <Link to="/settings" className="btn-ghost p-2" title={t('layout.settings')} aria-label={t('layout.settings')}>
            <SettingsIcon size={16} />
          </Link>
        </div>
      </header>

      <main className={cn('flex-1 mx-auto w-full max-w-3xl px-4 py-4', onDetail && 'pb-24')}>
        <Outlet />
      </main>

      <nav className="sticky bottom-0 z-30 bg-slate-950/90 backdrop-blur border-t border-slate-800">
        <div className="mx-auto max-w-3xl grid grid-cols-3">
          <TabLink to="/" icon={<HomeIcon size={18} />} label={t('nav.home')} />
          <TabLink to="/history" icon={<ListChecks size={18} />} label={t('nav.history')} />
          <TabLink to="/settings" icon={<SettingsIcon size={18} />} label={t('nav.settings')} />
        </div>
      </nav>
    </div>
  )
}

function TabLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'flex flex-col items-center gap-0.5 py-2 text-xs',
          isActive ? 'text-brand-400' : 'text-slate-400 hover:text-slate-200',
        )
      }
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  )
}

function SyncBadge() {
  const { t, i18n } = useTranslation()
  const sync = useAppStore(s => s.sync)
  let label = t('sync.idle')
  let color = 'text-slate-400'
  if (sync.status === 'syncing') { label = t('sync.syncing'); color = 'text-amber-400' }
  else if (sync.status === 'ok' && sync.at) {
    try { label = t('sync.synced', { relative: formatDistanceToNow(new Date(sync.at), { addSuffix: true, locale: getDateFnsLocale(i18n.language) }) }) }
    catch { label = t('sync.syncedShort') }
    color = 'text-slate-400'
  } else if (sync.status === 'error') { label = t('sync.error'); color = 'text-rose-400' }
  else if (sync.status === 'conflict') { label = t('sync.conflict'); color = 'text-amber-300' }
  return <span className={cn('text-xs', color)}>{label}</span>
}
