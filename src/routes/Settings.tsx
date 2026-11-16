import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '@/state/useAppStore'
import { loadConfig, saveConfig, testConnection, type WebDavConfig } from '@/sync/engine'
import { epochDayToDateStr, DEFAULT_REMOTE_DIR, makeProjectId, PROJECT_COLORS } from '@/db/schema'
import { useHabitActions } from '@/hooks/useHabit'
import { useKysely, useSync } from 'sqlite-remote-sync/react'
import { Download, Upload, Trash2, Sun, Moon, Monitor } from 'lucide-react'
import { format } from 'date-fns'
import { clearAll } from '@/db'

type ThemeMode = 'auto' | 'light' | 'dark'

function epochDayToDateStrSafe(epochDay: number): string {
  try { return epochDayToDateStr(epochDay) } catch { return '' }
}

export function Settings() {
  const { t } = useTranslation()
  const sync = useSync()
  const { addProject, setCheckin } = useHabitActions()
  const db = useKysely()
  const configured = useAppStore(s => s.configured)
  const reconfigureEngine = useAppStore(s => s.reconfigureEngine)

  const [cfg, setCfg] = useState<WebDavConfig>({ url: '', username: '', password: '', remoteDir: DEFAULT_REMOTE_DIR })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [theme, setTheme] = useState<ThemeMode>('auto')
  const [importing, setImporting] = useState<{ current: number; total: number } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const c = loadConfig()
    if (c) setCfg(c)
    try {
      const stored = localStorage.getItem('theme') as ThemeMode | null
      if (stored === 'light' || stored === 'dark' || stored === 'auto') setTheme(stored)
    } catch { /* noop */ }
  }, [])

  function applyTheme(mode: ThemeMode) {
    const dark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('theme', mode) } catch { /* noop */ }
  }

  function setThemeMode(m: ThemeMode) {
    setTheme(m)
    applyTheme(m)
  }

  async function saveCfg() {
    if (busy) return
    setBusy(true)
    try {
      saveConfig(cfg)
      setSavedAt(Date.now())
      await reconfigureEngine()
    } finally {
      setBusy(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    const r = await testConnection(cfg)
    setTestResult(r)
    setTesting(false)
  }

  async function handleExport() {
    const rows = await db.selectFrom('projects').selectAll().execute()
    const out = []
    for (const p of rows) {
      const cs = await db.selectFrom('checkins').selectAll().where('project_id', '=', p.id).orderBy('date', 'asc').execute()
      out.push({
        version: 1,
        project: {
          id: p.id,
          name: p.name,
          description: p.description,
          unit: p.unit,
          emoji: p.emoji,
          color: p.color,
          sort: p.sort,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
          deleted: p.deleted,
          archived: p.archived,
        },
        checkins: cs.map(c => ({ date: c.date, status: c.status, value: c.value, note: c.note, updatedAt: c.updated_at })),
      })
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' })
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

  async function importMhabit(habits: unknown[]) {
    const now = Date.now()
    const total = habits.filter(h => new Set(Object.keys((h as Record<string, unknown>))).has('name')).length
    setImporting({ current: 0, total })
    let processed = 0
    for (const h of habits) {
      const habit = h as Record<string, unknown>
      const name = String(habit.name ?? '')
      if (!name) continue
      if (((habit.status as number) ?? 1) !== 1) continue
      const id = makeProjectId()
      const colorIdx = Math.min(Math.max(((habit.color as number) ?? 1) - 1, 0), PROJECT_COLORS.length - 1)
      await addProject({
        name,
        description: (habit.desc as string) ?? '',
        unit: (habit.daily_goal_unit as string) || null,
        emoji: '📌',
        color: PROJECT_COLORS[colorIdx],
      })
      const records = (habit.records as unknown[]) ?? []
      if (records.length > 0) {
        for (const r of records) {
          const rec = r as Record<string, unknown>
          const reason = (rec.reason as string) ?? ''
          const note = (rec.note as string) ?? ''
          const combinedNote = reason && note ? `${reason} | ${note}` : (reason || note || null)
          const date = epochDayToDateStrSafe((rec.record_date as number) ?? 0)
          if (!date) continue
          const val = (rec.record_value as number | null) ?? null
          await setCheckin(id, date, val === 1 ? 'success' : val === 0 ? 'fail' : null, val === 1 ? 1 : null, combinedNote)
        }
      }
      processed++
      setImporting({ current: processed, total })
    }
    setImporting(null)
    alert(t('settings.importSuccess'))
  }

  async function handleImport(file: File) {
    try {
      const text = await file.text()
      const raw = JSON.parse(text)
      if (!Array.isArray(raw)) {
        alert(t('settings.invalidFormat'))
        return
      }
      const items = raw.filter((item: any) => item.project?.id)
      setImporting({ current: 0, total: items.length })
      let processed = 0
      for (const item of items as Array<{ project: any; checkins?: any[] }>) {
        const now = Date.now()
        const pid = String(item.project.id)
        await db.insertInto('projects').values({
          id: pid,
          name: String(item.project.name ?? ''),
          description: String(item.project.description ?? ''),
          unit: item.project.unit ?? null,
          emoji: item.project.emoji ?? '📌',
          color: item.project.color ?? PROJECT_COLORS[0],
          sort: Number(item.project.sort ?? 0),
          created_at: Number(item.project.createdAt ?? now),
          updated_at: now,
          deleted: Number(item.project.deleted ?? 0) ? 1 : 0,
          archived: Number(item.project.archived ?? 0) ? 1 : 0,
        })
          .onConflict((oc) => oc.column('id').doUpdateSet({
            name: String(item.project.name ?? ''),
            description: String(item.project.description ?? ''),
            unit: item.project.unit ?? null,
            emoji: item.project.emoji ?? '📌',
            color: item.project.color ?? PROJECT_COLORS[0],
            sort: Number(item.project.sort ?? 0),
            updated_at: now,
            deleted: Number(item.project.deleted ?? 0) ? 1 : 0,
            archived: Number(item.project.archived ?? 0) ? 1 : 0,
          }))
          .execute()
        for (const c of item.checkins ?? []) {
          if ('date' in c) {
            await db.insertInto('checkins').values({
              project_id: pid,
              date: String(c.date),
              status: String(c.status ?? 'success'),
              value: c.value ?? null,
              note: c.note ?? null,
              updated_at: now,
            }).onConflict((oc) => oc.columns(['project_id', 'date']).doUpdateSet({
              status: String(c.status ?? 'success'),
              value: c.value ?? null,
              note: c.note ?? null,
              updated_at: now,
            })).execute()
          } else if (typeof c.d === 'number') {
            const date = epochDayToDateStrSafe(c.d)
            if (!date) continue
            await db.insertInto('checkins').values({
              project_id: pid,
              date,
              status: c.s === 1 ? 'success' : 'fail',
              value: c.v ?? null,
              note: c.n ?? null,
              updated_at: now,
            }).onConflict((oc) => oc.columns(['project_id', 'date']).doUpdateSet({
              status: c.s === 1 ? 'success' : 'fail',
              value: c.v ?? null,
              note: c.n ?? null,
              updated_at: now,
            })).execute()
          }
        }
        processed++
        setImporting({ current: processed, total: items.length })
      }
      setImporting(null)
      alert(t('settings.importSuccess'))
    } catch (e) {
      setImporting(null)
      alert(t('settings.importFailed', { msg: e instanceof Error ? e.message : String(e) }))
    }
  }

  async function handleClear() {
    if (!confirm(t('settings.clearConfirm'))) return
    await clearAll()
    useAppStore.setState({ conflicts: [] })
    location.reload()
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-3">
        <div className="text-sm font-semibold text-slate-100">{t('settings.webdavSync')}</div>
        <input className="input" placeholder={t('settings.serverUrl')} value={cfg.url} onChange={(e) => setCfg((c) => ({ ...c, url: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder={t('settings.username')} value={cfg.username} onChange={(e) => setCfg((c) => ({ ...c, username: e.target.value }))} />
          <input className="input" type="password" placeholder={t('settings.password')} value={cfg.password} onChange={(e) => setCfg((c) => ({ ...c, password: e.target.value }))} />
        </div>
        <input className="input" placeholder={t('settings.remoteDir')} value={cfg.remoteDir} onChange={(e) => setCfg((c) => ({ ...c, remoteDir: e.target.value }))} />
        <div className="text-xs text-slate-400">{t('settings.credentialHint')}</div>
        <div className="flex items-center gap-2">
          <button className="btn-outline" onClick={handleTest} disabled={testing || !cfg.url}>
            {testing ? t('settings.testing') : t('settings.testConnection')}
          </button>
          <button className="btn-primary" onClick={saveCfg} disabled={busy || !cfg.url}>{t('settings.save')}</button>
          <div className="flex-1" />
          <button className="btn-ghost" onClick={() => void sync.sync()}>{t('settings.syncNow')}</button>
        </div>
        {testResult && (
          <div className={`text-xs font-medium ${testResult.ok ? 'text-brand-400' : 'text-rose-400'}`}>{testResult.message}</div>
        )}
        {savedAt && <div className="text-xs text-slate-400">{t('settings.savedAt', { time: format(new Date(savedAt), 'HH:mm:ss') })}</div>}
        <div className="text-xs text-slate-400 pt-2 border-t border-slate-700/50">
          {t('settings.status')}{configured ? t('sync.syncedShort') : t('sync.idle')}{sync.error ? ` · ${String(sync.error)}` : ''}
        </div>
      </div>

      <div className="card space-y-3">
        <div className="text-sm font-semibold text-slate-100">{t('settings.appearance')}</div>
        <div className="grid grid-cols-3 gap-2">
          <ThemeBtn active={theme === 'auto'} onClick={() => setThemeMode('auto')} icon={<Monitor size={14} />} label={t('settings.auto')} />
          <ThemeBtn active={theme === 'light'} onClick={() => setThemeMode('light')} icon={<Sun size={14} />} label={t('settings.light')} />
          <ThemeBtn active={theme === 'dark'} onClick={() => setThemeMode('dark')} icon={<Moon size={14} />} label={t('settings.dark')} />
        </div>
        <div className="text-xs text-slate-400">{t('settings.autoHint')}</div>
      </div>

      <div className="card space-y-3">
        <div className="text-sm font-semibold text-slate-100">{t('settings.data')}</div>
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
        <div className="card space-y-3">
          <div className="text-sm font-semibold text-slate-100">{t('settings.importing', importing)}</div>
          <div className="h-2.5 bg-slate-700/50 rounded-full overflow-hidden">
            <div className="h-full bg-brand-500 transition-all duration-300 rounded-full shadow-sm shadow-brand-500/30" style={{ width: `${(importing.current / importing.total) * 100}%` }} />
          </div>
        </div>
      )}

      <div className="text-center text-xs text-slate-400 pt-3 pb-2">
        <a href="https://github.com/zaaack/daily-habit" target="_blank" rel="noreferrer" className="hover:text-slate-200">Daily Habit</a> · v0.0.1
      </div>
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