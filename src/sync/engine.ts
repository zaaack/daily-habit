import { createSyncEngine, MemoryBackend, WebDavBackend } from 'sqlite-remote-sync'
import type { SyncEngine, RemoteBackend, SyncEvent } from 'sqlite-remote-sync'
import type { SqliteAdapter } from 'sqlite-remote-sync'
import type { ConflictNotice } from '@/db'
import { isWails } from '@/lib/platform'

const CONFIG_KEY = 'webdav.config'
const SITE_ID_KEY = 'daily-habit.siteId'
export const APP_ID = 'daily-habit'

export interface WebDavConfig {
  url: string
  username: string
  password: string
  remoteDir: string
}

export function normalizeDir(dir: string): string {
  if (!dir) return '/daily-habit'
  return dir.startsWith('/') ? dir : `/${dir}`
}

export function loadConfig(): WebDavConfig | null {
  try {
    const v = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null') as WebDavConfig | null
    if (!v || !v.url) return null
    return { ...v, remoteDir: normalizeDir(v.remoteDir || '/daily-habit') }
  } catch {
    return null
  }
}

export function saveConfig(cfg: WebDavConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...cfg, remoteDir: normalizeDir(cfg.remoteDir) }))
  } catch { /* noop */ }
}

/** Stable per-device id. Never re-generated once stored. */
export function getSiteId(): string {
  let id = localStorage.getItem(SITE_ID_KEY)
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `site-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    localStorage.setItem(SITE_ID_KEY, id)
  }
  return id
}

let _engine: SyncEngine | null = null
let _configured = false
let _conflictCb: ((n: ConflictNotice) => void) | null = null
let _seq = 0

/** Resolve the WebDAV base URL (routes through the Wails proxy on desktop). */
async function resolveBaseUrl(cfg: WebDavConfig): Promise<string> {
  if (isWails) {
    const go = (window as any).go
    if (go?.main?.App) {
      await go.main.App.SetWebdavProxyTarget(cfg.url)
      const port = await go.main.App.GetProxyPort()
      if (port > 0) {
        return `http://127.0.0.1:${port}${normalizeDir(cfg.remoteDir)}`
      }
    }
  }
  return `${cfg.url.endsWith('/') ? cfg.url.slice(0, -1) : cfg.url}${normalizeDir(cfg.remoteDir)}`
}

async function makeBackend(cfg: WebDavConfig | null): Promise<RemoteBackend> {
  if (!cfg) return new MemoryBackend()
  const base = await resolveBaseUrl(cfg)
  return new WebDavBackend({ url: base, username: cfg.username, password: cfg.password })
}

export async function testConnection(cfg: WebDavConfig): Promise<{ ok: boolean; message: string }> {
  try {
    const backend = new WebDavBackend({ url: cfg.url })
    await backend.list('')
    return { ok: true, message: '连接成功' }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * (Re)create the sync engine. Outbox/cursors live inside the SQLite file, so a
 * fresh engine picks up pending local changes on the next sync.
 */
export async function configureEngine(adapter: SqliteAdapter): Promise<SyncEngine> {
  if (_engine) {
    try { await _engine.close() } catch { /* ignore */ }
    _engine = null
  }

  const cfg = loadConfig()
  _configured = !!cfg
  const engine = createSyncEngine({
    db: adapter,
    backend: await makeBackend(cfg),
    appId: APP_ID,
    siteId: getSiteId(),
    tables: [
      { name: 'projects', primaryKey: ['id'] },
      { name: 'checkins', primaryKey: ['project_id', 'date'] },
    ],
    strategy: 'field',
    compress: true,
    retry: { attempts: 3, baseDelayMs: 200, maxDelayMs: 3000 },
  })

  engine.on((ev) => {
    if (ev.type === 'conflict' && _conflictCb) {
      _conflictCb({ seq: ++_seq, tbl: ev.tbl, pk: ev.pk, at: Date.now() })
    }
  })

  await engine.init()

  // Auto-sync every 5 minutes (same cadence as the old app's interval).
  if (_configured) engine.startAutoSync(5 * 60 * 1000)
  else engine.stopAutoSync()

  _engine = engine
  return engine
}

export function getEngine(): SyncEngine | null {
  return _engine
}

export function isConfigured(): boolean {
  return _configured
}

/** Subscribe to auto-resolved conflict notices. Returns an unsubscribe fn. */
export function onConflict(cb: (n: ConflictNotice) => void): () => void {
  _conflictCb = cb
  return () => { if (_conflictCb === cb) _conflictCb = null }
}

/** Run a write under the engine lock (serializes with push/pull). */
export function withWrite<T>(fn: () => Promise<T> | T): Promise<T> {
  return _engine ? _engine.write(fn) : Promise.resolve(fn())
}