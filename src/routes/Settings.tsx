import { useEffect, useState } from 'react'
import { useAppStore } from '@/state/useAppStore'
import { getSyncConfig, setSyncConfig, testConnection, syncOneProject, makeRemotePath } from '@/sync/fullSync'
import type { WebDavConfig } from '@/sync/webdav'
import type { ProjectFile } from '@/sync/merge'
import { DEFAULT_REMOTE_DIR } from '@/db/schema'
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
  const sync = useAppStore(s => s.sync)
  const triggerSync = useAppStore(s => s.triggerSync)

  const [cfg, setCfg] = useState<WebDavConfig>({ url: '', username: '', password: '', remoteDir: DEFAULT_REMOTE_DIR })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [theme, setTheme] = useState<ThemeMode>('auto')

  useEffect(() => {
    void (async () => {
      const c = await getSyncConfig(await getRepo())
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
    await setSyncConfig(await getRepo(), cfg)
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

  async function handleImport(file: File) {
    try {
      const text = await file.text()
      const data = JSON.parse(text) as ProjectFile[]
      if (!Array.isArray(data)) {
        alert('文件格式不正确')
        return
      }
      const repo = await getRepo()
      for (const item of data) {
        if (!item.project?.id) continue
        await repo.upsertProject({ ...item.project, remoteEtag: null, remotePath: makeRemotePath(item.project.id) })
        for (const c of item.checkins) {
          await repo.upsertCheckin({ projectId: item.project.id, date: c.d, status: c.s, value: c.v, note: c.n, updatedAt: c.u })
        }
      }
      const projects = await repo.listProjects()
      useAppStore.setState({ projects })
      for (const p of projects) void syncOneProject(p.id).catch(() => {})
    } catch (e) {
      alert('导入失败：' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function handleClear() {
    if (!confirm('确定清空所有本地数据？此操作不可撤销。')) return
    const repo = await getRepo()
    for (const p of await repo.listProjects(true)) {
      const cs = await repo.getCheckins(p.id)
      for (const c of cs) await repo.deleteCheckin(p.id, c.date)
      await repo.softDeleteProject(p.id, Date.now())
    }
    useAppStore.setState({ projects: [] })
  }

  return (
    <div className="space-y-3">
      <div className="card space-y-2">
        <div className="text-sm font-semibold">WebDAV 同步</div>
        <input className="input" placeholder="服务器地址 (https://...)" value={cfg.url} onChange={(e) => setCfg((c) => ({ ...c, url: e.target.value }))} />
        <div className="grid grid-cols-2 gap-2">
          <input className="input" placeholder="用户名" value={cfg.username} onChange={(e) => setCfg((c) => ({ ...c, username: e.target.value }))} />
          <input className="input" type="password" placeholder="密码" value={cfg.password} onChange={(e) => setCfg((c) => ({ ...c, password: e.target.value }))} />
        </div>
        <input className="input" placeholder="远端目录" value={cfg.remoteDir} onChange={(e) => setCfg((c) => ({ ...c, remoteDir: e.target.value }))} />
        <div className="text-[11px] text-slate-500">凭据仅保存在本机（IndexedDB / SQLite）</div>
        <div className="flex items-center gap-2">
          <button className="btn-outline" onClick={handleTest} disabled={testing || !cfg.url}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button className="btn-primary" onClick={saveCfg} disabled={!cfg.url}>保存</button>
          <div className="flex-1" />
          <button className="btn-ghost" onClick={() => void triggerSync()}>立即同步</button>
        </div>
        {testResult && (
          <div className={`text-xs ${testResult.ok ? 'text-brand-500' : 'text-rose-500'}`}>{testResult.message}</div>
        )}
        {savedAt && <div className="text-[11px] text-slate-500">已保存于 {format(new Date(savedAt), 'HH:mm:ss')}</div>}
        <div className="text-xs text-slate-500 pt-1 border-t border-slate-800">
          状态：{sync.status} {sync.at && `· ${format(new Date(sync.at), 'MM-dd HH:mm')}`}
          {sync.error && <div className="text-rose-500 mt-1">{sync.error}</div>}
        </div>
      </div>

      <div className="card space-y-2">
        <div className="text-sm font-semibold">外观</div>
        <div className="grid grid-cols-3 gap-1.5">
          <ThemeBtn active={theme === 'auto'} onClick={() => setThemeMode('auto')} icon={<Monitor size={14} />} label="自动" />
          <ThemeBtn active={theme === 'light'} onClick={() => setThemeMode('light')} icon={<Sun size={14} />} label="浅色" />
          <ThemeBtn active={theme === 'dark'} onClick={() => setThemeMode('dark')} icon={<Moon size={14} />} label="深色" />
        </div>
        <div className="text-[11px] text-slate-500">"自动" 跟随系统设置；可手动锁定。</div>
      </div>

      <div className="card space-y-2">
        <div className="text-sm font-semibold">数据</div>
        <div className="flex items-center gap-2">
          <button className="btn-outline" onClick={handleExport}><Download size={14} /> 导出 JSON</button>
          <label className="btn-outline cursor-pointer">
            <Upload size={14} /> 导入 JSON
            <input type="file" accept="application/json" hidden onChange={e => e.target.files?.[0] && handleImport(e.target.files[0])} />
          </label>
          <div className="flex-1" />
          <button className="btn-outline text-rose-500" onClick={handleClear}>
            <Trash2 size={14} /> 清空
          </button>
        </div>
      </div>

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
