import { useEffect, useState } from 'react'
import { useAppStore } from '@/state/useAppStore'
import { getSyncConfig, setSyncConfig, testConnection, syncOneProject } from '@/sync/fullSync'
import type { WebDavConfig } from '@/sync/webdav'
import { DEFAULT_REMOTE_DIR } from '@/db/schema'
import { getRepo } from '@/db'
import { Download, Upload, Trash2 } from 'lucide-react'
import { format } from 'date-fns'

export function Settings() {
  const recentDays = useAppStore(s => s.recentDays)
  const setRecentDays = useAppStore(s => s.setRecentDays)
  const sync = useAppStore(s => s.sync)
  const triggerSync = useAppStore(s => s.triggerSync)

  const [cfg, setCfg] = useState<WebDavConfig>({ url: '', username: '', password: '', remoteDir: DEFAULT_REMOTE_DIR })
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  useEffect(() => {
    void (async () => {
      const c = await getSyncConfig(await getRepo())
      if (c) setCfg(c)
    })()
  }, [])

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
    const allCheckins: unknown[] = []
    for (const p of projects) {
      const cs = await repo.getCheckins(p.id)
      for (const c of cs) allCheckins.push(c)
    }
    const data = { projects, checkins: allCheckins, exportedAt: Date.now() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `daily-habit-${format(new Date(), 'yyyyMMdd-HHmm')}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImport(file: File) {
    const text = await file.text()
    const data = JSON.parse(text) as { projects: any[]; checkins: any[] }
    const repo = await getRepo()
    for (const p of data.projects) await repo.upsertProject(p)
    for (const c of data.checkins) await repo.upsertCheckin(c)
    const projects = await repo.listProjects()
    useAppStore.setState({ projects })
    for (const p of projects) void syncOneProject(p.id).catch(() => {})
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
          <div className={`text-xs ${testResult.ok ? 'text-brand-400' : 'text-rose-400'}`}>{testResult.message}</div>
        )}
        {savedAt && <div className="text-[11px] text-slate-500">已保存于 {format(new Date(savedAt), 'HH:mm:ss')}</div>}
        <div className="text-xs text-slate-400 pt-1 border-t border-slate-800">
          状态：{sync.status} {sync.at && `· ${format(new Date(sync.at), 'MM-dd HH:mm')}`}
          {sync.error && <div className="text-rose-400 mt-1">{sync.error}</div>}
        </div>
      </div>

      <div className="card space-y-2">
        <div className="text-sm font-semibold">显示</div>
        <div className="flex items-center gap-2">
          <div className="text-xs text-slate-400 w-20">最近天数</div>
          <input
            type="range" min={3} max={7} step={1}
            value={recentDays}
            onChange={e => setRecentDays(Number(e.target.value))}
            className="flex-1 accent-brand-500"
          />
          <div className="text-sm font-semibold w-6 text-right">{recentDays}</div>
        </div>
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
          <button className="btn-outline text-rose-400 border-rose-900/40" onClick={handleClear}>
            <Trash2 size={14} /> 清空
          </button>
        </div>
      </div>

      <div className="text-center text-[11px] text-slate-600 pt-2">Daily Habit · v0.0.1</div>
    </div>
  )
}
