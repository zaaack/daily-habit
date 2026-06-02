import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Home as HomeIcon, ListChecks, Settings as SettingsIcon, RefreshCw } from 'lucide-react'
import { useAppStore } from '@/state/useAppStore'
import { cn } from '@/lib/cn'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

export function Layout() {
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
            title="立即同步"
            aria-label="立即同步"
          >
            <RefreshCw size={16} className={sync.status === 'syncing' ? 'animate-spin' : ''} />
          </button>
          <Link to="/settings" className="btn-ghost p-2" title="设置" aria-label="设置">
            <SettingsIcon size={16} />
          </Link>
        </div>
      </header>

      <main className={cn('flex-1 mx-auto w-full max-w-3xl px-4 py-4', onDetail && 'pb-24')}>
        <Outlet />
      </main>

      <nav className="sticky bottom-0 z-30 bg-slate-950/90 backdrop-blur border-t border-slate-800">
        <div className="mx-auto max-w-3xl grid grid-cols-3">
          <TabLink to="/" icon={<HomeIcon size={18} />} label="首页" />
          <TabLink to="/history" icon={<ListChecks size={18} />} label="历史" />
          <TabLink to="/settings" icon={<SettingsIcon size={18} />} label="设置" />
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
  const sync = useAppStore(s => s.sync)
  let label = '空闲'
  let color = 'text-slate-400'
  if (sync.status === 'syncing') { label = '同步中…'; color = 'text-amber-400' }
  else if (sync.status === 'ok' && sync.at) {
    try { label = `已同步 · ${formatDistanceToNow(new Date(sync.at), { addSuffix: true, locale: zhCN })}` }
    catch { label = '已同步' }
    color = 'text-slate-400'
  } else if (sync.status === 'error') { label = '同步失败'; color = 'text-rose-400' }
  else if (sync.status === 'conflict') { label = '有冲突'; color = 'text-amber-300' }
  return <span className={cn('text-xs', color)}>{label}</span>
}
