import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/useAppStore'
import { getSyncConfig, setSyncConfig, testConnection, syncOneProject, makeRemotePath, cleanupDeletedProjects } from '@/sync/fullSync'
import type { WebDavConfig } from '@/sync/webdav'
import type { ProjectFile } from '@/sync/merge'
import type { Checkin } from '@/db/types'
import { DEFAULT_REMOTE_DIR, makeProjectId, PROJECT_COLORS } from '@/db/schema'
import { getRepo } from '@/db'
import { Download, Upload, Trash2, Sun, Moon, Monitor } from 'lucide-react'
import { format } from 'date-fns'

type ThemeMode = 'auto' | 'light' | 'dark'

function applyTheme(mode: ThemeMode) {
  const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try { localStorage.setItem('theme', mode) } catch { /* noop */ }
}

export function Settings() {
  const { t } = useTranslation()
  const sync = useAppStore(s => s.sync)
  const triggerSync = useAppStore(s => s.triggerSync)

  const [cfg, setCfg] = useState<WebDavConfig>({ url: '', username: '', password: '', remoteDir: DEFAULT_REMOTE_DIR })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [theme, setTheme] = useState<ThemeMode>('auto')
  const [importing, setImporting] = useState<{ current: number; total: number } | null>(null)
  const [cleaning, setCleaning] = useState(false)

  useEffect(() => {
    void (async () => {
      const c = getSyncConfig()
      if (c) setCfg(c)
    })()
    try {
      const stored = localStorage.getItem('theme') as ThemeMode | null
      if (stored === 'light' || stored === 'dark' || stored === 'auto') setTheme(stored)
    } catch { /* noop */ }
  }, [])

  function setThemeMode(m: ThemeMode) {
    setTheme(m)
    applyTheme(m)
  }

  async function saveCfg() {
    setSyncConfig(cfg)
    setSavedAt(Date.now())
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    const r = await testConnection(cfg)
    setTestResult(r)
    setTesting(false)
  }

  async function handleExport() {
    const repo = await getRepo()
    const projects = await repo.listProjects(true)
    const data: ProjectFile[] = []
    for (const p of projects) {
      const cs = await repo.getCheckins(p.id)
      const { remoteEtag: _, ...project } = p
      data.push({
        version: 1,
        project,
        checkins: cs.map(c => ({ d: c.date, s: c.status, v: c.value, n: c.note, u: c.updatedAt })),
      })
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `daily-habit-${format(new Date(), 'yyyyMMdd-HHmm')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportMhabitFile(file: File) {
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const habits = parsed?.habits
      if (!Array.isArray(habits)) { alert(t('settings.invalidFormat')); return }
      await importMhabit(habits)
    } catch (e) {
      alert(t('settings.importFailed', { msg: e instanceof Error ? e.message : String(e) }))
    }
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text()
      const data = JSON.parse(text) as ProjectFile[]
      if (!Array.isArray(data)) {
        alert(t('settings.invalidFormat'))
        return
      }
      const repo = await getRepo()
      const total = data.filter(item => item.project?.id).length
      setImporting({ current: 0, total })
      let processed = 0
      for (const item of data) {
        if (!item.project?.id) continue
        await repo.upsertProject({ ...item.project, remoteEtag: null, remotePath: makeRemotePath(item.project.id) })
        const checkins: Checkin[] = []
        for (const c of item.checkins) {
          checkins.push({ projectId: item.project.id, date: c.d, status: c.s, value: c.v, note: c.n, updatedAt: c.u })
        }
        if (checkins.length > 0) await repo.bulkUpsertCheckins(checkins)
        processed++
        setImporting({ current: processed, total })
      }
      const projects = await repo.listProjects()
      useAppStore.setState({ projects })
      for (const p of projects) void syncOneProject(p.id).catch(() => {})
      await useAppStore.getState().triggerSync()
      setImporting(null)
      if (useAppStore.getState().sync.status === 'error') {
        alert(t('settings.syncFailed', { msg: useAppStore.getState().sync.error ?? '' }))
      } else {
        alert(t('settings.importSuccess'))
      }
    } catch (e) {
      setImporting(null)
      alert(t('settings.importFailed', { msg: e instanceof Error ? e.message : String(e) }))
    }
  }

  async function handleClear() {
    if (!confirm(t('settings.clearConfirm'))) return
    const repo = await getRepo()
    await repo.clearDatabase()
    useAppStore.setState({ projects: [], conflicts: {} })
  }

  async function handleCleanDeleted() {
    if (!confirm(t('settings.cleanDeletedConfirm'))) return
    setCleaning(true)
    try {
      const result = await cleanupDeletedProjects()
      if (result === null) {
        alert(t('settings.noSyncConfig'))
      } else {
        alert(t('settings.cleanDeletedDone', { count: result.cleaned }))
      }
    } catch (e) {
      alert(t('settings.cleanDeletedFailed', { msg: e instanceof Error ? e.message : String(e) }))
    } finally {
      setCleaning(false)
    }
  }

  function epochDayToDateStr(epochDay: number): string {
    const d = new Date(epochDay * 86400000)
    const y = d.getUTCFullYear()
    const m = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }

  async function importMhabit(habits: unknown[]) {
    const repo = await getRepo()
    const now = Date.now()
    const total = habits.filter(h => { const habit = h as Record<string, unknown>; return String(habit.name ?? '') !== '' }).length
    setImporting({ current: 0, total })
    let processed = 0
    for (const h of habits) {
      const habit = h as Record<string, unknown>
      const name = String(habit.name ?? '')
      if (!name) continue
      const id = makeProjectId()
      const colorIdx = Math.min(Math.max(((habit.color as number) ?? 1) - 1, 0), PROJECT_COLORS.length - 1)
//  忽略非进行中项目      
      if (((habit.status as number) ?? 1) !== 1) continue
      await repo.upsertProject({
        id,
        name,
        description: habit.desc as string,
        unit: (habit.daily_goal_unit as string) || null,
        emoji: '📌',
        color: PROJECT_COLORS[colorIdx],
        sort: 0,
        archived: 0,
        createdAt: ((habit.create_t as number) ?? Math.floor(now / 1000)) * 1000,
        updatedAt: ((habit.modify_t as number) ?? Math.floor(now / 1000)) * 1000,
        remoteEtag: null,
        remotePath: makeRemotePath(id, DEFAULT_REMOTE_DIR),
        deleted: ((habit.status as number) ?? 1) === 1 ? 0 : 1,
      })
      const records = (habit.records as unknown[]) ?? []
      if (records.length > 0) {
        const checkins: Checkin[] = []
        for (const r of records) {
          const rec = r as Record<string, unknown>
          const recordDate = (rec.record_date as number) ?? 0
          const reason = (rec.reason as string) ?? ''
          const note = (rec.note as string) ?? ''
          const combinedNote = reason && note ? `${reason} | ${note}` : (reason || note || null)
          checkins.push({
            projectId: id,
            date: epochDayToDateStr(recordDate),
            status: ((rec.record_value as number) ?? 1) === 1 ? 'success' : 'fail',
            value: (rec.record_value as number | null) ?? null,
            note: combinedNote,
            updatedAt: ((rec.modify_t as number) ?? Math.floor(now / 1000)) * 1000,
          })
        }
        await repo.bulkUpsertCheckins(checkins)
      }
      processed++
      setImporting({ current: processed, total })
    }
    const projects = await repo.listProjects()
    useAppStore.setState({ projects })
    for (const p of projects) void syncOneProject(p.id).catch(() => {})
    await useAppStore.getState().triggerSync()
    setImporting(null)
    if (useAppStore.getState().sync.status === 'error') {
      alert(t('settings.syncFailed', { msg: useAppStore.getState().sync.error ?? '' }))
    } else {
      alert(t('settings.importSuccess'))
    }
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <div className="text-sm font-semibold">{t('settings.webdavSync')}</div>
        <input className="input" placeholder={t('settings.serverUrl')} value={cfg.url} onChange={(e) => setCfg((c) => ({ ...c, url: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder={t('settings.username')} value={cfg.username} onChange={(e) => setCfg((c) => ({ ...c, username: e.target.value }))} />
          <input className="input" type="password" placeholder={t('settings.password')} value={cfg.password} onChange={(e) => setCfg((c) => ({ ...c, password: e.target.value }))} />
        </div>
        <input className="input" placeholder={t('settings.remoteDir')} value={cfg.remoteDir} onChange={(e) => setCfg((c) => ({ ...c, remoteDir: e.target.value }))} />
        <div className="text-[11px] text-slate-500">{t('settings.credentialHint')}</div>
        <div className="flex items-center gap-2">
          <button className="btn-outline" onClick={handleTest} disabled={testing || !cfg.url}>
            {testing ? t('settings.testing') : t('settings.testConnection')}
          </button>
          <button className="btn-primary" onClick={saveCfg} disabled={!cfg.url}>{t('settings.save')}</button>
          <div className="flex-1" />
          <button className="btn-ghost" onClick={() => void triggerSync()}>{t('settings.syncNow')}</button>
        </div>
        {testResult && (
          <div className={`text-xs ${testResult.ok ? 'text-brand-500' : 'text-rose-500'}`}>{testResult.message}</div>
        )}
        {savedAt && <div className="text-[11px] text-slate-500">{t('settings.savedAt', { time: format(new Date(savedAt), 'HH:mm:ss') })}</div>}
        <div className="text-xs text-slate-500 pt-1 border-t border-slate-800">
          {t('settings.status')}{sync.status} {sync.at && `· ${format(new Date(sync.at), 'MM-dd HH:mm')}`}
          {sync.error && <div className="text-rose-500 mt-1">{sync.error}</div>}
        </div>
        <div className="pt-1">
          <button className="btn-outline text-xs" onClick={handleCleanDeleted} disabled={cleaning}>
            {cleaning ? '…' : <Trash2 size={14} />} {t('settings.cleanDeleted')}
          </button>
        </div>
      </div>

      <div className="card space-y-2">
        <div className="text-sm font-semibold">{t('settings.appearance')}</div>
        <div className="grid grid-cols-3 gap-1.5">
          <ThemeBtn active={theme === 'auto'} onClick={() => setThemeMode('auto')} icon={<Monitor size={14} />} label={t('settings.auto')} />
          <ThemeBtn active={theme === 'light'} onClick={() => setThemeMode('light')} icon={<Sun size={14} />} label={t('settings.light')} />
          <ThemeBtn active={theme === 'dark'} onClick={() => setThemeMode('dark')} icon={<Moon size={14} />} label={t('settings.dark')} />
        </div>
        <div className="text-[11px] text-slate-500">{t('settings.autoHint')}</div>
      </div>

      <div className="card space-y-2">
        <div className="text-sm font-semibold">{t('settings.data')}</div>
        <div className="flex items-center gap-2">
          <button className="btn-outline" onClick={handleExport}><Download size={14} /> {t('settings.exportJson')}</button>
          <label className="btn-outline cursor-pointer">
            <Upload size={14} /> {t('settings.importJson')}
            <input type="file" accept="application/json" hidden onChange={e => e.target.files?.[0] && handleImport(e.target.files[0])} />
          </label>
          <label className="btn-outline cursor-pointer">
            <Upload size={14} /> {t('settings.importMhabit')}
            <input type="file" accept="application/json" hidden onChange={e => e.target.files?.[0] && handleImportMhabitFile(e.target.files[0])} />
          </label>
          <div className="flex-1" />
          <button className="btn-outline text-rose-500" onClick={handleClear}>
            <Trash2 size={14} /> {t('settings.clear')}
          </button>
        </div>
      </div>

      {importing && (
        <div className="card space-y-2">
          <div className="text-sm font-semibold">{t('settings.importing', importing)}</div>
          <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 transition-all duration-300 rounded-full" style={{ width: `${(importing.current / importing.total) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="text-center text-[11px] text-slate-500 pt-2">Daily Habit · v0.0.1</div>
    </div>
  )
}

function ThemeBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={active ? 'btn-primary text-xs' : 'btn-outline text-xs'}
    >
      {icon} {label}
    </button>
  )
}
